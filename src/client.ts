// ── ExportComments API Client ──

import type {
  CreateJobRequest,
  JobResponse,
  ApiError,
  CLIOutput,
} from './types.js';

const BASE_URL = 'https://exportcomments.com/api/v3';
const USER_AGENT = 'exportcomments-cli/1.0.0';

export class ExportCommentsClient {
  private token: string;
  private baseUrl: string;

  constructor(token: string, baseUrl?: string) {
    this.token = token;
    this.baseUrl = baseUrl ?? BASE_URL;
  }

  private get headers(): Record<string, string> {
    return {
      'X-AUTH-TOKEN': this.token,
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    };
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

  /** Create a new export job */
  async createJob(req: CreateJobRequest): Promise<CLIOutput<JobResponse>> {
    return this.request<JobResponse>('POST', '/job', req);
  }

  /** Check the status of an export job */
  async getJob(guid: string): Promise<CLIOutput<JobResponse>> {
    return this.request<JobResponse>('GET', `/job/${guid}`);
  }

  /** List all export jobs */
  async listJobs(
    page = 1,
    limit = 20
  ): Promise<CLIOutput<JobResponse[]>> {
    return this.request<JobResponse[]>(
      'GET',
      `/jobs?page=${page}&limit=${limit}`
    );
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
   */
  async downloadJson(guid: string): Promise<CLIOutput<unknown>> {
    const jobResult = await this.getJob(guid);
    if (!jobResult.ok) return { ok: false, error: jobResult.error, error_code: jobResult.error_code, detail: jobResult.detail };

    const job = jobResult.data!;
    const jsonUrl = job.json_url;

    if (!jsonUrl) {
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
