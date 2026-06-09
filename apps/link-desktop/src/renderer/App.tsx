import {
  ArrowUp,
  Archive as ArchiveIcon,
  Bell,
  BookOpen,
  Bot,
  CalendarDays,
  ChevronDown,
  ChessKnight,
  Clock,
  ExternalLink,
  FileText,
  Flag,
  FolderOpen,
  Grid2X2,
  Home,
  LayoutDashboard,
  List,
  LogOut,
  MessageSquare,
  Mic,
  Moon,
  PanelLeftOpen,
  Phone,
  PhoneCall,
  PhoneOff,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Slack,
  SlidersHorizontal,
  Square,
  SquareTerminal,
  SquareCheck,
  Star,
  Store,
  Sun,
  Tags,
  Target,
  Trash2,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ComponentType, CSSProperties, DragEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActiveWorkItem,
  AgentControlPlaneAuthStatus,
  AgentSummary,
  AutomationItem,
  ChatArtifact,
  ChatMessage,
  ChatSession,
  ConnectorStatus,
  CredentialGroupStatus,
  DojoKit,
  DojoState,
  ExplorerResult,
  HostedAgentSummary,
  LinkAppPublishInput,
  LinkAppPublishResult,
  LinkChangeRequest,
  LinkPublishedApp,
  LinkPublishedAppRisk,
  LinkPublishedAppStatus,
  LinkPublishedAppType,
  MemoryBank,
  MemoryRecallResult,
  OnboardingState,
  PhoneAssistantOption,
  PhoneNumberOption,
  SkillMetadata,
  ToolMetadata,
  ViewId,
  WidgetCatalogItem,
  WidgetDataResult,
  WorkboardCard,
  WorkboardProvider,
  WorkboardSnapshot,
  WorkboardStatus,
  WorkspaceSummary,
} from "./api.js";
import { linkApi } from "./api.js";

type AppIcon = ComponentType<{ size?: number; className?: string }>;

interface ActiveAgentSelection {
  id: string;
  displayName: string;
}

type SpeechRecognitionResultLike = {
  isFinal?: boolean;
  0?: { transcript?: string };
};

type SpeechRecognitionEventLike = {
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike | undefined;
  };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface AvailabilityWindow {
  id: string;
  label: string;
  start: number;
  end: number;
  closed: boolean;
}

const defaultAvailabilityWindows: AvailabilityWindow[] = [
  { id: "monday", label: "Monday", start: 540, end: 1020, closed: false },
  { id: "tuesday", label: "Tuesday", start: 540, end: 1020, closed: false },
  { id: "wednesday", label: "Wednesday", start: 540, end: 1020, closed: false },
  { id: "thursday", label: "Thursday", start: 540, end: 1020, closed: false },
  { id: "friday", label: "Friday", start: 540, end: 1020, closed: false },
  { id: "saturday", label: "Saturday", start: 540, end: 1020, closed: true },
  { id: "sunday", label: "Sunday", start: 540, end: 1020, closed: true },
];

function shouldSubmitComposer(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
  return event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing;
}

function formatAvailabilityTime(minutes: number) {
  const boundedMinutes = Math.max(0, Math.min(1440, minutes));
  const hours = Math.floor(boundedMinutes / 60);
  const mins = boundedMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

const navItems: { id: ViewId; label: string; icon: AppIcon }[] = [
  { id: "widgets", label: "Widgets", icon: LayoutDashboard },
  { id: "workboard", label: "Tasks", icon: SquareCheck },
  { id: "chats", label: "Chat", icon: MessageSquare },
  { id: "phone", label: "Phone", icon: Phone },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "dojo", label: "Experto", icon: ChessKnight },
];

const dialpadKeys = [
  { digit: "1", letters: "" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*", letters: "" },
  { digit: "0", letters: "+" },
  { digit: "#", letters: "" },
] as const;

const viewMeta: Record<ViewId, { label: string; icon: AppIcon }> = {
  workspaces: { label: "Workspaces", icon: Grid2X2 },
  onboarding: { label: "Onboarding", icon: Flag },
  widgets: { label: "Widgets", icon: LayoutDashboard },
  explorer: { label: "Library", icon: BookOpen },
  chats: { label: "Chat", icon: MessageSquare },
  agents: { label: "Agents", icon: Bot },
  workboard: { label: "Tasks", icon: SquareCheck },
  phone: { label: "Phone", icon: Phone },
  calendar: { label: "Calendar", icon: CalendarDays },
  memory: { label: "Archive", icon: ArchiveIcon },
  dojo: { label: "Experto", icon: ChessKnight },
  settings: { label: "Settings", icon: Settings },
};

interface PublishAppDraft {
  name: string;
  slug: string;
  description: string;
  ownerSquad: string;
  audience: string;
  appType: LinkPublishedAppType;
  sourceRepo: string;
  sourceRef: string;
  sourceSubdir: string;
  buildCommand: string;
  startCommand: string;
  outputDir: string;
  envSchema: string;
  reviewers: string;
  riskLevel: LinkPublishedAppRisk;
}

interface MarketplaceApp {
  id: string;
  name: string;
  publisher: string;
  bot: string;
  audience: string;
  installMode: "Source handoff" | "VPN access";
  status: "Available" | "Reviewing" | "Installed";
  description: string;
}

const marketplaceApps: MarketplaceApp[] = [
  {
    id: "marketplace-support-triage",
    name: "Support Triage Console",
    publisher: "Customer Operations",
    bot: "bot-troubleshooting",
    audience: "Support, Escalations",
    installMode: "Source handoff",
    status: "Available",
    description: "Route escalations, summarize OpenClaw incidents, and open approved follow-up tasks from one local app.",
  },
  {
    id: "marketplace-carrier-readiness",
    name: "Carrier Readiness Hub",
    publisher: "Messaging Ops",
    bot: "Hermes",
    audience: "Messaging, NOC",
    installMode: "VPN access",
    status: "Available",
    description: "Check carrier launch gates, retrieve internal runbooks, and coordinate squad review before customer updates.",
  },
  {
    id: "marketplace-revenue-brief",
    name: "Revenue Brief Builder",
    publisher: "Sales Engineering",
    bot: "Personal OpenClaw",
    audience: "Sales, SE",
    installMode: "Source handoff",
    status: "Installed",
    description: "Build account briefs from Salesforce, Guru, and recent agent chats with employee-only source links.",
  },
  {
    id: "marketplace-release-desk",
    name: "Release Desk",
    publisher: "Product Platform",
    bot: "Link reviewer",
    audience: "Product, Engineering",
    installMode: "VPN access",
    status: "Reviewing",
    description: "Publish release notes, inspect pending approvals, and hand off app-specific review steps to the owning squad.",
  },
];

const initialOnboardingState: OnboardingState = {
  dismissed: false,
  completed: false,
  completedStepIds: [],
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export function App() {
  const [view, setView] = useState<ViewId>("widgets");
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [tools, setTools] = useState<ToolMetadata[]>([]);
  const [work, setWork] = useState<ActiveWorkItem[]>([]);
  const [automations, setAutomations] = useState<AutomationItem[]>([]);
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<ChatArtifact | null>(null);
  const [changeRequests, setChangeRequests] = useState<LinkChangeRequest[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [memoryBanks, setMemoryBanks] = useState<MemoryBank[]>([]);
  const [dojoState, setDojoState] = useState<DojoState | null>(null);
  const [publishedApps, setPublishedApps] = useState<LinkPublishedApp[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingState>(initialOnboardingState);
  const [accountStatus, setAccountStatus] = useState<AgentControlPlaneAuthStatus | null>(null);
  const [signedOutLocally, setSignedOutLocally] = useState(false);
  const [authGateBusy, setAuthGateBusy] = useState(false);
  const [authGateError, setAuthGateError] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("workspace-acme");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [assistantMode, setAssistantMode] = useState<"chat" | "phone">("chat");
  const [widgetLibraryOpen, setWidgetLibraryOpen] = useState(false);
  const [linkedPhoneNumber, setLinkedPhoneNumber] = useState("");
  const [telnyxCredentialReady, setTelnyxCredentialReady] = useState(false);
  const [liteLlmCredentialReady, setLiteLlmCredentialReady] = useState(false);
  const [activeAgent, setActiveAgent] = useState<ActiveAgentSelection | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = JSON.parse(window.localStorage.getItem("telnyx-link-active-agent") ?? "null");
      return stored && typeof stored.id === "string" && typeof stored.displayName === "string" ? stored : null;
    } catch {
      return null;
    }
  });
  const [bookmarkedAgentIds, setBookmarkedAgentIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(window.localStorage.getItem("telnyx-link-bookmarked-agents") ?? "[]");
      return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  });
  const [colorMode, setColorMode] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("telnyx-link-color-mode") === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    window.localStorage.setItem("telnyx-link-color-mode", colorMode);
  }, [colorMode]);

  useEffect(() => {
    window.localStorage.setItem("telnyx-link-bookmarked-agents", JSON.stringify(bookmarkedAgentIds));
  }, [bookmarkedAgentIds]);

  useEffect(() => {
    if (activeAgent) window.localStorage.setItem("telnyx-link-active-agent", JSON.stringify(activeAgent));
    else window.localStorage.removeItem("telnyx-link-active-agent");
  }, [activeAgent]);

  async function refresh() {
    const [
      skillList,
      toolList,
      workList,
      automationList,
      connectorList,
      workspaceList,
      chatList,
      changeList,
      agentList,
      bankList,
      dojo,
      appList,
      onboardingState,
      authStatus,
      credentialList,
    ] = await Promise.all([
      linkApi.listSkills(),
      linkApi.listTools(),
      linkApi.listActiveWork(),
      linkApi.listAutomations(),
      linkApi.listConnectors(),
      linkApi.listWorkspaces(),
      linkApi.listChatSessions(),
      linkApi.listChangeRequests(),
      linkApi.listAgents(),
      linkApi.listMemoryBanks(),
      linkApi.listDojoState(),
      linkApi.listPublishedApps(),
      linkApi.listOnboarding(),
      linkApi.getAgentControlPlaneAuthStatus(),
      linkApi.listCredentials(),
    ]);
    setSkills(skillList);
    setTools(toolList);
    setWork(workList);
    setAutomations(automationList);
    setConnectors(connectorList);
    setWorkspaces(workspaceList);
    setChatSessions(chatList);
    setChangeRequests(changeList);
    setAgents(agentList);
    setMemoryBanks(bankList);
    setDojoState(dojo);
    setPublishedApps(appList);
    setOnboarding(onboardingState);
    setAccountStatus(authStatus);
    setTelnyxCredentialReady(Boolean(credentialList.find((group) => group.id === "telnyx")?.fields.some((field) => field.name === "TELNYX_API_KEY" && field.configured)));
    setLiteLlmCredentialReady(Boolean(credentialList.find((group) => group.id === "litellm")?.fields.some((field) => field.name === "LITELLM_API_KEY" && field.configured)));
    setSignedOutLocally(false);
    setSelectedWorkspaceId((current) => current || workspaceList[0]?.id || "");
    setSelectedSessionId((current) => current || chatList[0]?.id || "");
    setSelectedWorkId((current) => current || workList[0]?.id || "");
  }

  useEffect(() => {
    void refresh();
  }, []);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0];
  const selectedSession = selectedSessionId ? chatSessions.find((session) => session.id === selectedSessionId) : undefined;
  const selectedWork = work.find((item) => item.id === selectedWorkId) ?? work[0];
  const showContextSidebar = false;

  function openChatSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setView("chats");
  }

  const signedIn = Boolean(accountStatus?.ready && !signedOutLocally);

  async function signInFromGate() {
    setAuthGateBusy(true);
    setAuthGateError("");
    try {
      const next = await linkApi.signInAgentControlPlane();
      setAccountStatus(next);
      setSignedOutLocally(false);
      await refresh();
    } catch (error) {
      setAuthGateError(error instanceof Error ? error.message : "Okta sign-in failed.");
    } finally {
      setAuthGateBusy(false);
    }
  }

  return (
    <div className="desktop" data-theme={colorMode}>
      <TitleBar />
      {!signedIn ? (
        <AuthGate
          busy={authGateBusy}
          error={authGateError}
          onSignIn={() => void signInFromGate()}
        />
      ) : (
      <div className={`workspace ${showContextSidebar ? "" : "workspaceNoSidebar"} ${railExpanded ? "railExpanded" : "railCollapsed"}`}>
        <Rail
          view={view}
          setView={setView}
          expanded={railExpanded}
          onboarding={onboarding}
          setOnboarding={setOnboarding}
          accountStatus={accountStatus}
          signedOutLocally={signedOutLocally}
          setAccountStatus={setAccountStatus}
          setSignedOutLocally={setSignedOutLocally}
        />
        {showContextSidebar && (
          <Sidebar
            view={view}
            work={work}
            skills={skills}
            connectors={connectors}
            workspaces={workspaces}
            chatSessions={chatSessions}
            changeRequests={changeRequests}
            agents={agents}
            memoryBanks={memoryBanks}
            dojoState={dojoState}
            selectedWorkspaceId={selectedWorkspace?.id ?? ""}
            selectedSessionId={selectedSession?.id ?? ""}
            setSelectedWorkspaceId={setSelectedWorkspaceId}
            setSelectedSessionId={setSelectedSessionId}
            setSelectedWorkId={setSelectedWorkId}
            setView={setView}
          />
        )}
        <main className="mainPane">
          <div className="appSurface">
            <div className="pageSurface">
              {!selectedArtifact && view === "onboarding" && onboarding && (
                <OnboardingView
                  onboarding={onboarding}
                  setOnboarding={setOnboarding}
                  connectors={connectors}
                  memoryBanks={memoryBanks}
                  skills={skills}
                  agents={agents}
                  dojoState={dojoState}
                  setView={setView}
                  refresh={refresh}
                />
              )}
              {selectedArtifact && <ArtifactViewer artifact={selectedArtifact} onClose={() => setSelectedArtifact(null)} />}
              {!selectedArtifact && view === "widgets" && <WidgetsView libraryOpen={widgetLibraryOpen} setLibraryOpen={setWidgetLibraryOpen} />}
              {!selectedArtifact && view === "chats" && (
                <ChatsView
                  sessions={chatSessions}
                  workspaces={workspaces}
                  memoryBanks={memoryBanks}
                  selectedSession={selectedSession}
                  selectSession={openChatSession}
                  openArtifact={setSelectedArtifact}
                  openMemory={() => setMemoryOpen(true)}
                />
              )}
              {!selectedArtifact && view === "agents" && (
                <AgentsView
                  agents={agents}
                  connectors={connectors}
                  tools={tools}
                  refresh={refresh}
                  setView={setView}
                  bookmarkedAgentIds={bookmarkedAgentIds}
                  setBookmarkedAgentIds={setBookmarkedAgentIds}
                  activeAgent={activeAgent}
                  setActiveAgent={setActiveAgent}
                />
              )}
              {!selectedArtifact && view === "workboard" && (
                <WorkboardView agents={agents} bookmarkedAgentIds={bookmarkedAgentIds} activeAgent={activeAgent} />
              )}
              {!selectedArtifact && view === "calendar" && (
                <CalendarView connectors={connectors} linkedPhoneNumber={linkedPhoneNumber} setView={setView} />
              )}
              {!selectedArtifact && view === "phone" && (
                <PhoneView connectors={connectors} linkedPhoneNumber={linkedPhoneNumber} setLinkedPhoneNumber={setLinkedPhoneNumber} setView={setView} />
              )}
              {!selectedArtifact && view === "memory" && <MemoryView banks={memoryBanks} openMemory={() => setMemoryOpen(true)} />}
              {!selectedArtifact && view === "dojo" && (
                <DojoView
                  dojoState={dojoState}
                  skills={skills}
                  selectedWorkspace={selectedWorkspace}
                  activeAgent={activeAgent}
                  agents={agents}
                  bookmarkedAgentIds={bookmarkedAgentIds}
                  publishedApps={publishedApps}
                  refreshPublishedApps={async () => setPublishedApps(await linkApi.listPublishedApps())}
                  setView={setView}
                />
              )}
              {!selectedArtifact && view === "settings" && (
                <SettingsView
                  refresh={refresh}
                  colorMode={colorMode}
                  setColorMode={setColorMode}
                  railExpanded={railExpanded}
                  setRailExpanded={setRailExpanded}
                />
              )}
            </div>
            <AssistantPanel
              mode={assistantMode}
              setMode={setAssistantMode}
              agents={agents}
              bookmarkedAgentIds={bookmarkedAgentIds}
              activeAgent={activeAgent}
              selectedSession={selectedSession}
              selectedWorkspace={selectedWorkspace}
              selectSession={setSelectedSessionId}
              openArtifact={setSelectedArtifact}
              refresh={refresh}
              setView={setView}
              liteLlmReady={liteLlmCredentialReady}
              linkedPhoneNumber={linkedPhoneNumber}
              telnyxApiReady={telnyxCredentialReady || connectors.some((connector) => connector.id === "telnyx" && (connector.status === "connected" || connector.status === "signed_in"))}
            />
          </div>
        </main>
      </div>
      )}
      {signedIn && memoryOpen && <MemoryModal onClose={() => setMemoryOpen(false)} sources={connectors.map((connector) => connector.name)} />}
    </div>
  );
}

function AuthGate({
  busy,
  error,
  onSignIn,
}: {
  busy: boolean;
  error: string;
  onSignIn: () => void;
}) {
  return (
    <main className="authGate">
      <section className="authGateCard" aria-label="Telnyx Okta sign in">
        <div className="authGateIcon">
          <img src="./triforce-26.png" alt="" aria-hidden="true" />
        </div>
        <div>
          <h1>Telnyx Link</h1>
          <p>Sign in with Telnyx Okta to bring your agents, tasks, calls, calendar, docs, and internal tools into one secure workspace.</p>
        </div>
        <button className="button primary" onClick={onSignIn} disabled={busy}>
          {busy ? "Signing in" : "Sign in with Okta"}
        </button>
        {error && <div className="errorBanner">{error}</div>}
      </section>
    </main>
  );
}

function TitleBar() {
  return (
    <header className="titleBar">
      <div className="windowTitle">Telnyx Link</div>
    </header>
  );
}

