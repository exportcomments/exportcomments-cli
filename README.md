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
      "args": ["-y", "exportcomments-cli"],
      "env": {
        "EXPORTCOMMENTS_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

### Setup with Claude Code

```bash
claude mcp add exportcomments -- npx -y exportcomments-cli
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `export_comments` | Create an export job for a URL (supports `wait` param) |
| `check_export` | Check job status by GUID |
| `list_exports` | List all export jobs with pagination |
| `download_export` | Download raw JSON data for a completed job |
| `detect_platform` | Identify platform from a URL and show available options |
| `list_platforms` | List all 33+ supported platforms |

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
