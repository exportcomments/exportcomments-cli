#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const proc = spawn('node', ['dist/mcp.js'], { stdio: ['pipe', 'pipe', 'inherit'] });

const responses = [];
let buf = '';
proc.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) {
      try { responses.push(JSON.parse(line)); } catch { /* ignore */ }
    }
  }
});

proc.on('error', (err) => { console.error('mcp spawn failed:', err); process.exit(1); });

const send = (msg) => proc.stdin.write(JSON.stringify(msg) + '\n');

async function waitFor(predicate, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = responses.find(predicate);
    if (found) return found;
    await delay(50);
  }
  throw new Error('mcp smoke: timeout waiting for response');
}

try {
  send({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke-test', version: '1.0.0' },
    },
  });
  await waitFor((r) => r.id === 1 && r.result);

  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const list = await waitFor((r) => r.id === 2 && r.result);

  const tools = list.result?.tools;
  if (!Array.isArray(tools) || tools.length === 0) {
    console.error('mcp smoke: expected non-empty tools array');
    process.exit(1);
  }

  const expected = ['export_comments', 'check_export', 'list_exports', 'download_export', 'list_platforms', 'detect_platform'];
  const names = tools.map((t) => t.name);
  const missing = expected.filter((n) => !names.includes(n));
  if (missing.length) {
    console.error('mcp smoke: missing tools:', missing.join(', '));
    console.error('got:', names.join(', '));
    process.exit(1);
  }

  console.log(`mcp smoke OK: ${tools.length} tools (${names.join(', ')})`);
} finally {
  proc.kill();
}
