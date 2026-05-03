// ── ExportComments API Types ──

export interface ExportOptions {
  replies?: boolean;
  limit?: number;
  minTimestamp?: number;
  maxTimestamp?: number;
  vpn?: string;
  cookies?: Record<string, string>;
  pool?: string;
  cursor?: string;
  tweets?: boolean;
  followers?: boolean;
  following?: boolean;
  id?: string;
  likes?: boolean;
  live?: boolean;
  shares?: boolean;
  advanced?: boolean;
  facebookAds?: boolean;
}

export interface CreateJobRequest {
  url: string;
  options?: ExportOptions;
}

export interface JobResponse {
  id?: number;
  guid: string;
  url: string;
  status: JobStatus;
  replies?: boolean;
  file_name?: string;
  raw_file?: string;
  total?: number;
  total_exported?: number;
  retry?: number;
  error?: string | null;
  replies_count?: number;
  timezone?: string;
  options?: ExportOptions;
  created_at?: string;
  updated_at?: string;
  exported_at?: string | null;
  download_url?: string | null;
  json_url?: string | null;
  download_link?: string | null;
  platform?: string;
  export_type?: string;
  plan?: string;
  status_url?: string;
  delete_after?: string;
}

export type JobStatus = 'queueing' | 'progress' | 'done' | 'error' | 'requeued';

export interface ApiError {
  error: string;
  error_code?: string;
  detail?: string;
  seconds_to_wait?: number;
}

export interface CLIOutput<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  error_code?: string;
  detail?: string;
}

export interface SocketEvent {
  version: string;
  event: string;
  guid: string;
  status: string;
  url: string | null;
  details: Record<string, unknown> | null;
  current?: number;
  total?: number;
}

export interface PlatformInfo {
  id: string;
  name: string;
  url_patterns: string[];
  supported_options: string[];
  description: string;
  example_urls: string[];
  export_types: string[];
}
