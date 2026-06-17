import { emptyState, surfaceAction } from "./surface-manifests.js";

/**
 * Build a JSON-safe Call workspace payload for the renderer.
 *
 * Keep `updatedAt` or `now` explicit if the caller needs deterministic
 * relative-time labels.
 */
export function buildPhoneWorkspaceViewModel(input = {}) {
  const capability = input.capability || null;
  const ready = capability?.ready !== false;
  const query = normalizeText(input.query);
  const normalizedQuery = query.toLowerCase();
  const agentFilter = normalizeFilter(input.agentFilter);
  const directionFilter = normalizeFilter(input.directionFilter);
  const statusFilter = normalizeFilter(input.statusFilter);
  const hiddenIds = new Set(normalizeStringArray(input.hiddenIds));
  const assistants = normalizeAssistantList(input.assistants);
  const calls = normalizeCallList(input.calls).filter((call) => !hiddenIds.has(call.id));
  const callRollups = rollupPhoneCallsByNumber(calls);
  const filteredCallRollups = filterCallRollups(callRollups, {
    normalizedQuery,
    agentFilter,
    directionFilter,
    statusFilter,
  });
  const selectedCallDetail = resolveSelectedRollup(input.selectedCallId, callRollups);
  const selectedCallRecordings = selectedCallDetail?.calls.filter((call) => call.recordingUrl || call.recordingId) || [];
  const selectedCallTranscripts = selectedCallDetail?.calls.filter((call) => call.transcriptionText || call.transcriptionId) || [];
  const focusNumber = normalizePhoneDigits(input.focusNumber || selectedCallDetail?.number);
  const previousCallSummary = buildPhonePreviousCallsSummary({
    focusNumber,
    focusLabel: normalizeText(input.focusLabel || selectedCallDetail?.contact),
    callRollups,
    updatedAt: input.updatedAt || input.now,
  });
  const totalVisibleCalls = filteredCallRollups.reduce((total, rollup) => total + rollup.calls.length, 0);
  const setupState = ready
    ? null
    : {
        title: "Call history is not connected",
        body: capability?.message || "Save TELNYX_API_KEY to load calls, numbers, and assistants.",
        action: surfaceAction({
          id: "open-settings",
          label: "Open settings",
          kind: "menu",
        }),
      };
  const hasFilters = Boolean(query || agentFilter !== "all" || directionFilter !== "all" || statusFilter !== "all");
  const search = {
    query,
    normalizedQuery,
    placeholder: capability?.search?.placeholder || "Search calls, numbers, contacts, or bots",
    schema: input.searchSchema || capability?.search || {
      local: true,
      submitIntent: "search-calls",
      fields: ["contact", "number", "agent", "direction", "status", "session", "transcript"],
    },
    stats: {
      totalNumbers: callRollups.length,
      visibleNumbers: filteredCallRollups.length,
      totalCalls: calls.length,
      visibleCalls: totalVisibleCalls,
    },
    derivedLabels: {
      resultLabel: `${filteredCallRollups.length} ${filteredCallRollups.length === 1 ? "number" : "numbers"}`,
      filterLabel: summarizeCallFilters({ agentFilter, directionFilter, statusFilter }),
    },
  };
  const filters = {
    applied: {
      agent: agentFilter,
      direction: directionFilter,
      status: statusFilter,
    },
    options: {
      agents: buildAgentFilterOptions(assistants, callRollups),
      directions: [
        { id: "all", label: "All directions", selected: directionFilter === "all" },
        { id: "inbound", label: "Inbound", selected: directionFilter === "inbound" },
        { id: "outbound", label: "Outbound", selected: directionFilter === "outbound" },
      ],
      statuses: [
        { id: "all", label: "All statuses", selected: statusFilter === "all" },
        { id: "answered", label: "Answered", selected: statusFilter === "answered" },
        { id: "missed", label: "Missed", selected: statusFilter === "missed" },
        { id: "voicemail", label: "Voicemail", selected: statusFilter === "voicemail" },
        { id: "failed", label: "Failed", selected: statusFilter === "failed" },
      ],
    },
  };
  const rowViewModels = filteredCallRollups.map((rollup) => buildPhoneCallRowViewModel(rollup, input.updatedAt || input.now));
  const detail = selectedCallDetail
    ? buildPhoneCallDetailViewModel(selectedCallDetail, {
        updatedAt: input.updatedAt || input.now,
      })
    : null;
  const emptyListState = filteredCallRollups.length > 0
    ? null
    : emptyState(
        !ready
          ? {
              kind: "setup_required",
              title: "Call history is not connected",
              body: capability?.message || "Save TELNYX_API_KEY to load calls and assistants.",
              cta: surfaceAction({ id: "open-settings", label: "Open settings", kind: "menu" }),
            }
          : {
              title: hasFilters ? "No calls found" : "No calls yet",
              body: hasFilters ? "Try another search term or filter." : "Recent calls will appear here.",
            },
      );

  return {
    surface: "call",
    header: {
      title: "Calls",
      subtitle: callWorkspaceSubtitle({
        ready,
        query,
        visibleNumbers: filteredCallRollups.length,
        totalNumbers: callRollups.length,
      }),
      badge: {
        label: ready ? "Connected" : "Not connected",
        tone: ready ? "success" : "warning",
      },
      action: ready
        ? surfaceAction({
            id: "new-call",
            label: "New Call",
            tone: "primary",
            enabled: capability?.enabled !== false,
            reason: capability?.enabled === false ? capability?.reasons?.[0] || "Calling is not ready." : "",
          })
        : setupState?.action || null,
    },
    state: {
      ready,
      query,
      agentFilter,
      directionFilter,
      statusFilter,
      selectedCallId: normalizeText(selectedCallDetail?.id),
      focusNumber,
      totalCalls: calls.length,
      visibleCalls: totalVisibleCalls,
      totalNumbers: callRollups.length,
      visibleNumbers: filteredCallRollups.length,
      hasSelection: Boolean(selectedCallDetail),
    },
    capability,
    search,
    filters,
    actions: {
      primary: ready
        ? surfaceAction({
            id: "new-call",
            label: "New Call",
            tone: "primary",
            enabled: capability?.enabled !== false,
            reason: capability?.enabled === false ? capability?.reasons?.[0] || "Calling is not ready." : "",
          })
        : null,
      restoreSearch: surfaceAction({
        id: "restore-search",
        label: "Show search",
        kind: "menu",
      }),
      refresh: surfaceAction({
        id: "refresh-calls",
        label: "Refresh",
        kind: "menu",
        enabled: ready,
        reason: ready ? "" : "Save TELNYX_API_KEY first.",
      }),
    },
    setupState,
    emptyState: emptyListState,
    list: {
      columns: [
        { id: "contact", label: "Contact" },
        { id: "number", label: "Number" },
        { id: "agent", label: "Agent" },
        { id: "last", label: "Last" },
        { id: "status", label: "Status" },
      ],
      totalCount: callRollups.length,
      visibleCount: filteredCallRollups.length,
      rows: rowViewModels,
    },
    detail,
    previousCalls: previousCallSummary,
    previousCallsEmptyState: previousCallSummary.emptyState,
    callRollups,
    filteredCallRollups,
    selectedCallDetail,
    selectedCallRecordings,
    selectedCallTranscripts,
    rowViewModels,
    updatedAt: normalizeWorkspaceTimestamp(input.updatedAt || input.now, calls),
  };
}

