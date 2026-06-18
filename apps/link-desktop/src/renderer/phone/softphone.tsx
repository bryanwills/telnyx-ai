import {
  ArrowRightLeft,
  AudioWaveform,
  BarChart3,
  Bot,
  CircleDot,
  ClipboardList,
  Database,
  Delete,
  Check,
  ChevronDown,
  Hash,
  Loader2,
  Mic,
  MicOff,
  MoreHorizontal,
  Pause,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  Search,
  Settings,
  StickyNote,
  Timer,
  Users,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TelnyxRTC } from "@telnyx/webrtc";
import { linkApi, type ConnectorStatus, type GoogleContact, type PhoneAssistantOption, type PhoneCallHistoryRow, type PhoneNumberOption, type ViewId, type WebRtcStatus } from "../api.js";
import { dialerActions, dialerFeatures, dialpadKeys, type DialerConfig, type DialerFeature, type DialerFeaturePhase } from "./dialer-config.js";

type SdkCall = {
  id?: string;
  telnyxCallControlId?: string;
  state?: string;
  direction?: "inbound" | "outbound";
  remotePartyNumber?: string;
  remotePartyName?: string;
  getTelnyxIds?: () => {
    telnyxCallControlId?: string;
    telnyxSessionId?: string;
    telnyxLegId?: string;
  };
  answer?: () => unknown;
  hangup?: () => unknown;
  hold?: () => unknown;
  unhold?: () => unknown;
  muteAudio?: () => unknown;
  unmuteAudio?: () => unknown;
  dtmf?: (digit: string) => unknown;
  on?: (event: string, handler: (notification: SdkNotification) => void) => unknown;
};

type SdkNotification = {
  type?: string;
  call?: SdkCall;
  error?: Error;
};

type SdkClient = InstanceType<typeof TelnyxRTC> & {
  remoteElement?: string;
  newCall: (input: Record<string, unknown>) => SdkCall;
  connect: () => unknown;
  disconnect: () => unknown;
  removeAllListeners?: () => unknown;
  updateToken?: (token: string) => unknown;
  on: (event: string, handler: (payload?: unknown) => void) => SdkClient;
};

type CallState = "idle" | "connecting" | "ready" | "dialing" | "ringing" | "active" | "held" | "ended" | "error";
type CallBotOption = {
  id: string;
  label: string;
  agentId: string;
  phoneNumber?: string;
  description?: string;
  status?: string;
};

type CallTargetOption = {
  id: string;
  label: string;
  detail: string;
  phone: string;
  source: string;
  kind: "contact" | "bot";
  botId?: string;
};

const TOKEN_EXPIRING_SOON_CODE = 34001;
const RECORD_CALL_DEFAULT_STORAGE_KEY = "telnyx-link-record-call-default";

const actionIconMap = {
  mute: MicOff,
  hold: Pause,
  transfer: ArrowRightLeft,
  end: PhoneOff,
  speaker: Volume2,
  agent: Bot,
  dial: Hash,
  record: CircleDot,
} as const;

const featureIconMap = {
  "local-calling": PhoneCall,
  notes: StickyNote,
  "salesforce-notes-sync": Database,
  crm: Database,
  transcription: AudioWaveform,
  dispositions: ClipboardList,
  analytics: BarChart3,
} as const;

