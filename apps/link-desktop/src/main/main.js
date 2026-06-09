import { app, BrowserWindow, ipcMain, nativeImage, safeStorage, session, shell } from "electron";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  createDefaultToolRegistry,
  discoverSkills,
  formatSharedChannelResponse,
  InMemoryAuditLogger,
  LinkRuntime,
  metadataForTool,
} from "../../../../tools/link/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, "../../../..");
const auditLogger = new InMemoryAuditLogger();
const runtime = new LinkRuntime({ auditLogger });
const stateVersion = 5;
const defaultAgentControlPlaneUrl = "http://agent-control-plane.query.prod.telnyx.io:8000";
const defaultA2aDiscoveryUrl = "http://a2a-discovery.query.prod.telnyx.io:4000";
const defaultAuthInternalUrl = "https://auth-internal.query.prod.telnyx.io:6674";
const defaultHindsightUrl = "https://api-internal.telnyx.com/hindsight";
const defaultLinkAppPublisherUrl = "https://link-app-publisher.query.prod.telnyx.io";
const defaultLiteLlmBaseUrl = "http://litellm-aiswe.query.prod.telnyx.io:4000";
const defaultGuruApiBaseUrl = "https://api.getguru.com/api/v1";
const defaultIntercomApiBaseUrl = "https://api.intercom.io";
const defaultMintlifyApiBaseUrl = "https://api.mintlify.com";
const defaultMintlifyDocsDomain = "developers.telnyx.com";
const appIconPath = path.resolve(__dirname, "../../public/triforce-26.png");
const keyScopedHindsightBankId = "hindsight-key-scoped";
const aidaAgentId = "agent-aida";
const aidaMcpUrl = "https://api-internal.telnyx.com/aida/mcp/";
const mcpProxyFallbackServers = [];
const mcpProxyFallbackTools = [];
const telnyxDocsSources = [
  {
    id: "telnyx-support-center",
    title: "Help Center",
    url: "https://support.telnyx.com/en/",
    source: "telnyx_support",
  },
  {
    id: "telnyx-developer-docs",
    title: "Developer Docs",
    url: "https://developers.telnyx.com/docs/overview",
    source: "telnyx_developers",
  },
];
const hindsightAgentCapabilityBase =
  "Hindsight is Link's source-attributed long-term memory layer. Agents may use Hindsight recall when it is configured, must respect bank scope, user permissions, tool permissions, and customer-data boundaries, and must not claim Hindsight recall was used if Hindsight is unconfigured, unavailable, or returns no results.";
const authWebContentsIds = new Set();
const trustedRendererWebContentsIds = new Set();
const mediaPermissionNames = new Set(["media", "microphone"]);
const oktaFastPassLocalAppPermissionNames = new Set(["local-network-access", "unknown"]);
const trustedAuthHostSuffixes = [".okta.com", ".okta-emea.com", ".okta-gov.com", ".oktapreview.com", ".telnyx.com"];
const linkAppAllowedHostSuffixes = [".query.prod.telnyx.io", ".apps.telnyx.io", ".edge.telnyx.io", ".internal.telnyx.com"];
const allowedCliCommands = new Set(["hermes", "openclaw"]);
let automations = [];
let activeWork = [];
let connectorOverrides = {};
let workspaces = [];
let chatSessions = [];
let changeRequests = [];
let storedCredentials = {};
let memoryBanks = [];
let dojoState = emptyDojoState();
let workboardCards = [];
let publishedApps = [];
let onboardingState = emptyOnboardingState();
let widgetLayout = emptyWidgetLayout();
const slackAvatarCache = new Map();

const connectorCatalog = [
  {
    id: "agent-control-plane",
    name: "Agent Control Plane",
    category: "Hosted agents",
    description: "List, route to, and chat with hosted Hermes/OpenClaw agents through Link.",
    envGroups: [
      ["AGENT_CONTROL_PLANE_URL"],
      ["AGENT_CONTROL_PLANE_URL", "TELNYX_AUTH_REV2"],
    ],
    requiredAccess: ["Okta SSO via auth-internal", "optional TELNYX_ACTOR", "optional TELNYX_ON_BEHALF_OF"],
  },
  {
    id: "litellm",
    name: "Telnyx LiteLLM",
    category: "Model runtime",
    description: "Chat with Telnyx-hosted models from Link.",
    envGroups: [["LITELLM_API_KEY"]],
    requiredAccess: ["Per-user LITELLM_API_KEY from AI-swe-Agent Slack"],
  },
  {
    id: "hindsight",
    name: "Hindsight",
    category: "Memory",
    description: "Recall and inspect long-term agent memory banks.",
    envGroups: [["HINDSIGHT_API_KEY"], ["HINDSIGHT_API_URL", "HINDSIGHT_API_KEY"]],
    requiredAccess: ["Per-user bank-scoped HINDSIGHT_API_KEY from Hindsight UI"],
  },
  {
    id: "guru",
    name: "Guru",
    category: "Knowledge",
    description: "Search verified cards, docs, and knowledge-base context.",
    envGroups: [
      ["GURU_USER_EMAIL", "GURU_USER_TOKEN"],
      ["GURU_USERNAME", "GURU_USER_TOKEN"],
      ["GURU_COLLECTION_ID", "GURU_COLLECTION_TOKEN"],
    ],
    requiredAccess: ["Guru user token from Apps & Integrations", "GURU_USER_EMAIL or GURU_USERNAME"],
  },
  {
    id: "google-drive",
    name: "Google Drive",
    category: "Knowledge",
    description: "Search Google Docs, Drive files, and meeting artifacts.",
    envGroups: [["GOOGLE_DRIVE_ACCESS_TOKEN"], ["GOOGLE_WORKSPACE_ACCESS_TOKEN"]],
    requiredAccess: ["Google Drive OAuth or GOOGLE_DRIVE_ACCESS_TOKEN"],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "Calendar",
    description: "Sync meetings, availability, and call artifacts for Link calendar workflows.",
    envGroups: [["GOOGLE_WORKSPACE_ACCESS_TOKEN"], ["GOOGLE_CALENDAR_ACCESS_TOKEN"]],
    requiredAccess: ["Google Calendar OAuth or GOOGLE_WORKSPACE_ACCESS_TOKEN"],
  },
  {
    id: "telnyx-docs",
    name: "Telnyx Docs",
    category: "Knowledge",
    description: "Query Telnyx Support Center and Developer Docs, then suggest documentation updates when bot answers are wrong or incomplete.",
    envGroups: [["INTERCOM_ACCESS_TOKEN"], ["MINTLIFY_API_KEY"], ["GURU_USER_EMAIL", "GURU_USER_TOKEN"]],
    requiredAccess: ["Intercom Help Center token", "Mintlify Developer Docs token", "Guru user token", "GitHub approval for documentation PRs"],
  },
  {
    id: "github",
    name: "GitHub",
    category: "Code",
    description: "Read repositories and create admin-approved draft PRs.",
    envGroups: [["GH_TOKEN"], ["GITHUB_TOKEN"]],
    requiredAccess: ["GitHub App installation or GH_TOKEN"],
  },
  {
    id: "slack",
    name: "Slack",
    category: "Communications",
    description: "Search threads and draft approved shared-channel replies.",
    envGroups: [["SLACK_BOT_TOKEN"], ["SLACK_USER_TOKEN"]],
    requiredAccess: ["Slack workspace OAuth or SLACK_BOT_TOKEN"],
  },
  {
    id: "telnyx",
    name: "Telnyx",
    category: "Internal systems",
    description: "Use account, messaging, network, and billing context.",
    envGroups: [["TELNYX_API_KEY"]],
    requiredAccess: ["Telnyx internal API credentials"],
  },
  {
    id: "aida",
    name: "AIDA",
    category: "Agent tools",
    description: "Chat with Telnyx AIDA through OpenClaw or Hermes using the internal AIDA MCP server.",
    envGroups: [["TELNYX_API_KEY"], ["TELNYX_AUTH_REV2"]],
    requiredAccess: ["Telnyx API key or Okta session", "OpenClaw/Hermes agent runtime"],
  },
  {
    id: "mcp-proxy",
    name: "Telnyx MCP Proxy",
    category: "MCP",
    description: "Unified Telnyx MCP registry for discovering and connecting approved MCP servers.",
    envGroups: [["MCP_PROXY_URL"], ["TELNYX_AUTH_REV2"], ["TELNYX_API_KEY"]],
    requiredAccess: ["MCP_PROXY_URL or Telnyx internal default", "Okta session or Telnyx API key"],
  },
  {
    id: "link-app-publisher",
    name: "Link App Publisher",
    category: "Apps",
    description: "Publish, review, duplicate, and open private Link apps through the managed VPN-only publisher service.",
    envGroups: [["TELNYX_AUTH_REV2"], ["TELNYX_API_KEY"], ["LINK_APP_PUBLISHER_URL", "TELNYX_AUTH_REV2"], ["LINK_APP_PUBLISHER_URL", "TELNYX_API_KEY"]],
    requiredAccess: ["Company VPN", "Okta Rev2 session or Telnyx API key", "optional LINK_APP_PUBLISHER_URL override"],
  },
  {
    id: "tableau-widgets",
    name: "Tableau Widgets",
    category: "Analytics",
    description: "List and refresh standardized Link widgets from the strict-access Tableau widgets service.",
    envGroups: [["TABLEAU_WIDGETS_SERVICE_URL", "TELNYX_AUTH_REV2"], ["TABLEAU_WIDGETS_SERVICE_URL", "TELNYX_API_KEY"]],
    requiredAccess: ["TABLEAU_WIDGETS_SERVICE_URL", "Okta Rev2 session or Telnyx API key", "ACP identity and Tableau view entitlement"],
  },
  {
    id: "linear",
    name: "Linear",
    category: "Work tracking",
    description: "Search projects, issues, and planning context.",
    envGroups: [["LINEAR_API_KEY"]],
    requiredAccess: ["Linear OAuth or LINEAR_API_KEY"],
  },
];

const credentialDefinitions = [
  { id: "agent-control-plane", label: "Agent Control Plane", fields: ["AUTH_INTERNAL_URL", "TELNYX_AUTH_REV2"], help: "Okta sign-in creates the Agent Control Plane session Link uses for internal agents and tools. TELNYX_AUTH_REV2 is stored securely after sign-in." },
  { id: "mcp-proxy", label: "Telnyx MCP Proxy", fields: ["MCP_PROXY_URL"], help: "Connect Link to team-telnyx/mcp-proxy so agents discover approved MCP servers and tools through one Telnyx registry." },
  { id: "link-app-publisher", label: "Link App Publisher", fields: ["LINK_APP_PUBLISHER_URL"], help: "Optional VPN-only publisher service override. Link defaults to the internal managed publisher endpoint and authenticates with Okta Rev2 or TELNYX_API_KEY." },
  { id: "tableau-widgets", label: "Tableau Widgets", fields: ["TABLEAU_WIDGETS_SERVICE_URL"], help: "URL for the strict-access Tableau widget service. Tableau connected-app secrets stay server-side; Link sends only the signed-in user's Telnyx auth context." },
  { id: "litellm", label: "Telnyx LiteLLM", fields: ["LITELLM_API_KEY"], help: "Get your LiteLLM Key by asking the AI-swe-Agent bot for one in Slack. Link uses Agent Control Plane routes automatically for hosted Hermes and OpenClaw agents." },
  { id: "hindsight", label: "Hindsight", fields: ["HINDSIGHT_API_KEY"], help: "Per-user, bank-scoped key from the Hindsight bank API Keys tab. Hindsight infers the bank from this key." },
  { id: "linear", label: "Linear", fields: ["LINEAR_API_KEY"], help: "Linear API key for issue and project lookup." },
  { id: "telnyx", label: "Telnyx", fields: ["TELNYX_API_KEY"], help: "Telnyx API key for account, phone, messaging, and network operations." },
  { id: "github", label: "GitHub", fields: ["GH_TOKEN"], help: "Fine-grained GitHub token for approved draft PR creation." },
  { id: "slack", label: "Slack", fields: ["SLACK_USER_TOKEN", "SLACK_BOT_TOKEN"], help: "Slack user token discovers and DMs bot users; bot token can post where the app has access." },
  { id: "google-workspace", label: "Google Workspace", fields: ["GOOGLE_WORKSPACE_ACCESS_TOKEN"], help: "Connect Google Workspace so Link can load Calendar events, Drive docs, Meet artifacts, notes, and transcripts for your agents." },
];

function createWindow() {
  const appIcon = nativeImage.createFromPath(appIconPath);
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 760,
    title: "Telnyx Link",
    icon: appIcon,
    backgroundColor: "#f7f6f4",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 12, y: 9 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });
  registerTrustedRendererWindow(win);

  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(checkedRendererDevServerUrl().toString());
  } else {
    void win.loadFile(rendererFilePath());
  }
}

app.whenReady().then(async () => {
  app.setName("Telnyx Link");
  const appIcon = nativeImage.createFromPath(appIconPath);
  if (process.platform === "darwin" && !appIcon.isEmpty()) {
    app.dock.setIcon(appIcon);
  }

  await loadStoredCredentials();
  await loadDesktopState();
  configureWebPermissions();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function configureWebPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(isAllowedMediaPermission(webContents, permission) || isAllowedOktaFastPassPermissionRequest(webContents, permission, details?.requestingUrl));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => (
    isAllowedMediaPermission(webContents, permission) ||
      isAllowedOktaFastPassPermissionCheck(webContents, permission, requestingOrigin, details?.requestingUrl, details?.embeddingOrigin)
  ));
}

function isAllowedMediaPermission(webContents, permission) {
  return Boolean(webContents && trustedRendererWebContentsIds.has(webContents.id) && mediaPermissionNames.has(permission));
}

function isAllowedOktaFastPassPermissionRequest(webContents, permission, ...originInputs) {
  if (!oktaFastPassLocalAppPermissionNames.has(permission)) return false;
  if (!webContents || !authWebContentsIds.has(webContents.id)) return false;
  return [webContents.getURL(), ...originInputs].some(isTrustedOktaAuthOrigin);
}

function isAllowedOktaFastPassPermissionCheck(webContents, permission, ...originInputs) {
  if (!oktaFastPassLocalAppPermissionNames.has(permission)) return false;
  if (webContents && authWebContentsIds.has(webContents.id)) {
    return [webContents.getURL(), ...originInputs].some(isTrustedOktaAuthOrigin);
  }
  return originInputs.some(isTrustedOktaAuthOrigin);
}

function isTrustedOktaAuthOrigin(value) {
  const url = parseUrl(value);
  if (!url || url.protocol !== "https:") return false;
  const configuredAuthOrigin = parseUrl(authInternalUrl())?.origin;
  if (configuredAuthOrigin && url.origin === configuredAuthOrigin) return true;

  const hostname = url.hostname.toLowerCase();
  return trustedAuthHostSuffixes.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix));
}

function parseUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function registerTrustedRendererWindow(win) {
  const webContentsId = win.webContents.id;
  trustedRendererWebContentsIds.add(webContentsId);
  win.on("closed", () => {
    trustedRendererWebContentsIds.delete(webContentsId);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalBrowserUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isAllowedRendererNavigation(url)) return;
    event.preventDefault();
    if (isExternalBrowserUrl(url)) void shell.openExternal(url);
  });
}

function checkedRendererDevServerUrl() {
  const url = parseUrl(process.env.VITE_DEV_SERVER_URL);
  if (!url || !["http:", "https:"].includes(url.protocol) || !isLoopbackHostname(url.hostname)) {
    throw new Error("VITE_DEV_SERVER_URL must be an http(s) loopback URL.");
  }
  return url;
}

function rendererFilePath() {
  return process.env.LINK_DESKTOP_RENDERER
    ? path.resolve(process.cwd(), process.env.LINK_DESKTOP_RENDERER)
    : path.resolve(__dirname, "../../dist/renderer/index.html");
}

function isAllowedRendererNavigation(value) {
  const url = parseUrl(value);
  if (!url) return false;
  if (url.protocol === "file:") return isAllowedRendererFileUrl(url);
  const devServer = process.env.VITE_DEV_SERVER_URL ? checkedRendererDevServerUrl() : null;
  return Boolean(devServer && url.origin === devServer.origin);
}