function OnboardingView({
  onboarding,
  setOnboarding,
  connectors,
  memoryBanks,
  skills,
  agents,
  dojoState,
  setView,
  refresh,
}: {
  onboarding: OnboardingState;
  setOnboarding: (state: OnboardingState) => void;
  connectors: ConnectorStatus[];
  memoryBanks: MemoryBank[];
  skills: SkillMetadata[];
  agents: AgentSummary[];
  dojoState: DojoState | null;
  setView: (view: ViewId) => void;
  refresh: () => Promise<void>;
}) {
  const [acpAuth, setAcpAuth] = useState<AgentControlPlaneAuthStatus | null>(null);
  const [busy, setBusy] = useState("");
  const completed = new Set(onboarding.completedStepIds);
  const connectedConnectors = connectors.filter((connector) => connector.status === "connected" || connector.status === "signed_in");
  const connector = (id: string) => connectors.find((item) => item.id === id);
  const oktaComplete = Boolean(acpAuth?.ready || connector("agent-control-plane")?.status === "connected" || connector("agent-control-plane")?.status === "signed_in");
  const accountComplete = connectedConnectors.length >= 3 || completed.has("accounts");
  const squadToolsComplete = completed.has("squad-tools") || (skills.length > 0 && agents.length > 0 && completed.has("squad-review"));
  const hindsightComplete = connector("hindsight")?.status === "connected" && memoryBanks.length > 0;
  const rescueComplete = agents.some((agent) => agent.id === "slack-bot-troubleshooting");
  const requiredComplete = oktaComplete && accountComplete && squadToolsComplete;
  const squadBank = memoryBanks.find((bank) => bank.scope === "squad" || /squad|team|wiki/i.test(`${bank.name} ${bank.mission}`));

  useEffect(() => {
    void linkApi.getAgentControlPlaneAuthStatus().then(setAcpAuth);
  }, []);

  async function signInOkta() {
    setBusy("okta");
    setAcpAuth(await linkApi.signInAgentControlPlane());
    await refresh();
    setBusy("");
  }

  async function markStep(stepId: string) {
    const nextIds = [...new Set([...onboarding.completedStepIds, stepId])];
    const next = await linkApi.updateOnboarding({ completedStepIds: nextIds });
    setOnboarding(next);
  }

  async function finishOnboarding() {
    const next = await linkApi.updateOnboarding({ completed: true });
    setOnboarding(next);
    setView("widgets");
  }

  async function dismissOnboarding() {
    const next = await linkApi.updateOnboarding({ dismissed: true });
    setOnboarding(next);
    setView("widgets");
  }

  const steps = [
    {
      id: "okta",
      title: "Register with Telnyx Okta",
      body: "Use the native Okta flow so Link can pick up employee identity, internal auth cookies, and future squad context without storing passwords.",
      complete: oktaComplete,
      meta: acpAuth?.message ?? "Okta session not checked yet.",
      action: <button className="button secondary" onClick={() => void signInOkta()} disabled={busy === "okta" || oktaComplete}>{busy === "okta" ? "Signing in" : oktaComplete ? "Okta connected" : "Sign in with Okta"}</button>,
      required: true,
    },
    {
      id: "accounts",
      title: "Set up Agent Plugins",
      body: "Connect the accounts and plugin permissions Link can use: LiteLLM, Slack, Hindsight, Guru or Drive, GitHub, Linear, Telnyx, and squad-standard tools.",
      complete: accountComplete,
      meta: connectedConnectors.length > 0 ? `Connected: ${connectedConnectors.map((item) => item.name).join(", ")}` : "No accounts connected yet.",
      action: (
        <div className="onboardingActions">
          <button className="button secondary" onClick={() => setView("settings")}>Open Settings</button>
          <button className="button ghost" onClick={() => setView("agents")}>Review Agent Plugins</button>
          <button className="button ghost" onClick={() => void markStep("accounts")}>Use current set</button>
        </div>
      ),
      required: true,
    },
    {
      id: "squad-tools",
      title: "Review your squad's standard tools and plugins",
      body: "Confirm the skills, public agents, Slack agents, rescue bot, and workboard adapters your squad expects to use in Link.",
      complete: squadToolsComplete,
      meta: `${skills.length} skills, ${agents.length} agents, ${rescueComplete ? "bot-troubleshooting available" : "rescue bot unavailable"}.`,
      action: (
        <div className="onboardingActions">
          <button className="button secondary" onClick={() => setView("dojo")}>Open Experto</button>
          <button className="button ghost" onClick={() => setView("agents")}>Open Agents</button>
          <button className="button ghost" onClick={() => void markStep("squad-tools")}>Mark reviewed</button>
        </div>
      ),
      required: true,
    },
    {
      id: "hindsight-wiki",
      title: "Attach the squad archive",
      body: "If a squad archive exists, Link can use it as the user's starting wiki and long-term context layer.",
      complete: hindsightComplete || completed.has("hindsight-wiki"),
      meta: squadBank ? `Found ${squadBank.name}` : hindsightComplete ? `${memoryBanks.length} archives connected.` : "Connect an archive or create a squad archive when ready.",
      action: (
        <div className="onboardingActions">
          <button className="button secondary" onClick={() => setView("memory")}>Open Archive</button>
          <button className="button ghost" onClick={() => void markStep("hindsight-wiki")}>No squad wiki yet</button>
        </div>
      ),
      required: false,
    },
  ];

  return (
    <section className="content onboardingView">
      <header className="pageHeader">
        <div>
          <h1>User onboarding</h1>
        </div>
        <div className="headerActions">
          <button className="button ghost" onClick={() => void dismissOnboarding()}>
            <X size={15} />
            Dismiss
          </button>
          <button className="button primary" onClick={() => void finishOnboarding()} disabled={!requiredComplete}>Finish onboarding</button>
        </div>
      </header>
      <div className="onboardingHero">
        <div>
          <strong>Personal setup, squad defaults, and memory context in one place.</strong>
          <p>Link keeps onboarding visible until setup is dismissed or completed. Okta and internal services can fill in user and squad context later as those adapters come online.</p>
        </div>
        <Badge tone={requiredComplete ? "success" : "warning"}>{steps.filter((step) => step.complete).length}/{steps.length} complete</Badge>
      </div>
      <div className="onboardingGrid">
        {steps.map((step) => (
          <article className={`onboardingStep ${step.complete ? "complete" : ""}`} key={step.id}>
            <div className="stepIcon">{step.complete ? "OK" : step.required ? "!" : "-"}</div>
            <div className="stepBody">
              <div className="connectorTitle">
                <strong>{step.title}</strong>
                <Badge tone={step.complete ? "success" : step.required ? "warning" : "default"}>{step.complete ? "complete" : step.required ? "required" : "optional"}</Badge>
              </div>
              <p>{step.body}</p>
              <small>{step.meta}</small>
              {step.action}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Rail({
  view,
  setView,
  expanded,
  onboarding,
  setOnboarding,
  accountStatus,
  signedOutLocally,
  setAccountStatus,
  setSignedOutLocally,
}: {
  view: ViewId;
  setView: (view: ViewId) => void;
  expanded: boolean;
  onboarding: OnboardingState;
  setOnboarding?: (onboarding: OnboardingState) => void;
  accountStatus: AgentControlPlaneAuthStatus | null;
  signedOutLocally: boolean;
  setAccountStatus: (status: AgentControlPlaneAuthStatus) => void;
  setSignedOutLocally: (signedOut: boolean) => void;
}) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const showOnboarding = onboarding && !onboarding.dismissed && !onboarding.completed;
  const signedIn = Boolean(accountStatus?.ready && !signedOutLocally);
  const accountIdentity = accountStatus?.userName || accountStatus?.actor || accountStatus?.userId || "";
  const accountLabel = accountIdentity || (signedIn ? "Telnyx Okta" : "Not signed in");
  const accountInitials = accountIdentity ? initialsFromIdentity(accountIdentity) : "TL";
  const accountAvatarUrl = accountStatus?.avatarUrl || "";
  const accountAvatar = accountAvatarUrl ? <img src={accountAvatarUrl} alt="" aria-hidden="true" /> : accountInitials;

  useEffect(() => {
    if (!accountMenuOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [accountMenuOpen]);

  async function dismissOnboarding() {
    const next = await linkApi.updateOnboarding({ dismissed: true });
    setOnboarding?.(next);
    if (view === "onboarding") setView("widgets");
  }

  async function signInAccount() {
    const next = await linkApi.signInAgentControlPlane();
    setAccountStatus(next);
    setSignedOutLocally(false);
    setAccountMenuOpen(false);
  }

  async function logoutAccount() {
    const next = await linkApi.signOutAgentControlPlane();
    setAccountStatus(next);
    setSignedOutLocally(true);
    setAccountMenuOpen(false);
    setView("widgets");
  }

  const renderRailButton = (item: { id: ViewId; label: string; icon: AppIcon }) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        className={`railButton ${view === item.id ? "selected" : ""}`}
        title={item.label}
        onClick={() => setView(item.id)}
      >
        <span className="railIconSlot"><Icon size={17} /></span>
        <span className="railLabel">{item.label}</span>
        <span className="railTooltip" role="tooltip">
          {item.label}
        </span>
      </button>
    );
  };

  return (
    <nav className="rail" aria-label="Primary" data-expanded={expanded}>
      <button className="railButton brandButton" title="Telnyx Link" onClick={() => setView("widgets")}>
        <span className="railIconSlot"><img src="./triforce-26.png" alt="" aria-hidden="true" /></span>
        <span className="railLabel">Telnyx Link</span>
        <span className="railTooltip" role="tooltip">
          Telnyx Link
        </span>
      </button>
      {navItems.map(renderRailButton)}
      <div className="railSpacer" />
      {showOnboarding && (
        <div className="railOnboardingItem">
          {renderRailButton({ id: "onboarding", label: "Start", icon: Flag })}
          <button className="railDismiss" title="Dismiss onboarding" aria-label="Dismiss onboarding" onClick={() => void dismissOnboarding()}>
            <X size={12} />
          </button>
        </div>
      )}
      {renderRailButton({ id: "settings", label: "Settings", icon: Settings })}
      <div className="accountMenuWrap" ref={accountMenuRef}>
        <button
          className={`avatar ${accountMenuOpen ? "selected" : ""}`}
          title={signedIn ? accountLabel : "User menu"}
          aria-label={signedIn ? `User menu for ${accountLabel}` : "User menu"}
          aria-expanded={accountMenuOpen}
          onClick={() => setAccountMenuOpen((open) => !open)}
        >
          {accountAvatar}
        </button>
        {accountMenuOpen && (
          <div className="accountMenu" role="menu">
            <div className="accountMenuHeader">
              <div className="accountAvatar">{accountAvatar}</div>
              <div>
                <strong>{signedIn ? "Signed in" : "Signed out"}</strong>
                <small>{accountLabel}</small>
              </div>
              <button
                className={`accountAuthButton ${signedIn ? "signedIn" : ""}`}
                onClick={() => void (signedIn ? logoutAccount() : signInAccount())}
              >
                {signedIn ? "Sign out" : "Sign in"}
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

function Sidebar({
  view,
  work,
  skills,
  connectors,
  workspaces,
  chatSessions,
  changeRequests,
  agents,
  memoryBanks,
  dojoState,
  selectedWorkspaceId,
  selectedSessionId,
  setSelectedWorkspaceId,
  setSelectedSessionId,
  setSelectedWorkId,
  setView,
}: {
  view: ViewId;
  work: ActiveWorkItem[];
  skills: SkillMetadata[];
  connectors: ConnectorStatus[];
  workspaces: WorkspaceSummary[];
  chatSessions: ChatSession[];
  changeRequests: LinkChangeRequest[];
  agents: AgentSummary[];
  memoryBanks: MemoryBank[];
  dojoState: DojoState | null;
  selectedWorkspaceId: string;
  selectedSessionId: string;
  setSelectedWorkspaceId: (id: string) => void;
  setSelectedSessionId: (id: string) => void;
  setSelectedWorkId: (id: string) => void;
  setView: (view: ViewId) => void;
}) {
  const pendingCount = work.filter((item) => item.status === "pending").length + changeRequests.filter((item) => item.status === "pending_review").length;
  return (
    <aside className="sidebar">
      <div className="searchBox">
        <Search size={15} />
        <input placeholder="Search..." />
      </div>
      <SidebarSection title="Workspaces" count={workspaces.length} icon={<Grid2X2 size={13} />} active={view === "workspaces"}>
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            className={`sideRow ${selectedWorkspaceId === workspace.id ? "selected" : ""}`}
            onClick={() => {
              setSelectedWorkspaceId(workspace.id);
              setView("workspaces");
            }}
          >
            <span>
              <strong>{workspace.name}</strong>
              <small>{workspace.tabs.length} tabs - {workspace.fileCount} files</small>
            </span>
            <StatusDot tone={workspace.status === "review" ? "warning" : workspace.status === "active" ? "success" : "muted"} />
          </button>
        ))}
      </SidebarSection>
      <SidebarSection title="Pending" count={pendingCount} icon={<Bell size={13} />}>
        {work.slice(0, 3).map((item) => (
          <button
            key={item.id}
            className="sideRow slim"
            onClick={() => {
              setSelectedWorkId(item.id);
              setView("workspaces");
            }}
          >
            <span>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </span>
            <StatusDot tone={item.status === "pending" ? "warning" : "muted"} />
          </button>
        ))}
      </SidebarSection>
      <SidebarSection title="Chat" count={chatSessions.length} icon={<MessageSquare size={13} />} compact active={view === "chats"}>
        {chatSessions.slice(0, 4).map((session) => (
          <button
            key={session.id}
            className={`sideRow slim ${selectedSessionId === session.id ? "selected" : ""}`}
            onClick={() => {
              setSelectedSessionId(session.id);
              setView("chats");
            }}
          >
            <span>
              <strong>{session.title}</strong>
              <small>{session.model}</small>
            </span>
            <StatusDot tone={session.status === "active" ? "success" : "muted"} />
          </button>
        ))}
      </SidebarSection>
      <SidebarSection title="Tasks" count={0} icon={<SquareCheck size={13} />} compact active={view === "workboard"} />
      <SidebarSection title="Phone" count={1} icon={<Phone size={13} />} compact active={view === "phone"} />
      <SidebarSection title="Calendar" count={3} icon={<CalendarDays size={13} />} compact active={view === "calendar"} />
      <SidebarSection title="Agents" count={agents.length} icon={<Bot size={13} />} compact active={view === "agents"} />
      <SidebarSection title="Archive" count={memoryBanks.length} icon={<ArchiveIcon size={13} />} compact active={view === "memory"} />
      <SidebarSection title="Experto" count={dojoState?.profile.masteredSkills ?? 0} icon={<ChessKnight size={13} />} compact active={view === "dojo"} />
    </aside>
  );
}

function SidebarSection({
  title,
  count,
  icon,
  children,
  compact,
  active,
}: {
  title: string;
  count: number;
  icon: ReactNode;
  children?: ReactNode;
  compact?: boolean;
  active?: boolean;
}) {
  return (
    <section className={`sideSection ${compact ? "compact" : ""} ${active ? "active" : ""}`}>
      <div className="sideSectionTitle">
        {icon}
        <span>{title}</span>
        <em>{count}</em>
      </div>
      {children}
    </section>
  );
}

function WorkspacesView({
  workspaces,
  work,
  automations,
  changeRequests,
  selectedWorkspace,
  selectedWork,
  selectWorkspace,
  selectWork,
  decideWork,
  approveChange,
  dismissChange,
  refresh,
}: {
  workspaces: WorkspaceSummary[];
  work: ActiveWorkItem[];
  automations: AutomationItem[];
  changeRequests: LinkChangeRequest[];
  selectedWorkspace?: WorkspaceSummary;
  selectedWork?: ActiveWorkItem;
  selectWorkspace: (id: string) => void;
  selectWork: (id: string) => void;
  decideWork: (id: string, decision: "approve" | "dismiss") => Promise<void>;
  approveChange: (id: string) => Promise<void>;
  dismissChange: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  async function createDraft() {
    await linkApi.createSharedChannelDraft({
      title: "Generated customer-safe update",
      userPrompt: "Draft a customer-safe update for Acme about the SMS delivery investigation.",
      requestedAction: "post update to shared customer Slack channel",
      threadContext:
        "Internal note: see #support-escalations. Raw log trace id msg-891. Customer impact appears limited to delayed SMS delivery in US traffic.",
    });
    await refresh();
  }

  return (
    <section className="content workspacesView">
      <header className="pageHeader">
        <div>
          <h1>Workspaces</h1>
        </div>
        <div className="headerActions">
          <button className="button secondary" onClick={createDraft}>
            <Plus size={15} />
            Draft update
          </button>
        </div>
      </header>

      <div className="workspaceGrid">
        {workspaces.map((workspace) => (
          <button key={workspace.id} className={`workspaceCard ${selectedWorkspace?.id === workspace.id ? "selected" : ""}`} onClick={() => selectWorkspace(workspace.id)}>
            <div className="workspaceCardTop">
              <strong>{workspace.name}</strong>
              <Badge tone={workspace.status === "review" ? "warning" : workspace.status === "active" ? "success" : "default"}>{workspace.status}</Badge>
            </div>
            <p>{workspace.description}</p>
            <div className="workspaceStats">
              <span>{workspace.tabs.length} tabs</span>
              <span>{workspace.fileCount} files</span>
              <span>{workspace.activeWorkIds.length} active</span>
            </div>
          </button>
        ))}
      </div>

      {selectedWorkspace && (
        <>
          <div className="sectionLabel">
            <ChevronDown size={14} />
            Open tabs
          </div>
          <div className="tabGrid">
            {selectedWorkspace.tabs.map((tab) => (
              <article className="workspaceTabCard" key={tab.id}>
                <FileText size={17} />
                <div>
                  <strong>{tab.title}</strong>
                  <small>{tab.kind} - {tab.status}</small>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <div className="sectionLabel">
        <ChevronDown size={14} />
        Active work and admin review
      </div>
      <div className="workspaceDetailGrid">
        <div className="reviewQueue">
          {work.map((item) => (
            <button key={item.id} className={`reviewQueueRow ${selectedWork?.id === item.id ? "selected" : ""}`} onClick={() => selectWork(item.id)}>
              <span>
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
              </span>
              <StatusDot tone={item.status === "pending" ? "warning" : item.status === "approved" ? "success" : "muted"} />
            </button>
          ))}
          {changeRequests.map((request) => (
            <article className="changeRequestRow" key={request.id}>
              <div>
                <strong>{request.title}</strong>
                <small>{request.status.replaceAll("_", " ")}</small>
              </div>
              <div className="rowActions">
                {request.status === "pending_review" && (
                  <>
                    <button className="button primary" onClick={() => approveChange(request.id)}>Approve</button>
                    <button className="button ghost" onClick={() => dismissChange(request.id)}>Dismiss</button>
                  </>
                )}
                {request.github?.prUrl && <Badge tone="success">PR queued</Badge>}
              </div>
            </article>
          ))}
        </div>
        <ActiveWorkArtifact selectedWork={selectedWork} decideWork={decideWork} />
      </div>

      <div className="sectionLabel">
        <ChevronDown size={14} />
        Automations
      </div>
      <div className="automationStrip">
        {automations.map((automation) => (
          <Panel title={automation.name} key={automation.id}>
            <Badge tone={automation.status === "active" ? "success" : "default"}>{automation.status}</Badge>
            <p>{automation.schedule} in {automation.channel}</p>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function ActiveWorkArtifact({
  selectedWork,
  decideWork,
}: {
  selectedWork?: ActiveWorkItem;
  decideWork: (id: string, decision: "approve" | "dismiss") => Promise<void>;
}) {
  if (!selectedWork) return <Panel title="No work selected"><p>Select a review item to inspect content and approval state.</p></Panel>;

  return (
    <article className="artifactCard">
      <div className="artifactChrome">
        <strong>customer-safe-draft.md</strong>
        <span>{selectedWork.summary}</span>
        <FileText size={16} />
      </div>
      <div className="artifactBody">
        <h2>{selectedWork.title}</h2>
        <p className="draftText">{selectedWork.details.customerSafeDraft}</p>
        <div className="artifactFooter">
          <div>
            <strong>Sources</strong>
            <small>{selectedWork.details.sourcesUsed.join(", ")}</small>
          </div>
          {selectedWork.status === "pending" && (
            <div className="headerActions">
              <button className="button primary" onClick={() => decideWork(selectedWork.id, "approve")}>Approve</button>
              <button className="button ghost" onClick={() => decideWork(selectedWork.id, "dismiss")}>Dismiss</button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function WidgetsView({
  libraryOpen,
  setLibraryOpen,
}: {
  libraryOpen: boolean;
  setLibraryOpen: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | WidgetCatalogItem["category"]>("All");
  const [layoutEditing, setLayoutEditing] = useState(false);
  const [draggedWidgetId, setDraggedWidgetId] = useState("");
  const [widgetDropTargetId, setWidgetDropTargetId] = useState("");
  const [widgetsLoading, setWidgetsLoading] = useState(true);
  const [widgetError, setWidgetError] = useState("");
  const [widgetCatalog, setWidgetCatalog] = useState<WidgetCatalogItem[]>([]);
  const [dashboardWidgetIds, setDashboardWidgetIds] = useState<string[]>([]);
  const [widgetData, setWidgetData] = useState<Record<string, WidgetDataResult>>({});
  const [widgetDataErrors, setWidgetDataErrors] = useState<Record<string, string>>({});
  const [refreshingWidgetId, setRefreshingWidgetId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadWidgets() {
      setWidgetsLoading(true);
      setWidgetError("");
      try {
        const [catalog, layout] = await Promise.all([linkApi.listWidgetCatalog(), linkApi.listWidgetLayout()]);
        if (cancelled) return;
        const authorizedIds = new Set(catalog.map((widget) => widget.id));
        const savedIds = layout.widgetIds.filter((id) => authorizedIds.has(id));
        const startingIds = savedIds.length > 0 ? savedIds : catalog.slice(0, 3).map((widget) => widget.id);
        setWidgetCatalog(catalog);
        setDashboardWidgetIds(startingIds);
        void Promise.all(startingIds.map((widgetId) => loadWidgetData(widgetId)));
      } catch {
        if (!cancelled) {
          setWidgetCatalog([]);
          setDashboardWidgetIds([]);
          setWidgetError("Tableau widgets are unavailable. Connect the strict-access widget service from Settings.");
        }
      } finally {
        if (!cancelled) setWidgetsLoading(false);
      }
    }

    void loadWidgets();
    return () => {
      cancelled = true;
    };
  }, []);

  const dashboardWidgets = useMemo(() => {
    const byId = new Map(widgetCatalog.map((widget) => [widget.id, widget]));
    return dashboardWidgetIds.map((id) => byId.get(id)).filter((widget): widget is WidgetCatalogItem => Boolean(widget));
  }, [dashboardWidgetIds, widgetCatalog]);

  const filteredLibrary = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return widgetCatalog.filter((widget) => {
      const matchesCategory = category === "All" || widget.category === category;
      const matchesQuery =
        !normalizedQuery ||
        [widget.title, widget.source, widget.category, widget.description].some((field) => field.toLowerCase().includes(normalizedQuery));
      return matchesCategory && matchesQuery;
    });
  }, [category, query, widgetCatalog]);

  async function loadWidgetData(widgetId: string) {
    setWidgetDataErrors((current) => ({ ...current, [widgetId]: "" }));
    try {
      const data = await linkApi.refreshWidgetData({ widgetId });
      setWidgetData((current) => ({ ...current, [widgetId]: data }));
    } catch {
      setWidgetDataErrors((current) => ({ ...current, [widgetId]: "Access unavailable" }));
    }
  }

  function saveDashboardLayout(nextIds: string[]) {
    const deduped = [...new Set(nextIds)];
    setDashboardWidgetIds(deduped);
    void linkApi.saveWidgetLayout({ widgetIds: deduped }).then((layout) => {
      setDashboardWidgetIds(layout.widgetIds);
    }).catch(() => {
      setWidgetError("The widget layout could not be saved.");
    });
  }

  function addWidget(widget: WidgetCatalogItem) {
    if (dashboardWidgetIds.includes(widget.id)) return;
    saveDashboardLayout([...dashboardWidgetIds, widget.id]);
    void loadWidgetData(widget.id);
  }

  function removeWidget(widgetId: string) {
    saveDashboardLayout(dashboardWidgetIds.filter((id) => id !== widgetId));
  }

  function startWidgetDrag(event: DragEvent<HTMLElement>, widgetId: string) {
    if (!layoutEditing) return;
    setDraggedWidgetId(widgetId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-link-widget", widgetId);
    event.dataTransfer.setData("text/plain", widgetId);
  }

  function allowWidgetDrop(event: DragEvent<HTMLElement>, widgetId: string) {
    if (!layoutEditing || draggedWidgetId === widgetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setWidgetDropTargetId(widgetId);
  }

  function dropWidget(event: DragEvent<HTMLElement>, targetWidgetId: string) {
    event.preventDefault();
    const sourceWidgetId = event.dataTransfer.getData("application/x-link-widget") || event.dataTransfer.getData("text/plain");
    setDraggedWidgetId("");
    setWidgetDropTargetId("");
    if (!sourceWidgetId || sourceWidgetId === targetWidgetId) return;

    const sourceIndex = dashboardWidgetIds.indexOf(sourceWidgetId);
    const targetIndex = dashboardWidgetIds.indexOf(targetWidgetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...dashboardWidgetIds];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    saveDashboardLayout(next);
  }

  function endWidgetDrag() {
    setDraggedWidgetId("");
    setWidgetDropTargetId("");
  }

  async function refreshDashboardWidget(widgetId: string) {
    setRefreshingWidgetId(widgetId);
    await loadWidgetData(widgetId);
    setRefreshingWidgetId("");
  }

  return (
    <section className="content widgetsView">
      <header className="pageHeader">
        <div>
          <h1>Widgets</h1>
        </div>
        <div className="headerActions">
          <button className="button secondary" onClick={() => setLibraryOpen(true)}>
            <Plus size={15} />
            Widget library
          </button>
          <button className={`button secondary ${layoutEditing ? "active" : ""}`} onClick={() => setLayoutEditing((editing) => !editing)} aria-pressed={layoutEditing}>
            <LayoutDashboard size={15} />
            Manage layout
          </button>
        </div>
      </header>

      <div className="widgetHomeGrid">
        {libraryOpen ? (
          <section className="widgetLibrary widgetLibraryTakeover" aria-label="Widget library">
            <div className="widgetLibraryHeader">
              <div>
                <strong>Widget library</strong>
                <small>Browse Tableau widgets authorized for your user and squad</small>
              </div>
              <button className="button ghost" onClick={() => setLibraryOpen(false)}>
                <X size={14} />
                Close
              </button>
            </div>
            <div className="widgetLibraryControls">
              <div className="widgetSearch">
                <Search size={15} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports" autoFocus />
              </div>
              <div className="widgetCategoryTabs" role="tablist" aria-label="Widget categories">
                {([
                  ["All", "All", Grid2X2],
                  ["Revenue", "Revenue", Target],
                  ["Operations", "Operations", Settings],
                  ["Product", "Product", Store],
                ] as const).map(([item, label, Icon]) => (
                  <button key={item} className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="widgetLibraryList">
              {filteredLibrary.map((widget) => {
                const added = dashboardWidgetIds.includes(widget.id);
                return (
                  <article className="widgetLibraryItem" key={widget.id}>
                    <div className="widgetLibraryItemTop">
                      <div className="connectorIcon">{sourceInitials(widget.source)}</div>
                      <div>
                        <strong>{widget.title}</strong>
                        <small>{widget.source} - {widget.category}</small>
                      </div>
                    </div>
                    <p>{widget.description}</p>
                    <button className="button secondary" onClick={() => addWidget(widget)} disabled={added}>
                      <Plus size={14} />
                      {added ? "Added" : "Add widget"}
                    </button>
                  </article>
                );
              })}
              {filteredLibrary.length === 0 && (
                <EmptyState
                  title={widgetsLoading ? "Loading widgets" : "No authorized Tableau widgets"}
                  body={widgetError || "Try another report name or request access from the widget owner squad."}
                />
              )}
            </div>
          </section>
        ) : (
          <section className="widgetCanvas" aria-label="Home widgets">
            {layoutEditing && (
              <div className="widgetCanvasHeader">
                <button className="button primary" onClick={() => setLayoutEditing(false)}>
                  <LayoutDashboard size={15} />
                  Done
                </button>
              </div>
            )}
            <div className={`dashboardWidgetGrid ${layoutEditing ? "layoutEditing" : ""}`}>
              {dashboardWidgets.map((widget) => (
                <article
                  className={`dashboardWidget ${draggedWidgetId === widget.id ? "dragging" : ""} ${widgetDropTargetId === widget.id ? "dropTarget" : ""}`}
                  key={widget.id}
                  draggable={layoutEditing}
                  onDragStart={(event) => startWidgetDrag(event, widget.id)}
                  onDragOver={(event) => allowWidgetDrop(event, widget.id)}
                  onDragLeave={() => setWidgetDropTargetId((current) => current === widget.id ? "" : current)}
                  onDrop={(event) => dropWidget(event, widget.id)}
                  onDragEnd={endWidgetDrag}
                >
                  <div className="widgetCardTop">
                    <div className="connectorIcon">{sourceInitials(widget.source)}</div>
                    <div>
                      <strong>{widget.title}</strong>
                      <small>{widget.source} - {widget.cadence}</small>
                    </div>
                    <button className="iconButton" aria-label={`Refresh ${widget.title}`} onClick={() => void refreshDashboardWidget(widget.id)}>
                      <RefreshCw size={14} className={refreshingWidgetId === widget.id ? "spinning" : ""} />
                    </button>
                    <button className="iconButton" aria-label={`Remove ${widget.title}`} onClick={() => removeWidget(widget.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="widgetMetric">
                    <span>{widgetData[widget.id]?.metric ?? "Loading"}</span>
                    <small>{widgetData[widget.id]?.trend ?? "Waiting for Tableau data"}</small>
                  </div>
                  <WidgetChart widget={widget} data={widgetData[widget.id]} error={widgetDataErrors[widget.id]} />
                </article>
              ))}
              {dashboardWidgets.length === 0 && !widgetsLoading && (
                <EmptyState
                  title={widgetCatalog.length === 0 ? "No authorized Tableau widgets" : "No widgets added"}
                  body={widgetError || "Add authorized reports from the widget library to build your home page."}
                />
              )}
              {dashboardWidgets.length === 0 && widgetsLoading && <EmptyState title="Loading widgets" body="Checking your Tableau widget access." />}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}

function WidgetChart({ widget, data, error }: { widget: WidgetCatalogItem; data?: WidgetDataResult; error?: string }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 320, height: 112 });

  useEffect(() => {
    const element = chartContainerRef.current;
    if (!element) return;
    const updateSize = () => {
      setChartSize({
        width: Math.max(1, element.clientWidth),
        height: Math.max(1, element.clientHeight),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (error) return <div className="widgetChartPreview widgetDataState">Access unavailable</div>;
  if (!data) return <div className="widgetChartPreview widgetDataState">Loading Tableau data</div>;
  if (data.rows.length === 0) return <div className="widgetChartPreview widgetDataState">No Tableau rows returned</div>;

  const xKey = widget.chart.xField ?? data.columns[0] ?? "label";
  const yKey = widget.chart.yField;
  const chartProps = { data: data.rows, width: chartSize.width, height: chartSize.height, margin: { top: 8, right: 10, bottom: 0, left: -18 } };

  return (
    <div ref={chartContainerRef} className="widgetChartPreview" role="img" aria-label={`${widget.title} chart`}>
      {widget.chart.type === "line" ? (
        <LineChart {...chartProps}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Line type="monotone" dataKey={yKey} stroke="var(--accent)" strokeWidth={2} dot={false} />
        </LineChart>
      ) : widget.chart.type === "area" ? (
        <AreaChart {...chartProps}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Area type="monotone" dataKey={yKey} stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={2} />
        </AreaChart>
      ) : (
        <BarChart {...chartProps}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar dataKey={yKey} fill="var(--accent)" radius={[5, 5, 2, 2]} />
        </BarChart>
      )}
    </div>
  );
}

type ExplorerSourceTab = "support" | "developers" | "wiki" | "local";

const explorerSourceTabs: {
  id: ExplorerSourceTab;
  label: string;
  icon: AppIcon;
  title: string;
  body: string;
  setup: string;
  settingsLabel: string;
  sources: ExplorerResult["source"][];
}[] = [
  {
    id: "support",
    label: "Help Center",
    icon: BookOpen,
    title: "Help Center",
    body: "Customer-facing support articles from support.telnyx.com.",
    setup: "Connect Telnyx Docs access through the internal Vault-backed docs relay to search Help Center articles inside Link.",
    settingsLabel: "Open Docs access",
    sources: ["telnyx_support"],
  },
  {
    id: "developers",
    label: "Developer Docs",
    icon: FileText,
    title: "Developer Docs",
    body: "Mintlify-powered API guides, SDK references, and implementation docs.",
    setup: "Connect Telnyx Docs access through the internal Vault-backed docs relay to search bot-readable developer docs.",
    settingsLabel: "Open Docs access",
    sources: ["telnyx_developers"],
  },
  {
    id: "wiki",
    label: "Guru Wiki",
    icon: BookOpen,
    title: "Company Wiki powered by Guru",
    body: "Internal Guru knowledge cards available through Telnyx docs access.",
    setup: "Connect Guru Wiki through the internal Vault-backed docs relay to search company wiki content.",
    settingsLabel: "Open Docs access",
    sources: ["guru"],
  },
  {
    id: "local",
    label: "Local",
    icon: FolderOpen,
    title: "Local bot context",
    body: "Files, skills, agents, and archive entries available on this device.",
    setup: "Local files, skills, agents, and archive entries appear when available on this device.",
    settingsLabel: "Open Settings",
    sources: ["google_drive", "link_file", "skill", "agent", "memory"],
  },
];

function ExplorerView({
  selectedWorkspace,
  embedded = false,
  externalQuery,
  externalSource,
  externalSort = "az",
  hideSearch = false,
  docSourcesOnly = false,
  onOpenSettings,
}: {
  selectedWorkspace?: WorkspaceSummary;
  embedded?: boolean;
  externalQuery?: string;
  externalSource?: ExplorerSourceTab | "all";
  externalSort?: "az" | "za";
  hideSearch?: boolean;
  docSourcesOnly?: boolean;
  onOpenSettings?: () => void;
}) {
  const [internalQuery, setInternalQuery] = useState("Messaging delivery escalation");
  const [results, setResults] = useState<ExplorerResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [sourceTab, setSourceTab] = useState<ExplorerSourceTab>("support");
  const [suggestionStatus, setSuggestionStatus] = useState("");
  const query = externalQuery ?? internalQuery;
  const availableSourceTabs = useMemo(
    () => docSourcesOnly ? explorerSourceTabs.filter((tab) => tab.id !== "local") : explorerSourceTabs,
    [docSourcesOnly],
  );
  const activeSourceTab = availableSourceTabs.find((tab) => tab.id === sourceTab) ?? availableSourceTabs[0] ?? explorerSourceTabs[0]!;
  const activeExternalTab = externalSource && externalSource !== "all" ? availableSourceTabs.find((tab) => tab.id === externalSource) : undefined;
  const displayedSourceTab = activeExternalTab ?? activeSourceTab;
  const sourceFilteredResults = activeExternalTab
    ? results.filter((result) => activeExternalTab.sources.includes(result.source))
    : results.filter((result) => activeSourceTab.sources.includes(result.source));
  const visibleResults = [...sourceFilteredResults].sort((left, right) => (
    externalSort === "za" ? right.title.localeCompare(left.title) : left.title.localeCompare(right.title)
  ));

  async function search() {
    setBusy(true);
    setResults(await linkApi.searchExplorer({ query, workspaceId: selectedWorkspace?.id }));
    setBusy(false);
  }

  async function suggestImprovement(result: ExplorerResult) {
    setSuggestionStatus(`Drafting a bot-assisted improvement suggestion for ${result.title}.`);
    try {
      await linkApi.createChangeRequest({
        title: `${result.title} documentation improvement`,
        summary: `A bot or user found ${displayedSourceTab.title} hard to use for the current question.`,
        requestedChange: [
          `Source: ${result.title}`,
          result.url ? `URL: ${result.url}` : "",
          "",
          "Search or task:",
          query.trim() || "Not captured",
          "",
          "What the bot saw:",
          result.excerpt,
          "",
          "Requested outcome:",
          "Review this source and update the relevant documentation so future Link, OpenClaw, Hermes, and AIDA answers can cite clearer material.",
        ].filter(Boolean).join("\n"),
        workspaceId: selectedWorkspace?.id,
        githubRepo: "team-telnyx/link",
      });
      setSuggestionStatus(`Suggestion drafted for ${result.title}.`);
    } catch (err) {
      setSuggestionStatus(err instanceof Error ? err.message : "Unable to draft improvement suggestion.");
    }
  }

  async function suggestSourceImprovement() {
    setSuggestionStatus(`Drafting a bot-assisted improvement suggestion for ${displayedSourceTab.title}.`);
    try {
      await linkApi.createChangeRequest({
        title: `${displayedSourceTab.title} documentation improvement`,
        summary: `A bot or user could not find useful ${displayedSourceTab.title} results in Link.`,
        requestedChange: [
          `Source tab: ${displayedSourceTab.title}`,
          "",
          "Search or task:",
          query.trim() || "Not captured",
          "",
          "Requested outcome:",
          "Review the connected source content and update the relevant Telnyx documentation so future agents can find accurate answers.",
        ].join("\n"),
        workspaceId: selectedWorkspace?.id,
        githubRepo: "team-telnyx/link",
      });
      setSuggestionStatus(`Suggestion drafted for ${displayedSourceTab.title}.`);
    } catch (err) {
      setSuggestionStatus(err instanceof Error ? err.message : "Unable to draft improvement suggestion.");
    }
  }

  useEffect(() => {
    void search();
  }, [selectedWorkspace?.id, externalQuery]);

  useEffect(() => {
    if (!availableSourceTabs.some((tab) => tab.id === sourceTab)) {
      setSourceTab(availableSourceTabs[0]?.id ?? "support");
    }
  }, [availableSourceTabs, sourceTab]);

  return (
    <section className={embedded ? "explorerView embeddedExplorerView" : "content explorerView"}>
      {!embedded && (
        <header className="pageHeader">
          <div>
            <h1>Library</h1>
          </div>
        </header>
      )}
      {!hideSearch && (
        <div className="explorerSearch">
          <Search size={16} />
          <input value={query} onChange={(event) => setInternalQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void search()} />
          <button className="button primary" onClick={search} disabled={busy}>{busy ? "Searching" : "Search"}</button>
        </div>
      )}
      {(!externalSource || docSourcesOnly) && (
        <div className="explorerSourceTabs" role="tablist" aria-label="Documentation sources">
          {availableSourceTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} className={sourceTab === tab.id ? "selected" : ""} onClick={() => setSourceTab(tab.id)} role="tab" aria-selected={sourceTab === tab.id}>
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
      <section className="explorerSourceHeader" aria-label={displayedSourceTab.title}>
        <div>
          <h2>{displayedSourceTab.title}</h2>
          <p>{displayedSourceTab.body}</p>
        </div>
        {suggestionStatus && <span>{suggestionStatus}</span>}
      </section>
      <div className="explorerResults">
        {visibleResults.map((result) => (
          <article className="explorerResult" key={result.id}>
            <div className="connectorIcon">{sourceInitials(result.source)}</div>
            <div>
              <div className="connectorTitle">
                <strong>{result.title}</strong>
                <Badge tone={result.permission === "allowed" ? "success" : result.permission === "needs_access" ? "warning" : "default"}>{result.permission.replace("_", " ")}</Badge>
              </div>
              <p>{result.excerpt}</p>
              <small>{result.source.replace("_", " ")} - {result.type} - {result.freshness}</small>
            </div>
            <div className="explorerResultActions">
              {result.url ? (
                <a className="button secondary" href={result.url} target="_blank" rel="noreferrer">Open</a>
              ) : (
                <button className="button secondary">Open</button>
              )}
              <button className="button ghost" onClick={() => void suggestImprovement(result)}>Suggest improvement</button>
            </div>
          </article>
        ))}
        {visibleResults.length === 0 && (docSourcesOnly || activeExternalTab) ? (
          <section className="docsSetupState">
            <div className="connectorIcon">{sourceInitials(displayedSourceTab.sources[0] ?? displayedSourceTab.id)}</div>
            <div>
              <h3>No results found</h3>
              <p>{displayedSourceTab.setup}</p>
              <small>Link searches and renders the source material in-app so users can see what a bot sees before suggesting improvements.</small>
            </div>
            <div className="docsSetupActions">
              {onOpenSettings && <button className="button primary" onClick={onOpenSettings}>{displayedSourceTab.settingsLabel}</button>}
              <button className="button secondary" onClick={() => void suggestSourceImprovement()}>Suggest improvement</button>
            </div>
          </section>
        ) : (
          visibleResults.length === 0 && <EmptyState title="No results found" body="Try another source tab or search term." />
        )}
      </div>
    </section>
  );
}

function MarketplaceView({ embedded = false, hideHeader = false }: { embedded?: boolean; hideHeader?: boolean } = {}) {
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const publishMenuRef = useRef<HTMLDivElement | null>(null);
  const publishOptions = [
    { label: "App", detail: "Submit a private app to the managed publisher.", icon: Store },
    { label: "Skill", detail: "Publish a reusable bot skill for Telnyx teams.", icon: Zap },
    { label: "Doc", detail: "Share a local bot page, runbook, or source bundle.", icon: BookOpen },
    { label: "Automation", detail: "Publish a scheduled workflow owned by your bot.", icon: Bot },
  ];

  useEffect(() => {
    function closePublishMenu(event: MouseEvent) {
      if (!publishMenuRef.current?.contains(event.target as Node)) setPublishMenuOpen(false);
    }
    if (publishMenuOpen) document.addEventListener("mousedown", closePublishMenu);
    return () => document.removeEventListener("mousedown", closePublishMenu);
  }, [publishMenuOpen]);

  return (
    <section className={embedded ? "marketplaceView embeddedMarketplace" : "content marketplaceView"}>
      {!hideHeader && (
        <header className={embedded ? "pageHeader marketplaceEmbeddedHeader" : "pageHeader"}>
          <div>
            <h1>App Marketplace</h1>
          </div>
          <div className="headerActions marketplaceHeaderActions">
            <div className="publishMenuWrap" ref={publishMenuRef}>
              <button className="button primary" onClick={() => setPublishMenuOpen((open) => !open)} aria-expanded={publishMenuOpen} aria-haspopup="menu">
                <Plus size={15} />
                Publish
              </button>
              {publishMenuOpen && (
                <div className="publishMenu" role="menu" aria-label="Publish from local bot">
                  <div className="publishMenuHeader">
                    <strong>Publish from local bot</strong>
                    <small>Select what this bot should package for Telnyx employees.</small>
                  </div>
                  {publishOptions.map(({ label, detail, icon: Icon }) => (
                    <button key={label} role="menuitem" onClick={() => setPublishMenuOpen(false)}>
                      <Icon size={16} />
                      <span>
                        <strong>{label}</strong>
                        <small>{detail}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      <div className="marketplaceGrid">
        {marketplaceApps.map((app) => (
          <article className="marketplaceCard" key={app.id}>
            <div className="marketplaceCardHeader">
              <div className="marketplaceIcon">
                <Store size={18} />
              </div>
              <div>
                <strong>{app.name}</strong>
                <small>{app.publisher}</small>
              </div>
              <Badge tone={app.status === "Installed" ? "success" : app.status === "Reviewing" ? "warning" : "default"}>{app.status}</Badge>
            </div>
            <p>{app.description}</p>
            <div className="marketplaceMeta">
              <span><Bot size={13} /> {app.bot}</span>
              <span><Users size={13} /> {app.audience}</span>
              <span><ShieldCheck size={13} /> {app.installMode}</span>
            </div>
            <div className="marketplaceActions">
              <button className={app.status === "Installed" ? "button ghost" : "button secondary"}>
                {app.status === "Installed" ? "Installed" : app.installMode === "VPN access" ? "Open via VPN" : "Duplicate"}
              </button>
              <button className="button ghost">Details</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChatsView({
  sessions,
  workspaces,
  memoryBanks,
  selectedSession,
  selectSession,
  openArtifact,
  openMemory,
}: {
  sessions: ChatSession[];
  workspaces: WorkspaceSummary[];
  memoryBanks: MemoryBank[];
  selectedSession?: ChatSession;
  selectSession: (id: string) => void;
  openArtifact: (artifact: ChatArtifact) => void;
  openMemory: () => void;
}) {
  const [reviewTab, setReviewTab] = useState<"chat" | "docs" | "actions" | "sources" | "outputs" | "archive">("chat");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modelFilter, setModelFilter] = useState("all");
  const modelOptions = useMemo(() => [...new Set(sessions.map((session) => formatModelLabel(session.model)).filter(Boolean))].sort(), [sessions]);
  const workspaceById = useMemo(() => new Map(workspaces.map((workspace) => [workspace.id, workspace])), [workspaces]);
  const getSessionMeta = (session: ChatSession, workspace?: WorkspaceSummary) => {
    const messages = session.messages.filter((message) => message.role !== "system");
    const artifacts = messages.flatMap((message) => message.artifacts ?? []);
    const sources = messages.flatMap((message) => message.sources ?? []);
    const actions = messages
      .flatMap((message) => message.content.split("\n"))
      .map((line) => line.trim().replace(/^[-*]\s*/, ""))
      .filter((line) => /\b(action|todo|follow up|review|open|create|assign|validate|confirm|update|draft)\b/i.test(line))
      .slice(0, 8);
    return {
      actions,
      artifacts,
      messages,
      sources,
      subtitle: `${workspace?.name ?? "Standalone chat"} · ${messages.length} messages · ${formatModelLabel(session.model)}`,
    };
  };
  const filteredSessions = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sessions.filter((session) => {
      const workspace = workspaceById.get(session.workspaceId);
      const modelLabel = formatModelLabel(session.model);
      const matchesModel = modelFilter === "all" || modelLabel === modelFilter;
      if (!matchesModel) return false;
      if (!term) return true;
      const searchable = [
        session.title,
        modelLabel,
        workspace?.name,
        ...session.messages.flatMap((message) => [
          message.content,
          ...(message.sources ?? []).map((source) => `${source.title} ${source.source}`),
          ...(message.artifacts ?? []).map((artifact) => `${artifact.title} ${artifact.filename}`),
        ]),
      ].filter(Boolean).join(" ").toLowerCase();
      return searchable.includes(term);
    });
  }, [modelFilter, query, sessions, workspaceById]);
  const sessionsByWorkspace = workspaces
    .map((workspace) => ({
      workspace,
      sessions: filteredSessions.filter((session) => session.workspaceId === workspace.id),
    }))
    .filter((group) => group.sessions.length > 0);
  const ungroupedSessions = filteredSessions.filter((session) => !workspaces.some((workspace) => workspace.id === session.workspaceId));
  const archiveQueryForSession = (session: ChatSession) => {
    const lastUserMessage = [...session.messages].reverse().find((message) => message.role === "user");
    return (lastUserMessage?.content || session.title || "What did we decide about Link improvement requests?").slice(0, 220);
  };

  function renderReviewTabs(session: ChatSession, workspace?: WorkspaceSummary) {
    const sessionMeta = getSessionMeta(session, workspace);
    return (
      <div className="chatResultDetails">
        <div className="chatReviewTabs" role="tablist" aria-label={`${session.title} review`}>
          {([
            ["chat", "Chat", MessageSquare],
            ["docs", "Docs", BookOpen],
            ["actions", "Actions", SquareCheck],
            ["sources", "Sources", ExternalLink],
            ["outputs", "Outputs", FileText],
            ["archive", "Archive", ArchiveIcon],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} className={reviewTab === id ? "selected" : ""} onClick={() => setReviewTab(id)} role="tab" aria-selected={reviewTab === id}>
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <div className="chatReviewPane">
          {reviewTab === "chat" && (
            <div className="chatPreviewMessages">
              {sessionMeta.messages.slice(-6).map((message) => (
                <div key={message.id} className={`message ${message.role === "user" ? "you" : "link"}`}>
                  <strong>{message.role === "user" ? "You" : message.displayName ?? "Telnyx AI Assistant"}</strong>
                  <p>{message.content}</p>
                  {message.sources && message.sources.length > 0 && (
                    <div className="messageSources" aria-label="Sources">
                      {message.sources.map((source) => (
                        <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
                          {source.title}
                        </a>
                      ))}
                    </div>
                  )}
                  <MessageArtifacts artifacts={message.artifacts} openArtifact={openArtifact} />
                </div>
              ))}
              {sessionMeta.messages.length === 0 && <EmptyState title="No messages" body="This session does not have visible messages yet." />}
            </div>
          )}
          {reviewTab === "docs" && (
            <div className="chatReviewList">
              {sessionMeta.artifacts.map((artifact) => (
                <button key={artifact.id} className="chatReviewItem" onClick={() => openArtifact(artifact)}>
                  <FileText size={16} />
                  <span>
                    <strong>{artifact.title}</strong>
                    <small>{artifact.filename}</small>
                  </span>
                </button>
              ))}
              {sessionMeta.artifacts.length === 0 && <EmptyState title="No docs yet" body="Generated docs and attached artifacts will appear here." />}
            </div>
          )}
          {reviewTab === "actions" && (
            <div className="chatReviewList">
              {(sessionMeta.actions.length ? sessionMeta.actions : ["Review the selected session and decide the next follow-up."]).map((item, index) => (
                <div key={`${item}-${index}`} className="chatReviewItem">
                  <SquareCheck size={16} />
                  <span><strong>{item}</strong></span>
                </div>
              ))}
            </div>
          )}
          {reviewTab === "sources" && (
            <div className="chatReviewList">
              {sessionMeta.sources.map((source) => (
                <a key={source.id} className="chatReviewItem" href={source.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} />
                  <span>
                    <strong>{source.title}</strong>
                    <small>{source.source} · {source.freshness}</small>
                  </span>
                </a>
              ))}
              {sessionMeta.sources.length === 0 && <EmptyState title="No sources yet" body="Cited docs, support articles, and internal references will appear here." />}
            </div>
          )}
          {reviewTab === "outputs" && (
            <div className="chatReviewList">
              {sessionMeta.artifacts.map((artifact) => (
                <button key={artifact.id} className="chatReviewItem" onClick={() => openArtifact(artifact)}>
                  <FileText size={16} />
                  <span>
                    <strong>{artifact.filename}</strong>
                    <small>{artifact.kind.toUpperCase()} · generated output</small>
                  </span>
                </button>
              ))}
              {sessionMeta.artifacts.length === 0 && <EmptyState title="No outputs yet" body="Files, drafts, and generated artifacts will appear here." />}
            </div>
          )}
          {reviewTab === "archive" && (
            <ArchiveTabs
              banks={memoryBanks}
              openMemory={openMemory}
              compact
              initialTab="memories"
              initialQuery={archiveQueryForSession(session)}
            />
          )}
        </div>
      </div>
    );
  }

  function renderSessionRow(session: ChatSession, index: number, workspace?: WorkspaceSummary) {
    const expanded = selectedSession?.id === session.id;
    const sessionMeta = getSessionMeta(session, workspace);
    return (
      <article className={`chatResultRow ${expanded ? "expanded" : ""}`} key={session.id}>
        <button className="chatResultSummary" onClick={() => selectSession(session.id)} aria-expanded={expanded}>
          <ChevronDown size={15} className="connectorRowChevron" />
          <span className="connectorIcon"><MessageSquare size={16} /></span>
          <span className="chatResultText">
            <strong>{session.title}</strong>
            <small>{sessionMeta.subtitle}</small>
          </span>
          <kbd>⌘{index + 1}</kbd>
        </button>
        {expanded && renderReviewTabs(session, workspace)}
      </article>
    );
  }

  return (
    <section className="content chatView canonicalChat">
      <header className="pageHeader">
        <div>
          <h1>Chat</h1>
        </div>
      </header>
      <div className="chatSearchRow">
        <button
          className={`iconButton agentFilterButton ${filtersOpen ? "selected" : ""}`}
          aria-label={filtersOpen ? "Hide chat filters" : "Show chat filters"}
          title={filtersOpen ? "Hide chat filters" : "Show chat filters"}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <SlidersHorizontal size={16} />
        </button>
        <div className="explorerSearch compactSearch">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats, docs, actions, sources, outputs, or archive" />
        </div>
      </div>
      {filtersOpen && (
        <div className="chatFilterBar" role="group" aria-label="Chat filters">
          <label className="agentFilter">
            <span>Model</span>
            <select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
              <option value="all">All models</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </label>
          <span className="chatFilterCount">{filteredSessions.length} chats</span>
        </div>
      )}
      <div className="chatSessionRows" aria-label="Chat sessions">
        {sessionsByWorkspace.map(({ workspace, sessions: workspaceSessions }) => (
          <section className="chatSessionGroup" key={workspace.id}>
            <div className="chatDirectorySectionTitle">
              <FolderOpen size={16} />
              <span>{workspace.name}</span>
            </div>
            <div className="chatResultRows">
              {workspaceSessions.map((session, index) => renderSessionRow(session, index, workspace))}
              {workspaceSessions.length === 0 && <span className="noProjectChats">No chats</span>}
            </div>
          </section>
        ))}
        {ungroupedSessions.length > 0 && <section className="chatSessionGroup">
          <div className="chatResultRows">
            {ungroupedSessions.map((session, index) => renderSessionRow(session, sessionsByWorkspace.reduce((count, group) => count + group.sessions.length, index)))}
          </div>
        </section>}
        {filteredSessions.length === 0 && <EmptyState title="No chats found" body="Try another search term or filter." />}
      </div>
    </section>
  );
}

function MessageArtifacts({ artifacts, openArtifact }: { artifacts?: ChatArtifact[]; openArtifact: (artifact: ChatArtifact) => void }) {
  if (!artifacts?.length) return null;

  return (
    <div className="messageArtifacts">
      {artifacts.map((artifact) => (
        <button key={artifact.id} className="messageArtifactLink" onClick={() => openArtifact(artifact)}>
          <FileText size={14} />
          <span>{artifact.filename}</span>
        </button>
      ))}
    </div>
  );
}

function ArtifactViewer({ artifact, onClose }: { artifact: ChatArtifact; onClose: () => void }) {
  return (
    <section className="content artifactViewer">
      <header className="pageHeader">
        <div>
          <h1>{artifact.title}</h1>
          <p>{artifact.filename} - generated from chat</p>
        </div>
        <div className="headerActions">
          <Badge tone={artifact.kind === "pdf" ? "warning" : "default"}>{artifact.kind.toUpperCase()}</Badge>
          <button className="button secondary" onClick={onClose}>
            <X size={15} />
            Close
          </button>
        </div>
      </header>
      <article className={`artifactDocument artifactDocument-${artifact.kind}`}>
        {artifact.kind === "pdf" && (
          <div className="pdfPreviewChrome">
            <FileText size={18} />
            <span>PDF preview</span>
          </div>
        )}
        <pre>{artifact.content}</pre>
      </article>
    </section>
  );
}

function AssistantPanel({
  mode,
  setMode,
  agents,
  bookmarkedAgentIds,
  activeAgent,
  selectedSession,
  selectedWorkspace,
  selectSession,
  openArtifact,
  refresh,
  setView,
  liteLlmReady,
  linkedPhoneNumber,
  telnyxApiReady,
}: {
  mode: "chat" | "phone";
  setMode: (mode: "chat" | "phone") => void;
  agents: AgentSummary[];
  bookmarkedAgentIds: string[];
  activeAgent: ActiveAgentSelection | null;
  selectedSession?: ChatSession;
  selectedWorkspace?: WorkspaceSummary;
  selectSession: (id: string) => void;
  openArtifact: (artifact: ChatArtifact) => void;
  refresh: () => Promise<void>;
  setView: (view: ViewId) => void;
  liteLlmReady: boolean;
  linkedPhoneNumber: string;
  telnyxApiReady: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [assistantAttachMenuOpen, setAssistantAttachMenuOpen] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [agentQuery, setAgentQuery] = useState("");
  const [selectedChatAgentId, setSelectedChatAgentId] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("telnyx-link-selected-chat-agent") ?? "";
  });
  const [assistantSettingsOpen, setAssistantSettingsOpen] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceInputStatus, setVoiceInputStatus] = useState("");
  const [docsSuggestionStatus, setDocsSuggestionStatus] = useState("");
  const [planMode, setPlanMode] = useState(false);
  const [pursueGoal, setPursueGoal] = useState(false);
  const [featureRequestMode, setFeatureRequestMode] = useState(false);
  const [createSkillMode, setCreateSkillMode] = useState(false);
  const [sessionNameDraft, setSessionNameDraft] = useState("");
  const [sidebarDialNumber, setSidebarDialNumber] = useState("");
  const [sidebarCallStatus, setSidebarCallStatus] = useState("Idle");
  const assistantAttachMenuRef = useRef<HTMLDivElement | null>(null);
  const assistantLogRef = useRef<HTMLDivElement | null>(null);
  const assistantLogEndRef = useRef<HTMLDivElement | null>(null);
  const sendRequestIdRef = useRef(0);
  const agentPickerRef = useRef<HTMLDivElement | null>(null);
  const assistantSettingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const assistantSettingsPopoverRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const ringbackToneRef = useRef<{
    context: AudioContext;
    gain: GainNode;
    intervalId: number;
    oscillators: OscillatorNode[];
  } | null>(null);
  const [acceptMode, setAcceptMode] = useState<"auto" | "review" | "manual">("auto");
  const modelMode = "auto-agent-runtime";
  const bookmarkedAgentIdSet = useMemo(() => new Set(bookmarkedAgentIds), [bookmarkedAgentIds]);
  const chatAgents = useMemo(() => {
    const toChatAgent = (agent: AgentSummary) => ({
      id: agent.id,
      displayName: agent.displayName,
      description: agent.description,
      source: agent.source,
      type: agent.type,
      status: agent.status,
      squad: agent.squad ?? (agent.source === "agent-control-plane" ? "agent-control-plane" : "directory"),
    });
    const availableHostedAgents = agents
      .filter((agent) => agent.source === "agent-control-plane" && (agent.type === "hermes" || agent.type === "openclaw"))
      .map(toChatAgent);
    const bookmarkedAgents = agents
      .filter((agent) => bookmarkedAgentIdSet.has(agent.id) && agent.source !== "slack" && agent.type !== "slack")
      .filter((agent) => agent.id !== "slack-bot-troubleshooting" && agent.name !== "bot-troubleshooting")
      .map(toChatAgent);

    const uniqueAgents = (items: typeof bookmarkedAgents) => [...new Map(items.map((agent) => [agent.id, agent])).values()];
    if (!activeAgent) return uniqueAgents([...bookmarkedAgents, ...availableHostedAgents]);

    const activeDirectoryAgent = agents.find((agent) => agent.id === activeAgent.id);
    const activeChatAgent = activeDirectoryAgent ? toChatAgent(activeDirectoryAgent) : null;

    return uniqueAgents([...(activeChatAgent ? [activeChatAgent] : []), ...bookmarkedAgents, ...availableHostedAgents]);
  }, [activeAgent, agents, bookmarkedAgentIdSet]);
  const selectedChatAgent = chatAgents.find((agent) => agent.id === selectedChatAgentId) ?? chatAgents[0];
  const filteredChatAgents = chatAgents.filter((agent) =>
    `${agent.displayName} ${agent.description} ${agent.type} ${agent.source} ${agent.squad}`.toLowerCase().includes(agentQuery.toLowerCase()),
  );
  const visibleMessageCount = selectedSession?.messages.filter((message) => message.role !== "system").length ?? 0;

  useEffect(() => {
    if (chatAgents.length === 0) {
      if (selectedChatAgentId) setSelectedChatAgentId("");
      return;
    }
    if (!chatAgents.some((agent) => agent.id === selectedChatAgentId)) {
      const storedAgentId = typeof window === "undefined" ? "" : window.localStorage.getItem("telnyx-link-selected-chat-agent") ?? "";
      const storedAgent = chatAgents.find((agent) => agent.id === storedAgentId);
      setSelectedChatAgentId(storedAgent?.id ?? chatAgents[0]!.id);
    }
  }, [chatAgents, selectedChatAgentId]);

  useEffect(() => {
    if (!selectedChatAgentId || !chatAgents.some((agent) => agent.id === selectedChatAgentId)) return;
    window.localStorage.setItem("telnyx-link-selected-chat-agent", selectedChatAgentId);
  }, [chatAgents, selectedChatAgentId]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      stopVoiceStream();
      stopRingbackTone();
    };
  }, []);

  useEffect(() => {
    setSessionNameDraft(selectedSession?.title ?? "");
  }, [selectedSession?.id, selectedSession?.title]);

  useEffect(() => {
    assistantLogEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [busy, selectedSession?.id, visibleMessageCount]);

  useEffect(() => {
    if (!assistantAttachMenuOpen && !agentPickerOpen && !assistantSettingsOpen) return;

    function handleOutsidePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (assistantAttachMenuOpen && !assistantAttachMenuRef.current?.contains(target)) {
        setAssistantAttachMenuOpen(false);
      }
      if (agentPickerOpen && !agentPickerRef.current?.contains(target)) {
        setAgentPickerOpen(false);
        setAgentQuery("");
      }
      if (
        assistantSettingsOpen &&
        !assistantSettingsPopoverRef.current?.contains(target) &&
        !assistantSettingsTriggerRef.current?.contains(target)
      ) {
        setAssistantSettingsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setAssistantAttachMenuOpen(false);
      setAgentPickerOpen(false);
      setAgentQuery("");
      setAssistantSettingsOpen(false);
    }

    document.addEventListener("mousedown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [assistantAttachMenuOpen, agentPickerOpen, assistantSettingsOpen]);

  async function send() {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    const requestId = sendRequestIdRef.current + 1;
    sendRequestIdRef.current = requestId;
    setBusy(true);
    try {
      const workflowPrefix = featureRequestMode
        ? "Feature request workflow: guide this Telnyx user through drafting a feature request for team-telnyx/link, preparing a branch from main, and opening a reviewable PR."
        : createSkillMode
          ? "Create skill workflow: guide this Telnyx user through either converting this session into a SKILL.md or starting a new skill from scratch, then preparing it for review."
          : "";
      const session = await linkApi.sendChatMessage({
        sessionId: selectedSession?.id,
        workspaceId: selectedWorkspace?.id,
        content: workflowPrefix ? `${workflowPrefix}\n\n${trimmed}` : trimmed,
        agentId: selectedChatAgent?.id,
        agentName: selectedChatAgent?.displayName,
        approvalMode: acceptMode,
        modelMode,
      });
      if (sendRequestIdRef.current !== requestId) return;
      selectSession(session.id);
      setPrompt("");
      await refresh();
    } finally {
      if (sendRequestIdRef.current === requestId) setBusy(false);
    }
  }

  function stopSend() {
    sendRequestIdRef.current += 1;
    setBusy(false);
  }

  async function saveSessionName() {
    if (!selectedSession) return;
    const trimmed = sessionNameDraft.trim();
    if (!trimmed) {
      setSessionNameDraft(selectedSession.title);
      return;
    }
    if (trimmed === selectedSession.title) return;
    await linkApi.renameChatSession({ sessionId: selectedSession.id, title: trimmed });
    await refresh();
  }

  async function suggestDocsUpdate(message: ChatMessage) {
    const previousUserMessage = [...(selectedSession?.messages ?? [])].reverse().find((item) => item.role === "user");
    setDocsSuggestionStatus("Drafting documentation update");
    try {
      await linkApi.createChangeRequest({
        title: "Suggest Telnyx documentation update",
        summary: "A bot answer may be wrong or incomplete against Telnyx Support Center or Developer Docs.",
        requestedChange: [
          "Documentation sources to verify:",
          "- https://support.telnyx.com/en/",
          "- https://developers.telnyx.com/docs/overview",
          "",
          "User question:",
          previousUserMessage?.content ?? "Not captured",
          "",
          "Bot answer to review:",
          message.content,
          "",
          "Requested outcome:",
          "Update the relevant documentation in team-telnyx/link so future OpenClaw/Hermes/AIDA answers can cite the corrected source.",
        ].join("\n"),
        workspaceId: selectedWorkspace?.id,
        sourceSessionId: selectedSession?.id,
        githubRepo: "team-telnyx/link",
      });
      await refresh();
      setDocsSuggestionStatus("Docs update suggestion queued for review.");
    } catch (err) {
      setDocsSuggestionStatus(err instanceof Error ? err.message : "Unable to draft docs update.");
    }
  }

  async function toggleVoiceInput() {
    if (voiceListening) {
      if (mediaRecorderRef.current?.state === "recording") {
        setVoiceInputStatus("Transcribing...");
        mediaRecorderRef.current.stop();
        return;
      }
      recognitionRef.current?.stop();
      setVoiceListening(false);
      setVoiceInputStatus("");
      return;
    }

    if (typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined") {
      try {
        await startRecordedVoiceInput();
        return;
      } catch (err) {
        setVoiceListening(false);
        stopVoiceStream();
        setVoiceInputStatus(err instanceof Error ? err.message : "Voice input could not start.");
        return;
      }
    }

    startBrowserSpeechRecognition();
  }

  async function startRecordedVoiceInput() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = preferredAudioMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    voiceChunksRef.current = [];
    voiceStreamRef.current = stream;
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) voiceChunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      setVoiceListening(false);
      setVoiceInputStatus("Voice input stopped.");
      stopVoiceStream();
      mediaRecorderRef.current = null;
    };
    recorder.onstop = () => {
      void transcribeRecordedVoice(recorder.mimeType || mimeType || "audio/webm");
    };

    recorder.start();
    setVoiceListening(true);
    setVoiceInputStatus("Listening...");
  }

  async function transcribeRecordedVoice(mimeType: string) {
    const audioBlob = new Blob(voiceChunksRef.current, { type: mimeType });
    voiceChunksRef.current = [];
    mediaRecorderRef.current = null;
    stopVoiceStream();
    setVoiceListening(false);

    if (audioBlob.size === 0) {
      setVoiceInputStatus("No voice audio was captured.");
      return;
    }

    setVoiceInputStatus("Transcribing...");
    try {
      const audioBase64 = await blobToBase64(audioBlob);
      const result = await linkApi.transcribeAudio({ audioBase64, mimeType: audioBlob.type || mimeType });
      appendVoiceTranscript(result.text);
      setVoiceInputStatus("Voice captured.");
    } catch (err) {
      setVoiceInputStatus(err instanceof Error ? err.message : "Voice transcription failed.");
    }
  }

  function appendVoiceTranscript(transcript: string) {
    const trimmed = transcript.trim();
    if (!trimmed) return;
    setPrompt((current) => (current.trim() ? `${current.trimEnd()} ${trimmed}` : trimmed));
  }

  function stopVoiceStream() {
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
  }

  function startBrowserSpeechRecognition() {
    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      setVoiceInputStatus("Voice input is not available on this device.");
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      const transcriptParts: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = event.results[index]?.[0]?.transcript?.trim();
        if (transcript) transcriptParts.push(transcript);
      }
      const transcript = transcriptParts.join(" ").trim();
      if (transcript) {
        appendVoiceTranscript(transcript);
        setVoiceInputStatus("Voice captured.");
      }
    };
    recognition.onerror = (event) => {
      setVoiceListening(false);
      setVoiceInputStatus(event.error === "not-allowed" ? "Microphone access was denied." : "Voice input stopped.");
    };
    recognition.onend = () => {
      setVoiceListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setVoiceListening(true);
      setVoiceInputStatus("Listening...");
    } catch {
      setVoiceListening(false);
      setVoiceInputStatus("Voice input could not start.");
    }
  }

  function startSidebarCall() {
    if (!sidebarDialNumber.trim()) return;
    setSidebarCallStatus(`Calling ${sidebarDialNumber.trim()}`);
    startRingbackTone();
  }

  function appendDialDigit(digit: string) {
    setSidebarDialNumber((current) => `${current}${digit}`);
  }

  function deleteDialDigit() {
    setSidebarDialNumber((current) => current.slice(0, -1));
  }

  function answerSidebarCall() {
    stopRingbackTone();
    setSidebarCallStatus("In call");
  }

  function hangupSidebarCall() {
    stopRingbackTone();
    setSidebarCallStatus("Idle");
  }

  function toggleMuteSidebarCall() {
    stopRingbackTone();
    setSidebarCallStatus((status) => (status === "Muted" ? "In call" : "Muted"));
  }

  function toggleHoldSidebarCall() {
    stopRingbackTone();
    setSidebarCallStatus((status) => (status === "On hold" ? "In call" : "On hold"));
  }

  function startRingbackTone() {
    if (ringbackToneRef.current) return;
    type WindowWithWebKitAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextConstructor = window.AudioContext ?? (window as WindowWithWebKitAudio).webkitAudioContext;
    if (!AudioContextConstructor) {
      setVoiceInputStatus("Call started. Ringback audio is not available in this browser runtime.");
      return;
    }

    try {
      const context = new AudioContextConstructor();
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.connect(context.destination);

      const oscillators = [440, 480].map((frequency) => {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        oscillator.connect(gain);
        oscillator.start();
        return oscillator;
      });

      const pulse = () => {
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.07, now + 0.05);
        gain.gain.setValueAtTime(0.07, now + 1.9);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2);
      };

      void context.resume().catch(() => undefined);
      pulse();
      ringbackToneRef.current = {
        context,
        gain,
        intervalId: window.setInterval(pulse, 4000),
        oscillators,
      };
    } catch {
      setVoiceInputStatus("Call started. Ringback audio could not be started.");
    }
  }

  function stopRingbackTone() {
    const tone = ringbackToneRef.current;
    if (!tone) return;
    window.clearInterval(tone.intervalId);
    tone.gain.gain.cancelScheduledValues(tone.context.currentTime);
    tone.gain.gain.setValueAtTime(0.0001, tone.context.currentTime);
    tone.oscillators.forEach((oscillator) => {
      try {
        oscillator.stop();
      } catch {
        // Oscillators can only be stopped once.
      }
    });
    void tone.context.close().catch(() => undefined);
    ringbackToneRef.current = null;
  }

  const sidebarCallActive = sidebarCallStatus !== "Idle";

  function attachPhotosAndFiles() {
    setAssistantAttachMenuOpen(false);
    setVoiceInputStatus("File attachment picker will open when local file ingestion is wired.");
  }

  function toggleFeatureRequestMode(enabled: boolean) {
    setFeatureRequestMode(enabled);
    if (enabled) {
      setCreateSkillMode(false);
      setVoiceInputStatus("Feature request mode will guide a PR against team-telnyx/link.");
    }
  }

  function toggleCreateSkillMode(enabled: boolean) {
    setCreateSkillMode(enabled);
    if (enabled) {
      setFeatureRequestMode(false);
      setVoiceInputStatus("Create skill mode will guide a SKILL.md draft and review submission.");
    }
  }

  function openLiteLlmSettings() {
    setAssistantAttachMenuOpen(false);
    setAssistantSettingsOpen(false);
    setAgentPickerOpen(false);
    setView("settings");
  }

  function openAgentSelection() {
    setAssistantAttachMenuOpen(false);
    setAssistantSettingsOpen(false);
    setAgentQuery("");
    if (chatAgents.length > 0) {
      setAgentPickerOpen(true);
      return;
    }
    setAgentPickerOpen(false);
    setView("agents");
  }

  function openTelnyxSettings() {
    setAssistantAttachMenuOpen(false);
    setAssistantSettingsOpen(false);
    setAgentPickerOpen(false);
    setView("settings");
  }

  function runtimeActionForMessage(message: ChatMessage) {
    if (/No Agent Control Plane agent id was selected|Choose a hosted Hermes\/OpenClaw agent/i.test(message.content)) {
      return {
        label: chatAgents.length > 0 ? "Choose agent" : "Open Agents",
        onClick: openAgentSelection,
      };
    }
    if (!liteLlmReady && /LITELLM_API_KEY|LiteLLM API key|Add your Telnyx LiteLLM/i.test(message.content)) {
      return {
        label: "Add LiteLLM API key",
        onClick: openLiteLlmSettings,
      };
    }
    return null;
  }

  return (
    <aside className="assistantPanel" aria-label="Assistant">
      <div className="assistantTabs">
        <button className={mode === "chat" ? "selected" : ""} onClick={() => setMode("chat")}><MessageSquare size={15} />Chat</button>
        <button className={mode === "phone" ? "selected" : ""} onClick={() => setMode("phone")}><Phone size={15} />Phone</button>
      </div>
      {mode === "chat" ? (
        <>
          {selectedSession && (
            <div className="assistantSessionContext">
              <small>Session</small>
              {selectedChatAgent && <span className="assistantSessionAgent">Agent: {selectedChatAgent.displayName}</span>}
              <input
                className="assistantSessionTitleInput"
                value={sessionNameDraft}
                aria-label="Session name"
                onChange={(event) => setSessionNameDraft(event.target.value)}
                onBlur={() => void saveSessionName()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    setSessionNameDraft(selectedSession.title);
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>
          )}
          <div className="assistantLog" ref={assistantLogRef}>
            {(selectedSession?.messages ?? []).filter((message) => message.role !== "system").map((message) => (
              <div key={message.id} className={`assistantMessage ${message.role === "user" ? "you" : "link"}`}>
                <strong>{message.role === "user" ? "You" : message.displayName ?? selectedChatAgent?.displayName ?? "Telnyx AI Assistant"}</strong>
                <p>{message.content}</p>
                <MessageArtifacts artifacts={message.artifacts} openArtifact={openArtifact} />
                {message.role === "assistant" && (
                  <div className="assistantMessageActions">
                    {(() => {
                      const action = runtimeActionForMessage(message);
                      return action ? (
                        <button className="runtimeSettingsButton" onClick={action.onClick}>
                          <Settings size={14} />
                          {action.label}
                        </button>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="assistantMessage link thinking" aria-live="polite">
                <strong>{selectedChatAgent?.displayName ?? "Telnyx AI Assistant"}</strong>
                <p>Working...</p>
              </div>
            )}
            {!selectedSession && <div className="assistantEmpty">Start with a prompt. Link will route through Telnyx LiteLLM when configured.</div>}
            <div ref={assistantLogEndRef} />
          </div>
          {docsSuggestionStatus && <div className="voiceInputStatus" aria-live="polite">{docsSuggestionStatus}</div>}
          <div className="assistantComposer">
            <textarea
              value={prompt}
              placeholder="Reply..."
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (shouldSubmitComposer(event)) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="assistantComposerActions">
              <div className="assistantComposerTools">
                <div className="assistantAttachMenuRoot" ref={assistantAttachMenuRef}>
                  <button
                    className="iconButton assistantAttachTrigger"
                    title="Add context"
                    aria-label="Add context"
                    aria-expanded={assistantAttachMenuOpen}
                    onClick={() => {
                      setAgentPickerOpen(false);
                      setAssistantSettingsOpen(false);
                      setAssistantAttachMenuOpen((open) => !open);
                    }}
                  >
                    <Plus size={16} />
                  </button>
                  {assistantAttachMenuOpen && (
                    <div className="assistantAttachMenu" role="menu" aria-label="Add context">
                      <button role="menuitem" onClick={attachPhotosAndFiles}>
                        <Upload size={16} />
                        <span>Add photos & files</span>
                      </button>
                      <div className="assistantAttachDivider" />
                      <label className="assistantAttachToggle">
                        <span><SquareCheck size={16} />Plan mode</span>
                        <input type="checkbox" checked={planMode} onChange={(event) => setPlanMode(event.target.checked)} />
                      </label>
                      <label className="assistantAttachToggle">
                        <span><Target size={16} />Pursue goal</span>
                        <input type="checkbox" checked={pursueGoal} onChange={(event) => setPursueGoal(event.target.checked)} />
                      </label>
                      <label className="assistantAttachToggle">
                        <span><SquareTerminal size={16} />Feature request</span>
                        <input type="checkbox" checked={featureRequestMode} onChange={(event) => toggleFeatureRequestMode(event.target.checked)} />
                      </label>
                      <label className="assistantAttachToggle">
                        <span><FileText size={16} />Create skill</span>
                        <input type="checkbox" checked={createSkillMode} onChange={(event) => toggleCreateSkillMode(event.target.checked)} />
                      </label>
                    </div>
                  )}
                </div>
                <div className="assistantSettingsRoot">
                  <button
                    ref={assistantSettingsTriggerRef}
                    className="iconButton assistantSettingsTrigger"
                    title="Chat settings"
                    aria-label="Chat settings"
                    onClick={() => {
                      setAssistantAttachMenuOpen(false);
                      setAgentPickerOpen(false);
                      setAgentQuery("");
                      setAssistantSettingsOpen((open) => !open);
                    }}
                    aria-expanded={assistantSettingsOpen}
                  >
                    <SlidersHorizontal size={16} />
                  </button>
                  {assistantSettingsOpen && (
                    <div className="assistantSettingsPopover" ref={assistantSettingsPopoverRef} role="dialog" aria-label="Chat settings">
                      <header>
                        <strong>Chat settings</strong>
                        <button className="iconButton" aria-label="Close chat settings" onClick={() => setAssistantSettingsOpen(false)}>
                          <X size={14} />
                        </button>
                      </header>
                      <label className="assistantSettingField">
                        <span>Approval mode</span>
                        <select value={acceptMode} onChange={(event) => setAcceptMode(event.target.value as typeof acceptMode)}>
                          <option value="auto">Auto Accept</option>
                          <option value="review">Ask before actions</option>
                          <option value="manual">Manual only</option>
                        </select>
                      </label>
                      <div className="assistantSettingField">
                        <span>Runtime route</span>
                        <strong>{selectedChatAgent ? "Automatic from selected agent" : "Automatic"}</strong>
                      </div>
                    </div>
                  )}
                </div>
                <div className="assistantAgentPicker" ref={agentPickerRef}>
                  <button
                    className="iconButton assistantAgentTrigger"
                    title={selectedChatAgent ? `Bot: ${selectedChatAgent.displayName}` : "Select bot"}
                    aria-label={selectedChatAgent ? `Select bot. Current bot is ${selectedChatAgent.displayName}` : "Select bot"}
                    aria-expanded={agentPickerOpen}
                    onClick={() => {
                      setAssistantAttachMenuOpen(false);
                      setAssistantSettingsOpen(false);
                      setAgentPickerOpen((open) => !open);
                    }}
                  >
                    <Bot size={16} />
                  </button>
                  {agentPickerOpen && (
                    <div className="agentPickerMenu">
                      <div className="agentPickerSearch">
                        <Search size={14} />
                        <input value={agentQuery} onChange={(event) => setAgentQuery(event.target.value)} placeholder="Search bookmarked agents" />
                      </div>
                      <div className="agentPickerList">
                        {filteredChatAgents.map((agent) => (
                          <button
                            key={agent.id}
                            className={selectedChatAgentId === agent.id ? "selected" : ""}
                            onClick={() => {
                              setSelectedChatAgentId(agent.id);
                              setAgentPickerOpen(false);
                              setAgentQuery("");
                            }}
                          >
                            <span className="agentPickerAvatar"><Bot size={14} /></span>
                            <span>
                              <strong>{agent.displayName}</strong>
                              <small>{agent.description}</small>
                            </span>
                          </button>
                        ))}
                        {filteredChatAgents.length === 0 && (
                          <div className="agentPickerEmpty">
                            Bookmark agents on the Agents page to use them in chat.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="assistantComposerSubmit">
                <button
                  className={`iconButton voiceInputButton ${voiceListening ? "active" : ""}`}
                  title={voiceListening ? "Stop voice input" : "Start voice input"}
                  aria-label={voiceListening ? "Stop voice input" : "Start voice input"}
                  aria-pressed={voiceListening}
                  onClick={toggleVoiceInput}
                >
                  <Mic size={17} />
                </button>
                <button className={`assistantSendButton ${busy ? "thinking" : ""}`} aria-label={busy ? "Stop response" : "Send"} title={busy ? "Stop response" : "Send"} onClick={busy ? stopSend : send} disabled={!busy && !prompt.trim()}>
                  {busy ? <Square size={15} fill="currentColor" /> : <ArrowUp size={20} />}
                </button>
              </div>
            </div>
            {voiceInputStatus && <div className="voiceInputStatus" aria-live="polite">{voiceInputStatus}</div>}
          </div>
        </>
      ) : (
        <>
          {!telnyxApiReady ? (
            <div className="panelPhoneDialer panelPhoneSetupPrompt">
              <div className="panelPhoneSetupIcon">
                <PhoneCall size={18} />
              </div>
              <div className="panelPhoneSetupCopy">
                <strong>Add your Telnyx API key to use calling</strong>
                <p>Link uses your Telnyx account to find active numbers and connect calls from this device.</p>
              </div>
              <button className="runtimeSettingsButton panelPhoneSetupButton" type="button" onClick={openTelnyxSettings}>
                <Settings size={14} />
                Add Telnyx API key
              </button>
            </div>
          ) : (
            <div className="panelPhoneDialer">
            <header className="panelPhoneDialerHeader">
              <div className="panelPhoneIdentity">
                <span>Linked number</span>
                <strong>{linkedPhoneNumber || "Choose a number"}</strong>
              </div>
              <div className={`panelPhoneCallState ${sidebarCallActive ? "active" : ""}`}>
                {sidebarCallStatus}
              </div>
            </header>
            <label className="panelPhoneNumberField">
              <span>Dial</span>
              <input
                type="tel"
                value={sidebarDialNumber}
                onChange={(event) => setSidebarDialNumber(event.target.value)}
                placeholder="+15551234567"
              />
            </label>
            <div className="panelPhoneKeypad" aria-label="Dial pad">
              {dialpadKeys.map((key) => (
                <button
                  key={key.digit}
                  type="button"
                  className="panelPhoneKey"
                  onClick={() => appendDialDigit(key.digit)}
                >
                  <strong>{key.digit}</strong>
                  <span>{key.letters}</span>
                </button>
              ))}
            </div>
            <div className="panelPhonePrimaryActions">
              <button
                type="button"
                className="panelPhoneCallButton"
                onClick={startSidebarCall}
                disabled={!linkedPhoneNumber || !sidebarDialNumber.trim()}
              >
                <PhoneCall size={16} />
                <span>Call</span>
              </button>
              <button
                type="button"
                className="button ghost panelPhoneDeleteButton"
                onClick={deleteDialDigit}
                disabled={!sidebarDialNumber}
              >
                Delete
              </button>
            </div>
            {sidebarCallActive && (
              <div className="panelPhoneActiveControls">
                <button className="button ghost" type="button" onClick={answerSidebarCall}>Answer</button>
                <button className="button ghost" type="button" onClick={toggleMuteSidebarCall}>Mute</button>
                <button className="button ghost" type="button" onClick={toggleHoldSidebarCall}>Hold</button>
                <button className="button secondary" type="button" onClick={hangupSidebarCall}><PhoneOff size={15} />Hang up</button>
              </div>
            )}
            <button className="button ghost panelPhoneChooseButton" type="button" onClick={() => setView("phone")}>Choose number</button>
          </div>
          )}
        </>
      )}
    </aside>
  );
}

function SkillsView({ skills }: { skills: SkillMetadata[] }) {
  const [query, setQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState("");
  const [result, setResult] = useState("");
  const filtered = skills.filter((skill) => `${skill.name} ${skill.description} ${skill.team}`.toLowerCase().includes(query.toLowerCase()));

  async function runSkill(skill: SkillMetadata) {
    setSelectedSkill(skill.name);
    setResult("Running skill...");
    try {
      const response = await linkApi.runSkill(skill.name);
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Skill run failed.");
    }
  }

  return (
    <section className="content skillsView">
      <header className="pageHeader">
        <div>
          <h1>Skills</h1>
        </div>
      </header>
      <div className="explorerSearch compactSearch">
        <Search size={16} />
        <input value={query} placeholder="Search skills..." onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="skillCatalog">
        {filtered.slice(0, 40).map((skill) => (
          <button key={skill.name} className={`skillCard ${selectedSkill === skill.name ? "selected" : ""}`} onClick={() => void runSkill(skill)}>
            <div className="connectorTitle">
              <strong>{skill.name}</strong>
              <Badge tone={skill.source === "telnyx" ? "default" : skill.approvalRequired ? "warning" : "success"}>{skill.source ?? "link"}</Badge>
            </div>
            <p>{skill.description}</p>
            <small>{skill.team} - {skill.product ?? "workflow"} - {skill.language ?? "skill"}</small>
          </button>
        ))}
      </div>
      {result && <pre className="resultPreview">{result}</pre>}
    </section>
  );
}

function AgentsView({
  agents,
  connectors,
  tools,
  refresh,
  setView,
  bookmarkedAgentIds,
  setBookmarkedAgentIds,
  activeAgent,
  setActiveAgent,
}: {
  agents: AgentSummary[];
  connectors: ConnectorStatus[];
  tools: ToolMetadata[];
  refresh: () => Promise<void>;
  setView: (view: ViewId) => void;
  bookmarkedAgentIds: string[];
  setBookmarkedAgentIds: (ids: string[] | ((current: string[]) => string[])) => void;
  activeAgent: ActiveAgentSelection | null;
  setActiveAgent: (agent: ActiveAgentSelection | null) => void;
}) {
  const [tab, setTab] = useState<"agents" | "my-agents" | "mcps">("agents");
  const [query, setQuery] = useState("");
  const [squadFilter, setSquadFilter] = useState("all");
  const [pluginFilter, setPluginFilter] = useState("all");
  const [hostedAgentFilter, setHostedAgentFilter] = useState("all");
  const [sortMode, setSortMode] = useState<"az" | "za" | "status">("az");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [acpAuth, setAcpAuth] = useState<AgentControlPlaneAuthStatus | null>(null);
  const [acpBusy, setAcpBusy] = useState(false);
  const [hostedAgents, setHostedAgents] = useState<HostedAgentSummary[]>([]);
  const [agentError, setAgentError] = useState("");
  const [addAgentStatus, setAddAgentStatus] = useState("");
  const [agentDrafts, setAgentDrafts] = useState<Record<string, string>>({});
  const [sendingAgentId, setSendingAgentId] = useState("");
  const [agentMessageStatus, setAgentMessageStatus] = useState("");
  const [expandedAgentIds, setExpandedAgentIds] = useState<string[]>([]);
  const isAcpReady = Boolean(acpAuth?.ready);
  const bookmarkedAgentIdSet = useMemo(() => new Set(bookmarkedAgentIds), [bookmarkedAgentIds]);
  const squads = useMemo(() => {
    return [...new Set(agents.map((agent) => agent.squad).filter((squad): squad is string => Boolean(squad)))].sort((left, right) =>
      left.localeCompare(right),
    );
  }, [agents]);
  const pluginCategories = useMemo(() => {
    return [...new Set(connectors.map((connector) => connector.category).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  }, [connectors]);
  const filteredAgents = useMemo(() => {
    const term = query.trim().toLowerCase();
    const results = agents.filter((agent) => {
      const matchesSquad = squadFilter === "all" || agent.squad === squadFilter;
      const searchable = [
        agent.displayName,
        agent.name,
        agent.description,
        agent.type,
        agent.status,
        agent.squad,
        agent.audience,
        agent.origin,
        ...agent.capabilities,
      ].join(" ").toLowerCase();
      return matchesSquad && (!term || searchable.includes(term));
    });
    return sortAgents(results, sortMode);
  }, [agents, query, squadFilter, sortMode]);
  const filteredConnectors = useMemo(() => {
    const term = query.trim().toLowerCase();
    const results = connectors.filter((connector) => {
      const matchesCategory = pluginFilter === "all" || connector.category === pluginFilter;
      const searchable = [
        connector.name,
        connector.description,
        connector.category,
        connector.status,
        connector.mode,
        ...connector.requiredAccess,
      ].join(" ").toLowerCase();
      return matchesCategory && (!term || searchable.includes(term));
    });
    return sortConnectors(results, sortMode);
  }, [connectors, pluginFilter, query, sortMode]);
  const filteredTools = useMemo(() => {
    const term = query.trim().toLowerCase();
    const results = tools.filter((tool) => {
      const searchable = [tool.name, tool.description, tool.category, tool.capability, tool.riskLevel].join(" ").toLowerCase();
      return !term || searchable.includes(term);
    });
    return sortTools(results, sortMode);
  }, [query, sortMode, tools]);
  const hostedAgentStatuses = useMemo(() => {
    return [...new Set(hostedAgents.map((agent) => agent.status).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  }, [hostedAgents]);
  const filteredHostedAgents = useMemo(() => {
    const term = query.trim().toLowerCase();
    const results = hostedAgents.filter((agent) => {
      const matchesStatus = hostedAgentFilter === "all" || agent.status === hostedAgentFilter;
      const searchable = [agent.displayName, agent.description, agent.type, agent.status].filter(Boolean).join(" ").toLowerCase();
      return matchesStatus && (!term || searchable.includes(term));
    });
    return sortHostedAgents(results, sortMode);
  }, [hostedAgentFilter, hostedAgents, query, sortMode]);

  async function refreshAgentControlPlane() {
    const nextAuth = await linkApi.getAgentControlPlaneAuthStatus();
    setAcpAuth(nextAuth);
    if (!nextAuth.ready) {
      setHostedAgents([]);
      return;
    }
    try {
      setAgentError("");
      const hosted = await linkApi.listHostedAgents();
      setHostedAgents(hosted);
      if (!activeAgent && hosted[0]) setActiveAgent({ id: hosted[0].id, displayName: hosted[0].displayName });
    } catch (err) {
      setHostedAgents([]);
      setAgentError(err instanceof Error ? err.message : "Unable to load Agent Control Plane agents.");
    }
  }

  useEffect(() => {
    void refreshAgentControlPlane();
  }, []);

  async function signInAgentControlPlane() {
    setAcpBusy(true);
    try {
      setAcpAuth(await linkApi.signInAgentControlPlane());
      await refresh();
      await refreshAgentControlPlane();
    } finally {
      setAcpBusy(false);
    }
  }

  async function openAddAgentFlow() {
    setAcpBusy(true);
    setAgentError("");
    setAddAgentStatus("");
    try {
      let nextAuth = acpAuth;
      if (!nextAuth?.ready) {
        nextAuth = await linkApi.signInAgentControlPlane();
        setAcpAuth(nextAuth);
      }
      if (!nextAuth.ready) throw new Error("Sign in with Okta before adding an agent.");
      const result = await linkApi.openAgentControlPlaneSetup();
      setAddAgentStatus(`Opened Agent Control Plane setup: ${result.url}`);
      await refresh();
      await refreshAgentControlPlane();
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : "Unable to open Agent Control Plane setup.");
    } finally {
      setAcpBusy(false);
    }
  }

  async function sendAgent(agent: AgentSummary) {
    const content = agentDrafts[agent.id]?.trim();
    if (!content) return;
    setSendingAgentId(agent.id);
    setAgentMessageStatus("");
    try {
      const result = await linkApi.sendAgentMessage({ agentId: agent.id, content });
      setAgentMessageStatus(result.message);
      setAgentDrafts((current) => ({ ...current, [agent.id]: "" }));
    } catch (err) {
      setAgentMessageStatus(err instanceof Error ? err.message : "Unable to message Slack agent.");
    } finally {
      setSendingAgentId("");
    }
  }

  function toggleBookmark(agentId: string) {
    setBookmarkedAgentIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    );
  }

  function toggleAgentDetails(agentId: string) {
    setExpandedAgentIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    );
  }

  return (
    <section className="content agentsView">
      <header className="pageHeader">
        <div>
          <h1>Agents</h1>
        </div>
        {tab === "my-agents" && (
          <div className="headerActions">
            <button className="button primary" onClick={() => void openAddAgentFlow()} disabled={acpBusy}>
              <Plus size={15} />
              Add Agent
            </button>
          </div>
        )}
      </header>
      <div className="agentTabs" role="tablist" aria-label="Agent sections">
        {([
          ["agents", "Agents", Bot],
          ["my-agents", "My Agents", Users],
          ["mcps", "MCPs", Grid2X2],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)} role="tab" aria-selected={tab === id}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      <div className="agentControls">
        <button
          className={`iconButton agentFilterButton ${filtersOpen ? "selected" : ""}`}
          aria-label={filtersOpen ? "Hide filters" : "Show filters"}
          title={filtersOpen ? "Hide filters" : "Show filters"}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <SlidersHorizontal size={16} />
        </button>
        <div className="explorerSearch compactSearch">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "agents" ? "Search agents, skills, tools, or squads" : tab === "my-agents" ? "Search my agents" : "Search MCPs, APIs, and plugins"}
          />
        </div>
        <label className="agentFilter agentSortFilter" aria-label="Sort">
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
            <option value="az">A-Z</option>
            <option value="za">Z-A</option>
            <option value="status">Status</option>
          </select>
        </label>
      </div>
      {filtersOpen && (
        <div className="agentFilterPanel">
          {tab === "agents" ? (
            <label className="agentFilter">
              <span>Squad</span>
              <select value={squadFilter} onChange={(event) => setSquadFilter(event.target.value)}>
                <option value="all">All squads</option>
                {squads.map((squad) => (
                  <option key={squad} value={squad}>{squad}</option>
                ))}
              </select>
            </label>
          ) : tab === "my-agents" ? (
            <label className="agentFilter">
              <span>Status</span>
              <select value={hostedAgentFilter} onChange={(event) => setHostedAgentFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {hostedAgentStatuses.map((status) => (
                  <option key={status} value={status}>{formatStatusLabel(status)}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="agentFilter">
              <span>MCP category</span>
              <select value={pluginFilter} onChange={(event) => setPluginFilter(event.target.value)}>
                <option value="all">All categories</option>
                {pluginCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {tab === "mcps" ? (
        <div className="mcpsPanel">
          <ConnectionsView
            connectors={filteredConnectors}
            tools={filteredTools}
            refresh={refresh}
            openSettings={() => setTab("mcps")}
            embedded
          />
        </div>
      ) : tab === "my-agents" ? (
        <div className="myAgentsPanel">
          {agentError && <div className="errorBanner">{agentError}</div>}
          {addAgentStatus && <div className="infoBanner">{addAgentStatus}</div>}

          {isAcpReady && filteredHostedAgents.length > 0 && (
            <div className="myAgentsList">
              {filteredHostedAgents.map((agent) => (
                <article className={`myAgentRow ${activeAgent?.id === agent.id ? "selected" : ""}`} key={agent.id}>
                  <div className="agentAvatar">{agent.displayName.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <strong>{agent.displayName}</strong>
                    {agent.description && <p>{agent.description}</p>}
                    <small>{[agent.type, agent.status].filter(Boolean).join(" - ")}</small>
                  </div>
                  <button
                    className={activeAgent?.id === agent.id ? "button ghost" : "button secondary"}
                    onClick={() => setActiveAgent({ id: agent.id, displayName: agent.displayName })}
                  >
                    {activeAgent?.id === agent.id ? "Active" : "Use agent"}
                  </button>
                </article>
              ))}
            </div>
          )}

          {isAcpReady && filteredHostedAgents.length === 0 && !agentError && (
            <div className="agentEmptyState">
              <Bot size={24} />
              <strong>No Agent Control Plane agents found</strong>
            </div>
          )}
        </div>
      ) : (
        <>
      <div className="agentGrid">
        {filteredAgents.map((agent) => {
          const expanded = expandedAgentIds.includes(agent.id);
          return (
          <article className={`agentCard ${expanded ? "expanded" : ""}`} key={agent.id}>
            <div className="agentSquadBadge">{agentSquadLabel(agent)}</div>
            <div>
              <div className="connectorTitle">
                <strong>{agent.displayName}</strong>
                <div className="agentCardActions">
                  <button
                    className={`iconButton bookmarkButton ${bookmarkedAgentIdSet.has(agent.id) ? "selected" : ""}`}
                    onClick={() => toggleBookmark(agent.id)}
                    title={bookmarkedAgentIdSet.has(agent.id) ? "Remove bookmark" : "Bookmark agent"}
                    aria-label={bookmarkedAgentIdSet.has(agent.id) ? `Remove ${agent.displayName} bookmark` : `Bookmark ${agent.displayName}`}
                  >
                    <Star size={15} />
                  </button>
                  <button
                    className="iconButton agentDetailsButton"
                    onClick={() => toggleAgentDetails(agent.id)}
                    title={expanded ? "Hide agent details" : "Show agent details"}
                    aria-label={expanded ? `Hide ${agent.displayName} details` : `Show ${agent.displayName} details`}
                    aria-expanded={expanded}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
              <p>{agent.description}</p>
            </div>
            {expanded && (
              <div className="agentDetailsPanel">
                <div className="tagList">
                  <span>{agentTypeLabel(agent)}</span>
                  <span>{formatVisibilityLabel(agent.visibility)}</span>
                  {agent.source && <span>{formatSourceLabel(agent.source)}</span>}
                  {agent.squad && <span>{agent.squad}</span>}
                  {agent.capabilities.map((capability) => <span key={capability}>{capability}</span>)}
                  {agent.requiresAuthentication && <span>requires auth</span>}
                </div>
              </div>
            )}
            {expanded && (agent.source === "slack" || agent.type === "slack") && (
              <div className="agentMessageBox">
                <textarea
                  value={agentDrafts[agent.id] ?? ""}
                  onChange={(event) => setAgentDrafts((current) => ({ ...current, [agent.id]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (shouldSubmitComposer(event)) {
                      event.preventDefault();
                      void sendAgent(agent);
                    }
                  }}
                  placeholder={`Message ${agent.displayName}`}
                />
                <button className="button secondary" onClick={() => void sendAgent(agent)} disabled={sendingAgentId === agent.id || !agentDrafts[agent.id]?.trim()}>
                  {sendingAgentId === agent.id ? "Sending" : "Send"}
                </button>
              </div>
            )}
          </article>
        );
        })}
      </div>
      {agentMessageStatus && <div className="infoBanner">{agentMessageStatus}</div>}
      {filteredAgents.length === 0 && <EmptyState title="No agents found" body="Try a different search term or squad filter." />}
        </>
      )}
    </section>
  );
}

function WorkboardView({
  agents,
  bookmarkedAgentIds,
  activeAgent,
}: {
  agents: AgentSummary[];
  bookmarkedAgentIds: string[];
  activeAgent: ActiveAgentSelection | null;
}) {
  const [provider, setProvider] = useState<WorkboardProvider>("auto");
  const [boardId, setBoardId] = useState("");
  const [snapshot, setSnapshot] = useState<WorkboardSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkboardStatus>("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [labels, setLabels] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [boardLayout, setBoardLayout] = useState<"rows" | "columns">("rows");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dragTargetStatus, setDragTargetStatus] = useState<WorkboardStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const activeProvider = snapshot?.provider ?? provider;
  const availableProvider = snapshot?.providers.find((item) => item.id === activeProvider);
  const savedBotAssignees = useMemo(() => {
    const savedAgentIds = new Set(bookmarkedAgentIds);
    const savedAgents = agents
      .filter((agent) => savedAgentIds.has(agent.id))
      .map((agent) => ({
        id: agent.id,
        label: agent.displayName,
      }));

    const activeDirectoryAgent = activeAgent ? agents.find((agent) => agent.id === activeAgent.id) : undefined;
    const activeAssignee = activeAgent
      ? {
          id: activeAgent.id,
          label: activeDirectoryAgent?.displayName ?? activeAgent.displayName,
        }
      : undefined;

    const merged = activeAssignee
      ? [activeAssignee, ...savedAgents.filter((agent) => agent.id !== activeAssignee.id)]
      : savedAgents;

    return merged
      .filter((agent, index, list) => list.findIndex((item) => item.id === agent.id) === index)
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [activeAgent, agents, bookmarkedAgentIds]);

  const filteredCards = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (snapshot?.cards ?? []).filter((card) => {
      const matchesStatus = statusFilter === "all" || card.status === statusFilter;
      const searchable = [
        card.title,
        card.body,
        card.status,
        card.assignee,
        card.provider,
        card.tenant,
        card.workspace,
        ...card.labels,
        ...(card.diagnostics ?? []),
        ...(card.proof ?? []),
        ...(card.artifacts ?? []),
      ].join(" ").toLowerCase();
      return matchesStatus && (!term || searchable.includes(term));
    });
  }, [snapshot?.cards, query, statusFilter]);

  async function load(nextProvider = provider, nextBoardId = boardId) {
    setBusy(true);
    setError("");
    try {
      const nextSnapshot = await linkApi.listWorkboard({ provider: nextProvider, boardId: nextBoardId || undefined });
      setSnapshot(nextSnapshot);
      setBoardId(nextSnapshot.boardId === "unavailable" ? nextBoardId : nextSnapshot.boardId);
    } catch (loadError) {
      setError(String(loadError instanceof Error ? loadError.message : loadError));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load("auto", "");
  }, []);

  async function selectProvider(nextProvider: WorkboardProvider) {
    setProvider(nextProvider);
    await load(nextProvider, boardId);
  }

  async function createCard() {
    const trimmed = title.trim();
    if (!trimmed || !snapshot) return;
    setBusy(true);
    setError("");
    try {
      const nextSnapshot = await linkApi.createWorkboardCard({
        provider: activeProvider,
        boardId: boardId || undefined,
        title: trimmed,
        body: body.trim() || undefined,
        assignee: assignee || undefined,
        priority,
        labels: labels.split(",").map((label) => label.trim()).filter(Boolean),
        status: activeProvider === "hermes" ? "todo" : "triage",
      });
      setSnapshot(nextSnapshot);
      setTitle("");
      setBody("");
      setAssignee("");
      setPriority("normal");
      setLabels("");
      setCreateOpen(false);
    } catch (createError) {
      setError(String(createError instanceof Error ? createError.message : createError));
    } finally {
      setBusy(false);
    }
  }

  async function updateCard(card: WorkboardCard, status: WorkboardStatus) {
    if (card.status === status) return;
    setBusy(true);
    setError("");
    try {
      setSnapshot(await linkApi.updateWorkboardCard({ provider: card.provider, boardId: card.boardId, cardId: card.id, status }));
    } catch (updateError) {
      setError(String(updateError instanceof Error ? updateError.message : updateError));
    } finally {
      setBusy(false);
    }
  }

  function startCardDrag(event: DragEvent<HTMLElement>, card: WorkboardCard) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-link-workboard-card", card.id);
    event.dataTransfer.setData("text/plain", card.id);
  }

  function allowCardDrop(event: DragEvent<HTMLElement>, status: WorkboardStatus) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragTargetStatus(status);
  }

  async function dropCard(event: DragEvent<HTMLElement>, status: WorkboardStatus) {
    event.preventDefault();
    const cardId = event.dataTransfer.getData("application/x-link-workboard-card") || event.dataTransfer.getData("text/plain");
    setDragTargetStatus(null);
    const card = snapshot?.cards.find((item) => item.id === cardId);
    if (card) await updateCard(card, status);
  }

  const columns = snapshot?.columns ?? [];

  return (
    <section className="content workboardView">
      <header className="pageHeader">
        <div>
          <h1>Tasks</h1>
        </div>
        <div className="headerActions">
          <button className="button primary" onClick={() => setCreateOpen((open) => !open)} aria-expanded={createOpen}>
            <Plus size={15} />
            Create Task
          </button>
          <button className="button secondary" onClick={() => load(provider, boardId)} disabled={busy}>
            <SquareCheck size={15} />
            Refresh
          </button>
        </div>
      </header>

      {error && <div className="errorBanner">{error}</div>}

      <div className="workboardSearchRow">
        <button
          className={`iconButton agentFilterButton ${filtersOpen ? "selected" : ""}`}
          aria-label={filtersOpen ? "Hide task filters" : "Show task filters"}
          title={filtersOpen ? "Hide task filters" : "Show task filters"}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <SlidersHorizontal size={16} />
        </button>
        <div className="explorerSearch compactSearch">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cards, labels, assignees, or diagnostics" />
        </div>
      </div>

      {filtersOpen && <div className="workboardToolbar">
        <label className="agentFilter">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | WorkboardStatus)}>
            <option value="all">All statuses</option>
            {columns.map((status) => (
              <option key={status} value={status}>{formatStatusLabel(status)}</option>
            ))}
          </select>
        </label>
        <div className="workboardLayoutToggle" role="group" aria-label="Board layout">
          <button
            className={boardLayout === "rows" ? "active" : ""}
            type="button"
            onClick={() => setBoardLayout("rows")}
            aria-pressed={boardLayout === "rows"}
          >
            <SquareCheck size={15} />
            Rows
          </button>
          <button
            className={boardLayout === "columns" ? "active" : ""}
            type="button"
            onClick={() => setBoardLayout("columns")}
            aria-pressed={boardLayout === "columns"}
          >
            <Grid2X2 size={15} />
            Columns
          </button>
        </div>
      </div>}

      {createOpen && (
        <div className="workboardCreate" aria-label="Create task">
          <div className="workboardCreateHeader">
            <div>
              <strong>Create task</strong>
              <small>Add a clear outcome for the selected board.</small>
            </div>
            <button className="iconButton" onClick={() => setCreateOpen(false)} aria-label="Close create task form">
              <X size={16} />
            </button>
          </div>
          <label className="workboardCreateField wide">
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New agent-sized task" autoFocus />
          </label>
          <label className="workboardCreateField">
            <span>Assignee</span>
            <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
              <option value="">{savedBotAssignees.length ? "Choose saved bot" : "No saved bots"}</option>
              {savedBotAssignees.map((agent) => (
                <option key={agent.id} value={agent.label}>{agent.label}</option>
              ))}
            </select>
          </label>
          <label className="workboardCreateField">
            <span>Priority</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="workboardCreateField">
            <span>Labels</span>
            <input value={labels} onChange={(event) => setLabels(event.target.value)} placeholder="labels, comma-separated" />
          </label>
          <label className="workboardCreateField full">
            <span>Details</span>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Outcome, constraints, acceptance criteria, artifacts, and handoff notes" />
          </label>
          <div className="workboardCreateActions">
            <button className="button secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="button primary" onClick={createCard} disabled={busy || !title.trim()}>
              <Plus size={15} />
              Add Task
            </button>
          </div>
        </div>
      )}

      {boardLayout === "rows" ? (
        <div className="workboardRows">
          {columns.map((status) => {
            const cards = filteredCards.filter((card) => card.status === status);
            return (
              <section
                className={`workboardRowGroup ${dragTargetStatus === status ? "dropTarget" : ""}`}
                key={status}
                onDragOver={(event) => allowCardDrop(event, status)}
                onDragLeave={() => setDragTargetStatus(null)}
                onDrop={(event) => void dropCard(event, status)}
              >
                <div className="workboardRowGroupHeader">
                  <strong>{formatStatusLabel(status)}</strong>
                  <em>{cards.length}</em>
                </div>
                <div className="workboardRowStack">
                  {cards.map((card) => (
                    <article
                      className="workboardRowCard"
                      key={card.id}
                      draggable={!busy}
                      onDragStart={(event) => startCardDrag(event, card)}
                      onDragEnd={() => setDragTargetStatus(null)}
                    >
                      <div className="workboardRowIcon"><Users size={17} /></div>
                      <div className="workboardRowBody">
                        <div className="connectorTitle">
                          <strong>{card.title}</strong>
                        </div>
                        {card.body && <p>{card.body}</p>}
                        <div className="workboardMeta">
                          {card.assignee && <span><Users size={12} />{card.assignee}</span>}
                          <span><Clock size={12} />{relativeDate(card.updatedAt)}</span>
                          <span>{String(card.priority)}</span>
                        </div>
                        <div className="tagList">
                          {card.labels.slice(0, 5).map((label) => <span key={label}>{label}</span>)}
                        </div>
                      </div>
                      {card.sourceUrl && (
                        <div className="workboardRowActions">
                          <a className="textLink" href={card.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open source for ${card.title}`}>
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      )}
                    </article>
                  ))}
                  {cards.length === 0 && <div className="workboardRowEmpty">No tasks</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="kanbanScroller">
          <div className="kanbanBoard" style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(300px, 300px))` }}>
            {columns.map((status) => {
              const cards = filteredCards.filter((card) => card.status === status);
              return (
                <section
                  className={`kanbanColumn ${dragTargetStatus === status ? "dropTarget" : ""}`}
                  key={status}
                  onDragOver={(event) => allowCardDrop(event, status)}
                  onDragLeave={() => setDragTargetStatus(null)}
                  onDrop={(event) => void dropCard(event, status)}
                >
                  <div className="kanbanColumnHeader">
                    <strong>{formatStatusLabel(status)}</strong>
                    <em>{cards.length}</em>
                  </div>
                  <div className="kanbanCardStack">
                    {cards.map((card) => (
                      <article
                        className="kanbanCard"
                        key={card.id}
                        draggable={!busy}
                        onDragStart={(event) => startCardDrag(event, card)}
                        onDragEnd={() => setDragTargetStatus(null)}
                      >
                        <div className="connectorTitle">
                          <strong>{card.title}</strong>
                        </div>
                        {card.body && <p>{card.body}</p>}
                        <div className="workboardMeta">
                          {card.assignee && <span><Users size={12} />{card.assignee}</span>}
                          <span><Clock size={12} />{relativeDate(card.updatedAt)}</span>
                          <span>{String(card.priority)}</span>
                        </div>
                        <div className="tagList">
                          {card.labels.slice(0, 5).map((label) => <span key={label}>{label}</span>)}
                        </div>
                        {(card.linkedSessionId || card.linkedRunId || card.linkedTaskId) && (
                          <small>{[card.linkedSessionId, card.linkedRunId, card.linkedTaskId].filter(Boolean).join(" - ")}</small>
                        )}
                        {(card.proof?.length || card.artifacts?.length || card.diagnostics?.length) && (
                          <div className="cardEvidence">
                            {[...(card.proof ?? []), ...(card.artifacts ?? []), ...(card.diagnostics ?? [])].slice(0, 3).map((item) => (
                              <span key={item}>{item}</span>
                            ))}
                          </div>
                        )}
                        {card.sourceUrl && (
                          <a className="textLink" href={card.sourceUrl} target="_blank" rel="noreferrer">
                            <ExternalLink size={13} />
                            Source
                          </a>
                        )}
                      </article>
                    ))}
                    {cards.length === 0 && <div className="kanbanEmpty">No cards</div>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

interface CalendarEventItem {
  id: string;
  title: string;
  time: string;
  attendees: string;
  phone?: string;
  meetUrl?: string;
  notes?: string;
  transcript?: string;
  status: "past" | "upcoming" | "live";
}

function CalendarView({
  connectors,
  linkedPhoneNumber,
  setView,
}: {
  connectors: ConnectorStatus[];
  linkedPhoneNumber: string;
  setView: (view: ViewId) => void;
}) {
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [calendarLayout, setCalendarLayout] = useState<"calendar" | "list">("calendar");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const googleCalendar = connectors.find((connector) => connector.id === "google-calendar") ?? connectors.find((connector) => connector.id === "google-drive");
  const calendarReady = Boolean(googleCalendar && (googleCalendar.status === "connected" || googleCalendar.status === "signed_in"));
  const calendarEvents: CalendarEventItem[] = [];
  const visibleEvents = calendarReady
    ? calendarEvents.filter((event) => `${event.title} ${event.attendees} ${event.notes ?? ""} ${event.transcript ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  const selectedEvent = visibleEvents.find((event) => event.id === selectedEventId) ?? visibleEvents[0];

  function startMeeting(event: CalendarEventItem) {
    setSelectedEventId(event.id);
    setActionStatus(`Opening ${event.title} from Google Calendar.`);
    if (event.meetUrl) window.open(event.meetUrl, "_blank");
  }

  function startCall(event: CalendarEventItem) {
    setSelectedEventId(event.id);
    if (!linkedPhoneNumber) {
      setActionStatus("Choose a Telnyx number on the Phone page before starting calls from Calendar.");
      setView("phone");
      return;
    }
    setActionStatus(`Starting call from ${linkedPhoneNumber} to ${event.phone ?? "the meeting contact"}.`);
  }

  return (
    <section className="content calendarView">
      <header className="pageHeader">
        <div>
          <h1>Calendar</h1>
        </div>
      </header>

      {!calendarReady && (
        <section className="phoneSetupAlert calendarSetupAlert">
          <div>
            <strong>Connect Google Calendar to show meetings.</strong>
            <p>Link uses Google Workspace OAuth to load your calendar events, attach notes and transcripts to each event, and start calls or meetings from one place.</p>
          </div>
          <button className="runtimeSettingsButton" onClick={() => setView("settings")}>
            Add Google Workspace access
          </button>
        </section>
      )}

      <div className="calendarControls">
        <button
          className={`iconButton agentFilterButton ${filtersOpen ? "selected" : ""}`}
          aria-label={filtersOpen ? "Hide calendar filters" : "Show calendar filters"}
          title={filtersOpen ? "Hide calendar filters" : "Show calendar filters"}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <SlidersHorizontal size={16} />
        </button>
        <div className="explorerSearch compactSearch">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search calendar events" disabled={!calendarReady} />
        </div>
        <div className="workboardLayoutToggle calendarLayoutToggle" role="group" aria-label="Calendar layout">
          <button
            className={calendarLayout === "calendar" ? "active" : ""}
            type="button"
            onClick={() => setCalendarLayout("calendar")}
            aria-pressed={calendarLayout === "calendar"}
          >
            <CalendarDays size={15} />
            Calendar
          </button>
          <button
            className={calendarLayout === "list" ? "active" : ""}
            type="button"
            onClick={() => setCalendarLayout("list")}
            aria-pressed={calendarLayout === "list"}
          >
            <List size={15} />
            List
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div className="calendarFilterPanel">
          <button className="button secondary" disabled={!calendarReady}>Today</button>
          <button className="button secondary" disabled={!calendarReady}>Past events</button>
          <button className="button secondary" disabled={!calendarReady}>With notes</button>
        </div>
      )}

      <section className="calendarEventShell">
        <div className={calendarLayout === "calendar" ? "calendarEventGrid calendarMode" : "calendarEventGrid listMode"}>
          <div className="calendarEventList" aria-label="Google Calendar events">
            {visibleEvents.map((event) => (
              <button
                className={`calendarEventRow ${selectedEvent?.id === event.id ? "selected" : ""}`}
                key={event.id}
                onClick={() => {
                  setSelectedEventId(event.id);
                  setActionStatus(`Selected ${event.title}.`);
                }}
              >
                <span>
                  <strong>{event.title}</strong>
                  <small>{event.time} - {event.attendees}</small>
                </span>
                <Badge tone={event.status === "live" ? "success" : event.status === "past" ? "default" : "warning"}>{event.status}</Badge>
              </button>
            ))}
            {!calendarReady && <div className="calendarEmptyState">Connect Google Calendar to load events.</div>}
            {calendarReady && visibleEvents.length === 0 && <div className="calendarEmptyState">No calendar events found.</div>}
          </div>
          <div className="calendarEventDetails">
            <div className="calendarDetailHeader">
              <strong>{selectedEvent ? selectedEvent.title : "Event details"}</strong>
              {selectedEvent && <Badge tone={selectedEvent.status === "live" ? "success" : selectedEvent.status === "past" ? "default" : "warning"}>{selectedEvent.status}</Badge>}
            </div>
            {selectedEvent ? (
              <>
                <p>{selectedEvent.time} with {selectedEvent.attendees}.</p>
                <div className="calendarDetailBlock">
                  <strong>Notes and transcripts</strong>
                  <p>{selectedEvent.notes || selectedEvent.transcript || "No notes or transcripts saved for this event yet."}</p>
                </div>
              <div className="phoneButtonRow">
                <button className="button primary" onClick={() => startMeeting(selectedEvent)} disabled={!selectedEvent.meetUrl}>
                  <Play size={15} />
                  Start meeting
                </button>
                <button className="button secondary" onClick={() => startCall(selectedEvent)} disabled={!selectedEvent.phone}>
                  <PhoneCall size={15} />
                  Start call
                </button>
              </div>
              <small>{linkedPhoneNumber ? `Calls start from ${linkedPhoneNumber}.` : "Select a Telnyx number on Phone to place calls from Calendar."}</small>
              </>
            ) : (
              <p>Select an event to review notes, transcripts, sources, and meeting actions.</p>
            )}
          {actionStatus && <div className="assistantNotice"><p>{actionStatus}</p></div>}
          </div>
        </div>
      </section>
    </section>
  );
}

function PhoneView({
  connectors,
  linkedPhoneNumber,
  setLinkedPhoneNumber,
  setView,
}: {
  connectors: ConnectorStatus[];
  linkedPhoneNumber: string;
  setLinkedPhoneNumber: (phoneNumber: string) => void;
  setView: (view: ViewId) => void;
}) {
  const [tab, setTab] = useState<"numbers" | "contacts" | "assistants">("numbers");
  const [telnyxCredentialReady, setTelnyxCredentialReady] = useState(false);
  const [voiceAssistantEnabled, setVoiceAssistantEnabled] = useState(true);
  const [phoneAssistants, setPhoneAssistants] = useState<PhoneAssistantOption[]>([]);
  const [selectedPhoneAssistantId, setSelectedPhoneAssistantId] = useState("");
  const [voiceAssistantMode, setVoiceAssistantMode] = useState<"after_hours" | "always" | "manual">("after_hours");
  const [multiParticipantEnabled, setMultiParticipantEnabled] = useState(true);
  const [multiParticipantInviteTargetName, setMultiParticipantInviteTargetName] = useState("Specialist");
  const [multiParticipantInviteTarget, setMultiParticipantInviteTarget] = useState("");
  const [multiParticipantSkipTurnEnabled, setMultiParticipantSkipTurnEnabled] = useState(true);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago");
  const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>(defaultAvailabilityWindows);
  const [googleCalendarEnabled, setGoogleCalendarEnabled] = useState(true);
  const [numbers, setNumbers] = useState<PhoneNumberOption[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<PhoneNumberOption | null>(null);
  const [assistantLinkStatus, setAssistantLinkStatus] = useState("");
  const [dialNumber, setDialNumber] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactSource, setContactSource] = useState("all");
  const [contactFiltersOpen, setContactFiltersOpen] = useState(false);
  const [expandedContactId, setExpandedContactId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const contactSources = [
    { id: "google", label: "Google", connectorIds: ["google", "google-drive", "google-workspace"] },
    { id: "salesforce", label: "Salesforce", connectorIds: ["salesforce"] },
  ];
  const connectedContactSourceIds = new Set(
    connectors
      .filter((connector) => connector.status === "connected" || connector.status === "signed_in")
      .map((connector) => connector.id),
  );
  const telnyxConnectorReady = connectors.some((connector) => connector.id === "telnyx" && (connector.status === "connected" || connector.status === "signed_in"));
  const telnyxApiReady = telnyxCredentialReady || telnyxConnectorReady;
  const selectedPhoneAssistant = phoneAssistants.find((assistant) => assistant.id === selectedPhoneAssistantId);
  const selectedContactSource = contactSources.find((source) => source.id === contactSource);
  const contactSourceMatches = (sourceId: string, selectedSourceId: string) => {
    if (selectedSourceId === "all") return true;
    const selectedSource = contactSources.find((source) => source.id === selectedSourceId);
    return sourceId === selectedSourceId || Boolean(selectedSource?.connectorIds.includes(sourceId));
  };
  const contactDirectory: {
    id: string;
    name: string;
    role: string;
    phone: string;
    source: string;
    detail: string;
  }[] = [];
  const filteredContacts = contactDirectory.filter((contact) => {
    const matchesQuery = `${contact.name} ${contact.role} ${contact.phone} ${contact.detail}`.toLowerCase().includes(contactQuery.toLowerCase());
    const matchesSource = contactSourceMatches(contact.source, contactSource);
    return matchesQuery && matchesSource;
  });

  async function refreshCredentialStatus() {
    const groups = await linkApi.listCredentials();
    const telnyx = groups.find((group) => group.id === "telnyx");
    setTelnyxCredentialReady(Boolean(telnyx?.fields.some((field) => field.name === "TELNYX_API_KEY" && field.configured)));
  }

  async function refreshPhoneAssistants() {
    if (!telnyxApiReady) {
      setPhoneAssistants([]);
      return;
    }
    try {
      const assistants = await linkApi.listPhoneAssistants();
      setPhoneAssistants(assistants);
      setSelectedPhoneAssistantId((current) => current && assistants.some((assistant) => assistant.id === current) ? current : assistants[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Telnyx Voice AI assistants.");
      setPhoneAssistants([]);
    }
  }

  useEffect(() => {
    void refreshCredentialStatus();
    window.addEventListener("focus", refreshCredentialStatus);
    return () => window.removeEventListener("focus", refreshCredentialStatus);
  }, [telnyxConnectorReady]);

  useEffect(() => {
    void refreshPhoneAssistants();
  }, [telnyxApiReady]);

  async function refreshAccountNumbers() {
    setBusy(true);
    setError("");
    try {
      const results = await linkApi.listAccountPhoneNumbers();
      setNumbers(results);
      setSelectedNumber((current) => {
        const next = current && results.some((number) => number.phoneNumber === current.phoneNumber) ? current : results[0] ?? null;
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Telnyx numbers.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (telnyxApiReady) void refreshAccountNumbers();
  }, [telnyxApiReady]);

  useEffect(() => {
    setLinkedPhoneNumber(selectedNumber?.phoneNumber ?? "");
  }, [selectedNumber, setLinkedPhoneNumber]);

  function linkAssistantToNumber() {
    if (!selectedNumber || !selectedPhoneAssistant) return;
    setAssistantLinkStatus(`${selectedPhoneAssistant.name} is selected for ${selectedNumber.phoneNumber}.`);
  }

  function updateAvailability(dayId: string, patch: Partial<AvailabilityWindow>) {
    setAvailabilityWindows((windows) => windows.map((window) => {
      if (window.id !== dayId) return window;
      const next = { ...window, ...patch };
      if (next.start >= next.end) {
        if (patch.start !== undefined) next.end = Math.min(1440, next.start + 60);
        if (patch.end !== undefined) next.start = Math.max(0, next.end - 60);
      }
      return next;
    }));
  }

  return (
    <section className="content phoneView">
      <header className="pageHeader">
        <div>
          <h1>Phone</h1>
        </div>
      </header>

      <div className="settingsTabs phoneTabs" role="tablist" aria-label="Phone sections">
        {[
          { id: "numbers", label: "Numbers", icon: PhoneCall },
          { id: "contacts", label: "Contacts", icon: Users },
          { id: "assistants", label: "AI Assistants", icon: Bot },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={tab === item.id ? "selected" : ""}
              onClick={() => setTab(item.id as typeof tab)}
              role="tab"
              aria-selected={tab === item.id}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "assistants" && (
      <div className="phoneAssistantGrid">
        <Panel title="Voice AI assistant">
          <label className="confirmPurchase assistantToggle">
            <input type="checkbox" checked={voiceAssistantEnabled} onChange={(event) => setVoiceAssistantEnabled(event.target.checked)} />
            <span>Answer inbound calls with a Telnyx Voice AI assistant when routing rules match.</span>
          </label>
          <div className="formGrid">
            <label className="componentField">
              <span>Assistant</span>
              <select value={selectedPhoneAssistantId} onChange={(event) => setSelectedPhoneAssistantId(event.target.value)} disabled={!voiceAssistantEnabled || phoneAssistants.length === 0}>
                {phoneAssistants.length === 0 ? <option value="">No assistants found</option> : phoneAssistants.map((assistant) => (
                  <option value={assistant.id} key={assistant.id}>{assistant.name}</option>
                ))}
              </select>
            </label>
            <label className="componentField">
              <span>Answering mode</span>
              <select value={voiceAssistantMode} onChange={(event) => setVoiceAssistantMode(event.target.value as typeof voiceAssistantMode)} disabled={!voiceAssistantEnabled}>
                <option value="after_hours">After hours and missed calls</option>
                <option value="always">Always screen calls</option>
                <option value="manual">Manual / webhook-controlled</option>
              </select>
            </label>
          </div>
          <div className="phoneButtonRow">
            <button className="button secondary" onClick={() => void refreshPhoneAssistants()} disabled={!telnyxApiReady || busy}>Refresh assistants</button>
            <button className="button ghost" onClick={() => window.open("https://portal.telnyx.com/#/app/voice-ai/assistants", "_blank")}>Open Telnyx Portal</button>
          </div>
          <p>{selectedPhoneAssistant ? `${selectedPhoneAssistant.name} will be linked 1:1 with the selected phone number.` : "Create and manage Voice AI assistants in the Telnyx Portal, then select one here."}</p>
        </Panel>

        <Panel title="Phone number routing">
          <div className="phoneButtonRow">
            <button className="button primary" onClick={linkAssistantToNumber} disabled={!selectedNumber || !voiceAssistantEnabled || !selectedPhoneAssistant}>
              Link assistant to number
            </button>
          </div>
          <p>{selectedNumber && selectedPhoneAssistant ? `${selectedPhoneAssistant.name} will answer calls for ${selectedNumber.phoneNumber}.` : "Select a number and an existing Telnyx Voice AI assistant."}</p>
          {assistantLinkStatus && <div className="assistantNotice"><p>{assistantLinkStatus}</p></div>}
        </Panel>

        <Panel title="Availability and calendar">
          <div className="phoneSearchGrid singleField">
            <label className="componentField">
              <span>Timezone</span>
              <input value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={!voiceAssistantEnabled} />
            </label>
          </div>
          <div className="availabilityEditor" aria-label="Weekly availability windows">
            {availabilityWindows.map((window) => (
              <div className={`availabilityDay ${window.closed ? "closed" : ""}`} key={window.id}>
                <div className="availabilityDayHeader">
                  <strong>{window.label}</strong>
                  <button
                    className={`availabilityToggle ${window.closed ? "" : "enabled"}`}
                    type="button"
                    onClick={() => updateAvailability(window.id, { closed: !window.closed })}
                    disabled={!voiceAssistantEnabled}
                  >
                    {window.closed ? "Closed" : "Open"}
                  </button>
                  <span>{window.closed ? "Closed" : `${formatAvailabilityTime(window.start)} - ${formatAvailabilityTime(window.end)}`}</span>
                </div>
                <div
                  className="availabilitySlider"
                  style={{
                    "--availability-start": `${(window.start / 1440) * 100}%`,
                    "--availability-end": `${(window.end / 1440) * 100}%`,
                  } as CSSProperties}
                >
                  <input
                    aria-label={`${window.label} start time`}
                    type="range"
                    min="0"
                    max="1425"
                    step="15"
                    value={window.start}
                    onChange={(event) => updateAvailability(window.id, { start: Number(event.target.value), closed: false })}
                    disabled={!voiceAssistantEnabled || window.closed}
                  />
                  <input
                    aria-label={`${window.label} end time`}
                    type="range"
                    min="15"
                    max="1440"
                    step="15"
                    value={window.end}
                    onChange={(event) => updateAvailability(window.id, { end: Number(event.target.value), closed: false })}
                    disabled={!voiceAssistantEnabled || window.closed}
                  />
                </div>
              </div>
            ))}
          </div>
          <label className="confirmPurchase assistantToggle">
            <input type="checkbox" checked={googleCalendarEnabled} onChange={(event) => setGoogleCalendarEnabled(event.target.checked)} disabled={!voiceAssistantEnabled} />
            <span>Use Google Calendar availability before proposing sales-call times.</span>
          </label>
        </Panel>

        <Panel title="Multi-participant AI calls">
          <label className="confirmPurchase assistantToggle">
            <input type="checkbox" checked={multiParticipantEnabled} onChange={(event) => setMultiParticipantEnabled(event.target.checked)} disabled={!voiceAssistantEnabled} />
            <span>Let the assistant invite another participant into an active call and stay silent while people talk to each other.</span>
          </label>
          <div className="formGrid">
            <label className="componentField">
              <span>Invite target name</span>
              <input value={multiParticipantInviteTargetName} onChange={(event) => setMultiParticipantInviteTargetName(event.target.value)} disabled={!voiceAssistantEnabled || !multiParticipantEnabled} />
            </label>
            <label className="componentField">
              <span>Phone or SIP URI</span>
              <input value={multiParticipantInviteTarget} onChange={(event) => setMultiParticipantInviteTarget(event.target.value)} placeholder="+15551234567 or sip:specialist@example.com" disabled={!voiceAssistantEnabled || !multiParticipantEnabled} />
            </label>
          </div>
          <label className="confirmPurchase assistantToggle">
            <input type="checkbox" checked={multiParticipantSkipTurnEnabled} onChange={(event) => setMultiParticipantSkipTurnEnabled(event.target.checked)} disabled={!voiceAssistantEnabled || !multiParticipantEnabled} />
            <span>Add Skip Turn so the assistant intentionally stays quiet during participant side conversations.</span>
          </label>
          <p>Configure Invite and Skip Turn behavior on the selected assistant in the Telnyx Portal.</p>
        </Panel>
      </div>
      )}

      {tab === "contacts" && (
      <div className="contactSearchLayout">
        <Panel title="Contact search">
          <div className="contactSearchControls">
            <button
              className={`iconButton agentFilterButton ${contactFiltersOpen || contactSource !== "all" ? "selected" : ""}`}
              type="button"
              aria-label="Filter contacts"
              title={selectedContactSource ? `Source: ${selectedContactSource.label}` : "Filter contacts"}
              onClick={() => setContactFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal size={18} />
            </button>
            <label className="componentField">
              <span>Find contact</span>
              <input value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} placeholder="Search connected contacts..." />
            </label>
          </div>
          {contactFiltersOpen && (
            <div className="contactFilterPanel" role="group" aria-label="Contact source filters">
              {[{ id: "all", label: "All sources" }, ...contactSources].map((source) => (
                <button
                  key={source.id}
                  className={contactSource === source.id ? "selected" : ""}
                  type="button"
                  onClick={() => {
                    setContactSource(source.id);
                    setContactFiltersOpen(false);
                  }}
                >
                  {source.label}
                </button>
              ))}
            </div>
          )}
          <div className="contactResults">
            {filteredContacts.map((contact) => {
              const source = contactSources.find((item) => item.id === contact.source || item.connectorIds.includes(contact.source));
              const connected = connectedContactSourceIds.has(contact.source) || Boolean(source?.connectorIds.some((connectorId) => connectedContactSourceIds.has(connectorId)));
              const expanded = expandedContactId === contact.id;
              const selected = dialNumber === contact.phone;
              return (
                <div className={`contactResult ${expanded ? "expanded" : ""} ${selected ? "selected" : ""}`} key={contact.id}>
                  <button
                    className="contactResultMain"
                    onClick={() => setExpandedContactId((current) => current === contact.id ? "" : contact.id)}
                    title={connected ? `Show ${contact.name}` : `Connect ${source?.label ?? contact.source} first`}
                  >
                    <span>
                      <strong>{contact.name}</strong>
                      <small>{contact.role} - {contact.phone}</small>
                    </span>
                    <span className="contactResultActions">
                      <em className={connected ? "contactSourceBadge connected" : "contactSourceBadge"}>{connected ? source?.label : "connect source"}</em>
                      <ChevronDown size={18} />
                    </span>
                  </button>
                  {expanded && (
                    <div className="contactResultDetails">
                      <div>
                        <strong>Source detail</strong>
                        <span>{contact.detail}</span>
                      </div>
                      <div>
                        <strong>Phone</strong>
                        <span>{contact.phone}</span>
                      </div>
                      <button
                        className="button primary"
                        onClick={() => setDialNumber(contact.phone)}
                        disabled={!connected}
                      >
                        {selected ? "Selected for dialer" : "Use number"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredContacts.length === 0 && (
              <div className="contactEmpty">
                {contactQuery.trim() ? "No matching contacts from connected sources." : "No connected contacts yet."}
              </div>
            )}
          </div>
        </Panel>
      </div>
      )}

      {error && <div className="errorBanner">{error}</div>}

      {tab === "numbers" && (
        <>
        {!telnyxApiReady && (
          <div className="phoneSetupAlert">
            <div>
              <strong>Add your Telnyx API key to show your account numbers.</strong>
              <p>Add your Telnyx API key in Settings. Link uses your key to load active numbers from your Telnyx account so you can choose which number should work inside the app.</p>
            </div>
            <button className="runtimeSettingsButton" type="button" onClick={() => setView("settings")}>
              <Settings size={14} />
              Add Telnyx API key
            </button>
          </div>
        )}

        <section className="phoneNumberTable" aria-label="Telnyx account numbers">
          <header className="phoneNumberTableHeader">
            <div>
              <h2>Your Telnyx numbers</h2>
              <p>{linkedPhoneNumber ? `${linkedPhoneNumber} is selected for Link.` : "Choose one active Telnyx number to use inside Link."}</p>
            </div>
            <div className="phoneButtonRow">
              <button className="button primary" onClick={() => void refreshAccountNumbers()} disabled={busy || !telnyxApiReady}>{busy ? "Loading" : "Refresh numbers"}</button>
              <button className="button ghost" onClick={() => window.open("https://portal.telnyx.com/#/app/numbers/my-numbers", "_blank")}>Open Telnyx Portal</button>
            </div>
          </header>

          <div className="phoneNumberRows" role="table" aria-label="Active Telnyx numbers">
            <div className="phoneNumberRow phoneNumberRowHead" role="row">
              <span role="columnheader">Number</span>
              <span role="columnheader">Location</span>
              <span role="columnheader">Type</span>
              <span role="columnheader">Features</span>
              <span role="columnheader">Status</span>
            </div>
            {numbers.map((number) => {
              const selected = selectedNumber?.phoneNumber === number.phoneNumber;
              return (
                <button
                  className={`phoneNumberRow ${selected ? "selected" : ""}`}
                  key={number.phoneNumber}
                  onClick={() => {
                    setSelectedNumber(number);
                    setLinkedPhoneNumber(number.phoneNumber);
                  }}
                  role="row"
                >
                  <strong role="cell">{number.phoneNumber}</strong>
                  <span role="cell">{[number.locality, number.region, number.countryCode].filter(Boolean).join(", ") || "Telnyx account"}</span>
                  <span role="cell">{number.type || "Number"}</span>
                  <span role="cell">{number.features.length > 0 ? number.features.join(", ") : "Active"}</span>
                  <span role="cell"><em>{selected ? "Linked" : "Available"}</em></span>
                </button>
              );
            })}
            {numbers.length === 0 && (
              <div className="phoneNumberEmpty">
                {telnyxApiReady && !busy ? "No active Telnyx numbers found for this account." : "Add a Telnyx API key to load your numbers."}
              </div>
            )}
          </div>
        </section>
        </>
      )}

    </section>
  );
}

function ConnectionsView({
  connectors,
  tools,
  refresh,
  openSettings,
  embedded = false,
}: {
  connectors: ConnectorStatus[];
  tools: ToolMetadata[];
  refresh: () => Promise<void>;
  openSettings: () => void;
  embedded?: boolean;
}) {
  const connectedConnectors = connectors.filter((connector) => connector.status === "connected" || connector.status === "signed_in");
  const availableConnectors = connectors.filter((connector) => connector.status !== "connected" && connector.status !== "signed_in");
  const [expandedConnectorIds, setExpandedConnectorIds] = useState<Set<string>>(() => new Set(["mcp-proxy"]));

  function connectorTools(connector: ConnectorStatus) {
    const connectorName = connector.name.toLowerCase().replace(/\s+mcp$/i, "");
    if (connector.category === "MCP" && connector.id !== "mcp-proxy") {
      return tools.filter((tool) => {
        const searchable = `${tool.name} ${tool.category}`.toLowerCase();
        return searchable.includes(connectorName.toLowerCase()) || searchable.includes(connector.id.replace("mcp-server-", ""));
      });
    }
    if (connector.id === "mcp-proxy") return tools.filter((tool) => tool.category === "MCP" || /^[a-z0-9_-]+\./i.test(tool.name));
    return tools.filter((tool) => tool.category.toLowerCase().includes(connector.name.toLowerCase()) || tool.name.toLowerCase().startsWith(`${connector.id}.`));
  }

  async function connectConnector(id: string) {
    if (id === "agent-control-plane") {
      await linkApi.signInAgentControlPlane();
      await refresh();
      return;
    }
    openSettings();
  }

  function toggleConnector(connectorId: string) {
    setExpandedConnectorIds((current) => {
      const next = new Set(current);
      if (next.has(connectorId)) next.delete(connectorId);
      else next.add(connectorId);
      return next;
    });
  }

  function renderConnectorRow(connector: ConnectorStatus) {
    const expanded = expandedConnectorIds.has(connector.id);
    const connected = connector.status === "connected" || connector.status === "signed_in";
    const connectorToolList = connectorTools(connector);
    const grouped = {
      read: connectorToolList.filter((tool) => tool.capability === "read"),
      write: connectorToolList.filter((tool) => tool.capability !== "read"),
      interactive: connectorToolList.filter((tool) => tool.approvalRequired || tool.riskLevel === "high"),
    };

    return (
      <article className={`connectorRow ${expanded ? "expanded" : ""}`} key={connector.id}>
        <button className="connectorRowSummary" onClick={() => toggleConnector(connector.id)} aria-expanded={expanded}>
          <ChevronDown size={15} className="connectorRowChevron" />
          <span className="connectorLogo">{connectorInitials(connector.name)}</span>
          <span className="connectorRowText">
            <strong>{connector.name}</strong>
            <small>{connector.description}</small>
          </span>
          <span className="connectorRowMeta">
            <span className={`connectionDot ${connected ? "connected" : "available"}`} />
            <span>{connected ? "Connected" : "Available"}</span>
            <Badge tone="default">{connectorTypeLabel(connector)}</Badge>
          </span>
        </button>
        {expanded && (
          <div className="connectorRowDetails">
            <div className="pluginMeta">
              <span>{connector.category}</span>
              <span>{connectorModeLabel(connector)}</span>
              {connector.requiredAccess.map((item) => <span key={item}>{item}</span>)}
            </div>
            <div className="pluginDetailActions">
              <button
                className={connected ? "button ghost" : "button secondary"}
                disabled={connected}
                onClick={() => connectConnector(connector.id)}
              >
                {connectorButtonLabel(connector)}
              </button>
            </div>
            <div className="toolPermissionHeader">
              <div>
                <h3>Tool permissions</h3>
                <p>Choose when Link agents are allowed to use these tools.</p>
              </div>
            </div>
            <ToolGroup title="Read-only tools" tools={grouped.read} />
            <ToolGroup title="Write/delete tools" tools={grouped.write} />
            <ToolGroup title="Interactive tools" tools={grouped.interactive} />
          </div>
        )}
      </article>
    );
  }

  function renderConnectorGroup(title: string, groupConnectors: ConnectorStatus[]) {
    if (groupConnectors.length === 0) return null;
    return (
      <section className="connectorRowGroup" key={title}>
        <div className="pluginSidebarLabel">
          <ChevronDown size={13} />
          {title}
        </div>
        <div className="connectorRows">
          {groupConnectors.map(renderConnectorRow)}
        </div>
      </section>
    );
  }

  return (
    <section className={embedded ? "connectionsView embeddedSettingsPanel" : "content connectionsView"}>
      <header className={embedded ? "pageHeader embeddedSettingsHeader" : "pageHeader"}>
        <div>
          <h1>MCPs</h1>
        </div>
      </header>
      <div className="pluginConsole pluginRowConsole">
        {renderConnectorGroup("Connected", connectedConnectors)}
        {renderConnectorGroup("Available", availableConnectors)}
      </div>
    </section>
  );
}

function ToolGroup({ title, tools }: { title: string; tools: ToolMetadata[] }) {
  return (
    <div className="permissionGroup">
      <div className="sectionLabel">
        <ChevronDown size={14} />
        {title}
      </div>
      {tools.length > 0 ? (
        tools.map((tool) => (
          <div className="permissionRow" key={`${title}-${tool.name}`}>
            <div>
              <strong>{tool.name}</strong>
              <small>{tool.description}</small>
            </div>
            <Segmented selected={tool.approvalRequired ? "Ask" : tool.outputCanBeShownExternally ? "Allow" : "Auto"} />
          </div>
        ))
      ) : (
        <div className="permissionEmpty">No tools in this group.</div>
      )}
    </div>
  );
}

type ArchiveTabId = "documents" | "memories" | "entities" | "prompt" | "settings";

const defaultArchiveQuery = "What did we decide about Link improvement requests?";

function MemoryView({ banks, openMemory }: { banks: MemoryBank[]; openMemory: () => void }) {
  return (
    <section className="content memoryView">
      <header className="pageHeader">
        <div>
          <h1>Archive</h1>
        </div>
      </header>
      <ArchiveTabs banks={banks} openMemory={openMemory} />
    </section>
  );
}

function ArchiveTabs({
  banks,
  openMemory,
  compact = false,
  initialTab = "documents",
  initialQuery = defaultArchiveQuery,
}: {
  banks: MemoryBank[];
  openMemory: () => void;
  compact?: boolean;
  initialTab?: ArchiveTabId;
  initialQuery?: string;
}) {
  const seededQuery = useMemo(() => (initialQuery.trim() || defaultArchiveQuery).slice(0, 220), [initialQuery]);
  const [tab, setTab] = useState<ArchiveTabId>(initialTab);
  const [selectedBankId, setSelectedBankId] = useState(banks[0]?.id ?? "");
  const [query, setQuery] = useState(seededQuery);
  const [documentText, setDocumentText] = useState("");
  const [textCaptureOpen, setTextCaptureOpen] = useState(false);
  const [entityQuery, setEntityQuery] = useState("");
  const [minMentions, setMinMentions] = useState(1);
  const [recall, setRecall] = useState<MemoryRecallResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [recallError, setRecallError] = useState("");
  const [recallRan, setRecallRan] = useState(false);
  const [promptMode, setPromptMode] = useState<"retain" | "recall" | "reflect">("retain");
  const [retainContent, setRetainContent] = useState("");
  const [retainContext, setRetainContext] = useState("");
  const [reflectPrompt, setReflectPrompt] = useState("");
  const [archiveSettingsMode, setArchiveSettingsMode] = useState<"retain" | "reflect">("retain");
  const [retainMission, setRetainMission] = useState("");
  const [customExtractionPrompt, setCustomExtractionPrompt] = useState("");
  const [freeFormEntities, setFreeFormEntities] = useState(true);
  const [observationsEnabled, setObservationsEnabled] = useState(false);
  const [observationsMission, setObservationsMission] = useState("");
  const selectedBank = banks.find((bank) => bank.id === selectedBankId) ?? banks[0];
  const isKeyScopedBank = selectedBank?.id === "hindsight-key-scoped";
  const memoryTabs = [
    { id: "documents", label: "Documents", icon: FileText },
    { id: "memories", label: "Entries", icon: ArchiveIcon },
    { id: "entities", label: "Entities", icon: Tags },
    { id: "prompt", label: "Prompt", icon: SquareTerminal },
    { id: "settings", label: "Settings", icon: Settings },
  ] as const;

  useEffect(() => {
    if (banks.length === 0) {
      if (selectedBankId) setSelectedBankId("");
      return;
    }
    if (!banks.some((bank) => bank.id === selectedBankId)) {
      setSelectedBankId(banks[0]?.id ?? "");
    }
  }, [banks, selectedBankId]);

  useEffect(() => {
    setQuery(seededQuery);
    setRecall([]);
    setRecallError("");
    setRecallRan(false);
  }, [seededQuery]);

  async function runRecall() {
    setBusy(true);
    setRecallError("");
    setRecallRan(true);
    try {
      setRecall(await linkApi.recallMemory({ query, bankId: isKeyScopedBank ? undefined : selectedBank?.id }));
    } catch (error) {
      setRecall([]);
      setRecallError(error instanceof Error ? error.message : "Archive recall failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`archiveTabsSurface ${compact ? "compact" : ""}`}>
      <div className="archiveToolbar">
        <label className="memoryBankPicker">
          <span>Archive</span>
          <select value={selectedBank?.id ?? ""} onChange={(event) => setSelectedBankId(event.target.value)} disabled={banks.length === 0}>
            {banks.length === 0 ? <option value="">No banks connected</option> : banks.map((bank) => (
              <option key={bank.id} value={bank.id}>{bank.name}</option>
            ))}
          </select>
        </label>
        <div className="headerActions">
          <button className="button primary" onClick={openMemory}>Refresh archive</button>
        </div>
      </div>

      <div className="memoryTabs" role="tablist" aria-label="Archive sections">
        {memoryTabs.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={tab === item.id ? "selected" : ""} onClick={() => setTab(item.id)} role="tab" aria-selected={tab === item.id}>
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "documents" && (
        <div className="memorySection">
          <div className="memorySectionHeader">
            <div>
              <h2>Documents</h2>
              <p>Upload files or add text. Link ingests them into the archive and derives reusable entries.</p>
            </div>
            <div className="headerActions">
              <button className="button secondary"><Upload size={15} />Upload files</button>
              <button className="button primary" onClick={() => setTextCaptureOpen((open) => !open)} aria-expanded={textCaptureOpen}>
                <FileText size={15} />Add text
              </button>
            </div>
          </div>
          <div className="memoryTable">
            <div className="memoryTableHead documents"><span>Document</span><span>Entries</span><span>Created</span><span>Tags</span><span>Actions</span></div>
            <div className="memoryEmpty"><FileText size={26} /><span>No documents yet. Upload a file or add text to get started.</span></div>
          </div>
          {textCaptureOpen && (
            <label className="componentField memoryTextCapture">
              <span>Quick add text</span>
              <textarea value={documentText} onChange={(event) => setDocumentText(event.target.value)} placeholder="Paste text that this bank should remember..." />
            </label>
          )}
        </div>
      )}

      {tab === "memories" && (
        <div className="memorySection">
          <div className="memorySectionHeader">
            <div>
              <h2>Entries</h2>
              <p>Browse archive entries. Filter by fact type and tags, and open the source document where provenance allows.</p>
            </div>
            <span>{recall.length} shown</span>
          </div>
          <div className="memoryFilters">
            <div className="explorerSearch"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void runRecall()} placeholder="Search archive... (press Enter)" /></div>
            <select><option>All fact types</option></select>
            <select><option>All tags</option></select>
          </div>
          <div className="memoryTable">
            <div className="memoryTableHead memories"><span>Fact</span><span>Type</span><span>Tags</span><span>When</span><span>Source</span></div>
            {recall.length > 0 ? recall.map((item) => (
              <div className="memoryRow" key={item.id}>
                <strong>{item.summary}</strong><span>recall</span><span>{item.evidence.slice(0, 2).join(", ")}</span><span>{Math.round(item.score * 100)}%</span><span>{item.source}</span>
              </div>
            )) : <div className="memoryEmpty"><ArchiveIcon size={26} /><span>No archive entries match the current filters.</span></div>}
          </div>
        </div>
      )}

      {tab === "entities" && (
        <div className="memorySection">
          <div className="memorySectionHeader">
            <div>
              <h2>Entities</h2>
              <p>Browse named entities extracted from this archive. Click a row to see the entries that mention it.</p>
            </div>
            <span>0 shown</span>
          </div>
          <div className="memoryFilters">
            <div className="explorerSearch"><Search size={16} /><input value={entityQuery} onChange={(event) => setEntityQuery(event.target.value)} placeholder="Search entities..." /></div>
            <label className="memoryRange">Min mentions <input type="range" min="1" max="10" value={minMentions} onChange={(event) => setMinMentions(Number(event.target.value))} /> {minMentions}</label>
          </div>
          <div className="memoryTable">
            <div className="memoryTableHead entities"><span>Entity</span><span>Mentions</span><span>Last mentioned</span><span>First seen</span></div>
            <div className="memoryEmpty"><Tags size={26} /><span>No entities yet. Add archive entries and entities will appear as they're extracted.</span></div>
          </div>
        </div>
      )}

      {tab === "prompt" && (
        <div className="memorySection">
          <div className="memoryPromptIntro">
            Interact with the memory bank: Retain new memories, Recall relevant facts, and Reflect for a written answer.
          </div>
          <div className="memoryPromptModes">
            <button className={promptMode === "retain" ? "selected" : ""} onClick={() => setPromptMode("retain")}>
              <Plus size={14} />Retain
            </button>
            <button className={promptMode === "recall" ? "selected" : ""} onClick={() => setPromptMode("recall")}>
              <Search size={14} />Recall
            </button>
            <button className={promptMode === "reflect" ? "selected" : ""} onClick={() => setPromptMode("reflect")}>
              <Zap size={14} />Reflect
            </button>
          </div>

          {promptMode === "retain" && (
            <section className="memoryPromptCard">
              <p>Retain stores raw text as memories. Link extracts facts from the content and consolidates them into the archive.</p>
              <label className="memorySettingsField">
                <span>Content</span>
                <textarea
                  value={retainContent}
                  onChange={(event) => setRetainContent(event.target.value)}
                  placeholder="Something to remember..."
                />
              </label>
              <label className="memorySettingsField">
                <span>Context (optional)</span>
                <input
                  value={retainContext}
                  onChange={(event) => setRetainContext(event.target.value)}
                  placeholder="e.g. who said it, when, or why"
                />
              </label>
              <div className="memorySettingsActions">
                <button className="button primary" disabled={!retainContent.trim()}>Retain</button>
              </div>
            </section>
          )}

          {promptMode === "recall" && (
            <>
              <div className="explorerSearch">
                <ArchiveIcon size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void runRecall()} />
                <button className="button primary" onClick={runRecall} disabled={busy}>{busy ? "Recalling" : "Recall"}</button>
              </div>
              <div className="recallList">
                {recall.map((item) => (
                  <Panel title={`${item.source} - ${Math.round(item.score * 100)}%`} key={item.id}>
                    <p>{item.summary}</p>
                    <small>{item.evidence.join(", ")}</small>
                  </Panel>
                ))}
              </div>
              {recallError && <Panel title="Archive recall failed"><p>{recallError}</p></Panel>}
              {recallRan && !recallError && recall.length === 0 && (
                <Panel title="No archive matches">
                  <p>The archive responded successfully, but did not return entries for this query.</p>
                </Panel>
              )}
            </>
          )}

          {promptMode === "reflect" && (
            <section className="memoryPromptCard">
              <p>Reflect turns archive context into a written answer.</p>
              <label className="memorySettingsField">
                <span>Prompt</span>
                <textarea
                  value={reflectPrompt}
                  onChange={(event) => setReflectPrompt(event.target.value)}
                  placeholder="What should the archive answer?"
                />
              </label>
              <div className="memorySettingsActions">
                <button className="button primary" disabled={!reflectPrompt.trim()}>Reflect</button>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "settings" && (
        <div className="memorySettings">
          <header className="memorySettingsIntro">
            <h2>Settings</h2>
            <p>Bank Configuration - split by pipeline: Retain shapes what gets stored, Reflect shapes how the archive answers.</p>
          </header>

          <div className="memoryPromptModes memorySettingsMode">
            <button className={archiveSettingsMode === "retain" ? "selected" : ""} onClick={() => setArchiveSettingsMode("retain")}>
              Retain & Observations
            </button>
            <button className={archiveSettingsMode === "reflect" ? "selected" : ""} onClick={() => setArchiveSettingsMode("reflect")}>
              Reflect
            </button>
          </div>

          {archiveSettingsMode === "retain" ? (
            <>
              <section className="memorySettingsGroup">
                <div className="memorySettingsGroupHeader">
                  <span>Retain Pipeline</span>
                  <p>What the archive stores from incoming messages, and how durable facts get consolidated into observations.</p>
                </div>

                <div className="memorySettingsCard">
                  <div>
                    <h3>Retain</h3>
                    <p>Shape how the archive extracts memories from new documents.</p>
                  </div>
                  <label className="memorySettingsField">
                    <span>Retain Mission</span>
                    <small>What this archive should pay attention to during extraction. Steers the LLM without replacing the extraction rules.</small>
                    <textarea
                      value={retainMission}
                      onChange={(event) => setRetainMission(event.target.value)}
                      placeholder="e.g. Always include technical decisions, API design choices, and architectural trade-offs."
                    />
                  </label>
                  <label className="memorySettingsField">
                    <span>Custom Extraction Prompt</span>
                    <small>Replaces the built-in extraction rules entirely. Only takes effect when Extraction Mode is set to custom.</small>
                    <textarea value={customExtractionPrompt} onChange={(event) => setCustomExtractionPrompt(event.target.value)} />
                  </label>
                  <div className="memorySettingsToggleRow">
                    <div>
                      <strong>Free-form entities</strong>
                      <small>Extract regular named entities alongside entity labels. Disable to restrict extraction to entity labels only.</small>
                    </div>
                    <label className="miniToggle">
                      <span>{freeFormEntities ? "Enabled" : "Disabled"}</span>
                      <input type="checkbox" checked={freeFormEntities} onChange={(event) => setFreeFormEntities(event.target.checked)} />
                    </label>
                  </div>
                  <div className="memorySettingsActions">
                    <button className="button primary"><SquareCheck size={14} />Save changes</button>
                  </div>
                </div>
              </section>

              <section className="memorySettingsCard">
                <div>
                  <h3>Observations</h3>
                  <p>Control how facts are synthesized into durable observations.</p>
                </div>
                <div className="memorySettingsToggleRow">
                  <div>
                    <strong>Enable observations</strong>
                    <small>Enable automatic consolidation of facts into observations.</small>
                  </div>
                  <label className="miniToggle">
                    <span>{observationsEnabled ? "Enabled" : "Disabled"}</span>
                    <input type="checkbox" checked={observationsEnabled} onChange={(event) => setObservationsEnabled(event.target.checked)} />
                  </label>
                </div>
                <label className="memorySettingsField">
                  <span>Observations Mission</span>
                  <small>What this archive should synthesize into durable observations. Leave blank to use the server default.</small>
                  <textarea
                    value={observationsMission}
                    onChange={(event) => setObservationsMission(event.target.value)}
                    placeholder="e.g. Observations are stable facts about people and projects. Always include preferences, skills, and recurring patterns. Ignore one-off events and ephemeral state."
                  />
                </label>
                <div className="memorySettingsActions">
                  <button className="button primary"><SquareCheck size={14} />Save changes</button>
                </div>
              </section>
            </>
          ) : (
            <section className="memorySettingsCard">
              <div>
                <h3>Reflect</h3>
                <p>Shape how the archive uses retained facts when answering questions.</p>
              </div>
              <label className="memorySettingsField">
                <span>Reflect Mission</span>
                <small>Guidance for answering from archive entries without changing what gets stored.</small>
                <textarea placeholder="e.g. Answer concisely, cite source-backed facts, and separate stable observations from recent notes." />
              </label>
              <div className="memorySettingsActions">
                <button className="button primary"><SquareCheck size={14} />Save changes</button>
              </div>
            </section>
          )}

          <section className="memorySettingsCard dangerZone">
            <div>
              <h3>Danger zone</h3>
              <p>Destructive actions that cannot be undone.</p>
            </div>
            <div className="memorySettingsDangerRow">
              <div>
                <strong>Delete this memory bank</strong>
                <small>Permanently removes this bank and all of its documents, memories, entities, and directives.</small>
              </div>
              <button className="button danger"><Trash2 size={14} />Delete bank</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function DojoView({
  dojoState,
  skills,
  selectedWorkspace,
  activeAgent,
  agents,
  bookmarkedAgentIds,
  publishedApps,
  refreshPublishedApps,
  setView,
}: {
  dojoState: DojoState | null;
  skills: SkillMetadata[];
  selectedWorkspace?: WorkspaceSummary;
  activeAgent: ActiveAgentSelection | null;
  agents: AgentSummary[];
  bookmarkedAgentIds: string[];
  publishedApps: LinkPublishedApp[];
  refreshPublishedApps: () => Promise<void>;
  setView: (view: ViewId) => void;
}) {
  const [tab, setTab] = useState<"skills" | "squads" | "apps" | "support" | "developers" | "wiki">("skills");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<"az" | "za">("az");
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedSquad, setExpandedSquad] = useState("");
  const [selectedSkill, setSelectedSkill] = useState("");
  const [result, setResult] = useState("");
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [publishAppOpen, setPublishAppOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [appActionBusyId, setAppActionBusyId] = useState("");
  const [publishDraft, setPublishDraft] = useState<PublishAppDraft>({
    name: "",
    slug: "",
    description: "",
    ownerSquad: "",
    audience: "",
    appType: "web",
    sourceRepo: "https://github.com/team-telnyx/mcp-apps",
    sourceRef: "main",
    sourceSubdir: ".",
    buildCommand: "npm run build",
    startCommand: "",
    outputDir: "dist",
    envSchema: "",
    reviewers: "",
    riskLevel: "medium",
  });
  const publishMenuRef = useRef<HTMLDivElement | null>(null);
  const publishOptions = [
    { label: "App", detail: "Submit a private app to the managed publisher.", icon: Store, tab: "apps" },
    { label: "Skill", detail: "Publish a reusable bot skill for Telnyx teams.", icon: Zap, tab: "skills" },
    { label: "Doc", detail: "Share a local bot page, runbook, or source bundle.", icon: BookOpen, tab: "support" },
    { label: "Automation", detail: "Publish a scheduled workflow owned by your bot.", icon: Bot, tab: "apps" },
  ] as const;
  const [installedSkillKeys, setInstalledSkillKeys] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(window.localStorage.getItem("telnyx-link-installed-agent-skills") ?? "[]");
      return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  });
  const tones: DojoKit["tone"][] = ["blue", "orange", "teal", "pink", "purple", "green"];
  const squadKits = useMemo(() => {
    const grouped = new Map<string, SkillMetadata[]>();
    for (const skill of skills) {
      const squad = skill.team || "Telnyx";
      grouped.set(squad, [...(grouped.get(squad) ?? []), skill]);
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([squad, squadSkills], index) => ({
        id: squad,
        name: squad,
        mastered: squadSkills.filter((skill) => !skill.approvalRequired).length,
        total: squadSkills.length,
        tone: tones[index % tones.length],
        skills: squadSkills.sort((left, right) => left.name.localeCompare(right.name)),
      }));
  }, [skills]);
  const filteredSquadKits = squadKits.map((kit) => {
    const term = query.trim().toLowerCase();
    const filteredSkills = term
      ? kit.skills.filter((skill) => `${skill.name} ${skill.description} ${skill.team} ${skill.product ?? ""}`.toLowerCase().includes(term))
      : kit.skills;
    return { ...kit, skills: filteredSkills };
  }).filter((kit) => (filter === "all" || kit.name === filter) && (kit.skills.length > 0 || kit.name.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((left, right) => sort === "za" ? right.name.localeCompare(left.name) : left.name.localeCompare(right.name));
  const filteredSkills = useMemo(() => {
    const term = query.trim().toLowerCase();
    const results = term
      ? skills.filter((skill) => `${skill.name} ${skill.description} ${skill.team} ${skill.product ?? ""}`.toLowerCase().includes(term))
      : skills;
    return [...results]
      .filter((skill) => filter === "all" || skill.team === filter)
      .sort((left, right) => sort === "za" ? right.name.localeCompare(left.name) : left.name.localeCompare(right.name));
  }, [filter, query, skills, sort]);
  const filteredApps = useMemo(() => {
    const term = query.trim().toLowerCase();
    return publishedApps
      .filter((app) => filter === "all" || app.status === filter || app.appType === filter || app.access === filter || app.riskLevel === filter)
      .filter((app) => !term || `${app.name} ${app.description} ${app.ownerSquad} ${app.audience} ${app.appType} ${app.status} ${app.sourceRepo ?? ""}`.toLowerCase().includes(term))
      .sort((left, right) => sort === "za" ? right.name.localeCompare(left.name) : left.name.localeCompare(right.name));
  }, [filter, publishedApps, query, sort]);
  const tabFilterOptions = useMemo(() => {
    if (tab === "apps") return ["all", "submitted", "preview", "approved", "deployed", "rejected", "web", "mcp_app", "vpn", "low", "medium", "high"];
    if (tab === "support" || tab === "developers" || tab === "wiki") return ["all"];
    const teams = [...new Set(skills.map((skill) => skill.team).filter(Boolean))].sort((left, right) => left.localeCompare(right));
    return ["all", ...teams];
  }, [skills, tab]);
  const searchPlaceholder = tab === "skills"
    ? "Search skills..."
    : tab === "squads"
      ? "Search squads or skills..."
      : tab === "apps"
        ? "Search apps..."
        : tab === "support"
          ? "Search Help Center..."
          : tab === "developers"
            ? "Search Developer Docs..."
            : "Search Guru Wiki...";
  const userSquads = useMemo(() => {
    const squads = new Set<string>();
    const activeDirectoryAgent = activeAgent ? agents.find((agent) => agent.id === activeAgent.id) : undefined;
    if (activeDirectoryAgent?.squad) squads.add(activeDirectoryAgent.squad);
    for (const agent of agents) {
      if (bookmarkedAgentIds.includes(agent.id) && agent.squad) squads.add(agent.squad);
    }
    if (activeAgent) {
      for (const key of installedSkillKeys) {
        if (!key.startsWith(`${activeAgent.id}:`)) continue;
        const skillName = key.slice(activeAgent.id.length + 1);
        const skill = skills.find((item) => item.name === skillName);
        if (skill?.team) squads.add(skill.team);
      }
    }
    return [...squads].sort((left, right) => left.localeCompare(right));
  }, [activeAgent, agents, bookmarkedAgentIds, installedSkillKeys, skills]);

  useEffect(() => {
    window.localStorage.setItem("telnyx-link-installed-agent-skills", JSON.stringify(installedSkillKeys));
  }, [installedSkillKeys]);

  useEffect(() => {
    setFilter("all");
    setQuery("");
    setSort("az");
  }, [tab]);

  useEffect(() => {
    function closePublishMenu(event: MouseEvent) {
      if (!publishMenuRef.current?.contains(event.target as Node)) setPublishMenuOpen(false);
    }
    if (publishMenuOpen) document.addEventListener("mousedown", closePublishMenu);
    return () => document.removeEventListener("mousedown", closePublishMenu);
  }, [publishMenuOpen]);

  async function runSkill(skill: SkillMetadata) {
    setSelectedSkill(skill.name);
    setResult("Running skill...");
    try {
      const response = await linkApi.runSkill(skill.name);
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Skill run failed.");
    }
  }

  function toggleSquadKit(kitId: string) {
    setExpandedSquad((current) => current === kitId ? "" : kitId);
    setResult("");
    setSelectedSkill("");
  }

  function startPublishing(option: (typeof publishOptions)[number]) {
    setTab(option.tab);
    setExpandedSquad("");
    setSelectedSkill(`Publish ${option.label}`);
    setPublishMenuOpen(false);
    if (option.label === "App") {
      setPublishAppOpen(true);
      setResult("");
      return;
    }
    setResult(JSON.stringify({
      status: "draft",
      type: option.label.toLowerCase(),
      source: activeAgent?.displayName ?? "local bot",
      next: "Choose the local bot asset, owner, approval policy, and target audience before publishing to Experto.",
    }, null, 2));
  }

  function installSkill(skill: SkillMetadata) {
    setSelectedSkill(skill.name);
    if (!activeAgent) {
      setResult("Choose an active agent on Agents > My Agents before installing skills.");
      setView("agents");
      return;
    }
    const installKey = `${activeAgent.id}:${skill.name}`;
    setInstalledSkillKeys((current) => current.includes(installKey) ? current : [...current, installKey]);
    setResult(`${skill.name} installed on ${activeAgent.displayName}.`);
  }

  function renderSkillButton(skill: SkillMetadata) {
    const installed = activeAgent ? installedSkillKeys.includes(`${activeAgent.id}:${skill.name}`) : false;
    return (
      <article key={skill.name} className={`skillCard ${selectedSkill === skill.name ? "selected" : ""}`}>
        <div className="connectorTitle">
          <strong>{skill.name}</strong>
          <div className="agentCardActions">
            <Badge tone={skill.source === "telnyx" ? "default" : skill.approvalRequired ? "warning" : "success"}>{skill.team}</Badge>
            {installed && <Badge tone="success">Installed</Badge>}
          </div>
        </div>
        <p>{skill.description}</p>
        <small>{skill.product ?? "workflow"} - {skill.language ?? "skill"} - {skill.approvalRequired ? "approval gated" : "ready"}</small>
        <div className="skillCardActions">
          <button className="button secondary" onClick={() => void runSkill(skill)}>Run</button>
          <button className={installed ? "button ghost" : "button primary"} onClick={() => installSkill(skill)}>
            {installed ? "Installed" : "Install"}
          </button>
        </div>
      </article>
    );
  }

  function renderSkillsTab() {
    return (
      <>
        <div className="skillCatalog dojoSkillList">
          {filteredSkills.slice(0, 60).map(renderSkillButton)}
        </div>
        {filteredSkills.length === 0 && <EmptyState title="No skills found" body="Try another search term." />}
        {result && <pre className="resultPreview">{result}</pre>}
      </>
    );
  }

  function renderSquadsTab() {
    return (
      <>
        <section className="dojoSection" aria-label="Your squads">
          <div className="dojoSectionHeading">
            <Users size={16} />
            <h2>Your squads</h2>
          </div>
          <div className="userSquadsPanel">
            <span className="userSquadsSummary">Active agent squads</span>
            <div className="userSquadChips">
              {userSquads.length > 0 ? userSquads.map((squad) => <span key={squad}>{squad}</span>) : <em>No squads found for the active agent</em>}
            </div>
          </div>
        </section>
        <section className="dojoSection" aria-label="Squad Skills">
          <div className="dojoSectionHeading">
            <Zap size={16} />
            <h2>Squad Skills</h2>
          </div>
          <div className="squadKitColumns">
          {filteredSquadKits.map((kit) => {
            const expanded = expandedSquad === kit.id;
            return (
              <section className={`squadKitColumn dojo-${kit.tone} ${expanded ? "expanded" : ""}`} key={kit.id}>
                <button className="squadKitHeader" onClick={() => toggleSquadKit(kit.id)} aria-expanded={expanded}>
                  <span>
                    <strong>{kit.name}</strong>
                    <small>{kit.mastered}/{kit.total}</small>
                  </span>
                  <ChevronDown size={16} />
                </button>
                {expanded && (
                  <div className="squadKitSkillList">
                    {kit.skills.map(renderSkillButton)}
                  </div>
                )}
              </section>
            );
          })}
          </div>
        </section>
        {filteredSquadKits.length === 0 && <EmptyState title="No skills found" body="Try another search term." />}
        {result && <pre className="resultPreview">{result}</pre>}
      </>
    );
  }

  function updatePublishDraft<K extends keyof PublishAppDraft>(key: K, value: PublishAppDraft[K]) {
    setPublishDraft((current) => ({ ...current, [key]: value }));
  }

  function publishInputFromDraft(): LinkAppPublishInput {
    return {
      name: publishDraft.name.trim(),
      slug: publishDraft.slug.trim() || undefined,
      description: publishDraft.description.trim() || undefined,
      ownerSquad: publishDraft.ownerSquad.trim(),
      audience: publishDraft.audience.trim(),
      appType: publishDraft.appType,
      sourceRepo: publishDraft.sourceRepo.trim(),
      sourceRef: publishDraft.sourceRef.trim() || "main",
      sourceSubdir: publishDraft.sourceSubdir.trim() || ".",
      buildCommand: publishDraft.buildCommand.trim() || "npm run build",
      startCommand: publishDraft.startCommand.trim() || undefined,
      outputDir: publishDraft.outputDir.trim() || undefined,
      envSchema: splitInputList(publishDraft.envSchema),
      reviewers: splitInputList(publishDraft.reviewers),
      riskLevel: publishDraft.riskLevel,
    };
  }

  async function submitPublishIntent() {
    setPublishBusy(true);
    setResult("Submitting app...");
    try {
      const response = await linkApi.createPublishIntent(publishInputFromDraft());
      await refreshPublishedApps();
      setPublishAppOpen(false);
      setResult(formatPublisherResult(response));
    } catch (err) {
      setResult(err instanceof Error ? err.message : "App publish request failed.");
    } finally {
      setPublishBusy(false);
    }
  }

  async function openPublishedApp(app: LinkPublishedApp) {
    setAppActionBusyId(app.id);
    try {
      const response = await linkApi.openPublishedApp(app.id);
      setResult(`Opened ${app.name}: ${response.url}`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Unable to open app.");
    } finally {
      setAppActionBusyId("");
    }
  }

  async function duplicatePublishedApp(app: LinkPublishedApp) {
    setAppActionBusyId(app.id);
    try {
      const response = await linkApi.duplicatePublishedApp(app.id);
      setResult(JSON.stringify(response, null, 2));
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Unable to duplicate app.");
    } finally {
      setAppActionBusyId("");
    }
  }

  async function reviewPublishedApp(app: LinkPublishedApp, decision: "approve" | "reject") {
    setAppActionBusyId(app.id);
    try {
      const response = await linkApi.reviewPublishedApp({ appId: app.id, decision });
      await refreshPublishedApps();
      setResult(formatPublisherResult(response));
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Unable to record review.");
    } finally {
      setAppActionBusyId("");
    }
  }

  function renderPublishAppPanel() {
    if (!publishAppOpen) return null;
    return (
      <section className="publisherPanel" aria-label="Publish app">
        <div className="publisherPanelHeader">
          <div>
            <h2>Publish App</h2>
            <small>Managed publisher</small>
          </div>
          <button className="iconButton" onClick={() => setPublishAppOpen(false)} aria-label="Close publish app">
            <X size={16} />
          </button>
        </div>
        <div className="publisherForm">
          <label>
            <span>Name</span>
            <input value={publishDraft.name} onChange={(event) => updatePublishDraft("name", event.target.value)} placeholder="Carrier Readiness Hub" />
          </label>
          <label>
            <span>Slug</span>
            <input value={publishDraft.slug} onChange={(event) => updatePublishDraft("slug", event.target.value)} placeholder="carrier-readiness-hub" />
          </label>
          <label className="publisherWideField">
            <span>Description</span>
            <textarea value={publishDraft.description} onChange={(event) => updatePublishDraft("description", event.target.value)} rows={3} />
          </label>
          <label>
            <span>Owner squad</span>
            <input value={publishDraft.ownerSquad} onChange={(event) => updatePublishDraft("ownerSquad", event.target.value)} placeholder="messaging-ops.squad" />
          </label>
          <label>
            <span>Audience</span>
            <input value={publishDraft.audience} onChange={(event) => updatePublishDraft("audience", event.target.value)} placeholder="Messaging, NOC" />
          </label>
          <label>
            <span>Type</span>
            <select value={publishDraft.appType} onChange={(event) => updatePublishDraft("appType", event.target.value as LinkPublishedAppType)}>
              <option value="web">Web app</option>
              <option value="mcp_app">MCP app</option>
            </select>
          </label>
          <label>
            <span>Risk</span>
            <select value={publishDraft.riskLevel} onChange={(event) => updatePublishDraft("riskLevel", event.target.value as LinkPublishedAppRisk)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="publisherWideField">
            <span>Source repo</span>
            <input value={publishDraft.sourceRepo} onChange={(event) => updatePublishDraft("sourceRepo", event.target.value)} />
          </label>
          <label>
            <span>Source ref</span>
            <input value={publishDraft.sourceRef} onChange={(event) => updatePublishDraft("sourceRef", event.target.value)} />
          </label>
          <label>
            <span>Source subdir</span>
            <input value={publishDraft.sourceSubdir} onChange={(event) => updatePublishDraft("sourceSubdir", event.target.value)} />
          </label>
          <label>
            <span>Build command</span>
            <input value={publishDraft.buildCommand} onChange={(event) => updatePublishDraft("buildCommand", event.target.value)} />
          </label>
          <label>
            <span>Output dir</span>
            <input value={publishDraft.outputDir} onChange={(event) => updatePublishDraft("outputDir", event.target.value)} />
          </label>
          <label className="publisherWideField">
            <span>Start command</span>
            <input value={publishDraft.startCommand} onChange={(event) => updatePublishDraft("startCommand", event.target.value)} placeholder="npm start" />
          </label>
          <label>
            <span>Env schema</span>
            <textarea value={publishDraft.envSchema} onChange={(event) => updatePublishDraft("envSchema", event.target.value)} rows={3} />
          </label>
          <label>
            <span>Reviewers</span>
            <textarea value={publishDraft.reviewers} onChange={(event) => updatePublishDraft("reviewers", event.target.value)} rows={3} />
          </label>
        </div>
        <div className="publisherPanelActions">
          <button className="button primary" onClick={() => void submitPublishIntent()} disabled={publishBusy}>
            <Upload size={15} />
            Submit
          </button>
          <button className="button ghost" onClick={() => setPublishAppOpen(false)} disabled={publishBusy}>Cancel</button>
        </div>
      </section>
    );
  }

  function renderAppsTab() {
    return (
      <div className="marketplaceView embeddedMarketplace">
        {renderPublishAppPanel()}
        <div className="marketplaceGrid">
          {filteredApps.map((app) => (
            <article className="marketplaceCard" key={app.id}>
              <div className="marketplaceCardHeader">
                <div className="marketplaceIcon">
                  <Store size={18} />
                </div>
                <div>
                  <strong>{app.name}</strong>
                  <small>{app.ownerSquad}</small>
                </div>
                <Badge tone={publisherBadgeTone(app.status)}>{formatStatusLabel(app.status)}</Badge>
              </div>
              <p>{app.description}</p>
              <div className="marketplaceMeta">
                <span><Bot size={13} /> {formatPublishedAppType(app.appType)}</span>
                <span><Users size={13} /> {app.audience}</span>
                <span><ShieldCheck size={13} /> {app.access.toUpperCase()}</span>
                <span><Target size={13} /> {app.riskLevel}</span>
                {app.latestVersion?.version && <span><Tags size={13} /> {app.latestVersion.version}</span>}
              </div>
              <div className="publisherSource">
                <span>{app.sourceRepo ?? "No source repo"}</span>
                <small>{[app.sourceRef, app.sourceSubdir].filter(Boolean).join(" / ") || "source pending"}</small>
              </div>
              <div className="marketplaceActions">
                <button className="button secondary" onClick={() => void openPublishedApp(app)} disabled={appActionBusyId === app.id || !(app.vpnUrl || app.deployedUrl || app.previewUrl)}>
                  <ExternalLink size={14} />
                  Open VPN
                </button>
                <button className="button ghost" onClick={() => void duplicatePublishedApp(app)} disabled={appActionBusyId === app.id}>
                  <FolderOpen size={14} />
                  Duplicate
                </button>
                {["submitted", "preview", "approved"].includes(app.status) && (
                  <button className="button primary" onClick={() => void reviewPublishedApp(app, "approve")} disabled={appActionBusyId === app.id}>
                    <SquareCheck size={14} />
                    Approve
                  </button>
                )}
                {["submitted", "preview"].includes(app.status) && (
                  <button className="button ghost" onClick={() => void reviewPublishedApp(app, "reject")} disabled={appActionBusyId === app.id}>
                    <X size={14} />
                    Reject
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        {filteredApps.length === 0 && <EmptyState title="No apps found" body="Try another search term or filter." />}
        {result && <pre className="resultPreview">{result}</pre>}
      </div>
    );
  }

  function renderDocsSourceTab(source: Exclude<ExplorerSourceTab, "local">) {
    return (
      <ExplorerView
        selectedWorkspace={selectedWorkspace}
        embedded
        hideSearch
        externalQuery={query}
        externalSource={source}
        externalSort={sort}
        onOpenSettings={() => setView("settings")}
      />
    );
  }

  const tabContent = {
    skills: renderSkillsTab,
    squads: renderSquadsTab,
    apps: renderAppsTab,
    support: () => renderDocsSourceTab("support"),
    developers: () => renderDocsSourceTab("developers"),
    wiki: () => renderDocsSourceTab("wiki"),
  }[tab];

  if (!dojoState) return <EmptyState title="No Experto state" body="Training data will appear when the local Link state loads." />;

  return (
    <section className="content dojoView">
      <header className="pageHeader">
        <div>
          <h1>Experto Crede</h1>
        </div>
        <div className="headerActions expertoHeaderActions" aria-label="Experto actions">
          <button className="button secondary" onClick={() => setView("agents")}>
            <Bot size={15} />
            {activeAgent?.displayName ? `Agent: ${activeAgent.displayName}` : "Choose agent"}
          </button>
          <div className="publishMenuWrap" ref={publishMenuRef}>
            <button className="button primary" onClick={() => setPublishMenuOpen((open) => !open)} aria-expanded={publishMenuOpen} aria-haspopup="menu">
              <Plus size={15} />
              Publish
            </button>
            {publishMenuOpen && (
              <div className="publishMenu" role="menu" aria-label="Publish from local bot">
                <div className="publishMenuHeader">
                  <strong>Publish from local bot</strong>
                  <small>Select what this bot should package for Telnyx employees.</small>
                </div>
                {publishOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button key={option.label} role="menuitem" onClick={() => startPublishing(option)}>
                      <Icon size={16} />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.detail}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="expertoTabs" role="tablist" aria-label="Experto sections">
        {([
          ["skills", "Skills", Zap],
          ["squads", "Squads", Users],
          ["apps", "Apps", Store],
          ["support", "Help Center", BookOpen],
          ["developers", "Developer Docs", FileText],
          ["wiki", "Guru Wiki", BookOpen],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)} role="tab" aria-selected={tab === id}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      <div className="dojoToolbar">
        <button
          className={`iconButton dojoFilterButton ${filter !== "all" || filterOpen ? "selected" : ""}`}
          aria-label={filterOpen ? "Hide filters" : "Show filters"}
          title={filterOpen ? "Hide filters" : "Show filters"}
          onClick={() => setFilterOpen((open) => !open)}
        >
          <SlidersHorizontal size={16} />
        </button>
        <label className="dojoSearchField">
          <Search size={16} />
          <input value={query} placeholder={searchPlaceholder} onChange={(event) => setQuery(event.target.value)} />
        </label>
        {filterOpen && (
          <div className="dojoFilterPanel" role="group" aria-label="Experto filters">
            {tabFilterOptions.map((option) => (
              <button
                key={option}
                className={filter === option ? "selected" : ""}
                type="button"
                onClick={() => {
                  setFilter(option);
                  setFilterOpen(false);
                }}
              >
                {option === "all" ? "All" : option}
              </button>
            ))}
          </div>
        )}
        <label className="dojoSelectField">
          <select value={sort} onChange={(event) => setSort(event.target.value as "az" | "za")}>
            <option value="az">A-Z</option>
            <option value="za">Z-A</option>
          </select>
        </label>
      </div>
      {tabContent()}
    </section>
  );
}

function SettingsView({
  refresh,
  colorMode,
  setColorMode,
  railExpanded,
  setRailExpanded,
}: {
  refresh: () => Promise<void>;
  colorMode: "light" | "dark";
  setColorMode: (mode: "light" | "dark") => void;
  railExpanded: boolean;
  setRailExpanded: (expanded: boolean) => void;
}) {
  const [tab, setTab] = useState<"credentials" | "theme" | "design">("credentials");
  const [credentials, setCredentials] = useState<CredentialGroupStatus[]>([]);
  const visibleCredentials = useMemo(
    () => credentials.filter((group) => group.id !== "agent-control-plane" && group.id !== "mcp-proxy"),
    [credentials],
  );
  const requiredCredentials = useMemo(
    () => visibleCredentials.filter(isRequiredCredentialGroup).sort(compareCredentialGroups),
    [visibleCredentials],
  );

  async function refreshCredentials() {
    setCredentials(await linkApi.listCredentials());
  }

  useEffect(() => {
    void refreshCredentials();
  }, []);

  return (
    <section className="content settingsView">
      <header className="pageHeader">
        <div>
          <h1>Settings</h1>
        </div>
      </header>
      <div className="settingsTabs" role="tablist" aria-label="Settings sections">
          {([
            ["credentials", "Credentials", ShieldCheck],
            ["theme", "Link Theme", Sun],
            ["design", "Design System", Grid2X2],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === "credentials" && (
        <div className="credentialList">
          <CredentialSection title="Required" groups={requiredCredentials}>
            <CredentialGroupCards
              groups={requiredCredentials}
              setGroups={setCredentials}
              onSaved={async () => {
                await refresh();
                await refreshCredentials();
              }}
            />
          </CredentialSection>
        </div>
      )}

      {tab === "theme" && (
        <div className="settingsGrid">
          <section className="accessCard themeSettingsCard">
            <div className="accessCardHeader">
              <div className="accessCardTitle">
                <span className="accessIcon">
                  {colorMode === "dark" ? <Moon size={18} /> : <Sun size={18} />}
                </span>
                <div>
                  <h3>Theme</h3>
                </div>
              </div>
              <button
                className={`settingsToggle ${colorMode === "dark" ? "selected" : ""}`}
                aria-label={colorMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                onClick={() => setColorMode(colorMode === "dark" ? "light" : "dark")}
              >
                <span>{colorMode === "dark" ? "Dark" : "Light"}</span>
                <i />
              </button>
            </div>
            <div className="themeSettingsRows">
              <div className="themeSettingsRow">
                <span className="themeSettingsRowLabel">
                  <span className="accessIcon">
                    <PanelLeftOpen size={18} />
                  </span>
                  <span>Expand sidebar</span>
                </span>
                <button
                  className={`settingsToggle ${railExpanded ? "selected" : ""}`}
                  aria-label={railExpanded ? "Collapse sidebar" : "Expand sidebar"}
                  onClick={() => setRailExpanded(!railExpanded)}
                >
                  <span>{railExpanded ? "Expanded" : "Collapsed"}</span>
                  <i />
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === "design" && <DesignSystemView embedded />}
    </section>
  );
}

function CredentialGroupCards({
  groups,
  setGroups,
  onSaved,
}: {
  groups: CredentialGroupStatus[];
  setGroups: (groups: CredentialGroupStatus[]) => void;
  onSaved?: () => Promise<void>;
}) {
  const [credentialDrafts, setCredentialDrafts] = useState<Record<string, string>>({});
  const [savingCredential, setSavingCredential] = useState("");
  const [expandedCredentialId, setExpandedCredentialId] = useState("");

  async function saveCredential(name: string) {
    const value = credentialDrafts[name]?.trim();
    if (!value) return;
    setSavingCredential(name);
    try {
      const nextCredentials = await linkApi.saveCredential({ name, value });
      setGroups(nextCredentials);
      setCredentialDrafts((current) => ({ ...current, [name]: "" }));
      await onSaved?.();
    } finally {
      setSavingCredential("");
    }
  }

  return (
    <>
      {groups.map((group) => {
        const configuredCount = group.fields.filter((field) => field.configured).length;
        const expanded = expandedCredentialId === group.id;

        return (
          <section className={`credentialCard ${expanded ? "expanded" : ""}`} key={group.id}>
            <button
              className="credentialSummary"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpandedCredentialId(expanded ? "" : group.id)}
            >
              <span className="credentialChevron" aria-hidden="true"><ChevronDown size={16} /></span>
              <span className="credentialSummaryText">
                <strong>{group.label}</strong>
                <small>{credentialHelpText(group)}</small>
              </span>
              <span className="credentialSummaryStatus">
                <span className="credentialSavedBadge">
                  {configuredCount}/{group.fields.length} saved
                </span>
              </span>
            </button>

            {expanded && (
              <div className="credentialFields">
                {group.fields.map((field) => (
                  <div className="credentialRow" key={field.name}>
                    <label className="credentialField">
                      <span>{credentialFieldLabel(field.name)}</span>
                      <input
                        type={isSecretCredentialField(field.name) ? "password" : "text"}
                        value={credentialDrafts[field.name] ?? ""}
                        onChange={(event) => setCredentialDrafts((current) => ({ ...current, [field.name]: event.target.value }))}
                        placeholder={field.configured ? `${field.source === "env" ? "Set by env" : "Saved"} - enter a new value to replace` : "Not configured"}
                      />
                    </label>
                    <button className="button secondary" onClick={() => void saveCredential(field.name)} disabled={savingCredential === field.name || !credentialDrafts[field.name]?.trim()}>
                      {savingCredential === field.name ? "Saving" : field.configured ? "Replace" : "Save"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function credentialHelpText(group: CredentialGroupStatus) {
  if (group.id === "litellm") {
    return (
      <>
        Get your LiteLLM Key by asking the{" "}
        <a href="https://telnyx.enterprise.slack.com/archives/D0995UB1PLY" target="_blank" rel="noreferrer">
          AI-swe-Agent
        </a>{" "}
        bot for one in Slack.
      </>
    );
  }
  return group.help;
}

function credentialFieldLabel(name: string) {
  if (name === "LITELLM_API_KEY") return "LiteLLM API Key";
  if (name === "LITELLM_BASE_URL") return "LiteLLM Base URL";
  if (name === "LITELLM_MODEL") return "LiteLLM Model";
  if (name === "GOOGLE_WORKSPACE_ACCESS_TOKEN") return "Google Workspace OAuth Token";
  if (name === "INTERCOM_ACCESS_TOKEN") return "Intercom Access Token";
  if (name === "MINTLIFY_API_KEY") return "Mintlify API Key";
  if (name === "MINTLIFY_DOMAIN") return "Mintlify Docs Domain";
  if (name === "GURU_USER_EMAIL") return "Guru User Email";
  if (name === "GURU_USER_TOKEN") return "Guru User Token";
  return name;
}

function isSecretCredentialField(name: string) {
  return /TOKEN|KEY|SECRET|PASSWORD/i.test(name);
}

function isRequiredCredentialGroup(group: CredentialGroupStatus) {
  return ["telnyx", "litellm", "google-workspace", "intercom-help-center", "mintlify-developer-docs", "guru"].includes(group.id);
}

function compareCredentialGroups(left: CredentialGroupStatus, right: CredentialGroupStatus) {
  return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
}

function sortAgents(agents: AgentSummary[], sortMode: "az" | "za" | "status") {
  return [...agents].sort((left, right) => {
    if (sortMode === "status") {
      const statusCompare = `${left.status} ${left.available}`.localeCompare(`${right.status} ${right.available}`, undefined, { sensitivity: "base" });
      if (statusCompare !== 0) return statusCompare;
    }
    const nameCompare = left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
    return sortMode === "za" ? -nameCompare : nameCompare;
  });
}

function sortConnectors(connectors: ConnectorStatus[], sortMode: "az" | "za" | "status") {
  return [...connectors].sort((left, right) => {
    if (sortMode === "status") {
      const statusCompare = `${left.status} ${left.mode}`.localeCompare(`${right.status} ${right.mode}`, undefined, { sensitivity: "base" });
      if (statusCompare !== 0) return statusCompare;
    }
    const nameCompare = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    return sortMode === "za" ? -nameCompare : nameCompare;
  });
}

function sortTools(tools: ToolMetadata[], sortMode: "az" | "za" | "status") {
  return [...tools].sort((left, right) => {
    if (sortMode === "status") {
      const statusCompare = `${left.riskLevel} ${left.approvalRequired}`.localeCompare(`${right.riskLevel} ${right.approvalRequired}`, undefined, { sensitivity: "base" });
      if (statusCompare !== 0) return statusCompare;
    }
    const nameCompare = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    return sortMode === "za" ? -nameCompare : nameCompare;
  });
}

function sortHostedAgents(agents: HostedAgentSummary[], sortMode: "az" | "za" | "status") {
  return [...agents].sort((left, right) => {
    if (sortMode === "status") {
      const statusCompare = `${left.status} ${left.type}`.localeCompare(`${right.status} ${right.type}`, undefined, { sensitivity: "base" });
      if (statusCompare !== 0) return statusCompare;
    }
    const nameCompare = left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
    return sortMode === "za" ? -nameCompare : nameCompare;
  });
}

function formatVisibilityLabel(visibility: string) {
  if (visibility.toLowerCase() === "internal") return "Internal";
  return formatStatusLabel(visibility);
}

function CredentialSection({ title, groups, children }: { title: string; groups: CredentialGroupStatus[]; children: ReactNode }) {
  if (groups.length === 0) return null;
  return (
    <section className="credentialSection">
      <div className="credentialSectionHeader">
        <span>{title}</span>
      </div>
      <div className="credentialSectionList">{children}</div>
    </section>
  );
}

function connectorButtonLabel(connector: ConnectorStatus) {
  if (connector.id === "agent-control-plane" && connector.status === "needs_access") return "Sign in with Okta";
  if (connector.id === "agent-control-plane" && connector.status === "requested") return "Sign in with Okta";
  if (connector.status === "connected") return "Connected";
  if (connector.status === "signed_in") return "Signed in";
  return "Configure";
}

function connectorStatusLabel(status: ConnectorStatus["status"]) {
  if (status === "needs_access") return "Needs access";
  if (status === "signed_in") return "Signed in";
  if (status === "requested") return "Needs setup";
  return status;
}

function agentTypeLabel(agent: AgentSummary) {
  const searchable = `${agent.source} ${agent.type} ${agent.origin} ${agent.capabilities.join(" ")}`.toLowerCase();
  if (searchable.includes("mcp") || searchable.includes("aida")) return "MCP";
  if (searchable.includes("slack")) return "Slack";
  if (searchable.includes("api") || searchable.includes("control-plane") || searchable.includes("discovery")) return "API";
  return "Agent";
}

function agentSquadLabel(agent: AgentSummary) {
  return agent.squad || agent.audience || formatVisibilityLabel(agent.visibility);
}

function formatSourceLabel(source: AgentSummary["source"]) {
  if (source === "agent-control-plane") return "Agent Control Plane";
  if (source === "a2a-discovery") return "Directory";
  if (source === "aida") return "AIDA";
  return formatStatusLabel(source);
}

function connectorTypeLabel(connector: ConnectorStatus) {
  const searchable = `${connector.id} ${connector.name} ${connector.category} ${connector.description} ${connector.requiredAccess.join(" ")}`.toLowerCase();
  if (searchable.includes("mcp") || searchable.includes("aida")) return "MCP";
  if (searchable.includes("oauth") || searchable.includes("okta")) return "OAuth";
  if (searchable.includes("docs") || searchable.includes("documentation") || searchable.includes("support center")) return "Docs";
  if (searchable.includes("api") || searchable.includes("token") || searchable.includes("key")) return "API";
  return "Plugin";
}

function connectorInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "PL";
}

function connectorModeLabel(connector: ConnectorStatus) {
  if (connector.mode === "env") return "environment configured";
  if (connector.mode === "saved") return "saved in Settings";
  if (connector.mode === "okta") return "Okta session present";
  if (connector.mode === "live") return "live adapter";
  return `needs ${connector.requiredAccess.join(", ")}`;
}

function DesignSystemView({ embedded = false }: { embedded?: boolean }) {
  const [tab, setTab] = useState<"colors" | "typography" | "spacing" | "components" | "chat">("components");
  const colorTokens = [
    ["Background", "--bg"],
    ["Surface", "--surface"],
    ["Soft surface", "--surface-soft"],
    ["Text", "--text"],
    ["Muted", "--text-muted"],
    ["Telnyx Green", "--telnyx-green"],
    ["Telnyx Black", "--telnyx-black"],
    ["Accent", "--accent"],
    ["Success", "--success"],
    ["Warning", "--warning"],
    ["Danger", "--danger"],
    ["Skill", "--skill"],
  ];

  return (
    <section className={embedded ? "designView settingsDesignPanel" : "content designView"}>
      {!embedded && (
        <header className="pageHeader">
          <div>
            <h1>Design System</h1>
          </div>
        </header>
      )}
      <div className="designTabs">
        {([
          ["colors", "Colors", Sun],
          ["typography", "Typography", FileText],
          ["spacing", "Spacing", LayoutDashboard],
          ["components", "Components", Grid2X2],
          ["chat", "Chat", MessageSquare],
        ] as const).map(([item, label, Icon]) => (
          <button key={item} className={tab === item ? "selected" : ""} onClick={() => setTab(item)}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === "colors" && (
        <div className="tokenGrid">
          {colorTokens.map(([label, token]) => (
            <div className="tokenSwatch" key={token}>
              <span style={{ background: `var(${token})` }} />
              <strong>{label}</strong>
              <small>{token}</small>
            </div>
          ))}
        </div>
      )}

      {tab === "typography" && (
        <div className="designSection">
          <Panel title="Type scale">
            <div className="typeScale">
              <h1>Page title 24/1.15</h1>
              <h2>Artifact title 24/1.15</h2>
              <strong>Body emphasis 13/650</strong>
              <p>Body copy uses compact system UI metrics for dense operational scanning.</p>
              <small>Section labels use uppercase 11px with stable spacing.</small>
            </div>
          </Panel>
        </div>
      )}

      {tab === "spacing" && (
        <div className="spacingGrid">
          {["Rail icon", "Titlebar", "Tab strip", "Radius", "Panel padding", "Page gutter"].map((label) => (
            <Panel title={label} key={label}>
              <div className="spacingSample" />
              <p>Defined by shared CSS tokens and component primitives.</p>
            </Panel>
          ))}
        </div>
      )}

      {tab === "components" && (
        <div className="componentGrid">
          <Panel title="Buttons">
            <div className="componentRow">
              <button className="button primary">Primary</button>
              <button className="button secondary">Secondary</button>
              <button className="button ghost">Ghost</button>
              <button className="button primary" disabled>Disabled</button>
            </div>
          </Panel>
          <Panel title="Badges and dots">
            <div className="componentRow">
              <Badge tone="success">Success</Badge>
              <Badge tone="warning">Warning</Badge>
              <Badge tone="danger">Danger</Badge>
              <Badge tone="skill">Skill</Badge>
              <StatusDot tone="success" />
              <StatusDot tone="warning" />
              <StatusDot tone="danger" />
              <StatusDot tone="muted" />
            </div>
          </Panel>
          <Panel title="Segmented controls">
            <div className="componentRow">
              <Segmented selected="Auto" />
              <Segmented selected="Ask" />
              <Segmented selected="Active" options={["Active", "Paused"]} />
            </div>
          </Panel>
          <Panel title="Permission row">
            <div className="permissionRow demoRow">
              <div>
                <strong>hindsight.recall</strong>
                <small>Recall long-term agent memory with source attribution.</small>
              </div>
              <Segmented selected="Auto" />
            </div>
          </Panel>
        </div>
      )}

      {tab === "chat" && (
        <div className="chatSpec">
          <div className="message link">
            <strong>Telnyx Link</strong>
            <p>Ask about customers, incidents, products, docs, skills, or shared-channel drafts.</p>
          </div>
          <div className="message you">
            <strong>You</strong>
            <p>Brief me on Acme Messaging and current escalations.</p>
          </div>
          <div className="composer demoComposer">
            <input value="Draft a customer-safe update" readOnly />
            <button className="button primary">Send</button>
          </div>
        </div>
      )}
    </section>
  );
}

function MemoryModal({ onClose, sources }: { onClose: () => void; sources: string[] }) {
  const visibleSources = sources.length > 0 ? sources.slice(0, 6) : ["Slack", "Guru", "Google Drive", "Hindsight"];
  return (
    <div className="modalScrim">
      <div className="memoryModal">
        <header>
          <h2>Refreshing Memory</h2>
          <span className="spinner" />
          <button className="iconButton" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="scanTitle">
          <span className="spinner small" />
          Link scanning connected sources
        </div>
        <div className="sourceTable">
          <div className="sourceHeader"><span>Source</span><span>Status</span></div>
          {visibleSources.map((source, index) => (
            <div className="sourceRow" key={source}>
              <span>{source}</span>
              <span>{index < 2 ? "Scanning" : "Queued"}</span>
            </div>
          ))}
        </div>
        <footer>
          <button className="button ghost" onClick={onClose}>Cancel</button>
        </footer>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="content emptyState">
      <Bot size={36} />
      <h1>{title}</h1>
      <p>{body}</p>
    </section>
  );
}

function Segmented({ selected, options = ["Auto", "Allow", "Ask"] }: { selected: string; options?: string[] }) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button key={option} className={option === selected ? "selected" : ""}>{option}</button>
      ))}
    </div>
  );
}

function Badge({ tone, children }: { tone: "success" | "warning" | "danger" | "skill" | "default"; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function StatusDot({ tone }: { tone: "success" | "warning" | "danger" | "muted" }) {
  return <span className={`statusDot ${tone}`} aria-hidden="true" />;
}

function formatStatusLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function splitInputList(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function formatPublishedAppType(type: LinkPublishedAppType) {
  return type === "mcp_app" ? "MCP app" : "Web app";
}

function publisherBadgeTone(status: LinkPublishedAppStatus): "success" | "warning" | "danger" | "default" {
  if (status === "deployed" || status === "approved") return "success";
  if (status === "rejected" || status === "deprecated") return "danger";
  if (status === "submitted" || status === "building" || status === "preview") return "warning";
  return "default";
}

function formatPublisherResult(result: LinkAppPublishResult) {
  return JSON.stringify({
    mode: result.mode,
    message: result.message,
    app: result.app.name,
    status: result.app.status,
    source: [result.app.sourceRepo, result.app.sourceRef, result.app.sourceSubdir].filter(Boolean).join(" / "),
  }, null, 2);
}

function formatModelLabel(model: string) {
  if (model === "mock-link-runtime") return "Local fallback";
  return model;
}

function relativeDate(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function speechRecognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function preferredAudioMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  ) ?? "";
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Voice audio could not be read."));
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const [, base64 = ""] = result.split(",");
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

function sourceInitials(source: string) {
  if (source === "telnyx_support") return "HC";
  if (source === "telnyx_developers") return "DD";
  if (source === "guru") return "W";
  return source
    .split("_")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function initialsFromIdentity(identity: string) {
  const trimmed = identity.trim();
  if (!trimmed) return "TL";
  const nameParts = trimmed.split(/\s+/).filter(Boolean);
  if (nameParts.length >= 2) return `${nameParts[0]![0]}${nameParts[nameParts.length - 1]![0]}`.toUpperCase();
  const localPart = trimmed.split("@")[0] || "TL";
  const parts = localPart.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return localPart.slice(0, 2).toUpperCase();
}
