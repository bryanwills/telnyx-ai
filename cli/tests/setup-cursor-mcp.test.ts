import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "..", "bin", "telnyx-agent.ts");
const TELNYX_MCP_URL = "https://api.telnyx.com/v2/mcp";

function run(args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync("npx", ["tsx", CLI, ...args], {
    encoding: "utf8",
    timeout: 30000,
    env: env ?? { ...process.env },
  });
}

function runWithStderr(args: string[], env?: NodeJS.ProcessEnv) {
  const result = spawnSync("npx", ["tsx", CLI, ...args], {
    encoding: "utf8",
    timeout: 30000,
    env: env ?? { ...process.env },
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

describe("CLI — setup-cursor-mcp", () => {
  it("help lists setup-cursor-mcp command", () => {
    const output = run(["help"]);
    assert.ok(output.includes("setup-cursor-mcp"));
    assert.ok(output.includes("--dir <path>"));
    assert.ok(output.includes("--force"));
  });

  it("capabilities JSON includes setup-cursor-mcp", () => {
    const output = run(["capabilities", "--json"]);
    const data = JSON.parse(output);
    const commands = data.composite_commands.map((c: any) => c.name || c.command || c);
    assert.ok(commands.some((c: string) => c.includes("setup-cursor-mcp")));
    const category = Object.keys(data.api_capabilities || {}).find((k) => k.includes("IDE Integrations"));
    assert.ok(category);
    assert.ok(data.api_capabilities[category].some((c: any) => c.actions.includes("setup_cursor_mcp")));
  });

  it("creates a new Cursor config if missing", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const output = run(["setup-cursor-mcp", "--dir", tempDir]);
    assert.ok(output.includes("Cursor MCP config created"));

    const configPath = join(tempDir, ".cursor", "mcp.json");
    const data = JSON.parse(readFileSync(configPath, "utf8"));
    assert.ok(data.mcpServers);
    assert.ok(data.mcpServers.telnyx);
    assert.equal(data.mcpServers.telnyx.url, TELNYX_MCP_URL);
    assert.equal(data.mcpServers.telnyx.type, "http");
  });

  it("merges with existing config", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const cursorDir = join(tempDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        otherSetting: true,
        mcpServers: {
          existing: { type: "sse", url: "https://example.com" }
        }
      })
    );

    run(["setup-cursor-mcp", "--dir", tempDir]);

    const data = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(data.otherSetting, true);
    assert.ok(data.mcpServers.existing);
    assert.ok(data.mcpServers.telnyx);
  });

  it("skips when Telnyx MCP is already properly configured", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const cursorDir = join(tempDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    const initialConfig = {
      mcpServers: {
        telnyx: { type: "http", url: TELNYX_MCP_URL },
      },
    };
    const initialContent = JSON.stringify(initialConfig, null, 2);
    writeFileSync(configPath, initialContent, "utf8");

    const output = run(["setup-cursor-mcp", "--dir", tempDir, "--json"]);
    const data = JSON.parse(output);

    assert.equal(data.action, "skipped");
    assert.equal(data.ready, true);
    assert.equal(readFileSync(configPath, "utf8"), initialContent);
  });

  it("fails when telnyx server exists with different settings (without --force)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const cursorDir = join(tempDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          telnyx: { type: "command", command: "telnyx", args: [] }
        }
      })
    );

    const result = runWithStderr(["setup-cursor-mcp", "--dir", tempDir]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("exists with different settings"));
    
    // Ensure it wasn't overwritten
    const data = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(data.mcpServers.telnyx.type, "command");
  });

  it("overwrites existing telnyx server with --force", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const cursorDir = join(tempDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          telnyx: { type: "command", command: "telnyx", args: [] }
        }
      })
    );

    run(["setup-cursor-mcp", "--dir", tempDir, "--force"]);

    const data = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(data.mcpServers.telnyx.type, "http");
    assert.equal(data.mcpServers.telnyx.url, TELNYX_MCP_URL);
  });

  it("fails on malformed JSON without --force", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const cursorDir = join(tempDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    writeFileSync(configPath, "{ malformed: json, ]}");

    const result = runWithStderr(["setup-cursor-mcp", "--dir", tempDir]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("malformed JSON"));

    // Ensure it wasn't overwritten
    const content = readFileSync(configPath, "utf8");
    assert.equal(content, "{ malformed: json, ]}");
  });

  it("overwrites malformed JSON with --force", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const cursorDir = join(tempDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    writeFileSync(configPath, "{ malformed: json, ]}");

    run(["setup-cursor-mcp", "--dir", tempDir, "--force"]);

    const data = JSON.parse(readFileSync(configPath, "utf8"));
    assert.ok(data.mcpServers.telnyx);
  });

  it("fails when mcpServers is not an object without --force", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const cursorDir = join(tempDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    const initialContent = JSON.stringify({ mcpServers: [] }, null, 2);
    writeFileSync(configPath, initialContent, "utf8");

    const result = runWithStderr(["setup-cursor-mcp", "--dir", tempDir]);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes("mcpServers must be an object"));
    assert.equal(readFileSync(configPath, "utf8"), initialContent);
  });

  it("repairs non-object mcpServers with --force", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const cursorDir = join(tempDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    writeFileSync(configPath, JSON.stringify({ otherSetting: true, mcpServers: [] }), "utf8");

    const output = run(["setup-cursor-mcp", "--dir", tempDir, "--force", "--json"]);
    const result = JSON.parse(output);
    const data = JSON.parse(readFileSync(configPath, "utf8"));

    assert.equal(result.action, "merged");
    assert.equal(result.ready, true);
    assert.equal(data.otherSetting, true);
    assert.equal(Array.isArray(data.mcpServers), false);
    assert.equal(data.mcpServers.telnyx.url, TELNYX_MCP_URL);
  });

  it("outputs valid JSON with --json", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const result = runWithStderr(["setup-cursor-mcp", "--dir", tempDir, "--json"]);
    assert.equal(result.status, 0);
    const data = JSON.parse(result.stdout);
    assert.equal(data.ready, true);
    assert.ok(data.path);
  });

  it("does not echo unrelated MCP server secrets in JSON output", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const cursorDir = join(tempDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          existing: {
            type: "http",
            url: "https://example.com/mcp",
            headers: { Authorization: "Bearer should-not-leak" },
          },
        },
      })
    );

    const result = runWithStderr(["setup-cursor-mcp", "--dir", tempDir, "--json"]);
    assert.equal(result.status, 0);
    const data = JSON.parse(result.stdout);
    assert.equal(data.action, "merged");
    assert.equal(data.ready, true);
    assert.equal(data.config.mcpServers.telnyx.url, TELNYX_MCP_URL);
    assert.equal(data.config.mcpServers.existing, undefined);
    assert.ok(!result.stdout.includes("should-not-leak"));
    assert.ok(!result.stdout.includes("Authorization"));
  });

  it("outputs JSON error for malformed JSON without --force", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const cursorDir = join(tempDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    writeFileSync(configPath, "{ malformed: json, ]}");

    const result = runWithStderr(["setup-cursor-mcp", "--dir", tempDir, "--json"]);
    assert.equal(result.status, 1);
    const data = JSON.parse(result.stdout);
    assert.equal(data.action, "error");
    assert.equal(data.ready, false);
    assert.ok(data.detail.includes("malformed JSON"));
  });

  it("outputs JSON created for malformed JSON with --force", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const cursorDir = join(tempDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    writeFileSync(configPath, "{ malformed: json, ]}");

    const output = run(["setup-cursor-mcp", "--dir", tempDir, "--force", "--json"]);
    const data = JSON.parse(output);
    assert.equal(data.action, "created");
    assert.equal(data.ready, true);
    assert.equal(data.config.mcpServers.telnyx.url, TELNYX_MCP_URL);
  });

  it("outputs JSON skipped when existing telnyx settings differ", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cursor-test-"));
    const cursorDir = join(tempDir, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const configPath = join(cursorDir, "mcp.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          telnyx: { type: "command", command: "telnyx", args: [] }
        }
      })
    );

    const result = runWithStderr(["setup-cursor-mcp", "--dir", tempDir, "--json"]);
    assert.equal(result.status, 1);
    const data = JSON.parse(result.stdout);
    assert.equal(data.action, "skipped");
    assert.equal(data.ready, false);
    assert.ok(data.detail.includes("different settings"));
  });
});
