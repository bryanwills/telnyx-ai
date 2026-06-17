function timestamp(input) {
  return String(input || new Date().toISOString());
}

function cloneArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function mapById(items = []) {
  return Object.fromEntries((items || []).filter(Boolean).map((item) => [item.id, item]));
}

function surfaceAction({
  id,
  label,
  enabled = true,
  reason = "",
  tone = "default",
  kind = "button",
  visible = true,
}) {
  return {
    id,
    label,
    enabled: Boolean(enabled),
    reason: reason || "",
    tone,
    kind,
    visible: visible !== false,
  };
}

function searchSchema({
  placeholder,
  menuActions = [],
  filters = [],
  sorts = [],
  canRestoreSearch = false,
  restoreAction = null,
}) {
  return {
    placeholder,
    menuActions: cloneArray(menuActions),
    filters: cloneArray(filters),
    sorts: cloneArray(sorts),
    canRestoreSearch: Boolean(canRestoreSearch),
    restoreAction: restoreAction || null,
  };
}

function composerSchema({
  placeholder,
  primaryAction,
  aiAction = null,
  multiline = true,
  autoGrow = true,
  maxHeightRatio = 0.5,
  supportsAttachments = false,
  supportsAudio = false,
}) {
  return {
    placeholder,
    multiline: Boolean(multiline),
    autoGrow: Boolean(autoGrow),
    maxHeightRatio,
    supportsAttachments: Boolean(supportsAttachments),
    supportsAudio: Boolean(supportsAudio),
    primaryAction,
    aiAction,
  };
}

function emptyState({
  kind = "empty",
  title,
  body,
  cta = null,
}) {
  return {
    kind,
    title,
    body,
    cta,
  };
}

function connectedConnectorIds(connectors = []) {
  return new Set((connectors || [])
    .filter((connector) => connector && (connector.status === "connected" || connector.status === "signed_in"))
    .map((connector) => connector.id));
}

function configuredCredentialNames(credentials = []) {
  const names = new Set();
  for (const group of credentials || []) {
    for (const field of group?.fields || []) {
      if (field?.configured && field?.name) names.add(field.name);
    }
  }
  return names;
}

function capabilityManifest({
  surface,
  label,
  enabled = true,
  ready = false,
  requiresAgent = false,
  requiresConnector = false,
  requiresCredential = false,
  reasons = [],
  connectorIds = [],
  credentialNames = [],
  message = "",
  search,
  composer = null,
  features = {},
  updatedAt,
}) {
  return {
    surface,
    label,
    enabled: Boolean(enabled),
    ready: Boolean(ready),
    requiresAgent: Boolean(requiresAgent),
    requiresConnector: Boolean(requiresConnector),
    requiresCredential: Boolean(requiresCredential),
    reasons: cloneArray(reasons).filter(Boolean),
    connectorIds: cloneArray(connectorIds),
    credentialNames: cloneArray(credentialNames),
    message,
    search,
    composer,
    features: { ...(features || {}) },
    updatedAt: timestamp(updatedAt),
  };
}

