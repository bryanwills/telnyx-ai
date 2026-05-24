# Telnyx AI

This repo is the one-stop shop for AI Agents and AI-first developers building with Telnyx.

> [!NOTE]
> This repository is a work in progress under active development. We are continuously improving based on testing and feedback. Contributions and feedback encouraged!

## Table of contents

- [Agent Discovery](#agent-discovery) - canonical agent-first entry points, auth, OpenAPI, MCP, pricing, and webhooks.

- [Telnyx Plugins](#plugins) - Install the Telnyx plugin for Claude Code, Cursor, or Gemini CLI to give your coding assistant Telnyx MCP server access and Telnyx Agent Skills.

- [Agent Toolkit](#agent-toolkit) - integrate Telnyx APIs with popular agent frameworks including OpenAI's Agent SDK, LangChain, CrewAI, and Vercel's AI SDK through function calling — available in [Python](#python) and [TypeScript](#typescript).
  
- [Agent Skills](#agent-skills) - give AI coding assistants accurate, up-to-date context about Telnyx APIs and SDKs.
  
- [Agent CLI](#agent-cli) - provision and build on Telnyx infrastructure in a single command.

- [Model Context Protocol (MCP)](#model-context-protocol-mcp) - use Telnyx's generic API MCP proxy or app-layer MCP Apps.

- [Guides](#guides) - step-by-step tutorials for common workflows
 

## Agent Discovery

Start agent discovery at `https://telnyx.com/agents/start`. The surfaces below are the canonical repo-owned or repo-linked entry points that agents should use without guessing.

| Surface | URL | What it is for |
| --- | --- | --- |
| Agent fast path | `https://telnyx.com/agents/start` | Primary discovery entry point for runtime agents |
| Agent manifest | `https://telnyx.com/.well-known/agent-card.json` | Agent identity, capabilities, and links |
| Agent access | `https://telnyx.com/.well-known/agent-access.json` | Signup and auth contract |
| Agent skills index | `https://telnyx.com/.well-known/agent-skills/index.json` | Published skill catalog |
| OpenAPI spec | `https://telnyx.com/.well-known/openapi.json` | Machine-readable API surface |
| MCP server card | `https://telnyx.com/.well-known/mcp/server-card.json` | MCP metadata and connection details |
| Remote MCP endpoint | `https://api.telnyx.com/v2/mcp` | Bearer-auth MCP server |
| Capability index | `https://telnyx.com/ai/capabilities.json` | Machine-readable capability map |
| Pricing | `https://telnyx.com/ai/pricing.json` | Machine-readable pricing surface |
| Webhooks guide | [`/guides/webhooks.md`](/guides/webhooks.md) | Webhook configuration, signature verification, and delivery debugging |
| Auth guide | `https://telnyx.com/agent-signup.md` | Programmatic API-key signup for agents |

## Plugins

Install the unified Telnyx plugin to give your AI coding assistant Telnyx MCP server access and 235+ Agent Skills covering messaging, voice, numbers, AI, IoT, WebRTC, Twilio migration, and more.

Empowers coding agents to generate correct, production-ready code without relying on pre-training or fragile doc retrieval.

### Claude Code Plugin

**Step 1.** Add the Telnyx marketplace (one-time setup):

```bash
/plugin marketplace add team-telnyx/ai
```

**Step 2.** Install the plugin:

```bash
/plugin install telnyx@telnyx
```

### Gemini CLI extension

 ```sh
  gemini extensions install https://github.com/team-telnyx/ai
```

### OpenCode

Install the Telnyx plugin for [OpenCode](https://opencode.ai) to add Telnyx as a model provider with automatic auth and a TUI for managing hosted models.

```sh
# Local (current project only)
opencode plugin @telnyx/opencode

# Global (all projects)
opencode plugin -g @telnyx/opencode
```

See [`plugins/opencode/README.md`](/plugins/opencode/README.md) for full setup and configuration.

### Cursor                                                

> [!NOTE]
> Note: Our Cursor Marketplace listing is pending. 

In the meantime, install skills via the [Skills CLI](#agent-skills).

Add the Telnyx MCP server to your project's `.cursor/mcp.json`:                                                                                                
```json       
  {                                                         
    "mcpServers": {
      "telnyx": {
        "type": "http",
        "url": "https://api.telnyx.com/v2/mcp"
      }
    }
  }
```

## Agent Toolkit

Integrate Telnyx APIs with popular agent frameworks through function calling — available in [Python](/tools/python) and [TypeScript](/tools/typescript).

### Python

```sh
pip install telnyx-agent-toolkit
```

```python
from telnyx_agent_toolkit.openai.toolkit import TelnyxAgentToolkit

toolkit = TelnyxAgentToolkit(
    api_key="KEY_...",
    configuration={
        "actions": {
            "messaging": {"send_sms": True},
            "numbers": {"search_phone_numbers": True, "buy_phone_number": True}
        }
    }
)

tools = toolkit.get_openai_tools()
```

Works with OpenAI's Agent SDK, LangChain, and CrewAI. See [Python docs](/tools/python) for full usage and [examples](/tools/python/examples).

### TypeScript

```sh
npm install @telnyx/agent-toolkit
```

```typescript
import { TelnyxAgentToolkit } from "@telnyx/agent-toolkit/langchain";

const toolkit = new TelnyxAgentToolkit(process.env.TELNYX_API_KEY!, {
  configuration: {
    actions: {
      messaging: { send_sms: true },
      numbers: { search_phone_numbers: true, buy_phone_number: true },
    },
  },
});

const tools = toolkit.getLangChainTools();
```

Works with LangChain and Vercel's AI SDK. See [TypeScript docs](/tools/typescript) for full usage.
 for the full list of commands and options.

## Agent Skills

Install individual skills for your coding assistant via the [Skills CLI](https://github.com/vercel-labs/skills):

```sh
npx skills add team-telnyx/ai --skill <SKILL> --agent <AGENT>
```

> [!NOTE]
> See [Skills](/skills/README.md) for full install instrcuctions and comprehensive list of available skills


## Agent CLI

Composite commands that reduce multi-step Telnyx workflows to a single command. Built for AI agents and developers who want to provision infrastructure without orchestrating multiple API calls.

```sh
telnyx-agent setup-sms        # Buy number + create messaging profile + assign
telnyx-agent setup-voice       # Create SIP connection + buy number + assign
telnyx-agent setup-ai          # Create AI assistant + buy number + wire together
telnyx-agent setup-porting     # Check portability + create porting order + submit
telnyx-agent status            # Account health overview
```

Every command supports `--json` for machine-readable output.

See [Agent CLI](/cli)


## Model Context Protocol (MCP)

Telnyx hosts a remote MCP server at `https://api.telnyx.com/v2/mcp`. The machine-readable MCP server card lives at `https://telnyx.com/.well-known/mcp/server-card.json`.

To run a local Telnyx MCP server using npx:

```sh
npx -y @telnyx/mcp --api-key=YOUR_TELNYX_API_KEY
```

See [MCP](/tools/mcp) for more details about the generic API MCP proxy.

### MCP Apps

[`tools/mcp-apps`](/tools/mcp-apps) contains app-layer MCP servers with MCP Apps UI resources for focused Telnyx workflows. These are separate from the generic `@telnyx/mcp` proxy above.

Current apps:

- Governed Communications (`tools/mcp-apps/apps/governed-communications`)
- Number Intelligence (`tools/mcp-apps/apps/number-intelligence`)
- Usage & Cost Explorer (`tools/mcp-apps/apps/usage-cost-explorer`)
- Voice Monitor (`tools/mcp-apps/apps/voice-monitor`)

From `tools/mcp-apps`, use `npm install`, `npm run typecheck`, `npm run build`, and `npm test`.

The public docs-facing MCP Apps discovery contract is intended to live on `https://developers.telnyx.com` with these proof URLs:

- `https://developers.telnyx.com/.well-known/mcp-app-registry.json`
- `https://developers.telnyx.com/.well-known/mcp-apps.json`
- `https://developers.telnyx.com/apps/number-intelligence`
- `https://developers.telnyx.com/apps/number-intelligence/mcp`

The registry and per-app discovery document are meant to stay machine-readable and lightweight: they expose bearer-auth expectations, exact MCP URLs, tool names, and `ui://` resources without requiring an agent to parse the heavier docs shell first.

From the repo root, `npm run verify:live-docs-mcp-apps` probes that hosted surface and reports whether the public registry, per-app discovery document, tool annotations, and `ui://` resources are actually visible end-to-end.
## Guides

Curl-first operational guides for common Telnyx workflows — SMS messaging, voice call control, AI assistants, phone numbers, porting, verification, webhooks, 10DLC registration, WireGuard networking, x402 payments, Edge Compute handoff patterns, and [evidence handoff / escalation runbooks](/guides/evidence-handoff.md).

For Edge Compute specifically, the goal is to make the handoff testable fast: start from a real `telnyx-edge` example, deploy it, and let `team-telnyx/ai` orchestrate against that live endpoint.

See [Guides](/guides) for the full list.

## Edge Compute

`team-telnyx/ai` does not currently own native Edge Compute lifecycle support.

Instead, this repo should be treated as the orchestration/discoverability layer, while the actual function lifecycle lives in the separate `team-telnyx/edge-compute` repo and the `telnyx-edge` CLI.

In practice:
- use `team-telnyx/ai` for agent workflows, capability discovery, and AI-oriented integration patterns
- use `team-telnyx/edge-compute` + `telnyx-edge` for function creation, deployment, secrets, bindings, and lifecycle management

The intended end state is a clean bridge:
- `ai` = orchestrates and explains
- Edge Compute = deploys and runs (prefer API-key auth for agent flows)
- the boundary between them is a documented HTTP/MCP/function contract

See [Edge Compute guide](/guides/edge-compute.md).


## License

[MIT](LICENSE)
