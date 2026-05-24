export interface CheckResult {
  name: string;
  ok: boolean;
  details: string;
}

export interface VerificationReport {
  timestamp: string;
  baseUrl: string;
  registryUrl: string;
  appDiscoveryUrl: string;
  appMcpUrl: string;
  executedRuntimeChecks: boolean;
  checks: CheckResult[];
}

interface FetchResult {
  ok: boolean;
  status?: number;
  body?: unknown;
  error?: string;
}

interface AppDiscoveryDocument {
  slug?: string;
  mcp_url?: string;
  discovery_url?: string;
  tool_names?: unknown;
  resource_uris?: unknown;
  auth?: unknown;
}

const DEFAULT_BASE_URL = "https://developers.telnyx.com";
const DEFAULT_APP_SLUG = "number-intelligence";
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const JSONRPC_VERSION = "2.0";

export function checkRegistryDocument(document: unknown, expectedBaseUrl: string, expectedSlug: string): CheckResult[] {
  const record = asRecord(document);
  const apps = Array.isArray(record.apps) ? record.apps : [];
  const appSlugs = apps.map((entry) => asRecord(entry).slug).filter((slug): slug is string => typeof slug === "string");
  const registryUrl = typeof record.registry_url === "string" ? record.registry_url : "";
  const aliasUrl = typeof record.alternate_registry_url === "string" ? record.alternate_registry_url : "";
  const auth = asOptionalRecord(record.auth);

  return [
    {
      name: "public registry document",
      ok: record.kind === "mcp-app-registry" && apps.length > 0,
      details:
        record.kind === "mcp-app-registry" && apps.length > 0
          ? `registry lists ${apps.length} apps`
          : "registry did not expose kind=mcp-app-registry with at least one app"
    },
    {
      name: "registry exact public URLs",
      ok:
        registryUrl === `${expectedBaseUrl}/.well-known/mcp-app-registry.json` &&
        aliasUrl === `${expectedBaseUrl}/.well-known/mcp-apps.json`,
      details:
        registryUrl === `${expectedBaseUrl}/.well-known/mcp-app-registry.json` &&
        aliasUrl === `${expectedBaseUrl}/.well-known/mcp-apps.json`
          ? `registry_url=${registryUrl} alias=${aliasUrl}`
          : `registry_url=${registryUrl || "<missing>"} alias=${aliasUrl || "<missing>"}`
    },
    {
      name: "registry includes proof app",
      ok: appSlugs.includes(expectedSlug),
      details: appSlugs.includes(expectedSlug)
        ? `registry includes ${expectedSlug}`
        : `registry slugs=${appSlugs.join(", ") || "<none>"}`
    },
    {
      name: "registry advertises bearer auth",
      ok: auth?.type === "bearer" && auth?.header === "Authorization" && auth?.prefix === "Bearer",
      details:
        auth?.type === "bearer" && auth?.header === "Authorization" && auth?.prefix === "Bearer"
          ? "registry auth matches bearer contract"
          : `registry auth=${JSON.stringify(auth ?? null)}`
    }
  ];
}

