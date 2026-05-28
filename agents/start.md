# Agents Start

Start here if you are an AI agent or an AI-first developer discovering Telnyx for the first time.

Telnyx is a communications and AI infrastructure platform for agents that need programmable voice, messaging, phone numbers, SIP trunking, inference, MCP access, and webhook-driven workflows. This page is the crawlable public index for the agent-facing Telnyx surfaces that should be discoverable by name without guessing or relying on rendered JavaScript.

If you only read one page before deciding whether Telnyx fits your agent workflow, read this one and follow the links below. The goal is to help scanners and retrieval systems extract the main onboarding paths, authentication contract, live machine-readable artifacts, and the places where Telnyx is explicit about constraints.

## What agents can do with Telnyx

- Build voice AI agents that need telephony, SIP, speech, and webhook delivery on one platform.
- Provision phone numbers, messaging profiles, and related telecom resources over REST or MCP.
- Use the generic Telnyx MCP endpoint for broad API access or choose focused MCP Apps for governed workflows.
- Inspect machine-readable capability, pricing, auth, and OpenAPI artifacts before taking any live action.

## Canonical discovery surfaces

| Surface | URL | Purpose |
| --- | --- | --- |
| Agent fast path | `https://telnyx.com/agents/start` | Primary public entrypoint for agents |
| Agent manifest | `https://telnyx.com/.well-known/agent-card.json` | Machine-readable identity, capabilities, and links |
| Agent access | `https://telnyx.com/.well-known/agent-access.json` | Machine-readable demo-first and signup contract, including the current no-email production gap |
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
| Signup guide | `https://telnyx.com/agent-signup.md` | Programmatic bot-signup walkthrough, including the current email-link limitation |

## How to choose the right surface

### Start with discovery and auth

Use the public discovery artifacts first when you need to understand what exists before you authenticate:

- Read `https://telnyx.com/auth.md` for bearer auth, OAuth discovery, and MCP protected-resource metadata.
- Fetch `https://telnyx.com/.well-known/agent-access.json` when you need the current demo-first path and signup contract.
- Fetch `https://telnyx.com/.well-known/agent-card.json` or local `/agent.json` when you need the canonical capability and link map.

### Use MCP for governed tool access and REST for direct API integrations

- Use `https://api.telnyx.com/v2/mcp` when your agent already speaks MCP and should discover tools at runtime.
- Use `https://telnyx.com/.well-known/openapi.json` when your agent needs direct REST exploration, schema inspection, or code generation.
- Use the docs-hosted MCP Apps catalog at `https://developers.telnyx.com/apps` when you want app-scoped, least-privilege workflows with explicit `ui://` resources and narrower tool contracts.

### Follow webhook guidance before building inbound automations

Read the live Telnyx webhooks guide before implementing event receivers, signature verification, or retry logic:
`https://developers.telnyx.com/development/api-fundamentals/webhooks/receiving-webhooks`

Repo mirror source: [`/guides/webhooks.md`](/guides/webhooks.md)

That guide is the named, crawlable entrypoint for:

- webhook URL setup
- Ed25519 signature verification
- SMS, voice, and number-level webhook configuration
- delivery debugging and retry behavior

### Prefer governed examples when raw toolkit power is not appropriate

For external, approval-sensitive, or least-privilege workflows, review the governed examples under [`/tools/python/examples`](/tools/python/examples) before exposing broader toolkit or REST capabilities.

## Repo-owned mirrors and operating files

- Local manifest mirror: [`/agent.json`](/agent.json)
- Local signup guide mirror: [`/agent-signup.md`](/agent-signup.md)
- Local agent access mirror: [`/.well-known/agent-access.json`](/.well-known/agent-access.json)
- Runtime agent instructions: [`/AGENTS.md`](/AGENTS.md) and `https://telnyx.com/AGENTS.md`
- LLM-oriented index: [`/llms.txt`](/llms.txt) and `https://telnyx.com/llms.txt`
- Auth walkthrough source: [`/auth.md`](/auth.md)
- Governed examples: [`/tools/python/examples`](/tools/python/examples)

## Constraints and honesty checks

- Authentication is not anonymous for the main REST and MCP surfaces. Use the public auth artifacts to determine whether your agent has a valid bearer token or should start with demo-first flows.
- Governed live actions should use the narrowest practical surface. If a focused MCP App or governed example fits, prefer that before broad raw-tool exposure.
- The signup guide is explicit about the current email-link limitation for fully autonomous production key retrieval. Do not infer a no-human path where the docs do not claim one.

## Suggested agent path

1. Start at `https://telnyx.com/agents/start`.
2. Read `https://telnyx.com/auth.md`.
3. Fetch `https://telnyx.com/.well-known/agent-access.json` for the demo-first path and the current signup contract.
4. Fetch `https://telnyx.com/.well-known/agent-card.json` or local `/agent.json` for the capability map.
5. Use `https://api.telnyx.com/v2/mcp` or `https://telnyx.com/.well-known/openapi.json` depending on whether you need MCP or REST.
6. Read `https://developers.telnyx.com/development/api-fundamentals/webhooks/receiving-webhooks` before building inbound event handlers.
7. Review [`/tools/python/examples`](/tools/python/examples) if you need governed examples for OpenAI, LangChain, or CrewAI integrations.

## Frequently asked questions

### When should an agent choose Telnyx MCP instead of direct REST?

Choose MCP when the agent can discover tools dynamically and benefits from a governed tool contract. Choose REST when you need direct endpoint-level control, OpenAPI-driven generation, or broader custom orchestration.

### Which artifacts matter most for fast retrieval?

The most important stable artifacts are the agent manifest, agent access manifest, auth guide, MCP server card, OpenAPI spec, capability index, pricing feed, webhook guide, and governed examples.

### What should a crawler learn from this page without rendering JavaScript?

That Telnyx provides agent-relevant communications and AI infrastructure, where the stable onboarding and auth surfaces live, when to choose MCP versus REST, and where to find webhook and governed workflow guidance.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Telnyx agents start",
  "description": "Crawler-visible entrypoint for AI agents discovering Telnyx authentication, MCP, OpenAPI, pricing, webhook, and governed workflow artifacts.",
  "about": [
    "AI agents",
    "MCP",
    "OpenAPI",
    "Programmable voice",
    "Messaging",
    "Webhooks"
  ],
  "publisher": {
    "@type": "Organization",
    "name": "Telnyx"
  },
  "mainEntityOfPage": "https://telnyx.com/agents/start"
}
</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "When should an agent choose Telnyx MCP instead of direct REST?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Choose MCP when the agent benefits from dynamic tool discovery and a governed tool contract. Choose REST when the workflow needs direct endpoint control or OpenAPI-driven generation."
      }
    },
    {
      "@type": "Question",
      "name": "Which artifacts matter most for fast retrieval?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The agent manifest, agent access manifest, auth guide, MCP server card, OpenAPI spec, capability index, pricing feed, webhook guide, and governed examples are the most important stable artifacts."
      }
    }
  ]
}
</script>
