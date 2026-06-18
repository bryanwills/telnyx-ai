const MAX_ACTION_TITLE_LENGTH = 120;

/**
 * Build a JSON-safe Google Calendar workspace payload for the renderer.
 *
 * For deterministic month math and time-relative state, callers should pass
 * `now` and `monthAnchor` explicitly.
 */
export function buildCalendarWorkspace(input = {}) {
  const ready = Boolean(input.ready);
  const loading = Boolean(input.loading);
  const error = normalizeText(input.error);
  const status = normalizeText(input.status);
  const query = normalizeText(input.query);
  const normalizedQuery = query.toLowerCase();
  const filters = normalizeCalendarFilters(input.filters);
  const viewMode = input.viewMode === "calendar" ? "calendar" : "list";
  const events = normalizeCalendarEventList(input.events);
  const sampleEvents = normalizeCalendarEventList(input.sampleEvents);
  const scribesSessions = normalizeMeetingSessions(input.scribesSessions);
  const meetingBots = normalizeMeetingBots(input.meetingBots);
  const meetingInvites = normalizeMeetingInvites(input.meetingInvites);
  const preflightByEventId = normalizePreflightLookup(input.preflightByEventId ?? input.preflights);
  const realMatchedEvents = ready
    ? events.filter((event) => matchesCalendarEvent(event, normalizedQuery, filters, input.now))
    : [];
  const matchedSampleEvents = sampleEvents.filter((event) => matchesCalendarEvent(event, normalizedQuery, filters, input.now));
  const shouldUseSampleEvents = input.useSampleWhenEmpty !== false
    && (!ready || (!loading && !error && realMatchedEvents.length === 0));
  const visibleEvents = realMatchedEvents.length > 0
    ? realMatchedEvents
    : shouldUseSampleEvents
      ? matchedSampleEvents
      : [];
  const futureVisibleEvents = visibleEvents
    .filter((event) => isFutureCalendarEvent(event, input.now))
    .sort((left, right) => (calendarEventStartMs(left) ?? Number.MAX_SAFE_INTEGER) - (calendarEventStartMs(right) ?? Number.MAX_SAFE_INTEGER));
  const selectedEvent = resolveSelectedEvent(input.selectedEvent, input.selectedEventId, visibleEvents);
  const selectedEventScribeSession = selectedEvent
    ? scribesSessions.find((session) => scribesMeetingMatchesCalendarEvent(session, selectedEvent)) || null
    : null;
  const notices = buildNotices({ error, status });
  const setupState = !ready
    ? {
        title: "Connect Google Workspace to show calendar events.",
        body: "Link verifies Google Calendar and Contacts access, then loads events so you can open meetings or start related workflows from event context.",
        action: buildAction({
          id: "connect-google-workspace",
          label: "Connect Google Workspace",
          intent: "open-google-workspace-settings",
          enabled: true,
          reason: "",
          target: {},
        }),
      }
    : null;
  const emptyState = buildCalendarEmptyState({
    ready,
    loading,
    error,
    query,
    events,
    futureVisibleEvents,
  });
  const rows = futureVisibleEvents.map((event, index) => buildCalendarEventRow(event, {
    index,
    selected: selectedEvent?.id === event.id,
    meetingBots,
    invites: invitesForEvent(meetingInvites, event.id),
    preflight: preflightByEventId[event.id] || null,
    ready,
    linkedSession: scribesSessions.find((session) => scribesMeetingMatchesCalendarEvent(session, event)) || null,
  }));
  const selection = buildCalendarSelection({
    selectedEvent,
    futureVisibleEvents,
    visibleEvents,
  });
  const monthAnchor = resolveMonthAnchor({
    monthAnchor: input.monthAnchor,
    now: input.now,
    selectedEvent,
    futureVisibleEvents,
    visibleEvents,
  });
  const calendarGrid = buildCalendarGrid({
    monthAnchor,
    events: futureVisibleEvents,
    selectedEventId: normalizeText(selectedEvent?.id),
    now: input.now,
  });
  const detail = buildCalendarDetail({
    ready,
    selectedEvent,
    meetingBots,
    meetingInvites,
    preflight: selectedEvent ? preflightByEventId[selectedEvent.id] || null : null,
    linkedSession: selectedEventScribeSession,
  });
  const detailView = detail.kind === "empty" ? null : detail;

  return {
    capability: input.capability || null,
    searchSchema: input.searchSchema || null,
    meetingBots,
    meetingInvites,
    calendarEvents: events,
    visibleEvents,
    futureVisibleEvents,
    selectedEvent,
    selectedEventScribesSession: selectedEventScribeSession,
    listRows: rows.map((row) => ({
      id: row.id,
      title: row.title,
      dateLabel: row.dateText,
      timeLabel: row.timeText,
      attendees: row.attendeesText,
      joinUrl: row.joinAction.target?.url || "",
      joinAction: row.joinAction,
      openAction: row.openAction,
      inviteAction: row.inviteAction,
    })),
    detail: detailView,
    stats: {
      futureCount: futureVisibleEvents.length,
      meetingBotCount: meetingBots.length,
      linkedMeetingNotes: scribesSessions.filter((session) => normalizeText(session.meeting?.calendarEventId)).length,
    },
    updatedAt: normalizeText(input.updatedAt) || new Date().toISOString(),
    surface: "calendar",
    header: {
      title: "Calendar",
      subtitle: calendarHeaderSubtitle({
        ready,
        loading,
        query,
        visibleCount: futureVisibleEvents.length,
        totalCount: events.length,
      }),
      badge: {
        label: ready ? "Connected" : "Not connected",
        tone: ready ? "success" : "warning",
      },
      action: ready
        ? buildAction({
            id: "new-event",
            label: "New Event",
            intent: "open-google-calendar-new-event",
            enabled: true,
            reason: "",
            title: "Create a Google Calendar event",
            target: {
              url: "https://calendar.google.com/calendar/u/0/r/eventedit",
            },
          })
        : setupState?.action || null,
    },
    state: {
      ready,
      loading,
      error,
      status,
      query,
      viewMode,
      totalEvents: events.length,
      visibleEvents: futureVisibleEvents.length,
      selectedEventId: normalizeText(selectedEvent?.id),
      hasSelection: Boolean(selectedEvent),
    },
    notices,
    setupState,
    emptyState,
    search: {
      query,
      normalizedQuery,
      placeholder: "Search calendar events",
      schema: {
        local: true,
        submitIntent: "search-calendar",
        fields: ["title", "attendees", "notes", "phone", "time", "status"],
      },
    },
    filters: {
      applied: filters,
      schema: [
        { id: "today", label: "Today", kind: "boolean" },
        { id: "withDescription", label: "With description", kind: "boolean" },
      ],
      counts: {
        total: events.length,
        visible: futureVisibleEvents.length,
        withDescription: events.filter((event) => Boolean(normalizeText(event.notes))).length,
        live: events.filter((event) => event.status === "live").length,
      },
    },
    views: {
      mode: viewMode,
      options: [
        { id: "list", label: "List", selected: viewMode === "list" },
        { id: "calendar", label: "Calendar", selected: viewMode === "calendar" },
      ],
    },
    list: {
      columns: [
        { id: "event", label: "Event" },
        { id: "when", label: "When" },
        { id: "join", label: "Join" },
      ],
      totalCount: events.length,
      visibleCount: futureVisibleEvents.length,
      rows,
    },
    calendarGrid,
    selection,
    detailState: detail,
  };
}

