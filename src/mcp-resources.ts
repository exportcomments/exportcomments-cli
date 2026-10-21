// ── MCP resources ──
//
// Resources let a client attach context with one click instead of a tool
// call: `exportcomments://platforms` (static reference), `exportcomments://exports`
// (recent jobs), and `exportcomments://export/{guid}` (diagnostics + stats +
// a small sample of one export, the ideal "here is my export" attachment).

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PLATFORMS } from './platforms.js';
import { type TokenProvider, clientFor } from './mcp-shared.js';

const JSON_MIME = 'application/json';

export function registerResources(server: McpServer, getToken: TokenProvider): void {
  server.registerResource(
    'platforms',
    'exportcomments://platforms',
    {
      title: 'Supported platforms',
      description: 'All supported platforms with URL patterns, export options and example URLs.',
      mimeType: JSON_MIME,
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: JSON_MIME, text: JSON.stringify({ total: PLATFORMS.length, platforms: PLATFORMS }, null, 2) }],
    }),
  );

  server.registerResource(
    'recent-exports',
    'exportcomments://exports',
    {
      title: 'Recent exports',
      description: 'The 20 most recent export jobs of the connected account (guid, url, status, counts).',
      mimeType: JSON_MIME,
    },
    async (uri) => {
      const result = await clientFor(getToken).listJobs(1, 20);
      return { contents: [{ uri: uri.href, mimeType: JSON_MIME, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerResource(
    'export',
    new ResourceTemplate('exportcomments://export/{guid}', {
      list: undefined,
      complete: {
        guid: async (value) => {
          try {
            const result = await clientFor(getToken).listJobs(1, 50);
            if (!result.ok) return [];
            return (result.data ?? [])
              .map((j) => j.guid)
              .filter((g): g is string => typeof g === 'string' && g.startsWith(value));
          } catch {
            return [];
          }
        },
      },
    }),
    {
      title: 'Export overview',
      description: 'One export: diagnostics, server-side stats and a 10-row sample. Attach this to discuss an export without downloading it.',
      mimeType: JSON_MIME,
    },
    async (uri, variables) => {
      const guid = String(variables['guid'] ?? '');
      const client = clientFor(getToken);
      const diagnostics = await client.getExportDiagnostics(guid);
      const done = diagnostics.ok && (diagnostics.data as { status?: string } | undefined)?.status === 'done';
      const [stats, sample] = done
        ? await Promise.all([client.getExportStats(guid), client.sampleExport(guid, 10, 'top_likes')])
        : [null, null];
      const payload = {
        guid,
        diagnostics: diagnostics.ok ? diagnostics.data : diagnostics,
        stats: stats ? (stats.ok ? (stats.data as { stats?: unknown })?.stats : stats) : null,
        sample: sample ? (sample.ok ? (sample.data as { rows?: unknown })?.rows : sample) : null,
        next: done
          ? 'Use search_export / sample_export / export_sentiment for detail; download_export only when you need every row.'
          : 'Export is not finished; use check_export (wait=true) and read this resource again.',
      };
      return { contents: [{ uri: uri.href, mimeType: JSON_MIME, text: JSON.stringify(payload, null, 2) }] };
    },
  );
}