export function buildPhoneWorkspace(input = {}) {
  return buildPhoneWorkspaceViewModel(input);
}

export function rollupPhoneCallsByNumber(calls = []) {
  const buckets = new Map();
  for (const call of normalizeCallList(calls)) {
    const key = phoneCallNumberKey(call);
    buckets.set(key, [...(buckets.get(key) || []), call]);
  }

  return [...buckets.entries()]
    .map(([id, bucket]) => {
      const sortedCalls = [...bucket].sort((left, right) => callTimestampMs(right) - callTimestampMs(left));
      const lastCall = sortedCalls[0] || bucket[0] || null;
      if (!lastCall) return null;
      const agentNames = uniqueValues(sortedCalls.map((call) => call.agentName).filter(Boolean));
      const agentIds = uniqueValues(sortedCalls.map((call) => call.agentId).filter(Boolean));
      const directions = uniqueValues(sortedCalls.map((call) => call.direction));
      const statuses = uniqueValues(sortedCalls.map((call) => call.status));
      const totalDurationSeconds = sortedCalls.reduce((total, call) => total + Number(call.durationSeconds || 0), 0);
      const contact = preferredRollupContact(sortedCalls, lastCall.direction);
      return {
        id,
        contact,
        number: lastCall.number,
        lastCall,
        calls: sortedCalls,
        agentIds,
        agentNames,
        directions,
        statuses,
        agentName: agentNames.length > 1 ? `${agentNames.length} agents` : (agentNames[0] || lastCall.agentName),
        totalDurationSeconds,
        answeredCount: sortedCalls.filter((call) => call.status === "answered").length,
        missedCount: sortedCalls.filter((call) => call.status === "missed").length,
        voicemailCount: sortedCalls.filter((call) => call.status === "voicemail").length,
        failedCount: sortedCalls.filter((call) => call.status === "failed").length,
        recordingCount: sortedCalls.filter((call) => call.recordingUrl || call.recordingId).length,
        transcriptionCount: sortedCalls.filter((call) => call.transcriptionText || call.transcriptionId).length,
      };
    })
    .filter(Boolean)
    .sort((left, right) => callTimestampMs(right.lastCall) - callTimestampMs(left.lastCall));
}