export const buildCalendarWorkspaceViewModel = buildCalendarWorkspace;

export function calendarEventDateLabel(event) {
  const time = normalizeText(event?.time);
  const parts = time.split(",");
  if (parts.length <= 1) return time === "Time not set" ? "Date not set" : (time || "Date not set");
  return parts.slice(0, -1).join(",").trim() || "Date not set";
}

export function calendarEventTimeLabel(event) {
  const time = normalizeText(event?.time);
  const parts = time.split(",");
  return parts.length > 1 ? parts[parts.length - 1].trim() : (time || "Time not set");
}

export function calendarEventJoinUrl(event) {
  return normalizeText(event?.meetUrl);
}

export function scribesMeetingMatchesCalendarEvent(session, event) {
  if (!session || !event || session.sessionType !== "meeting") return false;
  if (normalizeText(session.meeting?.calendarEventId) && normalizeText(session.meeting?.calendarEventId) === normalizeText(event.id)) return true;
  if (normalizeText(session.id) === calendarEventScribesSessionId(event)) return true;
  const sessionTitle = normalizeText(session.title).toLowerCase();
  const eventTitle = normalizeText(event.title).toLowerCase();
  return Boolean(eventTitle && sessionTitle === eventTitle && normalizeText(session.meeting?.calendarEventStart) === normalizeText(event.start));
}

