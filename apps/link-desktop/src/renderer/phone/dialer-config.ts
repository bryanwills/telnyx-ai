export type DialerTheme = "dark" | "light";
export type DialerShape = "rounded" | "square";
export type DialerAccentColor = "green" | "blue" | "purple" | "orange";
export type DialerFontSize = "small" | "medium" | "large";
export type DialerFeaturePhase = "pre-call" | "in-call" | "post-call";

export interface DialerFeatureSetting {
  id: string;
  label: string;
  type: "select" | "text" | "toggle";
  options?: string[];
  default?: string | boolean;
}

export interface DialerFeature {
  id: string;
  name: string;
  description: string;
  icon: string;
  phase: DialerFeaturePhase;
  settings?: DialerFeatureSetting[];
}

export interface DialerAction {
  id: string;
  label: string;
  icon: string;
  style: "default" | "end";
}

export interface DialerConfig {
  id: string;
  name: string;
  template: string | null;
  theme: DialerTheme;
  shape: DialerShape;
  accentColor: DialerAccentColor;
  fontSize: DialerFontSize;
  showNumpad: boolean;
  showCountryPrefix: boolean;
  callerIdName: string;
  outboundNumber: string;
  enabledFeatures: string[];
  actions: string[];
  featureSettings: Record<string, Record<string, string | boolean>>;
  createdAt: string;
  updatedAt: string;
  active: boolean;
}

export interface DialerState {
  configs: DialerConfig[];
  activeConfig: DialerConfig;
  updatedAt: string;
}

