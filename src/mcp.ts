#!/usr/bin/env node

// ── ExportComments MCP Server ──
// Model Context Protocol server for AI agents to interact with ExportComments.com API.
// Provides structured tools for exporting comments/reviews from 40+ platforms.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ExportCommentsClient } from './client.js';
import { PLATFORMS, detectPlatform } from './platforms.js';
import { waitForJobRealtime } from './realtime.js';

const TOKEN = process.env.EXPORTCOMMENTS_API_TOKEN;

function getClient(): ExportCommentsClient {
  if (!TOKEN) {
    throw new Error(
      'EXPORTCOMMENTS_API_TOKEN environment variable is required. ' +
      'Get your token at https://app.exportcomments.com/user/api'
    );
  }
  return new ExportCommentsClient(TOKEN);
}

const server = new McpServer({
  name: 'exportcomments',
  version: '1.0.0',
});

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
    cookies: z.record(z.string(), z.string()).optional().describe('Cookies for authenticated access (e.g. {"sessionid": "abc"})'),
    tweets: z.boolean().optional().describe('Include tweets (Twitter/X only)'),
    followers: z.boolean().optional().describe('Export followers list (Twitter/X only)'),
    following: z.boolean().optional().describe('Export following list (Twitter/X only)'),
    likes: z.boolean().optional().describe('Export likes data'),
    shares: z.boolean().optional().describe('Include shares data'),
    advanced: z.boolean().optional().describe('Enable advanced export features'),
    facebook_ads: z.boolean().optional().describe('Include Facebook ads data'),
    wait: z.boolean().optional().describe('Wait for export to complete before returning (polls every 5s, timeout 10min)'),
    realtime: z.boolean().optional().describe('Use WebSocket for real-time updates instead of polling (implies wait=true)'),
  },
  async (params) => {
    const client = getClient();

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

      if (params.realtime && TOKEN) {
        waitResult = await waitForJobRealtime(TOKEN, result.data.guid);

        // Fall back to polling if WebSocket fails
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
Job statuses: queueing -> progress -> done | error.
Set wait=true to poll until the job reaches a terminal state.`,
  {
    guid: z.string().describe('The job GUID returned by export_comments'),
    wait: z.boolean().optional().describe('Wait for export to complete before returning'),
    realtime: z.boolean().optional().describe('Use WebSocket for real-time updates instead of polling (implies wait=true)'),
  },
  async (params) => {
    const client = getClient();

    const shouldWait = params.wait || params.realtime;

    if (shouldWait) {
      let result;

      if (params.realtime && TOKEN) {
        result = await waitForJobRealtime(TOKEN, params.guid);

        // Fall back to polling if WebSocket fails
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
    const client = getClient();
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
  `Download the raw JSON data for a completed export job.
Returns the actual exported comments/reviews as structured JSON data.
The job must have status "done" for this to work.`,
  {
    guid: z.string().describe('The job GUID to download data for'),
  },
  async (params) => {
    const client = getClient();
    const result = await client.downloadJson(params.guid);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      isError: !result.ok,
    };
  }
);

// ── Tool: detect_platform ──

server.tool(
  'detect_platform',
  `Detect which platform a URL belongs to and return supported options.
Returns platform name, URL patterns, available export options, and example URLs.
Use this before export_comments to understand what options are available for a URL.`,
  {
    url: z.string().describe('The URL to detect the platform for'),
  },
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
  `List all 33+ supported platforms with their URL patterns, export options, and example URLs.
Use this to discover what platforms and features are available.`,
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

// ── Start Server ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