function calendarScribesUnlinkedSummary(event) {
  return event?.status === "past"
    ? "Open Scribe Meetings and run Deep sync to link this past calendar event with notes or a transcript."
    : "Open Scribe Meetings and run Deep sync before the meeting to link this calendar event with notes.";
}

function normalizeCalendarEventList(events) {
  return Array.isArray(events) ? events.map(normalizeCalendarEvent).filter(Boolean) : [];
}

function normalizeCalendarEvent(event) {
  if (!event || typeof event !== "object") return null;
  const id = normalizeText(event.id);
  if (!id) return null;
  const status = ["past", "upcoming", "live"].includes(event.status) ? event.status : "upcoming";
  return {
    id,
    title: normalizeText(event.title) || "(No title)",
    time: normalizeText(event.time) || "Time not set",
    start: normalizeText(event.start),
    end: normalizeText(event.end),
    attendees: normalizeText(event.attendees) || "No attendees",
    phone: normalizeText(event.phone),
    meetUrl: normalizeText(event.meetUrl),
    notes: normalizeText(event.notes),
    transcript: normalizeText(event.transcript),
    status,
    sample: Boolean(event.sample || event.training),
  };
}

function normalizeMeetingSessions(sessions) {
  return Array.isArray(sessions)
    ? sessions
        .filter((session) => session && typeof session === "object" && session.sessionType === "meeting")
        .map((session) => ({
          id: normalizeText(session.id),
          title: normalizeText(session.title),
          transcriptText: normalizeText(session.transcriptText),
          sessionType: "meeting",
          createdAt: normalizeText(session.createdAt),
          updatedAt: normalizeText(session.updatedAt),
          durationMs: Number.isFinite(Number(session.durationMs)) ? Number(session.durationMs) : 0,
          meeting: {
            calendarEventId: normalizeText(session.meeting?.calendarEventId),
            calendarEventUrl: normalizeText(session.meeting?.calendarEventUrl),
            calendarEventStart: normalizeText(session.meeting?.calendarEventStart),
            calendarEventEnd: normalizeText(session.meeting?.calendarEventEnd),
          },
        }))
        .filter((session) => session.id)
    : [];
}

function normalizeMeetingBots(bots) {
  return Array.isArray(bots)
    ? bots
        .map((bot) => {
          if (!bot || typeof bot !== "object") return null;
          const id = normalizeText(bot.id);
          if (!id) return null;
          return {
            id,
            name: normalizeText(bot.name),
            displayName: normalizeText(bot.displayName) || normalizeText(bot.name) || id,
            description: normalizeText(bot.description),
            source: normalizeText(bot.source),
            type: normalizeText(bot.type),
            available: bot.available !== false,
            adapter: {
              kind: normalizeText(bot.adapter?.kind),
              asyncOnly: Boolean(bot.adapter?.asyncOnly),
            },
          };
        })
        .filter(Boolean)
    : [];
}

