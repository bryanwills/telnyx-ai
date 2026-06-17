export const scribesHistorySearchSchema = Object.freeze({
  query: {
    id: "scribes-history-query",
    placeholder: "Search recordings, meetings, transcripts, or artifacts",
    fields: ["title", "transcript", "provider", "model", "language", "artifact", "sessionType"],
  },
  filters: [
    { id: "type", label: "Type" },
  ],
});

export const scribesAssistantSearchSchema = Object.freeze({
  query: {
    id: "scribes-library-query",
    placeholder: "Search transcriptions, recordings, or meetings",
    fields: ["title", "transcript", "provider", "model", "language", "artifact", "sessionType"],
  },
  filters: [
    { id: "library", label: "Library" },
  ],
});

export const scribesVoiceLibrarySearchSchema = Object.freeze({
  query: {
    id: "scribes-voice-query",
    placeholder: "Name, provider, language",
    fields: ["name", "voiceId", "provider", "language", "gender"],
  },
  filters: [
    { id: "provider", label: "Library provider" },
    { id: "language", label: "Language" },
    { id: "gender", label: "Gender" },
  ],
});

/**
 * Build a JSON-safe view model for the Scribes workspace, including history,
 * assistant-library affordances, and hosted voice-library rows.
 *
 * @param {object} input
 * @param {object|null} [input.status]
 * @param {object|null} [input.whisperStatus]
 * @param {Array<object>} [input.calendarEvents]
 * @param {Array<object>} [input.voices]
 * @param {string} [input.historyQuery]
 * @param {string} [input.historyTypeFilter]
 * @param {string} [input.selectedSessionId]
 * @param {string} [input.librarySearchQuery]
 * @param {string} [input.libraryFilter]
 * @param {boolean} [input.showLibrarySearch]
 * @param {number} [input.visibleSessionCount]
 * @param {string} [input.providerMode]
 * @param {string} [input.liveTranscript]
 * @param {string} [input.liveInterimTranscript]
 * @param {boolean} [input.liveListening]
 * @param {string} [input.busyAction]
 * @param {string} [input.voiceProviderFilter]
 * @param {string} [input.voiceLanguageFilter]
 * @param {string} [input.voiceGenderFilter]
 * @param {string} [input.voiceSearch]
 * @param {string} [input.sampleText]
 * @param {number} [input.nowMs]
 * @returns {object}
 */
export function buildScribesWorkspacePayload(input = {}) {
  const status = normalizeScribesStatus(input.status);
  const whisperStatus = normalizeWhisperStatus(input.whisperStatus);
  const calendarEvents = normalizeCalendarEvents(input.calendarEvents);
  const voices = normalizeVoices(input.voices);
  const selectedSessionId = normalizeOptionalString(input.selectedSessionId);
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : NaN;
  const providerMode = normalizeOptionalString(input.providerMode) || status.settings.sttMode || "telnyx-cloud";

  const history = buildScribesHistoryViewModel({
    sessions: status.sessions,
    calendarEvents,
    query: input.historyQuery,
    typeFilter: input.historyTypeFilter,
    nowMs,
  });

  return {
    kind: "scribes-workspace",
    generatedAt: normalizeOptionalString(input.asOf || input.generatedAt),
    summary: {
      sessions: status.sessions.length,
      models: status.models.length,
      voices: voices.length,
      linkedMeetings: status.sessions.filter((session) => session.sessionType === "meeting" && session.meeting.calendarEventId).length,
      providerMode,
      providerLabel: providerMode === "local" ? "Local" : "Telnyx Cloud",
      dictationEnabled: Boolean(status.settings.whisperEnabled),
      localServerRunning: Boolean(status.server.running),
      localServerReady: Boolean(status.server.ready),
      helperRunning: Boolean(whisperStatus.running),
    },
    settings: buildScribesSettingsSummary(status),
    history,
    assistant: buildScribeAssistantViewModel({
      status,
      whisperStatus,
      selectedSessionId,
      librarySearchQuery: input.librarySearchQuery,
      libraryFilter: input.libraryFilter,
      showLibrarySearch: input.showLibrarySearch,
      visibleSessionCount: input.visibleSessionCount,
      providerMode,
      liveTranscript: input.liveTranscript,
      liveInterimTranscript: input.liveInterimTranscript,
      liveListening: input.liveListening,
      busyAction: input.busyAction,
      nowMs,
    }),
    voices: buildScribesVoiceLibraryViewModel({
      voices,
      settings: status.settings,
      providerFilter: input.voiceProviderFilter,
      languageFilter: input.voiceLanguageFilter,
      genderFilter: input.voiceGenderFilter,
      search: input.voiceSearch,
      sampleText: input.sampleText,
    }),
    setupState: buildScribesWorkspaceSetupState({
      status,
      whisperStatus,
      providerMode,
    }),
  };
}

export function buildScribesWorkspaceViewModel(input = {}) {
  return buildScribesWorkspacePayload(input);
}

/**
 * Build history/library rows for Scribe sessions.
 *
 * @param {Array<object>} sessions
 * @param {object} [options]
 * @param {Array<object>} [options.calendarEvents]
 * @param {string} [options.query]
 * @param {string} [options.typeFilter]
 * @param {number} [options.nowMs]
 * @returns {Array<object>}
 */
