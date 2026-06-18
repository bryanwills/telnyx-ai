---
name: telnyx-cursor-mcp-setup
description: >-
  Configure Cursor MCP access for Telnyx using the Telnyx agent CLI and the
  canonical hosted MCP endpoint.
metadata:
  author: telnyx
  product: ide-integrations
  language: cursor
  capability: setup_cursor_mcp
---

# Telnyx Cursor MCP Setup

Use this skill when a user wants to connect Cursor to Telnyx through MCP without manually editing `.cursor/mcp.json`.

## Install this skill

```bash
npx skills add team-telnyx/ai --skill telnyx-cursor-mcp-setup --agent cursor
```

## Prerequisites

- Telnyx API key in `TELNYX_API_KEY`.
- Cursor installed for the target project.
- Node.js 18 or newer for `npx`.

## Configure Cursor MCP

Run the repo-local Telnyx agent CLI from the workspace that Cursor should open:

```bash
npx @telnyx/agent-cli setup-cursor-mcp --dir .
```

The command creates or merges `.cursor/mcp.json` and configures the canonical Telnyx MCP server:

```json
{
  "mcpServers": {
    "telnyx": {
      "type": "http",
      "url": "https://api.telnyx.com/v2/mcp",
      "headers": {
        "Authorization": "Bearer ${env:TELNYX_API_KEY}"
      }
    }
  }
}
```

## Safe update behavior

- Preserve existing MCP servers and unrelated config keys.
- Update an existing Telnyx entry when it already targets `https://api.telnyx.com/v2/mcp`.
- Stop on malformed JSON so the user can repair the file.
- Stop on a conflicting Telnyx entry unless the user explicitly chooses replacement.

Use `--force` only when the user confirms that replacing the existing `mcpServers.telnyx` entry is intended:

```bash
npx @telnyx/agent-cli setup-cursor-mcp --dir . --force
```

Use `--json` for automation:

```bash
npx @telnyx/agent-cli setup-cursor-mcp --dir . --json
```

## Verify

After setup, check `.cursor/mcp.json` contains:

- `mcpServers.telnyx.type` set to `http`
- `mcpServers.telnyx.url` set to `https://api.telnyx.com/v2/mcp`
- `mcpServers.telnyx.headers.Authorization` set to `Bearer ${env:TELNYX_API_KEY}`

Then restart Cursor or reload the workspace so it detects the MCP server.
