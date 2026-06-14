import {
  ArrowRightLeft,
  AudioWaveform,
  BarChart3,
  Bot,
  CircleDot,
  ClipboardList,
  Database,
  Delete,
  Hash,
  Loader2,
  Mic,
  MicOff,
  Pause,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Search,
  Settings,
  StickyNote,
  Timer,
  Users,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TelnyxRTC } from "@telnyx/webrtc";
import { linkApi, type ConnectorStatus, type PhoneAssistantOption, type PhoneNumberOption, type ViewId, type WebRtcStatus } from "../api.js";
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
};

const TOKEN_EXPIRING_SOON_CODE = 34001;

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
  const [dialString, setDialString] = useState(() => previewMode ? normalizeDialString(initialDialNumber || "15551234567") : "");
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
  const [selectedCallBotId, setSelectedCallBotId] = useState("");
  const [assistantInviteStatus, setAssistantInviteStatus] = useState("");
  const [assistantInviteBusy, setAssistantInviteBusy] = useState(false);
  const [callNotes, setCallNotes] = useState("");
  const [disposition, setDisposition] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const clientRef = useRef<SdkClient | null>(null);
  const activeCallRef = useRef<SdkCall | null>(null);
  const subscribedCallsRef = useRef<WeakSet<SdkCall>>(new WeakSet());
  const durationTimerRef = useRef<number | null>(null);
  const callEndedTimerRef = useRef<number | null>(null);
  const invitedAssistantRef = useRef("");

  const callerNumber = previewMode ? linkedPhoneNumber.trim() || config.outboundNumber || "+14155550100" : linkedPhoneNumber.trim();
  const dialDigits = dialString.replace(/[^0-9*#]/g, "");
  const displayedDialDigits = dialDigits === "0" ? "" : dialDigits;
  const normalizedDialString = displayedDialDigits ? `+${displayedDialDigits}` : "";
  const dialHasEditableDigits = displayedDialDigits.length > 0;
  const canCall = previewMode || Boolean(callerNumber && normalizedDialString && webRtcStatus?.ready && callState !== "connecting");
  const isInCall = previewMode ? previewPhase === "in-call" : callState === "dialing" || callState === "ringing" || callState === "active" || callState === "held";
  const isIncoming = !previewMode && activeCallRef.current?.direction === "inbound" && callState === "ringing";
  const currentPhase: DialerFeaturePhase = previewMode ? previewPhase : callState === "ended" ? "post-call" : isInCall ? "in-call" : "pre-call";
  const currentPhaseLabel = currentPhase === "pre-call" ? "Pre-call" : currentPhase === "in-call" ? "In-call" : "Post-call";

  const orderedActions = useMemo(() => {
    const byId = new Map(dialerActions.map((action) => [action.id, action]));
    return config.actions.map((id) => byId.get(id)).filter(Boolean);
  }, [config.actions]);
  const showAgentInviteAction = config.actions.includes("agent");
  const enabledFeatureIds = useMemo(() => new Set(config.enabledFeatures), [config.enabledFeatures]);
  const visiblePhaseFeatures = useMemo(
    () => dialerFeatures.filter((feature) => feature.phase === currentPhase && enabledFeatureIds.has(feature.id)),
    [currentPhase, enabledFeatureIds],
  );
  const connectedConnectorIds = useMemo(
    () => new Set(connectors.filter((connector) => connector.status === "connected" || connector.status === "signed_in").map((connector) => connector.id)),
    [connectors],
  );
  const callerNumberOptions = useMemo(() => {
    const items = phoneNumbers.filter((number) => number.phoneNumber);
    if (callerNumber && !items.some((number) => number.phoneNumber === callerNumber)) {
      return [{ phoneNumber: callerNumber, countryCode: "", features: [] }, ...items];
    }
    return items;
  }, [callerNumber, phoneNumbers]);
  const callBotOptions = useMemo<CallBotOption[]>(() => previewMode ? [
    { id: "preview", label: "Voice AI assistant", agentId: "preview" },
  ] : [
    ...phoneAssistants.map((assistant) => ({
      id: `telnyx:${assistant.id}`,
      label: assistant.name,
      agentId: assistant.id,
    })),
  ], [phoneAssistants, previewMode]);
  const selectedCallBot = selectedCallBotId ? callBotOptions.find((bot) => bot.id === selectedCallBotId) : undefined;

  useEffect(() => {
    setShowKeypad((current) => current || config.showNumpad);
  }, [config.showNumpad]);

  useEffect(() => {
    if (!initialDialNumber || isInCall) return;
    setDialString(normalizeDialString(initialDialNumber));
  }, [initialDialNumber, initialDialNumberRequestId, isInCall]);

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
    if (previewMode) {
      setSelectedCallBotId("preview");
      return;
    }
    setSelectedCallBotId((current) => current && callBotOptions.some((bot) => bot.id === current) ? current : "");
  }, [callBotOptions, previewMode]);

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
        await connectWebRtc(status);
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
    const destinationNumber = normalizeDialString(dialString);
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
      setIsRecording(false);
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

  function appendDigit(digit: string) {
    if (isInCall && activeCallRef.current?.dtmf) {
      activeCallRef.current.dtmf(digit);
      setStatusText(`Sent DTMF ${digit}`);
      return;
    }
    if (digit === "0" && dialDigits.length === 0) return;
    setDialString((current) => normalizeEditableDialString(`${current}${digit}`));
  }

  function deleteDigit() {
    setDialString((current) => normalizeDialString(current.slice(0, -1)));
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

  async function inviteAssistantToCall({ automatic = false }: { automatic?: boolean } = {}) {
    if (!isInCall) return;
    const bot = selectedCallBot;
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
    if (feature.id === "crm") {
      const provider = String(featureSetting("crm", "crm-provider", "Salesforce MCP"));
      const ready = crmProviderReady(provider);
      return (
        <>
          <div className="linkSoftphoneModuleRow">
            <span>Number</span>
            <strong>{normalizedDialString || callerNumber || "Waiting"}</strong>
            <em className={ready ? "ready" : "pending"}>{ready ? "Connected" : "Connect MCP"}</em>
          </div>
          <div className="linkSoftphoneModuleRow">
            <span>Contact</span>
            <strong>{ready ? "Salesforce match" : "Salesforce MCP"}</strong>
            <em>{provider}</em>
          </div>
          <p>{ready ? "Contact, account, history, and open opportunities will preview from Salesforce for the entered number." : "Connect Salesforce MCP to preview contact data for the entered number."}</p>
        </>
      );
    }

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

        <section className="linkSoftphoneIdentity">
          <label className="linkSoftphoneNumberField">
            <span>Your number</span>
            <div className="linkSoftphoneBotPicker linkSoftphoneNumberPicker">
              <PhoneCall size={17} aria-hidden="true" />
              <select
                value={callerNumber}
                onChange={(event) => selectCallerNumber(event.target.value)}
                aria-label="Your number"
                disabled={isInCall || callerNumberOptions.length === 0}
              >
                {callerNumberOptions.length === 0 && <option value="">No numbers</option>}
                {callerNumberOptions.map((number) => (
                  <option value={number.phoneNumber} key={number.phoneNumber}>
                    {number.phoneNumber}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="linkSoftphoneBotField" title={selectedCallBot ? `Invite ${selectedCallBot.label}` : "Select bot to invite"}>
            <span>Include bot</span>
            <div className="linkSoftphoneBotPicker">
              <Bot size={17} aria-hidden="true" />
              <select
                value={selectedCallBotId}
                onChange={(event) => setSelectedCallBotId(event.target.value)}
                aria-label="Include bot"
              >
                <option value="">None</option>
                {callBotOptions.map((bot) => (
                  <option value={bot.id} key={bot.id}>
                    {bot.label}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </section>

        <section className="linkSoftphoneContactCard">
          <div>
            <span>Call Contact or Bot</span>
            <div className="linkSoftphoneDialInput">
              <span aria-hidden="true">+</span>
              <input
                aria-label="Call Contact or Bot"
                type="tel"
                value={displayedDialDigits}
                onChange={(event) => setDialString(normalizeEditableDialString(event.target.value))}
                placeholder="15551234567"
                disabled={isInCall}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canCall) void startCall();
                }}
              />
            </div>
          </div>
          <div className="linkSoftphoneContactShortcuts">
            {dialHasEditableDigits && !isInCall ? (
              <button className="linkSoftphoneContactShortcut delete" type="button" onClick={deleteDigit} aria-label="Delete last digit" title="Delete last digit">
                <Delete size={24} />
              </button>
            ) : (
              <button className="linkSoftphoneContactShortcut contactBot" type="button" onClick={openPhoneContacts} aria-label="Open contacts and Telnyx bots" title="Open contacts and Telnyx bots">
                <Users size={24} />
              </button>
            )}
          </div>
        </section>

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
