# Cursor MCP Setup

> Configure Cursor to use the Telnyx MCP server for authenticated, agent-friendly access to Telnyx APIs.

## Prerequisites

- Telnyx API key ([get one free](https://telnyx.com/agent-signup.md))
- Node.js 18 or newer
- Cursor installed for the workspace you want to configure
- `TELNYX_API_KEY` exported in your shell or provided in Cursor's environment

## Quick Start

Use the Telnyx agent CLI to create or merge `.cursor/mcp.json` instead of hand-editing JSON:

```bash
npx @telnyx/agent-cli setup-cursor-mcp --dir .
```

The command writes a `telnyx` MCP server entry that targets the canonical endpoint:

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

If `.cursor/mcp.json` already contains other MCP servers, the CLI preserves them and adds or updates only the Telnyx entry. If the existing `telnyx` entry points somewhere else, rerun with `--force` only after confirming you want to replace it:

```bash
npx @telnyx/agent-cli setup-cursor-mcp --dir . --force
```

Install the matching agent skill for Cursor when you want runnable setup guidance available inside the IDE:

```bash
npx skills add team-telnyx/ai --skill telnyx-cursor-mcp-setup --agent cursor
```

## API Reference

### Telnyx MCP server

**`POST /v2/mcp`**

Cursor communicates with Telnyx through the hosted MCP endpoint using a bearer token. The CLI configures Cursor to read that token from `TELNYX_API_KEY` at runtime.

```bash
curl -X POST "https://api.telnyx.com/v2/mcp" \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### CLI command

**`telnyx-agent setup-cursor-mcp`**

| Option | Description |
|--------|-------------|
| `--dir <path>` | Project directory where `.cursor/mcp.json` should be created or merged. Defaults to the current working directory. |
| `--force` | Replace a conflicting existing `mcpServers.telnyx` entry. |
| `--json` | Return machine-readable status, path, server name, and readiness details. |

## Python example

Use Python to verify the generated Cursor MCP config before opening the workspace:

```python
import json
from pathlib import Path

config_path = Path(".cursor/mcp.json")
config = json.loads(config_path.read_text())
telnyx = config["mcpServers"]["telnyx"]

assert telnyx["url"] == "https://api.telnyx.com/v2/mcp"
assert telnyx["headers"]["Authorization"] == "Bearer ${env:TELNYX_API_KEY}"
```

## TypeScript example

Use TypeScript to check the generated file in project automation:

```typescript
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(".cursor/mcp.json", "utf8"));
const telnyx = config.mcpServers.telnyx;

if (telnyx.url !== "https://api.telnyx.com/v2/mcp") {
  throw new Error("Cursor is not configured for the canonical Telnyx MCP URL");
}
```

## Troubleshooting

- If Cursor cannot authenticate, confirm `TELNYX_API_KEY` is available to the Cursor process.
- If the CLI reports malformed JSON, fix `.cursor/mcp.json` and rerun the command.
- If the CLI reports a conflicting Telnyx MCP entry, inspect the current value and use `--force` only when replacing it is intentional.
