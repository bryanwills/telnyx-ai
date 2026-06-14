import test from "node:test";
import assert from "node:assert/strict";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication, type Page } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");

test("Electron Google Workspace connector is Connected only after Calendar and Contacts APIs respond", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-desktop-google-e2e-"));
  const googleApi = await startGoogleWorkspaceMock();
  const app = await launchElectron(path.join(tempDir, "user-data"), {
    GOOGLE_CALENDAR_ACCESS_TOKEN: "google-calendar-e2e-token",
    GOOGLE_CONTACTS_ACCESS_TOKEN: "google-contacts-e2e-token",
    GOOGLE_CALENDAR_API_BASE_URL: `${googleApi.baseUrl}/calendar/v3`,
    GOOGLE_PEOPLE_API_BASE_URL: `${googleApi.baseUrl}/v1`,
    AGENT_CONTROL_PLANE_URL: googleApi.baseUrl,
  });

  try {
    const page = await waitForFirstWindow(app);
    await page.waitForLoadState("domcontentloaded");

    const connectors = await page.evaluate(async () => (window as any).linkDesktop.listConnectors());
    assert.equal(connectors.find((connector: { id: string }) => connector.id === "google-calendar")?.status, "connected");

    await page.locator('button.railButton[title="Calendar"]').click();
    await page.locator(".calendarEventTable").waitFor({ state: "visible", timeout: 20_000 });
    await page.locator(".calendarEventTable").getByText("Google E2E customer sync", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
    await page.locator(".calendarResultRow").filter({ hasText: "Google E2E customer sync" }).click();
    assert.match(await page.locator(".calendarTableDetails").textContent() ?? "", /e2e.customer@example.com/);

    const contacts = await page.evaluate(async () => (window as any).linkDesktop.listGoogleContacts());
    assert.equal(contacts[0]?.name, "Google E2E Contact");
    assert.equal(contacts[0]?.phone, "+14155550123");

    assert.ok(googleApi.requests.some((request) => request.url.startsWith("/calendar/v3/calendars/primary/events")));
    assert.ok(googleApi.requests.some((request) => request.url.startsWith("/v1/people/me/connections")));
  } finally {
    await closeElectron(app);
    await googleApi.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("Electron Google Workspace connector shows Connect when API access is not verified", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-desktop-google-disconnected-e2e-"));
  const auth = await startAgentControlPlaneMock();
  const app = await launchElectron(path.join(tempDir, "user-data"), {
    AGENT_CONTROL_PLANE_URL: auth.baseUrl,
  });

  try {
    const page = await waitForFirstWindow(app);
    await page.waitForLoadState("domcontentloaded");

    const connectors = await page.evaluate(async () => (window as any).linkDesktop.listConnectors());
    assert.equal(connectors.find((connector: { id: string }) => connector.id === "google-calendar")?.status, "needs_access");

    await page.locator('button.railButton[title="Calendar"]').click();
    await page.getByText("Connect Google Workspace to show calendar events.").waitFor({ state: "visible", timeout: 20_000 });
    await page.locator(".calendarEventTable").getByText("Schedule Link training session with Pete", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
    assert.match(await page.locator(".calendarEventTable").textContent() ?? "", /Pick a time/);

    assert.doesNotMatch(await page.locator(".calendarEventTable").textContent() ?? "", /Google E2E Contact/);
  } finally {
    await closeElectron(app);
    await auth.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("Electron Calendar renders linked gog Calendar events without direct OAuth tokens", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-desktop-gog-calendar-e2e-"));
  const fakeGogPath = path.join(tempDir, "fake-gog-calendar.cjs");
  const fakeGogLogPath = path.join(tempDir, "fake-gog-calendar-calls.jsonl");
  const auth = await startAgentControlPlaneMock();
  await writeFile(fakeGogPath, fakeCalendarGogScript(), { mode: 0o700 });
  await chmod(fakeGogPath, 0o700);

  const app = await launchElectron(path.join(tempDir, "user-data"), {
    GOG_ACCOUNT: "calendar.e2e@telnyx.com",
    GOG_KEYRING_PASSWORD: "calendar-e2e-password",
    LINK_DESKTOP_GOG_COMMAND: fakeGogPath,
    FAKE_GOG_LOG: fakeGogLogPath,
    AGENT_CONTROL_PLANE_URL: auth.baseUrl,
  });

  try {
    const page = await waitForFirstWindow(app);
    await page.waitForLoadState("domcontentloaded");

    const connectors = await page.evaluate(async () => (window as any).linkDesktop.listConnectors());
    assert.equal(connectors.find((connector: { id: string }) => connector.id === "google-calendar")?.status, "connected");

    await page.locator('button.railButton[title="Calendar"]').click();
    await page.locator(".calendarEventTable").waitFor({ state: "visible", timeout: 20_000 });
    await page.locator(".calendarEventTable").getByText("Gog E2E calendar sync", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
    const tableText = await page.locator(".calendarEventTable").textContent() ?? "";
    assert.doesNotMatch(tableText, /gog.customer@example.com/);
    assert.doesNotMatch(tableText, /Schedule Link training session with Pete/);
    await page.locator(".calendarResultRow").filter({ hasText: "Gog E2E calendar sync" }).click();
    assert.match(await page.locator(".calendarTableDetails").textContent() ?? "", /gog.customer@example.com/);

    const calls = await readFakeGogCalls(fakeGogLogPath);
    assert.ok(calls.some((call) => commandString(call).includes("calendar events primary")));
  } finally {
    await closeElectron(app);
    await auth.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("Electron Calendar can invite a Telnyx Assistant bot to a Google Meet event through AgentMail and Telnyx", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-desktop-meet-invite-e2e-"));
  const services = await startMeetingInviteMock();
  const app = await launchElectron(path.join(tempDir, "user-data"), {
    GOOGLE_CALENDAR_ACCESS_TOKEN: "google-calendar-e2e-token",
    GOOGLE_CONTACTS_ACCESS_TOKEN: "google-contacts-e2e-token",
    GOOGLE_CALENDAR_API_BASE_URL: `${services.baseUrl}/calendar/v3`,
    GOOGLE_PEOPLE_API_BASE_URL: `${services.baseUrl}/v1`,
    AGENT_CONTROL_PLANE_URL: services.baseUrl,
    AGENTMAIL_API_KEY: "agentmail-e2e-key",
    AGENTMAIL_DOMAIN: "agentmail.test",
    AGENTMAIL_API_BASE_URL: `${services.baseUrl}/agentmail/v0`,
    TELNYX_API_KEY: "telnyx-e2e-key",
    TELNYX_API_BASE_URL: `${services.baseUrl}/telnyx`,
    TELNYX_VOICE_CONNECTION_ID: "voice-connection-e2e",
    TELNYX_MEET_CALLER_ID: "+15551234567",
    TELNYX_MEET_WEBHOOK_URL: "https://example.test/telnyx/webhook",
    TELNYX_MEET_CONVERSATION_RELAY_WS_URL: "wss://example.test/conversation-relay",
  });

  try {
    const page = await waitForFirstWindow(app);
    await page.waitForLoadState("domcontentloaded");

    await page.locator('button.railButton[title="Calendar"]').click();
    await page.locator(".calendarEventTable").getByText("Google E2E customer sync", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
    await page.locator(".calendarResultRow").filter({ hasText: "Google E2E customer sync" }).click();
    await page.getByRole("button", { name: "Invite bot" }).click();
    await page.locator(".meetingInviteModal").waitFor({ state: "visible", timeout: 20_000 });
    await page.locator(".meetingInviteModal select").first().selectOption("telnyx-assistant:assistant-e2e");
    await page.getByText(/Live join target: SIP/i).waitFor({ state: "visible", timeout: 20_000 });
    await page.locator(".meetingInviteModal").getByRole("button", { name: "Invite bot", exact: true }).click();
    await page.getByText("Joining", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });

    const agentMailCreate = services.requests.find((request) => request.method === "POST" && request.url === "/agentmail/v0/inboxes");
    assert.ok(agentMailCreate, "AgentMail inbox creation request was sent");
    assert.equal(agentMailCreate.body?.client_id, "telnyx-link-meeting-bot:telnyx-assistant:assistant-e2e");
    assert.equal(agentMailCreate.body?.domain, "agentmail.test");

    const calendarPatch = services.requests.find((request) => request.method === "PATCH" && request.url.startsWith("/calendar/v3/calendars/primary/events/google-e2e-event"));
    assert.ok(calendarPatch, "Calendar attendee PATCH request was sent");
    assert.match(calendarPatch.url, /sendUpdates=all/);
    assert.match(calendarPatch.url, /conferenceDataVersion=1/);
    assert.equal(calendarPatch.ifMatch, "\"google-e2e-etag\"");
    assert.deepEqual(calendarPatch.body?.attendees?.map((attendee: { email: string }) => attendee.email), [
      "e2e.customer@example.com",
      "assistant-e2e@agentmail.test",
    ]);

    const telnyxDial = services.requests.find((request) => request.method === "POST" && request.url === "/telnyx/v2/calls");
    assert.ok(telnyxDial, "Telnyx Dial request was sent");
    assert.equal(telnyxDial.body?.connection_id, "voice-connection-e2e");
    assert.equal(telnyxDial.body?.from, "+15551234567");
    assert.equal(telnyxDial.body?.to, "sip:google-e2e@meet.example.com");
    assert.equal(telnyxDial.body?.assistant?.id, "assistant-e2e");
  } finally {
    await closeElectron(app);
    await services.close();
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
      TELNYX_AUTH_REV2: "google-workspace-e2e-rev2",
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
      GOG_ACCOUNT: "",
      GOG_KEYRING_PASSWORD: "",
      AGENTMAIL_API_KEY: "",
      AGENTMAIL_DOMAIN: "",
      AGENTMAIL_API_BASE_URL: "",
      TELNYX_API_BASE_URL: "",
      TELNYX_VOICE_CONNECTION_ID: "",
      TELNYX_MEET_CALLER_ID: "",
      TELNYX_MEET_WEBHOOK_URL: "",
      TELNYX_MEET_CONVERSATION_RELAY_WS_URL: "",
      ...extraEnv,
    },
  });
}

async function openSettings(page: Page): Promise<void> {
  await page.locator('button.railButton[title="Settings"]').waitFor({ state: "visible", timeout: 20_000 });
  await page.locator('button.railButton[title="Settings"]').click();
  await page.locator(".credentialCard").filter({ hasText: "Google Workspace" }).waitFor({ state: "visible", timeout: 20_000 });
}

async function readFakeGogCalls(logPath: string) {
  const text = await readFile(logPath, "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { args: string[] });
}

function commandString(call: { args: string[] }) {
  return call.args.join(" ");
}

async function startGoogleWorkspaceMock() {
  const port = await freePort();
  const requests: Array<{ method: string; url: string; authorization: string }> = [];
  const server = http.createServer((request, response) => {
    requests.push({
      method: request.method || "GET",
      url: request.url || "/",
      authorization: String(request.headers.authorization || ""),
    });
    routeGoogleWorkspaceMock(request, response);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function routeGoogleWorkspaceMock(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === "/calendar/v3/calendars/primary/events") {
    writeJson(response, {
      items: [googleE2eCalendarEvent()],
    });
    return;
  }

  if (url.pathname === "/api/agents") {
    writeJson(response, { data: [] });
    return;
  }

  if (url.pathname === "/v1/people/me/connections") {
    writeJson(response, {
      connections: [
        {
          resourceName: "people/google-e2e-contact",
          names: [{ displayName: "Google E2E Contact" }],
          emailAddresses: [{ value: "contact.e2e@example.com" }],
          phoneNumbers: [{ canonicalForm: "+14155550123", value: "+1 415 555 0123" }],
          organizations: [{ title: "Buyer", name: "E2E Corp" }],
        },
      ],
    });
    return;
  }

  writeJson(response, { error: "not_found" }, 404);
}

async function startMeetingInviteMock() {
  const port = await freePort();
  const requests: Array<{ method: string; url: string; authorization: string; ifMatch: string; body: any }> = [];
  const server = http.createServer(async (request, response) => {
    const body = await readJsonBody(request);
    requests.push({
      method: request.method || "GET",
      url: request.url || "/",
      authorization: String(request.headers.authorization || ""),
      ifMatch: String(request.headers["if-match"] || ""),
      body,
    });
    routeMeetingInviteMock(request, response, body);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function routeMeetingInviteMock(request: IncomingMessage, response: ServerResponse, body: any) {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === "/api/agents") {
    writeJson(response, { data: [] });
    return;
  }
  if (url.pathname === "/calendar/v3/calendars/primary/events" && request.method === "GET") {
    writeJson(response, { items: [googleE2eCalendarEvent()] });
    return;
  }
  if (url.pathname === "/calendar/v3/calendars/primary/events/google-e2e-event" && request.method === "GET") {
    writeJson(response, googleE2eCalendarEvent());
    return;
  }
  if (url.pathname === "/calendar/v3/calendars/primary/events/google-e2e-event" && request.method === "PATCH") {
    writeJson(response, {
      ...googleE2eCalendarEvent(),
      etag: "\"google-e2e-etag-2\"",
      attendees: body.attendees,
    });
    return;
  }
  if (url.pathname === "/v1/people/me/connections") {
    writeJson(response, { connections: [] });
    return;
  }
  if (url.pathname === "/agentmail/v0/inboxes" && request.method === "POST") {
    writeJson(response, {
      id: "agentmail-inbox-e2e",
      client_id: body.client_id,
      email: "assistant-e2e@agentmail.test",
      username: "assistant-e2e",
      domain: "agentmail.test",
    });
    return;
  }
  if (url.pathname === "/telnyx/v2/ai/assistants") {
    writeJson(response, {
      data: [
        {
          id: "assistant-e2e",
          name: "Meet Assistant",
          description: "E2E Telnyx Assistant",
          status: "active",
        },
      ],
    });
    return;
  }
  if (url.pathname === "/telnyx/v2/calls" && request.method === "POST") {
    writeJson(response, {
      data: {
        call_control_id: "call-control-e2e",
        call_session_id: "call-session-e2e",
      },
    });
    return;
  }
  writeJson(response, { error: "not_found" }, 404);
}

async function startAgentControlPlaneMock() {
  const port = await freePort();
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/api/agents") {
      writeJson(response, { data: [] });
      return;
    }
    writeJson(response, { error: "not_found" }, 404);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function googleE2eCalendarEvent() {
  const start = new Date(Date.now() + 30_000).toISOString();
  const end = new Date(Date.now() + 30 * 60_000).toISOString();
  return {
    id: "google-e2e-event",
    etag: "\"google-e2e-etag\"",
    summary: "Google E2E customer sync",
    description: "Prep call for +14155550199.",
    start: { dateTime: start },
    end: { dateTime: end },
    attendees: [{ email: "e2e.customer@example.com" }],
    hangoutLink: "https://meet.google.com/e2e-sync",
    conferenceData: {
      entryPoints: [
        { entryPointType: "video", uri: "https://meet.google.com/e2e-sync" },
        { entryPointType: "phone", uri: "tel:+15550109999", label: "+1 555 010 9999", pin: "123456789" },
        { entryPointType: "sip", uri: "sip:google-e2e@meet.example.com", label: "Google Meet SIP" },
      ],
    },
  };
}

function fakeCalendarGogScript() {
  return `#!/usr/bin/env node
const fs = require("node:fs");

const args = process.argv.slice(2);
const logPath = process.env.FAKE_GOG_LOG;
if (logPath) fs.appendFileSync(logPath, JSON.stringify({ args }) + "\\n");

function json(value) {
  process.stdout.write(JSON.stringify(value));
}

if (args.includes("--help")) {
  process.stdout.write("fake gog help");
  process.exit(0);
}

const authIndex = args.indexOf("auth");
if (authIndex >= 0 && args[authIndex + 1] === "keyring" && args[authIndex + 2] === "file") {
  process.exit(0);
}

const calendarIndex = args.indexOf("calendar");
if (calendarIndex >= 0 && args[calendarIndex + 1] === "events") {
  const start = new Date(Date.now() + 60 * 60_000).toISOString();
  const end = new Date(Date.now() + 90 * 60_000).toISOString();
  json({
    events: [
      {
        id: "gog-calendar-e2e-event",
        title: "Gog E2E calendar sync",
        description: "Prep call for +14155550188.",
        start: { dateTime: start },
        end: { dateTime: end },
        attendees: [{ email: "gog.customer@example.com" }],
        conferenceData: {
          entryPoints: [
            { entryPointType: "video", uri: "https://meet.google.com/gog-e2e" }
          ]
        }
      }
    ]
  });
  process.exit(0);
}

if (args.includes("contacts")) {
  process.stderr.write("Contacts intentionally unavailable for Calendar-only gog test.");
  process.exit(1);
}

json({});
`;
}

async function readJsonBody(request: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return null;
  return JSON.parse(text);
}

function writeJson(response: ServerResponse, body: unknown, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
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

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a Google Workspace E2E port."));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}
