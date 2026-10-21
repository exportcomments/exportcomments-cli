# ExportComments CLI & MCP Server

Command-line tool and [MCP server](https://modelcontextprotocol.io) for the [ExportComments.com](https://exportcomments.com) API. Export comments and reviews from 40+ social media and review platforms.

**Designed for AI agent usage** - includes an MCP server for native AI integration (Claude, Cursor, Windsurf) and a CLI with structured JSON output.

## Installation

```bash
npm install -g exportcomments-cli
```

Or use directly with npx:

```bash
npx exportcomments-cli export https://www.instagram.com/p/ABC123/
```

## Authentication

Get your API token at [app.exportcomments.com/user/api](https://app.exportcomments.com/user/api).

```bash
# Set as environment variable (recommended)
export EXPORTCOMMENTS_API_TOKEN="your-token-here"

# Or pass with each command
exportcomments --token "your-token-here" export https://...
```

## Commands

### `export` - Create an export job

```bash
# Basic export
exportcomments export https://www.instagram.com/p/ABC123/

# With options
exportcomments export https://www.youtube.com/watch?v=dQw4w9WgXcQ --replies --limit 500

# Wait for completion and download
exportcomments export https://www.amazon.com/dp/B08N5WRWNW --wait --download

# Get raw JSON data
exportcomments export https://www.trustpilot.com/review/example.com --wait --download-json

# Filter by date range
exportcomments export https://www.reddit.com/r/sub/comments/abc123/ --min-date 2024-01-01 --max-date 2024-06-30

# Twitter/X specific
exportcomments export https://x.com/username --tweets --followers --limit 1000
```

**Options:**

| Flag | Description |
|------|-------------|
| `--replies` | Include replies to comments |
| `--limit <n>` | Maximum number of items to export |
| `--min-date <date>` | Start date filter (ISO 8601) |
| `--max-date <date>` | End date filter (ISO 8601) |
| `--vpn <country>` | Use VPN with specified country |
| `--cookies <json>` | Cookies as JSON string |
| `--tweets` | Include tweets (Twitter/X) |
| `--followers` | Export followers (Twitter/X) |
| `--following` | Export following list (Twitter/X) |
| `--likes` | Export likes |
| `--shares` | Include shares data |
| `--advanced` | Enable advanced export features |
| `--facebook-ads` | Include Facebook ads data |
| `--wait` | Wait for completion (polls every 5s) |
| `--wait-interval <ms>` | Custom polling interval |
| `--wait-timeout <ms>` | Custom timeout (default: 600000) |
| `--download` | Download file when done (implies --wait) |
| `--download-json` | Download raw JSON when done (implies --wait) |

### `status` - Check job status

```bash
exportcomments status <guid>

# Wait for completion
exportcomments status <guid> --wait
```

### `list` - List export jobs

```bash
exportcomments list
exportcomments list --page 2 --limit 10
```

### `download` - Download export file

```bash
# Download formatted file (Excel/CSV)
exportcomments download <guid>

# Download raw JSON data
exportcomments download <guid> --json
```

### `platforms` - List supported platforms

```bash
# List all platforms
exportcomments platforms

# Detect platform from URL
exportcomments platforms --detect "https://www.youtube.com/watch?v=abc"

# Get specific platform info
exportcomments platforms --id instagram
```

### `ping` - Check API connectivity

```bash
exportcomments ping
```

## Output Format

All commands output JSON with a consistent envelope:

```json
// Success
{
  "ok": true,
  "data": { ... }
}

// Error
{
  "ok": false,
  "error": "Human-readable error message",
  "error_code": "MACHINE_READABLE_CODE",
  "detail": "Additional context"
}
```

## Supported Platforms

| Category | Platforms |
|----------|-----------|
| **Social Media** | Instagram, YouTube, TikTok, Facebook, Twitter/X, LinkedIn, Reddit, Threads, VK |
| **Video** | YouTube, Vimeo, Twitch |
| **Messaging** | Discord |
| **E-commerce** | Amazon, AliExpress, Shopee, Lazada, Flipkart, Etsy, Walmart, Best Buy, eBay |
| **Reviews** | Trustpilot, Yelp, Google Reviews, TripAdvisor, IMDb |
| **App Stores** | Apple App Store, Google Play Store |
| **Other** | Disqus, Product Hunt, Airbnb, Steam, Change.org |

## Job Statuses

| Status | Description |
|--------|-------------|
| `queueing` | Job is queued for processing |
| `progress` | Job is being processed |
| `done` | Job completed successfully |
| `error` | Job failed with an error |

## MCP Server (for AI Agents)

The MCP server gives AI assistants (Claude, Cursor, Windsurf, etc.) native access to ExportComments tools.

### Setup with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "exportcomments": {
      "command": "npx",
      "args": ["-y", "--package", "exportcomments-cli", "exportcomments-mcp"],
      "env": {
        "EXPORTCOMMENTS_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

> The package ships two binaries — `exportcomments-cli` (CLI) and
> `exportcomments-mcp` (MCP stdio server). The `--package … exportcomments-mcp`
> form tells `npx` to install `exportcomments-cli` but execute the MCP
> binary inside it, so the process stays alive and serves MCP over stdio.

### Setup with Claude Code

```bash
claude mcp add exportcomments -- npx -y --package exportcomments-cli exportcomments-mcp
```

### Available MCP Tools

Fifty tools, three resources and seven guided prompts. Everything marked *all tiers* works on Free and Personal plans too.

**Exports**

| Tool | Description |
|------|-------------|
| `export_comments` | Create an export job for a URL (supports `wait` / `realtime`) |
| `check_export` | Job status by GUID, optionally waiting for completion |
| `list_exports` | List export jobs with pagination |
| `download_export` | Full data of a finished export — JSON for Premium/Business, CSV for Free/Personal |
| `export_many_urls` / `check_batch_export` | Bulk: one job per URL in a batch, one ZIP at the end |
| `retry_export` / `stop_export` | Retry a failed job, stop a running one |
| `export_diagnostics` | Status, customer-safe error, warnings, cap-by-limit detection, next-step hint |
| `detect_platform` / `list_platforms` | Platform detection and the full platform catalogue |

**Server-side insights** (*all tiers*; the dataset never leaves the server, so these work on 50k-comment exports)

| Tool | Description |
|------|-------------|
| `export_stats` | Totals, per-day/hour/weekday, top authors / hashtags / mentions / words, likes and length distributions, sentiment and rating distributions |
| `search_export` | Filter rows by words, regex, author, likes, date range, sentiment, rating, links, questions; sort + paginate |
| `sample_export` | N rows: random (seedable), top_likes, latest, oldest, longest |
| `export_sentiment` | Sentiment distribution, net score and examples over a bounded subset |
| `compare_exports` | Diff two exports: added/removed comments, author churn, metric deltas |
| `export_analytics_report` | Dashboard analytics (heatmaps, engagement series) for profile/hashtag/channel exports |

**Giveaways**

| Tool | Description |
|------|-------------|
| `pick_random_winners` | Seeded, reproducible server-side draw with mention/hashtag/text/exclude/min-likes filters and a verification hash (*all tiers*) |
| `publish_giveaway_result` | Publish a winner to a public verification page and get its share URL |

**Workflows** (Premium/Business)

`list_workflows`, `get_workflow`, `workflow_pipeline_info`, `create_workflow`, `update_workflow`, `delete_workflow`, `pause_workflow`, `resume_workflow`, `run_workflow` — multi-step pipelines such as "latest posts of a profile → comments of each post".

**Schedules and webhooks**

`list_schedules`, `create_schedule`, `update_schedule`, `delete_schedule`, `run_schedule`, `pause_schedule`, `resume_schedule`, `list_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook`, `toggle_webhook`, `test_webhook`.

**Account**

`get_my_profile`, `get_my_quota`, `get_my_limits`, `get_usage_history`, `get_account_analytics`, `list_invoices`, `get_extra_capacity_checkout` (returns a checkout link, never charges), `get_export_notification`, `toggle_export_notification`.

### Resources

| URI | Content |
|-----|---------|
| `exportcomments://platforms` | Supported platforms reference |
| `exportcomments://exports` | The 20 most recent exports of the connected account |
| `exportcomments://export/{guid}` | One export: diagnostics + stats + a 10-row sample (GUID autocompletes) |

### Prompts

`analyze_export`, `client_report`, `pick_giveaway_winners`, `find_leads_and_questions`, `compare_two_exports`, `monitor_source`, `profile_posts_and_comments` — guided recipes that appear as quick actions in MCP clients.

### Run Directly

```bash
EXPORTCOMMENTS_API_TOKEN="your-token" exportcomments-mcp
```

## CLI Usage

The CLI outputs structured JSON for scripting and automation.

### Example AI workflow

```bash
# 1. Check what platform a URL belongs to
exportcomments platforms --detect "https://www.instagram.com/p/ABC123/"

# 2. Create an export and wait for it
exportcomments export "https://www.instagram.com/p/ABC123/" --replies --wait

# 3. If the export succeeded, download the raw data
exportcomments download <guid> --json
```

## Development

```bash
git clone https://github.com/exportcomments/exportcomments-cli.git
cd exportcomments-cli
npm install
npm run build

# Run in development
npx tsx src/cli.ts --help
```

## License

MIT