export function buildSurfaceManifests(input = {}) {
  const updatedAt = timestamp(input.updatedAt);
  const connectors = cloneArray(input.connectors);
  const credentials = cloneArray(input.credentials);
  const connectorIds = connectedConnectorIds(connectors);
  const credentialNames = configuredCredentialNames(credentials);
  const connectorMap = mapById(connectors);
  const agentRuntimeReady = Boolean(input.agentRuntimeReady);
  const meetingBotCount = Number(input.meetingBotCount || 0);
  const hasTelnyxApi = credentialNames.has("TELNYX_API_KEY") || connectorIds.has("telnyx");
  const hasGmail = connectorIds.has("google-inbox");
  const hasCalendar = connectorIds.has("google-calendar") || connectorIds.has("google-drive");
  const hasContacts = hasCalendar || connectorIds.has("google-workspace");
  const hasScribes = Boolean(input.scribesRouteReady || input.scribesSurfaceEnabled || input.scribesWorkspaceLoaded);

  const manifests = {
    chat: capabilityManifest({
      surface: "chat",
      label: "Chat",
      ready: true,
      message: "Chat is available in Link.",
      search: searchSchema({
        placeholder: "Search sessions, tasks, or agents",
        menuActions: [
          surfaceAction({ id: "restore-search", label: "Show search", kind: "menu" }),
        ],
        canRestoreSearch: true,
      }),
      composer: composerSchema({
        placeholder: "Ask your agent...",
        supportsAttachments: true,
        supportsAudio: true,
        primaryAction: surfaceAction({ id: "send-chat", label: "Send", tone: "primary" }),
        aiAction: surfaceAction({ id: "choose-runtime", label: "Runtime", kind: "menu" }),
      }),
      features: {
        agentRuntimeReady,
      },
      updatedAt,
    }),
    call: capabilityManifest({
      surface: "call",
      label: "Call",
      ready: hasTelnyxApi,
      requiresCredential: !hasTelnyxApi,
      reasons: hasTelnyxApi ? [] : ["Save TELNYX_API_KEY to load call history, numbers, and assistants."],
      connectorIds: ["telnyx"],
      credentialNames: ["TELNYX_API_KEY"],
      message: hasTelnyxApi ? "Calling features are ready." : "Call history and Telnyx voice features need a Telnyx API key.",
      search: searchSchema({
        placeholder: "Search calls, numbers, contacts, or bots",
        menuActions: [
          surfaceAction({ id: "restore-search", label: "Show search", kind: "menu" }),
          surfaceAction({ id: "new-call", label: "New call", kind: "menu", enabled: hasTelnyxApi, reason: hasTelnyxApi ? "" : "Save TELNYX_API_KEY first." }),
        ],
        canRestoreSearch: true,
      }),
      features: {
        telnyxReady: hasTelnyxApi,
      },
      updatedAt,
    }),
    gmail: capabilityManifest({
      surface: "gmail",
      label: "Gmail",
      ready: hasGmail,
      requiresConnector: !hasGmail,
      reasons: hasGmail ? [] : ["Connect Google Inbox to read threads and save Gmail drafts."],
      connectorIds: ["google-inbox"],
      message: hasGmail ? "Google Inbox is connected." : "Gmail read and draft flows need the Google Inbox connector.",
      search: searchSchema({
        placeholder: "Search inbox messages, senders, subjects, or snippets",
        menuActions: [
          surfaceAction({ id: "restore-search", label: "Show search", kind: "menu" }),
          surfaceAction({ id: "new-email", label: "New email", kind: "menu", enabled: hasGmail, reason: hasGmail ? "" : "Connect Google Inbox first." }),
        ],
        filters: [
          {
            id: "recipientType",
            label: "Recipient",
            options: [
              { id: "all", label: "All unread" },
              { id: "direct", label: "My alias" },
              { id: "group", label: "Group alias" },
            ],
          },
        ],
        canRestoreSearch: true,
      }),
      composer: composerSchema({
        placeholder: "Ask an agent to draft a reply, or write one here...",
        supportsAttachments: false,
        supportsAudio: false,
        primaryAction: surfaceAction({ id: "save-gmail-draft", label: "Save Gmail draft", tone: "primary", enabled: hasGmail }),
        aiAction: surfaceAction({
          id: "draft-with-agent",
          label: "Draft with Agent",
          enabled: agentRuntimeReady,
          reason: agentRuntimeReady ? "" : "Connect a chat runtime to enable AI drafting.",
        }),
      }),
      features: {
        agentRuntimeReady,
      },
      updatedAt,
    }),
    events: capabilityManifest({
      surface: "events",
      label: "Events",
      ready: hasCalendar,
      requiresConnector: !hasCalendar,
      reasons: hasCalendar ? [] : ["Connect Google Workspace to load calendar events."],
      connectorIds: ["google-calendar", "google-drive"],
      message: hasCalendar ? "Calendar events are available." : "Google Calendar access is required for Events.",
      search: searchSchema({
        placeholder: "Search calendar events",
        menuActions: [
          surfaceAction({ id: "restore-search", label: "Show search", kind: "menu" }),
          surfaceAction({ id: "new-event", label: "New event", kind: "menu", enabled: hasCalendar, reason: hasCalendar ? "" : "Connect Google Workspace first." }),
        ],
        filters: [
          {
            id: "timeScope",
            label: "Scope",
            options: [
              { id: "upcoming", label: "Upcoming" },
              { id: "all", label: "All visible" },
            ],
          },
        ],
        sorts: [
          { id: "soonest", label: "Soonest first" },
        ],
        canRestoreSearch: true,
      }),
      features: {
        meetingBotsAvailable: meetingBotCount > 0,
      },
      updatedAt,
    }),
    scribe: capabilityManifest({
      surface: "scribe",
      label: "Scribe",
      enabled: true,
      ready: hasScribes,
      reasons: hasScribes ? [] : ["Scribe history is available, but dictation or transcription routes may still need local or cloud setup."],
      connectorIds: hasCalendar ? ["google-calendar"] : [],
      credentialNames: credentialNames.has("TELNYX_API_KEY") ? ["TELNYX_API_KEY"] : [],
      message: hasScribes ? "Scribe workspace is available." : "Scribe can still store sessions, but live transcription routes may need setup.",
      search: searchSchema({
        placeholder: "Search recordings, meetings, transcripts, or artifacts",
        menuActions: [
          surfaceAction({ id: "restore-search", label: "Show search", kind: "menu" }),
        ],
        filters: [
          {
            id: "sessionType",
            label: "Type",
            options: [
              { id: "all", label: "All records" },
              { id: "dictation", label: "Recordings" },
              { id: "meeting", label: "Meetings" },
              { id: "import", label: "Imports" },
              { id: "tts", label: "TTS" },
            ],
          },
        ],
        canRestoreSearch: true,
      }),
      composer: composerSchema({
        placeholder: "Speak to Scribe...",
        supportsAttachments: false,
        supportsAudio: true,
        primaryAction: surfaceAction({ id: "start-scribe", label: "Record", tone: "primary", enabled: true }),
        aiAction: surfaceAction({
          id: "cleanup-with-agent",
          label: "Draft with Agent",
          enabled: agentRuntimeReady,
          reason: agentRuntimeReady ? "" : "Connect a chat runtime to enable AI cleanup or drafting.",
        }),
      }),
      features: {
        calendarLinked: hasCalendar,
      },
      updatedAt,
    }),
    contacts: capabilityManifest({
      surface: "contacts",
      label: "Contacts",
      ready: hasContacts,
      requiresConnector: !hasContacts,
      reasons: hasContacts ? [] : ["Connect Google Workspace to load shared contacts."],
      connectorIds: ["google-drive", "google-calendar", "google-workspace"],
      message: hasContacts ? "Contact sources are connected." : "Contacts are not connected yet.",
      search: searchSchema({
        placeholder: "Search contacts, companies, bots, or numbers",
        menuActions: [
          surfaceAction({ id: "restore-search", label: "Show search", kind: "menu" }),
        ],
        canRestoreSearch: true,
      }),
      updatedAt,
    }),
  };

  return {
    manifests,
    connectorMap,
    updatedAt,
  };
}

export { capabilityManifest, composerSchema, emptyState, searchSchema, surfaceAction };
