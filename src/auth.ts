// ── Bearer-token inspection for the HTTP MCP server ──
//
// Why this file exists: the MCP server used to accept ANY string that looked
// like a token, run the tool, and let the downstream API reject it. A dead
// token therefore produced HTTP 200 + a tool result of
// `{ok: false, error: "Authentication Failed"}`. MCP clients (ChatGPT,
// Claude, Cursor) only start the OAuth re-authorization flow when the
// *transport* answers 401 with a WWW-Authenticate header — a failed tool
// result means nothing to them. So every connector silently rotted one hour
// after connecting (the access-token TTL) and every call errored forever.
//
// These helpers let mcp-http.ts detect a dead token and answer 401 instead.

const API_BASE = process.env.EXPORTCOMMENTS_API_BASE?.replace(/\/+$/, '') ?? 'https://exportcomments.com';

/** A JWT has three base64url-encoded segments separated by dots. */
export function looksLikeJwt(token: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

/**
 * Decode a JWT payload WITHOUT verifying the signature. Verification is the
 * API's job; here we only need `exp` so we can reject an obviously-dead token
 * before spending a network round trip on it.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  try {
    const json = Buffer.from(segments[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type TokenState =
  | { kind: 'opaque' }                    // legacy X-AUTH-TOKEN — no local claims to check
  | { kind: 'valid'; expiresAt: number }  // JWT, not expired (signature unverified)
  | { kind: 'expired'; expiredAt: number }
  | { kind: 'malformed' };

/**
 * Cheap, offline classification of an incoming bearer token. Catches the
 * overwhelmingly common failure — an access token that simply aged out — for
 * the cost of a base64 decode.
 */
export function inspectToken(token: string): TokenState {
  if (!looksLikeJwt(token)) return { kind: 'opaque' };

  const payload = decodeJwtPayload(token);
  if (payload === null) return { kind: 'malformed' };

  const exp = payload['exp'];
  if (typeof exp !== 'number') return { kind: 'malformed' };

  const now = Math.floor(Date.now() / 1000);
  return exp <= now ? { kind: 'expired', expiredAt: exp } : { kind: 'valid', expiresAt: exp };
}

/**
 * Ask the API whether this token still authenticates. Used once per MCP
 * session (on `initialize`) so a token that is unexpired but revoked — the
 * user signed out, the account was disabled, an admin rotated keys — also
 * surfaces as a transport 401 that triggers re-authorization, instead of
 * turning into a confusing tool error on the user's first export.
 *
 * `/api/v1/user/profile` is ROLE_USER, so it answers for every plan tier.
 * Anything that is not an explicit 401 (403, 429, 5xx, a network blip) is
 * reported as 'unknown' and lets the request through — we never want a
 * transient API hiccup to look like a revoked connector.
 */
export async function probeTokenLiveness(token: string): Promise<'ok' | 'unauthorized' | 'unknown'> {
  const headers: Record<string, string> = looksLikeJwt(token)
    ? { Authorization: `Bearer ${token}` }
    : { 'X-AUTH-TOKEN': token };

  try {
    const res = await fetch(`${API_BASE}/api/v1/user/profile`, {
      method: 'GET',
      headers: { ...headers, 'User-Agent': 'exportcomments-mcp/1.0.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) return 'unauthorized';
    if (res.ok) return 'ok';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
