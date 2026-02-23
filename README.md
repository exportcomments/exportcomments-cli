# ExportComments CLI

Command-line tool for the [ExportComments.com](https://exportcomments.com) API. Export comments and reviews from 40+ social media and review platforms.

**Designed for AI agent usage** - all commands output structured JSON for easy parsing by LLMs and automation tools.

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

## AI Agent Usage

This CLI is specifically designed for use by AI agents (Claude, GPT, etc.):

1. **Structured JSON output** - Every command returns parseable JSON with `ok` boolean
2. **Self-documenting** - `platforms` command provides full metadata for URL construction
3. **Polling built-in** - `--wait` flag handles polling logic internally
4. **Non-zero exit codes** - Failed commands exit with code 1
5. **Progress on stderr** - Polling progress goes to stderr, keeping stdout clean for JSON

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