function normalizeMeetingInvites(invites) {
  return Array.isArray(invites)
    ? invites
        .map((invite) => {
          if (!invite || typeof invite !== "object") return null;
          const id = normalizeText(invite.id);
          if (!id) return null;
          return {
            id,
            calendarId: normalizeText(invite.calendarId),
            eventId: normalizeText(invite.eventId),
            eventTitle: normalizeText(invite.eventTitle),
            eventStart: normalizeText(invite.eventStart),
            eventEnd: normalizeText(invite.eventEnd),
            botId: normalizeText(invite.botId),
            botName: normalizeText(invite.botName),
            botType: normalizeText(invite.botType),
            identity: invite.identity && typeof invite.identity === "object"
              ? {
                  email: normalizeText(invite.identity.email),
                }
              : null,
            liveJoin: Boolean(invite.liveJoin),
            sendUpdates: normalizeText(invite.sendUpdates) || "all",
            joinTarget: invite.joinTarget && typeof invite.joinTarget === "object"
              ? {
                  type: normalizeText(invite.joinTarget.type),
                  label: normalizeText(invite.joinTarget.label),
                  dialTarget: normalizeText(invite.joinTarget.dialTarget),
                  accessCode: normalizeText(invite.joinTarget.accessCode),
                  dtmf: normalizeText(invite.joinTarget.dtmf),
                }
              : null,
            status: normalizeText(invite.status) || "invited",
            blockers: normalizeStringArray(invite.blockers),
            createdAt: normalizeText(invite.createdAt),
            updatedAt: normalizeText(invite.updatedAt),
          };
        })
        .filter(Boolean)
    : [];
}

function normalizePreflightLookup(preflights) {
  if (!preflights) return {};
  if (Array.isArray(preflights)) {
    return preflights.reduce((lookup, item) => {
      const normalized = normalizePreflight(item);
      if (!normalized?.eventId) return lookup;
      return { ...lookup, [normalized.eventId]: normalized };
    }, {});
  }
  if (typeof preflights === "object") {
    return Object.entries(preflights).reduce((lookup, [eventId, value]) => {
      const normalized = normalizePreflight(value);
      const key = normalized?.eventId || normalizeText(eventId);
      if (!key) return lookup;
      return { ...lookup, [key]: { ...normalized, eventId: key } };
    }, {});
  }
  return {};
}

function normalizePreflight(value) {
  if (!value || typeof value !== "object") return null;
  return {
    eventId: normalizeText(value.eventId),
    calendarId: normalizeText(value.calendarId),
    blockers: normalizeStringArray(value.blockers),
    liveJoinBlockers: normalizeStringArray(value.liveJoinBlockers),
    calendarWritable: Boolean(value.calendarWritable),
    liveJoinReady: Boolean(value.liveJoinReady),
    joinTarget: value.joinTarget && typeof value.joinTarget === "object"
      ? {
          type: normalizeText(value.joinTarget.type),
          label: normalizeText(value.joinTarget.label),
          dialTarget: normalizeText(value.joinTarget.dialTarget),
          accessCode: normalizeText(value.joinTarget.accessCode),
          dtmf: normalizeText(value.joinTarget.dtmf),
        }
      : null,
  };
}

function normalizeCalendarFilters(filters) {
  const value = filters && typeof filters === "object" ? filters : {};
  return {
    today: Boolean(value.today),
    withDescription: Boolean(value.withDescription),
  };
}

function matchesCalendarEvent(event, query, filters, now) {
  if (filters.today) {
    const eventDateKey = calendarEventDayKey(event);
    const todayKey = calendarDateKey(resolveNowDate(now));
    if (!eventDateKey || eventDateKey !== todayKey) return false;
  }
  if (filters.withDescription && !normalizeText(event.notes)) return false;
  if (!query) return true;
  const searchText = [
    event.title,
    event.attendees,
    event.notes,
    event.phone,
    event.time,
    event.status,
  ].join(" ").toLowerCase();
  return searchText.includes(query);
}

function resolveSelectedEvent(selectedEvent, selectedEventId, visibleEvents) {
  const normalizedSelectedEvent = normalizeCalendarEvent(selectedEvent);
  if (normalizedSelectedEvent) return normalizedSelectedEvent;
  const eventId = normalizeText(selectedEventId);
  return eventId ? visibleEvents.find((event) => event.id === eventId) || null : null;
}

