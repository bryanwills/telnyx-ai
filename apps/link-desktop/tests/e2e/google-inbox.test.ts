import test from "node:test";
import assert from "node:assert/strict";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");

test("Electron Google Inbox reads threads and saves drafts through safe gog commands", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-desktop-google-inbox-e2e-"));
  const fakeGogPath = path.join(tempDir, "fake-gog.cjs");
  const fakeGogLogPath = path.join(tempDir, "fake-gog-calls.jsonl");
  const fakeGogStatePath = path.join(tempDir, "fake-gog-state.json");
  const acp = await startAgentControlPlaneMock();
  await writeFile(fakeGogPath, fakeGogScript(), { mode: 0o700 });
  await chmod(fakeGogPath, 0o700);

  const app = await launchElectron(path.join(tempDir, "user-data"), {
    GOG_ACCOUNT: "inbox.e2e@telnyx.com",
    GOG_KEYRING_PASSWORD: "inbox-e2e-password",
    LINK_DESKTOP_GOG_COMMAND: fakeGogPath,
    FAKE_GOG_LOG: fakeGogLogPath,
    FAKE_GOG_STATE: fakeGogStatePath,
    AGENT_CONTROL_PLANE_URL: acp.baseUrl,
  });

  try {
    const page = await waitForFirstWindow(app);
    await page.waitForLoadState("domcontentloaded");

    await page.locator('button.railButton[title="Inbox"]').click();
    await page.getByRole("button", { name: "Connect Inbox" }).click();
    const threadRow = page.locator(".phoneInboxThread").filter({ hasText: "Mock inbox request" });
    await threadRow.waitFor({ state: "visible", timeout: 20_000 });
    await threadRow.click();
    await page.locator(".phoneInboxMessages").getByText("Can Link draft a response for this customer?", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });

    await page.locator(".phoneInboxDraftComposer textarea").fill("Thanks for the note. I can share the SIP trunking checklist and next steps here.");
    await page.getByRole("button", { name: "Save Gmail draft" }).click();
    await waitForFakeGogCall(fakeGogLogPath, /gmail drafts create/, 20_000);

    const calls = await readFakeGogCalls(fakeGogLogPath);
    const gmailCalls = calls.filter((call) => call.args.includes("gmail"));
    assert.ok(gmailCalls.some((call) => commandString(call).includes("gmail search")));
    assert.ok(gmailCalls.some((call) => commandString(call).includes("gmail thread get")));
    assert.ok(gmailCalls.some((call) => commandString(call).includes("gmail drafts create")));
    const searchCalls = gmailCalls.filter((call) => commandString(call).includes("gmail search"));
    assert.ok(searchCalls.every((call) => commandString(call).includes("in:inbox")));
    assert.ok(searchCalls.every((call) => commandString(call).includes("is:unread")));
    assert.ok(searchCalls.every((call) => !commandString(call).includes("to:inbox.e2e@telnyx.com")));
    for (const call of gmailCalls) {
      assert.ok(call.args.includes("--gmail-no-send"), `missing --gmail-no-send in ${commandString(call)}`);
    }
    const readCalls = gmailCalls.filter((call) => commandString(call).includes("gmail search") || commandString(call).includes("gmail thread get"));
    assert.ok(readCalls.every((call) => call.args.includes("--wrap-untrusted")));
    assert.doesNotMatch(calls.map(commandString).join("\n"), /\bgmail send\b|\bdrafts send\b|\bforward\b|\bautoreply\b/i);
  } finally {
    await closeElectron(app);
    await acp.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function launchElectron(userDataDir: string, extraEnv: Record<string, string> = {}): Promise<ElectronApplication> {
  return _electron.launch({
    args: [
      path.join(appRoot, "src/main/main.js"),
      `--user-data-dir=${userDataDir}`,
    ],
    cwd: appRoot,
    env: {
      ...process.env,
      LINK_DESKTOP_RENDERER: "dist/renderer/index.html",
      TELNYX_AUTH_REV2: "google-inbox-e2e-rev2",
      SLACK_BOT_TOKEN: "",
      SLACK_USER_TOKEN: "",
      LITELLM_API_KEY: "",
      HINDSIGHT_API_KEY: "",
      GURU_USER_EMAIL: "",
      GURU_USER_TOKEN: "",
      LINEAR_API_KEY: "",
      TELNYX_API_KEY: "",
      GH_TOKEN: "",
      GITHUB_TOKEN: "",
      GOOGLE_WORKSPACE_ACCESS_TOKEN: "",
      GOOGLE_CALENDAR_ACCESS_TOKEN: "",
      GOOGLE_CONTACTS_ACCESS_TOKEN: "",
      GOOGLE_DRIVE_ACCESS_TOKEN: "",
      GOOGLE_INBOX_AGENT_CONNECTION_ID: "",
      GOOGLE_INBOX_VERIFIED_AT: "",
      ...extraEnv,
    },
  });
}

async function readFakeGogCalls(logPath: string) {
  const text = await readFile(logPath, "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { args: string[] });
}

async function waitForFakeGogCall(logPath: string, pattern: RegExp, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const calls = await readFakeGogCalls(logPath).catch(() => []);
    if (calls.some((call) => pattern.test(commandString(call)))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for fake gog command ${pattern}`);
}

function commandString(call: { args: string[] }) {
  return call.args.join(" ");
}

async function closeElectron(app: ElectronApplication) {
  try {
    await app.close();
  } catch {
    await app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => undefined);
  }
}

async function waitForFirstWindow(app: ElectronApplication): Promise<Page> {
  return Promise.race([
    app.firstWindow(),
    new Promise<Page>((_, reject) => {
      setTimeout(() => reject(new Error("Timed out waiting for the Electron main window.")), 20_000);
    }),
  ]);
}

async function startAgentControlPlaneMock() {
  const server = http.createServer((request, response) => {
    routeAgentControlPlaneMock(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate Agent Control Plane mock port.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function routeAgentControlPlaneMock(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === "/api/agents") {
    writeJson(response, { items: [] });
    return;
  }
  writeJson(response, { ok: true });
}

function writeJson(response: ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function fakeGogScript() {
  return `#!/usr/bin/env node
const fs = require("node:fs");

const args = process.argv.slice(2);
const logPath = process.env.FAKE_GOG_LOG;
const statePath = process.env.FAKE_GOG_STATE;
if (logPath) fs.appendFileSync(logPath, JSON.stringify({ args }) + "\\n");

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { gmailAuth: false };
  }
}

function writeState(state) {
  if (statePath) fs.writeFileSync(statePath, JSON.stringify(state));
}

function json(value) {
  process.stdout.write(JSON.stringify(value));
}

function flagValue(name) {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] || "";
  const prefix = name + "=";
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

if (args.includes("--help")) {
  process.stdout.write("fake gog help");
  process.exit(0);
}

const authIndex = args.indexOf("auth");
if (authIndex >= 0 && args[authIndex + 1] === "keyring" && args[authIndex + 2] === "file") {
  process.exit(0);
}

if (authIndex >= 0 && args[authIndex + 1] === "add") {
  writeState({ ...readState(), gmailAuth: true });
  json({ status: "connected" });
  process.exit(0);
}

const gmailIndex = args.indexOf("gmail");
const state = readState();
if (gmailIndex >= 0 && !state.gmailAuth) {
  process.stderr.write("Gmail is not authorized yet.");
  process.exit(1);
}

if (gmailIndex >= 0 && args[gmailIndex + 1] === "search") {
  json({
    results: [
      {
        id: "thread-e2e",
        threadId: "thread-e2e",
        messageId: "msg-e2e-1",
        subject: "Mock inbox request",
        from: "Mock Customer <mock@example.com>",
        to: "Inbox E2E <inbox.e2e@telnyx.com>",
        deliveredTo: "inbox.e2e@telnyx.com",
        date: "2026-06-13T09:00:00.000Z",
        snippet: "Can Link draft a response for this customer?",
        labels: ["INBOX", "UNREAD"]
      }
    ]
  });
  process.exit(0);
}

if (gmailIndex >= 0 && args[gmailIndex + 1] === "thread" && args[gmailIndex + 2] === "get") {
  json({
    id: "thread-e2e",
    threadId: "thread-e2e",
    messages: [
      {
        id: "msg-e2e-1",
        threadId: "thread-e2e",
        headers: [
          { name: "Subject", value: "Mock inbox request" },
          { name: "From", value: "Mock Customer <mock@example.com>" },
          { name: "To", value: "Inbox E2E <inbox.e2e@telnyx.com>" },
          { name: "Date", value: "2026-06-13T09:00:00.000Z" }
        ],
        snippet: "Can Link draft a response for this customer?",
        body: "Can Link draft a response for this customer?"
      }
    ]
  });
  process.exit(0);
}

if (gmailIndex >= 0 && args[gmailIndex + 1] === "drafts" && (args[gmailIndex + 2] === "create" || args[gmailIndex + 2] === "update")) {
  json({
    id: args[gmailIndex + 2] === "update" ? args[gmailIndex + 3] : "draft-e2e",
    message: {
      id: "draft-message-e2e",
      threadId: flagValue("--thread-id") || "thread-e2e"
    }
  });
  process.exit(0);
}

if (args.includes("calendar") || args.includes("contacts")) {
  json([]);
  process.exit(0);
}

json({});
`;
}
