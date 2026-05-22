export interface CheckResult {
  name: string;
  ok: boolean;
  details: string;
}

export interface VerificationReport {
  timestamp: string;
  baseUrl: string;
  discoveryUrl: string;
  checks: CheckResult[];
}

export interface McpRequestSpec {
  name: string;
  path: string;
  body?: Record<string, unknown>;
}

const DEFAULT_BASE_URL = "https://developers.telnyx.com";
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const JSONRPC_VERSION = "2.0";

const INITIALIZE_REQUEST: McpRequestSpec = {
  name: "initialize",
  path: "/mcp",
  body: {
    jsonrpc: JSONRPC_VERSION,
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "telnyx-ai-live-verifier",
        version: "0.0.0"
      }
    }
  }
};

const TOOLS_LIST_REQUEST: McpRequestSpec = {
  name: "tools/list",
  path: "/mcp",
  body: {
    jsonrpc: JSONRPC_VERSION,
    id: 2,
    method: "tools/list",
    params: {}
  }
};

const INVALID_ARGS_REQUEST: McpRequestSpec = {
  name: "tools/call invalid args",
  path: "/mcp",
  body: {
    jsonrpc: JSONRPC_VERSION,
    id: 3,
    method: "tools/call",
    params: {
      name: "search_telnyx",
      arguments: {}
    }
  }
};

const UNKNOWN_TOOL_REQUEST: McpRequestSpec = {
  name: "tools/call unknown tool",
  path: "/mcp",
  body: {
    jsonrpc: JSONRPC_VERSION,
    id: 4,
    method: "tools/call",
    params: {
      name: "no_such_tool",
      arguments: {}
    }
  }
};

export function extractSseJson(body: string): unknown {
  const match = body.match(/^data:\s*(.+)$/m);
  if (!match) {
    throw new Error("SSE response did not include a data payload");
  }
  return JSON.parse(match[1]);
}

export function parseJsonOrSse(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  return extractSseJson(body);
}

export function checkInitializeResponse(message: unknown): CheckResult[] {
  const result = asRecord(asRecord(message).result);
  const serverInfo = asRecord(result.serverInfo);
  const instructions = typeof result.instructions === "string" ? result.instructions.trim() : "";
  const protocolVersion = typeof result.protocolVersion === "string" ? result.protocolVersion : "";

  return [
    {
      name: "initialize protocolVersion",
      ok: protocolVersion.length > 0,
      details: protocolVersion.length > 0 ? `server returned protocolVersion=${protocolVersion}` : "initialize response did not include result.protocolVersion"
    },
    {
      name: "initialize serverInfo",
      ok: typeof serverInfo.name === "string" && typeof serverInfo.version === "string",
      details:
        typeof serverInfo.name === "string" && typeof serverInfo.version === "string"
          ? `serverInfo name=${serverInfo.name} version=${serverInfo.version}`
          : "initialize response did not include both serverInfo.name and serverInfo.version"
    },
    {
      name: "initialize instructions",
      ok: instructions.length > 0,
      details:
        instructions.length > 0
          ? `instructions present (${instructions.length} chars)`
          : "initialize response omitted result.instructions"
    }
  ];
}

export function checkToolsListResponse(message: unknown): CheckResult {
  const result = asRecord(asRecord(message).result);
  const tools = Array.isArray(result.tools) ? result.tools : [];
  const missingAnnotations = tools
    .map((tool) => asRecord(tool))
    .filter((tool) => !isObject(tool.annotations))
    .map((tool) => String(tool.name ?? "<unknown>"));

  return {
    name: "tools/list annotations",
    ok: tools.length > 0 && missingAnnotations.length === 0,
    details:
      missingAnnotations.length === 0
        ? `all ${tools.length} tools included annotations`
        : `missing annotations on: ${missingAnnotations.join(", ")}`
  };
}