function buildCalendarEventRow(event, { index, selected, meetingBots, invites, preflight, ready, linkedSession }) {
  const joinAction = buildCalendarJoinAction(event);
  const inviteAction = buildCalendarInviteAction({
    event,
    ready,
    meetingBots,
    preflight,
  });
  const inviteSummary = summarizeInvites(invites);

  return {
    id: event.id,
    eventId: event.id,
    selected,
    index,
    title: event.title,
    dateLabel: calendarEventDateLabel(event),
    timeLabel: calendarEventTimeLabel(event),
    attendees: event.attendees,
    dateText: calendarEventDateLabel(event),
    timeText: calendarEventTimeLabel(event),
    attendeesText: event.attendees,
    notesSnippet: event.notes ? truncate(event.notes, 180) : "",
    status: event.status,
    joinAction,
    inviteAction,
    openAction: buildAction({
      id: `open-event-${event.id}`,
      label: "Open Event",
      intent: "open-calendar-event",
      enabled: true,
      reason: "",
      title: `Open event ${event.title}`,
      target: { eventId: event.id },
    }),
    badges: [
      { label: capitalize(event.status), tone: event.status === "live" ? "success" : "default" },
      linkedSession ? { label: "Notes linked", tone: "success" } : null,
      inviteSummary.total > 0 ? { label: `${inviteSummary.total} bot invite${inviteSummary.total === 1 ? "" : "s"}`, tone: inviteSummary.blocked > 0 ? "warning" : "default" } : null,
    ].filter(Boolean),
    inviteSummary,
  };
}

function buildCalendarSelection({ selectedEvent, futureVisibleEvents, visibleEvents }) {
  const eventIds = futureVisibleEvents.map((event) => event.id);
  const selectedIndex = selectedEvent ? eventIds.indexOf(selectedEvent.id) : -1;
  return {
    hasSelection: Boolean(selectedEvent),
    selectedEventId: normalizeText(selectedEvent?.id),
    selectedIndex,
    totalVisibleRows: eventIds.length,
    previousEventId: selectedIndex > 0 ? eventIds[selectedIndex - 1] : "",
    nextEventId: selectedIndex >= 0 && selectedIndex < eventIds.length - 1 ? eventIds[selectedIndex + 1] : "",
    title: normalizeText(selectedEvent?.title),
    subtitle: selectedEvent ? `${calendarEventDateLabel(selectedEvent)} · ${calendarEventTimeLabel(selectedEvent)}` : "",
    visibleEventIds: eventIds,
    matchedEventIds: visibleEvents.map((event) => event.id),
  };
}

