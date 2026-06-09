export type ViewId =
  | "workspaces"
  | "onboarding"
  | "widgets"
  | "explorer"
  | "chats"
  | "agents"
  | "workboard"
  | "phone"
  | "calendar"
  | "memory"
  | "dojo"
  | "settings";

export type Decision = "approve" | "dismiss";
export type ConnectionStatus = "connected" | "needs_access" | "requested" | "signed_in";
export type ConnectionMode = "env" | "saved" | "okta" | "live";

export interface SkillMetadata {
  name: string;
  description: string;
  owner: string;
  team: string;
  riskLevel: "low" | "medium" | "high";
  toolsRequired: string[];
  customerSafe: boolean;
  approvalRequired: boolean;
  source?: "link" | "telnyx";
  product?: string;
  language?: string;
}

export interface ToolMetadata {
  name: string;
  description: string;
  category: string;
  visibility: "internal_only" | "customer_safe";
  capability: "read" | "write" | "read_write";
  riskLevel: "low" | "medium" | "high";
  approvalRequired: boolean;
  outputCanBeShownExternally: boolean;
}

export interface ActiveWorkItem {
  id: string;
  title: string;
  subtitle: string;
  status: "pending" | "ready" | "approved" | "dismissed";
  createdAt: string;
  summary: string;
  details: {
    customerSafeDraft: string;
    internalRationale: string;
    sourcesUsed: string[];
    formatted?: string;
    approval: {
      approvalRequired: boolean;
      approvalStatus: string;
      reason?: string;
    };
  };
}

export interface AutomationItem {
  id: string;
  name: string;
  status: "active" | "paused";
  schedule: string;
  channel: string;
  tools: string[];
  skills: string[];
  instructions: string;
  runHistory: { time: string; duration: string; status: string; tone: "success" | "error" | "warning" }[];
}

export interface WorkspaceTab {
  id: string;
  title: string;
  kind: "chat" | "artifact" | "automation" | "approval" | "explorer";
  status: "open" | "pinned" | "pending" | "complete";
  updatedAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  description: string;
  status: "active" | "idle" | "review";
  updatedAt: string;
  tabs: WorkspaceTab[];
  activeWorkIds: string[];
  automationIds: string[];
  fileCount: number;
  memoryBankId?: string;
}

export interface ExplorerResult {
  id: string;
  title: string;
  source: "guru" | "google_drive" | "link_file" | "skill" | "agent" | "memory" | "telnyx_support" | "telnyx_developers";
  type: "doc" | "file" | "skill" | "agent" | "memory";
  permission: "allowed" | "needs_access";
  freshness: string;
  excerpt: string;
  workspaceId?: string;
  url?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  displayName?: string;
  sources?: ExplorerResult[];
  artifacts?: ChatArtifact[];
}

export interface ChatArtifact {
  id: string;
  title: string;
  kind: "markdown" | "pdf";
  filename: string;
  content: string;
  createdAt: string;
}

export interface VoiceTranscriptionInput {
  audioBase64: string;
  mimeType: string;
}

export interface VoiceTranscriptionResult {
  text: string;
}

export interface ChatSession {
  id: string;
  title: string;
  workspaceId: string;
  model: string;
  status: "active" | "idle";
  updatedAt: string;
  messages: ChatMessage[];
}

export interface LinkChangeRequest {
  id: string;
  title: string;
  summary: string;
  requestedChange: string;
  status: "pending_review" | "approved" | "dismissed" | "draft_pr_created";
  createdAt: string;
  updatedAt: string;
  sourceSessionId?: string;
  workspaceId?: string;
  githubRepo?: string;
  github?: {
    mode: "live";
    branch?: string;
    prUrl?: string;
    issueUrl?: string;
    note: string;
  };
}

export interface ConnectorStatus {
  id: string;
  name: string;
  category: string;
  description: string;
  status: ConnectionStatus;
  mode: ConnectionMode;
  requiredAccess: string[];
}

export interface CredentialFieldStatus {
  name: string;
  configured: boolean;
  source: "env" | "saved" | "missing";
  updatedAt?: string;
}

export interface CredentialGroupStatus {
  id: string;
  label: string;
  help: string;
  fields: CredentialFieldStatus[];
}

export interface ConnectionSummary extends ConnectorStatus {
  tools: ToolMetadata[];
  permissions: {
    read: string;
    write: string;
    interactive: string;
  };
}

export interface AgentControlPlaneAuthStatus {
  baseUrl: string;
  authMode: "okta" | "rev2";
  signedIn: boolean;
  ready: boolean;
  cookieCount: number;
  actorConfigured: boolean;
  onBehalfOfConfigured: boolean;
  actor?: string;
  userId?: string;
  userName?: string;
  avatarUrl?: string;
  onBehalfOf?: string;
  rev2Configured: boolean;
  message: string;
}

export interface HostedAgentSummary {
  id: string;
  name: string;
  displayName: string;
  description: string;
  status: string;
  type: string;
  capabilities: string[];
}

export interface AgentSummary extends HostedAgentSummary {
  visibility: "public" | "slack" | "private" | "internal";
  source: "agent-control-plane" | "a2a-discovery" | "slack" | "aida";
  slackChannel?: string;
  slackUserId?: string;
  slackChannelId?: string;
  squad?: string;
  audience?: string;
  origin?: string;
  url?: string;
  available?: boolean;
  requiresAuthentication?: boolean;
  updatedAt?: string;
}