function isAllowedRendererFileUrl(url) {
  try {
    const rendererPath = rendererFilePath();
    const rendererRoot = path.dirname(rendererPath);
    const targetPath = path.resolve(fileURLToPath(url));
    return targetPath === rendererPath || targetPath.startsWith(`${rendererRoot}${path.sep}`);
  } catch {
    return false;
  }
}

function isLoopbackHostname(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function isExternalBrowserUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && url.protocol === "https:");
}

function secureIpcHandle(channel, listener) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedIpcSender(event);
    return listener(event, ...args);
  });
}

function assertTrustedIpcSender(event) {
  if (!event?.sender || !trustedRendererWebContentsIds.has(event.sender.id)) {
    throw new Error("Rejected IPC from an untrusted renderer.");
  }
}

function registerIpc() {
  secureIpcHandle("link:chat", async (_event, prompt) => {
    const session = await sendChatMessage({ content: prompt, workspaceId: "workspace-link" });
    const lastMessage = [...session.messages].reverse().find((message) => message.role === "assistant");
    return { response: lastMessage?.content ?? "", routedTo: "Telnyx LiteLLM" };
  });

  secureIpcHandle("link:run-skill", async (_event, skillName) => runtime.runSkill(skillName, { query: skillName }, "desktop_user"));

  secureIpcHandle("link:list-skills", () => listSkills());
  secureIpcHandle("link:list-tools", () => listTools());

  secureIpcHandle("link:shared-channel-draft", (_event, input) => {
    const work = createActiveWork({
      title: input.title || "Shared-channel response draft",
      subtitle: "Shared-channel draft - Pending review",
      prompt: input.userPrompt,
      requestedAction: input.requestedAction,
      threadContext: input.threadContext,
    });
    activeWork = [work, ...activeWork];
    addWorkspaceTab("workspace-acme", {
      id: `tab-${work.id}`,
      title: work.title,
      kind: "approval",
      status: "pending",
      updatedAt: new Date().toISOString(),
    });
    void saveDesktopState();
    return work;
  });

  secureIpcHandle("link:list-active-work", () => activeWork);
  secureIpcHandle("link:decide-work", (_event, { id, decision }) => decideWork(id, decision));
  secureIpcHandle("link:list-automations", () => automations);
  secureIpcHandle("link:list-connectors", () => listConnectors());
  secureIpcHandle("link:list-credentials", () => listCredentials());
  secureIpcHandle("link:save-credential", (_event, input) => saveCredential(input));
  secureIpcHandle("link:list-onboarding", () => listOnboarding());
  secureIpcHandle("link:update-onboarding", (_event, input) => updateOnboarding(input));

  secureIpcHandle("link:update-connector-status", (_event, { id, status }) => {
    if (!connectorCatalog.some((connector) => connector.id === id)) return listConnectors();
    connectorOverrides = { ...connectorOverrides, [id]: status };
    void saveDesktopState();
    return listConnectors();
  });

  secureIpcHandle("link:list-widget-catalog", () => listWidgetCatalog());
  secureIpcHandle("link:list-widget-layout", () => listWidgetLayout());
  secureIpcHandle("link:save-widget-layout", (_event, input) => saveWidgetLayout(input));
  secureIpcHandle("link:refresh-widget-data", (_event, input) => refreshWidgetData(input));

  secureIpcHandle("link:agent-control-plane-sign-in", () => signInAgentControlPlane());
  secureIpcHandle("link:agent-control-plane-sign-out", () => signOutAgentControlPlane());
  secureIpcHandle("link:agent-control-plane-auth-status", () => getAgentControlPlaneAuthStatus());
  secureIpcHandle("link:agent-control-plane-open-setup", () => openAgentControlPlaneSetup());
  secureIpcHandle("link:list-hosted-agents", () => listHostedAgents());
  secureIpcHandle("link:list-workspaces", () => listWorkspaces());
  secureIpcHandle("link:search-explorer", (_event, input) => searchExplorer(input));
  secureIpcHandle("link:list-chat-sessions", () => chatSessions);
  secureIpcHandle("link:send-chat-message", (_event, input) => sendChatMessage(input));
  secureIpcHandle("link:rename-chat-session", (_event, input) => renameChatSession(input));
  secureIpcHandle("link:voice-transcribe", (_event, input) => transcribeAudio(input));
  secureIpcHandle("link:create-change-request", (_event, input) => createChangeRequest(input));
  secureIpcHandle("link:approve-change-request", (_event, id) => approveChangeRequest(id));
  secureIpcHandle("link:dismiss-change-request", (_event, id) => dismissChangeRequest(id));
  secureIpcHandle("link:list-change-requests", () => changeRequests);
  secureIpcHandle("link:list-agents", () => listAgents());
  secureIpcHandle("link:send-agent-message", (_event, input) => sendAgentMessage(input));
  secureIpcHandle("link:workboard-list", (_event, input) => listWorkboard(input));
  secureIpcHandle("link:workboard-create-card", (_event, input) => createWorkboardCard(input));
  secureIpcHandle("link:workboard-update-card", (_event, input) => updateWorkboardCard(input));
  secureIpcHandle("link:workboard-dispatch", (_event, input) => dispatchWorkboard(input));
  secureIpcHandle("link:phone-list-account-numbers", () => listAccountPhoneNumbers());
  secureIpcHandle("link:phone-list-assistants", () => listPhoneAssistants());
  secureIpcHandle("link:list-memory-banks", () => listMemoryBanks());
  secureIpcHandle("link:recall-memory", (_event, input) => recallMemory(input));
  secureIpcHandle("link:list-dojo-state", () => dojoState);
  secureIpcHandle("link:publisher-list-apps", () => listPublishedApps());
  secureIpcHandle("link:publisher-create-intent", (_event, input) => createPublishIntent(input));
  secureIpcHandle("link:publisher-create-version", (_event, input) => createPublishedAppVersion(input));
  secureIpcHandle("link:publisher-review-app", (_event, input) => reviewPublishedApp(input));
  secureIpcHandle("link:publisher-duplicate-app", (_event, id) => duplicatePublishedApp(id));
  secureIpcHandle("link:publisher-open-app", (_event, id) => openPublishedApp(id));
  secureIpcHandle("link:audit-events", () => auditLogger.all());
}

async function listSkills() {
  const [linkSkills, telnyxSkills] = await Promise.all([discoverSkills(), discoverTelnyxSkills()]);
  return [
    ...linkSkills.map((skill) => ({ ...skill.metadata, source: "link" })),
    ...telnyxSkills,
  ].sort((left, right) => left.name.localeCompare(right.name));
}

async function discoverTelnyxSkills() {
  const skillsRoot = path.join(repoRoot, "skills");
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true }).catch(() => []);
  const skills = [];

  for (const entry of entries) {
    const skillPath = entry.isDirectory()
      ? path.join(skillsRoot, entry.name, "SKILL.md")
      : entry.isFile() && entry.name.endsWith(".md")
        ? path.join(skillsRoot, entry.name)
        : "";
    if (!skillPath) continue;
    const markdown = await fs.readFile(skillPath, "utf8").catch(() => "");
    if (!markdown) continue;
    const metadata = parseTelnyxSkillMetadata(markdown, entry.name);
    if (metadata) skills.push(metadata);
  }

  return skills;
}

function parseTelnyxSkillMetadata(markdown, fallbackName) {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) return null;
  const text = frontmatter[1];
  const name = firstYamlValue(text, "name") || fallbackName;
  const description = yamlBlockValue(text, "description") || firstYamlValue(text, "description") || "Telnyx skill from the Git-backed skills repository.";
  const product = firstYamlValue(text, "product") || firstYamlValue(text, "metadata.product") || productFromSkillName(name);
  const language = firstYamlValue(text, "language") || firstYamlValue(text, "metadata.language") || languageFromSkillName(name);

  return {
    name,
    description,
    owner: "telnyx",
    team: product ? titleize(product) : "Telnyx",
    riskLevel: "low",
    toolsRequired: [`telnyx.${product || "api"}`],
    customerSafe: false,
    approvalRequired: false,
    source: "telnyx",
    product,
    language,
  };
}

function firstYamlValue(text, key) {
  const simpleKey = key.includes(".") ? key.split(".").pop() : key;
  const match = text.match(new RegExp(`^\\s*${simpleKey}:\\s*(.+)$`, "m"));
  if (!match) return "";
  const value = match[1].trim();
  if (value === ">-" || value === "|") return "";
  return value.replace(/^["']|["']$/g, "");
}

function yamlBlockValue(text, key) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.match(new RegExp(`^\\s*${key}:\\s*(>-|\\|)\\s*$`)));
  if (start === -1) return "";
  const output = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.includes(":")) break;
    const trimmed = line.trim();
    if (trimmed) output.push(trimmed);
  }
  return output.join(" ");
}

function productFromSkillName(name) {
  const normalized = name.replace(/^telnyx-/, "");
  return normalized.split("-").slice(0, -1).join("-") || normalized;
}

function languageFromSkillName(name) {
  const language = name.split("-").at(-1);
  return ["python", "javascript", "ruby", "go", "java", "curl"].includes(language) ? language : "guide";
}

function titleize(value) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function createActiveWork({ title, subtitle, prompt, requestedAction, threadContext }) {
  const draft = runtime.runSharedChannel({
    actorId: "desktop_user",
    channelType: "shared_customer",
    customerIdentifier: "Acme Messaging Co.",
    userPrompt: prompt,
    requestedAction,
    threadContext,
  });

  return {
    id: `work-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    subtitle,
    status: "pending",
    createdAt: new Date().toISOString(),
    summary: "Customer-visible action requires human approval before posting.",
    details: {
      ...draft,
      formatted: formatSharedChannelResponse(draft),
    },
  };
}

function decideWork(id, decision) {
  activeWork = activeWork.map((item) =>
    item.id === id
      ? {
          ...item,
          status: decision === "approve" ? "approved" : "dismissed",
          subtitle: decision === "approve" ? "Approved by human reviewer" : "Dismissed by human reviewer",
        }
      : item,
  );

  auditLogger.record({
    actorId: "desktop_user",
    surface: "desktop",
    eventType: decision === "approve" ? "approval.approved" : "approval.dismissed",
    action: "active_work_decision",
    target: id,
    metadata: { decision },
  });

  void saveDesktopState();
  return activeWork.find((item) => item.id === id);
}

async function sendChatMessage({ sessionId, workspaceId = "workspace-link", content, agentId, agentName, approvalMode = "auto", modelMode = "default-litellm", contextScope = "workspace" }) {
  const trimmed = String(content ?? "").trim();
  if (!trimmed) throw new Error("Chat message cannot be empty.");
  const targetAgent = [agentName, agentId].filter(Boolean).join(" / ") || "Personal OpenClaw";
  const assistantDisplayName = agentName || (agentId ? targetAgent : "Telnyx AI Assistant");
  const aidaRoute = isAidaAgentSelection(agentId, agentName);
  const chatSettings = `Approval mode: ${approvalMode}. Runtime route: ${modelMode}. Context scope: ${contextScope}.`;
  const docsInstruction = telnyxDocsRouteInstruction();
  const hindsightInstruction = hindsightAgentCapabilityInstruction();
  const routeInstruction = aidaRoute
    ? `${aidaAgentRouteInstruction(chatSettings)} ${docsInstruction}`
    : `Route this conversation through ${targetAgent}. ${chatSettings} ${docsInstruction}`;

  let sessionItem = chatSessions.find((item) => item.id === sessionId);
  if (!sessionItem) {
    sessionItem = {
      id: `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: trimmed.slice(0, 54),
      workspaceId,
      model: liteLlmModel(),
      status: "active",
      updatedAt: new Date().toISOString(),
      messages: [
        createMessage("system", `You are ${assistantDisplayName}. Telnyx Link is only the desktop client routing this conversation, not your assistant identity. ${routeInstruction} ${hindsightInstruction}`),
      ],
    };
    chatSessions = [sessionItem, ...chatSessions];
  }

  sessionItem.messages = [
    ...sessionItem.messages,
    createMessage("system", `Selected Link chat agent: ${targetAgent}. ${chatSettings} ${hindsightInstruction}`),
    createMessage("user", trimmed),
  ];

  const liveResponse = await runLiveChatRoute({ agentId, agentName, prompt: trimmed, messages: sessionItem.messages });
  const responseText = liveResponse.ok ? liveResponse.content : liveRuntimeUnavailableMessage(aidaRoute, liveResponse.error);
  const responseSources = await searchTelnyxDocs(trimmed, workspaceId);

  sessionItem.messages = [
    ...sessionItem.messages,
    createMessage(
      "assistant",
      responseText,
      createChatArtifacts(trimmed),
      responseSources,
      assistantDisplayName,
    ),
  ];
  sessionItem.status = "active";
  sessionItem.updatedAt = new Date().toISOString();
  sessionItem.model = liveResponse.ok ? liveResponse.route : "live-runtime-unavailable";

  addWorkspaceTab(workspaceId, {
    id: `tab-${sessionItem.id}`,
    title: sessionItem.title,
    kind: "chat",
    status: "open",
    updatedAt: sessionItem.updatedAt,
  });

  await saveDesktopState();
  return sessionItem;
}

async function renameChatSession({ sessionId, title }) {
  const trimmedTitle = String(title ?? "").trim();
  if (!sessionId) throw new Error("Session id is required.");
  if (!trimmedTitle) throw new Error("Session name cannot be empty.");

  const sessionItem = chatSessions.find((item) => item.id === sessionId);
  if (!sessionItem) throw new Error("Session not found.");

  sessionItem.title = trimmedTitle.slice(0, 120);
  sessionItem.updatedAt = new Date().toISOString();
  await saveDesktopState();
  return sessionItem;
}

function isAidaAgentSelection(agentId, agentName) {
  return [agentId, agentName].filter(Boolean).some((value) => /(^|[-_\s/])aida($|[-_\s/])/i.test(String(value)));
}

function aidaAgentRouteInstruction(chatSettings) {
  return [
    `Route this conversation through AIDA using OpenClaw or Hermes as the agent runtime. ${chatSettings}`,
    `AIDA's MCP endpoint is ${aidaMcpUrl}.`,
    "Do not ask the user to install or configure a local MCP server.",
    "The agent runtime should use the user's Telnyx auth context and call AIDA as an internal tool.",
  ].join(" ");
}

function createAidaAgentHandoff(prompt, chatSettings) {
  const authState = credentialConfigured("TELNYX_API_KEY")
    ? "TELNYX_API_KEY is available to the Link main process."
    : credentialConfigured("TELNYX_AUTH_REV2")
      ? "Okta Rev2 auth is available to the Link main process."
      : "Telnyx auth is not configured in Link yet.";
  return [
    "AIDA route selected.",
    "",
    "Link will route this request to OpenClaw/Hermes with AIDA as the target tool without requiring local MCP setup.",
    `AIDA MCP endpoint: ${aidaMcpUrl}`,
    authState,
    chatSettings,
    "",
    `User request: ${prompt}`,
  ].join("\n");
}

function liveRuntimeUnavailableMessage(aidaRoute, detail = "") {
  const suffix = detail ? `\n\nRuntime detail: ${detail}` : "";
  if (aidaRoute) {
    return `AIDA is selected, but no live agent runtime returned a response. Confirm Agent Control Plane is signed in and the selected agent is deployed with chat enabled.${suffix}`;
  }
  return `No agent runtime returned a response. Choose a hosted Hermes/OpenClaw agent or confirm your Telnyx LiteLLM API key is saved for generic chat fallback.${suffix}`;
}

function telnyxDocsRouteInstruction() {
  const sources = telnyxDocsSources.map((source) => `${source.title}: ${source.url}`).join("; ");
  return `When answering Telnyx product or implementation questions, query or cite the Telnyx documentation sources before relying on memory. Sources: ${sources}. If the user says the bot is wrong or docs are missing, help draft a documentation update suggestion for an approved GitHub PR in team-telnyx/link.`;
}

function hindsightAgentCapabilityInstruction() {
  const status = credentialConfigured("HINDSIGHT_API_KEY")
    ? "Hindsight is configured for this Link install."
    : "Hindsight can be enabled for this Link install by configuring HINDSIGHT_API_KEY.";
  return `${hindsightAgentCapabilityBase} ${status}`;
}