export function buildScribesHistoryRows(sessions = [], options = {}) {
  return buildScribesHistoryViewModel({
    sessions,
    calendarEvents: options.calendarEvents,
    query: options.query,
    typeFilter: options.typeFilter,
    nowMs: options.nowMs,
  }).rows;
}

/**
 * Build JSON-safe voice-library rows with hosted voice search metadata.
 *
 * @param {Array<object>} voices
 * @param {object} [options]
 * @param {object|null} [options.settings]
 * @param {string} [options.providerFilter]
 * @param {string} [options.languageFilter]
 * @param {string} [options.genderFilter]
 * @param {string} [options.search]
 * @param {string} [options.sampleText]
 * @returns {Array<object>}
 */
export function buildScribesVoiceLibraryRows(voices = [], options = {}) {
  return buildScribesVoiceLibraryViewModel({
    voices,
    settings: options.settings,
    providerFilter: options.providerFilter,
    languageFilter: options.languageFilter,
    genderFilter: options.genderFilter,
    search: options.search,
    sampleText: options.sampleText,
  }).rows;
}

/**
 * Build the Scribe assistant side-panel library and composer payload.
 *
 * @param {object} input
 * @returns {object}
 */
export function buildScribeAssistantViewModel(input = {}) {
  const status = normalizeScribesStatus(input.status);
  const whisperStatus = normalizeWhisperStatus(input.whisperStatus);
  const providerMode = normalizeOptionalString(input.providerMode) || status.settings.sttMode || "telnyx-cloud";
  const librarySearchQuery = normalizeOptionalString(input.librarySearchQuery);
  const libraryFilter = normalizeOptionalString(input.libraryFilter) || "all";
  const visibleSessionCount = clampCount(input.visibleSessionCount, 12);
  const selectedSessionId = normalizeOptionalString(input.selectedSessionId);
  const nowMs = Number.isFinite(Number(input.nowMs)) ? Number(input.nowMs) : NaN;
  const busyAction = normalizeOptionalString(input.busyAction);
  const helperRunning = Boolean(whisperStatus.running);
  const localServerRunning = Boolean(status.server.running);
  const localServerReady = Boolean(status.server.ready);
  const liveTranscript = normalizeOptionalString(input.liveTranscript);
  const liveInterimTranscript = normalizeOptionalString(input.liveInterimTranscript);
  const liveListening = Boolean(input.liveListening);
  const liveTranscriptText = [liveTranscript, liveInterimTranscript].filter(Boolean).join(" ").trim();

  const recentSessions = [...status.sessions].sort((left, right) => sessionTimestampMs(right) - sessionTimestampMs(left));
  const filteredRecentSessions = filterScribesAssistantSessions(recentSessions, {
    libraryFilter,
    librarySearchQuery,
  });
  const selectedSession = recentSessions.find((session) => session.id === selectedSessionId) || null;
  const showLibrarySearch = typeof input.showLibrarySearch === "boolean" ? input.showLibrarySearch : !selectedSession;
  const visibleRecentSessions = filteredRecentSessions.slice(0, visibleSessionCount);
  const groupedRecentSessions = groupScribesRecentSessions(visibleRecentSessions, {
    selectedSessionId,
    nowMs,
  });
  const hasMoreRecentSessions = visibleSessionCount < filteredRecentSessions.length;
  const librarySearchActive = Boolean(librarySearchQuery.trim()) || libraryFilter !== "all";
  const dictationEnabled = Boolean(status.settings.whisperEnabled);

  const setupState = buildScribeAssistantSetupState({
    status,
    whisperStatus,
    providerMode,
  });

  return {
    search: {
      schema: scribesAssistantSearchSchema,
      visible: showLibrarySearch,
      active: librarySearchActive,
      query: {
        value: librarySearchQuery,
        normalized: normalizeSearchText(librarySearchQuery),
      },
      filter: {
        id: "library",
        value: libraryFilter,
        options: [
          { id: "all", label: "All records" },
          { id: "transcriptions", label: "Transcriptions" },
          { id: "recordings", label: "Recordings" },
          { id: "meetings", label: "Meetings" },
        ],
      },
      actions: [
        createActionManifest({
          id: "refresh-library",
          label: "Refresh library",
          description: "Reload recent Scribe records from the workspace store.",
          scope: "scribe-library-search",
          requiresAgent: false,
        }),
        createActionManifest({
          id: "clear-library-search",
          label: "Clear search",
          description: "Clear the current Scribe library query and filters.",
          scope: "scribe-library-search",
          visible: librarySearchActive,
          requiresAgent: false,
        }),
      ],
    },
    selectedSession: selectedSession
      ? {
          id: selectedSession.id,
          title: selectedSession.title,
          subtitle: `${formatScribesSessionType(selectedSession.sessionType)} loaded from Library`,
          typeLabel: formatScribesSessionType(selectedSession.sessionType),
          providerLabel: formatScribesProviderLabel(selectedSession.provider),
          transcriptPreview: selectedSession.transcriptText.slice(0, 400),
          artifactCount: selectedSession.artifacts.length,
          segmentPreview: selectedSession.segments.slice(0, 3).map((segment) => ({
            id: segment.id,
            speaker: segment.speaker,
            text: segment.text,
          })),
          actions: [
            createActionManifest({
              id: "search-library",
              label: "Search library",
              description: "Return to Scribe library search without clearing the selected record.",
              scope: "scribe-selected-session",
              requiresAgent: false,
            }),
            createActionManifest({
              id: "close-record",
              label: "Close record",
              description: "Clear the selected Scribe record and return to search.",
              scope: "scribe-selected-session",
              requiresAgent: false,
            }),
          ],
        }
      : null,
    library: {
      rowCount: filteredRecentSessions.length,
      visibleRowCount: visibleRecentSessions.length,
      hasMore: hasMoreRecentSessions,
      groups: groupedRecentSessions,
      rows: visibleRecentSessions.map((session) => buildAssistantLibraryRow(session, {
        selectedSessionId,
        nowMs,
      })),
      emptyState: filteredRecentSessions.length > 0
        ? null
        : {
            title: recentSessions.length === 0 ? "No records yet" : "No matching records",
            body: recentSessions.length === 0
              ? "Recent recordings, meetings, and transcriptions will appear here."
              : "Try another search term or switch the library filter.",
            tone: "default",
          },
      loadMoreAction: hasMoreRecentSessions
        ? createActionManifest({
            id: "load-more-records",
            label: "Load more",
            description: "Load more recent Scribe records into the assistant library.",
            scope: "scribe-library",
            requiresAgent: false,
          })
        : null,
    },
    composer: {
      liveTranscript: {
        finalText: liveTranscript,
        interimText: liveInterimTranscript,
        text: liveTranscriptText,
        placeholder: "Speak to Scribe...",
        active: liveListening || helperRunning,
      },
      setupState,
      menus: {
        actions: [
          createActionManifest({
            id: "refresh-records",
            label: "Refresh records",
            description: "Reload recent Scribe records in the side panel.",
            scope: "scribe-composer-actions",
            requiresAgent: false,
          }),
          createActionManifest({
            id: "start-local-server",
            label: busyAction === "start-server" ? "Starting local server" : "Warm start local server",
            description: "Start the local Scribe transcription server in warm mode.",
            scope: "scribe-composer-actions",
            enabled: !busyAction || busyAction === "start-server",
            busy: busyAction === "start-server",
            visible: !localServerRunning,
            requiresAgent: false,
          }),
          createActionManifest({
            id: "stop-local-server",
            label: busyAction === "stop-server" ? "Stopping local server" : "Stop local server",
            description: "Stop the local Scribe transcription server.",
            scope: "scribe-composer-actions",
            enabled: localServerRunning && (!busyAction || busyAction === "stop-server"),
            busy: busyAction === "stop-server",
            visible: localServerRunning,
            requiresAgent: false,
            reasonDisabled: localServerRunning ? "" : "The local server is not running.",
          }),
        ],
        settings: {
          providerMode: {
            value: providerMode,
            options: [
              { id: "telnyx-cloud", label: "Telnyx Cloud" },
              { id: "local", label: "Local" },
            ],
          },
          dictationEnabled,
          statusRows: [
            { id: "local-server", label: "Local server", value: localServerReady ? "Ready" : localServerRunning ? "Running" : "Stopped" },
            { id: "dictation-helper", label: "Dictation helper", value: helperRunning ? "Running" : "Idle" },
          ],
          actions: [
            createActionManifest({
              id: dictationEnabled ? "disable-dictation" : "enable-dictation",
              label: dictationEnabled ? "Disable Scribe dictation" : "Enable Scribe dictation",
              description: "Toggle Scribe dictation in the assistant panel.",
              scope: "scribe-composer-settings",
              requiresAgent: false,
            }),
          ],
        },
      },
      micAction: createActionManifest({
        id: liveListening || helperRunning ? "stop-dictation" : "start-dictation",
        label: liveListening || helperRunning ? "Stop Scribe dictation" : "Start Scribe dictation",
        description: liveListening || helperRunning
          ? "Stop live transcript preview and the dictation helper."
          : "Start live transcript preview and the dictation helper.",
        scope: "scribe-composer-mic",
        enabled: !(busyAction && !helperRunning) && Boolean(dictationEnabled),
        requiresAgent: false,
        reasonDisabled: dictationEnabled
          ? busyAction && !helperRunning
            ? "Wait for the current Scribe action to finish."
            : ""
          : "Enable Scribe dictation in settings first.",
      }),
    },
  };
}