function buildCalendarDetail({ ready, selectedEvent, meetingBots, meetingInvites, preflight, linkedSession }) {
  if (!selectedEvent) {
    return {
      kind: "empty",
      header: {
        title: "Calendar",
        subtitle: ready ? "Choose an event to inspect the detail workspace." : "Connect Google Workspace to load events.",
      },
      actions: [],
    };
  }

  const invites = invitesForEvent(meetingInvites, selectedEvent.id);
  const joinAction = buildCalendarJoinAction(selectedEvent);
  const inviteAction = buildCalendarInviteAction({
    event: selectedEvent,
    ready,
    meetingBots,
    preflight,
  });
  const linkedScribeSession = linkedSession
    ? {
        linked: true,
        sessionId: linkedSession.id,
        title: linkedSession.title || selectedEvent.title,
        summary: linkedSession.transcriptText || "Meeting note shell is synced. Transcript content will appear after capture.",
        updatedAt: linkedSession.updatedAt,
        action: buildAction({
          id: "open-scribe-session",
          label: "Open Notes",
          intent: "open-scribes",
          enabled: true,
          reason: "",
          title: `Open notes for ${selectedEvent.title}`,
          target: {
            sessionId: linkedSession.id,
            eventId: selectedEvent.id,
          },
        }),
      }
    : {
        linked: false,
        sessionId: "",
        title: "",
        summary: calendarScribesUnlinkedSummary(selectedEvent),
        updatedAt: "",
        action: buildAction({
          id: "open-scribes",
          label: "Open Scribes",
          intent: "open-scribes",
          enabled: true,
          reason: "",
          title: `Open Scribes for ${selectedEvent.title}`,
          target: {
            eventId: selectedEvent.id,
          },
        }),
      };

  return {
    kind: "event",
    header: {
      title: selectedEvent.title,
      subtitle: `${calendarEventDateLabel(selectedEvent)} · ${calendarEventTimeLabel(selectedEvent)}`,
      badgeLabel: capitalize(selectedEvent.status),
      badgeTone: selectedEvent.status === "live" ? "success" : "default",
      badge: {
        label: capitalize(selectedEvent.status),
        tone: selectedEvent.status === "live" ? "success" : "default",
      },
    },
    summary: {
      when: `${calendarEventDateLabel(selectedEvent)} · ${calendarEventTimeLabel(selectedEvent)}`,
      people: selectedEvent.attendees || "No attendees",
      meetingLink: calendarEventJoinUrl(selectedEvent) || "No meeting link saved",
      phone: selectedEvent.phone || "",
    },
    description: selectedEvent.notes || "No description saved for this event.",
    event: selectedEvent,
    joinUrl: calendarEventJoinUrl(selectedEvent),
    whenLabel: `${calendarEventDateLabel(selectedEvent)} · ${calendarEventTimeLabel(selectedEvent)}`,
    linkedScribes: linkedSession
      ? {
          id: linkedSession.id,
          title: linkedSession.title || selectedEvent.title,
          transcriptText: linkedSession.transcriptText || "",
        }
      : null,
    linkedScribeSession,
    invites: invites.map((invite) => ({
      id: invite.id,
      botName: invite.botName,
      identityEmail: invite.identity?.email || "AgentMail identity pending",
      status: invite.status,
      statusLabel: meetingInviteStatusLabel(invite.status),
      blockers: invite.blockers,
      liveJoin: invite.liveJoin,
      sendUpdates: invite.sendUpdates,
      joinTargetSummary: formatJoinTarget(invite.joinTarget),
      cancelAction: buildAction({
        id: `cancel-invite-${invite.id}`,
        label: "Cancel Live Join",
        intent: "cancel-meeting-invite",
        enabled: invite.status === "scheduled",
        reason: invite.status === "scheduled" ? "" : "Only scheduled live joins can be cancelled here.",
        title: `Cancel ${invite.botName} live join`,
        target: { inviteId: invite.id, eventId: selectedEvent.id },
      }),
    })),
    actions: [
      joinAction,
      inviteAction,
      linkedScribeSession.action,
    ],
    inviteReadiness: preflight
      ? {
          calendarWritable: preflight.calendarWritable,
          liveJoinReady: preflight.liveJoinReady,
          blockers: preflight.blockers,
          liveJoinBlockers: preflight.liveJoinBlockers,
          joinTargetSummary: formatJoinTarget(preflight.joinTarget),
        }
      : null,
  };
}

function buildCalendarGrid({ monthAnchor, events, selectedEventId, now }) {
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(monthAnchor);
  const cells = calendarMonthCells(monthAnchor).map((date, index) => {
    if (!date) {
      return {
        id: `empty-${index}`,
        empty: true,
      };
    }
    const key = calendarDateKey(date);
    const dayEvents = events.filter((event) => calendarEventDayKey(event) === key);
    return {
      id: key,
      empty: false,
      key,
      date: date.toISOString(),
      dayNumber: date.getDate(),
      isToday: key === calendarDateKey(resolveNowDate(now)),
      events: dayEvents.slice(0, 3).map((event) => ({
        id: event.id,
        title: event.title,
        selected: selectedEventId === event.id,
      })),
      overflowCount: Math.max(dayEvents.length - 3, 0),
    };
  });

  return {
    monthLabel,
    weekdayLabels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    cells,
  };
}