export function checkAppDiscoveryDocument(document: unknown, expectedBaseUrl: string, expectedSlug: string): CheckResult[] {
  const record = asRecord(document);
  const app = asOptionalRecord(record.app) as AppDiscoveryDocument | undefined;
  const toolNames = Array.isArray(app?.tool_names) ? app.tool_names : [];
  const resourceUris = Array.isArray(app?.resource_uris) ? app.resource_uris : [];
  const auth = asOptionalRecord(app?.auth);
  const expectedDiscoveryUrl = `${expectedBaseUrl}/apps/${expectedSlug}`;
  const expectedMcpUrl = `${expectedBaseUrl}/apps/${expectedSlug}/mcp`;

  return [
    {
      name: "app discovery document",
      ok: app?.slug === expectedSlug,
      details: app?.slug === expectedSlug ? `discovery slug=${expectedSlug}` : `discovery slug=${String(app?.slug ?? "<missing>")}`
    },
    {
      name: "app discovery exact public URLs",
      ok: app?.discovery_url === expectedDiscoveryUrl && app?.mcp_url === expectedMcpUrl,
      details:
        app?.discovery_url === expectedDiscoveryUrl && app?.mcp_url === expectedMcpUrl
          ? `discovery_url=${expectedDiscoveryUrl} mcp_url=${expectedMcpUrl}`
          : `discovery_url=${String(app?.discovery_url ?? "<missing>")} mcp_url=${String(app?.mcp_url ?? "<missing>")}`
    },
    {
      name: "app discovery exposes tool names",
      ok: toolNames.length > 0,
      details: toolNames.length > 0 ? `tool_names=${toolNames.join(", ")}` : "tool_names missing or empty"
    },
    {
      name: "app discovery exposes ui resources",
      ok: resourceUris.some((uri) => typeof uri === "string" && uri.startsWith("ui://")),
      details:
        resourceUris.some((uri) => typeof uri === "string" && uri.startsWith("ui://"))
          ? `resource_uris=${resourceUris.join(", ")}`
          : `resource_uris=${JSON.stringify(resourceUris)}`
    },
    {
      name: "app discovery advertises shared bearer auth",
      ok: auth?.type === "bearer",
      details: auth?.type === "bearer" ? `auth=${JSON.stringify(auth)}` : `auth=${JSON.stringify(auth ?? null)}`
    }
  ];
}

export function checkToolsListRuntime(message: unknown, expectedUiUri: string): CheckResult[] {
  const result = asRecord(asRecord(message).result);
  const tools = Array.isArray(result.tools) ? result.tools.map((tool) => asRecord(tool)) : [];
  const matchingTool = tools.find((tool) => Array.isArray(tool.annotations) === false);
  const allAnnotated = tools.every((tool) => isObject(tool.annotations));
  const serialized = JSON.stringify(message);

  return [
    {
      name: "runtime tools/list annotations",
      ok: tools.length > 0 && allAnnotated,
      details:
        tools.length > 0 && allAnnotated
          ? `all ${tools.length} tools included annotations`
          : `tools=${tools.length} first_unannotated=${String(matchingTool?.name ?? "<none>")}`
    },
    {
      name: "runtime tools/list ui metadata",
      ok: serialized.includes(expectedUiUri),
      details: serialized.includes(expectedUiUri) ? `tools/list exposed ${expectedUiUri}` : `tools/list missing ${expectedUiUri}`
    }
  ];
}

export function checkResourcesListRuntime(message: unknown, expectedUiUri: string): CheckResult {
  const serialized = JSON.stringify(message);
  return {
    name: "runtime resources/list ui resource",
    ok: serialized.includes(expectedUiUri),
    details: serialized.includes(expectedUiUri) ? `resources/list exposed ${expectedUiUri}` : `resources/list missing ${expectedUiUri}`
  };
}

export async function verifyLiveDocsMcpApps(
  baseUrl = DEFAULT_BASE_URL,
  appSlug = DEFAULT_APP_SLUG,
  apiKey = process.env.TELNYX_API_KEY
): Promise<VerificationReport> {
  const registryUrl = `${baseUrl}/.well-known/mcp-app-registry.json`;
  const aliasUrl = `${baseUrl}/.well-known/mcp-apps.json`;
  const appDiscoveryUrl = `${baseUrl}/apps/${appSlug}`;
  const appMcpUrl = `${baseUrl}/apps/${appSlug}/mcp`;

  const registry = await fetchJson(registryUrl);
  const alias = await fetchJson(aliasUrl);
  const discovery = await fetchJson(appDiscoveryUrl);

  const checks: CheckResult[] = [];

  checks.push(checkFetchResult("public registry endpoint", registryUrl, registry));
  if (registry.ok && registry.body) {
    checks.push(...checkRegistryDocument(registry.body, baseUrl, appSlug));
  }

  checks.push(checkFetchResult("registry alias endpoint", aliasUrl, alias));
  if (registry.ok && registry.body && alias.ok && alias.body) {
    checks.push(...checkAliasParity(registry.body, alias.body));
  }

  checks.push(checkFetchResult("app discovery endpoint", appDiscoveryUrl, discovery));
  if (discovery.ok && discovery.body) {
    checks.push(...checkAppDiscoveryDocument(discovery.body, baseUrl, appSlug));
  }

  let executedRuntimeChecks = false;
  if (apiKey) {
    executedRuntimeChecks = true;
    const runtime = await verifyRuntimeSurface(appMcpUrl, apiKey, `ui://${appSlug}/index.html`);
    checks.push(...runtime);
  }

  return {
    timestamp: new Date().toISOString(),
    baseUrl,
    registryUrl,
    appDiscoveryUrl,
    appMcpUrl,
    executedRuntimeChecks,
    checks
  };
}