function buildScribesHistoryViewModel({
  sessions,
  calendarEvents,
  query,
  typeFilter,
  nowMs,
}) {
  const normalizedSessions = normalizeSessions(sessions);
  const normalizedCalendarEvents = normalizeCalendarEvents(calendarEvents);
  const normalizedQuery = normalizeSearchText(query);
  const nextTypeFilter = normalizeOptionalString(typeFilter) || "all";
  const rows = normalizedSessions
    .filter((session) => {
      if (nextTypeFilter !== "all" && session.sessionType !== nextTypeFilter) return false;
      if (!normalizedQuery) return true;
      return normalizeSearchText([
        session.title,
        session.transcriptText,
        session.provider,
        session.model,
        session.language,
        formatScribesSessionType(session.sessionType),
        session.artifacts.map((artifact) => artifact.title).join(" "),
        session.artifacts.map((artifact) => artifact.path).join(" "),
      ].join(" ")).includes(normalizedQuery);
    })
    .map((session) => buildScribesHistoryRow(session, {
      calendarEvents: normalizedCalendarEvents,
      nowMs,
    }));

  const meetingSessions = normalizedSessions.filter((session) => session.sessionType === "meeting");
  const linkedMeetingCount = meetingSessions.filter((session) => session.meeting.calendarEventId).length;

  return {
    search: {
      schema: scribesHistorySearchSchema,
      query: {
        value: normalizeOptionalString(query),
        normalized: normalizedQuery,
      },
      filter: {
        id: "type",
        value: nextTypeFilter,
        options: [
          { id: "all", label: "All records" },
          { id: "dictation", label: "Recordings" },
          { id: "meeting", label: "Meetings" },
          { id: "import", label: "Imports" },
          { id: "tts", label: "TTS" },
        ],
      },
      resultLabel: `${rows.length} ${rows.length === 1 ? "record" : "records"}`,
    },
    summary: {
      sessions: normalizedSessions.length,
      meetings: meetingSessions.length,
      linkedMeetings: linkedMeetingCount,
    },
    rows,
    emptyState: rows.length > 0
      ? null
      : {
          title: normalizedSessions.length === 0 ? "No records yet" : "No matching records",
          body: "Recordings, meetings, and transcripts will appear here.",
          tone: "default",
        },
    actions: [
      createActionManifest({
        id: "refresh-scribes-workspace",
        label: "Refresh",
        description: "Reload the Scribe workspace state from the backend store.",
        scope: "scribes-history",
        requiresAgent: false,
      }),
      createActionManifest({
        id: "deep-sync-calendar",
        label: "Deep sync",
        description: "Sync meeting-note shells from Google Calendar into the Scribe workspace.",
        scope: "scribes-history",
        requiresAgent: false,
      }),
    ],
  };
}