async function runLiveChatRoute({ agentId, agentName, prompt, messages }) {
  const agentRuntimePrompt = [
    hindsightAgentCapabilityInstruction(),
    "",
    `User request: ${prompt}`,
  ].join("\n");
  const acpResponse = await runAgentControlPlaneChat({ agentId, agentName, prompt: agentRuntimePrompt }).catch((error) => ({
    ok: false,
    error: errorMessage(error),
  }));
  if (acpResponse.ok) return acpResponse;

  const liteLlmResponse = await runLiteLlmChat(messages);
  if (liteLlmResponse.ok) return liteLlmResponse;

  return {
    ok: false,
    error: [acpResponse.error, liteLlmResponse.error].filter(Boolean).join(" "),
  };
}

async function runAgentControlPlaneChat({ agentId, agentName, prompt }) {
  if (!looksLikeUuid(agentId)) {
    return { ok: false, error: "No Agent Control Plane agent id was selected." };
  }

  const status = await getAgentControlPlaneAuthStatus();
  if (!status.ready) {
    return { ok: false, error: "Agent Control Plane is not signed in." };
  }

  const agent = await getHostedAgent(agentId);
  const agentType = String(agent.agent_type ?? agent.type ?? "").toLowerCase();
  if (agentType !== "hermes" && agentType !== "openclaw") {
    return { ok: false, error: `${agent.display_name ?? agentName ?? agentId} is not a Hermes or OpenClaw ACP agent.` };
  }

  const form = new URLSearchParams({ message: prompt });
  const headers = {
    ...(await agentControlPlaneHeaders()),
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const response = await fetch(`${status.baseUrl}/ui/agents/${agentId}/${agentType}-chat`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      ok: false,
      error: `Agent Control Plane ${agentType} chat returned ${response.status} ${response.statusText}. ${detail.slice(0, 500)}`.trim(),
    };
  }

  const payload = await response.json().catch(() => ({}));
  const content = extractChatContent(payload);
  if (!content) {
    return { ok: false, error: `Agent Control Plane ${agentType} chat returned no message content.` };
  }

  return {
    ok: true,
    content,
    route: `acp-${agentType}`,
  };
}

async function runLiteLlmChat(messages) {
  const apiKey = credentialValue("LITELLM_API_KEY");
  if (!apiKey) return { ok: false, error: "LITELLM_API_KEY is not configured." };

  const baseUrl = liteLlmBaseUrl();
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: liteLlmModel(),
        messages: messages.map((message) => ({
          role: message.role === "assistant" || message.role === "system" ? message.role : "user",
          content: message.content,
        })),
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        error: `LiteLLM ${response.status} ${response.statusText} from ${baseUrl}/chat/completions using model "${liteLlmModel()}". ${detail.slice(0, 500)}`.trim(),
      };
    }
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return { ok: false, error: `LiteLLM returned no message content for model "${liteLlmModel()}".` };
    return { ok: true, content, route: liteLlmModel() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `LiteLLM request failed: ${error.message}` : "LiteLLM request failed.",
    };
  }
}

function extractChatContent(payload) {
  if (typeof payload === "string") return payload.trim();
  if (!payload || typeof payload !== "object") return "";
  return String(
    payload.response ??
      payload.message ??
      payload.content ??
      payload.text ??
      payload.output ??
      payload.result ??
      payload.data?.response ??
      payload.data?.message ??
      payload.data?.content ??
      payload.choices?.[0]?.message?.content ??
      "",
  ).trim();
}

async function transcribeAudio(input = {}) {
  const apiKey = credentialValue("LITELLM_API_KEY");
  if (!apiKey) {
    throw new Error("Add your LiteLLM API key in Settings to use voice input.");
  }

  const audioBase64 = String(input.audioBase64 || "");
  const mimeType = String(input.mimeType || "audio/webm").split(";")[0] || "audio/webm";
  if (!audioBase64) throw new Error("No voice audio was captured.");

  const baseUrl = liteLlmBaseUrl();
  const audioBuffer = Buffer.from(audioBase64, "base64");
  if (audioBuffer.length === 0) throw new Error("No voice audio was captured.");

  const formData = new FormData();
  formData.append("model", liteLlmTranscriptionModel());
  formData.append("file", new Blob([audioBuffer], { type: mimeType }), audioFileName(mimeType));

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Voice transcription failed (${response.status}). ${body.slice(0, 180)}`.trim());
  }

  const payload = await response.json();
  const text = String(payload.text || payload.transcript || "").trim();
  if (!text) throw new Error("No speech was detected.");
  return { text };
}

function liteLlmModel() {
  return credentialValue("LITELLM_MODEL") || "GLM-5";
}

function liteLlmTranscriptionModel() {
  return process.env.LITELLM_TRANSCRIPTION_MODEL || "whisper-1";
}

function liteLlmBaseUrl() {
  return (credentialValue("LITELLM_BASE_URL") || defaultLiteLlmBaseUrl).replace(/\/$/, "").replace(/\/v1$/, "");
}

function audioFileName(mimeType) {
  if (mimeType.includes("mp4")) return "voice-input.mp4";
  if (mimeType.includes("mpeg")) return "voice-input.mp3";
  if (mimeType.includes("wav")) return "voice-input.wav";
  if (mimeType.includes("ogg")) return "voice-input.ogg";
  return "voice-input.webm";
}

function createChangeRequest(input) {
  const request = {
    id: `change-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: input.title,
    summary: input.summary,
    requestedChange: input.requestedChange,
    status: "pending_review",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceSessionId: input.sourceSessionId,
    workspaceId: input.workspaceId || "workspace-link",
    githubRepo: input.githubRepo,
  };
  changeRequests = [request, ...changeRequests];
  addWorkspaceTab(request.workspaceId, {
    id: `tab-${request.id}`,
    title: request.title,
    kind: "approval",
    status: "pending",
    updatedAt: request.updatedAt,
  });
  void saveDesktopState();
  return request;
}

async function approveChangeRequest(id) {
  const request = changeRequests.find((item) => item.id === id);
  if (!request) throw new Error(`Unknown change request: ${id}`);
  const github = await createGitHubDraftPr(request);
  changeRequests = changeRequests.map((item) =>
    item.id === id
      ? {
          ...item,
          status: "draft_pr_created",
          updatedAt: new Date().toISOString(),
          github,
        }
      : item,
  );

  auditLogger.record({
    actorId: "desktop_user",
    surface: "desktop",
    eventType: "change_request.approved",
    action: "approve_change_request",
    target: id,
    metadata: { github },
  });

  await saveDesktopState();
  return changeRequests.find((item) => item.id === id);
}

function dismissChangeRequest(id) {
  changeRequests = changeRequests.map((item) =>
    item.id === id ? { ...item, status: "dismissed", updatedAt: new Date().toISOString() } : item,
  );
  auditLogger.record({
    actorId: "desktop_user",
    surface: "desktop",
    eventType: "change_request.dismissed",
    action: "dismiss_change_request",
    target: id,
  });
  void saveDesktopState();
  return changeRequests.find((item) => item.id === id);
}

async function createGitHubDraftPr(request) {
  const token = credentialValue("GH_TOKEN") || credentialValue("GITHUB_TOKEN");
  const repo = request.githubRepo || process.env.LINK_GITHUB_REPO || process.env.GITHUB_REPOSITORY || "team-telnyx/link";
  const branch = `link/change-${request.id}`;

  if (!token || !repo || process.env.LINK_PR_MODE !== "live") {
    throw new Error("Live GitHub PR creation requires LINK_PR_MODE=live and GH_TOKEN or GITHUB_TOKEN.");
  }

  throw new Error(`Live draft PR creation for ${repo} is not implemented until Link can generate concrete file patches for ${branch}.`);
}

function listWorkspaces() {
  return workspaces.map((workspace) => ({
    ...workspace,
    activeWorkIds: Array.from(new Set([...(workspace.activeWorkIds ?? []), ...changeRequests.filter((request) => request.workspaceId === workspace.id).map((request) => request.id)])),
  }));
}

async function searchExplorer({ query = "", workspaceId } = {}) {
  const term = String(query || "").trim();
  if (!term) return [];
  const [skills, agents, guruResults, docsResults] = await Promise.all([
    listSkills(),
    listAgents(),
    searchGuru(term, workspaceId),
    searchTelnyxDocs(term, workspaceId),
  ]);
  const linkFileResults = activeWork.slice(0, 4).map((item) => ({
    id: `explorer-work-${item.id}`,
    title: `${item.title}.md`,
    source: "link_file",
    type: "file",
    permission: "allowed",
    freshness: relativeTime(item.createdAt),
    excerpt: item.summary,
    workspaceId: workspaceId || "workspace-acme",
  }));

  return [
    ...docsResults,
    ...guruResults,
    ...linkFileResults,
    ...skills.slice(0, 3).map((skill) => ({
      id: `explorer-skill-${skill.name}`,
      title: skill.name,
      source: "skill",
      type: "skill",
      permission: "allowed",
      freshness: skill.source === "telnyx" ? "Root skills repository" : "Link skill",
      excerpt: skill.description,
    })),
    ...agents.slice(0, 2).map((agent) => ({
      id: `explorer-agent-${agent.id}`,
      title: agent.displayName,
      source: "agent",
      type: "agent",
      permission: agent.available === false ? "needs_access" : "allowed",
      freshness: agent.status,
      excerpt: agent.description,
    })),
  ];
}

async function searchTelnyxDocs(term, workspaceId) {
  const trimmed = String(term || "").trim();
  if (!trimmed) return [];

  const [supportResults, developerResults] = await Promise.all([
    searchIntercomHelpCenter(trimmed, workspaceId),
    searchMintlifyDocs(trimmed, workspaceId),
  ]);
  return [...supportResults, ...developerResults];
}

