// ── MCP tools: server-side insights over a finished export ──
//
// Every tool here calls one of the /api/v3/job/{guid}/* insight endpoints,
// which reduce the dataset on the server. The model gets aggregates, a page,
// a sample, a draw or a diff — never the whole export — so these work the
// same for a 200-comment post and a 50k-comment profile. Open to all plan
// tiers; each call counts once against the daily analysis limit
// (Free 10 / Personal 50 / Premium 500 / Business unlimited).

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { jsonResult, type TokenProvider, clientFor } from './mcp-shared.js';

export function registerInsightTools(server: McpServer, getToken: TokenProvider): void {
  server.tool(
    'export_stats',
    `Aggregate statistics for a completed export, computed server-side (works for any size).
Returns: total, unique/repeat authors, time range, comments per day / hour (UTC) / weekday,
likes total/average/max + distribution, message-length distribution, counts of questions /
links / emoji, top authors, top hashtags, top @mentions, top words, the 5 most-liked comments,
sentiment distribution (when present) and rating distribution (reviews).
Use this FIRST when asked to analyse or summarise an export — it is the cheapest call and
tells you what to look at next with search_export or sample_export.`,
    { guid: z.string().describe('Completed export GUID (status=done)') },
    async (p) => jsonResult(await clientFor(getToken).getExportStats(p.guid)),
  );

  server.tool(
    'search_export',
    `Filter and page through a completed export's rows server-side. Combine any of:
q (all words must appear, case-insensitive), regex (PCRE, case-insensitive), username,
min_likes, date_from / date_to (YYYY-MM-DD or ISO), sentiment (positive|neutral|negative,
only after sentiment was computed), min_rating / max_rating (reviews), has_link, is_question.
Sort by newest | oldest | most_liked | least_liked | longest | shortest. Max 200 rows per page.
Returns matched count + pages so you can decide whether to read more pages.`,
    {
      guid: z.string().describe('Completed export GUID'),
      q: z.string().optional().describe('Words that must all appear in the message'),
      regex: z.string().optional().describe('Regular expression the message must match'),
      username: z.string().optional().describe('Only comments by this author'),
      min_likes: z.number().int().optional(),
      date_from: z.string().optional().describe('Inclusive lower bound, YYYY-MM-DD or ISO 8601'),
      date_to: z.string().optional().describe('Inclusive upper bound, YYYY-MM-DD or ISO 8601'),
      sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
      min_rating: z.number().optional().describe('Reviews only'),
      max_rating: z.number().optional().describe('Reviews only'),
      has_link: z.boolean().optional(),
      is_question: z.boolean().optional().describe('Only comments containing a question mark'),
      sort: z.enum(['newest', 'oldest', 'most_liked', 'least_liked', 'longest', 'shortest']).optional(),
      page: z.number().int().min(1).optional().default(1),
      per_page: z.number().int().min(1).max(200).optional().default(50),
    },
    async ({ guid, ...criteria }) => jsonResult(await clientFor(getToken).searchExport(guid, criteria)),
  );

  server.tool(
    'sample_export',
    `Return N representative rows from a completed export without downloading it.
Strategies: random (pass seed for a reproducible sample), top_likes, latest, oldest, longest.
Good for qualitative reads ("what are people saying") on big exports; use export_stats for numbers.`,
    {
      guid: z.string().describe('Completed export GUID'),
      n: z.number().int().min(1).max(200).optional().default(20),
      strategy: z.enum(['random', 'top_likes', 'latest', 'oldest', 'longest']).optional().default('random'),
      seed: z.number().int().optional().describe('Seed for strategy=random'),
    },
    async (p) => jsonResult(await clientFor(getToken).sampleExport(p.guid, p.n, p.strategy, p.seed)),
  );

  server.tool(
    'export_sentiment',
    `Sentiment analysis over a subset of a completed export, run server-side on request.
Returns distribution + shares + net score (positive − negative), example comments per label and
authors with repeated negative comments. The subset defaults to 50 random comments (max 300);
it runs synchronously, so larger subsets take longer. Accounts with their own AI provider key
configured in API settings use that provider; otherwise the free built-in analyser is used and
may cover only part of the subset (see "warning"). For a full-export sentiment column, download
the XLSX with the sentiment filter from the dashboard instead.`,
    {
      guid: z.string().describe('Completed export GUID'),
      limit: z.number().int().min(1).max(300).optional().default(50).describe('Subset size'),
      strategy: z.enum(['random', 'top_likes', 'latest', 'oldest', 'longest']).optional().default('random'),
      seed: z.number().int().optional(),
      examples: z.number().int().min(0).max(20).optional().default(5).describe('Example comments per label'),
    },
    async ({ guid, ...opts }) => jsonResult(await clientFor(getToken).getExportSentiment(guid, opts)),
  );

  server.tool(
    'compare_exports',
    `Compare two completed exports of the same account — typically the same URL exported at two
dates. Returns added / removed comments (by comment id) with samples, author churn, and deltas for
total, unique authors, likes, average length and sentiment. Use it for "what changed since last
week" and for before/after campaign checks.`,
    {
      guid: z.string().describe('Reference (older) export GUID'),
      with: z.string().describe('Export GUID to compare against (newer)'),
      sample: z.number().int().min(0).max(100).optional().default(20).describe('Rows to include per added/removed sample'),
    },
    async (p) => jsonResult(await clientFor(getToken).compareExports(p.guid, p.with, p.sample)),
  );

  server.tool(
    'export_diagnostics',
    `Explain the state of an export in plain terms: status, a customer-safe error message when it
failed, warnings recorded during the run, whether it stopped at the plan limit (and that an extra
capacity pack bound to this guid resumes it), counts, options, timestamps, and a hint for the next
action. Call this when check_export shows "error", when counts look wrong, or before retry_export.`,
    { guid: z.string().describe('Export GUID') },
    async (p) => jsonResult(await clientFor(getToken).getExportDiagnostics(p.guid)),
  );

  server.tool(
    'retry_export',
    `Retry an export that ended in status "error". Re-queues the same URL and options. If it fails
again with the same message the content is probably private, removed or geo-restricted — read
export_diagnostics first.`,
    { guid: z.string().describe('Export GUID in status=error') },
    async (p) => jsonResult(await clientFor(getToken).retryJob(p.guid)),
  );

  server.tool(
    'stop_export',
    'Stop a queued or running export. What was collected so far is kept and the job becomes downloadable.',
    { guid: z.string().describe('Export GUID in status=queueing or progress') },
    async (p) => jsonResult(await clientFor(getToken).stopJob(p.guid)),
  );

  server.tool(
    'export_analytics_report',
    `The dashboard analytics report for exports of profiles, hashtags and channels (Instagram,
TikTok, X/Twitter, YouTube and generic): engagement by day, posting heatmaps by weekday × hour,
reach and engagement-rate series. Not available for single-post comment exports (use
export_stats there).`,
    { guid: z.string().describe('Completed export GUID of a profile/hashtag/channel export') },
    async (p) => jsonResult(await clientFor(getToken).getExportAnalyticsReport(p.guid)),
  );
}
