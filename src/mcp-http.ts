#!/usr/bin/env node

// ── ExportComments MCP Server (HTTP / SSE) ──
// Stateless MCP server that authenticates each request via Bearer (OAuth
// access token or legacy X-AUTH-TOKEN). Deployed at mcp.exportcomments.com
// for remote MCP clients (Claude web, Cursor, etc.).
//
// Auth:
//   • Authorization: Bearer <jwt>                (preferred — OAuth 2.0 token)
//   • Authorization: Bearer <api-token>          (legacy API token works too)
//   • X-AUTH-TOKEN: <api-token>                  (legacy header for direct API parity)
//
// On missing/invalid auth, returns 401 with WWW-Authenticate pointing at
// our OAuth discovery doc so MCP clients can launch the OAuth flow.
//
// The MCP server itself does NOT verify the JWT signature locally — the
// downstream API (/api/v3/*) validates on every call. A bogus token will
// receive 401 from the API on the first tool invocation. This is acceptable
// for Phase 2; Phase 3 may add local JWT verification for faster rejection.

import * as http from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerExportTools } from './mcp-tools.js';

const PORT = Number(process.env.MCP_PORT ?? 3100);
const HOST = process.env.MCP_HOST ?? '127.0.0.1';
const OAUTH_DISCOVERY_URL = process.env.OAUTH_DISCOVERY_URL
  ?? 'https://exportcomments.com/.well-known/oauth-authorization-server';

function extractToken(req: http.IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  // Legacy API token header
  const apiToken = req.headers['x-auth-token'];
  if (typeof apiToken === 'string' && apiToken !== '') {
    return apiToken;
  }
  return null;
}

function sendUnauthorized(res: http.ServerResponse): void {
  // Per MCP spec, surfacing `resource_metadata` / `as_uri` lets compatible
  // clients (Claude Desktop, Cursor) auto-trigger the OAuth flow.
  res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': `Bearer realm="exportcomments", as_uri="${OAUTH_DISCOVERY_URL}", resource_metadata="${OAUTH_DISCOVERY_URL}"`,
  });
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: 'Unauthorized: missing or invalid Bearer token.',
      data: {
        oauth_authorization_server: OAUTH_DISCOVERY_URL,
        help: 'Connect via OAuth at https://exportcomments.com/oauth/authorize, or pass an API token from https://app.exportcomments.com/user/api',
      },
    },
    id: null,
  }));
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (raw === '') return resolve(undefined);
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function handleMcp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    sendUnauthorized(res);
    return;
  }

  // One server + transport per request, both stateless (sessionIdGenerator
  // returns undefined). The token closes over the tool handlers via
  // `getToken`. The handlers exec for at most this request's lifetime.
  const server = new McpServer({ name: 'exportcomments', version: '1.0.0' });
  registerExportTools(server, () => token);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });
  await server.connect(transport);

  // Auto-tear-down when the response closes — prevents leaked handlers.
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    const body = await readBody(req);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error', data: String(err) },
        id: null,
      }));
    }
  }
}

const server = http.createServer(async (req, res) => {
  // CORS (allow Claude web + arbitrary MCP clients)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version');
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'exportcomments-mcp', version: '1.0.0' }));
    return;
  }

  if (req.url === '/' || req.url?.startsWith('/mcp') || req.url?.startsWith('/sse')) {
    await handleMcp(req, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found', message: `${req.method} ${req.url} — try POST /mcp` }));
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`exportcomments-mcp listening on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`  POST /mcp  — MCP protocol endpoint (Authorization: Bearer required)`);
  // eslint-disable-next-line no-console
  console.log(`  GET /health  — liveness probe`);
  // eslint-disable-next-line no-console
  console.log(`  OAuth discovery: ${OAUTH_DISCOVERY_URL}`);
});

function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} — shutting down`);
  server.close(() => process.exit(0));
  // Force-exit if still hanging after 5s
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