function buildScribesHistoryRow(session, { calendarEvents, nowMs }) {
  const linkedEvent = session.sessionType === "meeting"
    ? calendarEvents.find((event) => event.id === session.meeting.calendarEventId || scribesMeetingMatchesCalendarEvent(session, event))
    : null;
  const detailLabel = session.sessionType === "meeting"
    ? linkedEvent
      ? `${calendarEventDateLabel(linkedEvent)} · ${calendarEventTimeLabel(linkedEvent)}`
      : session.meeting.calendarEventStart
        ? formatDateTime(session.meeting.calendarEventStart)
        : "No calendar event linked"
    : session.artifacts[0]?.path || "~/Link/scribes/transcripts/";
  const updatedRelativeLabel = formatRelativeTime(session.updatedAt, nowMs);

  return {
    id: session.id,
    title: session.title,
    detailLabel,
    typeLabel: formatScribesSessionType(session.sessionType),
    providerLabel: formatScribesProviderLabel(session.provider),
    languageLabel: formatDictationLanguage(session.language),
    updatedRelativeLabel,
    updatedAtLabel: formatDateTime(session.updatedAt),
    artifactCount: session.artifacts.length,
    transcriptPreview: session.transcriptText.slice(0, 220),
    meeting: session.sessionType === "meeting"
      ? {
          linked: Boolean(session.meeting.calendarEventId),
          captureLabel: buildMeetingCaptureLabel(session),
          speakerCount: session.meeting.speakerLabels.length,
        }
      : null,
    actions: [
      createActionManifest({
        id: "generate-summary",
        label: "Summary",
        description: "Generate or refresh a local summary artifact for this Scribe session.",
        scope: "scribes-history-row",
        requiresAgent: false,
      }),
      createActionManifest({
        id: "generate-action-items",
        label: "Actions",
        description: "Generate local action-item bullets from this Scribe session.",
        scope: "scribes-history-row",
        requiresAgent: false,
      }),
      createActionManifest({
        id: "open-calendar",
        label: "Calendar",
        description: "Open the calendar workspace for the linked meeting record.",
        scope: "scribes-history-row",
        visible: session.sessionType === "meeting",
        requiresAgent: false,
      }),
      createActionManifest({
        id: "delete-session",
        label: "Delete",
        description: "Delete this Scribe session from the local workspace store.",
        scope: "scribes-history-row",
        requiresAgent: false,
      }),
    ],
  };
}