function buildCalendarEmptyState({ ready, loading, error, query, events, futureVisibleEvents }) {
  if (futureVisibleEvents.length > 0) return null;
  if (!ready) {
    return {
      kind: "setup_required",
      title: "Calendar not connected",
      body: "Connect Google Workspace to load calendar events.",
      tone: "warning",
      cta: buildAction({
        id: "connect-google-workspace",
        label: "Connect Google Workspace",
        intent: "open-google-workspace-settings",
        enabled: true,
        reason: "",
        target: {},
      }),
    };
  }
  if (loading) {
    return {
      kind: "empty",
      title: "Loading events",
      body: "Loading Google Calendar events...",
      tone: "default",
    };
  }
  if (error) {
    return {
      kind: "error",
      title: "Calendar unavailable",
      body: error,
      tone: "warning",
    };
  }
  return {
    kind: "empty",
    title: query ? "No events found" : "No upcoming Google Calendar events found",
    body: query
      ? "Try another search term or filter."
      : events.length > 0
        ? `${events.length} calendar events loaded, but none are upcoming after filtering.`
        : "Google Calendar is connected, but Link did not receive any upcoming events from your primary calendar.",
    tone: "default",
  };
}

function buildCalendarJoinAction(event) {
  const joinUrl = calendarEventJoinUrl(event);
  const isSample = Boolean(event.sample);
  return buildAction({
    id: `join-event-${event.id}`,
    label: isSample ? "Open Link" : "Join",
    intent: "join-calendar-event",
    enabled: Boolean(joinUrl),
    reason: joinUrl ? "" : "No meeting link saved.",
    title: joinUrl
      ? `${isSample ? "Open booking link for" : "Join"} ${event.title}`
      : `No meeting link is saved for ${event.title}`,
    target: joinUrl ? { eventId: event.id, url: joinUrl } : { eventId: event.id },
  });
}

function buildCalendarInviteAction({ event, ready, meetingBots, preflight }) {
  const isSample = Boolean(event.sample);
  const hasBots = meetingBots.length > 0;
  const blockers = preflight?.blockers || [];
  const enabled = !isSample && ready && hasBots && blockers.length === 0;
  let reason = "";
  if (isSample) reason = "Sample or training events do not support bot invites.";
  else if (!ready) reason = "Connect Google Workspace before inviting a bot.";
  else if (!hasBots) reason = "No meeting bots are available.";
  else if (blockers.length > 0) reason = blockers[0];

  return buildAction({
    id: `invite-bot-${event.id}`,
    label: "Invite Bot",
    intent: "invite-meeting-bot",
    enabled,
    reason,
    title: `Invite a bot to ${event.title}`,
    target: {
      eventId: event.id,
      calendarId: preflight?.calendarId || "primary",
      liveJoinReady: Boolean(preflight?.liveJoinReady),
      liveJoinWarning: preflight?.liveJoinBlockers?.[0] || "",
    },
  });
}

function invitesForEvent(invites, eventId) {
  return invites.filter((invite) => invite.eventId === eventId);
}

function summarizeInvites(invites) {
  return invites.reduce((summary, invite) => ({
    total: summary.total + 1,
    blocked: summary.blocked + (invite.status === "blocked" ? 1 : 0),
    scheduled: summary.scheduled + (invite.status === "scheduled" ? 1 : 0),
    joined: summary.joined + (invite.status === "joined" ? 1 : 0),
  }), { total: 0, blocked: 0, scheduled: 0, joined: 0 });
}

function formatJoinTarget(joinTarget) {
  if (!joinTarget) return "";
  const type = normalizeText(joinTarget.type).toUpperCase();
  const label = normalizeText(joinTarget.label) || normalizeText(joinTarget.dialTarget);
  return [type, label].filter(Boolean).join(" · ");
}

function meetingInviteStatusLabel(status) {
  switch (status) {
    case "invited":
      return "Invited";
    case "scheduled":
      return "Scheduled";
    case "joining":
      return "Joining";
    case "joined":
      return "Joined";
    case "blocked":
      return "Blocked";
    case "ended":
      return "Ended";
    case "failed":
      return "Failed";
    default:
      return normalizeText(status) || "Invited";
  }
}

