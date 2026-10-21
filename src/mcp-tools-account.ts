// ── MCP tools: usage history, billing, notifications, giveaway publishing ──

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { jsonResult, type TokenProvider, clientFor } from './mcp-shared.js';

export function registerAccountTools(server: McpServer, getToken: TokenProvider): void {
  server.tool(
    'get_usage_history',
    `Usage over time for this account: exports and comments per day / month, platform mix, and
how the current month compares to the plan allowance. Use get_my_quota for "how much is left today".`,
    {},
    async () => jsonResult(await clientFor(getToken).getUsageStats()),
  );

  server.tool(
    'get_account_analytics',
    'Account-level analytics summary as shown on the dashboard home: totals, success rate, recent trend, most exported platforms.',
    {},
    async () => jsonResult(await clientFor(getToken).getAnalyticsSummary()),
  );

  server.tool(
    'list_invoices',
    'Invoices / payments for this account: number, amount, currency, status, date. PDFs are downloaded from the dashboard billing page.',
    {},
    async () => jsonResult(await clientFor(getToken).listInvoices()),
  );

  server.tool(
    'get_extra_capacity_checkout',
    `Get a checkout link for extra capacity packs (250,000 comments each, 1–20 packs). Nothing is
charged by this call: it returns a Stripe checkout URL the user opens themselves. Pass guid to
bind the packs to a specific export that stopped at the plan limit — paying then resumes that
export automatically. Requires a verified email.`,
    {
      packs: z.number().int().min(1).max(20).default(1),
      guid: z.string().optional().describe('Export GUID that hit its cap (see export_diagnostics capped_by_limit)'),
    },
    async (p) => jsonResult(await clientFor(getToken).getExtraCapacityCheckout(p.packs, p.guid)),
  );

  server.tool(
    'get_export_notification',
    'Whether an email notification is enabled for an export (sent when it finishes).',
    { guid: z.string() },
    async (p) => jsonResult(await clientFor(getToken).getExportNotification(p.guid)),
  );

  server.tool(
    'toggle_export_notification',
    `Turn the finish-email notification for an export on or off (toggles the current state; read it
first with get_export_notification). This is how "tell me when it's done" works outside this chat —
for programmatic delivery use create_webhook with event export.completed.`,
    { guid: z.string() },
    async (p) => jsonResult(await clientFor(getToken).toggleExportNotification(p.guid)),
  );

  server.tool(
    'publish_giveaway_result',
    `Publish a giveaway winner to a public verification page on exportcomments.com and get its
share URL — the "certificate" you can post so entrants can verify the draw. Pass the winner
returned by pick_random_winners (username, message, profile_url) together with the eligible
count, the filters and the seed so the page shows how the draw was made.`,
    {
      guid: z.string().describe('Export GUID the draw was made from'),
      username: z.string(),
      message: z.string().optional(),
      profile_url: z.string().optional(),
      profile_image: z.string().optional(),
      position: z.number().int().optional().describe('Winner position from pick_random_winners'),
      eligible: z.number().int().optional().describe('Eligible entries after filters'),
      filters: z.record(z.string(), z.unknown()).optional().describe('Filters + seed from pick_random_winners'),
      drawn_at: z.string().optional().describe('drawn_at from pick_random_winners (ISO 8601)'),
    },
    async (p) => jsonResult(await clientFor(getToken).publishGiveawayResult(p.guid, {
      winner: {
        username: p.username,
        index: p.position,
        message: p.message,
        profileUrl: p.profile_url,
        profileImage: p.profile_image,
      },
      filteredCount: p.eligible,
      filters: p.filters,
      timestamp: p.drawn_at,
    })),
  );
}