function buildScribesVoiceLibraryViewModel({
  voices,
  settings,
  providerFilter,
  languageFilter,
  genderFilter,
  search,
  sampleText,
}) {
  const normalizedVoices = normalizeVoices(voices);
  const speakSettings = normalizeSpeakSettings(settings);
  const nextProviderFilter = normalizeOptionalString(providerFilter) || "telnyx";
  const nextLanguageFilter = normalizeOptionalString(languageFilter) || "all";
  const nextGenderFilter = normalizeOptionalString(genderFilter) || "all";
  const normalizedSearch = normalizeSearchText(search);
  const nextSampleText = normalizeOptionalString(sampleText) || "Thanks for calling. How can I help you today?";

  const languageOptions = uniqueValues(normalizedVoices.map((voice) => voice.language).filter(Boolean)).sort((left, right) => left.localeCompare(right));
  const genderOptions = uniqueValues(normalizedVoices.map((voice) => voice.gender).filter(Boolean)).sort((left, right) => left.localeCompare(right));

  const filteredVoices = normalizedVoices.filter((voice) => {
    const matchesProvider = nextProviderFilter === "all" || voice.provider === nextProviderFilter;
    const matchesLanguage = nextLanguageFilter === "all" || voice.language === nextLanguageFilter;
    const matchesGender = nextGenderFilter === "all" || voice.gender === nextGenderFilter;
    const matchesSearch = !normalizedSearch || normalizeSearchText([
      voice.name,
      voice.voiceId,
      voice.provider,
      voice.language,
      voice.gender,
    ].join(" ")).includes(normalizedSearch);
    return matchesProvider && matchesLanguage && matchesGender && matchesSearch;
  });

  const limitedVoices = filteredVoices.slice(0, 80);

  return {
    search: {
      schema: scribesVoiceLibrarySearchSchema,
      query: {
        value: normalizeOptionalString(search),
        normalized: normalizedSearch,
      },
      filters: [
        {
          id: "provider",
          value: nextProviderFilter,
          options: [
            { id: "telnyx", label: "Telnyx" },
            { id: "all", label: "All hosted" },
            { id: "aws", label: "AWS" },
            { id: "azure", label: "Azure" },
            { id: "minimax", label: "MiniMax" },
            { id: "rime", label: "Rime" },
            { id: "resemble", label: "Resemble" },
            { id: "xai", label: "xAI" },
            { id: "elevenlabs", label: "ElevenLabs" },
          ],
        },
        {
          id: "language",
          value: nextLanguageFilter,
          options: [{ id: "all", label: "All languages" }, ...languageOptions.map((language) => ({ id: language, label: language }))],
        },
        {
          id: "gender",
          value: nextGenderFilter,
          options: [{ id: "all", label: "All voices" }, ...genderOptions.map((gender) => ({ id: gender, label: gender }))],
        },
      ],
    },
    sampleText: {
      value: nextSampleText,
      maxLength: 320,
    },
    rows: limitedVoices.map((voice) => ({
      id: voice.voiceId,
      title: voice.name || voice.voiceId,
      subtitle: voice.voiceId,
      providerLabel: voice.provider || "telnyx",
      languageLabel: voice.language || "Any",
      genderLabel: voice.gender || "Voice",
      selected: speakSettings.ttsVoice === voice.voiceId,
      actions: [
        createActionManifest({
          id: "sample-voice",
          label: "Sample",
          description: "Generate and play a hosted preview sample for this voice.",
          scope: "scribes-voice-row",
          requiresAgent: false,
        }),
        createActionManifest({
          id: "use-voice",
          label: speakSettings.ttsVoice === voice.voiceId ? "Selected" : "Use",
          description: "Save this hosted voice as the active Scribe TTS voice.",
          scope: "scribes-voice-row",
          enabled: speakSettings.ttsVoice !== voice.voiceId,
          requiresAgent: false,
          reasonDisabled: speakSettings.ttsVoice === voice.voiceId ? "This voice is already selected for Scribe." : "",
        }),
      ],
    })),
    summary: {
      loaded: normalizedVoices.length,
      filtered: filteredVoices.length,
      visible: limitedVoices.length,
      truncated: filteredVoices.length > limitedVoices.length,
    },
    emptyState: normalizedVoices.length === 0
      ? {
          title: "Load voices to browse and sample the hosted library.",
          body: "Hosted voice rows will appear here after the backend loads the selected provider catalog.",
          tone: "default",
        }
      : filteredVoices.length === 0
      ? {
          title: "No voices match those filters.",
          body: "Try another provider, language, gender, or search term.",
          tone: "default",
        }
      : null,
    actions: [
      createActionManifest({
        id: "load-voices",
        label: "Load Voices",
        description: "Load hosted voices for the selected provider into the Scribe library.",
        scope: "scribes-voice-library",
        requiresAgent: false,
      }),
    ],
  };
}

function buildScribesSettingsSummary(status) {
  const activeCleanupProfile = status.workspace.cleanupProfiles.find((profile) => profile.id === status.workspace.activeCleanupProfileId) || null;
  return {
    dictation: {
      enabled: Boolean(status.settings.whisperEnabled),
      providerMode: status.settings.sttMode,
      providerLabel: formatScribesProviderLabel(status.settings.sttProvider),
      model: status.settings.sttModel,
      language: formatDictationLanguage(status.settings.sttLanguage),
      routeReady: Boolean(status.route.ready),
      routeMessage: status.route.diagnostics.message,
    },
    workspace: {
      retainAudio: Boolean(status.workspace.retainAudio),
      audioRetentionDays: clampCount(status.workspace.audioRetentionDays, 0),
      editModeEnabled: Boolean(status.workspace.editModeEnabled),
      customVocabularyCount: status.workspace.customVocabulary.length,
      cleanupProfile: activeCleanupProfile
        ? {
            id: activeCleanupProfile.id,
            name: activeCleanupProfile.name,
            description: activeCleanupProfile.description,
          }
        : null,
      meetingCapture: {
        microphone: Boolean(status.workspace.meetingCapture.microphone),
        systemAudio: Boolean(status.workspace.meetingCapture.systemAudio),
        speakerLabels: Boolean(status.workspace.meetingCapture.speakerLabels),
        diarization: Boolean(status.workspace.meetingCapture.diarization),
      },
    },
    localServer: {
      running: Boolean(status.server.running),
      ready: Boolean(status.server.ready),
      message: status.server.message,
      endpoint: status.server.endpoint,
    },
  };
}

