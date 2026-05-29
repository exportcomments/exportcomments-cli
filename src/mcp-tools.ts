// ── MCP tool definitions — shared by stdio and HTTP entry points ──
//
// The stdio entry point reads the API token once from process.env at boot;
// the HTTP entry point pulls a fresh token from the incoming Authorization
// header on every request. Both call `registerExportTools(server, getToken)`
// where `getToken()` is invoked LAZILY inside each tool handler, so the
// HTTP variant can return a per-request value without rewriting handlers.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ExportCommentsClient } from './client.js';
import { PLATFORMS, detectPlatform } from './platforms.js';
import { waitForJobRealtime } from './realtime.js';

export type TokenProvider = () => string;

function clientFor(getToken: TokenProvider): ExportCommentsClient {
  const token = getToken();
  if (!token) {
    throw new Error(
      'Missing API token. Stdio mode requires EXPORTCOMMENTS_API_TOKEN; HTTP mode requires Authorization: Bearer <token>. ' +
      'Get a token at https://app.exportcomments.com/user/api or via the OAuth flow at https://exportcomments.com/oauth/authorize.'
    );
  }
  return new ExportCommentsClient(token);
}

export function registerExportTools(server: McpServer, getToken: TokenProvider): void {
  // ── Tool: export_comments ──
  server.tool(
    'export_comments',
    `Create a new export job to extract comments or reviews from a URL.
Supports 33+ platforms: Instagram, YouTube, TikTok, Facebook, Twitter/X, Reddit,
LinkedIn, Trustpilot, Amazon, Yelp, Google Reviews, and more.
Returns a job GUID for tracking. Use check_export to monitor progress.
Set wait=true to poll until completion (up to 10 minutes).`,
    {
      url: z.string().describe('The URL to export comments/reviews from'),
      replies: z.boolean().optional().describe('Include replies to comments'),
      limit: z.number().optional().describe('Maximum number of items to export'),
      min_date: z.string().optional().describe('Minimum date filter (ISO 8601, e.g. 2024-01-15)'),
      max_date: z.string().optional().describe('Maximum date filter (ISO 8601, e.g. 2024-06-30)'),
      vpn: z.string().optional().describe('Use VPN with specified country (e.g. "Norway")'),
      cookies: z.record(z.string(), z.string()).optional().describe('Cookies for authenticated access'),
      tweets: z.boolean().optional().describe('Include tweets (Twitter/X only)'),
      followers: z.boolean().optional().describe('Export followers list (Twitter/X only)'),
      following: z.boolean().optional().describe('Export following list (Twitter/X only)'),
      likes: z.boolean().optional().describe('Export likes data'),
      shares: z.boolean().optional().describe('Include shares data'),
      advanced: z.boolean().optional().describe('Enable advanced export features'),
      facebook_ads: z.boolean().optional().describe('Include Facebook ads data'),
      wait: z.boolean().optional().describe('Wait for completion before returning (polls every 5s, timeout 10min)'),
      realtime: z.boolean().optional().describe('Use WebSocket for real-time updates (implies wait=true)'),
    },
    async (params) => {
      const client = clientFor(getToken);
      const options: Record<string, unknown> = {};
      if (params.replies) options.replies = true;
      if (params.limit) options.limit = params.limit;
      if (params.min_date) options.minTimestamp = Math.floor(Date.parse(params.min_date) / 1000);
      if (params.max_date) options.maxTimestamp = Math.floor(Date.parse(params.max_date) / 1000);
      if (params.vpn) options.vpn = params.vpn;
      if (params.cookies) options.cookies = params.cookies;
      if (params.tweets) options.tweets = true;
      if (params.followers) options.followers = true;
      if (params.following) options.following = true;
      if (params.likes) options.likes = true;
      if (params.shares) options.shares = true;
      if (params.advanced) options.advanced = true;
      if (params.facebook_ads) options.facebookAds = true;

      const result = await client.createJob({
        url: params.url,
        options: Object.keys(options).length > 0 ? options : undefined,
      });

      if (!result.ok) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: true };
      }

      const shouldWait = params.wait || params.realtime;
      if (shouldWait && result.data) {
        let waitResult;
        const token = getToken();
        if (params.realtime && token) {
          waitResult = await waitForJobRealtime(token, result.data.guid);
          if (!waitResult.ok && (waitResult.error_code === 'WS_CONNECTION_TIMEOUT' || waitResult.error_code === 'WS_AUTH_FAILED' || waitResult.error_code === 'WS_ERROR')) {
            waitResult = await client.waitForJob(result.data.guid);
          }
        } else {
          waitResult = await client.waitForJob(result.data.guid);
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(waitResult, null, 2) }],
          isError: !waitResult.ok,
        };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Tool: check_export ──
  server.tool(
    'check_export',
    `Check the status of an export job by its GUID.
Returns full job details including status, progress, download URLs, and error info.
Job statuses: queueing → progress → done | error.
Set wait=true to poll until the job reaches a terminal state.`,
    {
      guid: z.string().describe('The job GUID returned by export_comments'),
      wait: z.boolean().optional().describe('Wait for export to complete before returning'),
      realtime: z.boolean().optional().describe('Use WebSocket for real-time updates (implies wait=true)'),
    },
    async (params) => {
      const client = clientFor(getToken);
      const shouldWait = params.wait || params.realtime;
      if (shouldWait) {
        let result;
        const token = getToken();
        if (params.realtime && token) {
          result = await waitForJobRealtime(token, params.guid);
          if (!result.ok && (result.error_code === 'WS_CONNECTION_TIMEOUT' || result.error_code === 'WS_AUTH_FAILED' || result.error_code === 'WS_ERROR')) {
            result = await client.waitForJob(params.guid);
          }
        } else {
          result = await client.waitForJob(params.guid);
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          isError: !result.ok,
        };
      }
      const result = await client.getJob(params.guid);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        isError: !result.ok,
      };
    }
  );

  // ── Tool: list_exports ──
  server.tool(
    'list_exports',
    'List all export jobs for the authenticated account with pagination.',
    {
      page: z.number().optional().default(1).describe('Page number (default: 1)'),
      limit: z.number().optional().default(20).describe('Items per page (default: 20)'),
    },
    async (params) => {
      const client = clientFor(getToken);
      const result = await client.listJobs(params.page, params.limit);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        isError: !result.ok,
      };
    }
  );

  // ── Tool: download_export ──
  server.tool(
    'download_export',
    `Download a completed export's data for analysis (status must be "done").
Returns JSON for Premium/Business accounts and CSV for Free/Personal accounts —
CSV is plain text, ideal for reading and analyzing the comments directly.
The format defaults to the best option for your plan; pass "format" to override
(JSON requires a Premium or Business plan).`,
    {
      guid: z.string().describe('The job GUID to download data for'),
      format: z.enum(['json', 'csv']).optional().describe('Output format. Default: JSON for Premium/Business, CSV for Free/Personal. JSON requires a paid plan.'),
    },
    async (params) => {
      const client = clientFor(getToken);
      const result = await client.downloadData(params.guid, params.format);
      // CSV comes back as a raw string — hand it to the model verbatim so it can
      // read the rows directly. JSON payloads and errors stay structured.
      const text = result.ok && typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result, null, 2);
      return {
        content: [{ type: 'text' as const, text }],
        isError: !result.ok,
      };
    }
  );

  // ── Tool: detect_platform ──
  server.tool(
    'detect_platform',
    `Detect which platform a URL belongs to and return supported options.
Use this before export_comments to understand what options are available.`,
    { url: z.string().describe('The URL to detect the platform for') },
    async (params) => {
      const platform = detectPlatform(params.url);
      if (platform) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, data: platform }, null, 2) }] };
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ok: false,
            error: `Could not detect platform for URL: ${params.url}`,
            detail: 'Use list_platforms to see all supported platforms.',
          }, null, 2),
        }],
        isError: true,
      };
    }
  );

  // ── Tool: list_platforms ──
  server.tool(
    'list_platforms',
    `List all 33+ supported platforms with their URL patterns, export options, and example URLs.`,
    {},
    async () => {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ok: true,
            data: { total: PLATFORMS.length, platforms: PLATFORMS },
          }, null, 2),
        }],
      };
    }
  );

  // ── User account ──

  server.tool(
    'get_my_profile',
    'Get the authenticated account profile: email, plan tier, account ID, registration date.',
    {},
    async () => {
      const result = await clientFor(getToken).getProfile();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'get_my_quota',
    'Current usage vs. allowance for this account: requests today/this month, comments exported, concurrent exports in flight.',
    {},
    async () => {
      const result = await clientFor(getToken).getQuota();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'get_my_limits',
    'Plan tier limits (Premium / Business): daily request cap, rate limit, concurrent exports, max comments per export, webhook count.',
    {},
    async () => {
      const result = await clientFor(getToken).getLimits();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  // ── Random comment picker (giveaways) ──

  server.tool(
    'pick_random_winners',
    `Pick N random winners from a completed export. Downloads the export's
JSON payload, deduplicates by commenter username, optionally filters by
@-mention, hashtag, or substring, then picks N winners uniformly.

Returns the winner list with usernames, comment text, and permalinks
(suitable for FTC-compliant public verification).`,
    {
      guid: z.string().describe('Completed export GUID (status=done)'),
      count: z.number().min(1).max(100).default(1).describe('Number of winners (default 1)'),
      require_mention: z.string().optional().describe('Only consider comments containing this @-handle (e.g. "@brand")'),
      require_hashtag: z.string().optional().describe('Only consider comments containing this #hashtag'),
      require_text: z.string().optional().describe('Substring the comment must contain (case-insensitive)'),
      dedupe_by_user: z.boolean().optional().default(true).describe('Limit each commenter to one entry (default true)'),
    },
    async (params) => {
      const client = clientFor(getToken);
      const dl = await client.downloadJson(params.guid);
      if (!dl.ok) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(dl, null, 2) }], isError: true };
      }

      // Most ExportComments JSON exports are an array of comment objects;
      // some platforms wrap in {comments: [...]}. Tolerate both.
      const raw = dl.data as unknown;
      let comments: Array<Record<string, unknown>> =
        Array.isArray(raw) ? raw as Array<Record<string, unknown>>
        : (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).comments))
          ? (raw as { comments: Array<Record<string, unknown>> }).comments
          : [];

      const totalIn = comments.length;

      if (params.require_mention) {
        const needle = params.require_mention.toLowerCase();
        comments = comments.filter((c) => String(c.comment ?? c.text ?? '').toLowerCase().includes(needle));
      }
      if (params.require_hashtag) {
        const tag = params.require_hashtag.startsWith('#') ? params.require_hashtag : '#' + params.require_hashtag;
        const needle = tag.toLowerCase();
        comments = comments.filter((c) => String(c.comment ?? c.text ?? '').toLowerCase().includes(needle));
      }
      if (params.require_text) {
        const needle = params.require_text.toLowerCase();
        comments = comments.filter((c) => String(c.comment ?? c.text ?? '').toLowerCase().includes(needle));
      }
      if (params.dedupe_by_user !== false) {
        const seen = new Set<string>();
        comments = comments.filter((c) => {
          const u = String(c.username ?? c.user ?? c.user_name ?? '');
          if (u === '' || seen.has(u)) return false;
          seen.add(u);
          return true;
        });
      }

      if (comments.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ok: false,
            error: 'No comments matched the filters.',
            total_in_export: totalIn,
          }, null, 2) }],
          isError: true,
        };
      }

      // Fisher-Yates shuffle then take first N
      const pool = [...comments];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      }
      const winners = pool.slice(0, Math.min(params.count, pool.length));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          ok: true,
          data: {
            total_in_export: totalIn,
            after_filters: comments.length,
            winners_requested: params.count,
            winners: winners.map((c) => ({
              username: c.username ?? c.user ?? c.user_name,
              comment: c.comment ?? c.text,
              permalink: c.permalink ?? c.url ?? null,
              created_at: c.created_at ?? c.timestamp ?? null,
            })),
          },
        }, null, 2) }],
      };
    }
  );

  // ── Webhooks ──

  server.tool(
    'list_webhooks',
    'List the authenticated account\'s webhook subscriptions (event, URL, enabled state, last delivery status).',
    {},
    async () => {
      const result = await clientFor(getToken).listWebhooks();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'create_webhook',
    `Subscribe a URL to a webhook event. Common events: "export.completed",
"export.failed", "schedule.run". The URL will receive POSTs with a JSON
body (signed via X-Webhook-Signature for verification).`,
    {
      event: z.string().describe('Event name (e.g. "export.completed")'),
      url: z.string().url().describe('HTTPS endpoint that handles the event'),
    },
    async (params) => {
      const result = await clientFor(getToken).createWebhook(params.event, params.url);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'update_webhook',
    'Change the event or target URL of an existing webhook subscription.',
    {
      uuid: z.string().describe('Webhook UUID from list_webhooks'),
      event: z.string().optional().describe('New event name'),
      url: z.string().url().optional().describe('New target URL'),
    },
    async (params) => {
      const fields: { event?: string; url?: string } = {};
      if (params.event) fields.event = params.event;
      if (params.url) fields.url = params.url;
      const result = await clientFor(getToken).updateWebhook(params.uuid, fields);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'delete_webhook',
    'Permanently remove a webhook subscription. Use toggle_webhook to disable without deleting.',
    { uuid: z.string().describe('Webhook UUID from list_webhooks') },
    async (params) => {
      const result = await clientFor(getToken).deleteWebhook(params.uuid);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'toggle_webhook',
    'Enable or disable a webhook (30s cooldown between toggles).',
    { uuid: z.string().describe('Webhook UUID from list_webhooks') },
    async (params) => {
      const result = await clientFor(getToken).toggleWebhook(params.uuid);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'test_webhook',
    'Fire a test event at the configured URL to verify delivery. Returns the receiving server\'s response.',
    { uuid: z.string().describe('Webhook UUID from list_webhooks') },
    async (params) => {
      const result = await clientFor(getToken).testWebhook(params.uuid);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  // ── Scheduled exports ──

  server.tool(
    'list_schedules',
    'List scheduled (recurring) export jobs for this account.',
    {},
    async () => {
      const result = await clientFor(getToken).listSchedules();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'create_schedule',
    `Create a recurring export. Either pass a standard cron expression
("0 9 * * 1" = Mondays 09:00 UTC) or a frequency name ("daily",
"weekly", "monthly"). Same options as export_comments — replies, limit,
vpn, cookies, etc. — in an options object.`,
    {
      url: z.string().describe('URL to export on each run'),
      cron: z.string().optional().describe('Cron expression in UTC (e.g. "0 9 * * 1")'),
      frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly']).optional().describe('Friendly frequency name'),
      options: z.record(z.string(), z.unknown()).optional().describe('Same options as export_comments'),
    },
    async (params) => {
      if (!params.cron && !params.frequency) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            ok: false,
            error: 'Either cron or frequency is required.',
          }, null, 2) }],
          isError: true,
        };
      }
      const result = await clientFor(getToken).createSchedule({
        url: params.url,
        cron: params.cron,
        frequency: params.frequency,
        options: params.options,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'update_schedule',
    'Edit a scheduled export\'s URL, cron, frequency, or options.',
    {
      uuid: z.string().describe('Schedule UUID from list_schedules'),
      url: z.string().optional(),
      cron: z.string().optional(),
      frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly']).optional(),
      options: z.record(z.string(), z.unknown()).optional(),
    },
    async (params) => {
      const fields: Record<string, unknown> = {};
      if (params.url !== undefined) fields.url = params.url;
      if (params.cron !== undefined) fields.cron = params.cron;
      if (params.frequency !== undefined) fields.frequency = params.frequency;
      if (params.options !== undefined) fields.options = params.options;
      const result = await clientFor(getToken).updateSchedule(params.uuid, fields);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'delete_schedule',
    'Permanently remove a scheduled export. Use pause_schedule to suspend without deleting.',
    { uuid: z.string().describe('Schedule UUID from list_schedules') },
    async (params) => {
      const result = await clientFor(getToken).deleteSchedule(params.uuid);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'run_schedule',
    'Trigger a scheduled export to run immediately (in addition to its normal cadence).',
    { uuid: z.string().describe('Schedule UUID from list_schedules') },
    async (params) => {
      const result = await clientFor(getToken).runSchedule(params.uuid);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'pause_schedule',
    'Suspend a scheduled export. No new runs until resume_schedule is called.',
    { uuid: z.string().describe('Schedule UUID from list_schedules') },
    async (params) => {
      const result = await clientFor(getToken).pauseSchedule(params.uuid);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );

  server.tool(
    'resume_schedule',
    'Resume a paused scheduled export.',
    { uuid: z.string().describe('Schedule UUID from list_schedules') },
    async (params) => {
      const result = await clientFor(getToken).resumeSchedule(params.uuid);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }], isError: !result.ok };
    }
  );
}
