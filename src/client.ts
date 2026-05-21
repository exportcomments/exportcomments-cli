// ── ExportComments API Client ──

import type {
  CreateJobRequest,
  JobResponse,
  ApiError,
  CLIOutput,
} from './types.js';

const API_BASE = process.env.EXPORTCOMMENTS_API_BASE?.replace(/\/+$/, '') ?? 'https://exportcomments.com';
const BASE_URL = `${API_BASE}/api/v3`;
const V1_BASE_URL = `${API_BASE}/api/v1`;
const USER_AGENT = 'exportcomments-cli/1.0.0';

/** A JWT has three base64url-encoded segments separated by dots (header.payload.signature). */
function looksLikeJwt(token: string): boolean {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

export class ExportCommentsClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string, baseUrl?: string) {
    this.token = token;
    this.baseUrl = baseUrl ?? BASE_URL;
  }

  private get headers(): Record<string, string> {
    const auth: Record<string, string> = looksLikeJwt(this.token)
      ? { Authorization: `Bearer ${this.token}` }
      : { 'X-AUTH-TOKEN': this.token };
    return {
      ...auth,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    };
  }

  /** Make a request against /api/v1/* (most user/webhook/schedule endpoints). */
  private async v1Request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<CLIOutput<T>> {
    const v1BaseUrl = this.baseUrl.replace('/v3', '/v1');
    const url = `${v1BaseUrl}${path}`;
    try {
      const res = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data: T | ApiError;
      try {
        data = JSON.parse(text);
      } catch {
        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status}: ${res.statusText}`, detail: text.slice(0, 500) };
        }
        return { ok: true, data: text as unknown as T };
      }
      if (!res.ok) {
        const err = data as ApiError;
        return {
          ok: false,
          error: err.error ?? `HTTP ${res.status}`,
          error_code: err.error_code,
          detail: err.detail,
        };
      }
      return { ok: true, data: data as T };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<CLIOutput<T>> {
    const url = `${this.baseUrl}${path}`;

    try {
      const res = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const text = await res.text();
      let data: T | ApiError;

      try {
        data = JSON.parse(text);
      } catch {
        if (!res.ok) {
          return {
            ok: false,
            error: `HTTP ${res.status}: ${res.statusText}`,
            detail: text.slice(0, 500),
          };
        }
        return { ok: true, data: text as unknown as T };
      }

      if (!res.ok) {
        const err = data as ApiError;
        return {
          ok: false,
          error: err.error ?? `HTTP ${res.status}`,
          error_code: err.error_code,
          detail: err.detail,
        };
      }

      return { ok: true, data: data as T };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  /**
   * Cached lookup of whether the configured token's user has /api/v3
   * (developer-API) access. Premium and Business return true; Free and
   * Personal return false. Result is memoised for the lifetime of the
   * client instance — within an MCP session that's one call total.
   *
   * For non-JWT tokens (legacy X-AUTH-TOKEN) we shortcut to true, because
   * an X-AUTH-TOKEN is only ever issued to API-eligible accounts.
   */
  private apiAccessCache: boolean | null = null;
  private async hasApiAccess(): Promise<boolean> {
    if (this.apiAccessCache !== null) return this.apiAccessCache;
    if (!looksLikeJwt(this.token)) {
      this.apiAccessCache = true;
      return true;
    }
    try {
      const url = `${this.baseUrl.replace('/v3', '/v1')}/api-usage`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) { this.apiAccessCache = false; return false; }
      const data = (await res.json()) as { has_access?: boolean };
      this.apiAccessCache = Boolean(data.has_access);
      return this.apiAccessCache;
    } catch {
      this.apiAccessCache = false;
      return false;
    }
  }

  /**
   * Some /api/v1 list endpoints wrap each item as `{comment: {…}}` while /v3
   * returns the comment fields flat. Normalise so callers always see flat shape.
   */
  private unwrapV1Item(item: unknown): JobResponse {
    if (item && typeof item === 'object' && 'comment' in item && (item as Record<string, unknown>)['comment'] && typeof (item as Record<string, unknown>)['comment'] === 'object') {
      return (item as { comment: JobResponse }).comment;
    }
    return item as JobResponse;
  }

  /** Create a new export job */
  async createJob(req: CreateJobRequest): Promise<CLIOutput<JobResponse>> {
    if (!(await this.hasApiAccess())) {
      // Free / Personal — route through the user-API. POST /api/v1/job
      // replies HTTP 400 + {error: "export.unfinished", guid} when the job
      // is queued; unwrap that into a successful "queueing" response.
      const v1BaseUrl = this.baseUrl.replace('/v3', '/v1');
      try {
        const res = await fetch(`${v1BaseUrl}/job`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(req),
        });
        const text = await res.text();
        let data: Record<string, unknown> | null = null;
        try { data = JSON.parse(text); } catch { /* non-JSON */ }
        if (data && typeof data === 'object' && data['error'] === 'export.unfinished' && typeof data['guid'] === 'string') {
          return { ok: true, data: { guid: data['guid'] as string, status: 'queueing' } as JobResponse };
        }
        if (res.ok && data) return { ok: true, data: data as unknown as JobResponse };
        return {
          ok: false,
          error: (data?.['error'] as string | undefined) ?? `HTTP ${res.status}`,
          error_code: data?.['error_code'] as string | undefined,
          detail: data?.['detail'] as string | undefined,
        };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    return this.request<JobResponse>('POST', '/job', req);
  }

  /** Check the status of an export job */
  async getJob(guid: string): Promise<CLIOutput<JobResponse>> {
    if (!(await this.hasApiAccess())) {
      return this.v1Request<JobResponse>('GET', `/job/${guid}`);
    }
    return this.request<JobResponse>('GET', `/job/${guid}`);
  }

  /** List all export jobs */
  async listJobs(
    page = 1,
    limit = 20
  ): Promise<CLIOutput<JobResponse[]>> {
    if (!(await this.hasApiAccess())) {
      const res = await this.v1Request<{ items?: unknown[] }>(
        'GET',
        `/jobs?page=${page}&limit=${limit}`
      );
      if (!res.ok) return { ok: false, error: res.error, error_code: res.error_code, detail: res.detail };
      const items = (res.data?.items ?? []).map((i) => this.unwrapV1Item(i));
      return { ok: true, data: items };
    }
    return this.request<JobResponse[]>(
      'GET',
      `/jobs?page=${page}&limit=${limit}`
    );
  }

  /** Stop a queued or in-progress export */
  async stopJob(guid: string): Promise<CLIOutput<unknown>> {
    if (!(await this.hasApiAccess())) {
      return this.v1Request('POST', `/jobs/${guid}/stop`);
    }
    return this.request('PATCH', `/job/${guid}/stop`);
  }

  /** Download a file from a direct URL, saving it to disk */
  private async downloadFile(
    fileUrl: string,
    fallbackFilename: string
  ): Promise<CLIOutput<{ path: string; bytes: number }>> {
    try {
      const res = await fetch(fileUrl, { headers: this.headers });

      if (!res.ok) {
        const text = await res.text();
        try {
          const err: ApiError = JSON.parse(text);
          return { ok: false, error: err.error, error_code: err.error_code };
        } catch {
          return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
        }
      }

      // Extract filename from content-disposition or URL
      const disposition = res.headers.get('content-disposition');
      let filename = fallbackFilename;
      if (disposition) {
        const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match?.[1]) {
          filename = match[1].replace(/['"]/g, '');
        }
      } else {
        // Extract filename from URL path
        const urlPath = new URL(fileUrl).pathname;
        const urlFilename = urlPath.split('/').pop();
        if (urlFilename) filename = urlFilename;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const fs = await import('fs');
      const path = await import('path');

      const outputPath = path.resolve(filename);
      fs.writeFileSync(outputPath, buffer);

      return { ok: true, data: { path: outputPath, bytes: buffer.length } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  /**
   * Download the export file (Excel/CSV) for a completed job.
   * First fetches job status to get the download URL, then downloads.
   */
  async downloadJob(guid: string): Promise<CLIOutput<{ path: string; bytes: number }>> {
    const jobResult = await this.getJob(guid);
    if (!jobResult.ok) return { ok: false, error: jobResult.error, error_code: jobResult.error_code, detail: jobResult.detail };

    const job = jobResult.data!;
    const downloadUrl = job.download_url ?? job.download_link;

    if (!downloadUrl) {
      return {
        ok: false,
        error: `No download URL available for job ${guid}`,
        detail: `Job status: ${job.status}. The job may not be complete yet.`,
      };
    }

    return this.downloadFile(downloadUrl, `export-${guid}.xlsx`);
  }

  /**
   * Download the raw JSON data for a completed job.
   * First fetches job status to get the JSON URL, then downloads.
   *
   * NOTE: JSON delivery is a developer-API feature — only exports created
   * through /api/v3/* carry a `json_url`. Free / Personal users hit /v1/*
   * (which only emits Excel/CSV), so jobs they create never have a json_url.
   * In that case we surface a clear upgrade hint instead of the generic
   * "no JSON URL" error.
   */
  async downloadJson(guid: string): Promise<CLIOutput<unknown>> {
    const jobResult = await this.getJob(guid);
    if (!jobResult.ok) return { ok: false, error: jobResult.error, error_code: jobResult.error_code, detail: jobResult.detail };

    const job = jobResult.data!;
    const jsonUrl = job.json_url;

    if (!jsonUrl) {
      if (!(await this.hasApiAccess())) {
        return {
          ok: false,
          error: 'JSON export requires a Premium or Business plan.',
          error_code: 'plan_upgrade_required',
          detail: 'This job was created on the user API which only emits Excel/CSV. Upgrade at https://exportcomments.com/pricing to enable JSON output.',
        };
      }
      return {
        ok: false,
        error: `No JSON URL available for job ${guid}`,
        detail: `Job status: ${job.status}. The job may not be complete yet.`,
      };
    }

    try {
      const res = await fetch(jsonUrl, { headers: this.headers });

      if (!res.ok) {
        const text = await res.text();
        try {
          const err: ApiError = JSON.parse(text);
          return { ok: false, error: err.error, error_code: err.error_code };
        } catch {
          return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
        }
      }

      const data = await res.json();
      return { ok: true, data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // /api/v1/* — user account, webhooks, scheduled exports
  // ───────────────────────────────────────────────────────────────────────

  /** Authenticated user's profile (email, tier, account info). */
  async getProfile(): Promise<CLIOutput<unknown>> {
    return this.v1Request('GET', '/user/profile');
  }

  /** Current usage quota: daily/monthly counts vs. allowances. */
  async getQuota(): Promise<CLIOutput<unknown>> {
    return this.v1Request('GET', '/user/quota');
  }

  /** Plan tier limits (concurrent exports, max comments, rate limits, etc.). */
  async getLimits(): Promise<CLIOutput<unknown>> {
    return this.v1Request('GET', '/user/limits');
  }

  /** List all webhooks for the authenticated account. */
  async listWebhooks(): Promise<CLIOutput<unknown>> {
    return this.v1Request('GET', '/webhooks');
  }

  /**
   * @param event subscription event name (e.g. "export.completed")
   * @param url   POST target — must respond 2xx within 10s
   *
   * The API-Platform webhook resource expects `events: string[]` and a
   * `signingSecret` for HMAC verification. We accept a single event in the
   * MCP-facing shape and expand it here so the MCP tool stays single-arg.
   */
  async createWebhook(event: string, url: string): Promise<CLIOutput<unknown>> {
    const { randomBytes } = await import('node:crypto');
    return this.v1Request('POST', '/webhooks', {
      events: [event],
      url,
      signingSecret: randomBytes(32).toString('hex'),
    });
  }

  async updateWebhook(uuid: string, fields: { event?: string; url?: string }): Promise<CLIOutput<unknown>> {
    const payload: { events?: string[]; url?: string } = {};
    if (fields.event) payload.events = [fields.event];
    if (fields.url) payload.url = fields.url;
    return this.v1Request('PATCH', `/webhooks/${uuid}`, payload);
  }

  async deleteWebhook(uuid: string): Promise<CLIOutput<unknown>> {
    return this.v1Request('DELETE', `/webhooks/${uuid}`);
  }

  /** Toggle uses PATCH (API-Platform exposes it that way). */
  async toggleWebhook(uuid: string): Promise<CLIOutput<unknown>> {
    return this.v1Request('PATCH', `/webhooks/${uuid}/toggle`);
  }

  /** Sends a test event payload. The main /webhooks bundle has no test
   * endpoint; the Zapier-integration route does, and accepts the same UUID. */
  async testWebhook(uuid: string): Promise<CLIOutput<unknown>> {
    return this.v1Request('POST', `/zapier/webhooks/${uuid}/test`);
  }

  // ── Scheduled exports ──

  async listSchedules(): Promise<CLIOutput<unknown>> {
    return this.v1Request('GET', '/schedules');
  }

  async createSchedule(payload: {
    url: string;
    cron?: string;
    frequency?: string;
    options?: Record<string, unknown>;
  }): Promise<CLIOutput<unknown>> {
    return this.v1Request('POST', '/schedules', payload);
  }

  async updateSchedule(uuid: string, fields: Record<string, unknown>): Promise<CLIOutput<unknown>> {
    return this.v1Request('PUT', `/schedules/${uuid}`, fields);
  }

  async deleteSchedule(uuid: string): Promise<CLIOutput<unknown>> {
    return this.v1Request('DELETE', `/schedules/${uuid}`);
  }

  async runSchedule(uuid: string): Promise<CLIOutput<unknown>> {
    return this.v1Request('POST', `/schedules/${uuid}/run-now`);
  }

  async pauseSchedule(uuid: string): Promise<CLIOutput<unknown>> {
    return this.v1Request('POST', `/schedules/${uuid}/pause`);
  }

  async resumeSchedule(uuid: string): Promise<CLIOutput<unknown>> {
    return this.v1Request('POST', `/schedules/${uuid}/resume`);
  }

  /** Ping the API to check connectivity */
  async ping(): Promise<CLIOutput<{ status: string }>> {
    // Ping uses v1 endpoint
    const url = this.baseUrl.replace('/v3', '/v1') + '/ping';
    try {
      const res = await fetch(url, { headers: this.headers });
      const data = await res.json();
      return { ok: res.ok, data };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  /**
   * Poll a job until it reaches a terminal status (done/error).
   * Returns the final job state.
   */
  async waitForJob(
    guid: string,
    opts: { intervalMs?: number; timeoutMs?: number; onPoll?: (job: JobResponse) => void } = {}
  ): Promise<CLIOutput<JobResponse>> {
    const interval = opts.intervalMs ?? 5000;
    const timeout = opts.timeoutMs ?? 600_000; // 10 minutes default
    const start = Date.now();

    while (true) {
      const result = await this.getJob(guid);

      if (!result.ok) return result;

      const job = result.data!;
      opts.onPoll?.(job);

      if (job.status === 'done' || job.status === 'error') {
        return result;
      }

      if (Date.now() - start > timeout) {
        return {
          ok: false,
          error: `Timeout after ${timeout / 1000}s waiting for job ${guid}`,
          detail: `Last status: ${job.status}, total: ${job.total ?? 0}, exported: ${job.total_exported ?? 0}`,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}