function normalizeDialString(value: string) {
  const cleaned = value.replace(/[^0-9*#]/g, "");
  return cleaned ? `+${cleaned}` : "";
}

function normalizeEditableDialString(value: string) {
  const cleaned = value.replace(/[^0-9*#]/g, "");
  return cleaned === "0" ? "" : normalizeDialString(cleaned);
}

function resolveDialDestination(digits: string, callerNumber: string, localCallingDefault: boolean) {
  const cleaned = digits.replace(/[^0-9*#]/g, "");
  if (!cleaned) return "";
  if (!localCallingDefault) return `+${cleaned}`;
  const callerDigits = compactPhoneNumber(callerNumber);
  const usesNanpCaller = callerDigits.length === 11 && callerDigits.startsWith("1");
  if (usesNanpCaller && cleaned.length === 10) return `+1${cleaned}`;
  if (usesNanpCaller && cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
  return `+${cleaned}`;
}

function compactPhoneNumber(value: string) {
  return value.replace(/\D/g, "");
}

function phoneNumbersMatch(left: string, right: string) {
  const normalizedLeft = compactPhoneNumber(left);
  const normalizedRight = compactPhoneNumber(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function callTimestampMs(call: PhoneCallHistoryRow) {
  const timestamp = call.startedAt ? Date.parse(call.startedAt) : NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatCallDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return "0s";
  const wholeSeconds = Math.round(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  if (minutes <= 0) return `${wholeSeconds}s`;
  return `${minutes}m ${remainder}s`;
}

function callDirectionLabel(direction: PhoneCallHistoryRow["direction"]) {
  return direction === "inbound" ? "Incoming" : "Outgoing";
}

function callStatusLabel(status: PhoneCallHistoryRow["status"]) {
  switch (status) {
    case "answered":
      return "Answered";
    case "missed":
      return "Missed";
    case "voicemail":
      return "Voicemail";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function defaultRecordingEnabled(config: DialerConfig) {
  return Boolean(config.featureSettings.recording?.["recording-auto"] ?? true);
}

function readRecordCallDefault(config: DialerConfig) {
  if (typeof window === "undefined") return defaultRecordingEnabled(config);
  const stored = window.localStorage.getItem(RECORD_CALL_DEFAULT_STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return defaultRecordingEnabled(config);
}

function writeRecordCallDefault(enabled: boolean) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(RECORD_CALL_DEFAULT_STORAGE_KEY, String(enabled));
  }
}

function eventPathContains(event: Event, node: Node | null) {
  if (!node) return false;
  return event.composedPath().includes(node);
}

export function LinkSoftphone({
  config,
  linkedPhoneNumber,
  setLinkedPhoneNumber,
  telnyxApiReady,
  setView,
  openPhoneContacts,
  connectors,
  initialDialNumber = "",
  initialDialNumberRequestId = 0,
  previewMode = false,
  previewPhase = "pre-call",
}: {
  config: DialerConfig;
  linkedPhoneNumber: string;
  setLinkedPhoneNumber: (phoneNumber: string) => void;
  telnyxApiReady: boolean;
  setView: (view: ViewId) => void;
  openPhoneContacts: () => void;
  connectors: ConnectorStatus[];
  initialDialNumber?: string;
  initialDialNumberRequestId?: number;
  previewMode?: boolean;
  previewPhase?: DialerFeaturePhase;
}) {
  const initialNormalizedDialString = previewMode ? normalizeDialString(initialDialNumber || "15551234567") : "";
  const [dialString, setDialString] = useState(initialNormalizedDialString);
  const [callSearchQuery, setCallSearchQuery] = useState(initialNormalizedDialString);
  const [callTargetResultsOpen, setCallTargetResultsOpen] = useState(false);
  const [callOptionsMenuOpen, setCallOptionsMenuOpen] = useState(false);
  const [activeCallTarget, setActiveCallTarget] = useState<CallTargetOption | null>(null);
  const [showCallSearch, setShowCallSearch] = useState(true);
  const [callState, setCallState] = useState<CallState>("idle");
  const [statusText, setStatusText] = useState("Idle");
  const [webRtcStatus, setWebRtcStatus] = useState<WebRtcStatus | null>(null);
  const [webRtcError, setWebRtcError] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [showKeypad, setShowKeypad] = useState(config.showNumpad);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberOption[]>([]);
  const [phoneAssistants, setPhoneAssistants] = useState<PhoneAssistantOption[]>([]);
  const [callHistoryRows, setCallHistoryRows] = useState<PhoneCallHistoryRow[]>([]);
  const [loadingCallHistory, setLoadingCallHistory] = useState(false);
  const [googleContacts, setGoogleContacts] = useState<GoogleContact[]>([]);
  const [selectedCallBotId, setSelectedCallBotId] = useState("");
  const [assistantInviteStatus, setAssistantInviteStatus] = useState("");
  const [assistantInviteBusy, setAssistantInviteBusy] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const [disposition, setDisposition] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordCallByDefault, setRecordCallByDefault] = useState(() => readRecordCallDefault(config));
  const clientRef = useRef<SdkClient | null>(null);
  const activeCallRef = useRef<SdkCall | null>(null);
  const subscribedCallsRef = useRef<WeakSet<SdkCall>>(new WeakSet());
  const durationTimerRef = useRef<number | null>(null);
  const callEndedTimerRef = useRef<number | null>(null);
  const invitedAssistantRef = useRef("");
  const callSearchRef = useRef<HTMLElement | null>(null);
  const callOptionsMenuRef = useRef<HTMLDivElement | null>(null);

  const callerNumber = previewMode ? linkedPhoneNumber.trim() || config.outboundNumber || "+14155550100" : linkedPhoneNumber.trim();
  const localCallingByDefault = config.showCountryPrefix;
  const dialDigits = dialString.replace(/[^0-9*#]/g, "");
  const displayedDialDigits = dialDigits === "0" ? "" : dialDigits;
  const normalizedDialString = displayedDialDigits ? `+${displayedDialDigits}` : "";
  const resolvedDialString = resolveDialDestination(displayedDialDigits, callerNumber, localCallingByDefault);
  const dialHasEditableDigits = displayedDialDigits.length > 0;
  const canCall = previewMode || Boolean(callerNumber && resolvedDialString && webRtcStatus?.ready && callState !== "connecting");
  const isInCall = previewMode ? previewPhase === "in-call" : callState === "dialing" || callState === "ringing" || callState === "active" || callState === "held";
  const isIncoming = !previewMode && activeCallRef.current?.direction === "inbound" && callState === "ringing";
  const currentPhase: DialerFeaturePhase = previewMode ? previewPhase : callState === "ended" ? "post-call" : isInCall ? "in-call" : "pre-call";
  const currentPhaseLabel = currentPhase === "pre-call" ? "Pre-call" : currentPhase === "in-call" ? "In-call" : "Post-call";
  const showActiveCallSummary = isInCall && !isIncoming;
  const showPostCallSummary = currentPhase === "post-call";

  const orderedActions = useMemo(() => {
    const byId = new Map(dialerActions.map((action) => [action.id, action]));
    return config.actions.map((id) => byId.get(id)).filter(Boolean);
  }, [config.actions]);
  const showAgentInviteAction = config.actions.includes("agent");
  const enabledFeatureIds = useMemo(() => new Set(config.enabledFeatures), [config.enabledFeatures]);
  const visiblePhaseFeatures = useMemo(
    () => dialerFeatures.filter((feature) =>
      feature.phase === currentPhase
      && enabledFeatureIds.has(feature.id)
      && feature.id !== "local-calling"
      && feature.id !== "crm"),
    [currentPhase, enabledFeatureIds],
  );
  const connectedConnectorIds = useMemo(
    () => new Set(connectors.filter((connector) => connector.status === "connected" || connector.status === "signed_in").map((connector) => connector.id)),
    [connectors],
  );
  const googleContactsReady = connectors.some((connector) => ["google", "google-drive", "google-calendar", "google-workspace"].includes(connector.id) && (connector.status === "connected" || connector.status === "signed_in"));
  const callerNumberOptions = useMemo(() => {
    const items = phoneNumbers.filter((number) => number.phoneNumber);
    if (callerNumber && !items.some((number) => number.phoneNumber === callerNumber)) {
      return [{ phoneNumber: callerNumber, countryCode: "", features: [] }, ...items];
    }
    return items;
  }, [callerNumber, phoneNumbers]);
  const callBotOptions = useMemo<CallBotOption[]>(() => previewMode ? [
    { id: "preview", label: "Voice AI assistant", agentId: "preview", phoneNumber: normalizedDialString || "+15551234567", status: "Available" },
  ] : [
    ...phoneAssistants.map((assistant) => ({
      id: `telnyx:${assistant.id}`,
      label: assistant.name,
      agentId: assistant.id,
      phoneNumber: assistant.phoneNumber,
      description: assistant.description,
      status: assistant.status,
    })),
  ], [normalizedDialString, phoneAssistants, previewMode]);
  const selectedCallBot = selectedCallBotId ? callBotOptions.find((bot) => bot.id === selectedCallBotId) : undefined;
  const callableTargets = useMemo<CallTargetOption[]>(() => {
    const botTargets = callBotOptions
      .filter((bot) => Boolean(bot.phoneNumber))
      .map((bot) => ({
        id: `bot:${bot.id}`,
        label: bot.label,
        detail: bot.description || bot.status || "Telnyx Voice AI assistant",
        phone: bot.phoneNumber ?? "",
        source: "Telnyx",
        kind: "bot" as const,
        botId: bot.id,
      }));
    const contactTargets = googleContacts
      .filter((contact) => Boolean(contact.phone))
      .map((contact) => ({
        id: `contact:${contact.id}`,
        label: contact.name,
        detail: contact.role || contact.detail || "Google contact",
        phone: contact.phone,
        source: "Google",
        kind: "contact" as const,
      }));
    return [...botTargets, ...contactTargets].sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }));
  }, [callBotOptions, googleContacts]);
  const filteredCallableTargets = useMemo(() => {
    const rawQuery = callSearchQuery.trim().toLowerCase();
    const normalizedQuery = rawQuery.replace(/^\+/, "");
    if (!rawQuery) return callableTargets.slice(0, 5);
    return callableTargets
      .filter((target) => {
        const searchText = `${target.label} ${target.detail} ${target.phone} ${target.phone.replace(/[^0-9*#]/g, "")} ${target.source} ${target.kind}`.toLowerCase();
        return searchText.includes(rawQuery) || searchText.includes(normalizedQuery);
      })
      .slice(0, 5);
  }, [callSearchQuery, callableTargets]);
  const callSearchHasNameCharacters = /[A-Za-z]/.test(callSearchQuery);
  const selectedCallerNumber = callerNumberOptions.find((number) => number.phoneNumber === callerNumber);
  const matchedCallTarget = useMemo(() => {
    if (resolvedDialString) {
      const matchedByNumber = callableTargets.find((target) => phoneNumbersMatch(target.phone, resolvedDialString));
      if (matchedByNumber) return matchedByNumber;
    }

    const query = callSearchQuery.trim().toLowerCase();
    if (!query) return null;
    const queryDigits = compactPhoneNumber(callSearchQuery);
    const exactTarget = filteredCallableTargets.find((target) => target.label.trim().toLowerCase() === query || (queryDigits && phoneNumbersMatch(target.phone, queryDigits)));
    if (exactTarget) return exactTarget;
    return filteredCallableTargets.length === 1 ? filteredCallableTargets[0] : null;
  }, [callSearchQuery, callableTargets, filteredCallableTargets, resolvedDialString]);
  const effectiveCallTarget = activeCallTarget ?? matchedCallTarget;
  const showMatchedCallHistory = currentPhase === "pre-call" && enabledFeatureIds.has("crm") && Boolean(featureSetting("crm", "crm-show-history", true)) && Boolean(effectiveCallTarget?.phone);
  const matchedCallHistory = useMemo(() => {
    if (!effectiveCallTarget?.phone) return [];
    return [...callHistoryRows]
      .filter((call) => phoneNumbersMatch(call.number, effectiveCallTarget.phone))
      .sort((left, right) => callTimestampMs(right) - callTimestampMs(left))
      .slice(0, 6);
  }, [callHistoryRows, effectiveCallTarget]);

  useEffect(() => {
    setShowKeypad((current) => current || config.showNumpad);
  }, [config.showNumpad]);

  useEffect(() => {
    if (!initialDialNumber || isInCall) return;
    const nextDialString = normalizeDialString(initialDialNumber);
    setDialString(nextDialString);
    setCallSearchQuery(nextDialString);
    setShowCallSearch(true);
    setActiveCallTarget(null);
  }, [initialDialNumber, initialDialNumberRequestId, isInCall]);

  useEffect(() => {
    if (!callOptionsMenuOpen && !callTargetResultsOpen) return;
    function closeMenus(event: PointerEvent) {
      if (eventPathContains(event, callOptionsMenuRef.current) || eventPathContains(event, callSearchRef.current)) return;
      setCallOptionsMenuOpen(false);
      setCallTargetResultsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setCallOptionsMenuOpen(false);
      setCallTargetResultsOpen(false);
    }
    window.addEventListener("pointerdown", closeMenus, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenus, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [callOptionsMenuOpen, callTargetResultsOpen]);

  useEffect(() => {
    return () => {
      cleanupCallTimers();
      cleanupClient();
    };
  }, []);

  useEffect(() => {
    if (previewMode) return;
    if (callState === "active" && durationTimerRef.current === null) {
      durationTimerRef.current = window.setInterval(() => setDurationSeconds((current) => current + 1), 1000);
      return;
    }
    if (callState !== "active") stopDurationTimer();
  }, [callState, previewMode]);

  useEffect(() => {
    let cancelled = false;
    async function loadNumbers() {
      if (previewMode) {
        setPhoneNumbers([]);
        return;
      }
      if (!telnyxApiReady) {
        setPhoneNumbers([]);
        return;
      }
      try {
        const numbers = await linkApi.listAccountPhoneNumbers();
        if (cancelled) return;
        setPhoneNumbers(numbers);
        if (!callerNumber && numbers[0]?.phoneNumber) setLinkedPhoneNumber(numbers[0].phoneNumber);
      } catch (error) {
        if (cancelled) return;
        setAssistantInviteStatus(error instanceof Error ? error.message : "Unable to load Telnyx numbers.");
        setPhoneNumbers([]);
      }
    }
    void loadNumbers();
    return () => {
      cancelled = true;
    };
  }, [callerNumber, previewMode, setLinkedPhoneNumber, telnyxApiReady]);

  useEffect(() => {
    let cancelled = false;
    async function loadAssistants() {
      if (previewMode) {
        setPhoneAssistants([]);
        return;
      }
      if (!telnyxApiReady) {
        setPhoneAssistants([]);
        return;
      }
      try {
        const assistants = await linkApi.listPhoneAssistants();
        if (cancelled) return;
        setPhoneAssistants(assistants);
      } catch (error) {
        if (cancelled) return;
        setAssistantInviteStatus(error instanceof Error ? error.message : "Unable to load Voice AI assistants.");
        setPhoneAssistants([]);
      }
    }
    void loadAssistants();
    return () => {
      cancelled = true;
    };
  }, [previewMode, telnyxApiReady]);

  useEffect(() => {
    let cancelled = false;
    async function loadGoogleContacts() {
      if (previewMode || !googleContactsReady) {
        setGoogleContacts([]);
        return;
      }
      try {
        const contacts = await linkApi.listGoogleContacts();
        if (!cancelled) setGoogleContacts(contacts);
      } catch {
        if (!cancelled) setGoogleContacts([]);
      }
    }
    void loadGoogleContacts();
    return () => {
      cancelled = true;
    };
  }, [googleContactsReady, previewMode]);

  useEffect(() => {
    let cancelled = false;
    async function loadCallHistory() {
      if (!previewMode && !telnyxApiReady) {
        setCallHistoryRows([]);
        setLoadingCallHistory(false);
        return;
      }
      setLoadingCallHistory(true);
      try {
        const rows = await linkApi.listPhoneCallHistory({ maxResults: 50 });
        if (!cancelled) setCallHistoryRows(rows);
      } catch {
        if (!cancelled) setCallHistoryRows([]);
      } finally {
        if (!cancelled) setLoadingCallHistory(false);
      }
    }
    void loadCallHistory();
    return () => {
      cancelled = true;
    };
  }, [previewMode, telnyxApiReady]);

  useEffect(() => {
    if (previewMode) {
      setSelectedCallBotId("preview");
      return;
    }
    setSelectedCallBotId((current) => current && callBotOptions.some((bot) => bot.id === current) ? current : "");
  }, [callBotOptions, previewMode]);

  useEffect(() => {
    if (!activeCallTarget) {
      setShowCallSearch(true);
      return;
    }
    setShowCallSearch(false);
  }, [activeCallTarget?.id]);

  useEffect(() => {
    if (previewMode) return;
    if (callState === "active" && selectedCallBot) void inviteAssistantToCall({ automatic: true });
  }, [callState, previewMode, selectedCallBotId]);

  const connectWebRtc = useCallback(async (knownStatus?: WebRtcStatus) => {
    const status = knownStatus ?? await linkApi.getWebRtcStatus();
    setWebRtcStatus(status);
    if (!status.ready) {
      setStatusText(status.message);
      return;
    }
    if (clientRef.current) return;

    setCallState("connecting");
    setStatusText("Connecting to Telnyx WebRTC");
    setWebRtcError("");
    try {
      const { token } = await linkApi.getWebRtcToken({ callerNumber });
      const client = new TelnyxRTC({
        login_token: token,
        debug: false,
        enableCallReports: true,
      }) as SdkClient;
      client.remoteElement = "link-phone-remote-audio";
      client
        .on("telnyx.ready", () => {
          setCallState((current) => (current === "connecting" || current === "error" ? "ready" : current));
          setStatusText("Ready");
          setWebRtcError("");
        })
        .on("telnyx.error", (error) => {
          setCallState("error");
          setWebRtcError(error instanceof Error ? error.message : "Telnyx WebRTC connection error.");
          setStatusText("Connection error");
        })
        .on("telnyx.warning", (warning) => {
          const code = warning && typeof warning === "object" && "code" in warning ? Number((warning as { code?: number }).code) : 0;
          if (code === TOKEN_EXPIRING_SOON_CODE) void refreshWebRtcToken();
        })
        .on("telnyx.notification", (notification) => {
          handleNotification(notification as SdkNotification);
        });
      clientRef.current = client;
      client.connect();
    } catch (error) {
      setCallState("error");
      setWebRtcError(error instanceof Error ? error.message : "Unable to connect to Telnyx WebRTC.");
      setStatusText("Connection error");
    }
  }, [callerNumber]);

  useEffect(() => {
    if (previewMode) return;
    let cancelled = false;
    async function loadStatus() {
      try {
        const status = await linkApi.getWebRtcStatus();
        if (cancelled) return;
        setWebRtcStatus(status);
        if (!status.ready) {
          setCallState("idle");
          setStatusText(status.message);
          return;
        }
        setWebRtcError("");
        setCallState((current) => current === "error" ? "idle" : current);
        setStatusText("Ready to call");
      } catch (error) {
        if (cancelled) return;
        setWebRtcError(error instanceof Error ? error.message : "Unable to check WebRTC status.");
        setCallState("error");
      }
    }
    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [connectWebRtc, previewMode]);

  async function refreshWebRtcToken() {
    const client = clientRef.current;
    if (!client?.updateToken) return;
    try {
      const { token } = await linkApi.getWebRtcToken({ callerNumber });
      client.updateToken(token);
    } catch (error) {
      setWebRtcError(error instanceof Error ? error.message : "Unable to refresh WebRTC token.");
    }
  }

  function handleNotification(notification: SdkNotification) {
    if (notification.type !== "callUpdate" || !notification.call) return;
    const call = notification.call;
    activeCallRef.current = call;
    if (call.on && !subscribedCallsRef.current.has(call)) {
      subscribedCallsRef.current.add(call);
      call.on("telnyx.notification", handleNotification);
    }

    const remote = call.remotePartyName || call.remotePartyNumber || "Unknown caller";
    switch (call.state) {
      case "requesting":
        setCallState("dialing");
        setStatusText(`Calling ${remote}`);
        break;
      case "ringing":
        setCallState("ringing");
        setStatusText(call.direction === "inbound" ? `Incoming call from ${remote}` : `Ringing ${remote}`);
        break;
      case "active":
        setCallState("active");
        setIsHeld(false);
        setStatusText(`In call with ${remote}`);
        break;
      case "held":
        setCallState("held");
        setIsHeld(true);
        setStatusText("On hold");
        break;
      case "hangup":
      case "destroy":
        finishCall("Call ended");
        break;
      default:
        if (call.state) setStatusText(call.state);
    }
  }

  async function startCall() {
    if (previewMode) return;
    const destinationNumber = resolveDialDestination(dialString, callerNumber, localCallingByDefault);
    if (!destinationNumber || !callerNumber) return;
    await connectWebRtc();
    const client = clientRef.current;
    if (!client) return;
    try {
      setStatusText(`Calling ${destinationNumber}`);
      setCallState("dialing");
      setDurationSeconds(0);
      setCallNotes("");
      setDisposition("");
      setIsRecording(recordCallByDefault);
      invitedAssistantRef.current = "";
      const call = client.newCall({
        destinationNumber,
        callerNumber,
        audio: true,
        remoteElement: "link-phone-remote-audio",
      }) as SdkCall;
      activeCallRef.current = call;
      const callWithEvents = call as SdkCall & { on?: (event: string, handler: (notification: SdkNotification) => void) => unknown };
      callWithEvents.on?.("telnyx.notification", handleNotification);
    } catch (error) {
      setCallState("error");
      setWebRtcError(error instanceof Error ? error.message : "Unable to start call.");
    }
  }

  function updateCallSearch(value: string) {
    setCallSearchQuery(value);
    setCallTargetResultsOpen(true);
    setCallOptionsMenuOpen(false);
    if (/[0-9*#]/.test(value)) {
      setDialString(normalizeEditableDialString(value));
      return;
    }
    if (!value.trim()) setDialString("");
  }

  function selectCallTarget(target: CallTargetOption) {
    const nextDialString = normalizeDialString(target.phone);
    setDialString(nextDialString);
    setCallSearchQuery("");
    setCallTargetResultsOpen(false);
    if (target.botId) setSelectedCallBotId(target.botId);
    setActiveCallTarget(target);
    setShowCallSearch(false);
    setStatusText(`${target.label} selected`);
  }

  function toggleRecordCallDefault(enabled: boolean) {
    setRecordCallByDefault(enabled);
    writeRecordCallDefault(enabled);
    if (isInCall) setIsRecording(enabled);
    setStatusText(enabled ? "Recording on by default" : "Recording off by default");
  }

  function selectCallBotFromMenu(bot: CallBotOption) {
    setSelectedCallBotId(bot.id);
    setCallOptionsMenuOpen(false);
    if (isInCall) {
      void inviteAssistantToCall({ bot });
      return;
    }
    setAssistantInviteStatus(`${bot.label} will join when the call connects.`);
  }

  function appendDigit(digit: string) {
    if (isInCall && activeCallRef.current?.dtmf) {
      activeCallRef.current.dtmf(digit);
      setStatusText(`Sent DTMF ${digit}`);
      return;
    }
    if (digit === "0" && dialDigits.length === 0) return;
    const nextDialString = normalizeEditableDialString(`${dialDigits}${digit}`);
    setDialString(nextDialString);
    setCallSearchQuery(nextDialString);
    setCallTargetResultsOpen(false);
  }

  function deleteDigit() {
    const nextDialString = normalizeDialString(dialDigits.slice(0, -1));
    setDialString(nextDialString);
    setCallSearchQuery(nextDialString);
    setCallTargetResultsOpen(false);
  }

  function selectCallerNumber(phoneNumber: string) {
    if (previewMode) return;
    if (!phoneNumber || phoneNumber === callerNumber) return;
    if (!isInCall) cleanupClient();
    setLinkedPhoneNumber(phoneNumber);
    setStatusText("Number selected");
    setWebRtcError("");
  }

  function answerCall() {
    activeCallRef.current?.answer?.();
    setStatusText("Answering");
  }

  function hangupCall() {
    activeCallRef.current?.hangup?.();
    finishCall("Call ended");
  }

  function toggleMute() {
    const call = activeCallRef.current;
    if (!call) return;
    if (isMuted) call.unmuteAudio?.();
    else call.muteAudio?.();
    setIsMuted((current) => !current);
  }

  function toggleHold() {
    const call = activeCallRef.current;
    if (!call) return;
    if (isHeld) call.unhold?.();
    else call.hold?.();
    setIsHeld((current) => !current);
    setCallState(isHeld ? "active" : "held");
  }

  function finishCall(message: string) {
    setCallState("ended");
    setStatusText(message);
    setIsMuted(false);
    setIsHeld(false);
    setAssistantInviteBusy(false);
    setAssistantInviteStatus("");
    invitedAssistantRef.current = "";
    stopDurationTimer();
    activeCallRef.current = null;
  }

  function cleanupCallTimers() {
    stopDurationTimer();
    if (callEndedTimerRef.current) {
      window.clearTimeout(callEndedTimerRef.current);
      callEndedTimerRef.current = null;
    }
  }

  function stopDurationTimer() {
    if (durationTimerRef.current !== null) {
      window.clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }

  function cleanupClient() {
    try {
      activeCallRef.current?.hangup?.();
      clientRef.current?.removeAllListeners?.();
      clientRef.current?.disconnect?.();
    } catch {
      // Best effort cleanup on unmount.
    }
    clientRef.current = null;
    activeCallRef.current = null;
    subscribedCallsRef.current = new WeakSet();
  }

  function handleAction(actionId: string) {
    switch (actionId) {
      case "mute":
        toggleMute();
        break;
      case "hold":
        toggleHold();
        break;
      case "end":
        hangupCall();
        break;
      case "speaker":
        setIsSpeakerOn((current) => !current);
        break;
      case "dial":
        setShowKeypad((current) => !current);
        break;
      case "record":
        setIsRecording((current) => !current);
        setStatusText(isRecording ? "Recording stopped" : "Recording marked");
        break;
      case "agent":
        void inviteAssistantToCall();
        break;
      case "transfer":
        setStatusText("Choose a transfer target from the connected directory.");
        break;
      default:
        setStatusText(`${actionLabel(actionId)} is configured but not wired yet.`);
    }
  }

  function actionLabel(actionId: string) {
    return dialerActions.find((action) => action.id === actionId)?.label ?? actionId;
  }

  function activeCallControlId() {
    const call = activeCallRef.current;
    return call?.telnyxCallControlId || call?.getTelnyxIds?.().telnyxCallControlId || "";
  }

  async function inviteAssistantToCall({ automatic = false, bot: botOverride }: { automatic?: boolean; bot?: CallBotOption } = {}) {
    if (!isInCall) return;
    const bot = botOverride ?? selectedCallBot;
    if (!bot) {
      if (!automatic) setAssistantInviteStatus("Select a Telnyx Voice AI assistant before including a bot.");
      return;
    }
    const callControlId = activeCallControlId();
    if (!callControlId) {
      if (!automatic) setAssistantInviteStatus("This WebRTC call has not exposed a Telnyx Call Control ID yet.");
      return;
    }
    const inviteKey = `${callControlId}:${bot.agentId}`;
    if (invitedAssistantRef.current === inviteKey) return;
    setAssistantInviteBusy(true);
    setAssistantInviteStatus("Including bot");
    try {
      await linkApi.startAiAssistantOnCall({ callControlId, assistantId: bot.agentId });
      invitedAssistantRef.current = inviteKey;
      setAssistantInviteStatus(`${bot.label} included in the call.`);
    } catch (error) {
      setAssistantInviteStatus(error instanceof Error ? error.message : "Unable to invite the AI agent.");
    } finally {
      setAssistantInviteBusy(false);
    }
  }

  const duration = `${Math.floor(durationSeconds / 60).toString().padStart(2, "0")}:${(durationSeconds % 60).toString().padStart(2, "0")}`;
  const previewDuration = previewMode ? "12:48" : duration;
  const previewCost = previewMode ? "$0.24" : "$0.00";

  function featureSetting(featureId: string, settingId: string, fallback: string | boolean) {
    return config.featureSettings[featureId]?.[settingId] ?? fallback;
  }

  function connectorReady(ids: string[]) {
    return ids.some((id) => connectedConnectorIds.has(id));
  }

  function crmProviderReady(provider: string) {
    const normalized = provider.toLowerCase();
    if (normalized.includes("salesforce")) return connectorReady(["salesforce"]);
    return connectorReady(["salesforce"]);
  }

  function renderFeatureModule(feature: DialerFeature) {
    const Icon = featureIconMap[feature.id as keyof typeof featureIconMap] ?? Database;
    return (
      <article className={`linkSoftphoneFeatureModule feature-${feature.id}`} key={feature.id}>
        <header>
          <Icon size={15} />
          <span>{feature.name}</span>
        </header>
        {renderFeatureModuleBody(feature)}
      </article>
    );
  }

  function renderFeatureModuleBody(feature: DialerFeature) {
    if (feature.id === "transcription") {
      return (
        <>
          <div className="linkSoftphoneModuleRow">
            <span>Language</span>
            <strong>{String(featureSetting("transcription", "transcription-lang", "English"))}</strong>
            <em>{String(featureSetting("transcription", "transcription-display", "Sidebar"))}</em>
          </div>
          <p>{isInCall ? "Live transcript will stream here when call media is available." : "Transcript saved with the call."}</p>
        </>
      );
    }

    if (feature.id === "notes") {
      return (
        <label className="linkSoftphoneModuleField">
          <span>{String(featureSetting("notes", "notes-template", "None"))} notes</span>
          <textarea value={callNotes} onChange={(event) => setCallNotes(event.target.value)} placeholder="Add call notes..." />
        </label>
      );
    }

    if (feature.id === "salesforce-notes-sync") {
      const ready = connectorReady(["salesforce"]);
      const syncEnabled = Boolean(featureSetting("salesforce-notes-sync", "sf-notes-sync", true));
      return (
        <>
          <div className="linkSoftphoneModuleRow">
            <span>Salesforce</span>
            <strong>{String(featureSetting("salesforce-notes-sync", "sf-notes-target", "Contact notes"))}</strong>
            <em className={ready ? "ready" : "pending"}>{ready ? "MCP connected" : "Needs MCP"}</em>
          </div>
          <p>{ready && syncEnabled ? "Post-call notes will sync into Salesforce Notes." : "Connect Salesforce MCP to sync post-call notes."}</p>
        </>
      );
    }

    if (feature.id === "dispositions") {
      return (
        <label className="linkSoftphoneModuleField">
          <span>{String(featureSetting("dispositions", "dispo-codes", "Basic (5 codes)"))}</span>
          <select value={disposition} onChange={(event) => setDisposition(event.target.value)}>
            <option value="">Select outcome</option>
            <option value="resolved">Resolved</option>
            <option value="follow-up">Follow-up required</option>
            <option value="no-answer">No answer</option>
            <option value="escalated">Escalated</option>
          </select>
        </label>
      );
    }

    if (feature.id === "analytics") {
      return (
        <div className="linkSoftphoneModuleMetric">
          <strong>{duration}</strong><span>duration</span>
          <strong>{orderedActions.length}</strong><span>actions</span>
        </div>
      );
    }

    return <p>{feature.description}</p>;
  }

  const showSetupState = !previewMode && (!telnyxApiReady || webRtcStatus?.ready === false || callState === "error" || Boolean(webRtcError));

  return (
    <div className={`linkSoftphone theme-${config.theme} shape-${config.shape} accent-${config.accentColor} font-${config.fontSize}`}>
      <audio id="link-phone-remote-audio" autoPlay />
      <div className="linkSoftphoneBody">
        {showPostCallSummary ? (
          <section className="linkSoftphoneWrapUpCard" aria-label="Call wrap-up">
            <div className="linkSoftphoneWrapUpHeader">
              <div className="linkSoftphoneActiveCallIcon">
                <PhoneCall size={20} />
              </div>
              <div>
                <span>Call complete</span>
                <strong>{resolvedDialString || "+15551234567"}</strong>
                <small>{selectedCallBot?.label ?? "Voice AI assistant"} participated</small>
              </div>
            </div>
            <div className="linkSoftphoneWrapUpMetrics">
              <span>Duration <strong>{previewDuration}</strong></span>
              <span>Cost <strong>{previewCost}</strong></span>
              <span>Outcome <strong>{disposition || "Needs wrap-up"}</strong></span>
            </div>
          </section>
        ) : showActiveCallSummary ? (
          <section className="linkSoftphoneActiveCallCard" aria-label="Active call">
            <div className="linkSoftphoneActiveCallIcon">
              <PhoneCall size={20} />
            </div>
            <span>Active call</span>
            <strong>{resolvedDialString || "+15551234567"}</strong>
            <small>{selectedCallBot?.label ?? "Voice AI assistant"} included</small>
            <div className="linkSoftphoneActiveCallMeta">
              <span>From <strong>{callerNumber}</strong></span>
              <span>Bot <strong>{selectedCallBot?.label ?? "Voice AI assistant"}</strong></span>
            </div>
          </section>
        ) : (
          <section className="assistantSessionBar assistantSessionSearchBar" aria-label="Call contact or bot" ref={callSearchRef}>
            {showCallSearch ? (
              <label className="assistantSessionBarTitle assistantSessionSearchField">
                <input
                  className="assistantSessionSearchInput"
                  aria-label="Call Contact or Bot"
                  type="search"
                  value={callSearchQuery}
                  onChange={(event) => updateCallSearch(event.target.value)}
                  placeholder="Contact, company, or bot"
                  spellCheck={false}
                  disabled={isInCall}
                  onFocus={() => {
                    setCallOptionsMenuOpen(false);
                    setCallTargetResultsOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && canCall) {
                      event.preventDefault();
                      setCallTargetResultsOpen(false);
                      void startCall();
                    }
                  }}
                />
              </label>
            ) : (
              <div className="assistantSessionBarTitle" title={activeCallTarget?.label || resolvedDialString}>
                <strong>{activeCallTarget?.label || resolvedDialString || "Call target"}</strong>
                <small>{activeCallTarget?.phone || "Active contact"}</small>
              </div>
            )}
            <div className="assistantSessionMenuRoot" ref={callOptionsMenuRef}>
                <button
                  className="iconButton assistantSessionMenuTrigger"
                  type="button"
                  onClick={() => {
                    setCallTargetResultsOpen(false);
                    setCallOptionsMenuOpen((open) => !open);
                  }}
                  aria-label="Call options"
                  aria-haspopup="menu"
                  aria-expanded={callOptionsMenuOpen}
                  title="Call options"
                >
                  <MoreHorizontal size={16} />
                </button>
                {callOptionsMenuOpen && (
                  <div className="linkSoftphoneSearchMenu" role="menu" aria-label="Call options">
                    <div className="linkSoftphoneSearchMenuHeader">
                      <strong>Call options</strong>
                      <small>{recordCallByDefault ? "Recording default on" : "Recording default off"}</small>
                    </div>
                    <label className="linkSoftphoneSearchMenuToggle">
                      <span><CircleDot size={15} />Record call</span>
                      <input
                        type="checkbox"
                        checked={recordCallByDefault}
                        onChange={(event) => toggleRecordCallDefault(event.target.checked)}
                      />
                    </label>
                    <div className="linkSoftphoneSearchMenuDivider" />
                    <small className="linkSoftphoneSearchMenuLabel">Invite bot</small>
                    {callBotOptions.length > 0 ? callBotOptions.map((bot) => {
                      const selected = selectedCallBotId === bot.id;
                      return (
                        <button
                          role="menuitemradio"
                          aria-checked={selected}
                          type="button"
                          key={bot.id}
                          className={selected ? "selected" : ""}
                          onClick={() => selectCallBotFromMenu(bot)}
                        >
                          <Bot size={15} />
                          <span>
                            <strong>{bot.label}</strong>
                            <small>{bot.phoneNumber || bot.status || "Voice AI assistant"}</small>
                          </span>
                          {selected && <Check size={14} />}
                        </button>
                      );
                    }) : (
                      <div className="linkSoftphoneSearchMenuEmpty">No bots available</div>
                    )}
                    <div className="linkSoftphoneSearchMenuDivider" />
                    {!showCallSearch && (
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setShowCallSearch(true);
                          setActiveCallTarget(null);
                          setCallOptionsMenuOpen(false);
                          setCallSearchQuery("");
                        }}
                      >
                        <Search size={15} />
                        <span>Search contacts</span>
                      </button>
                    )}
                    {!showCallSearch && <div className="linkSoftphoneSearchMenuDivider" />}
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setCallOptionsMenuOpen(false);
                        if (dialHasEditableDigits || callSearchQuery.trim()) {
                          setDialString("");
                          setCallSearchQuery("");
                          setActiveCallTarget(null);
                          setShowCallSearch(true);
                          setCallTargetResultsOpen(false);
                          return;
                        }
                        openPhoneContacts();
                      }}
                    >
                      {dialHasEditableDigits || callSearchQuery.trim() ? <Delete size={15} /> : <Users size={15} />}
                      <span>{dialHasEditableDigits || callSearchQuery.trim() ? "Clear search" : "Open contacts"}</span>
                    </button>
                  </div>
                )}
            </div>
            {showCallSearch && callTargetResultsOpen && callSearchQuery.trim() && (filteredCallableTargets.length > 0 || callSearchHasNameCharacters) && (
              <div className="linkSoftphoneSearchResults" role="listbox" aria-label="Callable contacts and bots">
                {filteredCallableTargets.length > 0 ? filteredCallableTargets.map((target) => (
                  <button key={target.id} type="button" role="option" aria-selected={resolvedDialString === normalizeDialString(target.phone)} onClick={() => selectCallTarget(target)}>
                    <span className="linkSoftphoneSearchResultIcon">
                      {target.kind === "bot" ? <Bot size={16} /> : <Users size={16} />}
                    </span>
                    <span>
                      <strong>{target.label}</strong>
                      <small>{target.phone} · {target.source}</small>
                    </span>
                    <em>{target.kind === "bot" ? "Bot" : "Contact"}</em>
                  </button>
                )) : (
                  <div className="linkSoftphoneSearchResultEmpty">No callable contacts or bots found</div>
                )}
              </div>
            )}
          </section>
        )}

        {showMatchedCallHistory && effectiveCallTarget && (
          <section className={`linkSoftphoneHistoryPanel ${matchedCallHistory.length === 0 ? "empty" : ""}`} aria-label="Previous calls with matched number">
            <div className="linkSoftphoneHistoryHeader">
              <div>
                <span>Previous calls</span>
                <strong>{effectiveCallTarget.label}</strong>
                <small>{effectiveCallTarget.phone}</small>
              </div>
              <em>{loadingCallHistory ? "Loading" : `${matchedCallHistory.length} found`}</em>
            </div>

            {loadingCallHistory ? (
              <div className="linkSoftphoneHistoryEmpty">
                <strong>Loading previous calls</strong>
                <small>Pulling recent call detail records for this number.</small>
              </div>
            ) : matchedCallHistory.length > 0 ? (
              <div className="linkSoftphoneHistoryList">
                {matchedCallHistory.map((call) => (
                  <article className="linkSoftphoneHistoryItem" key={call.id}>
                    <div className="linkSoftphoneHistoryItemTop">
                      <div>
                        <strong>{call.contact || effectiveCallTarget.label}</strong>
                        <small>{call.number}</small>
                      </div>
                      <span>{call.time}</span>
                    </div>
                    <div className="linkSoftphoneHistoryItemBottom">
                      <span className={`linkSoftphoneHistoryDirection ${call.direction}`}>
                        {call.direction === "inbound" ? <PhoneIncoming size={13} /> : <PhoneOutgoing size={13} />}
                        {callDirectionLabel(call.direction)}
                      </span>
                      <small>{callStatusLabel(call.status)} · {formatCallDuration(call.durationSeconds)} · {call.agentName || "Link"}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="linkSoftphoneHistoryEmpty">
                <strong>No previous calls</strong>
                <small>Recent calls with this contact or bot will appear here.</small>
              </div>
            )}
          </section>
        )}

        {showSetupState && (
          <div className="linkSoftphoneSetup">
            <div className="linkSoftphoneSetupIcon">
              <PhoneCall size={18} />
            </div>
            <div>
              <strong>{callState === "error" || webRtcError ? "Dialer needs attention" : "Finish WebRTC setup"}</strong>
              <p>{webRtcError || webRtcStatus?.message || "Save TELNYX_API_KEY in Settings. Link will create the WebRTC connection and credential automatically when the key has permission."}</p>
            </div>
            <button className="runtimeSettingsButton" type="button" onClick={() => setView("settings")}>
              <Settings size={14} />
              Open Settings
            </button>
          </div>
        )}

        {visiblePhaseFeatures.length > 0 && (
          <section className={`linkSoftphonePhaseModules phase-${currentPhase}`} aria-label={`${currentPhaseLabel} dialer modules`}>
            {visiblePhaseFeatures.map(renderFeatureModule)}
          </section>
        )}

        {isInCall && !isIncoming && (
          <div className="linkSoftphoneCallTimer" aria-label="Call duration">
            <Timer size={15} />
            <span>Duration</span>
            <strong>{duration}</strong>
          </div>
        )}

        {(showKeypad || (previewMode && currentPhase === "pre-call")) && currentPhase !== "post-call" && (
          <div className="linkSoftphoneKeypad" aria-label={isInCall ? "DTMF keypad" : "Dial pad"}>
            {dialpadKeys.map((key) => (
              <button key={key.digit} type="button" onClick={() => appendDigit(key.digit)}>
                <strong>{key.digit}</strong>
                <span>{key.letters}</span>
              </button>
            ))}
          </div>
        )}

        {isIncoming && (
          <div className="linkSoftphoneIncoming">
            <PhoneIncoming size={16} />
            <span>{statusText}</span>
            <button className="button primary" type="button" onClick={answerCall}>
              Answer
            </button>
            <button className="button secondary" type="button" onClick={hangupCall}>
              Reject
            </button>
          </div>
        )}

	        {isInCall && !isIncoming && showAgentInviteAction && (
	          <section className="linkSoftphoneAgentInvite" aria-label="Invite AI agent">
	            <div>
	              <span>AI agent</span>
	              <strong>{selectedCallBot?.label ?? "Voice AI assistant"}</strong>
	              <small>{callState === "active" ? `In call ${duration}` : statusText}</small>
	            </div>
		            {callBotOptions.length > 0 && (
		              <select value={selectedCallBotId} onChange={(event) => setSelectedCallBotId(event.target.value)} aria-label="Voice AI assistant">
		                <option value="">None</option>
		                {callBotOptions.map((bot) => (
		                  <option value={bot.id} key={bot.id}>{bot.label}</option>
		                ))}
		              </select>
		            )}
		            <button className="button secondary" type="button" onClick={() => void inviteAssistantToCall()} disabled={assistantInviteBusy || !selectedCallBot}>
		              {assistantInviteBusy ? <Loader2 size={14} className="spinning" /> : <Bot size={14} />}
		              Include Bot
		            </button>
	          </section>
	        )}
      </div>

      <div className="linkSoftphoneDock">
        {!isInCall && currentPhase !== "post-call" && (
          <label className="linkSoftphoneCallerIdBar" title={selectedCallerNumber?.countryCode ? `${selectedCallerNumber.countryCode} outbound number` : "Outbound number"}>
            <PhoneCall size={17} aria-hidden="true" />
            <span>
              <strong>{callerNumber || "No outbound number"}</strong>
            </span>
            <ChevronDown size={18} aria-hidden="true" />
            <select
              value={callerNumber}
              onChange={(event) => selectCallerNumber(event.target.value)}
              aria-label="Number used to call out"
              disabled={previewMode || callerNumberOptions.length === 0}
            >
              {callerNumberOptions.length === 0 && <option value="">No numbers</option>}
              {callerNumberOptions.map((number) => (
                <option value={number.phoneNumber} key={number.phoneNumber}>
                  {number.phoneNumber}
                </option>
              ))}
            </select>
          </label>
        )}

        {isInCall && !isIncoming ? (
          <div className="linkSoftphoneActions">
            {orderedActions.map((action) => {
              if (!action) return null;
              const Icon = actionIconMap[action.id as keyof typeof actionIconMap] ?? Hash;
              const selected = (action.id === "mute" && isMuted) || (action.id === "hold" && isHeld) || (action.id === "speaker" && isSpeakerOn) || (action.id === "record" && isRecording);
              return (
                <button
                  key={action.id}
                  type="button"
                  className={`linkSoftphoneAction ${action.style === "end" ? "end" : ""} ${selected ? "selected" : ""}`}
                  onClick={() => handleAction(action.id)}
                >
                  <Icon size={16} />
                  <span>{action.id === "mute" && isMuted ? "Unmute" : action.id === "hold" && isHeld ? "Resume" : action.label}</span>
                </button>
              );
            })}
          </div>
        ) : currentPhase === "post-call" ? (
          <button type="button" className="linkSoftphoneCallButton" onClick={() => undefined}>
            <StickyNote size={17} />
            Save wrap-up
          </button>
        ) : (
          <button type="button" className="linkSoftphoneCallButton" onClick={() => void startCall()} disabled={!canCall}>
            <PhoneCall size={17} />
            Call
          </button>
        )}

        {webRtcError && (
          <footer className="linkSoftphoneFooter">
            <strong>{webRtcError}</strong>
          </footer>
        )}
        {assistantInviteStatus && (
          <footer className="linkSoftphoneFooter">
            <span>{assistantInviteStatus}</span>
          </footer>
        )}
      </div>
    </div>
  );
}
