// ── MCP tools: bulk exports and multi-step workflows ──

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { jsonResult, type TokenProvider, clientFor } from './mcp-shared.js';

const WORKFLOW_ACTIONS = ['export_posts', 'export_comments', 'export_likes', 'export_shares', 'export_followers', 'export_reviews'] as const;

export function registerWorkflowTools(server: McpServer, getToken: TokenProvider): void {
  // ── Bulk ──

  server.tool(
    'export_many_urls',
    `Queue one export per URL in a single batch (bulk export). Each URL becomes its own job and
its own file; when all finish the batch is downloadable as one ZIP from the dashboard. Options
apply to every URL (same keys as export_comments: replies, limit, min_date, max_date…). Returns
the batch id plus the per-URL job GUIDs; poll with check_batch_export or check_export per GUID.`,
    {
      urls: z.array(z.string().url()).min(1).max(100).describe('Post / profile / review URLs, one job each'),
      replies: z.boolean().optional(),
      limit: z.number().int().optional().describe('Max items per URL'),
      min_date: z.string().optional(),
      max_date: z.string().optional(),
    },
    async ({ urls, ...options }) => {
      const clean = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
      return jsonResult(await clientFor(getToken).createBatchExport(urls, clean));
    },
  );

  server.tool(
    'check_batch_export',
    'Status of a bulk export batch: per-URL job states, how many are done, and the ZIP download when complete.',
    { batch_id: z.string().describe('Batch id returned by export_many_urls') },
    async (p) => jsonResult(await clientFor(getToken).getBatchExport(p.batch_id)),
  );

  // ── Workflows ──

  server.tool(
    'list_workflows',
    `List the account's workflows: recurring multi-step pipelines such as "export the latest posts
of a profile, then export the comments of each post". Premium/Business.`,
    {},
    async () => jsonResult(await clientFor(getToken).listWorkflows()),
  );

  server.tool(
    'get_workflow',
    'One workflow with its steps, schedule, last runs and the export GUIDs each run produced.',
    { uuid: z.string().describe('Workflow UUID from list_workflows') },
    async (p) => jsonResult(await clientFor(getToken).getWorkflow(p.uuid)),
  );

  server.tool(
    'workflow_pipeline_info',
    `Before creating a workflow: which step actions a URL supports (e.g. a profile URL →
export_posts then export_comments; a product URL → export_reviews) and the allowed transitions.`,
    { url: z.string().url().describe('The source URL the workflow will start from') },
    async (p) => jsonResult(await clientFor(getToken).getWorkflowPipelineInfo(p.url)),
  );

  server.tool(
    'create_workflow',
    `Create a recurring multi-step workflow. Typical: url = profile page, steps =
[{action:"export_posts"}, {action:"export_comments", inputMode:"previous_results"}] — the second
step runs on every post the first step found. frequency: daily | weekly | monthly (plan-dependent).
Use workflow_pipeline_info first to see valid actions for the URL. Counts against the plan's
workflow and max-steps limits. Call run_workflow afterwards to execute it immediately.`,
    {
      url: z.string().url(),
      name: z.string().optional(),
      frequency: z.enum(['daily', 'weekly', 'monthly']).optional().default('daily'),
      steps: z.array(z.object({
        action: z.enum(WORKFLOW_ACTIONS),
        inputMode: z.enum(['url', 'previous_results']).optional().describe('previous_results = run on the items the previous step produced'),
        options: z.record(z.string(), z.unknown()).optional().describe('Per-step export options (replies, limit, min_date…)'),
      })).min(1).max(5),
      options: z.record(z.string(), z.unknown()).optional().describe('Workflow-level export options'),
    },
    async (p) => jsonResult(await clientFor(getToken).createWorkflow(p)),
  );

  server.tool(
    'update_workflow',
    'Change a workflow\'s URL, name, frequency, steps or options.',
    {
      uuid: z.string(),
      url: z.string().url().optional(),
      name: z.string().optional(),
      frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
      steps: z.array(z.object({
        action: z.enum(WORKFLOW_ACTIONS),
        inputMode: z.enum(['url', 'previous_results']).optional(),
        options: z.record(z.string(), z.unknown()).optional(),
      })).min(1).max(5).optional(),
      options: z.record(z.string(), z.unknown()).optional(),
    },
    async ({ uuid, ...payload }) => {
      const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
      return jsonResult(await clientFor(getToken).updateWorkflow(uuid, clean));
    },
  );

  server.tool(
    'delete_workflow',
    'Permanently delete a workflow. Use pause_workflow to suspend without deleting.',
    { uuid: z.string() },
    async (p) => jsonResult(await clientFor(getToken).deleteWorkflow(p.uuid)),
  );

  server.tool(
    'pause_workflow',
    'Suspend a workflow; no runs until resume_workflow.',
    { uuid: z.string() },
    async (p) => jsonResult(await clientFor(getToken).pauseWorkflow(p.uuid)),
  );

  server.tool(
    'resume_workflow',
    'Resume a paused workflow.',
    { uuid: z.string() },
    async (p) => jsonResult(await clientFor(getToken).resumeWorkflow(p.uuid)),
  );

  server.tool(
    'run_workflow',
    'Run a workflow now, in addition to its schedule. Returns the run; follow its exports with get_workflow.',
    { uuid: z.string() },
    async (p) => jsonResult(await clientFor(getToken).runWorkflow(p.uuid)),
  );
}
