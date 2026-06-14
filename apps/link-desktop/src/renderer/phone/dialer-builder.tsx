import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  AudioWaveform,
  BarChart3,
  Bot,
  CircleDot,
  ClipboardList,
  Database,
  Eye,
  Hash,
  Keyboard,
  MicOff,
  Pause,
  PhoneOff,
  Save,
  Search,
  StickyNote,
  Timer,
  Users,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { linkApi } from "../api.js";
import {
  cloneDialerConfig,
  dialerActions,
  dialerFeatures,
  type DialerConfig,
  type DialerFeaturePhase,
} from "./dialer-config.js";
import { LinkSoftphone } from "./softphone.js";

const iconMap = {
  ArrowRightLeft,
  AudioWaveform,
  BarChart3,
  Bot,
  CircleDot,
  ClipboardList,
  Database,
  Eye,
  Hash,
  Keyboard,
  MicOff,
  Pause,
  PhoneOff,
  Search,
  StickyNote,
  Timer,
  Users,
  Volume2,
} as const;

function withDefaultDialerButtonColor(config: DialerConfig): DialerConfig {
  const removedFeatureIds = new Set(["warm-transfer", "number-lookup", "voicemail", "contact-search"]);
  const removedActionIds = new Set(["warm-xfer"]);
  const featureSettings = {
    ...config.featureSettings,
    crm: {
      ...(config.featureSettings.crm ?? {}),
      "crm-provider": "Salesforce MCP",
    },
    "salesforce-notes-sync": {
      ...(config.featureSettings["salesforce-notes-sync"] ?? {}),
      "sf-notes-sync": config.featureSettings["salesforce-notes-sync"]?.["sf-notes-sync"] ?? true,
      "sf-notes-target": config.featureSettings["salesforce-notes-sync"]?.["sf-notes-target"] ?? "Contact notes",
    },
  };
  return {
    ...config,
    accentColor: "green",
    enabledFeatures: config.enabledFeatures.filter((featureId) => !removedFeatureIds.has(featureId)),
    actions: config.actions.filter((actionId) => !removedActionIds.has(actionId)),
    featureSettings,
  };
}

