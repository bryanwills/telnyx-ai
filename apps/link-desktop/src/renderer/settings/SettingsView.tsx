import {
  Activity,
  Check,
  ChevronDown,
  Cloud,
  FolderOpen,
  GitBranch,
  HardDrive,
  Keyboard,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Server,
  SlidersHorizontal,
  Store,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  AiModelRoute,
  CatalogModel,
  EngineStatus,
  InstalledModel,
  ModelCenterState,
  ModelRoleAssignment,
  ProviderConfig,
  ProviderDefinition,
  SpeakSettings,
} from "../api.js";
import { linkApi } from "../api.js";

type ActualSettingsTab =
  | "shortcuts"
  | "models"
  | "local-models"
  | "cloud-models"
  | "local-api-server"
  | "mcp-routing"
  | "diagnostics";
type ModelPageTab = "installed" | "available";

export type DesktopShortcutActionId =
  | "open-start"
  | "open-chat"
  | "open-settings"
  | "open-calendar"
  | "open-phone"
  | "open-docs"
  | "open-agents"
  | "open-skills"
  | "open-tools"
  | "new-chat";

export type DesktopShortcutBinding = {
  id: string;
  actionId: DesktopShortcutActionId;
  shortcut: string;
};

const tabs: Array<{ id: ActualSettingsTab; label: string; icon: typeof SlidersHorizontal }> = [
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "local-models", label: "Local Models", icon: HardDrive },
  { id: "cloud-models", label: "Cloud Models", icon: Cloud },
  { id: "mcp-routing", label: "Routing", icon: GitBranch },
  { id: "local-api-server", label: "API Server", icon: Server },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
];

const modelPageTabs: Array<{ id: ModelPageTab; label: string; icon: typeof SlidersHorizontal }> = [
  { id: "installed", label: "Installed", icon: HardDrive },
  { id: "available", label: "Available", icon: Store },
];

const legacyTabMap: Record<string, ActualSettingsTab> = {
  auth: "cloud-models",
  models: "local-models",
  plugins: "mcp-routing",
  agentmail: "diagnostics",
  contacts: "diagnostics",
  assistants: "diagnostics",
  numbers: "cloud-models",
  dialer: "diagnostics",
  domains: "diagnostics",
  design: "local-models",
  vpn: "diagnostics",
  wiki: "mcp-routing",
  shortcuts: "shortcuts",
};

function normalizeTab(tab: string): ActualSettingsTab {
  if (tab === "models" || tab === "general") return "local-models";
  if (tabs.some((candidate) => candidate.id === tab)) return tab as ActualSettingsTab;
  return legacyTabMap[tab] || "local-models";
}

const desktopShortcutActions: Array<{ id: DesktopShortcutActionId; label: string; description: string }> = [
  { id: "open-chat", label: "Open Chat", description: "Jump to the chat workspace." },
  { id: "open-settings", label: "Open Settings", description: "Jump to desktop settings." },
  { id: "open-start", label: "Open Start", description: "Show the Get Started screen." },
  { id: "open-calendar", label: "Open Calendar", description: "Jump to the calendar workspace." },
  { id: "open-phone", label: "Open Phone", description: "Jump to calls and phone tools." },
  { id: "open-docs", label: "Open Docs", description: "Jump to Docs." },
  { id: "open-agents", label: "Open Agents", description: "Jump to Agents." },
  { id: "open-skills", label: "Open Skills", description: "Jump to Skills." },
  { id: "open-tools", label: "Open Tools", description: "Jump to Tools." },
  { id: "new-chat", label: "New Chat", description: "Start a new chat session draft." },
];

function desktopShortcutActionMeta(actionId: DesktopShortcutActionId) {
  return desktopShortcutActions.find((action) => action.id === actionId) ?? desktopShortcutActions[0]!;
}

function formatShortcutParts(shortcut: string) {
  return shortcut
    .split("+")
    .filter(Boolean)
    .map((part) => {
      if (part === "Meta") return "Cmd";
      if (part === "Alt") return "Option";
      if (part === "Control") return "Ctrl";
      if (part === "Shift") return "Shift";
      if (part === "Comma") return ",";
      if (part === "Period") return ".";
      return part.length === 1 ? part.toUpperCase() : part;
    });
}

function shortcutEventToString(event: KeyboardEvent | React.KeyboardEvent<HTMLElement>) {
  const key = event.key;
  if (["Meta", "Shift", "Alt", "Control"].includes(key)) return "";
  const normalizedKey = key === "," ? "Comma" : key === "." ? "Period" : key.length === 1 ? key.toUpperCase() : key;
  const modifiers = [
    event.metaKey ? "Meta" : "",
    event.ctrlKey ? "Control" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
  ].filter(Boolean);
  if (modifiers.length === 0) return "";
  return [...modifiers, normalizedKey].join("+");
}