function buildScribesWorkspaceSetupState({ status, whisperStatus, providerMode }) {
  if (!status.settings.whisperEnabled) {
    return {
      title: "Enable Scribe dictation",
      body: "Turn on Scribe dictation before using the assistant composer or live transcript preview.",
      tone: "warning",
      action: createActionManifest({
        id: "enable-dictation",
        label: "Enable dictation",
        description: "Enable Scribe dictation in workspace settings.",
        scope: "scribes-setup",
        requiresAgent: false,
      }),
    };
  }

  if (providerMode === "local" && !status.route.ready) {
    return {
      title: "Prepare local transcription",
      body: status.route.diagnostics.message || "Download a local Scribe model and start the local server before using local dictation.",
      tone: "warning",
      action: createActionManifest({
        id: "open-stt",
        label: "Open STT settings",
        description: "Open Speech-to-Text settings to prepare a local Scribe model.",
        scope: "scribes-setup",
        requiresAgent: false,
      }),
    };
  }

  if (providerMode === "telnyx-cloud" && !status.telnyxCloudReady) {
    return {
      title: "Save TELNYX_API_KEY",
      body: "Telnyx Cloud dictation is selected, but the required API key is not configured yet.",
      tone: "warning",
      action: createActionManifest({
        id: "open-settings",
        label: "Open Settings",
        description: "Open Settings to save Telnyx credentials for hosted dictation.",
        scope: "scribes-setup",
        requiresAgent: false,
      }),
    };
  }

  if (whisperStatus.available === false) {
    return {
      title: "Dictation helper unavailable",
      body: whisperStatus.message || "Scribe dictation helper is not available on this device.",
      tone: "warning",
      action: createActionManifest({
        id: "open-stt",
        label: "Review STT settings",
        description: "Review Speech-to-Text configuration for this device.",
        scope: "scribes-setup",
        requiresAgent: false,
      }),
    };
  }

  return null;
}

function buildScribeAssistantSetupState({ status, whisperStatus, providerMode }) {
  if (!status.settings.whisperEnabled) {
    return {
      title: "Enable Scribe dictation first",
      body: "The microphone action stays disabled until Scribe dictation is turned on.",
      tone: "warning",
    };
  }

  if (providerMode === "local" && !status.route.ready) {
    return {
      title: "Local dictation is not ready",
      body: status.route.diagnostics.message || "Warm the local server or download a local model before starting dictation.",
      tone: "warning",
    };
  }

  if (providerMode === "telnyx-cloud" && !status.telnyxCloudReady) {
    return {
      title: "Cloud dictation needs credentials",
      body: "Save TELNYX_API_KEY before starting Telnyx Cloud dictation.",
      tone: "warning",
    };
  }

  if (whisperStatus.available === false) {
    return {
      title: "Live transcript preview unavailable",
      body: whisperStatus.message || "This device cannot start the Scribe dictation helper right now.",
      tone: "warning",
    };
  }

  return null;
}

function buildAssistantLibraryRow(session, { selectedSessionId, nowMs }) {
  return {
    id: session.id,
    title: session.title,
    timeLabel: scribeAssistantTimeLabel(session.updatedAt || session.createdAt),
    dayLabel: scribeAssistantDayLabel(session.updatedAt || session.createdAt),
    typeLabel: formatScribesSessionType(session.sessionType),
    providerLabel: formatScribesProviderLabel(session.provider),
    updatedRelativeLabel: formatRelativeTime(session.updatedAt, nowMs),
    selected: session.id === selectedSessionId,
    action: createActionManifest({
      id: "select-scribe-session",
      label: "Open record",
      description: "Load this Scribe record into the assistant side panel.",
      scope: "scribe-library-row",
      requiresAgent: false,
    }),
  };
}

function filterScribesAssistantSessions(sessions, { libraryFilter, librarySearchQuery }) {
  const normalizedQuery = normalizeSearchText(librarySearchQuery);
  return sessions.filter((session) => {
    if (libraryFilter === "meetings" && session.sessionType !== "meeting") return false;
    if (libraryFilter === "recordings" && session.sessionType !== "dictation") return false;
    if (libraryFilter === "transcriptions" && !["dictation", "import", "meeting"].includes(session.sessionType)) return false;
    if (!normalizedQuery) return true;
    return normalizeSearchText([
      session.title,
      session.transcriptText,
      session.provider,
      session.model,
      session.language,
      formatScribesSessionType(session.sessionType),
      session.artifacts.map((artifact) => artifact.title).join(" "),
    ].join(" ")).includes(normalizedQuery);
  });
}

function groupScribesRecentSessions(sessions, { selectedSessionId, nowMs }) {
  const groups = new Map();
  sessions.forEach((session) => {
    const groupName = scribeAssistantDayLabel(session.updatedAt || session.createdAt);
    groups.set(groupName, [...(groups.get(groupName) || []), buildAssistantLibraryRow(session, {
      selectedSessionId,
      nowMs,
    })]);
  });
  return [...groups.entries()].map(([title, rows]) => ({ title, rows }));
}

function buildMeetingCaptureLabel(session) {
  const labels = [];
  labels.push(session.meeting.speakerLabels.length > 0 ? `${session.meeting.speakerLabels.length} speakers` : "No speaker labels");
  labels.push(session.meeting.diarizationStatus || "disabled");
  return labels.join(" · ");
}

function formatScribesSessionType(type) {
  if (type === "meeting") return "Meeting";
  if (type === "import") return "Transcription";
  if (type === "tts") return "TTS";
  return "Recording";
}

function formatScribesProviderLabel(provider) {
  if (provider === "telnyx") return "Telnyx Cloud";
  if (provider === "nvidia-parakeet") return "NVIDIA Parakeet";
  return "OpenAI Whisper";
}