export function checkDiscoveryDocument(document: unknown, expectedBaseUrl: string): CheckResult[] {
  const record = asRecord(document);
  const servers = Array.isArray(record.servers) ? record.servers : [];
  const primaryUrl = typeof record.url === "string" ? record.url : "";
  const firstServer = servers[0];
  const firstServerUrl = isObject(firstServer) && typeof firstServer.url === "string" ? firstServer.url : "";
  const expectedPrefix = `${expectedBaseUrl}/`;

  return [
    {
      name: "well-known discovery document",
      ok: primaryUrl.length > 0 || firstServerUrl.length > 0,
      details:
        primaryUrl.length > 0 || firstServerUrl.length > 0
          ? `discovery published url=${primaryUrl || firstServerUrl}`
          : "discovery document did not include a primary MCP URL"
    },
    {
      name: "well-known same-origin url",
      ok: primaryUrl.startsWith(expectedPrefix) || firstServerUrl.startsWith(expectedPrefix),
      details:
        primaryUrl.startsWith(expectedPrefix) || firstServerUrl.startsWith(expectedPrefix)
          ? `discovery URL stayed on ${expectedBaseUrl}`
          : `discovery pointed to ${primaryUrl || firstServerUrl} instead of ${expectedBaseUrl}`
    }
  ];
}

export function checkJsonRpcErrorEnvelope(message: unknown): CheckResult {
  const record = asRecord(message);
  const error = record.error;
  const result = asRecord(record.result);
  const hasStructuredError = isObject(error) && typeof asRecord(error).code === "number" && typeof asRecord(error).message === "string";
  const fellBackToToolResult = Boolean(result.isError);

  return {
    name: "structured JSON-RPC errors",
    ok: hasStructuredError,
    details: hasStructuredError
      ? `error code=${String(asRecord(error).code)} message=${String(asRecord(error).message)}`
      : fellBackToToolResult
        ? "server returned result.isError content instead of a top-level JSON-RPC error object"
        : "response omitted a top-level JSON-RPC error object"
  };
}

export async function fetchEndpoint(baseUrl: string, request: McpRequestSpec): Promise<unknown> {
  const response = await fetch(`${baseUrl}${request.path}`, {
    method: request.body ? "POST" : "GET",
    headers: {
      Accept: "application/json, text/event-stream",
      ...(request.body
        ? {
            "Content-Type": "application/json",
            "MCP-Protocol-Version": DEFAULT_PROTOCOL_VERSION
          }
        : {})
    },
    body: request.body ? JSON.stringify(request.body) : undefined
  });

  const text = await response.text();
  return parseJsonOrSse(text);
}

export async function verifyLiveDocsMcp(baseUrl = DEFAULT_BASE_URL): Promise<VerificationReport> {
  const discovery = await fetchEndpoint(baseUrl, { name: "well-known discovery", path: "/.well-known/mcp" });
  const initialize = await fetchEndpoint(baseUrl, INITIALIZE_REQUEST);
  const toolsList = await fetchEndpoint(baseUrl, TOOLS_LIST_REQUEST);
  const invalidArgs = await fetchEndpoint(baseUrl, INVALID_ARGS_REQUEST);
  const unknownTool = await fetchEndpoint(baseUrl, UNKNOWN_TOOL_REQUEST);

  return {
    timestamp: new Date().toISOString(),
    baseUrl,
    discoveryUrl: `${baseUrl}/.well-known/mcp`,
    checks: [
      ...checkDiscoveryDocument(discovery, baseUrl),
      ...checkInitializeResponse(initialize),
      checkToolsListResponse(toolsList),
      checkJsonRpcErrorEnvelope(invalidArgs),
      checkJsonRpcErrorEnvelope(unknownTool)
    ]
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error(`Expected object but received ${typeof value}`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  const baseUrl = process.argv[2] ?? DEFAULT_BASE_URL;
  const report = await verifyLiveDocsMcp(baseUrl);
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
