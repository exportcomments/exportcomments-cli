#!/usr/bin/env node

// ── ExportComments MCP Server (HTTP / SSE) ──
// Stateless MCP server that authenticates each request via Bearer (OAuth
// access token or legacy X-AUTH-TOKEN). Deployed at mcp.exportcomments.com
// for remote MCP clients (ChatGPT, Claude web, Cursor, etc.).
//
// Auth:
//   • Authorization: Bearer <jwt>                (preferred — OAuth 2.0 token)
//   • Authorization: Bearer <api-token>          (legacy API token works too)
//   • X-AUTH-TOKEN: <api-token>                  (legacy header for direct API parity)
//
// On missing, expired, malformed or revoked auth we answer HTTP 401 with a
// WWW-Authenticate challenge pointing at our OAuth discovery docs. That header
// is the ONLY signal an MCP client acts on to re-run the OAuth flow — a failing
// tool result inside an HTTP 200 tells it nothing, which is why a token that
// aged out used to leave the connector permanently broken.
//
// Token checking is layered so the fast path stays free:
//   1. every request — offline `exp` check on the JWT (no network)
//   2. `initialize` only — one liveness probe against the API, so a revoked
//      but unexpired token is caught at connect time rather than mid-export
//   3. the API still validates the signature on every downstream call

import * as http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerAllMcp } from './mcp-tools.js';
import { inspectToken, probeTokenLiveness } from './auth.js';

const PORT = Number(process.env.MCP_PORT ?? 3100);
const HOST = process.env.MCP_HOST ?? '127.0.0.1';
const OAUTH_DISCOVERY_URL = process.env.OAUTH_DISCOVERY_URL
  ?? 'https://exportcomments.com/.well-known/oauth-authorization-server';
const PROTECTED_RESOURCE_URL = 'https://mcp.exportcomments.com/.well-known/oauth-protected-resource';

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

/**
 * RFC 6750 §3 / RFC 9728 challenge. `error="invalid_token"` is what tells a
 * client the credential it holds is dead and must be replaced — omit it and
 * ChatGPT treats the 401 as "not logged in yet" at best, or as a hard failure.
 * `resource_metadata` lets compatible clients (ChatGPT connectors, Claude
 * Custom Connector, Cursor, Windsurf) auto-discover the authorization server;
 * `as_uri` is the older shorthand, emitted alongside for compatibility.
 */
function sendUnauthorized(
  res: http.ServerResponse,
  opts: { error?: 'invalid_token'; description: string } = { description: 'Missing or invalid Bearer token.' },
): void {
  const parts = ['Bearer realm="exportcomments"'];
  if (opts.error) parts.push(`error="${opts.error}"`);
  parts.push(`error_description="${opts.description.replace(/"/g, "'")}"`);
  parts.push(`as_uri="${OAUTH_DISCOVERY_URL}"`);
  parts.push(`resource_metadata="${PROTECTED_RESOURCE_URL}"`);

  res.writeHead(401, {
    'Content-Type': 'application/json',
    'WWW-Authenticate': parts.join(', '),
  });
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: `Unauthorized: ${opts.description}`,
      data: {
        oauth_authorization_server: OAUTH_DISCOVERY_URL,
        resource_metadata: PROTECTED_RESOURCE_URL,
        help: 'Reconnect the ExportComments connector to re-authorize, or pass an API token from https://app.exportcomments.com/user/api',
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

/** True when the JSON-RPC body (single message or batch) carries an `initialize`. */
function isInitializeRequest(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some((m) =>
    m !== null && typeof m === 'object' && (m as Record<string, unknown>)['method'] === 'initialize');
}

async function handleMcp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    sendUnauthorized(res);
    return;
  }

  // ── Layer 1: offline expiry check (the failure this whole gate exists for) ──
  const state = inspectToken(token);
  if (state.kind === 'expired') {
    sendUnauthorized(res, {
      error: 'invalid_token',
      description: 'The access token expired. Re-authorize to obtain a new one.',
    });
    return;
  }
  if (state.kind === 'malformed') {
    sendUnauthorized(res, {
      error: 'invalid_token',
      description: 'The access token could not be parsed.',
    });
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error', data: String(err) },
      id: null,
    }));
    return;
  }

  // ── Layer 2: one liveness probe per session, at connect time ──
  // Catches unexpired-but-revoked tokens while the client is still in a state
  // where it will happily re-run OAuth. Costs one request per connector start.
  if (isInitializeRequest(body) && await probeTokenLiveness(token) === 'unauthorized') {
    sendUnauthorized(res, {
      error: 'invalid_token',
      description: 'The access token is no longer valid. Re-authorize to reconnect.',
    });
    return;
  }

  // One server + transport per request, both stateless (sessionIdGenerator
  // returns undefined). The token closes over the tool handlers via
  // `getToken`. The handlers exec for at most this request's lifetime.
  const server = new McpServer({ name: 'exportcomments', version: '1.0.0' });
  registerAllMcp(server, () => token);

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
  // CORS (allow ChatGPT + Claude web + arbitrary MCP clients)
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

  // OAuth discovery endpoints (served from this resource origin so MCP
  // clients can complete the connector setup without an extra lookup).
  // We mirror the AS metadata locally and also expose Protected Resource
  // Metadata (RFC 9728) for clients that follow the newer MCP auth spec.
  //
  // Keep this mirror in sync with the authoritative document served by the
  // api repo (src/Controller/OAuth/OAuthMetadataController.php) — a client
  // that reads `grant_types_supported` from here and finds no `refresh_token`
  // will never try to refresh, which is exactly how connectors used to die
  // an hour after being added.
  if (req.method === 'GET' && req.url === '/.well-known/oauth-authorization-server') {
    const issuer = new URL(OAUTH_DISCOVERY_URL).origin;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      registration_endpoint: `${issuer}/oauth/register`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      scopes_supported: ['read', 'write'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      service_documentation: 'https://docs.exportcomments.com/cli/mcp',
    }));
    return;
  }

  // RFC 9728 §3.1 — metadata is served at the resource's well-known URL
  // suffix. Most clients fetch /.well-known/oauth-protected-resource at the
  // origin; ChatGPT and Claude.ai's connectors append the resource path, so we
  // accept both /.well-known/oauth-protected-resource and
  // /.well-known/oauth-protected-resource/mcp (and any other path under it)
  // with the same document.
  if (req.method === 'GET' && req.url?.startsWith('/.well-known/oauth-protected-resource')) {
    const issuer = new URL(OAUTH_DISCOVERY_URL).origin;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      resource: 'https://mcp.exportcomments.com/mcp',
      authorization_servers: [issuer],
      scopes_supported: ['read', 'write'],
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://docs.exportcomments.com/cli/mcp',
    }));
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