function formatDictationLanguage(language) {
  const value = normalizeOptionalString(language);
  if (value === "en-US") return "English";
  if (value === "auto") return "Auto detect";
  if (value === "es-ES") return "Spanish";
  if (value === "fr-FR") return "French";
  if (value === "de-DE") return "German";
  if (value === "it-IT") return "Italian";
  if (value === "pt-BR") return "Portuguese";
  if (value === "nl-NL") return "Dutch";
  return value || "Auto detect";
}

function formatRelativeTime(value, nowMs) {
  const timestamp = Date.parse(normalizeOptionalString(value));
  if (!Number.isFinite(timestamp)) return "";
  if (!Number.isFinite(nowMs)) return formatDateTime(value);
  const elapsedMs = Math.max(0, nowMs - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsedMs < minute) return "Now";
  if (elapsedMs < hour) return `${Math.max(1, Math.floor(elapsedMs / minute))}m`;
  if (elapsedMs < day) return `${Math.floor(elapsedMs / hour)}h`;
  return `${Math.floor(elapsedMs / day)}d`;
}

function formatDateTime(value) {
  const timestamp = Date.parse(normalizeOptionalString(value));
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function scribeAssistantDayLabel(value) {
  const timestamp = Date.parse(normalizeOptionalString(value));
  if (!Number.isFinite(timestamp)) return "UNKNOWN";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp)).toUpperCase();
}