export interface AgentInteractionResult {
  mode: "slack";
  agentId: string;
  message: string;
  channelId?: string;
  ts?: string;
}

export interface PhoneNumberOption {
  phoneNumber: string;
  countryCode: string;
  locality?: string;
  region?: string;
  type?: string;
  features: string[];
  monthlyCost?: string;
  upfrontCost?: string;
}

export interface PhoneAssistantOption {
  id: string;
  name: string;
  description?: string;
  status?: string;
  phoneNumber?: string;
}

export type WorkboardProvider = "auto" | "hermes" | "openclaw" | "local";
export type WorkboardStatus =
  | "triage"
  | "backlog"
  | "todo"
  | "scheduled"
  | "ready"
  | "running"
  | "review"
  | "blocked"
  | "done"
  | "archived";

export interface WorkboardProviderStatus {
  id: WorkboardProvider;
  label: string;
  available: boolean;
  mode: "native" | "fallback" | "unavailable";
  message: string;
}

export interface WorkboardBoard {
  id: string;
  name: string;
  description?: string;
  provider: WorkboardProvider;
}

export interface WorkboardCard {
  id: string;
  title: string;
  body?: string;
  status: WorkboardStatus;
  priority: "low" | "normal" | "high" | "urgent" | number;
  labels: string[];
  assignee?: string;
  provider: WorkboardProvider;
  boardId: string;
  tenant?: string;
  workspace?: string;
  sourceUrl?: string;
  linkedSessionId?: string;
  linkedRunId?: string;
  linkedTaskId?: string;
  proof?: string[];
  artifacts?: string[];
  comments?: string[];
  diagnostics?: string[];
  updatedAt: string;
  createdAt: string;
  raw?: unknown;
}

export interface WorkboardSnapshot {
  provider: WorkboardProvider;
  boardId: string;
  providers: WorkboardProviderStatus[];
  boards: WorkboardBoard[];
  columns: WorkboardStatus[];
  cards: WorkboardCard[];
  assignees: string[];
  stats: { label: string; value: number | string; tone?: "success" | "warning" | "danger" | "default" }[];
  message: string;
}

export interface WorkboardCreateInput {
  provider: WorkboardProvider;
  boardId?: string;
  title: string;
  body?: string;
  assignee?: string;
  priority?: WorkboardCard["priority"];
  labels?: string[];
  status?: WorkboardStatus;
  tenant?: string;
  workspace?: string;
  sourceUrl?: string;
}

export interface WorkboardUpdateInput {
  provider: WorkboardProvider;
  boardId?: string;
  cardId: string;
  status?: WorkboardStatus;
  assignee?: string;
  comment?: string;
}

export interface MemoryBank {
  id: string;
  name: string;
  scope: "user" | "workspace" | "bot" | "squad";
  status: "connected" | "needs_key";
  mission: string;
  updatedAt: string;
  observationCount: number;
  sourceCount: number;
}

export interface MemoryRecallResult {
  id: string;
  bankId: string;
  summary: string;
  evidence: string[];
  score: number;
  source: "hindsight";
}

export interface DojoProfile {
  id: string;
  name: string;
  rank: string;
  masteredSkills: number;
  nextRankAt: number;
  focus: string;
}

export interface DojoKit {
  id: string;
  name: string;
  description: string;
  mastered: number;
  total: number;
  tone: "blue" | "orange" | "teal" | "pink" | "green" | "purple";
}

export interface TrainingSession {
  id: string;
  title: string;
  target: "personal_bot" | "squad_bot";
  status: "ready" | "running" | "complete";
  updatedAt: string;
  inputs: string[];
}

export interface DojoState {
  profile: DojoProfile;
  kits: DojoKit[];
  sessions: TrainingSession[];
}

export interface OnboardingState {
  dismissed: boolean;
  completed: boolean;
  completedStepIds: string[];
  updatedAt: string;
}

export type WidgetChartType = "kpi" | "line" | "bar" | "area";
export type WidgetCategory = "Revenue" | "Operations" | "Product";
export type WidgetValueFormat = "currency" | "number" | "percent";

export interface WidgetChartSpec {
  type: WidgetChartType;
  xField?: string;
  yField: string;
  seriesField?: string;
  metricField?: string;
  metricFormat?: WidgetValueFormat;
}

export interface WidgetCatalogItem {
  id: string;
  title: string;
  source: "Tableau";
  category: WidgetCategory;
  description: string;
  cadence: string;
  refreshTtlSeconds: number;
  chart: WidgetChartSpec;
}

export interface WidgetLayoutState {
  widgetIds: string[];
  updatedAt: string;
}

export interface WidgetDataResult {
  widgetId: string;
  source: "Tableau";
  status: "ready";
  updatedAt: string;
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
  metric: string;
  trend: string;
}

export type LinkPublishedAppStatus =
  | "draft"
  | "submitted"
  | "building"
  | "preview"
  | "approved"
  | "deployed"
  | "rejected"
  | "deprecated";

export type LinkPublishedAppType = "web" | "mcp_app";
export type LinkPublishedAppRisk = "low" | "medium" | "high";

export interface LinkPublishedAppVersion {
  id: string;
  appId: string;
  version: string;
  sourceRepo?: string;
  sourceRef?: string;
  sourceSubdir?: string;
  status: LinkPublishedAppStatus;
  submittedAt?: string;
  reviewedAt?: string;
  previewUrl?: string;
  deployedAt?: string;
  buildLogUrl?: string;
}

