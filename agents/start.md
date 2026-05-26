# Agents Start

Start here if you are an AI agent or an AI-first developer discovering Telnyx for the first time.

This page is the single public entrypoint for the agent-facing Telnyx surfaces that should be crawlable by name without guessing.

## Canonical discovery surfaces

| Surface | URL | Purpose |
| --- | --- | --- |
| Agent fast path | `https://telnyx.com/agents/start` | Primary public entrypoint for agents |
| Agent manifest | `https://telnyx.com/.well-known/agent-card.json` | Machine-readable identity, capabilities, and links |
| Agent access | `https://telnyx.com/.well-known/agent-access.json` | Machine-readable signup and auth contract |
| Agent skills index | `https://telnyx.com/.well-known/agent-skills/index.json` | Published skill catalog |
| Auth guide | `https://telnyx.com/auth.md` | Bearer-auth and protected-resource discovery walkthrough |
| OAuth authorization server | `https://api.telnyx.com/.well-known/oauth-authorization-server` | OAuth metadata and agent onboarding pointers |
| OAuth protected resource | `https://api.telnyx.com/.well-known/oauth-protected-resource` | Generic API bearer metadata |
| MCP resource metadata | `https://api.telnyx.com/.well-known/oauth-protected-resource/v2/mcp` | MCP bearer metadata |
| MCP server card | `https://telnyx.com/.well-known/mcp/server-card.json` | MCP connection contract |
| MCP endpoint | `https://api.telnyx.com/v2/mcp` | Remote streamable-HTTP MCP server |
| MCP Apps registry | `https://developers.telnyx.com/.well-known/mcp-app-registry.json` | Machine-readable app-layer MCP registry |
| MCP Apps registry alias | `https://developers.telnyx.com/.well-known/mcp-apps.json` | Lightweight alias for the registry |
| MCP Apps catalog | `https://developers.telnyx.com/apps` | Public app-layer MCP catalog |
| MCP Apps proof app | `https://developers.telnyx.com/apps/number-intelligence` | Example public app landing page |
| OpenAPI spec | `https://telnyx.com/.well-known/openapi.json` | Machine-readable REST surface |
| Capability index | `https://telnyx.com/ai/capabilities.json` | Machine-readable capability catalog |
| Pricing | `https://telnyx.com/ai/pricing.json` | Machine-readable pricing surface |
| Telnyx webhooks guide | `https://developers.telnyx.com/development/api-fundamentals/webhooks/receiving-webhooks` | Live Telnyx webhooks documentation for setup, signature verification, payloads, and retry behavior |
| Signup guide | `https://telnyx.com/agent-signup.md` | Programmatic API-key signup flow |

## Repo-owned mirrors and operating files

- Local manifest mirror: [`/agent.json`](/agent.json)
- Runtime agent instructions: [`/AGENTS.md`](/AGENTS.md) and `https://telnyx.com/AGENTS.md`
- LLM-oriented index: [`/llms.txt`](/llms.txt) and `https://telnyx.com/llms.txt`
- Auth walkthrough source: [`/auth.md`](/auth.md)

## Webhook discoverability

If your workflow receives events, read the live Telnyx webhooks guide first:
`https://developers.telnyx.com/development/api-fundamentals/webhooks/receiving-webhooks`

Repo mirror source: [`/guides/webhooks.md`](/guides/webhooks.md)

That guide is the crawlable named entrypoint for:

- webhook URL setup
- Ed25519 signature verification
- SMS, voice, and number-level webhook configuration
- delivery debugging and retry behavior

## Suggested agent path

1. Start at `https://telnyx.com/agents/start`.
2. Read `https://telnyx.com/auth.md`.
3. Fetch `https://telnyx.com/.well-known/agent-access.json` if you need onboarding.
4. Fetch `https://telnyx.com/.well-known/agent-card.json` or local `/agent.json` for the capability map.
5. Use `https://api.telnyx.com/v2/mcp` or `https://telnyx.com/.well-known/openapi.json` depending on whether you need MCP or REST.
6. Read `https://developers.telnyx.com/development/api-fundamentals/webhooks/receiving-webhooks` before building inbound event handlers.
