import {
  Activity,
  Bot,
  Cloud,
  Database,
  FolderOpen,
  HardDrive,
  Keyboard,
  Plug,
  RefreshCw,
  Server,
  Shield,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
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
  | "general"
  | "shortcuts"
  | "storage-privacy"
  | "models"
  | "local-engines"
  | "cloud-providers"
  | "local-api-server"
  | "mcp-routing"
  | "diagnostics";

type ModelsTab = "overview" | "installed" | "catalog" | "providers";

const tabs: Array<{ id: ActualSettingsTab; label: string; icon: typeof SlidersHorizontal }> = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "storage-privacy", label: "Storage & Privacy", icon: Shield },
  { id: "models", label: "Models", icon: Database },
  { id: "local-engines", label: "Local Engines", icon: HardDrive },
  { id: "cloud-providers", label: "Cloud Providers", icon: Cloud },
  { id: "local-api-server", label: "Local API Server", icon: Server },
  { id: "mcp-routing", label: "MCP & Tool Routing", icon: Bot },
  { id: "diagnostics", label: "Diagnostics", icon: Activity },
];

const legacyTabMap: Record<string, ActualSettingsTab> = {
  auth: "cloud-providers",
  models: "models",
  plugins: "mcp-routing",
  agentmail: "diagnostics",
  contacts: "diagnostics",
  assistants: "diagnostics",
  numbers: "cloud-providers",
  dialer: "diagnostics",
  domains: "diagnostics",
  design: "general",
  vpn: "storage-privacy",
  wiki: "mcp-routing",
  shortcuts: "shortcuts",
};