function scribeAssistantTimeLabel(value) {
  const timestamp = Date.parse(normalizeOptionalString(value));
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function calendarEventDateLabel(event) {
  const parts = normalizeOptionalString(event.time).split(",");
  if (parts.length <= 1) return event.time === "Time not set" ? "Date not set" : event.time;
  return parts.slice(0, -1).join(",").trim() || "Date not set";
}

function calendarEventTimeLabel(event) {
  const parts = normalizeOptionalString(event.time).split(",");
  return parts.length > 1 ? parts[parts.length - 1].trim() : event.time;
}

function scribesMeetingMatchesCalendarEvent(session, event) {
  const sessionEventId = normalizeOptionalString(session.meeting.calendarEventId);
  if (sessionEventId && sessionEventId === event.id) return true;
  const sessionStart = normalizeOptionalString(session.meeting.calendarEventStart);
  return Boolean(sessionStart && event.start && sessionStart === event.start);
}

function createActionManifest({
  id,
  label,
  description,
  scope,
  enabled = true,
  visible = true,
  busy = false,
  requiresAgent = false,
  reasonDisabled = "",
}) {
  return {
    id,
    label,
    description,
    scope,
    enabled: Boolean(enabled),
    visible: Boolean(visible),
    busy: Boolean(busy),
    requiresAgent: Boolean(requiresAgent),
    reasonDisabled: enabled ? "" : normalizeOptionalString(reasonDisabled),
  };
}

function normalizeScribesStatus(status = {}) {
  const value = status && typeof status === "object" ? status : {};
  const settings = normalizeSpeakSettings(value.settings);
  const workspace = normalizeWorkspaceSettings(value.workspace);
  return {
    settings,
    workspace,
    sessions: normalizeSessions(value.sessions),
    models: normalizeModels(value.models),
    route: normalizeRoute(value.route),
    server: normalizeServer(value.server),
    telnyxCloudReady: Boolean(value.telnyxCloudReady),
  };
}

function normalizeSpeakSettings(settings = {}) {
  const value = settings && typeof settings === "object" ? settings : {};
  return {
    whisperEnabled: value.whisperEnabled !== false,
    sttMode: normalizeOptionalString(value.sttMode) === "local" ? "local" : "telnyx-cloud",
    sttProvider: normalizeOptionalString(value.sttProvider) || "openai-whisper",
    sttModel: normalizeOptionalString(value.sttModel) || "",
    sttLanguage: normalizeOptionalString(value.sttLanguage) || "auto",
    ttsVoice: normalizeOptionalString(value.ttsVoice) || "",
  };
}

function normalizeWorkspaceSettings(workspace = {}) {
  const value = workspace && typeof workspace === "object" ? workspace : {};
  return {
    retainAudio: Boolean(value.retainAudio),
    audioRetentionDays: clampCount(value.audioRetentionDays, 0),
    customVocabulary: normalizeStringList(value.customVocabulary),
    activeCleanupProfileId: normalizeOptionalString(value.activeCleanupProfileId),
    cleanupProfiles: normalizeCleanupProfiles(value.cleanupProfiles),
    editModeEnabled: value.editModeEnabled !== false,
    meetingCapture: {
      microphone: value.meetingCapture?.microphone !== false,
      systemAudio: Boolean(value.meetingCapture?.systemAudio),
      speakerLabels: value.meetingCapture?.speakerLabels !== false,
      diarization: Boolean(value.meetingCapture?.diarization),
    },
  };
}

function normalizeCleanupProfiles(profiles) {
  return normalizeArray(profiles).map((profile) => ({
    id: normalizeOptionalString(profile?.id),
    name: normalizeOptionalString(profile?.name),
    description: normalizeOptionalString(profile?.description),
  })).filter((profile) => profile.id);
}

function normalizeSessions(sessions) {
  return normalizeArray(sessions)
    .map((session) => {
      if (!session || typeof session !== "object") return null;
      const id = normalizeOptionalString(session.id);
      if (!id) return null;
      return {
        id,
        title: normalizeOptionalString(session.title) || "Untitled Scribe record",
        transcriptText: normalizeOptionalString(session.transcriptText),
        provider: normalizeOptionalString(session.provider) || "openai-whisper",
        model: normalizeOptionalString(session.model),
        mode: normalizeOptionalString(session.mode),
        sessionType: normalizeSessionType(session.sessionType),
        language: normalizeOptionalString(session.language) || "auto",
        durationMs: clampCount(session.durationMs, 0),
        createdAt: normalizeOptionalString(session.createdAt),
        updatedAt: normalizeOptionalString(session.updatedAt || session.createdAt),
        artifacts: normalizeArtifacts(session.artifacts),
        segments: normalizeSegments(session.segments),
        meeting: normalizeMeeting(session.meeting),
      };
    })
    .filter(Boolean)
    .sort((left, right) => sessionTimestampMs(right) - sessionTimestampMs(left));
}

function normalizeSessionType(value) {
  const type = normalizeOptionalString(value);
  return ["dictation", "meeting", "import", "tts"].includes(type) ? type : "dictation";
}

function normalizeArtifacts(artifacts) {
  return normalizeArray(artifacts).map((artifact) => ({
    id: normalizeOptionalString(artifact?.id),
    kind: normalizeOptionalString(artifact?.kind) || "transcript",
    title: normalizeOptionalString(artifact?.title),
    path: normalizeOptionalString(artifact?.path),
  })).filter((artifact) => artifact.id || artifact.title || artifact.path);
}

function normalizeSegments(segments) {
  return normalizeArray(segments).map((segment) => ({
    id: normalizeOptionalString(segment?.id),
    speaker: normalizeOptionalString(segment?.speaker) || "Speaker 1",
    text: normalizeOptionalString(segment?.text),
  })).filter((segment) => segment.text);
}

function normalizeMeeting(meeting = {}) {
  const value = meeting && typeof meeting === "object" ? meeting : {};
  return {
    micStatus: normalizeOptionalString(value.micStatus || value.captureStatus?.micStatus) || "disabled",
    systemAudioStatus: normalizeOptionalString(value.systemAudioStatus || value.captureStatus?.systemAudioStatus) || "disabled",
    diarizationStatus: normalizeOptionalString(value.diarizationStatus) || "disabled",
    speakerLabels: normalizeStringList(value.speakerLabels),
    summaryStatus: normalizeOptionalString(value.summaryStatus) || "not_started",
    calendarEventId: normalizeOptionalString(value.calendarEventId),
    calendarEventUrl: normalizeOptionalString(value.calendarEventUrl),
    calendarEventStart: normalizeOptionalString(value.calendarEventStart),
    calendarEventEnd: normalizeOptionalString(value.calendarEventEnd),
  };
}

function normalizeModels(models) {
  return normalizeArray(models).map((model) => ({
    id: normalizeOptionalString(model?.id),
    label: normalizeOptionalString(model?.label),
  })).filter((model) => model.id);
}

function normalizeRoute(route = {}) {
  const value = route && typeof route === "object" ? route : {};
  return {
    ready: Boolean(value.ready),
    diagnostics: {
      message: normalizeOptionalString(value.diagnostics?.message || value.message),
    },
  };
}

function normalizeServer(server = {}) {
  const value = server && typeof server === "object" ? server : {};
  return {
    running: Boolean(value.running),
    ready: Boolean(value.ready),
    message: normalizeOptionalString(value.message),
    endpoint: normalizeOptionalString(value.endpoint),
  };
}

function normalizeWhisperStatus(status = {}) {
  const value = status && typeof status === "object" ? status : {};
  return {
    available: value.available !== false,
    running: Boolean(value.running),
    message: normalizeOptionalString(value.message),
  };
}

function normalizeCalendarEvents(events) {
  return normalizeArray(events).map((event) => {
    if (!event || typeof event !== "object") return null;
    const id = normalizeOptionalString(event.id);
    if (!id) return null;
    return {
      id,
      title: normalizeOptionalString(event.title),
      time: normalizeOptionalString(event.time),
      start: normalizeOptionalString(event.start),
      end: normalizeOptionalString(event.end),
      attendees: normalizeOptionalString(event.attendees),
      meetUrl: normalizeOptionalString(event.meetUrl),
      status: normalizeOptionalString(event.status) || "upcoming",
    };
  }).filter(Boolean);
}

function normalizeVoices(voices) {
  return normalizeArray(voices).map((voice) => {
    if (!voice || typeof voice !== "object") return null;
    const voiceId = normalizeOptionalString(voice.voiceId);
    if (!voiceId) return null;
    return {
      voiceId,
      name: normalizeOptionalString(voice.name),
      provider: normalizeOptionalString(voice.provider) || "telnyx",
      language: normalizeOptionalString(voice.language),
      gender: normalizeOptionalString(voice.gender),
    };
  }).filter(Boolean);
}

function sessionTimestampMs(session) {
  const timestamp = Date.parse(normalizeOptionalString(session.updatedAt || session.createdAt));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringList(value) {
  return normalizeArray(value).map(normalizeOptionalString).filter(Boolean);
}

function normalizeOptionalString(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeSearchText(value) {
  return normalizeOptionalString(value).toLowerCase();
}

function uniqueValues(values) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function clampCount(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : fallback;
}
