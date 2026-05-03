#!/usr/bin/env node

// ── ExportComments CLI ──
// A command-line tool for the ExportComments.com API, optimized for AI agent usage.
// All commands output structured JSON by default for easy parsing.

import { Command } from 'commander';
import { ExportCommentsClient } from './client.js';
import { PLATFORMS, detectPlatform } from './platforms.js';
import type { ExportOptions, JobResponse, CLIOutput, SocketEvent } from './types.js';
import { waitForJobRealtime } from './realtime.js';

// ── Helpers ──

function getToken(opts: { token?: string }): string {
  const token = opts.token ?? process.env.EXPORTCOMMENTS_API_TOKEN;
  if (!token) {
    output({
      ok: false,
      error: 'Missing API token. Set EXPORTCOMMENTS_API_TOKEN env var or use --token <token>',
      detail: 'Get your API token at https://app.exportcomments.com/user/api',
    });
    process.exit(1);
  }
  return token;
}

function getClient(opts: { token?: string; baseUrl?: string }): ExportCommentsClient {
  return new ExportCommentsClient(getToken(opts), opts.baseUrl);
}

function output(data: CLIOutput | unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function exitWithResult(result: CLIOutput): void {
  output(result);
  process.exit(result.ok ? 0 : 1);
}

function parseTimestamp(dateStr: string): number {
  const ts = Date.parse(dateStr);
  if (isNaN(ts)) {
    output({ ok: false, error: `Invalid date: "${dateStr}". Use ISO 8601 format (e.g., 2024-01-15)` });
    process.exit(1);
  }
  return Math.floor(ts / 1000);
}

// ── CLI Setup ──

const program = new Command();

program
  .name('exportcomments')
  .description(
    `ExportComments.com CLI - Export comments and reviews from 40+ social media and review platforms.

This CLI is optimized for AI agent usage. All commands output structured JSON.

Authentication:
  Set the EXPORTCOMMENTS_API_TOKEN environment variable, or pass --token <token> to each command.
  Get your API token at: https://app.exportcomments.com/user/api

Supported platforms:
  Instagram, YouTube, TikTok, Facebook, Twitter/X, LinkedIn, Reddit, Threads,
  Trustpilot, Yelp, Amazon, Google Reviews, TripAdvisor, App Store, Play Store,
  Twitch, Discord, Vimeo, IMDb, AliExpress, Shopee, Etsy, Walmart, Best Buy,
  eBay, Flipkart, Product Hunt, Airbnb, Steam, VK, Lazada, Change.org, and more.

Examples:
  $ exportcomments export https://www.instagram.com/p/ABC123/
  $ exportcomments export https://www.youtube.com/watch?v=dQw4w9WgXcQ --replies --limit 500
  $ exportcomments export https://www.amazon.com/dp/B08N5WRWNW --wait --download
  $ exportcomments status <guid>
  $ exportcomments list --page 1 --limit 10
  $ exportcomments download <guid>
  $ exportcomments download <guid> --json
  $ exportcomments platforms
  $ exportcomments platforms --detect https://www.youtube.com/watch?v=abc
  $ exportcomments ping`
  )
  .version('1.0.0')
  .option('--token <token>', 'API token (or set EXPORTCOMMENTS_API_TOKEN env var)')
  .option('--base-url <url>', 'Override API base URL');

// ── export command ──

program
  .command('export')
  .alias('create')
  .description('Create a new export job for a URL. Returns the job GUID for status tracking.')
  .argument('<url>', 'The URL to export comments/reviews from')
  .option('--replies', 'Include replies to comments')
  .option('--limit <n>', 'Maximum number of items to export', parseInt)
  .option('--min-date <date>', 'Minimum date filter (ISO 8601, e.g., 2024-01-15)')
  .option('--max-date <date>', 'Maximum date filter (ISO 8601, e.g., 2024-06-30)')
  .option('--vpn <country>', 'Use VPN with specified country (e.g., "Norway")')
  .option('--cookies <json>', 'Cookies as JSON string (e.g., \'{"sessionid":"abc123"}\')')
  .option('--tweets', 'Include tweets (Twitter/X)')
  .option('--followers', 'Export followers (Twitter/X)')
  .option('--following', 'Export following list (Twitter/X)')
  .option('--likes', 'Export likes')
  .option('--shares', 'Include shares data')
  .option('--advanced', 'Enable advanced export features')
  .option('--facebook-ads', 'Include Facebook ads data')
  .option('--wait', 'Wait for export to complete (polls every 5s, timeout 10min)')
  .option('--wait-interval <ms>', 'Polling interval in milliseconds (default: 5000)', parseInt)
  .option('--wait-timeout <ms>', 'Maximum wait time in milliseconds (default: 600000)', parseInt)
  .option('--realtime', 'Use WebSocket for real-time updates instead of polling (implies --wait)')
  .option('--download', 'Download the file after export completes (implies --wait)')
  .option('--download-json', 'Download the raw JSON data after export completes (implies --wait)')
  .action(async (url: string, opts) => {
    const globalOpts = program.opts();
    const client = getClient(globalOpts);

    // Build options
    const options: ExportOptions = {};
    if (opts.replies) options.replies = true;
    if (opts.limit) options.limit = opts.limit;
    if (opts.minDate) options.minTimestamp = parseTimestamp(opts.minDate);
    if (opts.maxDate) options.maxTimestamp = parseTimestamp(opts.maxDate);
    if (opts.vpn) options.vpn = opts.vpn;
    if (opts.cookies) {
      try {
        options.cookies = JSON.parse(opts.cookies);
      } catch {
        exitWithResult({ ok: false, error: 'Invalid --cookies JSON. Use format: \'{"key":"value"}\'' });
        return;
      }
    }
    if (opts.tweets) options.tweets = true;
    if (opts.followers) options.followers = true;
    if (opts.following) options.following = true;
    if (opts.likes) options.likes = true;
    if (opts.shares) options.shares = true;
    if (opts.advanced) options.advanced = true;
    if (opts.facebookAds) options.facebookAds = true;

    // Create the job
    const result = await client.createJob({
      url,
      options: Object.keys(options).length > 0 ? options : undefined,
    });

    if (!result.ok) {
      exitWithResult(result);
      return;
    }

    const guid = result.data!.guid;

    // If --wait, --realtime, or --download, wait until done
    if (opts.wait || opts.realtime || opts.download || opts.downloadJson) {
      let waitResult: CLIOutput<JobResponse>;

      if (opts.realtime) {
        waitResult = await waitForJobRealtime(getToken(program.opts()), guid, {
          timeoutMs: opts.waitTimeout,
          onEvent: (_event: string, data: SocketEvent) => {
            process.stderr.write(
              `\r[realtime] status=${data.status} exported=${data.current ?? 0}/${data.total ?? '?'}  `
            );
          },
        });

        // Fall back to polling if WebSocket fails to connect
        if (!waitResult.ok && (waitResult.error_code === 'WS_CONNECTION_TIMEOUT' || waitResult.error_code === 'WS_AUTH_FAILED' || waitResult.error_code === 'WS_ERROR')) {
          process.stderr.write(`\n[realtime] WebSocket failed (${waitResult.error}), falling back to polling...\n`);
          waitResult = await client.waitForJob(guid, {
            intervalMs: opts.waitInterval,
            timeoutMs: opts.waitTimeout,
            onPoll: (job) => {
              process.stderr.write(
                `\r[polling] status=${job.status} exported=${job.total_exported ?? 0}/${job.total ?? '?'}  `
              );
            },
          });
        }
      } else {
        waitResult = await client.waitForJob(guid, {
          intervalMs: opts.waitInterval,
          timeoutMs: opts.waitTimeout,
          onPoll: (job) => {
            process.stderr.write(
              `\r[polling] status=${job.status} exported=${job.total_exported ?? 0}/${job.total ?? '?'}  `
            );
          },
        });
      }
      process.stderr.write('\n');

      if (!waitResult.ok) {
        exitWithResult(waitResult);
        return;
      }

      const job = waitResult.data!;

      // Download if requested
      if (job.status === 'done' && (opts.download || opts.downloadJson)) {
        if (opts.downloadJson) {
          const jsonResult = await client.downloadJson(guid);
          exitWithResult(jsonResult);
          return;
        } else {
          const dlResult = await client.downloadJob(guid);
          if (!dlResult.ok) {
            exitWithResult(dlResult);
            return;
          }
          exitWithResult({
            ok: true,
            data: {
              ...job,
              downloaded_to: dlResult.data!.path,
              downloaded_bytes: dlResult.data!.bytes,
            },
          });
          return;
        }
      }

      exitWithResult(waitResult);
      return;
    }

    exitWithResult(result);
  });

// ── status command ──

program
  .command('status')
  .alias('check')
  .description('Check the status of an export job by its GUID.')
  .argument('<guid>', 'The job GUID returned by the export command')
  .option('--wait', 'Wait for export to complete')
  .option('--wait-interval <ms>', 'Polling interval in milliseconds (default: 5000)', parseInt)
  .option('--wait-timeout <ms>', 'Maximum wait time in milliseconds (default: 600000)', parseInt)
  .option('--realtime', 'Use WebSocket for real-time updates instead of polling (implies --wait)')
  .action(async (guid: string, opts) => {
    const globalOpts = program.opts();
    const client = getClient(globalOpts);

    if (opts.wait || opts.realtime) {
      let result: CLIOutput<JobResponse>;

      if (opts.realtime) {
        result = await waitForJobRealtime(getToken(globalOpts), guid, {
          timeoutMs: opts.waitTimeout,
          onEvent: (_event: string, data: SocketEvent) => {
            process.stderr.write(
              `\r[realtime] status=${data.status} exported=${data.current ?? 0}/${data.total ?? '?'}  `
            );
          },
        });

        // Fall back to polling if WebSocket fails to connect
        if (!result.ok && (result.error_code === 'WS_CONNECTION_TIMEOUT' || result.error_code === 'WS_AUTH_FAILED' || result.error_code === 'WS_ERROR')) {
          process.stderr.write(`\n[realtime] WebSocket failed (${result.error}), falling back to polling...\n`);
          result = await client.waitForJob(guid, {
            intervalMs: opts.waitInterval,
            timeoutMs: opts.waitTimeout,
            onPoll: (job) => {
              process.stderr.write(
                `\r[polling] status=${job.status} exported=${job.total_exported ?? 0}/${job.total ?? '?'}  `
              );
            },
          });
        }
      } else {
        result = await client.waitForJob(guid, {
          intervalMs: opts.waitInterval,
          timeoutMs: opts.waitTimeout,
          onPoll: (job) => {
            process.stderr.write(
              `\r[polling] status=${job.status} exported=${job.total_exported ?? 0}/${job.total ?? '?'}  `
            );
          },
        });
      }
      process.stderr.write('\n');
      exitWithResult(result);
    } else {
      const result = await client.getJob(guid);
      exitWithResult(result);
    }
  });

// ── list command ──

program
  .command('list')
  .alias('ls')
  .description('List all export jobs with pagination.')
  .option('--page <n>', 'Page number (default: 1)', parseInt, 1)
  .option('--limit <n>', 'Items per page (default: 20)', parseInt, 20)
  .action(async (opts) => {
    const globalOpts = program.opts();
    const client = getClient(globalOpts);
    const result = await client.listJobs(opts.page, opts.limit);
    exitWithResult(result);
  });

// ── download command ──

program
  .command('download')
  .alias('dl')
  .description('Download the export file (Excel/CSV) or raw JSON data for a completed job.')
  .argument('<guid>', 'The job GUID to download')
  .option('--json', 'Download the raw JSON data instead of the formatted file')
  .option('-o, --output <path>', 'Output file path (default: auto-detected from server)')
  .action(async (guid: string, opts) => {
    const globalOpts = program.opts();
    const client = getClient(globalOpts);

    if (opts.json) {
      const result = await client.downloadJson(guid);
      exitWithResult(result);
    } else {
      const result = await client.downloadJob(guid);
      exitWithResult(result);
    }
  });

// ── platforms command ──

program
  .command('platforms')
  .description(
    'List all supported platforms with URL patterns, options, and example URLs. ' +
    'Use --detect <url> to identify which platform a URL belongs to.'
  )
  .option('--detect <url>', 'Detect which platform a URL belongs to')
  .option('--id <platform_id>', 'Get info for a specific platform (e.g., "instagram")')
  .action(async (opts) => {
    if (opts.detect) {
      const platform = detectPlatform(opts.detect);
      if (platform) {
        exitWithResult({ ok: true, data: platform });
      } else {
        exitWithResult({
          ok: false,
          error: `Could not detect platform for URL: ${opts.detect}`,
          detail: 'The URL may not be from a supported platform. Use "exportcomments platforms" to see all supported platforms.',
        });
      }
      return;
    }

    if (opts.id) {
      const platform = PLATFORMS.find((p) => p.id === opts.id);
      if (platform) {
        exitWithResult({ ok: true, data: platform });
      } else {
        exitWithResult({
          ok: false,
          error: `Unknown platform: ${opts.id}`,
          detail: `Available platforms: ${PLATFORMS.map((p) => p.id).join(', ')}`,
        });
      }
      return;
    }

    exitWithResult({
      ok: true,
      data: {
        total: PLATFORMS.length,
        platforms: PLATFORMS,
      },
    });
  });

// ── ping command ──

program
  .command('ping')
  .description('Check API connectivity and authentication.')
  .action(async () => {
    const globalOpts = program.opts();
    const client = getClient(globalOpts);
    const result = await client.ping();
    exitWithResult(result);
  });

// ── Run ──

program.parseAsync(process.argv).catch((err) => {
  output({ ok: false, error: err.message ?? String(err) });
  process.exit(1);
});