function normalizeTab(tab: string): ActualSettingsTab {
  if (tabs.some((candidate) => candidate.id === tab)) return tab as ActualSettingsTab;
  return legacyTabMap[tab] || "general";
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

function canAssignToRole(roleId: ModelRoleAssignment["roleId"], model: CatalogModel | InstalledModel) {
  if ("health" in model && model.health.state === "error") return false;
  if ("capabilities" in model && model.capabilities.includes("embedding")) return false;
  if (roleId === "taskRouting") {
    if ("taskRoutingEligible" in model) return Boolean(model.taskRoutingEligible);
    return Boolean(model.fit?.status === "fits" || model.fit?.status === "slow");
  }
  return true;
}

function copyText(value: string) {
  void navigator.clipboard.writeText(value);
}

export function SettingsView({
  tab,
  setTab,
  embedded = false,
}: {
  tab: string;
  setTab: (tab: string) => void;
  embedded?: boolean;
}) {
  const activeTab = normalizeTab(tab);
  const [modelCenter, setModelCenter] = useState<ModelCenterState | null>(null);
  const [speakSettings, setSpeakSettings] = useState<SpeakSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [modelsTab, setModelsTab] = useState<ModelsTab>("overview");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [customOllamaId, setCustomOllamaId] = useState("");
  const [importName, setImportName] = useState("");
  const [providerDrafts, setProviderDrafts] = useState<Record<string, { enabled: boolean; baseUrl: string; apiKey: string; defaultModelId: string }>>({});
  const [engineDrafts, setEngineDrafts] = useState<Record<string, { enabled: boolean; baseUrl: string; defaultModelId: string; maxLoadedModels: number; timeoutSeconds: number; checkForUpdates: boolean; verifyDependencies: boolean }>>({});
  const [localApiDraft, setLocalApiDraft] = useState({ host: "127.0.0.1", port: "4090", apiKey: "", corsEnabled: false, exposedRoleIds: ["chatPrimary", "taskRouting"] as string[] });

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

  useEffect(() => {
    void refreshModelCenter();
  }, []);

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
  }, [modelCenter]);

  const assignableModels = useMemo(() => {
    if (!modelCenter) return [];
    return [
      ...modelCenter.installedModels,
      ...modelCenter.catalogModels.filter((model) => !model.policy.hiddenByPolicy),
    ].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  }, [modelCenter]);

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

  function renderRolePicker(roleId: ModelRoleAssignment["roleId"], assignment: ModelCenterState["roles"][ModelRoleAssignment["roleId"]]) {
    return (
      <section className="modelCenterCard">
        <header className="modelCenterCardHeader">
          <div>
            <h3>{roleLabel(roleId)}</h3>
            <p>{assignment?.dataBoundary ? `Current boundary: ${assignment.dataBoundary}.` : "No model assigned yet."}</p>
          </div>
          <StatusBadge>{assignment?.label || "Unassigned"}</StatusBadge>
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

  function renderGeneralTab() {
    if (!modelCenter) return null;
    return (
      <div className="modelCenterStack">
        <section className="modelCenterHero">
          <div>
            <p className="modelCenterEyebrow">Enterprise Hybrid Model Center</p>
            <h2>Roles, engines, providers, and policy now drive routing.</h2>
            <p>{modelCenter.message}</p>
          </div>
          <div className="modelCenterSummaryGrid">
            <SummaryStat label="Installed local models" value={String(modelCenter.overview.installedCount)} />
            <SummaryStat label="Recommended catalog entries" value={String(modelCenter.overview.recommendedCount)} />
            <SummaryStat label="Healthy providers" value={String(modelCenter.overview.healthyProviderCount)} />
          </div>
        </section>
        <div className="modelCenterGrid two">
          {renderRolePicker("chatPrimary", modelCenter.roles.chatPrimary)}
          {renderRolePicker("chatFallback", modelCenter.roles.chatFallback)}
        </div>
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Route Summary</h3>
              <p>Legacy `AiModelRoute` entries now derive from these assignments.</p>
            </div>
            <button className="button secondary" type="button" onClick={() => void refreshModelCenter()}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </header>
          <div className="modelCenterRouteList">
            {modelCenter.routes.map((route) => (
              <div key={route.id} className="modelCenterRouteRow">
                <div>
                  <strong>{route.label}</strong>
                  <small>{route.description}</small>
                </div>
                <div className="modelCenterRouteMeta">
                  <StatusBadge>{route.dataBoundary}</StatusBadge>
                  <code>{route.id}</code>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function formatShortcutKeys(keys: string[]) {
    return (
      <div className="modelCenterShortcutKeys" aria-label={keys.join(" + ")}>
        {keys.map((key) => <kbd key={key}>{key}</kbd>)}
      </div>
    );
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
        title: "Application",
        rows: [
          { label: "Open Start", description: "Show the Get Started screen.", keys: ["Click", "Start"] },
          { label: "Open Chat", description: "Jump to the chat workspace.", keys: ["Click", "Chat"] },
          { label: "Open Settings", description: "Jump to desktop settings.", keys: ["Click", "Settings"] },
        ],
      },
      {
        title: "Chat",
        rows: [
          { label: "Send Message", description: "Send the current message from the composer.", keys: ["Enter"] },
          { label: "New Line", description: "Insert a line break without sending.", keys: ["Shift", "Enter"] },
        ],
      },
      {
        title: "Scribe",
        rows: [
          {
            label: "Local Dictation",
            description: `Start local dictation using ${speakSettings?.localShortcutMode === "cmd-shift-l" ? "the keyboard shortcut" : "the hold shortcut"}.`,
            keys: localDictationShortcut,
          },
          {
            label: "Cloud Dictation",
            description: `Start cloud dictation using ${speakSettings?.cloudShortcutMode === "cmd-shift-l" ? "the keyboard shortcut" : "the hold shortcut"}.`,
            keys: cloudDictationShortcut,
          },
        ],
      },
      {
        title: "Navigation",
        rows: [
          { label: "Rail Navigation", description: "Use the left rail to switch between Chat, Taskbox, Inbox, Calendar, Calls, Agents, Skills, and Apps.", keys: ["Click", "Rail"] },
          { label: "Model Center", description: "Use the Settings rail to move between General, Shortcuts, Models, engines, providers, MCP routing, and diagnostics.", keys: ["Click", "Sections"] },
        ],
      },
    ] as const;

    return (
      <div className="modelCenterStack">
        {sections.map((section) => (
          <section key={section.title} className="modelCenterCard">
            <header className="modelCenterCardHeader">
              <div>
                <h3>{section.title}</h3>
                <p>Current Link shortcuts and quick actions.</p>
              </div>
            </header>
            <div className="modelCenterShortcutList">
              {section.rows.map((row) => (
                <div key={row.label} className="modelCenterShortcutRow">
                  <div>
                    <strong>{row.label}</strong>
                    <small>{row.description}</small>
                  </div>
                  {formatShortcutKeys([...row.keys])}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  function renderStorageTab() {
    if (!modelCenter) return null;
    return (
      <div className="modelCenterGrid two">
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Storage Paths</h3>
              <p>Local state, model imports, and LiteLLM config stay on-device.</p>
            </div>
            <FolderOpen size={18} />
          </header>
          <PathRow label="App data" value={modelCenter.storage.appDataPath} />
          <PathRow label="Desktop state" value={modelCenter.storage.statePath} />
          <PathRow label="LiteLLM config" value={modelCenter.storage.liteLlmConfigPath} />
          <PathRow label="Imports" value={modelCenter.storage.importsPath} />
          <PathRow label="Logs" value={modelCenter.storage.logsPath} />
        </section>
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Privacy Policy</h3>
              <p>Link keeps desktop model policy separate from ACP-hosted agents.</p>
            </div>
            <Shield size={18} />
          </header>
          <ul className="modelCenterChecklist">
            <li>Desktop role overrides affect only local and self-hosted routing.</li>
            <li>Task routing is isolated from the primary chat role.</li>
            <li>Policy-hidden models are excluded from assignment pickers.</li>
            <li>The local API server exposes only explicitly selected local roles.</li>
          </ul>
        </section>
      </div>
    );
  }

  function renderModelsTab() {
    if (!modelCenter) return null;
    return (
      <div className="modelCenterStack">
        <div className="modelCenterTabs" role="tablist" aria-label="Model Center sections">
          {([
            ["overview", "Overview"],
            ["installed", "Installed"],
            ["catalog", "Catalog"],
            ["providers", "Providers"],
          ] as const).map(([id, label]) => (
            <button key={id} className={modelsTab === id ? "selected" : ""} type="button" onClick={() => setModelsTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {modelsTab === "overview" && (
          <div className="modelCenterGrid two">
            {renderRolePicker("chatPrimary", modelCenter.roles.chatPrimary)}
            {renderRolePicker("chatFallback", modelCenter.roles.chatFallback)}
            {renderRolePicker("taskRouting", modelCenter.roles.taskRouting)}
            {renderRolePicker("agentDefault", modelCenter.roles.agentDefault)}
          </div>
        )}

        {modelsTab === "installed" && (
          <section className="modelCenterCard">
            <header className="modelCenterCardHeader">
              <div>
                <h3>Installed Local Models</h3>
                <p>Inventory from the active local engine with fit, health, and removal controls.</p>
              </div>
              <div className="modelCenterHeaderActions">
                <button className="button secondary" type="button" onClick={() => void runAction("refresh-fit", () => linkApi.refreshFit())}>
                  <RefreshCw size={14} />
                  Refresh fit
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
              {modelCenter.installedModels.length === 0 && <EmptyState title="No local models yet" body="Pull a curated Ollama model from Catalog or import a local GGUF file." />}
            </div>
          </section>
        )}

        {modelsTab === "catalog" && (
          <section className="modelCenterCard">
            <header className="modelCenterCardHeader">
              <div>
                <h3>Curated Catalog</h3>
                <p>Recommended Telnyx catalog entries come first. Custom Ollama ids and GGUF imports stay advanced.</p>
              </div>
              <div className="modelCenterHeaderActions">
                <input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search models, roles, or capabilities" />
              </div>
            </header>
            <div className="modelCenterImportRow">
              <input value={customOllamaId} onChange={(event) => setCustomOllamaId(event.target.value)} placeholder="Custom Ollama id, e.g. qwen2.5:7b-instruct-q4_K_M" />
              <button className="button secondary" type="button" onClick={() => void runAction("pull-custom", () => linkApi.pullLocalModel({ externalId: customOllamaId }))} disabled={!customOllamaId.trim()}>
                <Upload size={14} />
                Pull custom model
              </button>
              <input value={importName} onChange={(event) => setImportName(event.target.value)} placeholder="Imported model name" />
              <button className="button ghost" type="button" onClick={() => void runAction("import-gguf", () => linkApi.importLocalModel({ name: importName }))} disabled={!importName.trim()}>
                <FolderOpen size={14} />
                Import GGUF
              </button>
            </div>
            <div className="modelCenterCatalogList">
              {filteredCatalogModels.map((model) => {
                const installed = modelCenter.installedModels.some((installedModel) => installedModel.id === model.id);
                return (
                  <article key={model.id} className="modelCenterCatalogRow">
                    <div>
                      <div className="modelCenterCatalogHeading">
                        <strong>{model.label}</strong>
                        {model.recommended && <StatusBadge>Recommended</StatusBadge>}
                        {model.policy.mcpSafe && <StatusBadge>MCP-safe</StatusBadge>}
                      </div>
                      <p>{model.description}</p>
                      <small>{model.capabilities.join(" · ") || "No capability tags"}</small>
                    </div>
                    <div className="modelCenterCatalogActions">
                      <span>{formatBytes(model.variants[0]?.sizeBytes)}</span>
                      {model.providerId === "ollama" ? (
                        installed ? (
                          <StatusBadge>Installed</StatusBadge>
                        ) : (
                          <button className="button primary" type="button" onClick={() => void runAction(`pull:${model.id}`, () => linkApi.pullLocalModel({ modelId: model.id, externalId: model.variants[0]?.externalId }))}>
                            Pull
                          </button>
                        )
                      ) : (
                        <StatusBadge>{model.providerId}</StatusBadge>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {modelsTab === "providers" && renderProvidersCards(modelCenter.providers)}
      </div>
    );
  }

  function renderProvidersCards(providers: Array<{ definition: ProviderDefinition; config: ProviderConfig; models: CatalogModel[] }>) {
    return (
      <div className="modelCenterGrid two">
        {providers.map((provider) => {
          const draft = providerDrafts[provider.definition.id];
          return (
            <section key={provider.definition.id} className="modelCenterCard">
              <header className="modelCenterCardHeader">
                <div>
                  <h3>{provider.definition.label}</h3>
                  <p>{provider.definition.description}</p>
                </div>
                <StatusBadge>{provider.config.healthy ? "Healthy" : "Needs setup"}</StatusBadge>
              </header>
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
            </section>
          );
        })}
      </div>
    );
  }

  function renderLocalEnginesTab() {
    if (!modelCenter) return null;
    return (
      <div className="modelCenterGrid two">
        {modelCenter.engines.map((engine) => {
          const draft = engineDrafts[engine.id];
          return (
            <section key={engine.id} className="modelCenterCard">
              <header className="modelCenterCardHeader">
                <div>
                  <h3>{engine.definition.label}</h3>
                  <p>{engine.definition.description}</p>
                </div>
                <StatusBadge>{engine.ready ? "Ready" : engine.message}</StatusBadge>
              </header>
              <label className="modelCenterToggle">
                <span>Enabled</span>
                <input type="checkbox" checked={draft?.enabled ?? engine.enabled} onChange={(event) => setEngineDrafts((current) => ({ ...current, [engine.id]: { ...(current[engine.id] || { enabled: false, baseUrl: "", defaultModelId: "", maxLoadedModels: 1, timeoutSeconds: 600, checkForUpdates: true, verifyDependencies: true }), enabled: event.target.checked } }))} />
              </label>
              <label className="modelCenterField">
                <span>Base URL</span>
                <input value={draft?.baseUrl ?? engine.baseUrl ?? ""} onChange={(event) => setEngineDrafts((current) => ({ ...current, [engine.id]: { ...(current[engine.id] || { enabled: false, baseUrl: "", defaultModelId: "", maxLoadedModels: 1, timeoutSeconds: 600, checkForUpdates: true, verifyDependencies: true }), baseUrl: event.target.value } }))} />
              </label>
              <label className="modelCenterField">
                <span>Default local model</span>
                <input value={draft?.defaultModelId ?? engine.defaultModelId ?? ""} onChange={(event) => setEngineDrafts((current) => ({ ...current, [engine.id]: { ...(current[engine.id] || { enabled: false, baseUrl: "", defaultModelId: "", maxLoadedModels: 1, timeoutSeconds: 600, checkForUpdates: true, verifyDependencies: true }), defaultModelId: event.target.value } }))} />
              </label>
              <div className="modelCenterSplitFields">
                <label className="modelCenterField">
                  <span>Max loaded models</span>
                  <input type="number" value={draft?.maxLoadedModels ?? engine.settings.maxLoadedModels} onChange={(event) => setEngineDrafts((current) => ({ ...current, [engine.id]: { ...(current[engine.id] || { enabled: false, baseUrl: "", defaultModelId: "", maxLoadedModels: 1, timeoutSeconds: 600, checkForUpdates: true, verifyDependencies: true }), maxLoadedModels: Number(event.target.value) } }))} />
                </label>
                <label className="modelCenterField">
                  <span>Timeout seconds</span>
                  <input type="number" value={draft?.timeoutSeconds ?? engine.settings.timeoutSeconds} onChange={(event) => setEngineDrafts((current) => ({ ...current, [engine.id]: { ...(current[engine.id] || { enabled: false, baseUrl: "", defaultModelId: "", maxLoadedModels: 1, timeoutSeconds: 600, checkForUpdates: true, verifyDependencies: true }), timeoutSeconds: Number(event.target.value) } }))} />
                </label>
              </div>
              <div className="modelCenterSplitFields">
                <label className="modelCenterToggle">
                  <span>Check for updates</span>
                  <input type="checkbox" checked={draft?.checkForUpdates ?? engine.settings.checkForUpdates} onChange={(event) => setEngineDrafts((current) => ({ ...current, [engine.id]: { ...(current[engine.id] || { enabled: false, baseUrl: "", defaultModelId: "", maxLoadedModels: 1, timeoutSeconds: 600, checkForUpdates: true, verifyDependencies: true }), checkForUpdates: event.target.checked } }))} />
                </label>
                <label className="modelCenterToggle">
                  <span>Verify dependencies</span>
                  <input type="checkbox" checked={draft?.verifyDependencies ?? engine.settings.verifyDependencies} onChange={(event) => setEngineDrafts((current) => ({ ...current, [engine.id]: { ...(current[engine.id] || { enabled: false, baseUrl: "", defaultModelId: "", maxLoadedModels: 1, timeoutSeconds: 600, checkForUpdates: true, verifyDependencies: true }), verifyDependencies: event.target.checked } }))} />
                </label>
              </div>
              <div className="modelCenterInlineActions">
                <button className="button secondary" type="button" onClick={() => void saveEngine(engine.id)}>
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

  function renderCloudProvidersTab() {
    if (!modelCenter) return null;
    return renderProvidersCards(modelCenter.providers);
  }

  function renderLocalApiTab() {
    if (!modelCenter) return null;
    return (
      <div className="modelCenterGrid two">
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Link Local API Server</h3>
              <p>OpenAI-compatible loopback endpoint backed only by eligible local roles.</p>
            </div>
            <StatusBadge>{modelCenter.localApiServer.running ? "Running" : "Stopped"}</StatusBadge>
          </header>
          <div className="modelCenterSplitFields">
            <label className="modelCenterField">
              <span>Host</span>
              <input value={localApiDraft.host} onChange={(event) => setLocalApiDraft((current) => ({ ...current, host: event.target.value }))} />
            </label>
            <label className="modelCenterField">
              <span>Port</span>
              <input value={localApiDraft.port} onChange={(event) => setLocalApiDraft((current) => ({ ...current, port: event.target.value }))} />
            </label>
          </div>
          <label className="modelCenterField">
            <span>API key</span>
            <input value={localApiDraft.apiKey} onChange={(event) => setLocalApiDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder={modelCenter.localApiServer.apiKeyConfigured ? "Configured. Enter a new key to rotate it." : "Set a loopback API key"} />
          </label>
          <label className="modelCenterToggle">
            <span>Allow CORS</span>
            <input type="checkbox" checked={localApiDraft.corsEnabled} onChange={(event) => setLocalApiDraft((current) => ({ ...current, corsEnabled: event.target.checked }))} />
          </label>
          <div className="modelCenterRoleToggleList">
            {(["chatPrimary", "chatFallback", "taskRouting", "agentDefault"] as const).map((roleId) => (
              <label key={roleId} className="modelCenterToggle compact">
                <span>{roleLabel(roleId)}</span>
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
          <div className="modelCenterInlineActions">
            <button className="button primary" type="button" onClick={() => void runAction("start-local-api", () => linkApi.startLocalApiServer({
              host: localApiDraft.host,
              port: Number(localApiDraft.port),
              apiKey: localApiDraft.apiKey || undefined,
              corsEnabled: localApiDraft.corsEnabled,
              exposedRoleIds: localApiDraft.exposedRoleIds,
            }))}>
              Start server
            </button>
            <button className="button ghost" type="button" onClick={() => void runAction("stop-local-api", () => linkApi.stopLocalApiServer())}>
              Stop server
            </button>
          </div>
          <div className="modelCenterMetaGrid">
            <div>
              <strong>Endpoint</strong>
              <span>{valueOrDash(modelCenter.localApiServer.endpoint)}</span>
            </div>
            <div>
              <strong>Exposed roles</strong>
              <span>{modelCenter.localApiServer.exposedRoleIds.join(", ") || "None"}</span>
            </div>
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
      <div className="modelCenterGrid two">
        {renderRolePicker("taskRouting", modelCenter.roles.taskRouting)}
        {renderRolePicker("agentDefault", modelCenter.roles.agentDefault)}
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Routing Policy</h3>
              <p>The dedicated task-routing role stays separate from the primary chat model.</p>
            </div>
            <Bot size={18} />
          </header>
          <ul className="modelCenterChecklist">
            <li>Only lightweight routing-eligible models appear in the task-routing picker.</li>
            <li>MCP-safe badges come from the Telnyx registry metadata layer.</li>
            <li>ACP-hosted agents do not inherit desktop role overrides.</li>
            <li>Fallback chains are derived from curated model policy, not raw route ids.</li>
          </ul>
        </section>
      </div>
    );
  }

  function renderDiagnosticsTab() {
    if (!modelCenter) return null;
    return (
      <div className="modelCenterStack">
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Runtime Diagnostics</h3>
              <p>{modelCenter.runtime.message}</p>
            </div>
            <button className="button secondary" type="button" onClick={() => void refreshModelCenter()}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </header>
          <div className="modelCenterMetaGrid">
            <div>
              <strong>LiteLLM</strong>
              <span>{modelCenter.runtime.installed ? "Installed" : "Missing"}</span>
            </div>
            <div>
              <strong>Ollama</strong>
              <span>{modelCenter.runtime.local.message}</span>
            </div>
            <div>
              <strong>Managed gateway</strong>
              <span>{modelCenter.runtime.managedGateway.message}</span>
            </div>
            <div>
              <strong>Anthropic</strong>
              <span>{modelCenter.runtime.frontier.message}</span>
            </div>
          </div>
        </section>
        <section className="modelCenterCard">
          <header className="modelCenterCardHeader">
            <div>
              <h3>Route Health</h3>
              <p>Derived `AiModelRoute` entries remain available for the existing executor.</p>
            </div>
            <Activity size={18} />
          </header>
          <div className="modelCenterRouteList">
            {modelCenter.runtime.routes.map((route) => (
              <div key={route.id} className="modelCenterRouteRow">
                <div>
                  <strong>{route.label}</strong>
                  <small>{route.health?.message || route.description}</small>
                </div>
                <StatusBadge>{route.health?.state || "unknown"}</StatusBadge>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const header = (
    <header className="modelCenterHeader">
      <div>
        <p className="modelCenterEyebrow">Model Center</p>
        <h2>{tabs.find((candidate) => candidate.id === activeTab)?.label || "Settings"}</h2>
      </div>
      <div className="modelCenterHeaderMeta">
        {embedded && (
          <button className="button ghost" type="button" onClick={() => void refreshModelCenter()} disabled={loading}>
            <RefreshCw size={14} />
            Refresh
          </button>
        )}
        {modelCenter && <StatusBadge>{modelCenter.overview.routeSummary}</StatusBadge>}
      </div>
    </header>
  );

  const content = (
    <>
      {error && <div className="modelCenterError">{error}</div>}
      {loading && !modelCenter && <EmptyState title="Loading Model Center" body="Fetching engines, providers, installed models, and role assignments." />}
      {!loading && !modelCenter && !error && <EmptyState title="Model Center unavailable" body="Link could not build the runtime manager state." />}

      {modelCenter && (
        <>
          {activeTab === "general" && renderGeneralTab()}
          {activeTab === "shortcuts" && renderShortcutsTab()}
          {activeTab === "storage-privacy" && renderStorageTab()}
          {activeTab === "models" && renderModelsTab()}
          {activeTab === "local-engines" && renderLocalEnginesTab()}
          {activeTab === "cloud-providers" && renderCloudProvidersTab()}
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
        {header}
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

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="modelCenterSummaryStat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
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