export function buildPhonePreviousCallsSummary(input = {}) {
  const focusNumber = normalizePhoneDigits(input.focusNumber);
  const callRollups = Array.isArray(input.callRollups) ? input.callRollups : [];
  const selectedRollup = focusNumber
    ? callRollups.find((call) => normalizePhoneDigits(call.number) === focusNumber) || null
    : null;
  const rows = selectedRollup ? normalizePreviousCallRows(selectedRollup, input.updatedAt) : [];
  const heading = normalizeText(input.focusLabel || selectedRollup?.contact || selectedRollup?.number) || "Previous calls";

  return {
    focusNumber,
    heading,
    countLabel: rows.length ? `${rows.length} ${rows.length === 1 ? "call" : "calls"}` : "No calls",
    rows,
    emptyState: focusNumber
      ? (rows.length === 0
          ? emptyState({
              title: "No previous calls",
              body: "No previous calls were found for this number yet.",
            })
          : null)
      : emptyState({
          title: "Previous calls",
          body: "Choose a matching contact or number to see prior calls here.",
        }),
  };
}

export function buildPhoneCallDetailViewModel(rollup, options = {}) {
  if (!rollup) return null;
  const updatedAt = options.updatedAt;
  const historyRows = (rollup.calls || []).map((call) => ({
    id: call.id,
    startedAt: call.startedAt || "",
    label: call.startedAt ? new Date(call.startedAt).toLocaleString() : call.time,
    relativeLabel: compactRelativeTime(call.startedAt, updatedAt),
    detail: `${formatCallDirection(call.direction)} · ${formatCallStatus(call.status)} · ${formatCallDuration(call.durationSeconds)}`,
    agentName: call.agentName || "Unknown",
    sessionId: call.callSessionId || call.callLegId || call.callControlId || call.id,
    hasRecording: Boolean(call.recordingId || call.recordingUrl),
    hasTranscript: Boolean(call.transcriptionId || call.transcriptionText),
  }));
  const recordings = historyRows.filter((row) => row.hasRecording);
  const transcripts = (rollup.calls || [])
    .filter((call) => call.transcriptionId || call.transcriptionText)
    .map((call) => ({
      id: call.id,
      label: call.startedAt ? new Date(call.startedAt).toLocaleString() : call.time,
      agentName: call.agentName || "Unknown",
      transcriptionId: call.transcriptionId || "Not returned",
      preview: call.transcriptionText || "Transcript metadata was returned, but no transcript text was included.",
    }));

  return {
    id: rollup.id,
    title: rollup.contact || rollup.number || "Unknown call",
    subtitle: `${rollup.number} · ${rollup.calls.length} ${rollup.calls.length === 1 ? "call" : "calls"} · ${compactRelativeTime(rollup.lastCall?.startedAt || rollup.startedAt, updatedAt) || rollup.lastCall?.time || rollup.time}`,
    badge: {
      label: formatCallStatus(rollup.status),
      tone: callStatusTone(rollup.status),
    },
    metrics: [
      { id: "calls", label: "Calls", value: String(rollup.calls.length), detail: `Total duration ${formatCallDuration(rollup.totalDurationSeconds)}` },
      { id: "agents", label: "Agents", value: rollup.agentName || "Unknown", detail: rollup.agentNames.join(", ") || "No agents" },
      { id: "evidence", label: "Evidence", value: `${rollup.recordingCount} recordings`, detail: `${rollup.transcriptionCount} transcripts` },
    ],
    historyRows,
    recordingRows: recordings,
    transcriptRows: transcripts,
    actions: {
      primary: surfaceAction({
        id: "new-call",
        label: "New Call",
        tone: "primary",
      }),
    },
  };
}