export function DialerBuilder({
  activeConfig,
  onActiveConfigChange,
  renderActions,
}: {
  activeConfig: DialerConfig;
  onActiveConfigChange: (config: DialerConfig) => void;
  renderActions?: (actions: ReactNode) => void;
}) {
  const [draft, setDraft] = useState<DialerConfig>(() => withDefaultDialerButtonColor(cloneDialerConfig(activeConfig)));
  const [phase, setPhase] = useState<DialerFeaturePhase>("pre-call");
  const [expandedFeatureId, setExpandedFeatureId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(withDefaultDialerButtonColor(cloneDialerConfig(activeConfig)));
  }, [activeConfig.id, activeConfig.updatedAt]);

  useEffect(() => {
    void loadConfigs();
  }, []);

  async function loadConfigs() {
    try {
      const state = await linkApi.listDialerConfigs();
      onActiveConfigChange(withDefaultDialerButtonColor(state.activeConfig));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dialer configs.");
    }
  }

  const saveAndActivate = useCallback(async () => {
    try {
      const state = await linkApi.saveDialerConfig({
        ...withDefaultDialerButtonColor(draft),
        active: true,
      });
      const nextConfig = withDefaultDialerButtonColor(state.activeConfig);
      setDraft(cloneDialerConfig(nextConfig));
      onActiveConfigChange(nextConfig);
      setStatus(`${nextConfig.name} saved and activated.`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save dialer config.");
    }
  }, [draft, onActiveConfigChange]);

  function toggleFeature(featureId: string) {
    setDraft((current) => {
      const enabled = current.enabledFeatures.includes(featureId);
      return {
        ...current,
        enabledFeatures: enabled ? current.enabledFeatures.filter((id) => id !== featureId) : [...current.enabledFeatures, featureId],
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function updateFeatureSetting(featureId: string, settingId: string, value: string | boolean) {
    setDraft((current) => ({
      ...current,
      featureSettings: {
        ...current.featureSettings,
        [featureId]: {
          ...(current.featureSettings[featureId] ?? {}),
          [settingId]: value,
        },
      },
      updatedAt: new Date().toISOString(),
    }));
  }

  function toggleAction(actionId: string) {
    setDraft((current) => {
      const exists = current.actions.includes(actionId);
      if (exists && current.actions.length <= 2) return current;
      if (!exists && current.actions.length >= 6) return current;
      return {
        ...current,
        actions: exists ? current.actions.filter((id) => id !== actionId) : [...current.actions, actionId],
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function moveAction(actionId: string, direction: -1 | 1) {
    setDraft((current) => {
      const index = current.actions.indexOf(actionId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.actions.length) return current;
      const actions = [...current.actions];
      const [action] = actions.splice(index, 1);
      actions.splice(nextIndex, 0, action);
      return { ...current, actions, updatedAt: new Date().toISOString() };
    });
  }

  const visibleFeatures = useMemo(() => dialerFeatures.filter((feature) => feature.phase === phase), [phase]);
  const selectedActions = useMemo(() => draft.actions.map((id) => dialerActions.find((action) => action.id === id)).filter(Boolean), [draft.actions]);
  const actions = useMemo(() => (
    <div className="dialerBuilderActions">
      <button className="button primary" type="button" onClick={() => void saveAndActivate()}>
        <Save size={15} />
        Save
      </button>
    </div>
  ), [saveAndActivate]);

  useEffect(() => {
    renderActions?.(actions);
    return () => renderActions?.(null);
  }, [renderActions, actions]);

  return (
    <section className="dialerBuilder">
      {status && <div className="infoBanner">{status}</div>}
      {error && <div className="errorBanner">{error}</div>}

      <div className="dialerBuilderLayout">
        <section className="dialerBuilderFeatures" aria-label="Dialer feature modules">
          <div className="dialerPhaseTabs" role="tablist" aria-label="Feature phase">
            {(["pre-call", "in-call", "post-call"] as DialerFeaturePhase[]).map((item) => (
              <button key={item} type="button" className={phase === item ? "selected" : ""} onClick={() => setPhase(item)} role="tab" aria-selected={phase === item}>
                {phaseLabel(item)}
                <span>{dialerFeatures.filter((feature) => feature.phase === item && draft.enabledFeatures.includes(feature.id)).length}/{dialerFeatures.filter((feature) => feature.phase === item).length}</span>
              </button>
            ))}
          </div>

          <div className="dialerFeatureList">
            {visibleFeatures.map((feature) => {
              const Icon = iconFor(feature.icon);
              const enabled = draft.enabledFeatures.includes(feature.id);
              const expanded = expandedFeatureId === feature.id;
              return (
                <article className={`dialerFeatureItem ${enabled ? "enabled" : ""}`} key={feature.id}>
                  <header>
                    <Icon size={17} />
                    <button type="button" onClick={() => setExpandedFeatureId(expanded ? "" : feature.id)}>
                      <strong>{feature.name}</strong>
                      <small>{feature.description}</small>
                    </button>
                    <button className={`dialerSwitch ${enabled ? "on" : ""}`} type="button" role="switch" aria-checked={enabled} aria-label={`Toggle ${feature.name}`} onClick={() => toggleFeature(feature.id)}>
                      <span />
                    </button>
                  </header>
                  {enabled && expanded && feature.settings && (
                    <div className="dialerFeatureSettings">
                      {feature.settings.map((setting) => {
                        const currentValue = draft.featureSettings[feature.id]?.[setting.id] ?? setting.default;
                        return (
                          <label className="componentField" key={setting.id}>
                            <span>{setting.label}</span>
                            {setting.type === "select" && setting.options ? (
                              <select value={String(currentValue ?? "")} onChange={(event) => updateFeatureSetting(feature.id, setting.id, event.target.value)}>
                                {setting.options.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            ) : setting.type === "toggle" ? (
                              <input type="checkbox" checked={Boolean(currentValue)} onChange={(event) => updateFeatureSetting(feature.id, setting.id, event.target.checked)} />
                            ) : (
                              <input value={String(currentValue ?? "")} onChange={(event) => updateFeatureSetting(feature.id, setting.id, event.target.value)} />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {phase === "in-call" && (
            <div className="dialerActionBuilder">
              <header>
                <strong>Call actions</strong>
                <small>{draft.actions.length}/6 buttons</small>
              </header>
              <div className="dialerSelectedActions">
                {selectedActions.map((action, index) => {
                  if (!action) return null;
                  const Icon = iconFor(action.icon);
                  return (
                    <div className={`dialerActionRow ${action.style === "end" ? "end" : ""}`} key={action.id}>
                      <Icon size={16} />
                      <span>{action.label}</span>
                      <button type="button" aria-label={`Move ${action.label} up`} disabled={index === 0} onClick={() => moveAction(action.id, -1)}><ArrowUp size={13} /></button>
                      <button type="button" aria-label={`Move ${action.label} down`} disabled={index === selectedActions.length - 1} onClick={() => moveAction(action.id, 1)}><ArrowDown size={13} /></button>
                      <button type="button" onClick={() => toggleAction(action.id)}>Remove</button>
                    </div>
                  );
                })}
              </div>
              <div className="dialerAvailableActions">
                {dialerActions.filter((action) => !draft.actions.includes(action.id)).map((action) => {
                  const Icon = iconFor(action.icon);
                  return (
                    <button key={action.id} type="button" onClick={() => toggleAction(action.id)} disabled={draft.actions.length >= 6}>
                      <Icon size={14} />
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <DialerPreview config={draft} phase={phase} />
      </div>
    </section>
  );
}

function DialerPreview({ config, phase }: { config: DialerConfig; phase: DialerFeaturePhase }) {
  const previewConfig = withDefaultDialerButtonColor(config);
  return (
    <aside className="dialerPreview" aria-label="Dialer preview">
      <header>
        <Eye size={16} />
        <strong>Live Preview</strong>
        <span>{phaseLabel(phase)}</span>
      </header>
      <LinkSoftphone
        config={previewConfig}
        linkedPhoneNumber={previewConfig.outboundNumber || "+14155550100"}
        setLinkedPhoneNumber={() => undefined}
        telnyxApiReady
        setView={() => undefined}
        openPhoneContacts={() => undefined}
        connectors={[]}
        initialDialNumber="15551234567"
        previewMode
        previewPhase={phase}
      />
    </aside>
  );
}

function iconFor(name: string) {
  return iconMap[name as keyof typeof iconMap] ?? Keyboard;
}

function phaseLabel(phase: DialerFeaturePhase) {
  if (phase === "pre-call") return "Pre-call";
  if (phase === "in-call") return "In-call";
  return "Post-call";
}
