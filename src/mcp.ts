#!/usr/bin/env node

// ── ExportComments MCP Server (stdio) ──
// Model Context Protocol server for AI agents. Stdio transport — used by
// Claude Desktop and other locally-spawned MCP clients. Token comes from
// the EXPORTCOMMENTS_API_TOKEN environment variable (set in the client's
// MCP server config). For browser-driven OAuth, use the HTTP entry point
// at mcp.exportcomments.com (src/mcp-http.ts).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerExportTools } from './mcp-tools.js';

const server = new McpServer({ name: 'exportcomments', version: '1.0.0' });

registerExportTools(server, () => process.env.EXPORTCOMMENTS_API_TOKEN ?? '');

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