async function searchIntercomHelpCenter(term, workspaceId) {
  const token = credentialValue("INTERCOM_ACCESS_TOKEN");
  if (!token) return [];

  try {
    const params = new URLSearchParams({ query: term, per_page: "10" });
    const response = await fetch(`${intercomApiBaseUrl()}/articles/search?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Intercom-Version": process.env.INTERCOM_VERSION || "2.14",
      },
    });
    if (!response.ok) return [];

    const payload = await response.json();
    const records = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.articles)
          ? payload.articles
          : [];
    return records.map((record, index) => normalizeIntercomExplorerResult(record, index, workspaceId)).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeIntercomExplorerResult(record, index, workspaceId) {
  const article = record.article ?? record.data ?? record;
  const translated = article.translated_content ?? article.translatedContent ?? {};
  const id = article.id ?? record.id ?? `intercom-${index}`;
  const title = translated.title ?? article.title ?? article.name ?? record.title ?? "Help Center article";
  const rawExcerpt = translated.body ?? translated.description ?? article.body ?? article.description ?? article.summary ?? record.snippet ?? record.text ?? "";
  const url = article.url ?? article.html_url ?? article.public_url ?? article.links?.web ?? telnyxDocsSources[0].url;
  const updatedAt = article.updated_at ?? article.updatedAt ?? record.updated_at ?? record.updatedAt;

  return {
    id: `explorer-intercom-${id}`,
    title,
    source: "telnyx_support",
    type: "doc",
    permission: "allowed",
    freshness: updatedAt ? `Intercom - ${relativeTime(updatedAt)}` : "Intercom Help Center",
    excerpt: truncateText(cleanDocText(rawExcerpt || title)),
    workspaceId: workspaceId || "workspace-link",
    url,
  };
}

async function searchMintlifyDocs(term, workspaceId) {
  const token = credentialValue("MINTLIFY_API_KEY");
  if (!token) return [];

  const domain = mintlifyDocsDomain();
  const baseUrl = mintlifyApiBaseUrl();
  const endpoints = [
    {
      method: "POST",
      url: `${baseUrl}/discovery/v1/search/${encodeURIComponent(domain)}`,
      body: JSON.stringify({ query: term, limit: 10 }),
    },
    {
      method: "GET",
      url: `${baseUrl}/discovery/v1/search/${encodeURIComponent(domain)}?${new URLSearchParams({ query: term, limit: "10" }).toString()}`,
    },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(endpoint.body ? { "Content-Type": "application/json" } : {}),
        },
        body: endpoint.body,
      });
      if (!response.ok) continue;

      const payload = await response.json();
      const records = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.results)
          ? payload.results
          : Array.isArray(payload?.hits)
            ? payload.hits
            : Array.isArray(payload)
              ? payload
              : [];
      return records.map((record, index) => normalizeMintlifyExplorerResult(record, index, workspaceId, domain)).filter(Boolean);
    } catch {
      // Try the next documented shape before giving up.
    }
  }

  return [];
}

function normalizeMintlifyExplorerResult(record, index, workspaceId, domain) {
  const doc = record.page ?? record.document ?? record;
  const id = doc.id ?? doc.url ?? doc.path ?? doc.slug ?? `mintlify-${index}`;
  const title = doc.title ?? doc.heading ?? doc.name ?? record.title ?? "Developer Docs page";
  const rawExcerpt = doc.description ?? doc.excerpt ?? doc.snippet ?? doc.content ?? doc.markdown ?? doc.text ?? record.highlight ?? "";
  const pathValue = doc.url ?? doc.href ?? doc.path ?? doc.slug ?? "";

  return {
    id: `explorer-mintlify-${id}`,
    title,
    source: "telnyx_developers",
    type: "doc",
    permission: "allowed",
    freshness: "Mintlify Developer Docs",
    excerpt: truncateText(cleanDocText(rawExcerpt || title)),
    workspaceId: workspaceId || "workspace-link",
    url: mintlifyResultUrl(pathValue, domain),
  };
}

function intercomApiBaseUrl() {
  return (process.env.INTERCOM_API_BASE_URL || defaultIntercomApiBaseUrl).replace(/\/$/, "");
}

function mintlifyApiBaseUrl() {
  return (process.env.MINTLIFY_API_BASE_URL || defaultMintlifyApiBaseUrl).replace(/\/$/, "");
}

function mintlifyDocsDomain() {
  return (credentialValue("MINTLIFY_DOMAIN") || process.env.MINTLIFY_DOMAIN || defaultMintlifyDocsDomain).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function mintlifyResultUrl(pathValue, domain) {
  if (!pathValue) return `https://${domain}`;
  if (/^https?:\/\//i.test(pathValue)) return pathValue;
  return new URL(pathValue.startsWith("/") ? pathValue : `/${pathValue}`, `https://${domain}`).toString();
}

function cleanDocText(value) {
  return stripHtml(String(value ?? "").replace(/```[\s\S]*?```/g, " "));
}

function truncateText(value, maxLength = 420) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

async function searchGuru(term, workspaceId) {
  if (!connectorReady("guru")) return [];

  try {
    const params = new URLSearchParams({
      q: term,
      searchTerms: term,
      queryType: "cards",
      maxResults: "8",
      includeCardAttributes: "true",
    });
    const response = await fetch(`${guruApiBaseUrl()}/search/query?${params.toString()}`, {
      headers: {
        Authorization: guruAuthorizationHeader(),
      },
    });
    if (!response.ok) return [];

    const payload = await response.json();
    const records = Array.isArray(payload) ? payload : payload.results ?? payload.cards ?? payload.items ?? [];
    const results = records.map((record, index) => normalizeGuruExplorerResult(record, index, workspaceId)).filter(Boolean);
    return results;
  } catch {
    return [];
  }
}

function normalizeGuruExplorerResult(record, index, workspaceId) {
  const card = record.card ?? record.content ?? record;
  const id = card.id ?? card.cardId ?? record.id ?? `guru-${index}`;
  const title = card.title ?? card.preferredPhrase ?? card.name ?? record.title ?? "Guru card";
  const excerpt = stripHtml(card.content ?? card.excerpt ?? card.summary ?? record.snippet ?? record.highlight ?? "Verified Guru knowledge card.");
  const lastModified = card.lastModified ?? card.dateModified ?? card.updatedAt ?? record.lastModified;
  const url = card.shareUrl ?? card.url ?? card.webUrl ?? record.url;
  return {
    id: `explorer-guru-${id}`,
    title,
    source: "guru",
    type: "doc",
    permission: "allowed",
    freshness: lastModified ? `Guru - ${relativeTime(lastModified)}` : "Guru user token",
    excerpt,
    workspaceId: workspaceId || "workspace-acme",
    url,
  };
}

function guruAuthorizationHeader() {
  const user = credentialValue("GURU_USER_EMAIL") || credentialValue("GURU_USERNAME") || credentialValue("GURU_COLLECTION_ID") || "";
  const token = credentialValue("GURU_USER_TOKEN") || credentialValue("GURU_COLLECTION_TOKEN") || "";
  return `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;
}

function guruApiBaseUrl() {
  return (process.env.GURU_API_BASE_URL || defaultGuruApiBaseUrl).replace(/\/$/, "");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

async function listAgents() {
  const internalAgents = [aidaAgent()];
  const slackAgents = mergeAgents(await listSlackBotAgents().catch(() => []));
  try {
    const discovered = await listA2aDiscoveryAgents();
    if (discovered.length > 0) return mergeAgents([...internalAgents, ...discovered, ...slackAgents]);
  } catch {
    // Fall through to the authenticated ACP adapter.
  }

  try {
    const status = await getAgentControlPlaneAuthStatus();
    if (!status.ready) return mergeAgents([...internalAgents, ...slackAgents]);
    const hosted = await listHostedAgents();
    return mergeAgents([
      ...internalAgents,
      ...hosted.map((agent) => ({
        ...agent,
        visibility: agent.type === "slack" ? "slack" : "public",
        source: "agent-control-plane",
        slackChannel: agent.type === "slack" ? "#telnyx-link-eng" : undefined,
      })),
      ...slackAgents,
    ]);
  } catch {
    return mergeAgents([...internalAgents, ...slackAgents]);
  }
}

function aidaAgent() {
  const available = connectorReady("aida") || connectorReady("telnyx") || connectorReady("agent-control-plane");
  return {
    id: aidaAgentId,
    name: "aida",
    displayName: "AIDA",
    description: "Ask Telnyx AIDA through OpenClaw or Hermes. The agent runtime owns the AIDA MCP call.",
    status: available ? "available" : "needs_access",
    type: "aida",
    capabilities: ["aida", "mcp", "openclaw", "hermes", "telnyx"],
    visibility: "internal",
    source: "aida",
    squad: "ai",
    audience: "internal",
    origin: "aida-mcp",
    url: aidaMcpUrl,
    available,
    requiresAuthentication: true,
    updatedAt: available ? "AIDA route ready" : "Save Telnyx API key or sign in with Okta",
  };
}

function mergeAgents(agents) {
  const byId = new Map();
  for (const agent of agents) byId.set(agent.id, agent);
  return [...byId.values()];
}

async function listSlackBotAgents() {
  const token = slackToken();
  if (!token) return [];

  const payload = await slackRequest("users.list", { limit: 200 }, "GET", token);
  const members = payload.members ?? [];
  return members
    .filter((member) => member?.is_bot && !member.deleted && member.id !== "USLACKBOT")
    .map((member) => ({
      id: `slack-${member.id}`,
      name: member.name ?? member.profile?.display_name ?? member.id,
      displayName: member.profile?.display_name || member.real_name || member.name || member.id,
      description: member.profile?.status_text || member.profile?.title || "Slack bot available to the configured Slack token.",
      status: "available",
      type: "slack",
      capabilities: ["slack", "chat", "bot"],
      visibility: "slack",
      source: "slack",
      slackUserId: member.id,
      squad: "slack",
      audience: "internal",
      origin: "slack",
      available: true,
      requiresAuthentication: true,
      updatedAt: "Slack Web API",
    }));
}

async function sendAgentMessage({ agentId, content } = {}) {
  const message = String(content || "").trim();
  if (!agentId || !message) throw new Error("Choose an agent and enter a message.");

  const agents = await listAgents();
  const agent = agents.find((item) => item.id === agentId);
  if (!agent) throw new Error("Agent not found.");
  if (agent.source !== "slack" && agent.type !== "slack") {
    throw new Error(`${agent.displayName} is not connected to a live chat adapter yet.`);
  }

  const userToken = credentialValue("SLACK_USER_TOKEN");
  const botToken = credentialValue("SLACK_BOT_TOKEN");
  const token = userToken || botToken;
  if (!token) throw new Error("Save SLACK_USER_TOKEN or SLACK_BOT_TOKEN in Settings before messaging Slack agents.");

  let channelId = agent.slackChannelId || agent.slackChannel;
  if (userToken && agent.slackUserId && !agent.slackChannelId) {
    const opened = await slackRequest("conversations.open", { users: agent.slackUserId }, "POST", userToken);
    channelId = opened.channel?.id || channelId;
  }
  if (!channelId) throw new Error("Slack could not resolve a DM or channel for this agent.");

  const posted = await slackRequest("chat.postMessage", { channel: channelId, text: message }, "POST", token);
  auditLogger.record({
    actorId: "desktop_user",
    surface: "desktop",
    eventType: "slack_agent.message_sent",
    action: "send_agent_message",
    target: agentId,
    metadata: { channelId, ts: posted.ts },
  });
  return {
    mode: "slack",
    agentId,
    channelId,
    ts: posted.ts,
    message: `Sent to ${agent.displayName}.`,
  };
}

async function slackRequest(methodName, params = {}, httpMethod = "POST", token = slackToken()) {
  if (!token) throw new Error("Slack token is not configured.");
  const url = new URL(`https://slack.com/api/${methodName}`);
  const options = {
    method: httpMethod,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (httpMethod === "GET") {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
  } else {
    options.body = JSON.stringify(params);
  }

  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`Slack ${methodName} failed: ${payload.error || response.status}`);
  }
  return payload;
}

async function slackProfileImageUrl(identity) {
  const token = slackToken();
  if (!token) return "";
  const normalizedIdentity = String(identity || "").trim();
  const cacheKey = `${normalizedIdentity || "self"}:${token.slice(-8)}`;
  if (slackAvatarCache.has(cacheKey)) return slackAvatarCache.get(cacheKey);

  try {
    let userId = "";
    if (normalizedIdentity.includes("@")) {
      const lookup = await slackRequest("users.lookupByEmail", { email: normalizedIdentity }, "GET", token);
      userId = lookup.user?.id || "";
      const profile = lookup.user?.profile;
      const directImage = profile?.image_192 || profile?.image_72 || profile?.image_48 || profile?.image_32 || "";
      if (directImage) {
        slackAvatarCache.set(cacheKey, directImage);
        return directImage;
      }
    }

    if (!userId) {
      const auth = await slackRequest("auth.test", {}, "POST", token);
      userId = auth.user_id || auth.user || "";
    }

    if (!userId) {
      slackAvatarCache.set(cacheKey, "");
      return "";
    }

    const info = await slackRequest("users.info", { user: userId }, "GET", token);
    const profile = info.user?.profile;
    const imageUrl = profile?.image_192 || profile?.image_72 || profile?.image_48 || profile?.image_32 || "";
    slackAvatarCache.set(cacheKey, imageUrl);
    return imageUrl;
  } catch {
    slackAvatarCache.set(cacheKey, "");
    return "";
  }
}

function slackToken() {
  return credentialValue("SLACK_USER_TOKEN") || credentialValue("SLACK_BOT_TOKEN");
}

const workboardProviderLabels = {
  auto: "Auto",
  hermes: "Hermes Kanban",
  openclaw: "OpenClaw Workboard",
  local: "Link local board",
};

const workboardColumnsByProvider = {
  hermes: ["triage", "todo", "ready", "running", "blocked", "done", "archived"],
  openclaw: ["triage", "backlog", "todo", "scheduled", "ready", "running", "review", "blocked", "done"],
  local: ["triage", "backlog", "todo", "scheduled", "ready", "running", "review", "blocked", "done"],
};

async function listWorkboard(input = {}) {
  const providers = await detectWorkboardProviders();
  const requested = normalizeWorkboardProvider(input.provider);
  const provider = resolveWorkboardProvider(requested, providers);

  if (provider === "hermes") {
    const hermes = providers.find((item) => item.id === "hermes");
    if (!hermes?.available) return unavailableWorkboardSnapshot("hermes", providers, hermes?.message ?? "Hermes CLI is not available.");
    try {
      return await listHermesWorkboard(input.boardId, providers);
    } catch (error) {
      return unavailableWorkboardSnapshot("hermes", providers, errorMessage(error));
    }
  }

  if (provider === "openclaw") {
    const openclaw = providers.find((item) => item.id === "openclaw");
    if (!openclaw?.available) return unavailableWorkboardSnapshot("openclaw", providers, openclaw?.message ?? "OpenClaw CLI is not available.");
    try {
      return await listOpenClawWorkboard(input.boardId, providers);
    } catch (error) {
      return unavailableWorkboardSnapshot("openclaw", providers, errorMessage(error));
    }
  }

  return localWorkboardSnapshot(providers, input.boardId);
}

async function createWorkboardCard(input = {}) {
  const provider = normalizeWorkboardProvider(input.provider);
  const resolved = provider === "auto" ? (await listWorkboard({ provider: "auto" })).provider : provider;
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Workboard card title is required.");

  if (resolved === "hermes") {
    await createHermesWorkboardCard({ ...input, title });
    return listWorkboard({ provider: "hermes", boardId: input.boardId });
  }

  if (resolved === "openclaw") {
    await createOpenClawWorkboardCard({ ...input, title });
    return listWorkboard({ provider: "openclaw", boardId: input.boardId });
  }

  const card = createLocalWorkboardCard({
    title,
    body: input.body,
    status: normalizeWorkboardStatus(input.status || "triage", "local"),
    assignee: input.assignee,
    priority: normalizeWorkboardPriority(input.priority),
    labels: normalizeLabels(input.labels),
    tenant: input.tenant,
    workspace: input.workspace,
    sourceUrl: input.sourceUrl,
  });
  workboardCards = [card, ...workboardCards];
  await saveDesktopState();
  return listWorkboard({ provider: "local", boardId: input.boardId });
}

async function updateWorkboardCard(input = {}) {
  const provider = normalizeWorkboardProvider(input.provider);
  const cardId = String(input.cardId || "").trim();
  if (!cardId) throw new Error("Workboard card id is required.");

  if (provider === "hermes") {
    await updateHermesWorkboardCard(input);
    return listWorkboard({ provider: "hermes", boardId: input.boardId });
  }

  if (provider === "openclaw") {
    throw new Error("OpenClaw Workboard card mutation is not wired yet. Use dispatch or switch to the Link local board for manual tracking.");
  }

  workboardCards = workboardCards.map((card) =>
    card.id === cardId
      ? {
          ...card,
          status: input.status ? normalizeWorkboardStatus(input.status, "local") : card.status,
          assignee: input.assignee ?? card.assignee,
          comments: input.comment ? [...(card.comments || []), String(input.comment)] : card.comments,
          updatedAt: new Date().toISOString(),
        }
      : card,
  );
  await saveDesktopState();
  return listWorkboard({ provider: "local", boardId: input.boardId });
}

async function dispatchWorkboard(input = {}) {
  const provider = normalizeWorkboardProvider(input.provider);
  if (provider === "hermes") {
    await runHermesKanban(input.boardId, ["dispatch", "--json"]);
    return listWorkboard({ provider: "hermes", boardId: input.boardId });
  }
  if (provider === "openclaw") {
    await runCli("openclaw", ["workboard", "dispatch"], 20000);
    return listWorkboard({ provider: "openclaw", boardId: input.boardId });
  }

  workboardCards = workboardCards.map((card) =>
    card.status === "ready"
      ? {
          ...card,
          status: "running",
          diagnostics: [...(card.diagnostics || []), "Link local dispatch marked this card running. No external worker was started."],
          updatedAt: new Date().toISOString(),
        }
      : card,
  );
  await saveDesktopState();
  return listWorkboard({ provider: "local", boardId: input.boardId });
}

async function detectWorkboardProviders() {
  const [hermes, openclaw] = await Promise.all([commandAvailable("hermes"), commandAvailable("openclaw")]);
  return [
    {
      id: "hermes",
      label: workboardProviderLabels.hermes,
      available: hermes,
      mode: hermes ? "native" : "unavailable",
      message: hermes ? "Hermes CLI detected. Link will use Hermes Kanban commands." : "Hermes CLI was not found on PATH.",
    },
    {
      id: "openclaw",
      label: workboardProviderLabels.openclaw,
      available: openclaw,
      mode: openclaw ? "native" : "unavailable",
      message: openclaw ? "OpenClaw CLI detected. Link will use OpenClaw Workboard commands." : "OpenClaw CLI was not found on PATH.",
    },
    {
      id: "local",
      label: workboardProviderLabels.local,
      available: true,
      mode: "fallback",
      message: "Link local board is always available and does not require Hermes or OpenClaw.",
    },
  ];
}

async function commandAvailable(command) {
  try {
    await runCli(command, ["--version"], 5000);
    return true;
  } catch {
    return false;
  }
}

function resolveWorkboardProvider(requested, providers) {
  if (requested !== "auto") return requested;
  if (providers.find((item) => item.id === "hermes")?.available) return "hermes";
  if (providers.find((item) => item.id === "openclaw")?.available) return "openclaw";
  return "local";
}

function normalizeWorkboardProvider(provider) {
  return ["auto", "hermes", "openclaw", "local"].includes(provider) ? provider : "auto";
}

function normalizeWorkboardStatus(status, provider) {
  const columns = workboardColumnsByProvider[provider] || workboardColumnsByProvider.local;
  return columns.includes(status) ? status : columns[0];
}

function normalizeWorkboardPriority(priority) {
  if (typeof priority === "number") return priority;
  return ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal";
}

function normalizeLabels(labels) {
  if (Array.isArray(labels)) return labels.map((label) => String(label).trim()).filter(Boolean);
  if (typeof labels === "string") return labels.split(",").map((label) => label.trim()).filter(Boolean);
  return [];
}

async function listHermesWorkboard(boardId, providers) {
  const board = boardId || "default";
  const [listResult, statsResult, assigneesResult, boardsResult] = await Promise.all([
    runHermesKanban(boardId, ["list", "--json"]).catch((error) => ({ error })),
    runHermesKanban(boardId, ["stats", "--json"]).catch(() => null),
    runHermesKanban(boardId, ["assignees", "--json"]).catch(() => null),
    runCli("hermes", ["kanban", "boards", "list", "--json"], 10000).catch(() => null),
  ]);
  if (listResult?.error) throw listResult.error;

  const tasks = normalizeArrayPayload(listResult);
  const cards = tasks.map((task) => normalizeHermesWorkboardCard(task, board));
  return {
    provider: "hermes",
    boardId: board,
    providers,
    boards: normalizeHermesBoards(boardsResult),
    columns: workboardColumnsByProvider.hermes,
    cards,
    assignees: normalizeAssignees(assigneesResult, cards),
    stats: normalizeWorkboardStats(statsResult, cards),
    message: "Hermes Kanban is active. Link is using the native Hermes board and dispatcher.",
  };
}

async function createHermesWorkboardCard(input) {
  const args = ["create", input.title, "--json"];
  if (input.body) args.push("--body", String(input.body));
  if (input.assignee) args.push("--assignee", String(input.assignee));
  if (input.tenant) args.push("--tenant", String(input.tenant));
  if (input.workspace) args.push("--workspace", String(input.workspace));
  if (input.priority && typeof input.priority === "number") args.push("--priority", String(input.priority));
  if (input.status === "triage") args.push("--triage");
  await runHermesKanban(input.boardId, args);
}

async function updateHermesWorkboardCard(input) {
  const cardId = String(input.cardId || "").trim();
  if (input.assignee !== undefined) await runHermesKanban(input.boardId, ["assign", cardId, input.assignee ? String(input.assignee) : "none"]);
  if (input.comment) await runHermesKanban(input.boardId, ["comment", cardId, String(input.comment), "--author", "Telnyx Link"]);
  if (!input.status) return;

  const status = normalizeWorkboardStatus(input.status, "hermes");
  if (status === "ready") await runHermesKanban(input.boardId, ["promote", cardId]);
  if (status === "done") await runHermesKanban(input.boardId, ["complete", cardId, "--result", "Marked done from Telnyx Link."]);
  if (status === "blocked") await runHermesKanban(input.boardId, ["block", cardId, input.comment || "Blocked from Telnyx Link."]);
  if (status === "archived") await runHermesKanban(input.boardId, ["archive", cardId]);
  if (status === "todo") await runHermesKanban(input.boardId, ["unblock", cardId]).catch(() => null);
}

async function runHermesKanban(boardId, args) {
  const commandArgs = ["kanban"];
  if (boardId && boardId !== "default") commandArgs.push("--board", String(boardId));
  commandArgs.push(...args);
  return runCli("hermes", commandArgs, 20000);
}

function normalizeHermesWorkboardCard(task, boardId) {
  const id = String(task.id || task.task_id || task.taskId || crypto.randomUUID());
  const status = normalizeWorkboardStatus(task.status, "hermes");
  return {
    id,
    title: String(task.title || task.name || id),
    body: task.body || task.notes || task.description,
    status,
    priority: task.priority ?? "normal",
    labels: normalizeLabels(task.labels || task.skills),
    assignee: task.assignee || task.profile || task.claim_owner,
    provider: "hermes",
    boardId,
    tenant: task.tenant,
    workspace: task.workspace,
    sourceUrl: task.source_url || task.sourceUrl,
    linkedSessionId: task.session_key || task.sessionKey,
    linkedRunId: task.run_id || task.runId,
    linkedTaskId: task.task_id || task.taskId,
    proof: normalizeLabels(task.proof),
    artifacts: normalizeLabels(task.artifacts),
    comments: normalizeLabels(task.comments),
    diagnostics: normalizeLabels(task.diagnostics),
    createdAt: task.created_at || task.createdAt || new Date().toISOString(),
    updatedAt: task.updated_at || task.updatedAt || task.last_heartbeat_at || new Date().toISOString(),
    raw: task,
  };
}

function normalizeHermesBoards(payload) {
  const boards = normalizeArrayPayload(payload);
  const normalized = boards
    .map((board) => ({
      id: String(board.slug || board.id || board.name || "default"),
      name: String(board.name || board.display_name || board.slug || "Default"),
      description: board.description,
      provider: "hermes",
    }))
    .filter((board) => board.id);
  return normalized.length > 0 ? normalized : [{ id: "default", name: "Default", provider: "hermes" }];
}

async function listOpenClawWorkboard(boardId, providers) {
  const result = await runCli("openclaw", ["workboard", "list", "--json"], 20000);
  const cards = normalizeArrayPayload(result).map((card) => normalizeOpenClawWorkboardCard(card, boardId || "default"));
  return {
    provider: "openclaw",
    boardId: boardId || "default",
    providers,
    boards: [{ id: boardId || "default", name: "OpenClaw Gateway", provider: "openclaw" }],
    columns: workboardColumnsByProvider.openclaw,
    cards,
    assignees: [...new Set(cards.map((card) => card.assignee).filter(Boolean))],
    stats: normalizeWorkboardStats(null, cards),
    message: "OpenClaw Workboard is active. Link is reading the native Gateway board.",
  };
}

async function createOpenClawWorkboardCard(input) {
  const args = ["workboard", "create", input.title];
  if (input.priority) args.push("--priority", String(input.priority));
  const labels = normalizeLabels(input.labels);
  if (labels.length > 0) args.push("--labels", labels.join(","));
  await runCli("openclaw", args, 20000);
}

function normalizeOpenClawWorkboardCard(card, boardId) {
  const id = String(card.id || card.card_id || card.cardId || crypto.randomUUID());
  return {
    id,
    title: String(card.title || card.name || id),
    body: card.notes || card.body || card.description,
    status: normalizeWorkboardStatus(card.status, "openclaw"),
    priority: card.priority || "normal",
    labels: normalizeLabels(card.labels),
    assignee: card.agent_id || card.agentId || card.assignee || card.claim_owner,
    provider: "openclaw",
    boardId,
    sourceUrl: card.source_url || card.sourceUrl,
    linkedSessionId: card.session_key || card.sessionKey || card.linked_session || card.linkedSessionId,
    linkedRunId: card.run_id || card.runId,
    linkedTaskId: card.task_id || card.taskId,
    proof: normalizeLabels(card.proof),
    artifacts: normalizeLabels(card.artifacts),
    comments: normalizeLabels(card.comments),
    diagnostics: normalizeLabels(card.diagnostics),
    createdAt: card.created_at || card.createdAt || new Date().toISOString(),
    updatedAt: card.updated_at || card.updatedAt || new Date().toISOString(),
    raw: card,
  };
}

function localWorkboardSnapshot(providers, boardId = "local") {
  return {
    provider: "local",
    boardId: boardId || "local",
    providers,
    boards: [{ id: "local", name: "Link local board", description: "Link-owned fallback board for manual monitoring.", provider: "local" }],
    columns: workboardColumnsByProvider.local,
    cards: workboardCards,
    assignees: [...new Set(workboardCards.map((card) => card.assignee).filter(Boolean))],
    stats: normalizeWorkboardStats(null, workboardCards),
    message: "Link local board is active. Cards are stored in Link state and do not require Hermes or OpenClaw.",
  };
}

function unavailableWorkboardSnapshot(provider, providers, message) {
  return {
    provider,
    boardId: "unavailable",
    providers,
    boards: [],
    columns: workboardColumnsByProvider[provider] || workboardColumnsByProvider.local,
    cards: [],
    assignees: [],
    stats: [],
    message,
  };
}

function createLocalWorkboardCard(input) {
  const timestamp = new Date().toISOString();
  return {
    id: `card-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    title: input.title,
    body: input.body,
    status: input.status,
    priority: input.priority,
    labels: input.labels || [],
    assignee: input.assignee,
    provider: "local",
    boardId: "local",
    tenant: input.tenant,
    workspace: input.workspace,
    sourceUrl: input.sourceUrl,
    proof: [],
    artifacts: [],
    comments: [],
    diagnostics: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeArrayPayload(payload) {
  if (!payload) return [];
  if (typeof payload === "string") return normalizeArrayPayload(parseJsonOutput(payload));
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "tasks", "cards", "items", "boards", "assignees", "results"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  if (payload.card || payload.task) return [payload.card || payload.task];
  return [];
}

function normalizeAssignees(payload, cards) {
  const fromPayload = normalizeArrayPayload(payload).map((item) => String(item.name || item.assignee || item.profile || item.id || item)).filter(Boolean);
  const fromCards = cards.map((card) => card.assignee).filter(Boolean);
  return [...new Set([...fromPayload, ...fromCards])];
}

function normalizeWorkboardStats(payload, cards) {
  const statusCounts = workboardColumnsByProvider.local
    .map((status) => [status, cards.filter((card) => card.status === status).length])
    .filter(([, count]) => count > 0);
  const base = [
    { label: "Cards", value: cards.length },
    { label: "Running", value: cards.filter((card) => card.status === "running").length, tone: "success" },
    { label: "Blocked", value: cards.filter((card) => card.status === "blocked").length, tone: "warning" },
  ];
  if (!payload || typeof payload !== "object") return base;
  const extra = Object.entries(payload)
    .filter(([, value]) => typeof value === "number" || typeof value === "string")
    .slice(0, 3)
    .map(([label, value]) => ({ label: label.replaceAll("_", " "), value }));
  return extra.length > 0 ? extra : base.concat(statusCounts.slice(0, 3).map(([label, value]) => ({ label, value })));
}

async function runCli(command, args, timeout = 15000) {
  const executable = String(command || "");
  if (!allowedCliCommands.has(executable)) {
    throw new Error(`CLI command is not allowed: ${executable || "(empty)"}`);
  }

  const { stdout } = await execFileAsync(executable, Array.isArray(args) ? args.map(String) : [], {
    timeout,
    maxBuffer: 1024 * 1024 * 4,
    env: process.env,
  });
  const trimmed = String(stdout || "").trim();
  return trimmed ? parseJsonOutput(trimmed) : {};
}

function parseJsonOutput(output) {
  if (typeof output !== "string") return output;
  const trimmed = output.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstObject = trimmed.indexOf("{");
    const firstArray = trimmed.indexOf("[");
    const first = [firstObject, firstArray].filter((index) => index >= 0).sort((left, right) => left - right)[0];
    if (first === undefined) return trimmed;
    return JSON.parse(trimmed.slice(first));
  }
}

function errorMessage(error) {
  if (!error) return "Unknown workboard adapter error.";
  return String(error.stderr || error.message || error);
}

async function listAccountPhoneNumbers() {
  const apiKey = requireTelnyxApiKey();
  const response = await fetch("https://api.telnyx.com/v2/phone_numbers?page[size]=100", {
    headers: telnyxHeaders(apiKey),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telnyx account numbers returned ${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  return (payload.data ?? []).map(normalizePhoneNumberOption);
}

async function listPhoneAssistants() {
  const apiKey = requireTelnyxApiKey();
  const response = await fetch("https://api.telnyx.com/v2/ai/assistants", {
    headers: telnyxHeaders(apiKey),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telnyx assistant lookup returned ${response.status}: ${detail.slice(0, 500)}`);
  }
  const payload = await response.json();
  return (payload.data ?? []).map(normalizePhoneAssistantOption).filter((assistant) => assistant.id);
}

function normalizePhoneNumberOption(number) {
  const cost = number.cost ?? number.cost_information ?? {};
  return {
    phoneNumber: number.phone_number,
    countryCode: number.country_code ?? "",
    locality: number.locality ?? number.region_information?.locality,
    region: number.administrative_area ?? number.region_information?.region,
    type: number.phone_number_type,
    features: number.features ?? [],
    monthlyCost: formatCost(cost.monthly_cost ?? cost.monthly ?? cost.recurring_cost),
    upfrontCost: formatCost(cost.upfront_cost ?? cost.upfront ?? cost.one_time_cost ?? cost.amount),
  };
}

function normalizePhoneAssistantOption(assistant) {
  return {
    id: assistant.id,
    name: assistant.name ?? assistant.display_name ?? assistant.id,
    description: assistant.description,
    status: assistant.status ?? (assistant.enabled === false ? "disabled" : "active"),
    phoneNumber: assistant.phone_number ?? assistant.phoneNumber,
  };
}

function formatCost(cost) {
  if (!cost) return undefined;
  if (typeof cost === "string") return cost;
  if (cost.amount && cost.currency) return `${cost.amount} ${cost.currency}`;
  return undefined;
}

function requireTelnyxApiKey(apiKey) {
  const key = apiKey || credentialValue("TELNYX_API_KEY") || "";
  if (!key.trim()) throw new Error("Enter a Telnyx API key to search phone numbers.");
  return key.trim();
}

function telnyxHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function telnyxRequest(apiKey, method, pathName, body) {
  const response = await fetch(`https://api.telnyx.com/v2${pathName}`, {
    method,
    headers: telnyxHeaders(apiKey),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telnyx ${method} ${pathName} returned ${response.status}: ${detail.slice(0, 700)}`);
  }
  return response.json();
}

async function listA2aDiscoveryAgents() {
  const response = await fetch(`${a2aDiscoveryUrl()}/v1/agents`);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`A2A discovery returned ${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  const records = payload.data ?? payload.items ?? payload.agents ?? [];
  return records.map(normalizeA2aAgent).filter(Boolean).sort((left, right) => {
    const squad = (left.squad ?? "").localeCompare(right.squad ?? "");
    return squad || left.displayName.localeCompare(right.displayName);
  });
}

function normalizeA2aAgent(record) {
  const card = record.agent_card ?? record.agentCard ?? {};
  const skills = Array.isArray(card.skills) ? card.skills : [];
  const toolNames = Array.isArray(record.tools) ? record.tools.map((tool) => tool.name ?? tool.id).filter(Boolean) : [];
  const capabilityNames = [
    ...skills.map((skill) => skill.name ?? skill.id).filter(Boolean),
    ...toolNames,
    card.preferredTransport,
  ].filter(Boolean);
  const id = record.agent_id ?? record.id ?? card.name;
  if (!id) return null;
  const name = card.name ?? record.name ?? id;
  const displayName = card.name ?? record.display_name ?? record.name ?? id;
  const description = card.description ?? record.description ?? "A2A-discovered Telnyx agent.";
  if (isHiddenA2aAgent({ id, name, displayName, description })) return null;

  return {
    id,
    name,
    displayName,
    description,
    status: record.available === false ? "unavailable" : "available",
    type: record.agent_type ?? record.type ?? record.origin ?? "a2a",
    capabilities: [...new Set(capabilityNames)].slice(0, 8),
    visibility: record.audience === "internal" ? "internal" : "public",
    source: "a2a-discovery",
    squad: record.squad ?? "unknown",
    audience: record.audience ?? "internal",
    origin: record.origin ?? "a2a",
    url: card.url,
    available: record.available !== false,
    requiresAuthentication: Boolean(record.requires_authentication),
    updatedAt: record.updated_at ?? record.inserted_at,
  };
}

function isHiddenA2aAgent(agent) {
  const searchable = [agent.id, agent.name, agent.displayName, agent.description].filter(Boolean).join(" ").toLowerCase();
  return /^test hermes\b/i.test(agent.name || "")
    || /^test hermes\b/i.test(agent.displayName || "")
    || searchable.includes("automated hermes health check agent");
}

async function listMemoryBanks() {
  const liveBanks = await fetchHindsightBanks();
  if (liveBanks.length > 0) return liveBanks;
  if (credentialValue("HINDSIGHT_API_KEY")) {
    return [
      {
        id: keyScopedHindsightBankId,
        name: "Key-scoped archive",
        scope: "user",
        status: "connected",
        mission: "Link uses the archive selected by the configured API key.",
        updatedAt: "Configured",
        observationCount: 0,
        sourceCount: 0,
      },
    ];
  }
  return [];
}

async function fetchHindsightBanks() {
  if (!credentialValue("HINDSIGHT_API_KEY")) return [];
  try {
    const response = await fetch(`${hindsightUrl()}/banks`, {
      headers: hindsightHeaders(),
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.items ?? payload.banks ?? []).map((bank) => ({
      id: bank.id ?? bank.name,
      name: bank.name ?? bank.id,
      scope: bank.scope ?? "workspace",
      status: "connected",
      mission: bank.mission ?? bank.config?.mission ?? "Long-term archive",
      updatedAt: bank.updated_at ?? "Live archive",
      observationCount: bank.observation_count ?? bank.memories_count ?? 0,
      sourceCount: bank.source_count ?? 0,
    }));
  } catch {
    return [];
  }
}

async function recallMemory({ query, bankId } = {}) {
  if (!credentialValue("HINDSIGHT_API_KEY") || !query) return [];
  return fetchHindsightRecall(query, bankId === keyScopedHindsightBankId ? "" : bankId);
}

async function fetchHindsightRecall(query, bankId) {
  if (!credentialValue("HINDSIGHT_API_KEY") || !query) return [];
  const body = { query };
  if (bankId) body.bank_id = bankId;
  const response = await fetch(`${hindsightUrl()}/recall`, {
    method: "POST",
    headers: hindsightHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Hindsight recall returned ${response.status}: ${detail.slice(0, 300)}`);
  }
  const payload = await response.json();
  return (payload.items ?? payload.results ?? []).map((item, index) => ({
    id: item.id ?? `hindsight-${index}`,
    bankId: item.bank_id ?? bankId ?? keyScopedHindsightBankId,
    summary: item.summary ?? item.text ?? item.content ?? "",
    evidence: item.evidence ?? item.sources ?? [],
    score: item.score ?? 0,
    source: "hindsight",
  }));
}

function hindsightHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${credentialValue("HINDSIGHT_API_KEY")}`,
  };
}

function hindsightUrl() {
  return (credentialValue("HINDSIGHT_API_URL") || defaultHindsightUrl).replace(/\/$/, "");
}

function connectorReady(id) {
  const connector = connectorCatalog.find((item) => item.id === id);
  if (!connector) return false;
  return connector.envGroups.some((group) => group.every((name) => credentialConfigured(name)));
}

function connectorCredentialMode(connector) {
  const readyGroup = connector.envGroups.find((group) => group.every((name) => credentialConfigured(name)));
  if (!readyGroup) return "live";
  return readyGroup.some((name) => process.env[name]) ? "env" : "saved";
}

async function listConnectors() {
  const acpStatus = await getAgentControlPlaneAuthStatus();
  const baseConnectors = connectorCatalog.map((connector) => {
    const ready = connectorReady(connector.id);
    const mode = connectorCredentialMode(connector);
    const acpConnectorStatus = acpStatus.ready ? "connected" : acpStatus.signedIn ? "signed_in" : null;
    const status = ready ? "connected" : connectorOverrides[connector.id] || "needs_access";
    return {
      id: connector.id,
      name: connector.name,
      category: connector.category,
      description: connector.description,
      requiredAccess: connector.requiredAccess,
      status: connector.id === "agent-control-plane" && acpConnectorStatus ? acpConnectorStatus : status,
      mode: connector.id === "agent-control-plane" && acpStatus.signedIn ? "okta" : mode,
    };
  });
  const mcpServers = await listMcpProxyServerConnectors();
  return [...baseConnectors, ...mcpServers];
}

async function listTools() {
  const registryTools = createDefaultToolRegistry().list().map(metadataForTool);
  const mcpTools = await listMcpProxyTools();
  return [...registryTools, ...mcpTools];
}

async function listWidgetCatalog() {
  const baseUrl = tableauWidgetsServiceUrl();
  if (!baseUrl) return [];
  const payload = await tableauWidgetsRequest("/api/widgets/catalog");
  const rawWidgets = Array.isArray(payload?.widgets) ? payload.widgets : Array.isArray(payload) ? payload : [];
  return rawWidgets.map(normalizeWidgetCatalogItem).filter(Boolean);
}

function listWidgetLayout() {
  return normalizeWidgetLayout(widgetLayout);
}

async function saveWidgetLayout(input = {}) {
  const requestedIds = Array.isArray(input.widgetIds) ? input.widgetIds.map(String) : [];
  const authorizedIds = new Set((await listWidgetCatalog().catch(() => [])).map((widget) => widget.id));
  widgetLayout = normalizeWidgetLayout({
    widgetIds: requestedIds.filter((id) => authorizedIds.has(id)),
    updatedAt: new Date().toISOString(),
  });
  await saveDesktopState();
  return widgetLayout;
}

async function refreshWidgetData(input = {}) {
  const widgetId = String(input.widgetId || "").trim();
  if (!widgetId) throw new Error("Widget id is required.");
  const payload = await tableauWidgetsRequest(`/api/widgets/${encodeURIComponent(widgetId)}/data`, { method: "POST" });
  return normalizeWidgetDataResult(payload?.data ?? payload);
}

async function tableauWidgetsRequest(pathname, init = {}) {
  const baseUrl = tableauWidgetsServiceUrl();
  if (!baseUrl) throw new Error("Tableau widget service is not configured.");
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...tableauWidgetHeaders(),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Tableau widget service returned ${response.status}.`);
  }
  return response.json();
}

function tableauWidgetHeaders() {
  const headers = {};
  const rev2 = credentialValue("TELNYX_AUTH_REV2");
  const token = rev2 || credentialValue("TELNYX_API_KEY");
  if (token) headers.Authorization = `Bearer ${token}`;
  if (rev2) headers["telnyx-auth-rev2"] = rev2;
  if (process.env.TELNYX_ACTOR) headers["X-Actor"] = process.env.TELNYX_ACTOR;
  if (process.env.TELNYX_ON_BEHALF_OF) headers["X-On-Behalf-Of"] = process.env.TELNYX_ON_BEHALF_OF;
  return headers;
}

function tableauWidgetsServiceUrl() {
  const value = credentialValue("TABLEAU_WIDGETS_SERVICE_URL") || process.env.TABLEAU_WIDGETS_SERVICE_URL || "";
  return value.replace(/\/$/, "");
}

function normalizeWidgetCatalogItem(item) {
  if (!item || typeof item !== "object") return null;
  const id = stringValue(item.id);
  const title = stringValue(item.title);
  const chart = item.chart && typeof item.chart === "object" ? item.chart : {};
  const yField = stringValue(chart.yField);
  if (!id || !title || !yField) return null;
  const category = ["Revenue", "Operations", "Product"].includes(item.category) ? item.category : "Operations";
  const type = ["kpi", "line", "bar", "area"].includes(chart.type) ? chart.type : "bar";
  return {
    id,
    title,
    source: "Tableau",
    category,
    description: stringValue(item.description),
    cadence: stringValue(item.cadence) || "Refreshes from Tableau",
    refreshTtlSeconds: positiveNumber(item.refreshTtlSeconds, 300),
    chart: {
      type,
      xField: stringValue(chart.xField) || undefined,
      yField,
      seriesField: stringValue(chart.seriesField) || undefined,
      metricField: stringValue(chart.metricField) || undefined,
      metricFormat: ["currency", "number", "percent"].includes(chart.metricFormat) ? chart.metricFormat : "number",
    },
  };
}

function normalizeWidgetDataResult(input) {
  const widgetId = stringValue(input?.widgetId);
  if (!widgetId) throw new Error("Tableau widget service returned data without a widget id.");
  const rows = Array.isArray(input.rows) ? input.rows.filter((row) => row && typeof row === "object") : [];
  return {
    widgetId,
    source: "Tableau",
    status: "ready",
    updatedAt: stringValue(input.updatedAt) || new Date().toISOString(),
    columns: Array.isArray(input.columns) ? input.columns.map(String) : [],
    rows,
    metric: stringValue(input.metric) || "No data",
    trend: stringValue(input.trend) || "Trend unavailable",
  };
}

function normalizeWidgetLayout(input = {}) {
  const ids = Array.isArray(input.widgetIds) ? input.widgetIds.map(String).filter(Boolean) : [];
  return {
    widgetIds: [...new Set(ids)],
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

async function listPublishedApps() {
  const liveApps = await fetchPublisherJson("/apps").then((payload) => normalizePublishedApps(payload)).catch(() => []);
  return mergePublishedApps(liveApps.length > 0 ? liveApps : defaultPublishedApps(), publishedApps);
}

async function createPublishIntent(input = {}) {
  const intent = normalizePublishIntentInput(input);
  const payload = {
    app: {
      name: intent.name,
      slug: intent.slug,
      description: intent.description,
      owner_squad: intent.ownerSquad,
      audience: intent.audience,
      app_type: intent.appType,
      access: "vpn",
      risk_level: intent.riskLevel,
      reviewers: intent.reviewers,
      env_schema: intent.envSchema,
    },
    source: {
      repo: intent.sourceRepo,
      ref: intent.sourceRef,
      subdir: intent.sourceSubdir,
    },
    build: {
      command: intent.buildCommand,
      start_command: intent.startCommand,
      output_dir: intent.outputDir,
    },
  };

  const liveResult = await fetchPublisherJson("/publish-intents", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((response) => normalizePublisherMutationResult(response, "live")).catch(() => null);

  if (liveResult) {
    auditPublisherAction("publisher.publish_intent.created", "create_publish_intent", liveResult.app.id, { mode: "live", slug: liveResult.app.slug });
    return liveResult;
  }

  const result = createLocalPublishIntent(intent);
  auditPublisherAction("publisher.publish_intent.created", "create_publish_intent", result.app.id, { mode: result.mode, slug: result.app.slug });
  await saveDesktopState();
  return result;
}

async function createPublishedAppVersion(input = {}) {
  const appId = String(input.appId || "");
  if (!appId) throw new Error("App id is required.");
  const sourceRepo = normalizeRequiredString(input.sourceRepo, "source_repo");
  if (!isSafeSourceRepoUrl(sourceRepo)) throw new Error("source_repo must be an HTTPS Git URL or git@ SSH URL.");
  const sourceRef = normalizeOptionalString(input.sourceRef) || "main";
  const sourceSubdir = normalizeOptionalString(input.sourceSubdir) || ".";

  const liveResult = await fetchPublisherJson(`/apps/${encodeURIComponent(appId)}/versions`, {
    method: "POST",
    body: JSON.stringify({
      source_repo: sourceRepo,
      source_ref: sourceRef,
      source_subdir: sourceSubdir,
      notes: normalizeOptionalString(input.notes),
    }),
  }).then((response) => normalizePublisherMutationResult(response, "live")).catch(() => null);

  if (liveResult) {
    auditPublisherAction("publisher.app.version_created", "create_app_version", appId, { mode: "live" });
    return liveResult;
  }

  const existing = findPublishedApp(appId);
  if (!existing) throw new Error("Published app not found.");
  const version = createPublisherVersion(existing.id, sourceRepo, sourceRef, sourceSubdir, "submitted");
  const app = {
    ...existing,
    status: "submitted",
    sourceRepo,
    sourceRef,
    sourceSubdir,
    latestVersion: version,
    updatedAt: new Date().toISOString(),
  };
  upsertPublishedApp(app);
  auditPublisherAction("publisher.app.version_created", "create_app_version", app.id, { mode: "local_fallback" });
  await saveDesktopState();
  return {
    mode: "local_fallback",
    message: "Publisher service was unavailable; the new version request was saved locally for review.",
    app,
    version,
  };
}

async function reviewPublishedApp(input = {}) {
  const appId = String(input.appId || "");
  const decision = String(input.decision || "");
  if (!appId) throw new Error("App id is required.");
  if (!["approve", "reject"].includes(decision)) throw new Error("Review decision must be approve or reject.");

  const liveResult = await fetchPublisherJson(`/apps/${encodeURIComponent(appId)}/reviews`, {
    method: "POST",
    body: JSON.stringify({ decision, notes: normalizeOptionalString(input.notes) }),
  }).then((response) => normalizePublisherMutationResult(response, "live")).catch(() => null);

  if (liveResult) {
    auditPublisherAction("publisher.app.reviewed", "review_app", appId, { mode: "live", decision });
    return liveResult;
  }

  const existing = findPublishedApp(appId);
  if (!existing) throw new Error("Published app not found.");
  const now = new Date().toISOString();
  const status = decision === "approve" ? "approved" : "rejected";
  const version = existing.latestVersion ? { ...existing.latestVersion, status, reviewedAt: now } : undefined;
  const app = {
    ...existing,
    status,
    latestVersion: version,
    reviewNotes: normalizeOptionalString(input.notes),
    updatedAt: now,
  };
  upsertPublishedApp(app);
  auditPublisherAction("publisher.app.reviewed", "review_app", app.id, { mode: "local_fallback", decision });
  await saveDesktopState();
  return {
    mode: "local_fallback",
    message: `Publisher service was unavailable; the app was marked ${status} locally.`,
    app,
    version,
  };
}

async function duplicatePublishedApp(id) {
  const appId = String(id || "");
  if (!appId) throw new Error("App id is required.");

  const liveResult = await fetchPublisherJson(`/apps/${encodeURIComponent(appId)}/duplicate`, {
    method: "POST",
  }).then((payload) => normalizeDuplicateResult(payload)).catch(() => null);
  if (liveResult) {
    auditPublisherAction("publisher.app.duplicated", "duplicate_app", appId, { mode: "live" });
    return liveResult;
  }

  const app = findPublishedApp(appId);
  if (!app) throw new Error("Published app not found.");
  const command = app.sourceRepo ? `git clone ${app.sourceRepo}` : "";
  auditPublisherAction("publisher.app.duplicated", "duplicate_app", app.id, { mode: "local_fallback" });
  return {
    mode: "local_fallback",
    action: app.sourceRepo ? "source_ref" : "unavailable",
    sourceRepo: app.sourceRepo,
    sourceSubdir: app.sourceSubdir,
    sourceRef: app.sourceRef,
    command,
    message: app.sourceRepo
      ? "Publisher service was unavailable; use the source reference to duplicate or fork the app."
      : "No source reference is available for this app yet.",
  };
}

async function openPublishedApp(id) {
  const appId = String(id || "");
  if (!appId) throw new Error("App id is required.");
  const app = (await listPublishedApps()).find((item) => item.id === appId || item.slug === appId);
  if (!app) throw new Error("Published app not found.");
  const url = app.vpnUrl || app.deployedUrl || app.previewUrl;
  if (!url) throw new Error("This app does not have a private VPN URL yet.");
  if (!isAllowedLinkAppUrl(url)) throw new Error("Refusing to open a non-approved Link app URL.");
  void shell.openExternal(url);
  auditPublisherAction("publisher.app.opened", "open_app", app.id, { url });
  return { opened: true, url };
}

async function listMcpProxyServerConnectors() {
  const liveServers = await fetchMcpProxyServers().catch(() => []);
  const servers = liveServers;
  const proxyReady = connectorReady("mcp-proxy");
  return servers.map((server) => {
    const active = server.status === "active";
    return {
      id: `mcp-server-${server.id}`,
      name: server.name,
      category: "MCP",
      description: server.description || `${server.name} MCP server from team-telnyx/mcp-proxy.`,
      requiredAccess: [
        `Owner squad: ${server.ownerSquad || server.owner_squad || "unknown"}`,
        `${server.toolCount ?? server.tool_count ?? 0} tools`,
        "Connected through Telnyx MCP Proxy",
      ],
      status: proxyReady && active ? "connected" : active ? "needs_access" : "requested",
      mode: "live",
    };
  });
}

async function listMcpProxyTools() {
  const liveTools = await fetchMcpProxyTools().catch(() => []);
  const tools = liveTools.map((tool) => {
        const annotations = tool.annotations || {};
        const destructive = Boolean(annotations.destructiveHint || annotations.openWorldHint);
        const readOnly = annotations.readOnlyHint !== false && !destructive;
        return {
          name: tool.functionalName || tool.functional_name || tool.originalName || tool.original_name || tool.name,
          description: tool.description || "MCP proxy tool.",
          category: inferMcpToolCategory(tool),
          visibility: "internal_only",
          capability: readOnly ? "read" : "write",
          riskLevel: destructive ? "high" : "medium",
          approvalRequired: destructive,
          outputCanBeShownExternally: false,
        };
      });
  return tools;
}

function inferMcpToolCategory(tool) {
  const source = [tool.serverName, tool.server_name, tool.functionalName, tool.functional_name, tool.originalName, tool.original_name, tool.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const match = mcpProxyFallbackServers.find((server) => source.includes(server.name.toLowerCase().replace(/\s+/g, "_")) || source.includes(server.name.toLowerCase()));
  return match?.name || "MCP";
}

async function fetchMcpProxyServers() {
  const baseUrl = mcpProxyUrl();
  if (!baseUrl) return [];
  const response = await fetch(`${baseUrl}/mcp-registry/servers`, { headers: mcpProxyHeaders() });
  if (!response.ok) throw new Error(`MCP Proxy server list failed: ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.servers) ? payload.servers : [];
}

async function fetchMcpProxyTools() {
  const baseUrl = mcpProxyUrl();
  if (!baseUrl) return [];
  const response = await fetch(`${baseUrl}/mcp-registry/tools`, { headers: mcpProxyHeaders() });
  if (!response.ok) throw new Error(`MCP Proxy tool list failed: ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.tools) ? payload.tools : [];
}

function mcpProxyUrl() {
  return (credentialValue("MCP_PROXY_URL") || process.env.MCP_PROXY_URL || "").replace(/\/$/, "");
}

function mcpProxyHeaders() {
  const headers = { Accept: "application/json" };
  const token = credentialValue("TELNYX_AUTH_REV2") || credentialValue("TELNYX_API_KEY");
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchPublisherJson(pathname, init = {}) {
  const baseUrl = linkAppPublisherUrl();
  const headers = {
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...publisherHeaders(),
    ...(init.headers || {}),
  };
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers });
  if (!response.ok) throw new Error(`Link App Publisher request failed: ${response.status}`);
  return response.json();
}

function linkAppPublisherUrl() {
  return (credentialValue("LINK_APP_PUBLISHER_URL") || process.env.LINK_APP_PUBLISHER_URL || defaultLinkAppPublisherUrl).replace(/\/$/, "");
}

function publisherHeaders() {
  const token = credentialValue("TELNYX_AUTH_REV2") || credentialValue("TELNYX_API_KEY");
  if (!token) throw new Error("Link App Publisher requires Okta Rev2 auth or TELNYX_API_KEY.");
  return { Authorization: `Bearer ${token}` };
}

function defaultPublishedApps() {
  const now = new Date().toISOString();
  return [
    {
      id: "app-carrier-readiness",
      name: "Carrier Readiness Hub",
      slug: "carrier-readiness-hub",
      description: "Check carrier launch gates, retrieve internal runbooks, and coordinate squad review before customer updates.",
      ownerSquad: "messaging-ops.squad",
      audience: "Messaging, NOC",
      appType: "web",
      access: "vpn",
      riskLevel: "medium",
      status: "deployed",
      sourceRepo: "https://github.com/team-telnyx/mcp-apps",
      sourceSubdir: "apps/carrier-readiness",
      sourceRef: "main",
      vpnUrl: "https://carrier-readiness.apps.telnyx.io",
      previewUrl: "https://carrier-readiness-preview.apps.telnyx.io",
      reviewers: ["messaging-ops.squad"],
      envSchema: ["TELNYX_AUTH_CONTEXT"],
      latestVersion: {
        id: "version-carrier-readiness-1",
        appId: "app-carrier-readiness",
        version: "2026.06.01",
        sourceRepo: "https://github.com/team-telnyx/mcp-apps",
        sourceRef: "main",
        sourceSubdir: "apps/carrier-readiness",
        status: "deployed",
        submittedAt: now,
        deployedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "app-release-desk",
      name: "Release Desk",
      slug: "release-desk",
      description: "Publish release notes, inspect pending approvals, and hand off app-specific review steps to the owning squad.",
      ownerSquad: "product-platform.squad",
      audience: "Product, Engineering",
      appType: "mcp_app",
      access: "vpn",
      riskLevel: "medium",
      status: "preview",
      sourceRepo: "https://github.com/team-telnyx/mcp-apps",
      sourceSubdir: "apps/release-desk",
      sourceRef: "main",
      previewUrl: "https://release-desk-preview.apps.telnyx.io",
      reviewers: ["product-platform.squad"],
      envSchema: ["TELNYX_AUTH_CONTEXT", "GITHUB_APP_INSTALLATION"],
      latestVersion: {
        id: "version-release-desk-1",
        appId: "app-release-desk",
        version: "2026.06.03-preview",
        sourceRepo: "https://github.com/team-telnyx/mcp-apps",
        sourceRef: "main",
        sourceSubdir: "apps/release-desk",
        status: "preview",
        submittedAt: now,
        previewUrl: "https://release-desk-preview.apps.telnyx.io",
      },
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function normalizePublishedApps(payload) {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.apps)
      ? payload.apps
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  return items.map(normalizePublishedApp).filter(Boolean);
}

function normalizePublishedApp(item) {
  if (!item || typeof item !== "object") return null;
  const name = normalizeOptionalString(item.name);
  const slug = normalizeOptionalString(item.slug) || slugify(name || item.id || "link-app");
  const id = normalizeOptionalString(item.id) || `app-${slug}`;
  const source = item.source || {};
  const build = item.build || {};
  const latestVersion = normalizePublisherVersion(item.latestVersion || item.latest_version || item.version, id);
  return {
    id,
    name: name || titleize(slug),
    slug,
    description: normalizeOptionalString(item.description) || "Private Link app.",
    ownerSquad: normalizeOptionalString(item.ownerSquad ?? item.owner_squad) || "unknown.squad",
    audience: normalizeOptionalString(item.audience) || "Telnyx",
    appType: normalizeAppType(item.appType ?? item.app_type),
    access: "vpn",
    riskLevel: normalizeRiskLevel(item.riskLevel ?? item.risk_level),
    status: normalizePublisherStatus(item.status),
    sourceRepo: normalizeOptionalString(item.sourceRepo ?? item.source_repo ?? source.repo),
    sourceRef: normalizeOptionalString(item.sourceRef ?? item.source_ref ?? source.ref),
    sourceSubdir: normalizeOptionalString(item.sourceSubdir ?? item.source_subdir ?? source.subdir),
    buildCommand: normalizeOptionalString(item.buildCommand ?? item.build_command ?? build.command),
    startCommand: normalizeOptionalString(item.startCommand ?? item.start_command ?? build.start_command),
    outputDir: normalizeOptionalString(item.outputDir ?? item.output_dir ?? build.output_dir),
    vpnUrl: normalizeOptionalString(item.vpnUrl ?? item.vpn_url ?? item.deployed_url),
    previewUrl: normalizeOptionalString(item.previewUrl ?? item.preview_url),
    deployedUrl: normalizeOptionalString(item.deployedUrl ?? item.deployed_url),
    reviewers: normalizeStringList(item.reviewers),
    envSchema: normalizeStringList(item.envSchema ?? item.env_schema),
    latestVersion,
    reviewNotes: normalizeOptionalString(item.reviewNotes ?? item.review_notes),
    createdAt: normalizeOptionalString(item.createdAt ?? item.created_at) || new Date().toISOString(),
    updatedAt: normalizeOptionalString(item.updatedAt ?? item.updated_at) || new Date().toISOString(),
  };
}

function normalizePublisherVersion(item, appId) {
  if (!item || typeof item !== "object") return undefined;
  return {
    id: normalizeOptionalString(item.id) || `version-${appId}-${Date.now()}`,
    appId: normalizeOptionalString(item.appId ?? item.app_id) || appId,
    version: normalizeOptionalString(item.version) || "draft",
    sourceRepo: normalizeOptionalString(item.sourceRepo ?? item.source_repo),
    sourceRef: normalizeOptionalString(item.sourceRef ?? item.source_ref),
    sourceSubdir: normalizeOptionalString(item.sourceSubdir ?? item.source_subdir),
    status: normalizePublisherStatus(item.status),
    submittedAt: normalizeOptionalString(item.submittedAt ?? item.submitted_at),
    reviewedAt: normalizeOptionalString(item.reviewedAt ?? item.reviewed_at),
    previewUrl: normalizeOptionalString(item.previewUrl ?? item.preview_url),
    deployedAt: normalizeOptionalString(item.deployedAt ?? item.deployed_at),
    buildLogUrl: normalizeOptionalString(item.buildLogUrl ?? item.build_log_url),
  };
}

function normalizePublisherMutationResult(payload, mode) {
  const app = normalizePublishedApp(payload?.app ?? payload?.data?.app ?? payload?.data ?? payload);
  if (!app) throw new Error("Publisher response did not include an app.");
  return {
    mode,
    message: normalizeOptionalString(payload?.message) || (mode === "live" ? "Publisher service accepted the request." : "Publisher request saved locally."),
    intentId: normalizeOptionalString(payload?.intentId ?? payload?.intent_id),
    app,
    version: normalizePublisherVersion(payload?.version ?? payload?.data?.version ?? app.latestVersion, app.id),
  };
}

function normalizeDuplicateResult(payload) {
  return {
    mode: "live",
    action: normalizeOptionalString(payload?.action) || "source_ref",
    sourceRepo: normalizeOptionalString(payload?.sourceRepo ?? payload?.source_repo),
    sourceSubdir: normalizeOptionalString(payload?.sourceSubdir ?? payload?.source_subdir),
    sourceRef: normalizeOptionalString(payload?.sourceRef ?? payload?.source_ref),
    command: normalizeOptionalString(payload?.command),
    url: normalizeOptionalString(payload?.url),
    message: normalizeOptionalString(payload?.message) || "Publisher service returned a duplication handoff.",
  };
}

function normalizePublishIntentInput(input) {
  const name = normalizeRequiredString(input.name, "name");
  const slug = slugify(normalizeOptionalString(input.slug) || name);
  const sourceRepo = normalizeRequiredString(input.sourceRepo ?? input.source_repo, "source_repo");
  if (!isSafeSourceRepoUrl(sourceRepo)) throw new Error("source_repo must be an HTTPS Git URL or git@ SSH URL.");

  const sourceSubdir = normalizeOptionalString(input.sourceSubdir ?? input.source_subdir) || ".";
  if (sourceSubdir.includes("..")) throw new Error("source_subdir cannot contain parent directory segments.");

  const buildCommand = normalizeOptionalString(input.buildCommand ?? input.build_command) || "npm run build";
  const startCommand = normalizeOptionalString(input.startCommand ?? input.start_command);
  const outputDir = normalizeOptionalString(input.outputDir ?? input.output_dir);
  if (!startCommand && !outputDir) throw new Error("Provide either start_command or output_dir.");

  return {
    name,
    slug,
    description: normalizeOptionalString(input.description) || "Private Link app.",
    ownerSquad: normalizeRequiredString(input.ownerSquad ?? input.owner_squad, "owner_squad"),
    audience: normalizeRequiredString(input.audience, "audience"),
    appType: normalizeAppType(input.appType ?? input.app_type),
    sourceRepo,
    sourceRef: normalizeOptionalString(input.sourceRef ?? input.source_ref) || "main",
    sourceSubdir,
    buildCommand,
    startCommand,
    outputDir,
    envSchema: normalizeStringList(input.envSchema ?? input.env_schema),
    reviewers: normalizeStringList(input.reviewers),
    riskLevel: normalizeRiskLevel(input.riskLevel ?? input.risk_level),
  };
}

function createLocalPublishIntent(intent) {
  const now = new Date().toISOString();
  const appId = `app-${intent.slug}`;
  const version = createPublisherVersion(appId, intent.sourceRepo, intent.sourceRef, intent.sourceSubdir, "submitted");
  const app = {
    id: appId,
    name: intent.name,
    slug: intent.slug,
    description: intent.description,
    ownerSquad: intent.ownerSquad,
    audience: intent.audience,
    appType: intent.appType,
    access: "vpn",
    riskLevel: intent.riskLevel,
    status: "submitted",
    sourceRepo: intent.sourceRepo,
    sourceRef: intent.sourceRef,
    sourceSubdir: intent.sourceSubdir,
    buildCommand: intent.buildCommand,
    startCommand: intent.startCommand,
    outputDir: intent.outputDir,
    reviewers: intent.reviewers,
    envSchema: intent.envSchema,
    latestVersion: version,
    createdAt: now,
    updatedAt: now,
  };
  upsertPublishedApp(app);
  return {
    mode: "local_fallback",
    message: "Publisher service was unavailable; the publish intent was saved locally for review.",
    intentId: `intent-${intent.slug}-${Date.now()}`,
    app,
    version,
  };
}

function createPublisherVersion(appId, sourceRepo, sourceRef, sourceSubdir, status) {
  return {
    id: `version-${appId}-${Date.now()}`,
    appId,
    version: new Date().toISOString().slice(0, 10),
    sourceRepo,
    sourceRef,
    sourceSubdir,
    status,
    submittedAt: new Date().toISOString(),
  };
}

function mergePublishedApps(baseApps, localApps) {
  const appsById = new Map();
  for (const app of [...baseApps, ...localApps].map(normalizePublishedApp).filter(Boolean)) {
    appsById.set(app.id, app);
  }
  return [...appsById.values()].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function findPublishedApp(id) {
  return mergePublishedApps(defaultPublishedApps(), publishedApps).find((item) => item.id === id || item.slug === id);
}

function upsertPublishedApp(app) {
  publishedApps = [app, ...publishedApps.filter((item) => item.id !== app.id && item.slug !== app.slug)];
}

function isAllowedLinkAppUrl(value) {
  const url = parseUrl(value);
  if (!url || url.protocol !== "https:") return false;
  return linkAppAllowedHostSuffixes.some((suffix) => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix));
}

function isSafeSourceRepoUrl(value) {
  return /^https:\/\/github\.com\/team-telnyx\/[A-Za-z0-9_.-]+(?:\.git)?(?:\/)?$/i.test(value)
    || /^git@github\.com:team-telnyx\/[A-Za-z0-9_.-]+(?:\.git)?$/i.test(value);
}

function normalizeRequiredString(value, label) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function normalizeOptionalString(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map(normalizeOptionalString).filter(Boolean);
  return normalizeOptionalString(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAppType(value) {
  return String(value || "web") === "mcp_app" ? "mcp_app" : "web";
}

function normalizeRiskLevel(value) {
  return ["low", "medium", "high"].includes(String(value)) ? String(value) : "medium";
}

function normalizePublisherStatus(value) {
  const status = String(value || "submitted").toLowerCase();
  return ["draft", "submitted", "building", "preview", "approved", "deployed", "rejected", "deprecated"].includes(status)
    ? status
    : "submitted";
}

function slugify(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!slug) throw new Error("slug is required.");
  return slug;
}

function auditPublisherAction(eventType, action, target, metadata = {}) {
  auditLogger.record({
    actorId: "desktop_user",
    surface: "desktop.publisher",
    eventType,
    action,
    target,
    metadata,
  });
}

async function signInAgentControlPlane() {
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const state = crypto.randomBytes(32).toString("base64url");
  const callbackServer = await createAuthInternalCallbackServer(state);
  const loginUrl = authInternalAuthorizationUrl(callbackServer.callbackUrl, state);
  const authWindow = new BrowserWindow({
    width: 980,
    height: 760,
    title: "Telnyx - Sign In",
    parent,
    modal: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });

  let resolved = false;
  const authWebContentsId = authWindow.webContents.id;
  authWebContentsIds.add(authWebContentsId);
  const closeCallbackServer = () => {
    callbackServer.server.close(() => undefined);
  };

  return new Promise((resolve, reject) => {
    const finishWithStatus = async () => {
      if (resolved) return;
      resolved = true;
      closeCallbackServer();
      if (!authWindow.isDestroyed()) authWindow.close();
      resolve(await getAgentControlPlaneAuthStatus());
    };

    callbackServer.callbackPromise
      .then(async ({ code, error, errorDescription }) => {
        if (error) throw new Error(`Okta rejected the sign-in: ${errorDescription || error}`);
        if (!code) throw new Error("Okta sign-in finished without an authorization code.");
        const token = await exchangeAuthInternalCode(code);
        const tar2 = await getAuthInternalTar2(token.access_token);
        await saveSecureCredential("TELNYX_AUTH_REV2", tar2);
        if (token.id) await saveSecureCredential("TELNYX_AUTH_USER_ID", token.id);
        if (token.name) await saveSecureCredential("TELNYX_AUTH_USER_NAME", token.name);
        await finishWithStatus();
      })
      .catch((error) => {
        if (!resolved) {
          resolved = true;
          closeCallbackServer();
          if (!authWindow.isDestroyed()) authWindow.close();
          reject(error);
        }
      });

    authWindow.on("closed", async () => {
      authWebContentsIds.delete(authWebContentsId);
      if (!resolved) {
        resolved = true;
        closeCallbackServer();
        resolve(await getAgentControlPlaneAuthStatus());
      }
    });

    authWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isExternalBrowserUrl(url)) void shell.openExternal(url);
      return { action: "deny" };
    });

    authWindow.webContents.on("will-navigate", (event, url) => {
      if (isAllowedAuthWindowNavigation(url, callbackServer.callbackUrl)) return;
      event.preventDefault();
      if (isExternalBrowserUrl(url)) void shell.openExternal(url);
    });

    authWindow.loadURL(loginUrl).catch((error) => {
      if (!resolved) {
        resolved = true;
        closeCallbackServer();
        if (!authWindow.isDestroyed()) authWindow.close();
        reject(error);
      }
    });
  });
}

function isAllowedAuthWindowNavigation(value, callbackUrl) {
  if (value === "about:blank") return true;
  const target = parseUrl(value);
  if (!target) return false;
  const callback = parseUrl(callbackUrl);
  if (callback && target.origin === callback.origin && target.pathname === callback.pathname) return true;
  return isTrustedOktaAuthOrigin(value);
}

function createAuthInternalCallbackServer(expectedState) {
  let resolveCallback;
  let rejectCallback;
  const callbackPromise = new Promise((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = http.createServer((request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (url.pathname !== "/auth/callback") {
        response.writeHead(404, { "Content-Type": "text/plain" });
        response.end("Not found");
        return;
      }

      const returnedState = url.searchParams.get("state");
      if (!returnedState || returnedState !== expectedState) {
        response.writeHead(400, { "Content-Type": "text/html" });
        response.end(authCallbackHtml("Sign-in failed", "Invalid state returned by auth-internal."));
        rejectCallback(new Error("Invalid state returned by auth-internal."));
        return;
      }

      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(authCallbackHtml("Signed in", "You can close this window and return to Telnyx Link."));
      resolveCallback({
        code: url.searchParams.get("code") || "",
        error: url.searchParams.get("error") || "",
        errorDescription: url.searchParams.get("error_description") || "",
      });
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/html" });
      response.end(authCallbackHtml("Sign-in failed", "Telnyx Link could not complete the local callback."));
      rejectCallback(error);
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "localhost", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => undefined);
        reject(new Error("Could not allocate a local callback port for Okta sign-in."));
        return;
      }
      resolve({
        server,
        callbackUrl: `http://localhost:${address.port}/auth/callback`,
        callbackPromise,
      });
    });
  });
}

