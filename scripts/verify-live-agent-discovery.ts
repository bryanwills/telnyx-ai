export interface DiscoveryProbe {
  name: string;
  method: string;
  url: string;
  ok: boolean;
  status: number;
  details: string;
  headers?: Record<string, string>;
  bodyExcerpt?: string;
}

export interface DiscoveryVerificationReport {
  timestamp: string;
  probes: DiscoveryProbe[];
}

const JSONRPC_VERSION = "2.0";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const LIVE_WEBHOOKS_URL = "https://developers.telnyx.com/development/api-fundamentals/webhooks/receiving-webhooks";

export function checkAuthMd(body: string, status: number): DiscoveryProbe {
  const urls = [
    "https://telnyx.com/.well-known/agent-access.json",
    "https://api.telnyx.com/.well-known/oauth-protected-resource",
    "https://api.telnyx.com/v2/mcp"
  ];
  const missing = urls.filter((url) => !body.includes(url));

  return {
    name: "auth.md",
    method: "GET",
    url: "https://telnyx.com/auth.md",
    ok: status === 200 && missing.length === 0,
    status,
    details: missing.length === 0 ? "auth.md referenced onboarding and protected-resource URLs" : `auth.md missing: ${missing.join(", ")}`,
    bodyExcerpt: body.slice(0, 240)
  };
}

export function checkJsonDocument(name: string, method: string, url: string, status: number, body: unknown, predicate: (body: Record<string, unknown>) => boolean, success: string, failure: string): DiscoveryProbe {
  const record = asRecord(body);
  return {
    name,
    method,
    url,
    ok: status === 200 && predicate(record),
    status,
    details: status === 200 && predicate(record) ? success : failure,
    bodyExcerpt: JSON.stringify(record).slice(0, 240)
  };
}

export function checkWwwAuthenticate(status: number, header: string | null): DiscoveryProbe {
  const expected = 'Bearer resource_metadata="https://api.telnyx.com/.well-known/oauth-protected-resource/v2/mcp"';
  return {
    name: "unauthenticated MCP bearer challenge",
    method: "POST",
    url: "https://api.telnyx.com/v2/mcp",
    ok: status === 401 && header === expected,
    status,
    details: header === expected ? `challenge matched ${expected}` : `received ${header ?? "<missing>"}`,
    headers: header ? { "www-authenticate": header } : undefined
  };
}

export function checkWebhookDiscoverability(status: number, body: string): DiscoveryProbe {
  const requiredSnippets = ["Telnyx webhooks", LIVE_WEBHOOKS_URL];
  const missing = requiredSnippets.filter((snippet) => !body.includes(snippet));

  return {
    name: "root llms.txt webhook discoverability",
    method: "GET",
    url: "https://telnyx.com/llms.txt",
    ok: status === 200 && missing.length === 0,
    status,
    details: missing.length === 0
      ? "llms.txt linked the live Telnyx webhooks guide with explicit webhook wording"
      : `llms.txt missing: ${missing.join(", ")}`,
    bodyExcerpt: body.slice(0, 240)
  };
}

export function checkWebhookGuideUrl(status: number, url: string): DiscoveryProbe {
  return {
    name: "live Telnyx webhooks guide",
    method: "GET",
    url,
    ok: status === 200,
    status,
    details: status === 200
      ? "webhook guide resolved successfully"
      : `expected 200 from live webhook guide but received ${status}`
  };
}

export async function verifyLiveAgentDiscovery(): Promise<DiscoveryVerificationReport> {
  const probes: DiscoveryProbe[] = [];

  const agentsStart = await fetchJson("https://telnyx.com/agents/start");
  probes.push(checkJsonDocument(
    "agent fast path webhook discoverability",
    "GET",
    "https://telnyx.com/agents/start",
    agentsStart.status,
    agentsStart.body,
    (body) => JSON.stringify(body).includes(LIVE_WEBHOOKS_URL),
    "agent fast path linked the live Telnyx webhooks guide",
    "agent fast path did not link the live Telnyx webhooks guide"
  ));

  const llmsTxtResponse = await fetch("https://telnyx.com/llms.txt");
  const llmsTxtBody = await llmsTxtResponse.text();
  probes.push(checkWebhookDiscoverability(llmsTxtResponse.status, llmsTxtBody));

  const webhookGuide = await fetch(LIVE_WEBHOOKS_URL);
  probes.push(checkWebhookGuideUrl(webhookGuide.status, LIVE_WEBHOOKS_URL));

  const authMdResponse = await fetch("https://telnyx.com/auth.md");
  const authMdBody = await authMdResponse.text();
  probes.push(checkAuthMd(authMdBody, authMdResponse.status));

  const mcpDiscovery = await fetchJson("https://telnyx.com/.well-known/mcp");
  probes.push(checkJsonDocument(
    "MCP discovery",
    "GET",
    "https://telnyx.com/.well-known/mcp",
    mcpDiscovery.status,
    mcpDiscovery.body,
    (body) => Array.isArray(body.servers) && String(asRecord((body.servers as unknown[])[0]).endpoint) === "https://api.telnyx.com/v2/mcp",
    "MCP discovery advertised the Telnyx streamable-http endpoint",
    "MCP discovery did not advertise the expected endpoint"
  ));

  const authServer = await fetchJson("https://api.telnyx.com/.well-known/oauth-authorization-server");
  probes.push(checkJsonDocument(
    "OAuth authorization server",
    "GET",
    "https://api.telnyx.com/.well-known/oauth-authorization-server",
    authServer.status,
    authServer.body,
    (body) => String(body.issuer) === "https://api.telnyx.com" && Array.isArray(body.protected_resources),
    "authorization-server metadata included issuer and protected resources",
    "authorization-server metadata was missing issuer or protected resources"
  ));

  const mcpProtectedResource = await fetchJson("https://api.telnyx.com/.well-known/oauth-protected-resource/v2/mcp");
  probes.push(checkJsonDocument(
    "MCP protected resource",
    "GET",
    "https://api.telnyx.com/.well-known/oauth-protected-resource/v2/mcp",
    mcpProtectedResource.status,
    mcpProtectedResource.body,
    (body) => String(body.resource) === "https://api.telnyx.com/v2/mcp",
    "protected-resource metadata matched the MCP endpoint",
    "protected-resource metadata did not match the MCP endpoint"
  ));

  const unauthenticatedMcp = await fetch("https://api.telnyx.com/v2/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "telnyx-ai-live-verifier", version: "0.0.0" }
      }
    })
  });
  probes.push(checkWwwAuthenticate(unauthenticatedMcp.status, unauthenticatedMcp.headers.get("www-authenticate")));

  return {
    timestamp: new Date().toISOString(),
    probes
  };
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });
  return {
    status: response.status,
    body: JSON.parse(await response.text())
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected object but received ${typeof value}`);
  }
  return value;
}

async function main(): Promise<void> {
  const report = await verifyLiveAgentDiscovery();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.probes.every((probe) => probe.ok) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