function buildPhoneCallRowViewModel(call, updatedAt) {
  return {
    id: call.id,
    title: call.contact || call.number || "Unknown call",
    subtitle: `${call.number} · ${call.calls.length} ${call.calls.length === 1 ? "call" : "calls"} · ${compactRelativeTime(call.lastCall?.startedAt || call.startedAt, updatedAt) || call.time}`,
    status: call.status,
    statusLabel: formatCallStatus(call.status),
    statusTone: callStatusTone(call.status),
    meta: `${call.recordingCount} recordings · ${call.transcriptionCount} transcripts`,
    derivedLabels: {
      agent: call.agentName || "Unknown",
      duration: formatCallDuration(call.totalDurationSeconds),
      directions: call.directions.map(formatCallDirection).join(", "),
      statuses: call.statuses.map(formatCallStatus).join(", "),
    },
    openAction: surfaceAction({ id: "open-call", label: "Open", kind: "row" }),
  };
}

function buildAgentFilterOptions(assistants, rollups) {
  const fromAssistants = assistants.map((assistant) => ({
    id: assistant.id,
    label: assistant.name,
    selected: false,
  }));
  const fromRollups = rollups.flatMap((rollup) => rollup.agentIds.map((agentId, index) => ({
    id: agentId,
    label: rollup.agentNames[index] || agentId,
    selected: false,
  })));
  return [
    { id: "all", label: "All agents", selected: true },
    ...dedupeOptionList([{ id: "link", label: "Link", selected: false }, ...fromAssistants, ...fromRollups]),
  ];
}

function filterCallRollups(rollups, { normalizedQuery, agentFilter, directionFilter, statusFilter }) {
  return rollups.filter((call) => {
    const searchText = [
      call.contact,
      call.number,
      call.agentName,
      ...call.agentNames,
      ...call.directions,
      ...call.statuses,
      ...call.calls.flatMap((entry) => [
        entry.callSessionId || "",
        entry.callLegId || "",
        entry.callControlId || "",
        entry.transcriptionText || "",
      ]),
    ].join(" ").toLowerCase();
    const matchesQuery = !normalizedQuery || searchText.includes(normalizedQuery);
    const matchesAgent = agentFilter === "all" || call.calls.some((entry) => entry.agentId === agentFilter);
    const matchesDirection = directionFilter === "all" || call.directions.includes(directionFilter);
    const matchesStatus = statusFilter === "all" || call.statuses.includes(statusFilter);
    return matchesQuery && matchesAgent && matchesDirection && matchesStatus;
  });
}

function normalizePreviousCallRows(rollup, updatedAt) {
  return (rollup?.calls || []).map((call) => ({
    id: call.id,
    startedAt: call.startedAt || "",
    label: call.startedAt ? new Date(call.startedAt).toLocaleString() : call.time,
    relativeLabel: compactRelativeTime(call.startedAt, updatedAt),
    detail: `${formatCallDirection(call.direction)} · ${formatCallStatus(call.status)} · ${formatCallDuration(call.durationSeconds)}`,
    agentName: call.agentName || "Unknown",
    hasRecording: Boolean(call.recordingId || call.recordingUrl),
    hasTranscript: Boolean(call.transcriptionId || call.transcriptionText),
  }));
}

function normalizeCallList(calls) {
  return Array.isArray(calls) ? calls.map(normalizeCall).filter(Boolean) : [];
}

function normalizeCall(call) {
  if (!call || typeof call !== "object") return null;
  const id = normalizeText(call.id);
  const number = normalizeText(call.number);
  if (!id || !number) return null;
  const direction = call.direction === "inbound" ? "inbound" : "outbound";
  const status = normalizeText(call.status) || "unknown";
  return {
    id,
    contact: normalizeText(call.contact) || (direction === "inbound" ? "Inbound call" : "Outbound call"),
    number,
    agentId: normalizeText(call.agentId) || "link",
    agentName: normalizeText(call.agentName) || "Link",
    direction,
    status,
    time: normalizeText(call.time),
    startedAt: normalizeText(call.startedAt),
    durationSeconds: Number(call.durationSeconds || 0),
    callControlId: normalizeText(call.callControlId),
    callSessionId: normalizeText(call.callSessionId),
    callLegId: normalizeText(call.callLegId),
    recordingId: normalizeText(call.recordingId),
    recordingUrl: normalizeText(call.recordingUrl),
    transcriptionId: normalizeText(call.transcriptionId),
    transcriptionText: normalizeText(call.transcriptionText),
  };
}