function badgeTone(label: string) {
  if (/fits|ready|healthy|configured|running/i.test(label)) return "success";
  if (/slow|degraded|warning|stopped|setup|required/i.test(label)) return "warning";
  if (/offline|error|won't fit|wont_fit/i.test(label)) return "danger";
  return "default";
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "Unknown";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${bytes} B`;
}

function valueOrDash(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function localApiEndpointUrl(host: string, port: string | number) {
  const normalizedHost = host.trim() || "127.0.0.1";
  const normalizedPort = String(port || "4090").trim() || "4090";
  return `http://${normalizedHost}:${normalizedPort}/v1`;
}

function roleLabel(roleId: ModelRoleAssignment["roleId"]) {
  switch (roleId) {
    case "chatPrimary":
      return "Chat primary";
    case "chatFallback":
      return "Chat fallback";
    case "taskRouting":
      return "Task routing";
    case "agentDefault":
      return "Agent default";
    default:
      return roleId;
  }
}

function dataBoundaryLabel(dataBoundary?: string) {
  switch (dataBoundary) {
    case "local":
      return "Local";
    case "telnyx-cloud":
      return "Telnyx cloud";
    case "frontier-byo":
      return "BYO provider";
    default:
      return valueOrDash(dataBoundary);
  }
}

function isCloudMarketplaceProviderConnected(provider: ModelCenterState["providers"][number]) {
  return provider.definition.category === "cloud" && provider.config.enabled && provider.config.apiKeyConfigured && provider.config.healthy;
}

function canAssignToRole(roleId: ModelRoleAssignment["roleId"], model: CatalogModel | InstalledModel) {
  if ("health" in model && model.health.state === "error") return false;
  if ("capabilities" in model && model.capabilities.includes("embedding")) return false;
  if (roleId === "taskRouting") {
    if ("taskRoutingEligible" in model) return Boolean(model.taskRoutingEligible);
    return Boolean(model.fit?.status === "fits" || model.fit?.status === "slow");
  }
  return true;
}

function modelIdBelongsToEngine(modelId: string, engineId: string) {
  return modelId === engineId || modelId.startsWith(`${engineId}:`);
}

function copyText(value: string) {
  void navigator.clipboard.writeText(value);
}

export function SettingsView({
  tab,
  setTab,
  appShortcuts = [],
  saveAppShortcut = () => {},
  deleteAppShortcut = () => {},
  embedded = false,
}: {
  tab: string;
  setTab: (tab: string) => void;
  appShortcuts?: DesktopShortcutBinding[];
  saveAppShortcut?: (binding: DesktopShortcutBinding) => void;
  deleteAppShortcut?: (id: string) => void;
  embedded?: boolean;
}) {
  const activeTab = normalizeTab(tab);
  const [modelCenter, setModelCenter] = useState<ModelCenterState | null>(null);
  const [speakSettings, setSpeakSettings] = useState<SpeakSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [customOllamaId, setCustomOllamaId] = useState("");
  const [importName, setImportName] = useState("");
  const [providerDrafts, setProviderDrafts] = useState<Record<string, { enabled: boolean; baseUrl: string; apiKey: string; defaultModelId: string }>>({});
  const [engineDrafts, setEngineDrafts] = useState<Record<string, { enabled: boolean; baseUrl: string; defaultModelId: string; maxLoadedModels: number; timeoutSeconds: number; checkForUpdates: boolean; verifyDependencies: boolean }>>({});
  const [localApiDraft, setLocalApiDraft] = useState({ host: "127.0.0.1", port: "4090", apiKey: "", corsEnabled: false, exposedRoleIds: ["chatPrimary", "taskRouting"] as string[] });
  const [localModelsSubTab, setLocalModelsSubTab] = useState<ModelPageTab>("installed");
  const [cloudModelsSubTab, setCloudModelsSubTab] = useState<ModelPageTab>("installed");
  const [cloudCatalogProviderId, setCloudCatalogProviderId] = useState("telnyx");
  const [shortcutDraftOpen, setShortcutDraftOpen] = useState(false);
  const [shortcutDraftId, setShortcutDraftId] = useState("");
  const [shortcutDraftActionId, setShortcutDraftActionId] = useState<DesktopShortcutActionId>("open-chat");
  const [shortcutDraftValue, setShortcutDraftValue] = useState("");
  const [shortcutCaptureActive, setShortcutCaptureActive] = useState(false);

  async function refreshModelCenter() {
    setLoading(true);
    setError("");
    try {
      const [state, speak] = await Promise.all([
        linkApi.getModelCenterState(),
        linkApi.getSpeakSettings(),
      ]);
      setModelCenter(state);
      setSpeakSettings(speak);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Model Center could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSpeakShortcutMode(shortcutType: "localShortcutMode" | "cloudShortcutMode", shortcutMode: SpeakSettings["shortcutMode"]) {
    setBusyAction(`shortcut:${shortcutType}`);
    setError("");
    try {
      await linkApi.saveSpeakSettings({ [shortcutType]: shortcutMode });
      await refreshModelCenter();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Shortcut could not be saved.");
    } finally {
      setBusyAction("");
    }
  }

  useEffect(() => {
    void refreshModelCenter();
  }, []);

  useEffect(() => {
    if (!shortcutCaptureActive) return;
    function handleShortcutCapture(event: KeyboardEvent) {
      const shortcut = shortcutEventToString(event);
      if (!shortcut) return;
      event.preventDefault();
      event.stopPropagation();
      setShortcutDraftValue(shortcut);
      setShortcutCaptureActive(false);
    }
    document.addEventListener("keydown", handleShortcutCapture);
    return () => document.removeEventListener("keydown", handleShortcutCapture);
  }, [shortcutCaptureActive]);

  useEffect(() => {
    if (!modelCenter) return;
    setProviderDrafts(Object.fromEntries(modelCenter.providers.map((provider) => [
      provider.definition.id,
      {
        enabled: provider.config.enabled,
        baseUrl: provider.config.baseUrl || "",
        apiKey: "",
        defaultModelId: provider.config.defaultModelId || "",
      },
    ])));
    setEngineDrafts(Object.fromEntries(modelCenter.engines.map((engine) => [
      engine.id,
      {
        enabled: engine.enabled,
        baseUrl: engine.baseUrl || "",
        defaultModelId: engine.defaultModelId || "",
        maxLoadedModels: engine.settings.maxLoadedModels,
        timeoutSeconds: engine.settings.timeoutSeconds,
        checkForUpdates: engine.settings.checkForUpdates,
        verifyDependencies: engine.settings.verifyDependencies,
      },
    ])));
    setLocalApiDraft({
      host: modelCenter.localApiServer.host,
      port: String(modelCenter.localApiServer.port),
      apiKey: "",
      corsEnabled: modelCenter.localApiServer.corsEnabled,
      exposedRoleIds: modelCenter.localApiServer.exposedRoleIds,
    });
    if (!modelCenter.providers.some((provider) => provider.definition.id === cloudCatalogProviderId && provider.definition.category === "cloud")) {
      setCloudCatalogProviderId(modelCenter.providers.find((provider) => provider.definition.category === "cloud")?.definition.id || "telnyx");
    }
  }, [cloudCatalogProviderId, modelCenter]);

  const assignableModels = useMemo(() => {
    if (!modelCenter) return [];
    return [
      ...modelCenter.installedModels,
      ...modelCenter.catalogModels.filter((model) => !model.policy.hiddenByPolicy),
    ].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  }, [modelCenter]);

  const filteredLocalCatalogModels = useMemo(() => {
    if (!modelCenter) return [];
    const query = catalogQuery.trim().toLowerCase();
    return modelCenter.catalogModels
      .filter((model) => !model.policy.hiddenByPolicy && model.providerId === "ollama")
      .filter((model) => !query || `${model.label} ${model.description} ${model.capabilities.join(" ")} ${model.providerId}`.toLowerCase().includes(query))
      .sort((left, right) => Number(right.recommended) - Number(left.recommended) || left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  }, [catalogQuery, modelCenter]);

  const filteredCloudCatalogModels = useMemo(() => {
    if (!modelCenter) return [];
    const query = catalogQuery.trim().toLowerCase();
    return modelCenter.catalogModels
      .filter((model) => !model.policy.hiddenByPolicy && model.providerId === cloudCatalogProviderId)
      .filter((model) => !query || `${model.label} ${model.description} ${model.capabilities.join(" ")} ${model.providerId}`.toLowerCase().includes(query))
      .sort((left, right) => Number(right.recommended) - Number(left.recommended) || left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  }, [catalogQuery, cloudCatalogProviderId, modelCenter]);

  const filteredCatalogModels = useMemo(() => {
    if (!modelCenter) return [];
    const query = catalogQuery.trim().toLowerCase();
    return modelCenter.catalogModels
      .filter((model) => !model.policy.hiddenByPolicy)
      .filter((model) => !query || `${model.label} ${model.description} ${model.capabilities.join(" ")} ${model.providerId}`.toLowerCase().includes(query))
      .sort((left, right) => Number(right.recommended) - Number(left.recommended) || left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  }, [catalogQuery, modelCenter]);

  async function runAction(actionId: string, action: () => Promise<ModelCenterState>) {
    setBusyAction(actionId);
    setError("");
    try {
      const next = await action();
      setModelCenter(next);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Model Center action failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function saveProvider(providerId: string) {
    const draft = providerDrafts[providerId];
    if (!draft) return;
    await runAction(`save-provider:${providerId}`, () => linkApi.saveProviderConfig({
      providerId,
      enabled: draft.enabled,
      baseUrl: draft.baseUrl,
      apiKey: draft.apiKey || undefined,
      defaultModelId: draft.defaultModelId,
    }));
  }

  async function saveEngine(engineId: string) {
    const draft = engineDrafts[engineId];
    if (!draft) return;
    await runAction(`save-engine:${engineId}`, () => linkApi.saveProviderConfig({
      providerId: engineId,
      enabled: draft.enabled,
      baseUrl: draft.baseUrl,
      defaultModelId: draft.defaultModelId,
      engineSettings: {
        maxLoadedModels: draft.maxLoadedModels,
        timeoutSeconds: draft.timeoutSeconds,
        checkForUpdates: draft.checkForUpdates,
        verifyDependencies: draft.verifyDependencies,
      },
    }));
  }

  async function assignRole(roleId: ModelRoleAssignment["roleId"], event: ChangeEvent<HTMLSelectElement>) {
    await runAction(`assign-role:${roleId}`, () => linkApi.assignModelRole({ roleId, modelId: event.target.value }));
  }

  function renderModelPageTabs(
    activeSubTab: ModelPageTab,
    setActiveSubTab: (tab: ModelPageTab) => void,
    label: string,
  ) {
    return (
      <div className="designTabs modelCenterDesignTabs" role="tablist" aria-label={label}>
        {modelPageTabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeSubTab === item.id}
              className={activeSubTab === item.id ? "selected" : ""}
              onClick={() => setActiveSubTab(item.id)}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderRolePicker(roleId: ModelRoleAssignment["roleId"], assignment: ModelCenterState["roles"][ModelRoleAssignment["roleId"]]) {
    return (
      <section className="modelCenterCard">
        <header className="modelCenterCardHeader">
          <div>
            <h3>{roleLabel(roleId)}</h3>
            <p>{assignment?.dataBoundary ? `Current boundary: ${assignment.dataBoundary}` : "No model assigned yet."}</p>
          </div>
        </header>
        <label className="modelCenterField">
          <span>Assigned model</span>
          <select value={assignment?.modelId || ""} onChange={(event) => void assignRole(roleId, event)}>
            <option value="">Select a model</option>
            {assignableModels.filter((model) => canAssignToRole(roleId, model)).map((model) => (
              <option key={model.id} value={model.id}>{model.label}</option>
            ))}
          </select>
        </label>
        {assignment && (
          <div className="modelCenterMetaGrid">
            <div>
              <strong>Provider</strong>
              <span>{assignment.providerId}</span>
            </div>
            <div>
              <strong>Route</strong>
              <span>{assignment.routeId}</span>
            </div>
          </div>
        )}
      </section>
    );
  }

  function modelForRoute(route: AiModelRoute) {
    if (!modelCenter) return null;
    const candidates = [
      route.targetModel,
      route.modelName,
      route.id.replace(/^local\/model\//, ""),
      route.id,
    ].filter(Boolean).map((candidate) => candidate!.toLowerCase());
    return assignableModels.find((model) => {
      const modelCandidates = [
        model.id,
        model.label,
        model.providerId,
        "externalId" in model ? model.externalId : "",
        "variants" in model ? model.variants.map((variant) => variant.externalId).join(" ") : "",
      ].filter(Boolean).join(" ").toLowerCase();
      return candidates.some((candidate) => modelCandidates.includes(candidate) || candidate.includes(model.id.toLowerCase()));
    }) ?? null;
  }

  async function assignRouteToRole(route: AiModelRoute, roleId: ModelRoleAssignment["roleId"]) {
    const model = modelForRoute(route);
    if (!model || !canAssignToRole(roleId, model)) return;
    await runAction(`assign-route:${roleId}:${route.id}`, () => linkApi.assignModelRole({ roleId, modelId: model.id }));
  }

  function routeActionRoles(route: AiModelRoute): ModelRoleAssignment["roleId"][] {
    if (route.id === "auto/ask-before-cloud") return ["chatPrimary"];
    if (route.id === "auto/local-only") return ["chatFallback"];
    if (route.id === "role/task-routing") return ["taskRouting"];
    if (route.id === "role/agent-default") return ["agentDefault"];
    return ["chatPrimary", "chatFallback"];
  }

  function renderRouteSummarySection() {
    if (!modelCenter) return null;
    const routes = [...modelCenter.routes].sort((left, right) => {
      const boundaryCompare = left.dataBoundary.localeCompare(right.dataBoundary);
      return boundaryCompare || left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
    });
    return (
      <section className="modelCenterCard">
        <header className="modelCenterCardHeader">
          <div>
            <h3>Route inventory</h3>
            <p>Review every model route Cloud Link can use, then assign useful routes to chat, fallback, task routing, or agent defaults.</p>
          </div>
          <button className="button secondary" type="button" onClick={() => void refreshModelCenter()}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </header>
        <div className="modelCenterRouteList">
          {routes.map((route) => {
            const routeModel = modelForRoute(route);
            const actionRoles = routeActionRoles(route).filter((roleId) => routeModel && canAssignToRole(roleId, routeModel));
            return (
              <div key={route.id} className="modelCenterRouteRow modelCenterRouteRowActionable">
                <div className="modelCenterRoutePrimary">
                  <strong>{route.label}</strong>
                  <small>{route.description}</small>
                  <div className="modelCenterRouteFacts">
                    <span>
                      <b>Route</b>
                      <code>{route.id}</code>
                    </span>
                    <span>
                      <b>Model</b>
                      <em>{routeModel?.label || route.modelName}</em>
                    </span>
                    <span>
                      <b>Provider</b>
                      <em>{route.provider}</em>
                    </span>
                  </div>
                </div>
                <div className="modelCenterRouteMeta">
                  <StatusBadge>{route.available ? "Ready" : "Needs setup"}</StatusBadge>
                  <StatusBadge>{dataBoundaryLabel(route.dataBoundary)}</StatusBadge>
                </div>
                <div className="modelCenterRouteActions">
                  {actionRoles.map((roleId) => {
                    const assigned = modelCenter.roles[roleId]?.modelId === routeModel?.id;
                    return (
                      <button
                        key={roleId}
                        className={assigned ? "button primary" : "button secondary"}
                        type="button"
                        onClick={() => void assignRouteToRole(route, roleId)}
                        disabled={busyAction !== "" || assigned}
                      >
                        {assigned && <Check size={14} />}
                        {assigned ? "Assigned" : `Set ${roleLabel(roleId).toLowerCase()}`}
                      </button>
                    );
                  })}
                  {actionRoles.length === 0 && <StatusBadge>{routeModel ? "Not role eligible" : "Model unavailable"}</StatusBadge>}
                </div>
              </div>
            );
          })}
          {routes.length === 0 && <EmptyState title="No routes yet" body="Refresh model routing or install a model from Available." />}
        </div>
      </section>
    );
  }

  function renderInstalledLocalModelsSection() {
    if (!modelCenter) return null;
    return (
      <div className="modelCenterStack">
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Installed Local Models</h3>
              <p>Inventory from the active local engine with fit, health, and removal controls.</p>
            </div>
            <div className="modelCenterHeaderActions">
              <button className="button secondary" type="button" onClick={() => void runAction("import-gguf", () => linkApi.importLocalModel())}>
                <Upload size={14} />
                Import GGUF
              </button>
            </div>
          </header>
          <div className="modelCenterTable">
            {modelCenter.installedModels.map((model) => (
              <div key={model.id} className="modelCenterTableRow">
                <div>
                  <strong>{model.label}</strong>
                  <small>{model.externalId}</small>
                </div>
                <span>{formatBytes(model.sizeBytes)}</span>
                <StatusBadge>{model.fit?.label || model.health.message}</StatusBadge>
                <div className="modelCenterInlineActions">
                  <button className="button ghost" type="button" onClick={() => void runAction(`remove:${model.id}`, () => linkApi.removeLocalModel({ modelId: model.id, externalId: model.externalId }))}>
                    <Trash2 size={14} />
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {modelCenter.installedModels.length === 0 && <EmptyState title="No local models yet" body="Install a curated Ollama model from Available or import a local GGUF file." />}
          </div>
        </section>
      </div>
    );
  }

  function renderCatalogSection(scope: "local" | "cloud") {
    if (!modelCenter) return null;
    const cloudProviders = modelCenter.providers.filter((provider) => provider.definition.category === "cloud");
    const selectedCloudProvider = cloudProviders.find((provider) => provider.definition.id === cloudCatalogProviderId) || cloudProviders[0] || null;
    const selectedCloudProviderConnected = selectedCloudProvider ? isCloudMarketplaceProviderConnected(selectedCloudProvider) : false;
    const models = scope === "local" ? filteredLocalCatalogModels : selectedCloudProviderConnected ? filteredCloudCatalogModels : [];
    return (
      <section className="modelCenterCard">
        <header className="modelCenterCardHeader">
          <div>
            <h3>{scope === "local" ? "Local model catalog" : "Cloud model catalog"}</h3>
            <p>{scope === "local" ? "Find or install models that run on this Mac." : "Find hosted models available from cloud providers."}</p>
          </div>
          {scope === "cloud" ? (
            <div className="modelCenterCatalogControls">
              <label className="modelCenterProviderSelect">
                <span>Provider</span>
                <select value={selectedCloudProvider?.definition.id || ""} onChange={(event) => setCloudCatalogProviderId(event.target.value)} disabled={cloudProviders.length === 0}>
                  {cloudProviders.map((provider) => (
                    <option key={provider.definition.id} value={provider.definition.id}>
                      {provider.definition.label} · {isCloudMarketplaceProviderConnected(provider) ? "Connected" : "Needs setup"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="modelCenterCatalogSearch">
                <Search size={17} />
                <input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search models, roles, or capabilities" />
              </label>
            </div>
          ) : (
            <label className="modelCenterCatalogSearch">
              <Search size={17} />
              <input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search models, roles, or capabilities" />
            </label>
          )}
        </header>
        {scope === "local" && (
          <div className="modelCenterImportRow">
            <span className="modelCenterImportLabel">Advanced install</span>
            <div className="modelCenterImportGroup">
              <input value={customOllamaId} onChange={(event) => setCustomOllamaId(event.target.value)} placeholder="Custom Ollama id" />
              <button className="button secondary" type="button" onClick={() => void runAction("pull-custom", () => linkApi.pullLocalModel({ externalId: customOllamaId }))} disabled={!customOllamaId.trim()}>
                <Upload size={14} />
                Install custom model
              </button>
            </div>
            <div className="modelCenterImportGroup">
              <input value={importName} onChange={(event) => setImportName(event.target.value)} placeholder="Imported model name" />
              <button className="button ghost" type="button" onClick={() => void runAction("import-gguf", () => linkApi.importLocalModel({ name: importName }))} disabled={!importName.trim()}>
                <FolderOpen size={14} />
                Import GGUF
              </button>
            </div>
          </div>
        )}
        <div className="modelCenterCatalogList">
          {scope === "cloud" && !selectedCloudProvider && (
            <EmptyState title="No cloud providers available" body="Add or refresh a cloud provider before browsing hosted models." />
          )}
          {scope === "cloud" && selectedCloudProvider && !selectedCloudProviderConnected && (
            <section className="modelCenterCatalogNotice">
              <div>
                <strong>Connect {selectedCloudProvider.definition.label} to view available models</strong>
                <p>{selectedCloudProvider.config.message || `Enable ${selectedCloudProvider.definition.label} and save an API key before browsing its marketplace catalog.`}</p>
              </div>
              <button className="button secondary" type="button" onClick={() => setCloudModelsSubTab("installed")}>
                Open Installed
              </button>
            </section>
          )}
          {models.map((model) => {
            const installed = modelCenter.installedModels.some((installedModel) => installedModel.id === model.id);
            return (
              <article key={model.id} className="modelCenterCatalogRow">
                <div>
                  <div className="modelCenterCatalogHeading">
                    <strong>{model.label}</strong>
                    {model.recommended && <StatusBadge>Recommended</StatusBadge>}
                    {model.policy.mcpSafe && <StatusBadge>Tool-safe</StatusBadge>}
                  </div>
                  <p>{model.description}</p>
                  <small>{model.capabilities.join(" · ") || "No capability tags"}</small>
                </div>
                <div className="modelCenterCatalogActions">
                  <span>{formatBytes(model.variants[0]?.sizeBytes)}</span>
                  {scope === "local" ? (
                    installed ? (
                      <StatusBadge>Installed</StatusBadge>
                    ) : (
                      <button className="button primary" type="button" onClick={() => void runAction(`pull:${model.id}`, () => linkApi.pullLocalModel({ modelId: model.id, externalId: model.variants[0]?.externalId }))}>
                        Install
                      </button>
                    )
                  ) : (
                    <StatusBadge>{model.providerId}</StatusBadge>
                  )}
                </div>
              </article>
            );
          })}
          {(scope === "local" || selectedCloudProviderConnected) && models.length === 0 && (
            <EmptyState
              title="No models match this search"
              body={scope === "local" ? "Clear the search field or refresh the model catalog." : `Clear the search field or refresh ${selectedCloudProvider?.definition.label || "this provider"} models.`}
            />
          )}
        </div>
      </section>
    );
  }

  function formatShortcutKeys(keys: string[]) {
    return (
      <div className="modelCenterShortcutKeys" aria-label={keys.join(" + ")}>
        {keys.map((key) => <kbd key={key}>{key}</kbd>)}
      </div>
    );
  }

  function openNewShortcutDraft() {
    setError("");
    setShortcutDraftOpen(true);
    setShortcutDraftId("");
    setShortcutDraftActionId("open-chat");
    setShortcutDraftValue("");
    setShortcutCaptureActive(false);
  }

  function openExistingShortcutDraft(binding: DesktopShortcutBinding) {
    setError("");
    setShortcutDraftOpen(true);
    setShortcutDraftId(binding.id);
    setShortcutDraftActionId(binding.actionId);
    setShortcutDraftValue(binding.shortcut);
    setShortcutCaptureActive(false);
  }

  function closeShortcutDraft() {
    setShortcutDraftOpen(false);
    setShortcutDraftId("");
    setShortcutDraftValue("");
    setShortcutCaptureActive(false);
  }

  function persistShortcutDraft() {
    if (!shortcutDraftValue) return;
    setError("");
    const duplicate = appShortcuts.find((binding) => binding.shortcut === shortcutDraftValue && binding.id !== shortcutDraftId);
    if (duplicate) {
      setError(`Shortcut ${formatShortcutParts(shortcutDraftValue).join("+")} is already assigned.`);
      return;
    }
    saveAppShortcut({
      id: shortcutDraftId || `shortcut-${Date.now()}`,
      actionId: shortcutDraftActionId,
      shortcut: shortcutDraftValue,
    });
    closeShortcutDraft();
  }

  function renderShortcutsTab() {
    const localDictationShortcut = speakSettings?.localShortcutMode === "cmd-shift-l"
      ? ["Cmd", "Shift", "L"]
      : ["Hold", "fn"];
    const cloudDictationShortcut = speakSettings?.cloudShortcutMode === "cmd-shift-l"
      ? ["Cmd", "Shift", "L"]
      : ["Hold", "fn"];
    const sections = [
      {
        title: "App",
        rows: appShortcuts.map((binding) => {
          const meta = desktopShortcutActionMeta(binding.actionId);
          return {
            id: binding.id,
            label: meta.label,
            keys: formatShortcutParts(binding.shortcut),
            editable: true,
            actionId: binding.actionId,
            shortcut: binding.shortcut,
          };
        }),
      },
      {
        title: "Chat",
        rows: [
          { label: "Send Message", keys: ["Enter"] },
          { label: "New Line", keys: ["Shift", "Enter"] },
        ],
      },
      {
        title: "Scribe",
        rows: [
          {
            label: "Local Dictation",
            keys: localDictationShortcut,
            shortcutType: "localShortcutMode",
          },
          {
            label: "Cloud Dictation",
            keys: cloudDictationShortcut,
            shortcutType: "cloudShortcutMode",
          },
        ],
      },
      {
        title: "Navigation",
        rows: [
          { label: "Rail Navigation", keys: ["Click", "Rail"] },
          { label: "Model Center", keys: ["Click", "Sections"] },
        ],
      },
    ] as const;

    return (
      <div className="modelCenterStack modelCenterShortcutsPage">
        <section className="modelCenterCard modelCenterShortcutsCard">
          <div className="modelCenterShortcutTopbar">
            <button className="button primary" type="button" onClick={openNewShortcutDraft}>
              <Plus size={14} />
              New Shortcut
            </button>
          </div>
          {shortcutDraftOpen && (
            <div className="modelCenterShortcutComposer">
              <label className="modelCenterField">
                <span>Action</span>
                <select value={shortcutDraftActionId} onChange={(event) => setShortcutDraftActionId(event.target.value as DesktopShortcutActionId)}>
                  {desktopShortcutActions.map((action) => (
                    <option key={action.id} value={action.id}>{action.label}</option>
                  ))}
                </select>
              </label>
              <div className="modelCenterField">
                <span>Shortcut</span>
                <button
                  className={`button secondary modelCenterShortcutCapture ${shortcutCaptureActive ? "capturing" : ""}`}
                  type="button"
                  data-shortcut-capture="true"
                  onClick={() => setShortcutCaptureActive(true)}
                >
                  {shortcutCaptureActive
                    ? "Press shortcut..."
                    : shortcutDraftValue
                      ? formatShortcutParts(shortcutDraftValue).join(" + ")
                      : "Record shortcut"}
                </button>
              </div>
              <div className="modelCenterInlineActions">
                <button className="button primary" type="button" onClick={persistShortcutDraft} disabled={!shortcutDraftValue}>
                  <Check size={14} />
                  Save
                </button>
                <button className="button secondary" type="button" onClick={closeShortcutDraft}>
                  <X size={14} />
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="modelCenterShortcutGroups">
            {sections.map((section) => (
              <section key={section.title} className="modelCenterShortcutGroup" aria-label={section.title}>
                <h3 className="modelCenterSectionLabel modelCenterShortcutSectionLabel">{section.title}</h3>
                <div className="modelCenterShortcutList compact">
                  {section.rows.map((row) => (
                    <div key={row.label} className="modelCenterShortcutRow compact">
                      <div>
                        <strong>{row.label}</strong>
                      </div>
                      <div className="modelCenterShortcutRowActions">
                        {"shortcutType" in row ? (
                          <label className="modelCenterShortcutSelect">
                            <select
                              value={row.shortcutType === "localShortcutMode" ? speakSettings?.localShortcutMode ?? "hold-fn" : speakSettings?.cloudShortcutMode ?? "cmd-shift-l"}
                              onChange={(event) => void saveSpeakShortcutMode(row.shortcutType, event.target.value as SpeakSettings["shortcutMode"])}
                              disabled={busyAction !== ""}
                            >
                              <option value="hold-fn">Hold fn</option>
                              <option value="cmd-shift-l">Cmd+Shift+L</option>
                            </select>
                          </label>
                        ) : formatShortcutKeys([...row.keys])}
                        {"editable" in row && row.editable && "id" in row && (
                          <>
                            <button className="iconButton" type="button" aria-label={`Edit ${row.label}`} onClick={() => openExistingShortcutDraft({ id: row.id, actionId: row.actionId, shortcut: row.shortcut })}>
                              <Pencil size={14} />
                            </button>
                            <button className="iconButton" type="button" aria-label={`Delete ${row.label}`} onClick={() => deleteAppShortcut(row.id)}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {section.title === "App" && section.rows.length === 0 && (
                    <div className="modelCenterShortcutEmpty">No app shortcuts yet. Add one to open Cloud Link pages from the keyboard.</div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderProvidersCards(providers: Array<{ definition: ProviderDefinition; config: ProviderConfig; models: CatalogModel[] }>) {
    return (
      <div className="modelCenterStack">
        {providers.map((provider) => {
          const draft = providerDrafts[provider.definition.id];
          return (
            <details key={provider.definition.id} className="modelCenterCard modelCenterProviderCard">
              <summary className="modelCenterProviderSummary">
                <div>
                  <h3>{provider.definition.label}</h3>
                  <p>{provider.definition.description}</p>
                </div>
                <div className="modelCenterProviderSummaryActions">
                  <StatusBadge>{provider.config.healthy ? "Healthy" : "Needs setup"}</StatusBadge>
                  <ChevronDown size={18} aria-hidden="true" />
                </div>
              </summary>
              <div className="modelCenterProviderDetails">
                <label className="modelCenterToggle">
                  <span>Enabled</span>
                  <input type="checkbox" checked={draft?.enabled ?? provider.config.enabled} onChange={(event) => setProviderDrafts((current) => ({ ...current, [provider.definition.id]: { ...(current[provider.definition.id] || { enabled: false, baseUrl: "", apiKey: "", defaultModelId: "" }), enabled: event.target.checked } }))} />
                </label>
                <label className="modelCenterField">
                  <span>Base URL</span>
                  <input value={draft?.baseUrl ?? provider.config.baseUrl ?? ""} onChange={(event) => setProviderDrafts((current) => ({ ...current, [provider.definition.id]: { ...(current[provider.definition.id] || { enabled: false, baseUrl: "", apiKey: "", defaultModelId: "" }), baseUrl: event.target.value } }))} />
                </label>
                <label className="modelCenterField">
                  <span>API key</span>
                  <input value={draft?.apiKey ?? ""} onChange={(event) => setProviderDrafts((current) => ({ ...current, [provider.definition.id]: { ...(current[provider.definition.id] || { enabled: false, baseUrl: "", apiKey: "", defaultModelId: "" }), apiKey: event.target.value } }))} placeholder={provider.config.apiKeyConfigured ? "Configured. Enter a new key to rotate it." : "Paste API key"} />
                </label>
                <label className="modelCenterField">
                  <span>Default model</span>
                  <input value={draft?.defaultModelId ?? provider.config.defaultModelId ?? ""} onChange={(event) => setProviderDrafts((current) => ({ ...current, [provider.definition.id]: { ...(current[provider.definition.id] || { enabled: false, baseUrl: "", apiKey: "", defaultModelId: "" }), defaultModelId: event.target.value } }))} />
                </label>
                <div className="modelCenterInlineActions">
                  <button className="button secondary" type="button" onClick={() => void saveProvider(provider.definition.id)} disabled={busyAction === `save-provider:${provider.definition.id}`}>
                    Save
                  </button>
                  <button className="button ghost" type="button" onClick={() => void runAction(`refresh-provider:${provider.definition.id}`, () => linkApi.refreshProviderModels({ providerId: provider.definition.id }))}>
                    Refresh models
                  </button>
                </div>
                <div className="modelCenterProviderModels">
                  {provider.models.slice(0, 6).map((model) => (
                    <div key={model.id} className="modelCenterProviderModelRow">
                      <strong>{model.label}</strong>
                      <small>{model.capabilities.join(" · ") || provider.definition.label}</small>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  function renderLocalEngineCards() {
    if (!modelCenter) return null;
    return (
      <div className="modelCenterStack">
        {modelCenter.engines.map((engine) => {
          const draft = engineDrafts[engine.id];
          const selectedModelId = draft?.defaultModelId ?? engine.defaultModelId ?? "";
          const localModelOptions = [
            ...modelCenter.installedModels
              .filter((model) => modelIdBelongsToEngine(model.id, engine.id) || model.providerId === engine.id)
              .map((model) => ({ id: model.id, label: model.label })),
            ...modelCenter.catalogModels
              .filter((model) => modelIdBelongsToEngine(model.id, engine.id) || model.providerId === engine.id)
              .map((model) => ({ id: model.id, label: model.label })),
          ].filter((model, index, models) => models.findIndex((candidate) => candidate.id === model.id) === index);
          const modelSelectOptions = selectedModelId && !localModelOptions.some((model) => model.id === selectedModelId)
            ? [{ id: selectedModelId, label: selectedModelId }, ...localModelOptions]
            : localModelOptions;
          return (
            <section key={engine.id} className="modelCenterCard">
              <header className="modelCenterCardHeader">
                <div>
                  <h3>{engine.definition.label}</h3>
                  <p>{engine.message}</p>
                </div>
                <StatusBadge>{engine.ready ? "Ready" : engine.reachable ? "Reachable" : "Offline"}</StatusBadge>
              </header>
              <div className="modelCenterMetaGrid modelCenterStatusGrid">
                <div>
                  <strong>Endpoint</strong>
                  <span>{engine.baseUrl || "Not configured"}</span>
                </div>
                <div>
                  <strong>Installed models</strong>
                  <span>{engine.discoveredModelCount}</span>
                </div>
              </div>
              <label className="modelCenterField">
                <span>Default local model</span>
                <select value={selectedModelId} onChange={(event) => setEngineDrafts((current) => ({ ...current, [engine.id]: { ...(current[engine.id] || { enabled: engine.enabled, baseUrl: engine.baseUrl || "", defaultModelId: "", maxLoadedModels: engine.settings.maxLoadedModels, timeoutSeconds: engine.settings.timeoutSeconds, checkForUpdates: engine.settings.checkForUpdates, verifyDependencies: engine.settings.verifyDependencies }), defaultModelId: event.target.value } }))}>
                  <option value="">Select a local model</option>
                  {modelSelectOptions.map((model) => (
                    <option key={model.id} value={model.id}>{model.label}</option>
                  ))}
                </select>
              </label>
              <div className="modelCenterInlineActions">
                <button className="button secondary" type="button" onClick={() => void saveEngine(engine.id)} disabled={!draft}>
                  Save
                </button>
                <button className="button ghost" type="button" onClick={() => void runAction(`refresh-engine:${engine.id}`, () => linkApi.refreshProviderModels({ providerId: engine.id }))}>
                  Refresh engine
                </button>
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  function renderLocalModelsTab() {
    if (!modelCenter) return null;
    return (
      <div className="modelCenterStack">
        {renderModelPageTabs(localModelsSubTab, setLocalModelsSubTab, "Local model sections")}
        {localModelsSubTab === "installed" && renderInstalledLocalModelsSection()}
        {localModelsSubTab === "available" && (
          <>
            {renderCatalogSection("local")}
            {renderLocalEngineCards()}
          </>
        )}
      </div>
    );
  }

  function renderCloudModelsTab() {
    if (!modelCenter) return null;
    return (
      <div className="modelCenterStack">
        {renderModelPageTabs(cloudModelsSubTab, setCloudModelsSubTab, "Cloud model sections")}
        {cloudModelsSubTab === "installed" && renderProvidersCards(modelCenter.providers)}
        {cloudModelsSubTab === "available" && renderCatalogSection("cloud")}
      </div>
    );
  }

  function renderLocalApiTab() {
    if (!modelCenter) return null;
    const selectedRoleLabels = localApiDraft.exposedRoleIds.map((roleId) => roleLabel(roleId as ModelRoleAssignment["roleId"]));
    const configuredEndpoint = modelCenter.localApiServer.endpoint || localApiEndpointUrl(localApiDraft.host, localApiDraft.port);
    const hasSelectedRoles = localApiDraft.exposedRoleIds.length > 0;
    return (
      <div className="modelCenterStack">
        <section className="modelCenterHero modelCenterApiIntro">
          <div>
            <h2>Let apps on this Mac use your selected models.</h2>
            <p>Turn this on when another app asks for an OpenAI-compatible API URL. Choose which model roles are available, set an API key if you want one, then start the server.</p>
          </div>
          <div className="modelCenterSetupSteps" aria-label="API Server setup steps">
            <div>
              <strong>1</strong>
              <span>Choose models in Routing.</span>
            </div>
            <div>
              <strong>2</strong>
              <span>Select the roles apps can use here.</span>
            </div>
            <div>
              <strong>3</strong>
              <span>Start the server and copy the API URL.</span>
            </div>
          </div>
        </section>
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Server</h3>
              <p>Runs only on this Mac. Other devices cannot reach it unless you change the host.</p>
            </div>
            <div className="modelCenterHeaderActions">
              <StatusBadge>{modelCenter.localApiServer.running ? "Running" : "Stopped"}</StatusBadge>
              <button className="button primary" type="button" onClick={() => void runAction("start-local-api", () => linkApi.startLocalApiServer({
                host: localApiDraft.host,
                port: Number(localApiDraft.port),
                apiKey: localApiDraft.apiKey || undefined,
                corsEnabled: localApiDraft.corsEnabled,
                exposedRoleIds: localApiDraft.exposedRoleIds,
              }))}>
                Start
              </button>
              <button className="button ghost" type="button" onClick={() => void runAction("stop-local-api", () => linkApi.stopLocalApiServer())}>
                Stop
              </button>
            </div>
          </header>
          <div className="modelCenterSectionLabel">Connection</div>
          <div className="modelCenterSplitFields">
            <label className="modelCenterField">
              <span>Host on this Mac</span>
              <input value={localApiDraft.host} onChange={(event) => setLocalApiDraft((current) => ({ ...current, host: event.target.value }))} />
            </label>
            <label className="modelCenterField">
              <span>Port</span>
              <input value={localApiDraft.port} onChange={(event) => setLocalApiDraft((current) => ({ ...current, port: event.target.value }))} />
            </label>
          </div>
          <label className="modelCenterField">
            <span>API key</span>
            <input value={localApiDraft.apiKey} onChange={(event) => setLocalApiDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder={modelCenter.localApiServer.apiKeyConfigured ? "Already set. Enter a new key to replace it." : "Optional, but recommended"} />
          </label>

          <div className="modelCenterMetaGrid modelCenterStatusGrid modelCenterApiSummary">
            <div>
              <strong>API URL</strong>
              <span>{valueOrDash(configuredEndpoint)}</span>
              {configuredEndpoint !== "—" && (
                <button className="button ghost" type="button" onClick={() => copyText(configuredEndpoint)}>
                  Copy
                </button>
              )}
            </div>
            <div>
              <strong>Available to apps</strong>
              <span>{selectedRoleLabels.join(", ") || "No model roles selected"}</span>
            </div>
          </div>
        </section>

        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Choose what apps can use</h3>
              <p>Only checked items are available through the API. Leave a role unchecked if you do not want outside apps to call it.</p>
            </div>
            <StatusBadge>{hasSelectedRoles ? `${selectedRoleLabels.length} selected` : "None selected"}</StatusBadge>
          </header>
          <div className="modelCenterOptionList">
            <label className="modelCenterToggleRow">
              <div>
                <strong>Allow browser apps</strong>
                <small>Turn this on only when a browser-based tool on this Mac needs to call the API.</small>
              </div>
              <input type="checkbox" checked={localApiDraft.corsEnabled} onChange={(event) => setLocalApiDraft((current) => ({ ...current, corsEnabled: event.target.checked }))} />
            </label>
            {(["chatPrimary", "chatFallback", "taskRouting", "agentDefault"] as const).map((roleId) => (
              <label key={roleId} className="modelCenterToggleRow compact">
                <div>
                  <strong>{roleLabel(roleId)}</strong>
                  <small>{roleId === "chatPrimary" ? "The main chat model for most requests." : roleId === "chatFallback" ? "Backup model if the main chat route is unavailable." : roleId === "taskRouting" ? "Small model used to decide where work should go." : "Default model for agent workflows."}</small>
                </div>
                <input
                  type="checkbox"
                  checked={localApiDraft.exposedRoleIds.includes(roleId)}
                  onChange={(event) => setLocalApiDraft((current) => ({
                    ...current,
                    exposedRoleIds: event.target.checked
                      ? [...current.exposedRoleIds, roleId]
                      : current.exposedRoleIds.filter((candidate) => candidate !== roleId),
                  }))}
                />
              </label>
            ))}
          </div>
        </section>
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Server Logs</h3>
              <p>Requests are rejected when no eligible local or self-hosted role is exposed.</p>
            </div>
            <Plug size={18} />
          </header>
          <pre className="modelCenterLogPanel">{modelCenter.localApiServer.logs.join("\n") || "No local API log lines yet."}</pre>
        </section>
      </div>
    );
  }

  function renderMcpRoutingTab() {
    if (!modelCenter) return null;
    return (
      <div className="modelCenterStack">
        {renderRolePicker("chatPrimary", modelCenter.roles.chatPrimary)}
        {renderRolePicker("chatFallback", modelCenter.roles.chatFallback)}
        {renderRolePicker("taskRouting", modelCenter.roles.taskRouting)}
        {renderRolePicker("agentDefault", modelCenter.roles.agentDefault)}
        {renderRouteSummarySection()}
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Model routing policy</h3>
              <p>Choose the model roles used for task routing and default agent work.</p>
            </div>
            <GitBranch size={18} />
          </header>
          <ul className="modelCenterChecklist">
            <li>Only lightweight routing-eligible models appear in the task-routing picker.</li>
            <li>Tool-safe badges come from the Telnyx registry metadata layer.</li>
            <li>ACP-hosted agents do not inherit desktop role overrides.</li>
            <li>Fallback chains are derived from curated model policy, not raw route ids.</li>
          </ul>
          <div className="modelCenterRouteDefinitions">
            <h4>Route meanings</h4>
            <div>
              <code>auto/ask-before-cloud</code>
              <span>Primary chat route. Uses the assigned chat model and asks before crossing into cloud fallback behavior.</span>
            </div>
            <div>
              <code>auto/local-only</code>
              <span>Local fallback route. Keeps fallback chat work on a local model when one is available.</span>
            </div>
            <div>
              <code>role/task-routing</code>
              <span>Tool routing route. Uses a lightweight model to choose tools and route background tasks.</span>
            </div>
            <div>
              <code>role/agent-default</code>
              <span>Agent default route. Used by agents that do not provide their own model setting.</span>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderDiagnosticsTab() {
    if (!modelCenter) return null;
    const activeAssignments = (["chatPrimary", "chatFallback", "taskRouting", "agentDefault"] as const).map((roleId) => ({
      roleId,
      assignment: modelCenter.roles[roleId],
    }));
    return (
      <div className="modelCenterStack">
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Run diagnostics</h3>
            </div>
          </header>
          <div className="modelCenterDiagnosticActions">
            <button
              className="button primary"
              type="button"
              onClick={() => void runAction("diagnostics-routes", () => linkApi.refreshProviderModels())}
              disabled={busyAction !== ""}
            >
              <RefreshCw size={14} />
              Check routes
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => void runAction("diagnostics-fit", () => linkApi.refreshFit())}
              disabled={busyAction !== ""}
            >
              <HardDrive size={14} />
              Check local fit
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => void refreshModelCenter()}
              disabled={busyAction !== ""}
            >
              <Activity size={14} />
              Refresh status
            </button>
          </div>
        </section>
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Active models</h3>
            </div>
          </header>
          <div className="modelCenterRouteList">
            {activeAssignments.map(({ roleId, assignment }) => (
              <div key={roleId} className="modelCenterRouteRow">
                <div>
                  <strong>{roleLabel(roleId)}</strong>
                  {assignment ? (
                    <div className="modelCenterActiveModelMeta">
                      <span>
                        <b>Provider</b>
                        <em>{assignment.providerId}</em>
                      </span>
                      <span>
                        <b>Location</b>
                        <em>{dataBoundaryLabel(assignment.dataBoundary)}</em>
                      </span>
                      <span>
                        <b>Route</b>
                        <em>{assignment.routeId}</em>
                      </span>
                    </div>
                  ) : (
                    <small>No model assigned</small>
                  )}
                </div>
                <StatusBadge>{assignment?.label || "Unassigned"}</StatusBadge>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const showEmbeddedHeader = !(embedded && activeTab === "shortcuts");
  const modelRoutesNeedSetup = Boolean(modelCenter?.overview.routeSummary.toLowerCase().includes("no model routes"));

  const header = (
    <header className="modelCenterHeader">
      <div>
        <h2>{tabs.find((candidate) => candidate.id === activeTab)?.label || "Settings"}</h2>
      </div>
      <div className="modelCenterHeaderMeta">
        {embedded && (
          <button className="button ghost" type="button" onClick={() => void refreshModelCenter()} disabled={loading}>
            <RefreshCw size={14} />
            Refresh
          </button>
        )}
        {modelCenter && !modelRoutesNeedSetup && <StatusBadge>{modelCenter.overview.routeSummary}</StatusBadge>}
      </div>
    </header>
  );

  const content = (
    <>
      {error && <div className="modelCenterError">{error}</div>}
      {modelCenter && modelRoutesNeedSetup && (
        <section className="phoneSetupAlert modelCenterRouteSetupAlert">
          <div>
            <strong>No model routes are ready yet.</strong>
            <p>Assign a local or cloud model to a role before chat, agents, and tools can use model routing.</p>
          </div>
          <button className="runtimeSettingsButton" type="button" onClick={() => setTab("mcp-routing")}>
            Open Routing
          </button>
        </section>
      )}
      {loading && !modelCenter && <EmptyState title="Loading Model Center" body="Fetching engines, providers, installed models, and role assignments." />}
      {!loading && !modelCenter && !error && <EmptyState title="Model Center unavailable" body="Cloud Link could not build the runtime manager state." />}

      {modelCenter && (
        <>
          {activeTab === "shortcuts" && renderShortcutsTab()}
          {activeTab === "local-models" && renderLocalModelsTab()}
          {activeTab === "cloud-models" && renderCloudModelsTab()}
          {activeTab === "local-api-server" && renderLocalApiTab()}
          {activeTab === "mcp-routing" && renderMcpRoutingTab()}
          {activeTab === "diagnostics" && renderDiagnosticsTab()}
        </>
      )}

      {busyAction && <p className="modelCenterBusy">Running: {busyAction}</p>}
    </>
  );

  if (embedded) {
    return (
      <div className="modelCenterEmbedded">
        {showEmbeddedHeader && header}
        {content}
      </div>
    );
  }

  return (
    <section className="content settingsView modelCenterView">
      <div className="modelCenterShell">
        <aside className="modelCenterRail">
          <div className="modelCenterRailHeader">
            <h1>Settings</h1>
            <button className="button ghost" type="button" onClick={() => void refreshModelCenter()} disabled={loading}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
          <nav className="modelCenterRailNav" aria-label="Settings sections">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={activeTab === item.id ? "selected" : ""} type="button" onClick={() => setTab(item.id)}>
                  <span className="modelCenterRailIcon"><Icon size={16} /></span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
        <div className="modelCenterMain">
          {header}
          {content}
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ children }: { children: string }) {
  return <span className={`modelCenterBadge ${badgeTone(children)}`}>{children}</span>;
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="modelCenterPathRow">
      <div>
        <strong>{label}</strong>
        <code>{value}</code>
      </div>
      <button className="button ghost" type="button" onClick={() => copyText(value)}>
        Copy
      </button>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="modelCenterEmptyState">
      <strong>{title}</strong>
      <p>{body}</p>
    </section>
  );
}
