// ── ExportComments Realtime (WebSocket) Module ──
// Uses Centrifugo v6 via centrifuge-js for instant job updates.

import { Centrifuge } from 'centrifuge';
import type { CLIOutput, JobResponse, SocketEvent } from './types.js';

const DEFAULT_WS_URL = 'wss://exportcomments.com/connection/websocket';
const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes
const CONNECTION_TIMEOUT_MS = 5_000;

const TERMINAL_EVENTS = new Set([
  'job.finished',
  'job.failed',
  'job.convert.done',
  'job.convert.failed',
]);

async function getSocketToken(
  apiToken: string,
  baseUrl?: string
): Promise<string> {
  const url = (baseUrl ?? 'https://exportcomments.com') + '/api/public/auth/socket';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-AUTH-TOKEN': apiToken,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Socket auth failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { token?: string };
  if (!data.token) {
    throw new Error('Socket auth response missing token');
  }
  return data.token;
}

export async function waitForJobRealtime(
  token: string,
  guid: string,
  opts?: {
    timeoutMs?: number;
    onEvent?: (event: string, data: SocketEvent) => void;
    wsUrl?: string;
    baseUrl?: string;
  }
): Promise<CLIOutput<JobResponse>> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const wsUrl = opts?.wsUrl ?? DEFAULT_WS_URL;

  let jwt: string;
  try {
    jwt = await getSocketToken(token, opts?.baseUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `WebSocket auth failed: ${message}`, error_code: 'WS_AUTH_FAILED' };
  }

  return new Promise<CLIOutput<JobResponse>>((resolve) => {
    let settled = false;
    let overallTimer: ReturnType<typeof setTimeout>;
    let connectionTimer: ReturnType<typeof setTimeout>;

    const client = new Centrifuge(wsUrl, { token: jwt });

    function cleanup() {
      clearTimeout(overallTimer);
      clearTimeout(connectionTimer);
      try {
        client.disconnect();
      } catch {
        // ignore
      }
    }

    function settle(result: CLIOutput<JobResponse>) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    // Connection timeout — if we can't connect within 5s, bail out so caller can fall back to polling
    connectionTimer = setTimeout(() => {
      if (!settled) {
        settle({
          ok: false,
          error: 'WebSocket connection timeout',
          error_code: 'WS_CONNECTION_TIMEOUT',
        });
      }
    }, CONNECTION_TIMEOUT_MS);

    // Overall timeout
    overallTimer = setTimeout(() => {
      settle({
        ok: false,
        error: `Timeout after ${timeoutMs / 1000}s waiting for job ${guid} via WebSocket`,
        error_code: 'WS_TIMEOUT',
      });
    }, timeoutMs);

    client.on('connected', () => {
      clearTimeout(connectionTimer);
    });

    client.on('error', (ctx) => {
      settle({
        ok: false,
        error: `WebSocket error: ${ctx.error?.message ?? 'unknown'}`,
        error_code: 'WS_ERROR',
      });
    });

    client.on('disconnected', (ctx) => {
      if (!settled) {
        settle({
          ok: false,
          error: `WebSocket disconnected: ${ctx.reason ?? 'unknown'}`,
          error_code: 'WS_DISCONNECTED',
        });
      }
    });

    // Listen for publications (channels are auto-subscribed via JWT server-side subs)
    client.on('publication', (ctx) => {
      const data = ctx.data as SocketEvent | undefined;
      if (!data || data.guid !== guid) return;

      opts?.onEvent?.(data.event, data);

      if (TERMINAL_EVENTS.has(data.event)) {
        const isSuccess = data.event === 'job.finished' || data.event === 'job.convert.done';
        const jobData: JobResponse = {
          guid: data.guid,
          url: data.url ?? '',
          status: isSuccess ? 'done' : 'error',
          total: data.total,
          total_exported: data.current,
          download_url: data.details?.download_url as string | undefined ?? null,
          json_url: data.details?.json_url as string | undefined ?? null,
          error: isSuccess ? null : (data.details?.error as string | undefined ?? data.event),
        };
        settle({ ok: isSuccess, data: jobData });
      }
    });

    client.connect();
  });
}