function authCallbackHtml(title, message) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; --bg: #000; --panel: #191817; --border: #34312e; --text: #f2efea; --muted: #a49e97; --accent: #00E3AA; }
    html, body { height: 100%; }
    body { margin: 0; display: grid; place-items: center; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(440px, calc(100vw - 48px)); padding: 30px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); text-align: center; }
    .mark { width: 42px; height: 42px; margin: 0 auto 18px; border-radius: 8px; display: grid; place-items: center; background: var(--accent); color: #151410; font-weight: 900; }
    h1 { margin: 0 0 10px; font-size: 24px; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); line-height: 1.45; }
  </style>
</head>
<body>
  <main>
    <div class="mark">TL</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}

function authInternalAuthorizationUrl(callbackUrl, state) {
  const url = new URL(`${authInternalUrl()}/rev_a/authenticate`);
  url.searchParams.set("callback_uri", callbackUrl);
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeAuthInternalCode(code) {
  const url = new URL(`${authInternalUrl()}/rev_a/token`);
  url.searchParams.set("code", code);
  url.searchParams.set("source", "default");

  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`auth-internal token exchange failed with ${response.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await response.json();
  if (!payload?.access_token) {
    throw new Error("auth-internal token exchange did not return an access token.");
  }

  return {
    access_token: payload.access_token,
    id: typeof payload.id === "string" ? payload.id : "",
    name: typeof payload.name === "string" ? payload.name : "",
  };
}

async function getAuthInternalTar2(accessToken) {
  const response = await fetch(`${authInternalUrl()}/rev_a/edge_auth_internal/x`, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`auth-internal TAR2 exchange failed with ${response.status}.`);
  }

  const tar2 = response.headers.get("Telnyx-Auth-Rev2");
  if (!tar2) throw new Error("auth-internal did not return a Telnyx-Auth-Rev2 token.");
  return tar2;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getAgentControlPlaneAuthStatus() {
  const baseUrl = agentControlPlaneUrl();
  const cookies = await agentControlPlaneCookies();
  const authCookies = cookies.filter((cookie) => cookie.name !== "oauth_state");
  const actor = process.env.TELNYX_ACTOR || "";
  const onBehalfOf = process.env.TELNYX_ON_BEHALF_OF || "";
  const userId = credentialValue("TELNYX_AUTH_USER_ID");
  const userName = credentialValue("TELNYX_AUTH_USER_NAME");
  const rev2Configured = credentialConfigured("TELNYX_AUTH_REV2");
  const actorConfigured = Boolean(actor);
  const onBehalfOfConfigured = Boolean(onBehalfOf);
  const signedIn = Boolean(rev2Configured || authCookies.length > 0);
  const authMode = rev2Configured ? "rev2" : "okta";
  const ready = Boolean(signedIn || rev2Configured);
  const avatarUrl = await slackProfileImageUrl(userName || actor || userId || "");

  return {
    baseUrl,
    authMode,
    signedIn,
    ready,
    cookieCount: authCookies.length,
    actorConfigured,
    onBehalfOfConfigured,
    actor: actor || undefined,
    userId: userId || undefined,
    userName: userName || undefined,
    avatarUrl: avatarUrl || undefined,
    onBehalfOf: onBehalfOf || undefined,
    rev2Configured,
    message: ready
      ? onBehalfOfConfigured
        ? "Agent Control Plane is ready with an explicit squad context."
        : "Agent Control Plane is ready. Link will use the Okta session unless ACP requires a squad context."
      : "Sign in with Telnyx Okta to bring your agents, tasks, calls, calendar, docs, and internal tools into one secure workspace.",
  };
}

async function signOutAgentControlPlane() {
  const cookies = await agentControlPlaneCookies();
  const baseUrl = agentControlPlaneUrl();
  await Promise.all(
    cookies.map((cookie) => {
      const protocol = cookie.secure ? "https://" : "http://";
      const domain = cookie.domain?.replace(/^\./, "") || new URL(baseUrl).hostname;
      const url = `${protocol}${domain}${cookie.path || "/"}`;
      return session.defaultSession.cookies.remove(url, cookie.name).catch(() => undefined);
    }),
  );
  if (storedCredentials.TELNYX_AUTH_REV2) {
    delete storedCredentials.TELNYX_AUTH_REV2;
  }
  delete storedCredentials.TELNYX_AUTH_USER_ID;
  delete storedCredentials.TELNYX_AUTH_USER_NAME;
  await saveStoredCredentials();
  return getAgentControlPlaneAuthStatus();
}

async function openAgentControlPlaneSetup() {
  const status = await getAgentControlPlaneAuthStatus();
  if (!status.ready) throw new Error("Sign in with Okta before adding an Agent Control Plane agent.");

  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const setupUrl = agentControlPlaneSetupUrl();
  const setupWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    title: "Add Agent",
    parent,
    modal: false,
    backgroundColor: "#f7f6f4",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });

  setupWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedAgentControlPlaneSetupUrl(url)) {
      void setupWindow.loadURL(url);
    } else if (isExternalBrowserUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  setupWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedAgentControlPlaneSetupUrl(url)) {
      event.preventDefault();
      if (isExternalBrowserUrl(url)) void shell.openExternal(url);
    }
  });

  const extraHeaders = [];
  const rev2 = credentialValue("TELNYX_AUTH_REV2");
  if (rev2) extraHeaders.push(`telnyx-auth-rev2: ${rev2}`);
  if (process.env.TELNYX_ACTOR) extraHeaders.push(`X-Actor: ${process.env.TELNYX_ACTOR}`);
  if (process.env.TELNYX_ON_BEHALF_OF) extraHeaders.push(`X-On-Behalf-Of: ${process.env.TELNYX_ON_BEHALF_OF}`);

  await setupWindow.loadURL(setupUrl, extraHeaders.length ? { extraHeaders: extraHeaders.join("\n") } : undefined);
  return { url: setupUrl };
}

function isAllowedAgentControlPlaneSetupUrl(value) {
  const target = parseUrl(value);
  if (!target) return false;
  const agentControlPlaneOrigin = parseUrl(agentControlPlaneUrl())?.origin;
  const authInternalOrigin = parseUrl(authInternalUrl())?.origin;
  return Boolean(
    target.origin === agentControlPlaneOrigin ||
      target.origin === authInternalOrigin ||
      isTrustedOktaAuthOrigin(value),
  );
}

async function listHostedAgents() {
  const status = await getAgentControlPlaneAuthStatus();
  if (!status.ready) {
    throw new Error("Sign in with Okta before listing hosted agents.");
  }

  const response = await fetch(`${status.baseUrl}/api/agents?page=1&page_size=50`, {
    headers: await agentControlPlaneHeaders(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Agent Control Plane returned ${response.status}: ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  return (payload.items ?? []).map((agent) => ({
    id: agent.id,
    name: agent.name,
    displayName: agent.display_name ?? agent.name,
    description: agent.description ?? "",
    status: agent.status,
    type: agent.agent_type,
    capabilities: agent.capabilities ?? [],
  }));
}

async function getHostedAgent(agentId) {
  const status = await getAgentControlPlaneAuthStatus();
  if (!status.ready) {
    throw new Error("Sign in with Okta before loading Agent Control Plane agent details.");
  }

  const response = await fetch(`${status.baseUrl}/api/agents/${agentId}`, {
    headers: await agentControlPlaneHeaders(),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Agent Control Plane agent lookup returned ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response.json();
}

async function agentControlPlaneHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };
  if (process.env.TELNYX_ACTOR) headers["X-Actor"] = process.env.TELNYX_ACTOR;
  if (process.env.TELNYX_ON_BEHALF_OF) headers["X-On-Behalf-Of"] = process.env.TELNYX_ON_BEHALF_OF;
  const rev2 = credentialValue("TELNYX_AUTH_REV2");
  if (rev2) headers["telnyx-auth-rev2"] = rev2;

  const cookies = await agentControlPlaneCookies();
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  if (cookieHeader) headers.Cookie = cookieHeader;

  return headers;
}

async function agentControlPlaneCookies() {
  return session.defaultSession.cookies.get({ url: agentControlPlaneUrl() });
}

function agentControlPlaneUrl() {
  return (process.env.AGENT_CONTROL_PLANE_URL || defaultAgentControlPlaneUrl).replace(/\/$/, "");
}

function agentControlPlaneSetupUrl() {
  const configured = process.env.AGENT_CONTROL_PLANE_ADD_AGENT_URL;
  if (configured) return configured;
  return new URL("/agents/new", `${agentControlPlaneUrl()}/`).toString();
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function a2aDiscoveryUrl() {
  return (process.env.A2A_DISCOVERY_URL || defaultA2aDiscoveryUrl).replace(/\/$/, "");
}

function authInternalUrl() {
  return (credentialValue("AUTH_INTERNAL_URL") || defaultAuthInternalUrl).replace(/\/$/, "");
}

async function listCredentials() {
  return credentialDefinitions.map((definition) => ({
    ...definition,
    fields: definition.fields.map((name) => ({
      name,
      configured: credentialConfigured(name),
      source: process.env[name] ? "env" : storedCredentials[name] ? "saved" : "missing",
      updatedAt: storedCredentials[name]?.updatedAt,
    })),
  }));
}

async function saveCredential(input = {}) {
  const name = String(input.name || "");
  const value = String(input.value || "");
  const allowedNames = new Set(credentialDefinitions.flatMap((definition) => definition.fields));
  if (!allowedNames.has(name)) throw new Error(`Unsupported credential field: ${name}`);
  if (!value.trim()) throw new Error(`Enter a value for ${name}.`);
  await saveSecureCredential(name, value);
  return listCredentials();
}

async function saveSecureCredential(name, value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure credential storage is not available on this Mac session.");

  storedCredentials[name] = {
    encrypted: safeStorage.encryptString(value).toString("base64"),
    updatedAt: new Date().toISOString(),
  };
  await saveStoredCredentials();
}

function listOnboarding() {
  return onboardingState;
}

async function updateOnboarding(input = {}) {
  onboardingState = normalizeOnboardingState({
    ...onboardingState,
    ...(typeof input.dismissed === "boolean" ? { dismissed: input.dismissed } : {}),
    ...(typeof input.completed === "boolean" ? { completed: input.completed } : {}),
    ...(Array.isArray(input.completedStepIds) ? { completedStepIds: input.completedStepIds } : {}),
    updatedAt: new Date().toISOString(),
  });
  await saveDesktopState();
  return onboardingState;
}

function normalizeOnboardingState(input = {}) {
  return {
    dismissed: Boolean(input.dismissed),
    completed: Boolean(input.completed),
    completedStepIds: [...new Set(Array.isArray(input.completedStepIds) ? input.completedStepIds.filter(Boolean) : [])],
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

async function loadStoredCredentials() {
  try {
    const saved = JSON.parse(await fs.readFile(credentialsPath(), "utf8"));
    storedCredentials = saved && typeof saved === "object" ? saved : {};
  } catch {
    storedCredentials = {};
  }
}

async function saveStoredCredentials() {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(credentialsPath(), JSON.stringify(storedCredentials, null, 2));
}

function credentialValue(name) {
  if (process.env[name]) return process.env[name];
  const record = storedCredentials[name];
  if (!record?.encrypted) return "";
  try {
    return safeStorage.decryptString(Buffer.from(record.encrypted, "base64"));
  } catch {
    return "";
  }
}

function credentialConfigured(name) {
  return Boolean(process.env[name] || storedCredentials[name]?.encrypted);
}

async function loadDesktopState() {
  try {
    const saved = JSON.parse(await fs.readFile(statePath(), "utf8"));
    const useSavedState = saved.version === stateVersion || saved.version === 4;
    activeWork = useSavedState && Array.isArray(saved.activeWork) ? saved.activeWork : [];
    automations = useSavedState && Array.isArray(saved.automations) ? saved.automations : [];
    connectorOverrides = saved.connectorOverrides && typeof saved.connectorOverrides === "object" ? saved.connectorOverrides : {};
    changeRequests = useSavedState && Array.isArray(saved.changeRequests) ? saved.changeRequests : [];
    chatSessions = useSavedState && Array.isArray(saved.chatSessions) ? saved.chatSessions : [];
    memoryBanks = useSavedState && Array.isArray(saved.memoryBanks) ? saved.memoryBanks : [];
    dojoState = useSavedState && saved.dojoState && typeof saved.dojoState === "object" ? saved.dojoState : emptyDojoState();
    workboardCards = useSavedState && Array.isArray(saved.workboardCards) ? saved.workboardCards : [];
    publishedApps = useSavedState && Array.isArray(saved.publishedApps) ? saved.publishedApps : [];
    workspaces = useSavedState && Array.isArray(saved.workspaces) ? saved.workspaces : [];
    onboardingState = useSavedState && saved.onboardingState && typeof saved.onboardingState === "object" ? normalizeOnboardingState(saved.onboardingState) : emptyOnboardingState();
    widgetLayout = useSavedState && saved.widgetLayout && typeof saved.widgetLayout === "object" ? normalizeWidgetLayout(saved.widgetLayout) : emptyWidgetLayout();
    if (saved.version !== stateVersion) await saveDesktopState();
  } catch {
    activeWork = [];
    automations = [];
    connectorOverrides = {};
    changeRequests = [];
    chatSessions = [];
    memoryBanks = [];
    dojoState = emptyDojoState();
    workboardCards = [];
    publishedApps = [];
    workspaces = [];
    onboardingState = emptyOnboardingState();
    widgetLayout = emptyWidgetLayout();
    await saveDesktopState();
  }
}

async function saveDesktopState() {
  const payload = {
    version: stateVersion,
    updatedAt: new Date().toISOString(),
    activeWork,
    automations,
    connectorOverrides,
    workspaces,
    chatSessions,
    changeRequests,
    memoryBanks,
    dojoState,
    workboardCards,
    publishedApps,
    onboardingState,
    widgetLayout,
  };
  await fs.mkdir(path.dirname(statePath()), { recursive: true });
  await fs.writeFile(statePath(), JSON.stringify(payload, null, 2));
}

function statePath() {
  return path.join(app.getPath("userData"), "link-desktop-state.json");
}

function credentialsPath() {
  return path.join(app.getPath("userData"), "link-desktop-credentials.v1.json");
}

function emptyOnboardingState() {
  return {
    dismissed: false,
    completed: false,
    completedStepIds: [],
    updatedAt: new Date().toISOString(),
  };
}

function emptyWidgetLayout() {
  return {
    widgetIds: [],
    updatedAt: new Date().toISOString(),
  };
}

function emptyDojoState() {
  return {
    profile: {
      id: "dojo-profile-link",
      name: "Experto",
      rank: "Ready",
      masteredSkills: 0,
      nextRankAt: 0,
      focus: "Connect live skills and agents to start training.",
    },
    kits: [],
    sessions: [],
  };
}

function createWorkspaceTab(id, title, kind, status) {
  return { id, title, kind, status, updatedAt: new Date().toISOString() };
}

function addWorkspaceTab(workspaceId, tab) {
  workspaces = workspaces.map((workspace) => {
    if (workspace.id !== workspaceId) return workspace;
    const tabs = [tab, ...workspace.tabs.filter((item) => item.id !== tab.id)].slice(0, 8);
    return { ...workspace, tabs, updatedAt: tab.updatedAt };
  });
}

function createMessage(role, content, artifacts = [], sources = [], displayName = "") {
  return {
    id: `message-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    ...(displayName ? { displayName } : {}),
    ...(artifacts.length ? { artifacts } : {}),
    ...(sources.length ? { sources } : {}),
  };
}

function createChatArtifacts(prompt) {
  const text = String(prompt ?? "");
  const wantsPdf = /\bpdf\b/i.test(text);
  const wantsMarkdown = /\.md\b|\bmarkdown\b|\bmd file\b/i.test(text);
  if (!wantsPdf && !wantsMarkdown) return [];
  const createdAt = new Date().toISOString();
  const title = text.replace(/\s+/g, " ").trim().slice(0, 48) || "Link generated document";
  const content = `# ${title}\n\nGenerated from the active Link chat.\n\n## Request\n\n${text.trim() || "No prompt provided."}\n\n## Notes\n\n- Review content before sharing externally.\n- Attach sources when live connectors are available.`;
  return [
    {
      id: `artifact-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      kind: wantsPdf ? "pdf" : "markdown",
      filename: wantsPdf ? "link-generated-document.pdf" : "link-generated-document.md",
      content,
      createdAt,
    },
  ];
}

function createKit(id, name, description, mastered, total, tone) {
  return { id, name, description, mastered, total, tone };
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