function normalizeAssistantList(assistants) {
  return Array.isArray(assistants)
    ? assistants.map((assistant) => ({
        id: normalizeText(assistant?.id),
        name: normalizeText(assistant?.name) || normalizeText(assistant?.id),
      })).filter((assistant) => assistant.id)
    : [];
}

function resolveSelectedRollup(selectedCallId, callRollups) {
  const id = normalizeText(selectedCallId);
  if (!id) return null;
  return callRollups.find((call) => call.id === id) || null;
}

function normalizeFilter(value) {
  return normalizeText(value) || "all";
}

function normalizePhoneDigits(value) {
  return normalizeText(value).replace(/[^\d+]/g, "");
}

function phoneCallNumberKey(call) {
  const compactNumber = normalizePhoneDigits(call?.number);
  return compactNumber ? `number:${compactNumber}` : `call:${call?.id || "unknown"}`;
}

function preferredRollupContact(calls, direction) {
  const contacts = calls.map((call) => normalizeText(call.contact)).filter(Boolean);
  const preferred = contacts.find((contact) => !/^inbound call$|^outbound call$/i.test(contact));
  return preferred || (direction === "inbound" ? "Inbound call" : "Outbound call");
}

function callTimestampMs(call) {
  const timestamp = call?.startedAt ? Date.parse(call.startedAt) : NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compactRelativeTime(value, updatedAt) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  const nowMs = Number.isFinite(Date.parse(normalizeText(updatedAt))) ? Date.parse(normalizeText(updatedAt)) : NaN;
  if (Number.isNaN(nowMs)) return new Date(value).toLocaleDateString();
  const deltaMs = Math.max(0, nowMs - timestamp);
  const deltaMinutes = Math.floor(deltaMs / 60000);
  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays < 7) return `${deltaDays}d ago`;
  return new Date(value).toLocaleDateString();
}

function formatCallDuration(seconds = 0) {
  if (!seconds || seconds <= 0) return "0s";
  const wholeSeconds = Math.round(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return minutes <= 0 ? `${wholeSeconds}s` : `${minutes}m ${remainder}s`;
}

function formatCallStatus(status) {
  const value = normalizeText(status);
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatCallDirection(direction) {
  return direction === "inbound" ? "Incoming" : "Outgoing";
}

function callStatusTone(status) {
  if (status === "answered") return "success";
  if (status === "failed") return "danger";
  if (status === "missed" || status === "voicemail") return "warning";
  return "default";
}

function summarizeCallFilters({ agentFilter, directionFilter, statusFilter }) {
  const parts = [];
  if (agentFilter !== "all") parts.push(`Agent: ${agentFilter}`);
  if (directionFilter !== "all") parts.push(`Direction: ${directionFilter}`);
  if (statusFilter !== "all") parts.push(`Status: ${statusFilter}`);
  return parts.length > 0 ? parts.join(" · ") : "All calls";
}

function callWorkspaceSubtitle({ ready, query, visibleNumbers, totalNumbers }) {
  if (!ready) return "Save TELNYX_API_KEY to load recent calls and assistants.";
  if (query) return `${visibleNumbers} ${visibleNumbers === 1 ? "number" : "numbers"} match "${query}".`;
  return `${visibleNumbers} of ${totalNumbers} ${totalNumbers === 1 ? "number" : "numbers"} visible.`;
}

function normalizeWorkspaceTimestamp(updatedAt, calls) {
  const explicit = normalizeText(updatedAt);
  if (explicit) return explicit;
  const latest = [...calls].sort((left, right) => callTimestampMs(right) - callTimestampMs(left))[0];
  return normalizeText(latest?.startedAt);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : [];
}

function uniqueValues(values = []) {
  return values.filter((value, index, all) => value && all.indexOf(value) === index);
}

function dedupeOptionList(options) {
  const seen = new Set();
  return options.filter((option) => {
    const id = normalizeText(option?.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