export interface LinkPublishedApp {
  id: string;
  name: string;
  slug: string;
  description: string;
  ownerSquad: string;
  audience: string;
  appType: LinkPublishedAppType;
  access: "vpn";
  riskLevel: LinkPublishedAppRisk;
  status: LinkPublishedAppStatus;
  sourceRepo?: string;
  sourceRef?: string;
  sourceSubdir?: string;
  buildCommand?: string;
  startCommand?: string;
  outputDir?: string;
  vpnUrl?: string;
  previewUrl?: string;
  deployedUrl?: string;
  reviewers: string[];
  envSchema: string[];
  latestVersion?: LinkPublishedAppVersion;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkAppPublishInput {
  name: string;
  slug?: string;
  description?: string;
  ownerSquad: string;
  audience: string;
  appType: LinkPublishedAppType;
  sourceRepo: string;
  sourceRef?: string;
  sourceSubdir?: string;
  buildCommand?: string;
  startCommand?: string;
  outputDir?: string;
  envSchema?: string[];
  reviewers?: string[];
  riskLevel: LinkPublishedAppRisk;
}

export interface LinkAppPublishResult {
  mode: "live" | "local_fallback";
  message: string;
  intentId?: string;
  app: LinkPublishedApp;
  version?: LinkPublishedAppVersion;
}

export interface LinkAppDuplicateResult {
  mode: "live" | "local_fallback";
  action: "source_ref" | "fork" | "bundle" | "unavailable";
  sourceRepo?: string;
  sourceSubdir?: string;
  sourceRef?: string;
  command?: string;
  url?: string;
  message: string;
}

export interface LinkDesktopApi {
  chat(prompt: string): Promise<{ response?: string; routedTo?: string; finalOutput?: unknown }>;
  runSkill(skillName: string): Promise<unknown>;
  listSkills(): Promise<SkillMetadata[]>;
  listTools(): Promise<ToolMetadata[]>;
  createSharedChannelDraft(input: {
    title?: string;
    userPrompt: string;
    requestedAction: string;
    threadContext: string;
  }): Promise<ActiveWorkItem>;
  listActiveWork(): Promise<ActiveWorkItem[]>;
  decideWork(id: string, decision: Decision): Promise<ActiveWorkItem>;
  listAutomations(): Promise<AutomationItem[]>;
  listConnectors(): Promise<ConnectorStatus[]>;
  listCredentials(): Promise<CredentialGroupStatus[]>;
  saveCredential(input: { name: string; value: string }): Promise<CredentialGroupStatus[]>;
  updateConnectorStatus(id: string, status: ConnectorStatus["status"]): Promise<ConnectorStatus[]>;
  listWidgetCatalog(): Promise<WidgetCatalogItem[]>;
  listWidgetLayout(): Promise<WidgetLayoutState>;
  saveWidgetLayout(input: { widgetIds: string[] }): Promise<WidgetLayoutState>;
  refreshWidgetData(input: { widgetId: string }): Promise<WidgetDataResult>;
  listOnboarding(): Promise<OnboardingState>;
  updateOnboarding(input: Partial<Pick<OnboardingState, "dismissed" | "completed" | "completedStepIds">>): Promise<OnboardingState>;
  signInAgentControlPlane(): Promise<AgentControlPlaneAuthStatus>;
  signOutAgentControlPlane(): Promise<AgentControlPlaneAuthStatus>;
  getAgentControlPlaneAuthStatus(): Promise<AgentControlPlaneAuthStatus>;
  openAgentControlPlaneSetup(): Promise<{ url: string }>;
  listHostedAgents(): Promise<HostedAgentSummary[]>;
  listWorkspaces(): Promise<WorkspaceSummary[]>;
  searchExplorer(input: { query: string; workspaceId?: string }): Promise<ExplorerResult[]>;
  listChatSessions(): Promise<ChatSession[]>;
  renameChatSession(input: { sessionId: string; title: string }): Promise<ChatSession>;
  sendChatMessage(input: {
    sessionId?: string;
    workspaceId?: string;
    content: string;
    agentId?: string;
    agentName?: string;
    approvalMode?: string;
    modelMode?: string;
    contextScope?: string;
  }): Promise<ChatSession>;
  transcribeAudio(input: VoiceTranscriptionInput): Promise<VoiceTranscriptionResult>;
  createChangeRequest(input: {
    title: string;
    summary: string;
    requestedChange: string;
    workspaceId?: string;
    sourceSessionId?: string;
    githubRepo?: string;
  }): Promise<LinkChangeRequest>;
  approveChangeRequest(id: string): Promise<LinkChangeRequest>;
  dismissChangeRequest(id: string): Promise<LinkChangeRequest>;
  listChangeRequests(): Promise<LinkChangeRequest[]>;
  listAgents(): Promise<AgentSummary[]>;
  sendAgentMessage(input: { agentId: string; content: string }): Promise<AgentInteractionResult>;
  listWorkboard(input?: { provider?: WorkboardProvider; boardId?: string }): Promise<WorkboardSnapshot>;
  createWorkboardCard(input: WorkboardCreateInput): Promise<WorkboardSnapshot>;
  updateWorkboardCard(input: WorkboardUpdateInput): Promise<WorkboardSnapshot>;
  dispatchWorkboard(input: { provider: WorkboardProvider; boardId?: string }): Promise<WorkboardSnapshot>;
  listAccountPhoneNumbers(): Promise<PhoneNumberOption[]>;
  listPhoneAssistants(): Promise<PhoneAssistantOption[]>;
  listMemoryBanks(): Promise<MemoryBank[]>;
  recallMemory(input: { query: string; bankId?: string }): Promise<MemoryRecallResult[]>;
  listDojoState(): Promise<DojoState>;
  listPublishedApps(): Promise<LinkPublishedApp[]>;
  createPublishIntent(input: LinkAppPublishInput): Promise<LinkAppPublishResult>;
  createPublishedAppVersion(input: {
    appId: string;
    sourceRepo: string;
    sourceRef?: string;
    sourceSubdir?: string;
    notes?: string;
  }): Promise<LinkAppPublishResult>;
  reviewPublishedApp(input: { appId: string; decision: "approve" | "reject"; notes?: string }): Promise<LinkAppPublishResult>;
  duplicatePublishedApp(id: string): Promise<LinkAppDuplicateResult>;
  openPublishedApp(id: string): Promise<{ opened: boolean; url: string }>;
  auditEvents(): Promise<unknown[]>;
}

declare global {
  interface Window {
    linkDesktop?: LinkDesktopApi;
  }
}

const now = new Date().toISOString();
const previewSkills: SkillMetadata[] = [];
const previewTools: ToolMetadata[] = [];
let previewWork: ActiveWorkItem[] = [];
let previewWorkboardCards: WorkboardCard[] = [];
const previewAutomations: AutomationItem[] = [];
let previewChangeRequests: LinkChangeRequest[] = [];
const previewConnectors: ConnectorStatus[] = [];
let previewPublishedApps: LinkPublishedApp[] = [
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
    sourceRef: "main",
    sourceSubdir: "apps/carrier-readiness",
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
    sourceRef: "main",
    sourceSubdir: "apps/release-desk",
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

let previewCredentials: CredentialGroupStatus[] = [
  credentials("agent-control-plane", "Agent Control Plane", "Okta sign-in creates the Agent Control Plane session Link uses for internal agents and tools. TELNYX_AUTH_REV2 is stored securely after sign-in.", ["AUTH_INTERNAL_URL", "TELNYX_AUTH_REV2"]),
  credentials("mcp-proxy", "Telnyx MCP Proxy", "Connect Link to team-telnyx/mcp-proxy so agents discover approved MCP servers and tools through one Telnyx registry.", ["MCP_PROXY_URL"]),
  credentials("link-app-publisher", "Link App Publisher", "Optional VPN-only publisher service override. Link defaults to the internal managed publisher endpoint and authenticates with Okta Rev2 or TELNYX_API_KEY.", ["LINK_APP_PUBLISHER_URL"]),
  credentials("tableau-widgets", "Tableau Widgets", "URL for the strict-access Tableau widget service. Tableau connected-app secrets stay server-side.", ["TABLEAU_WIDGETS_SERVICE_URL"]),
  credentials("litellm", "Telnyx LiteLLM", "Get your LiteLLM Key by asking the AI-swe-Agent bot for one in Slack. Link uses Agent Control Plane routes automatically for hosted Hermes and OpenClaw agents.", ["LITELLM_API_KEY"]),
  credentials("hindsight", "Hindsight", "Per-user, bank-scoped key from the Hindsight bank API Keys tab. Hindsight infers the bank from this key.", ["HINDSIGHT_API_KEY"]),
  credentials("linear", "Linear", "Linear API key for issue and project lookup.", ["LINEAR_API_KEY"]),
  credentials("telnyx", "Telnyx", "Telnyx API key for account, phone, messaging, and network operations.", ["TELNYX_API_KEY"]),
  credentials("github", "GitHub", "Fine-grained GitHub token for approved draft PR creation.", ["GH_TOKEN"]),
  credentials("slack", "Slack", "Slack user token discovers and DMs bot users; bot token can post where the app has access.", ["SLACK_USER_TOKEN", "SLACK_BOT_TOKEN"]),
  credentials("google-workspace", "Google Workspace", "Connect Google Workspace so Link can load Calendar events, Drive docs, Meet artifacts, notes, and transcripts for your agents.", ["GOOGLE_WORKSPACE_ACCESS_TOKEN"]),
];

const previewWidgetCatalog: WidgetCatalogItem[] = [
  {
    id: "preview-revenue-pipeline",
    title: "Revenue pipeline",
    source: "Tableau",
    category: "Revenue",
    description: "Preview-only sample of a Tableau-backed revenue widget.",
    cadence: "Refreshes hourly",
    refreshTtlSeconds: 300,
    chart: { type: "bar", xField: "stage", yField: "amount", metricField: "amount", metricFormat: "currency" },
  },
  {
    id: "preview-support-volume",
    title: "Support volume",
    source: "Tableau",
    category: "Operations",
    description: "Preview-only sample of a Tableau-backed support widget.",
    cadence: "Refreshes daily",
    refreshTtlSeconds: 900,
    chart: { type: "line", xField: "day", yField: "tickets", metricField: "tickets", metricFormat: "number" },
  },
  {
    id: "preview-product-adoption",
    title: "Product adoption",
    source: "Tableau",
    category: "Product",
    description: "Preview-only sample of a Tableau-backed product widget.",
    cadence: "Refreshes daily",
    refreshTtlSeconds: 900,
    chart: { type: "area", xField: "week", yField: "active_accounts", metricField: "active_accounts", metricFormat: "number" },
  },
];
let previewWidgetLayout: WidgetLayoutState = {
  widgetIds: previewWidgetCatalog.slice(0, 2).map((widget) => widget.id),
  updatedAt: now,
};

let previewOnboarding: OnboardingState = {
  dismissed: false,
  completed: false,
  completedStepIds: [],
  updatedAt: now,
};

const previewWorkspaces: WorkspaceSummary[] = [];
let previewChatSessions: ChatSession[] = [];
const emptyDojoState: DojoState = {
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

export const linkApi: LinkDesktopApi = window.linkDesktop ?? {
  async chat(prompt) {
    void prompt;
    return {
      routedTo: "No live runtime",
      response: "No live desktop bridge or model runtime is connected.",
    };
  },
  async runSkill(skillName) {
    return {
      skill: previewSkills.find((skill) => skill.name === skillName),
      execution: {
        mode: "unavailable",
        summary: `No live skill runtime is connected for ${skillName}.`,
      },
    };
  },
  async listSkills() {
    return previewSkills;
  },
  async listTools() {
    return previewTools;
  },
  async createSharedChannelDraft(input) {
    const work = createLocalWork(`work-${Date.now()}`, input.title || "Shared-channel response draft", "Shared-channel draft - Pending review", "pending");
    previewWork = [work, ...previewWork];
    return work;
  },
  async listActiveWork() {
    return previewWork;
  },
  async decideWork(id, decision) {
    previewWork = previewWork.map((item) =>
      item.id === id
        ? {
            ...item,
            status: decision === "approve" ? "approved" : "dismissed",
            subtitle: decision === "approve" ? "Approved by human reviewer" : "Dismissed by human reviewer",
          }
        : item,
    );
    return previewWork.find((item) => item.id === id)!;
  },
  async listAutomations() {
    return previewAutomations;
  },
  async listConnectors() {
    return previewConnectors;
  },
  async listCredentials() {
    return previewCredentials;
  },
  async saveCredential({ name }) {
    previewCredentials = previewCredentials.map((group) => ({
      ...group,
      fields: group.fields.map((field) =>
        field.name === name ? { ...field, configured: true, source: "saved", updatedAt: new Date().toISOString() } : field,
      ),
    }));
    return previewCredentials;
  },
  async updateConnectorStatus(id, status) {
    return previewConnectors.map((connectorItem) =>
      connectorItem.id === id ? { ...connectorItem, status, mode: status === "connected" ? connectorItem.mode : "live" } : connectorItem,
    );
  },
  async listWidgetCatalog() {
    return previewWidgetCatalog;
  },
  async listWidgetLayout() {
    return previewWidgetLayout;
  },
  async saveWidgetLayout({ widgetIds }) {
    const allowedIds = new Set(previewWidgetCatalog.map((widget) => widget.id));
    previewWidgetLayout = {
      widgetIds: [...new Set(widgetIds.filter((id) => allowedIds.has(id)))],
      updatedAt: new Date().toISOString(),
    };
    return previewWidgetLayout;
  },
  async refreshWidgetData({ widgetId }) {
    return previewWidgetData(widgetId);
  },
  async listOnboarding() {
    return previewOnboarding;
  },
  async updateOnboarding(input) {
    previewOnboarding = {
      ...previewOnboarding,
      ...input,
      completedStepIds: input.completedStepIds ?? previewOnboarding.completedStepIds,
      updatedAt: new Date().toISOString(),
    };
    return previewOnboarding;
  },
  async signInAgentControlPlane() {
    throw new Error("Okta sign-in is only available in the Electron app. The Electron preload bridge is not available.");
  },
  async signOutAgentControlPlane() {
    return agentControlPlaneAuthStatus(false);
  },
  async getAgentControlPlaneAuthStatus() {
    return agentControlPlaneAuthStatus(previewAuthEnabled());
  },
  async openAgentControlPlaneSetup() {
    return { url: "http://agent-control-plane.query.prod.telnyx.io:8000/agents/new" };
  },
  async listHostedAgents() {
    return [];
  },
  async listWorkspaces() {
    return previewWorkspaces;
  },
  async searchExplorer({ query }) {
    return explorerResults(query);
  },
  async listChatSessions() {
    return previewChatSessions;
  },
  async renameChatSession({ sessionId, title }) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) throw new Error("Session name cannot be empty.");
    const session = previewChatSessions.find((item) => item.id === sessionId);
    if (!session) throw new Error("Session not found.");
    session.title = trimmedTitle.slice(0, 120);
    session.updatedAt = new Date().toISOString();
    return session;
  },
  async sendChatMessage({ sessionId, workspaceId, content }) {
    let session = previewChatSessions.find((item) => item.id === sessionId);
    if (!session) {
      session = {
        id: `chat-${Date.now()}`,
        title: content.slice(0, 54),
        workspaceId: workspaceId ?? "workspace-link",
        model: "live-runtime-unavailable",
        status: "active",
        updatedAt: new Date().toISOString(),
        messages: [message("system", "You are Telnyx Link.")],
      };
      previewChatSessions = [session, ...previewChatSessions];
    }
    session.messages = [
      ...session.messages,
      message("user", content),
      message("assistant", "No live desktop bridge or model runtime is connected.", createChatArtifacts(content)),
    ];
    session.workspaceId = workspaceId ?? session.workspaceId;
    session.updatedAt = new Date().toISOString();
    return session;
  },
  async transcribeAudio() {
    throw new Error("Add your LiteLLM API key in Settings to use voice input.");
  },
  async createChangeRequest(input) {
    const request: LinkChangeRequest = {
      id: `change-${Date.now()}`,
      title: input.title,
      summary: input.summary,
      requestedChange: input.requestedChange,
      status: "pending_review",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workspaceId: input.workspaceId,
      sourceSessionId: input.sourceSessionId,
    };
    previewChangeRequests = [request, ...previewChangeRequests];
    return request;
  },
  async approveChangeRequest(id) {
    void id;
    throw new Error("Live GitHub draft PR creation is unavailable without the Electron desktop bridge.");
  },
  async dismissChangeRequest(id) {
    previewChangeRequests = previewChangeRequests.map((request) =>
      request.id === id ? { ...request, status: "dismissed", updatedAt: new Date().toISOString() } : request,
    );
    return previewChangeRequests.find((request) => request.id === id)!;
  },
  async listChangeRequests() {
    return previewChangeRequests;
  },
  async listAgents() {
    return [];
  },
  async sendAgentMessage() {
    throw new Error("No live agent messaging adapter is connected.");
  },
  async listWorkboard({ provider = "local", boardId = "local" } = {}) {
    return localWorkboardSnapshot(provider === "auto" ? "local" : provider, boardId);
  },
  async createWorkboardCard(input) {
    const provider = input.provider === "auto" ? "local" : input.provider;
    previewWorkboardCards = [
      createLocalWorkboardCard({
        id: `card-${Date.now()}`,
        title: input.title,
        body: input.body,
        status: input.status ?? "triage",
        assignee: input.assignee,
        provider,
        priority: input.priority ?? "normal",
        labels: input.labels ?? [],
        tenant: input.tenant,
        workspace: input.workspace,
        sourceUrl: input.sourceUrl,
      }),
      ...previewWorkboardCards,
    ];
    return localWorkboardSnapshot(provider, input.boardId ?? "local");
  },
  async updateWorkboardCard(input) {
    const provider = input.provider === "auto" ? "local" : input.provider;
    previewWorkboardCards = previewWorkboardCards.map((card) =>
      card.id === input.cardId
        ? {
            ...card,
            status: input.status ?? card.status,
            assignee: input.assignee ?? card.assignee,
            comments: input.comment ? [...(card.comments ?? []), input.comment] : card.comments,
            updatedAt: new Date().toISOString(),
          }
        : card,
    );
    return localWorkboardSnapshot(provider, input.boardId ?? "local");
  },
  async dispatchWorkboard({ provider = "local", boardId = "local" }) {
    const resolvedProvider = provider === "auto" ? "local" : provider;
    previewWorkboardCards = previewWorkboardCards.map((card) =>
      card.status === "ready" && card.provider === resolvedProvider
        ? {
            ...card,
            status: "running",
            updatedAt: new Date().toISOString(),
          }
        : card,
    );
    return localWorkboardSnapshot(resolvedProvider, boardId);
  },
  async listAccountPhoneNumbers() {
    return [];
  },
  async listPhoneAssistants() {
    return [];
  },
  async listMemoryBanks() {
    return [];
  },
  async recallMemory() {
    return [];
  },
  async listDojoState() {
    return emptyDojoState;
  },
  async listPublishedApps() {
    return previewPublishedApps;
  },
  async createPublishIntent(input) {
    const app = createPreviewPublishedApp(input);
    previewPublishedApps = [app, ...previewPublishedApps.filter((item) => item.id !== app.id)];
    return {
      mode: "local_fallback",
      message: "Publisher service is unavailable in browser preview; the publish intent was saved locally.",
      intentId: `intent-${app.slug}-${Date.now()}`,
      app,
      version: app.latestVersion,
    };
  },
  async createPublishedAppVersion(input) {
    const app = previewPublishedApps.find((item) => item.id === input.appId);
    if (!app) throw new Error("Published app not found.");
    const version: LinkPublishedAppVersion = {
      id: `version-${app.id}-${Date.now()}`,
      appId: app.id,
      version: new Date().toISOString().slice(0, 10),
      sourceRepo: input.sourceRepo,
      sourceRef: input.sourceRef ?? "main",
      sourceSubdir: input.sourceSubdir ?? ".",
      status: "submitted",
      submittedAt: new Date().toISOString(),
    };
    const next = { ...app, status: "submitted" as const, latestVersion: version, updatedAt: new Date().toISOString() };
    previewPublishedApps = [next, ...previewPublishedApps.filter((item) => item.id !== app.id)];
    return { mode: "local_fallback", message: "Version request saved locally in browser preview.", app: next, version };
  },
  async reviewPublishedApp(input) {
    const app = previewPublishedApps.find((item) => item.id === input.appId);
    if (!app) throw new Error("Published app not found.");
    const status: LinkPublishedAppStatus = input.decision === "approve" ? "approved" : "rejected";
    const version = app.latestVersion ? { ...app.latestVersion, status, reviewedAt: new Date().toISOString() } : undefined;
    const next = { ...app, status, latestVersion: version, reviewNotes: input.notes, updatedAt: new Date().toISOString() };
    previewPublishedApps = [next, ...previewPublishedApps.filter((item) => item.id !== app.id)];
    return { mode: "local_fallback", message: `App marked ${status} locally in browser preview.`, app: next, version };
  },
  async duplicatePublishedApp(id) {
    const app = previewPublishedApps.find((item) => item.id === id);
    if (!app) throw new Error("Published app not found.");
    return {
      mode: "local_fallback",
      action: app.sourceRepo ? "source_ref" : "unavailable",
      sourceRepo: app.sourceRepo,
      sourceRef: app.sourceRef,
      sourceSubdir: app.sourceSubdir,
      command: app.sourceRepo ? `git clone ${app.sourceRepo}` : undefined,
      message: app.sourceRepo ? "Use the source reference to duplicate or fork this app." : "No source reference is available.",
    };
  },
  async openPublishedApp(id) {
    const app = previewPublishedApps.find((item) => item.id === id);
    if (!app) throw new Error("Published app not found.");
    const url = app.vpnUrl || app.deployedUrl || app.previewUrl;
    if (!url) throw new Error("This app does not have a private VPN URL yet.");
    return { opened: true, url };
  },
  async auditEvents() {
    return [];
  },
};

function previewWidgetData(widgetId: string): WidgetDataResult {
  const updatedAt = new Date().toISOString();
  if (widgetId === "preview-support-volume") {
    return {
      widgetId,
      source: "Tableau",
      status: "ready",
      updatedAt,
      columns: ["day", "tickets"],
      rows: [
        { day: "Mon", tickets: 420 },
        { day: "Tue", tickets: 388 },
        { day: "Wed", tickets: 405 },
        { day: "Thu", tickets: 371 },
        { day: "Fri", tickets: 348 },
      ],
      metric: "348",
      trend: "-72 vs first point",
    };
  }
  if (widgetId === "preview-product-adoption") {
    return {
      widgetId,
      source: "Tableau",
      status: "ready",
      updatedAt,
      columns: ["week", "active_accounts"],
      rows: [
        { week: "W1", active_accounts: 1240 },
        { week: "W2", active_accounts: 1310 },
        { week: "W3", active_accounts: 1388 },
        { week: "W4", active_accounts: 1462 },
      ],
      metric: "1,462",
      trend: "+222 vs first point",
    };
  }
  return {
    widgetId,
    source: "Tableau",
    status: "ready",
    updatedAt,
    columns: ["stage", "amount"],
    rows: [
      { stage: "Prospect", amount: 2100000 },
      { stage: "Qualified", amount: 4200000 },
      { stage: "Commit", amount: 6100000 },
      { stage: "Closed", amount: 8100000 },
    ],
    metric: "$8.1M",
    trend: "+$6.0M vs first point",
  };
}

function tool(
  name: string,
  description: string,
  category: string,
  capability: ToolMetadata["capability"],
  riskLevel: ToolMetadata["riskLevel"],
  approvalRequired: boolean,
  visibility: ToolMetadata["visibility"] = "internal_only",
): ToolMetadata {
  return {
    name,
    description,
    category,
    visibility,
    capability,
    riskLevel,
    approvalRequired,
    outputCanBeShownExternally: visibility === "customer_safe",
  };
}

function createLocalWork(
  id: string,
  title: string,
  subtitle: string,
  status: ActiveWorkItem["status"],
): ActiveWorkItem {
  return {
    id,
    title,
    subtitle,
    status,
    createdAt: new Date().toISOString(),
    summary: "Customer-visible action requires human approval before posting.",
    details: {
      customerSafeDraft: "",
      internalRationale: "Live shared-channel drafting is unavailable without the Electron desktop bridge.",
      sourcesUsed: [],
      approval: {
        approvalRequired: status === "pending",
        approvalStatus: status === "pending" ? "approval_required" : "not_required",
      },
    },
  };
}

function createLocalWorkboardCard(input: {
  id: string;
  title: string;
  body?: string;
  status: WorkboardStatus;
  assignee?: string;
  provider: WorkboardProvider;
  priority: WorkboardCard["priority"];
  labels?: string[];
  tenant?: string;
  workspace?: string;
  sourceUrl?: string;
  proof?: string[];
  artifacts?: string[];
}): WorkboardCard {
  const timestamp = new Date().toISOString();
  return {
    id: input.id,
    title: input.title,
    body: input.body,
    status: input.status,
    priority: input.priority,
    labels: input.labels ?? [],
    assignee: input.assignee,
    provider: input.provider,
    boardId: "local",
    tenant: input.tenant,
    workspace: input.workspace,
    sourceUrl: input.sourceUrl,
    proof: input.proof,
    artifacts: input.artifacts,
    comments: [],
    diagnostics: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createPreviewPublishedApp(input: LinkAppPublishInput): LinkPublishedApp {
  const slug = slugify(input.slug || input.name);
  const now = new Date().toISOString();
  const appId = `app-${slug}`;
  const version: LinkPublishedAppVersion = {
    id: `version-${appId}-${Date.now()}`,
    appId,
    version: now.slice(0, 10),
    sourceRepo: input.sourceRepo,
    sourceRef: input.sourceRef || "main",
    sourceSubdir: input.sourceSubdir || ".",
    status: "submitted",
    submittedAt: now,
  };
  return {
    id: appId,
    name: input.name,
    slug,
    description: input.description || "Private Link app.",
    ownerSquad: input.ownerSquad,
    audience: input.audience,
    appType: input.appType,
    access: "vpn",
    riskLevel: input.riskLevel,
    status: "submitted",
    sourceRepo: input.sourceRepo,
    sourceRef: input.sourceRef || "main",
    sourceSubdir: input.sourceSubdir || ".",
    buildCommand: input.buildCommand,
    startCommand: input.startCommand,
    outputDir: input.outputDir,
    reviewers: input.reviewers ?? [],
    envSchema: input.envSchema ?? [],
    latestVersion: version,
    createdAt: now,
    updatedAt: now,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "link-app";
}

function localWorkboardSnapshot(provider: WorkboardProvider, boardId: string): WorkboardSnapshot {
  const cards = previewWorkboardCards.filter((card) => provider === "local" || card.provider === provider);
  return {
    provider,
    boardId,
    providers: [
      { id: "hermes", label: "Hermes Kanban", available: false, mode: "unavailable", message: "Hermes CLI is not connected in browser preview." },
      { id: "openclaw", label: "OpenClaw Workboard", available: false, mode: "unavailable", message: "OpenClaw Gateway is not connected in browser preview." },
      { id: "local", label: "Link local board", available: true, mode: "fallback", message: "Local fallback board is active." },
    ],
    boards: [{ id: "local", name: "Link local board", provider: "local", description: "Durable Link-owned fallback board." }],
    columns: ["triage", "backlog", "todo", "scheduled", "ready", "running", "review", "blocked", "done"],
    cards,
    assignees: [...new Set(cards.map((card) => card.assignee).filter((assignee): assignee is string => Boolean(assignee)))],
    stats: [
      { label: "Cards", value: cards.length },
      { label: "Running", value: cards.filter((card) => card.status === "running").length, tone: "success" },
      { label: "Blocked", value: cards.filter((card) => card.status === "blocked").length, tone: "warning" },
    ],
    message: "Link local board is active.",
  };
}

function connector(
  id: string,
  name: string,
  category: string,
  description: string,
  requiredAccess: string[],
  status: ConnectorStatus["status"],
  mode: ConnectorStatus["mode"] = "live",
): ConnectorStatus {
  return { id, name, category, description, requiredAccess, status, mode };
}

function credentials(id: string, label: string, help: string, fields: string[]): CredentialGroupStatus {
  return {
    id,
    label,
    help,
    fields: fields.map((name) => ({ name, configured: false, source: "missing" })),
  };
}

function message(role: ChatMessage["role"], content: string, artifacts: ChatArtifact[] = []): ChatMessage {
  return { id: `message-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`, role, content, createdAt: new Date().toISOString(), ...(artifacts.length ? { artifacts } : {}) };
}

function createChatArtifacts(prompt: string): ChatArtifact[] {
  const wantsPdf = /\bpdf\b/i.test(prompt);
  const wantsMarkdown = /\.md\b|\bmarkdown\b|\bmd file\b/i.test(prompt);
  if (!wantsPdf && !wantsMarkdown) return [];
  const createdAt = new Date().toISOString();
  const title = prompt.replace(/\s+/g, " ").trim().slice(0, 48) || "Link generated document";
  const body = `# ${title}\n\nGenerated from the active Link chat.\n\n## Request\n\n${prompt.trim() || "No prompt provided."}\n\n## Notes\n\n- Review content before sharing externally.\n- Attach sources when live connectors are available.`;
  return [
    {
      id: `artifact-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      kind: wantsPdf ? "pdf" : "markdown",
      filename: wantsPdf ? "link-generated-document.pdf" : "link-generated-document.md",
      content: body,
      createdAt,
    },
  ];
}

function explorerResults(query: string): ExplorerResult[] {
  const term = query.trim() || "Telnyx Link";
  return [
    {
      id: "explorer-telnyx-support-center",
      title: "Telnyx Support Center",
      source: "telnyx_support",
      type: "doc",
      permission: "allowed",
      freshness: "Public Telnyx documentation",
      excerpt: `Support Center source for ${term}: troubleshooting articles, product guidance, and customer-facing operational help.`,
      workspaceId: "workspace-link",
      url: "https://support.telnyx.com/en/",
    },
    {
      id: "explorer-telnyx-developer-docs",
      title: "Telnyx Developer Docs",
      source: "telnyx_developers",
      type: "doc",
      permission: "allowed",
      freshness: "Public Telnyx documentation",
      excerpt: `Developer Docs source for ${term}: API guides, product overviews, SDK references, and implementation details.`,
      workspaceId: "workspace-link",
      url: "https://developers.telnyx.com/docs/overview",
    },
  ];
}

function agentControlPlaneAuthStatus(signedIn: boolean): AgentControlPlaneAuthStatus {
  return {
    baseUrl: "http://agent-control-plane.query.prod.telnyx.io:8000",
    authMode: "okta",
    signedIn,
    ready: signedIn,
    cookieCount: signedIn ? 1 : 0,
    actorConfigured: true,
    onBehalfOfConfigured: true,
    actor: "preview@telnyx.com",
    onBehalfOf: "preview.squad",
    rev2Configured: false,
    message: signedIn ? "Okta session is active." : "Agent Control Plane is not connected.",
  };
}

function previewAuthEnabled(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("previewAuth") === "ready" || window.localStorage.getItem("telnyx-link-preview-auth") === "ready";
  } catch {
    return false;
  }
}