async function initializeMcpSession(appMcpUrl: string, apiKey: string): Promise<string> {
  const response = await fetch(appMcpUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": DEFAULT_PROTOCOL_VERSION
    },
    body: JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "telnyx-ai-live-apps-verifier",
          version: "0.0.0"
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`initialize failed: ${response.status} ${await response.text()}`);
  }

  const sessionId = response.headers.get("mcp-session-id");
  if (!sessionId) {
    throw new Error("initialize response did not include Mcp-Session-Id");
  }
  return sessionId;
}

async function postMcp(
  appMcpUrl: string,
  apiKey: string,
  sessionId: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(appMcpUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": DEFAULT_PROTOCOL_VERSION,
      "Mcp-Session-Id": sessionId
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${String(body.method)} failed: ${response.status} ${text}`);
  }
  return parseJsonOrSse(text);
}

async function fetchJson(url: string): Promise<FetchResult> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });
  const text = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: `${url} returned ${response.status}: ${summarizeBody(text)}`
    };
  }
  return {
    ok: true,
    status: response.status,
    body: JSON.parse(text)
  };
}

function checkAliasParity(registry: unknown, alias: unknown): CheckResult[] {
  const serializedRegistry = JSON.stringify(registry);
  const serializedAlias = JSON.stringify(alias);
  return [
    {
      name: "registry alias parity",
      ok: serializedRegistry === serializedAlias,
      details:
        serializedRegistry === serializedAlias
          ? "alternate registry matched canonical registry"
          : "alternate registry body diverged from canonical registry"
    }
  ];
}

function checkFetchResult(name: string, url: string, result: FetchResult): CheckResult {
  return {
    name,
    ok: result.ok,
    details: result.ok ? `${url} returned ${result.status}` : result.error ?? `${url} request failed`
  };
}

async function verifyRuntimeSurface(appMcpUrl: string, apiKey: string, expectedUiUri: string): Promise<CheckResult[]> {
  try {
    const sessionId = await initializeMcpSession(appMcpUrl, apiKey);
    const tools = await postMcp(appMcpUrl, apiKey, sessionId, {
      jsonrpc: JSONRPC_VERSION,
      id: 2,
      method: "tools/list",
      params: {}
    });
    const resources = await postMcp(appMcpUrl, apiKey, sessionId, {
      jsonrpc: JSONRPC_VERSION,
      id: 3,
      method: "resources/list",
      params: {}
    });

    return [
      {
        name: "runtime initialize",
        ok: true,
        details: `initialized MCP session at ${appMcpUrl}`
      },
      ...checkToolsListRuntime(tools, expectedUiUri),
      checkResourcesListRuntime(resources, expectedUiUri)
    ];
  } catch (error) {
    return [
      {
        name: "runtime initialize",
        ok: false,
        details: error instanceof Error ? error.message : String(error)
      }
    ];
  }
}

function parseJsonOrSse(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  const match = body.match(/^data:\s*(.+)$/m);
  if (!match) {
    throw new Error("response did not include JSON or SSE data");
  }
  return JSON.parse(match[1]);
}

function summarizeBody(body: string, maxLength = 240): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error(`Expected object but received ${typeof value}`);
  }
  return value;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  const baseUrl = process.argv[2] ?? DEFAULT_BASE_URL;
  const appSlug = process.argv[3] ?? DEFAULT_APP_SLUG;
  const report = await verifyLiveDocsMcpApps(baseUrl, appSlug);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.checks.every((check) => check.ok) ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
