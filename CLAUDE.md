# ExportComments CLI

A command-line tool for the ExportComments.com API. Designed for AI agent usage with structured JSON output.

## Quick Start

```bash
export EXPORTCOMMENTS_API_TOKEN="your-token-here"
exportcomments export https://www.instagram.com/p/ABC123/ --wait
```

## Architecture

- `src/cli.ts` - Main CLI entry point with all commands (Commander.js)
- `src/client.ts` - HTTP API client wrapping ExportComments v3 endpoints
- `src/platforms.ts` - Platform metadata (40+ platforms with URL patterns, options, examples)
- `src/types.ts` - TypeScript type definitions

## API

Base URL: `https://exportcomments.com/api/v3`
Auth header: `X-AUTH-TOKEN: <token>`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v3/job | Create export job |
| GET | /api/v3/job/{guid} | Check job status |
| GET | /api/v3/jobs | List all jobs |
| GET | /api/v3/job/{guid}/download | Download export file |
| GET | /api/v3/job/{guid}/json | Download raw JSON |
| GET | /api/v1/ping | Health check |

## Output Format

All commands return JSON with this envelope:

```json
{"ok": true, "data": { ... }}
{"ok": false, "error": "message", "error_code": "CODE", "detail": "..."}
```

## Job Statuses

- `queueing` - Job is queued
- `progress` - Job is being processed
- `done` - Job completed successfully
- `error` - Job failed

## Build

```bash
npm install && npm run build
```

## Development

```bash
npx tsx src/cli.ts export https://...
```
