import { outputJson, printError, printSuccess, printWarning } from "../utils/output.ts";
import { join } from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";

interface CursorMcpServer {
  type: "http";
  url: string;
}

interface CursorMcpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CursorMcpResult {
  ready: boolean;
  path: string;
  action: "created" | "merged" | "skipped" | "error";
  detail?: string;
  config?: { mcpServers: { telnyx: CursorMcpServer } };
}

export async function setupCursorMcpCommand(flags: Record<string, string | boolean>): Promise<void> {
  const jsonOutput = flags.json === true;
  const force = flags.force === true;
  const targetDir = (typeof flags.dir === "string" ? flags.dir : process.cwd());
  const cursorDir = join(targetDir, ".cursor");
  const mcpPath = join(cursorDir, "mcp.json");

  const TELNYX_MCP_URL = "https://api.telnyx.com/v2/mcp";
  const mcpEntry: CursorMcpServer = {
    type: "http",
    url: TELNYX_MCP_URL,
  };

  const result: CursorMcpResult = {
    ready: false,
    path: mcpPath,
    action: "skipped",
  };

  try {
    let currentConfig: CursorMcpConfig = { mcpServers: {} };

    if (existsSync(mcpPath)) {
      try {
        const raw = readFileSync(mcpPath, "utf8");
        currentConfig = JSON.parse(raw);
      } catch {
        if (!force) {
          result.action = "error";
          result.detail = "mcp.json exists but is malformed JSON. Use --force to overwrite.";
          if (jsonOutput) {
            return failWithJson(result);
          }
          printError("Failed to parse existing .cursor/mcp.json", result.detail);
          process.exitCode = 1;
          return;
        }
        // If force, we just overwrite
        currentConfig = { mcpServers: {} };
        result.action = "created";
      }
    } else {
      result.action = "created";
    }

    if (!isJsonObject(currentConfig)) {
      if (!force) {
        result.action = "error";
        result.detail = "mcp.json must contain a JSON object. Use --force to overwrite.";
        if (jsonOutput) {
          return failWithJson(result);
        }
        printError("Invalid .cursor/mcp.json", result.detail);
        process.exitCode = 1;
        return;
      }
      currentConfig = { mcpServers: {} };
      result.action = "created";
    }

    if (!currentConfig.mcpServers) {
      currentConfig.mcpServers = {};
    } else if (!isJsonObject(currentConfig.mcpServers)) {
      if (!force) {
        result.action = "error";
        result.detail = "mcp.json mcpServers must be an object. Use --force to overwrite.";
        if (jsonOutput) {
          return failWithJson(result);
        }
        printError("Invalid .cursor/mcp.json", result.detail);
        process.exitCode = 1;
        return;
      }
      currentConfig.mcpServers = {};
      result.action = "merged";
    }

    const existingTelnyx = currentConfig.mcpServers.telnyx;
    if (existingTelnyx) {
      const isMatch = isCursorMcpServer(existingTelnyx) && existingTelnyx.url === TELNYX_MCP_URL;
      if (!isMatch) {
        if (!force) {
          result.action = "skipped";
          result.detail = "A 'telnyx' MCP server already exists with different settings. Use --force to overwrite.";
          if (jsonOutput) {
            return failWithJson(result);
          }
          printWarning(result.detail);
          process.exitCode = 1;
          return;
        } else {
          result.action = "merged";
        }
      } else {
        result.action = "skipped";
        result.detail = "Telnyx MCP server is already properly configured.";
      }
    } else {
      if (result.action !== "created") {
        result.action = "merged";
      }
    }

    if (result.action === "created" || result.action === "merged") {
      currentConfig.mcpServers.telnyx = mcpEntry;
      if (!existsSync(cursorDir)) {
        mkdirSync(cursorDir, { recursive: true });
      }
      writeFileSync(mcpPath, JSON.stringify(currentConfig, null, 2), "utf8");
      result.ready = true;
      result.config = telnyxOnlyConfig(mcpEntry);
    } else if (result.action === "skipped" && !result.detail?.includes("different settings")) {
      result.ready = true;
      result.config = telnyxOnlyConfig(mcpEntry);
    }

    if (jsonOutput) {
      outputJson(result);
      return;
    }

    if (result.action === "created") {
      printSuccess("Cursor MCP config created", { Path: mcpPath });
    } else if (result.action === "merged") {
      printSuccess("Cursor MCP config updated", { Path: mcpPath });
    } else if (result.action === "skipped") {
      printSuccess("Cursor MCP config is up to date", { Path: mcpPath });
    }

  } catch (error: unknown) {
    result.action = "error";
    result.detail = error instanceof Error ? error.message : String(error);
    if (jsonOutput) {
      outputJson(result);
    } else {
      printError("Failed to setup Cursor MCP", result.detail);
    }
    process.exitCode = 1;
  }
}

function failWithJson(result: CursorMcpResult): void {
  outputJson(result);
  process.exitCode = 1;
}

function isCursorMcpServer(value: unknown): value is CursorMcpServer {
  return Boolean(value) && typeof value === "object" && (value as CursorMcpServer).type === "http" && typeof (value as CursorMcpServer).url === "string";
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function telnyxOnlyConfig(mcpEntry: CursorMcpServer): { mcpServers: { telnyx: CursorMcpServer } } {
  return { mcpServers: { telnyx: mcpEntry } };
}