export const dialpadKeys = [
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

export const dialerFeatures: DialerFeature[] = [
  {
    id: "local-calling",
    name: "Local Calling",
    description: "Let local calls use the outbound line country code automatically",
    icon: "PhoneCall",
    phase: "pre-call",
  },
  {
    id: "notes",
    name: "Call Notes",
    description: "Add notes during or after calls with auto-save",
    icon: "StickyNote",
    phase: "post-call",
    settings: [
      { id: "notes-autosave", label: "Auto-save interval", type: "select", options: ["5s", "10s", "30s", "Manual"], default: "10s" },
      { id: "notes-template", label: "Note template", type: "select", options: ["None", "Basic", "BANT", "MEDDIC"], default: "None" },
    ],
  },
  {
    id: "salesforce-notes-sync",
    name: "Salesforce Notes Sync",
    description: "Sync post-call notes into Salesforce when MCP is connected",
    icon: "Database",
    phase: "post-call",
    settings: [
      { id: "sf-notes-sync", label: "Sync to Salesforce", type: "toggle", default: true },
      { id: "sf-notes-target", label: "Sync target", type: "select", options: ["Contact notes", "Account notes", "Opportunity notes"], default: "Contact notes" },
    ],
  },
  {
    id: "crm",
    name: "Contact Preview",
    description: "Preview Salesforce contact data for the number entered",
    icon: "Database",
    phase: "pre-call",
    settings: [
      { id: "crm-provider", label: "Data source", type: "select", options: ["Salesforce MCP"], default: "Salesforce MCP" },
      { id: "crm-show-history", label: "Show call history", type: "toggle", default: true },
      { id: "crm-show-deals", label: "Show open deals", type: "toggle", default: true },
    ],
  },
  {
    id: "transcription",
    name: "Live Transcription",
    description: "Real-time speech-to-text powered by Telnyx AI",
    icon: "AudioWaveform",
    phase: "in-call",
    settings: [
      { id: "transcription-lang", label: "Language", type: "select", options: ["English", "Spanish", "French", "German", "Auto-detect"], default: "English" },
      { id: "transcription-display", label: "Display", type: "select", options: ["Sidebar", "Overlay", "Below dialer"], default: "Sidebar" },
    ],
  },
  {
    id: "recording",
    name: "Call Recording",
    description: "Record calls with storage and announcement controls",
    icon: "CircleDot",
    phase: "in-call",
    settings: [
      { id: "recording-auto", label: "Auto-record", type: "toggle", default: true },
      { id: "recording-announce", label: "Announcement", type: "select", options: ["Beep", "Voice prompt", "None"], default: "Beep" },
      { id: "recording-storage", label: "Storage", type: "select", options: ["Telnyx Cloud"], default: "Telnyx Cloud" },
    ],
  },
  {
    id: "dispositions",
    name: "Dispositions",
    description: "Wrap-up codes and call outcome tracking",
    icon: "ClipboardList",
    phase: "post-call",
    settings: [
      { id: "dispo-required", label: "Required after call", type: "toggle", default: true },
      { id: "dispo-codes", label: "Code set", type: "select", options: ["Basic (5 codes)", "Revenue workflow (12 codes)", "Service workflow (8 codes)", "Custom"], default: "Basic (5 codes)" },
    ],
  },
  {
    id: "analytics",
    name: "Call Analytics",
    description: "Real-time call metrics and performance stats",
    icon: "BarChart3",
    phase: "post-call",
    settings: [
      { id: "analytics-display", label: "Display", type: "select", options: ["Minimal", "Detailed", "Dashboard"], default: "Minimal" },
    ],
  },
];

export const dialerActions: DialerAction[] = [
  { id: "mute", label: "Mute", icon: "MicOff", style: "default" },
  { id: "hold", label: "Hold", icon: "Pause", style: "default" },
  { id: "transfer", label: "Transfer", icon: "ArrowRightLeft", style: "default" },
  { id: "end", label: "End", icon: "PhoneOff", style: "end" },
  { id: "speaker", label: "Speaker", icon: "Volume2", style: "default" },
  { id: "agent", label: "Agent", icon: "Bot", style: "default" },
  { id: "dial", label: "Keypad", icon: "Hash", style: "default" },
  { id: "record", label: "Record", icon: "CircleDot", style: "default" },
];

export const defaultActionIds = ["mute", "hold", "transfer", "end"];

const defaultDialerTimestamp = "1970-01-01T00:00:00.000Z";

export const defaultDialerConfig: DialerConfig = {
  id: "link-dialer",
  name: "Dialpad",
  template: null,
  theme: "dark",
  shape: "rounded",
  accentColor: "green",
  fontSize: "medium",
  showNumpad: true,
  showCountryPrefix: true,
  callerIdName: "My Company",
  outboundNumber: "+1 (415) 555-0100",
  enabledFeatures: ["local-calling", "crm", "transcription", "recording", "notes", "salesforce-notes-sync", "dispositions", "analytics"],
  actions: ["mute", "hold", "transfer", "end", "speaker", "record"],
  featureSettings: {
    crm: { "crm-provider": "Salesforce MCP", "crm-show-history": true, "crm-show-deals": true },
    transcription: { "transcription-lang": "Auto-detect", "transcription-display": "Sidebar" },
    recording: { "recording-auto": true, "recording-announce": "Beep", "recording-storage": "Telnyx Cloud" },
    notes: { "notes-autosave": "10s", "notes-template": "Basic" },
    "salesforce-notes-sync": { "sf-notes-sync": true, "sf-notes-target": "Contact notes" },
    dispositions: { "dispo-required": true, "dispo-codes": "Basic (5 codes)" },
    analytics: { "analytics-display": "Detailed" },
  },
  createdAt: defaultDialerTimestamp,
  updatedAt: defaultDialerTimestamp,
  active: false,
};

export function createDefaultDialerConfig(): DialerConfig {
  return normalizeDialerConfig(defaultDialerConfig, true);
}

export function cloneDialerConfig(config: DialerConfig): DialerConfig {
  return {
    ...config,
    enabledFeatures: [...config.enabledFeatures],
    actions: [...config.actions],
    featureSettings: Object.fromEntries(
      Object.entries(config.featureSettings).map(([featureId, settings]) => [featureId, { ...settings }]),
    ),
  };
}

export function normalizeDialerConfig(input: Partial<DialerConfig> | null | undefined, active = false): DialerConfig {
  const fallback = defaultDialerConfig;
  const validFeatureIds = new Set(dialerFeatures.map((feature) => feature.id));
  const validActionIds = new Set(dialerActions.map((action) => action.id));
  const accentValues: DialerAccentColor[] = ["green", "blue", "purple", "orange"];
  const fontValues: DialerFontSize[] = ["small", "medium", "large"];
  const now = new Date().toISOString();
  const source = input ?? {};
  const actions = Array.isArray(source.actions) ? source.actions.filter((action) => validActionIds.has(action)) : fallback.actions;
  const features = Array.isArray(source.enabledFeatures) ? source.enabledFeatures.filter((feature) => validFeatureIds.has(feature)) : fallback.enabledFeatures;

  return {
    id: source.id && typeof source.id === "string" ? source.id : fallback.id,
    name: source.name && typeof source.name === "string" ? source.name : fallback.name,
    template: typeof source.template === "string" ? source.template : null,
    theme: source.theme === "light" ? "light" : "dark",
    shape: source.shape === "square" ? "square" : "rounded",
    accentColor: source.accentColor && accentValues.includes(source.accentColor) ? source.accentColor : fallback.accentColor,
    fontSize: source.fontSize && fontValues.includes(source.fontSize) ? source.fontSize : fallback.fontSize,
    showNumpad: typeof source.showNumpad === "boolean" ? source.showNumpad : fallback.showNumpad,
    showCountryPrefix: typeof source.showCountryPrefix === "boolean" ? source.showCountryPrefix : fallback.showCountryPrefix,
    callerIdName: source.callerIdName && typeof source.callerIdName === "string" ? source.callerIdName : fallback.callerIdName,
    outboundNumber: source.outboundNumber && typeof source.outboundNumber === "string" ? source.outboundNumber : fallback.outboundNumber,
    enabledFeatures: [...new Set(features)],
    actions: [...new Set(actions)].slice(0, 6),
    featureSettings: source.featureSettings && typeof source.featureSettings === "object" ? source.featureSettings : fallback.featureSettings,
    createdAt: source.createdAt && typeof source.createdAt === "string" ? source.createdAt : now,
    updatedAt: source.updatedAt && typeof source.updatedAt === "string" ? source.updatedAt : now,
    active,
  };
}