function buildNotices({ error, status }) {
  const notices = [];
  if (error) notices.push({ tone: "warning", message: error });
  if (status) notices.push({ tone: error ? "default" : "info", message: status });
  return notices;
}

function calendarHeaderSubtitle({ ready, loading, query, visibleCount, totalCount }) {
  if (!ready) return "Connect Google Workspace to load events and meeting context.";
  if (loading) return "Loading Google Calendar events...";
  if (query) return `${visibleCount} event${visibleCount === 1 ? "" : "s"} match "${query}".`;
  if (visibleCount) return `${visibleCount} upcoming event${visibleCount === 1 ? "" : "s"} ready.`;
  if (totalCount) return `${totalCount} event${totalCount === 1 ? "" : "s"} loaded.`;
  return "Upcoming Google Calendar events will appear here.";
}

function resolveMonthAnchor({ monthAnchor, now, selectedEvent, futureVisibleEvents, visibleEvents }) {
  const candidates = [
    monthAnchor,
    selectedEvent?.start,
    futureVisibleEvents[0]?.start,
    visibleEvents[0]?.start,
    now,
  ];
  for (const candidate of candidates) {
    const date = parseDate(candidate);
    if (date) return new Date(date.getFullYear(), date.getMonth(), 1);
  }
  const fallback = resolveNowDate(now);
  return new Date(fallback.getFullYear(), fallback.getMonth(), 1);
}

function calendarMonthCells(anchor) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingDays = firstDay.getDay();
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
  return Array.from({ length: totalCells }, (_, index) => {
    const day = index - leadingDays + 1;
    return day >= 1 && day <= daysInMonth ? new Date(year, month, day) : null;
  });
}

function calendarEventStartMs(event) {
  return parseDate(event?.start)?.getTime() ?? null;
}

function calendarEventEndMs(event) {
  return parseDate(event?.end)?.getTime() ?? calendarEventStartMs(event);
}

function isFutureCalendarEvent(event, now) {
  if (event.status === "past") return false;
  const nowMs = resolveNowDate(now).getTime();
  const endMs = calendarEventEndMs(event);
  return endMs === null || endMs >= nowMs;
}

function calendarEventDayKey(event) {
  const start = parseDate(event?.start);
  return start ? calendarDateKey(start) : "";
}

function calendarDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calendarEventScribesSessionId(event) {
  const safeId = normalizeText(event?.id).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return `scribes-calendar-${safeId || "event"}`;
}

function resolveNowDate(now) {
  return parseDate(now) || new Date();
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function buildAction({ id, label, intent, enabled, reason, title, target, busy = false, active = false }) {
  const safeTitle = safeTitleText(title || label || id);
  return {
    id,
    label: normalizeText(label) || id,
    intent: normalizeText(intent) || id,
    enabled: Boolean(enabled),
    reason: normalizeText(reason),
    title: safeTitle,
    descriptor: safeTitle,
    busy: Boolean(busy),
    active: Boolean(active),
    target: target && typeof target === "object" ? sanitizeJsonObject(target) : {},
  };
}

function truncate(value, length) {
  const normalized = normalizeText(value);
  if (normalized.length <= length) return normalized;
  return `${normalized.slice(0, Math.max(length - 3, 0)).trimEnd()}...`;
}

function capitalize(value) {
  const normalized = normalizeText(value);
  return normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)}` : "";
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map((item) => normalizeText(item)).filter(Boolean) : [];
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function safeTitleText(value) {
  const normalized = normalizeText(value) || "Action";
  return normalized.length > MAX_ACTION_TITLE_LENGTH
    ? `${normalized.slice(0, MAX_ACTION_TITLE_LENGTH - 3).trimEnd()}...`
    : normalized;
}

function sanitizeJsonObject(value) {
  return JSON.parse(JSON.stringify(value));
}
