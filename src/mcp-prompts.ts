// ── MCP prompts ──
//
// Prompts show up as slash commands / quick actions in MCP clients (Claude
// Desktop lists them under "+"). Each one is a recipe that tells the model
// which tools to call in which order and what to produce, so a non-technical
// user gets a good result without knowing the tool names.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

function userMessage(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
}

const SIZE_RULE = `Never call download_export on an export with more than ~2,000 rows; use export_stats, search_export, sample_export and export_sentiment instead — they run on the server and return small results.`;

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'analyze_export',
    {
      title: 'Analyze an export',
      description: 'Full read-out of a finished export: numbers, themes, sentiment, notable comments, recommendations.',
      argsSchema: {
        guid: z.string().describe('Export GUID (from list_exports or the dashboard)'),
        focus: z.string().optional().describe('Optional angle, e.g. "product feedback", "customer complaints", "campaign reception"'),
      },
    },
    ({ guid, focus }) => userMessage(
`Analyze ExportComments export ${guid}${focus ? ` with a focus on: ${focus}` : ''}.

Steps:
1. export_diagnostics ${guid} — confirm status=done and note total_exported, platform and url.
2. export_stats ${guid} — volume over time, top authors, hashtags/mentions, likes and length distributions, questions/links.
3. sample_export ${guid} strategy=top_likes n=30, then sample_export strategy=random n=40 — read the actual voices.
4. export_sentiment ${guid} limit=100 — overall mood with examples per label.
5. If the stats show questions, search_export is_question=true sort=most_liked per_page=30 — unanswered questions are actionable.

${SIZE_RULE}

Produce: a short executive summary (3–5 sentences), key numbers as a compact table, 4–6 themes each with 1–2 quoted comments (username + text), the sentiment picture, notable risks or complaints, and 3–5 recommended actions. Quote comments verbatim; do not invent any.`),
  );

  server.registerPrompt(
    'client_report',
    {
      title: 'Client-ready report',
      description: 'A polished report for a client or manager about one export, written for non-technical readers.',
      argsSchema: {
        guid: z.string().describe('Export GUID'),
        brand: z.string().optional().describe('Brand / client name to address the report to'),
        language: z.string().optional().describe('Language for the report, e.g. "Italian" (default: the language of this chat)'),
      },
    },
    ({ guid, brand, language }) => userMessage(
`Write a client-ready report${brand ? ` for ${brand}` : ''} about ExportComments export ${guid}${language ? `, in ${language}` : ''}.

Gather data with export_diagnostics, export_stats, sample_export (top_likes n=25 and random n=25) and export_sentiment (limit=100). ${SIZE_RULE}

Structure: title with the source URL and date range; one-paragraph summary; "By the numbers" (total comments, unique commenters, period, peak day, average likes, sentiment split); "What people are saying" with 4–6 themes and verbatim quotes; "Questions and requests" (from search_export is_question=true); "Risks / negative signals"; "Recommendations". Keep it concise, no jargon, no tool names in the final text.`),
  );

  server.registerPrompt(
    'pick_giveaway_winners',
    {
      title: 'Pick giveaway winners',
      description: 'Draw winners from a completed export with the usual giveaway rules and prepare a verifiable announcement.',
      argsSchema: {
        guid: z.string().describe('Export GUID of the giveaway post'),
        count: z.string().optional().describe('Number of winners (default 1)'),
        hashtag: z.string().optional().describe('Required hashtag, e.g. #giveaway'),
        mention: z.string().optional().describe('Required @mention, e.g. @brand'),
        exclude_users: z.string().optional().describe('Comma-separated usernames to exclude (the brand account, staff)'),
      },
    },
    ({ guid, count, hashtag, mention, exclude_users }) => userMessage(
`Run a giveaway draw on ExportComments export ${guid}.

1. export_diagnostics ${guid} — make sure the export is done and covers the whole post (capped_by_limit must be false; if true, say so before drawing).
2. pick_random_winners ${guid} count=${count ?? '1'}${hashtag ? ` require_hashtag=${hashtag}` : ''}${mention ? ` require_mention=${mention}` : ''}${exclude_users ? ` exclude_users=${exclude_users}` : ''} dedupe_by_user=true. The draw is seeded on the server; keep the returned seed and verification hash.
3. Ask whether to publish: if yes, publish_giveaway_result for each winner with username, message, profile_url, position, eligible, filters (include the seed) and drawn_at, and return the share URLs.

Then write the announcement: winners with @usernames and links, how many eligible entries there were, the rules applied, the seed + verification hash so anyone can re-run the draw, and a line that winners will be contacted by DM. Never alter the winners the tool returned.`),
  );

  server.registerPrompt(
    'find_leads_and_questions',
    {
      title: 'Find leads and unanswered questions',
      description: 'Surface purchase intent, support requests and unanswered questions from an export for the community / sales team.',
      argsSchema: { guid: z.string().describe('Export GUID') },
    },
    ({ guid }) => userMessage(
`From ExportComments export ${guid}, find comments the team should reply to.

Use search_export with sort=most_liked per_page=50 on several passes: is_question=true; q="price"; q="where buy"; q="how much"; q="available"; q="ship"; q="discount"; q="broken"; q="refund"; q="help"; plus has_link=true (spam / competitors). Adapt the keywords to the language seen in the export (check sample_export first). ${SIZE_RULE}

Return three lists with username, date, verbatim comment and the comment url: (1) purchase intent / leads, (2) support or complaint cases, (3) unanswered questions. Deduplicate by username and end with a suggested reply for the top 5.`),
  );

  server.registerPrompt(
    'compare_two_exports',
    {
      title: 'Compare two exports',
      description: 'What changed between two exports of the same source (before/after, week over week).',
      argsSchema: {
        base_guid: z.string().describe('Older / reference export GUID'),
        new_guid: z.string().describe('Newer export GUID'),
      },
    },
    ({ base_guid, new_guid }) => userMessage(
`Compare ExportComments exports ${base_guid} (before) and ${new_guid} (after).

Call compare_exports guid=${base_guid} with=${new_guid} sample=30, then export_stats on each if you need more detail, and export_sentiment limit=80 on each for the mood change. ${SIZE_RULE}

Report: volume and author changes, new vs lost commenters, what the new comments talk about (quote 5–8 verbatim), sentiment shift, and a one-paragraph interpretation. Flag if the two exports do not share the same URL.`),
  );

  server.registerPrompt(
    'monitor_source',
    {
      title: 'Monitor a URL on a schedule',
      description: 'Set up a recurring export of a post, profile or product page, with optional webhook delivery.',
      argsSchema: {
        url: z.string().describe('URL to monitor'),
        frequency: z.string().optional().describe('daily | weekly | monthly (default weekly)'),
        webhook_url: z.string().optional().describe('HTTPS endpoint to notify on export.completed'),
      },
    },
    ({ url, frequency, webhook_url }) => userMessage(
`Set up monitoring for ${url} on ExportComments.

1. detect_platform ${url} — confirm it is supported and which options apply.
2. get_my_limits — check the plan allows scheduled exports and the requested frequency.
3. create_schedule url=${url} frequency=${frequency ?? 'weekly'} (add replies=true if the platform supports it).
${webhook_url ? `4. create_webhook event=export.completed url=${webhook_url}, then test_webhook on it.` : '4. Ask whether the user wants an email notification or a webhook on completion.'}

Finish with: what was created (UUIDs), when the first run happens, and how to compare runs later with compare_exports.`),
  );

  server.registerPrompt(
    'profile_posts_and_comments',
    {
      title: 'Export a profile\'s posts and their comments',
      description: 'Two-step workflow: latest posts of a profile, then the comments of each post.',
      argsSchema: {
        url: z.string().describe('Profile / page / channel URL'),
        posts: z.string().optional().describe('How many recent posts (default 10)'),
      },
    },
    ({ url, posts }) => userMessage(
`Export the comments of the latest ${posts ?? '10'} posts of ${url} with ExportComments.

1. workflow_pipeline_info ${url} — confirm export_posts → export_comments is available for this platform.
2. create_workflow url=${url} frequency=monthly steps=[{action:"export_posts", options:{limit:${posts ?? '10'}}}, {action:"export_comments", inputMode:"previous_results", options:{replies:true}}].
3. run_workflow on the returned UUID, then get_workflow until the run reports its exports.
4. For each produced comments export, export_stats; then summarise across posts (which post drew the most comments, common themes, sentiment per post via export_sentiment limit=50).

If workflows are not available on the plan, fall back to: export_comments on the profile URL to get the posts list, then export_many_urls with the post URLs.`),
  );
}
