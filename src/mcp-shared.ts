// ── Shared helpers for the MCP tool / resource / prompt modules ──

import { ExportCommentsClient } from './client.js';
import type { CLIOutput } from './types.js';

export type TokenProvider = () => string;

export function clientFor(getToken: TokenProvider): ExportCommentsClient {
  const token = getToken();
  if (!token) {
    throw new Error(
      'Missing API token. Stdio mode requires EXPORTCOMMENTS_API_TOKEN; HTTP mode requires Authorization: Bearer <token>. ' +
      'Get a token at https://app.exportcomments.com/user/api or via the OAuth flow at https://exportcomments.com/oauth/authorize.'
    );
  }
  return new ExportCommentsClient(token);
}

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/** Standard envelope: pretty JSON, isError mirrors the client's ok flag. */
export function jsonResult(result: CLIOutput<unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: !result.ok,
  };
}

export function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}
