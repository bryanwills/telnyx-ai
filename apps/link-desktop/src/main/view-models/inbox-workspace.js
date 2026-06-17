const GMAIL_BASE_URL = "https://mail.google.com/mail/u/0";
const MAX_ACTION_TITLE_LENGTH = 120;

/**
 * Build a JSON-safe Gmail Inbox workspace payload for the renderer.
 *
 * Pass `selectedThread`, `threads`, `draft`, `savedDraft`, and UI state flags
 * from the main process. Callers that want deterministic output should also
 * provide any time-sensitive or stateful inputs explicitly.
 */
export function buildInboxWorkspace(input = {}) {
  const ready = Boolean(input.ready);
  const loading = Boolean(input.loading);
  const error = normalizeText(input.error);
  const status = normalizeText(input.status);
  const query = normalizeText(input.query);
  const normalizedQuery = query.toLowerCase();
  const recipientFilter = normalizeRecipientFilter(input.recipientFilter);
  const hiddenThreadIds = new Set(normalizeStringArray(input.hiddenThreadIds));
  const threads = normalizeThreadList(input.threads);
  const visibleThreads = threads.filter((thread) =>
    !hiddenThreadIds.has(thread.threadId)
    && matchesInboxQuery(thread, normalizedQuery)
    && matchesRecipientFilter(thread, recipientFilter),
  );
  const recipientCounts = countRecipients(threads, hiddenThreadIds);
  const selectedThread = resolveSelectedThread(input.selectedThread, input.selectedThreadId, threads);
  const creatingNewDraft = Boolean(input.creatingNewDraft ?? input.composing);
  const savedDraft = normalizeSavedDraft(input.savedDraft);
  const draft = buildDraftState({
    draft: input.draft,
    selectedThread,
    savedDraft,
    creatingNewDraft,
  });
  const selection = buildInboxSelection({
    ready,
    creatingNewDraft,
    draft,
    selectedThread,
    visibleThreads,
    savedDraft,
  });
  const notices = buildNotices({ error, status });
  const setupState = !ready
    ? {
        title: "Connect Google Inbox to read threads and save Gmail drafts.",
        body: "Link uses gog with an app-level no-send guard. Drafts are saved to Gmail Drafts, and sending still happens only in Gmail.",
        action: buildAction({
          id: "connect-inbox",
          label: "Connect Inbox",
          intent: "connect-google-inbox",
          enabled: !loading,
          reason: loading ? "Inbox connection is already in progress." : "",
          target: {},
        }),
      }
    : null;
  const emptyState = buildInboxEmptyState({
    ready,
    loading,
    error,
    query,
    visibleThreads,
  });
  const rows = visibleThreads.map((thread, index) => buildInboxThreadRow(thread, {
    selected: selectedThread?.threadId === thread.threadId,
    index,
  }));
  const detail = buildInboxDetail({
    ready,
    creatingNewDraft,
    draft,
    selectedThread,
    savedDraft,
    emailDraftAgentReady: Boolean(input.emailDraftAgentReady),
    draftingWithAgent: Boolean(input.draftingWithAgent),
    savingDraft: Boolean(input.savingDraft),
  });
  const detailView = detail.kind === "empty" ? null : detail;

  return {
    capability: input.capability || null,
    searchSchema: input.searchSchema || null,
    composerSchema: input.composerSchema || null,
    threads,
    visibleThreads,
    selectedThread: creatingNewDraft ? null : selectedThread,
    selectedThreadId: normalizeText(selectedThread?.threadId),
    recipientCounts,
    showDetail: Boolean(creatingNewDraft || selectedThread),
    listRows: rows.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      subject: row.title,
      snippet: row.subtitle,
      fromLabel: row.fromLabel,
      dateLabel: row.dateText,
      recipientType: row.recipientType,
      unread: row.unread,
      action: row.openAction,
      openAction: row.openAction,
    })),
    detail: detailView,
    updatedAt: normalizeText(input.updatedAt) || new Date().toISOString(),
    surface: "gmail-inbox",
    header: {
      title: "Inbox",
      subtitle: inboxHeaderSubtitle({
        ready,
        loading,
        visibleCount: visibleThreads.length,
        totalCount: threads.length,
        query,
      }),
      badge: {
        label: ready ? "Connected" : "Not connected",
        tone: ready ? "success" : "warning",
      },
      action: ready
        ? buildAction({
            id: "manual-compose",
            label: "New Email",
            intent: "compose-new-email",
            enabled: true,
            reason: "",
            title: "Compose a Gmail draft",
            target: {},
            active: creatingNewDraft,
          })
        : setupState?.action || null,
    },
    state: {
      ready,
      loading,
      error,
      status,
      query,
      recipientFilter,
      hasSelection: selection.hasSelection,
      selectionMode: selection.mode,
      emailDraftAgentReady: Boolean(input.emailDraftAgentReady),
      draftingWithAgent: Boolean(input.draftingWithAgent),
      savingDraft: Boolean(input.savingDraft),
    },
    notices,
    setupState,
    emptyState,
    search: {
      query,
      normalizedQuery,
      placeholder: "Search inbox messages, senders, subjects, or snippets",
      emptyTitle: query ? "No messages found" : "No messages",
      schema: {
        local: true,
        submitIntent: "search-inbox",
        fields: ["subject", "from", "snippet", "participants", "source", "date"],
      },
    },
    filters: {
      applied: {
        recipient: recipientFilter,
      },
      counts: {
        all: recipientCounts.direct + recipientCounts.group,
        direct: recipientCounts.direct,
        group: recipientCounts.group,
      },
      options: [
        { id: "all", label: "All unread", count: recipientCounts.direct + recipientCounts.group, selected: recipientFilter === "all" },
        { id: "direct", label: "My alias", count: recipientCounts.direct, selected: recipientFilter === "direct" },
        { id: "group", label: "Group alias", count: recipientCounts.group, selected: recipientFilter === "group" },
      ],
      schema: [
        {
          id: "recipient",
          label: "Recipient",
          kind: "select",
          options: ["all", "direct", "group"],
        },
      ],
    },
    list: {
      columns: [
        { id: "subject", label: "Subject" },
        { id: "from", label: "From" },
        { id: "date", label: "Date" },
      ],
      totalCount: threads.length,
      visibleCount: visibleThreads.length,
      rows,
    },
    selection,
    detailState: detail,
  };
}

export const buildInboxWorkspaceViewModel = buildInboxWorkspace;

export function displayInboxThreadSubject(thread) {
  const subject = !isInboxPlaceholderSubject(thread?.subject) ? cleanInboxSubject(thread?.subject) : "";
  const messageSubject = normalizeThreadMessages(thread?.messages)
    .find((message) => !isInboxPlaceholderSubject(message.subject))
    ?.subject || "";
  return cleanInboxSubject(subject || messageSubject) || "(No subject)";
}

export function displayInboxThreadSender(thread) {
  const messages = normalizeThreadMessages(thread?.messages);
  const candidates = [
    normalizeText(thread?.from),
    messages.find((message) => !isInboxPlaceholderSender(message.from))?.from || "",
    ...normalizeStringArray(thread?.participants),
  ];
  return candidates.find((candidate) => !isInboxPlaceholderSender(candidate)) || "Unknown sender";
}

export function replySubject(subject) {
  const trimmed = normalizeText(subject);
  if (!trimmed) return "Re:";
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

function normalizeThreadList(threads) {
  return Array.isArray(threads) ? threads.map(normalizeThread).filter(Boolean) : [];
}

function normalizeThread(thread) {
  if (!thread || typeof thread !== "object") return null;
  const threadId = normalizeText(thread.threadId ?? thread.id);
  if (!threadId) return null;
  return {
    id: normalizeText(thread.id) || threadId,
    threadId,
    messageId: normalizeText(thread.messageId),
    subject: normalizeText(thread.subject) || "(No subject)",
    source: normalizeText(thread.source),
    from: normalizeText(thread.from) || "Unknown sender",
    to: normalizeText(thread.to),
    cc: normalizeText(thread.cc),
    deliveredTo: normalizeText(thread.deliveredTo),
    accountEmail: normalizeText(thread.accountEmail),
    recipientType: thread.recipientType === "direct" ? "direct" : "group",
    date: normalizeText(thread.date) || "No date",
    snippet: normalizeText(thread.snippet),
    unread: Boolean(thread.unread),
    labels: normalizeStringArray(thread.labels),
    url: normalizeText(thread.url) || gmailThreadUrl(threadId),
    participants: normalizeStringArray(thread.participants),
    replyTo: normalizeText(thread.replyTo),
    replyToMessageId: normalizeText(thread.replyToMessageId),
    messages: normalizeThreadMessages(thread.messages),
  };
}

function normalizeThreadMessages(messages) {
  return Array.isArray(messages) ? messages.map(normalizeThreadMessage).filter(Boolean) : [];
}

function normalizeThreadMessage(message, index = 0) {
  if (!message || typeof message !== "object") return null;
  const threadId = normalizeText(message.threadId);
  const id = normalizeText(message.id ?? message.messageId) || (threadId ? `${threadId}-${index}` : "");
  if (!id) return null;
  return {
    id,
    messageId: normalizeText(message.messageId),
    threadId,
    subject: normalizeText(message.subject),
    source: normalizeText(message.source),
    from: normalizeText(message.from) || "Unknown sender",
    to: normalizeText(message.to),
    cc: normalizeText(message.cc),
    replyTo: normalizeText(message.replyTo),
    date: normalizeText(message.date) || "No date",
    snippet: normalizeText(message.snippet),
    body: normalizeText(message.body),
    htmlBody: normalizeText(message.htmlBody),
  };
}

function normalizeSavedDraft(draft) {
  if (!draft || typeof draft !== "object") return null;
  const draftId = normalizeText(draft.draftId ?? draft.id);
  return {
    id: normalizeText(draft.id) || draftId || "",
    draftId,
    messageId: normalizeText(draft.messageId),
    threadId: normalizeText(draft.threadId),
    to: normalizeText(draft.to),
    cc: normalizeText(draft.cc),
    bcc: normalizeText(draft.bcc),
    subject: normalizeText(draft.subject),
    body: normalizeText(draft.body),
    updatedAt: normalizeText(draft.updatedAt),
    url: normalizeText(draft.url),
  };
}

function resolveSelectedThread(selectedThread, selectedThreadId, threads) {
  const normalizedSelectedThread = normalizeThread(selectedThread);
  if (normalizedSelectedThread) return normalizedSelectedThread;
  const threadId = normalizeText(selectedThreadId);
  return threadId ? threads.find((thread) => thread.threadId === threadId) || null : null;
}

function buildDraftState({ draft, selectedThread, savedDraft, creatingNewDraft }) {
  const baseDraft = draft && typeof draft === "object" ? draft : {};
  const to = normalizeText(baseDraft.to) || savedDraft?.to || (creatingNewDraft ? "" : normalizeText(selectedThread?.replyTo));
  const subject = normalizeText(baseDraft.subject)
    || savedDraft?.subject
    || (creatingNewDraft ? "" : replySubject(displayInboxThreadSubject(selectedThread)));
  const body = normalizeText(baseDraft.body) || savedDraft?.body || "";
  const mode = creatingNewDraft ? "compose" : selectedThread ? "reply" : "empty";
  return {
    mode,
    to,
    subject,
    body,
    cc: normalizeText(baseDraft.cc) || savedDraft?.cc || "",
    bcc: normalizeText(baseDraft.bcc) || savedDraft?.bcc || "",
    savedDraft,
  };
}

function buildInboxSelection({ ready, creatingNewDraft, draft, selectedThread, visibleThreads, savedDraft }) {
  const selectedThreadId = normalizeText(selectedThread?.threadId);
  const visibleThreadIds = visibleThreads.map((thread) => thread.threadId);
  const selectedIndex = selectedThreadId ? visibleThreadIds.indexOf(selectedThreadId) : -1;
  const mode = creatingNewDraft ? "compose" : selectedThread ? "thread" : "none";
  const openUrl = savedDraft?.url || selectedThread?.url || (selectedThreadId ? gmailThreadUrl(selectedThreadId) : "");

  return {
    mode,
    hasSelection: mode !== "none",
    selectedId: creatingNewDraft ? "__compose__" : selectedThreadId,
    selectedThreadId,
    selectedIndex,
    totalVisibleRows: visibleThreadIds.length,
    previousThreadId: selectedIndex > 0 ? visibleThreadIds[selectedIndex - 1] : "",
    nextThreadId: selectedIndex >= 0 && selectedIndex < visibleThreadIds.length - 1 ? visibleThreadIds[selectedIndex + 1] : "",
    title: creatingNewDraft
      ? normalizeText(draft.subject) || "New email"
      : displayInboxThreadSubject(selectedThread),
    subtitle: creatingNewDraft
      ? normalizeText(draft.to) || "Manual Gmail draft"
      : displayInboxThreadSender(selectedThread),
    openUrl,
    openThreadAction: buildAction({
      id: "open-thread",
      label: "Open Thread",
      intent: "open-inbox-thread",
      enabled: Boolean(selectedThreadId),
      reason: selectedThreadId ? "" : "Choose an inbox thread first.",
      title: selectedThreadId ? `Open thread ${displayInboxThreadSubject(selectedThread)}` : "Open thread",
      target: selectedThreadId ? { threadId: selectedThreadId, url: selectedThread?.url || gmailThreadUrl(selectedThreadId) } : {},
    }),
    openDraftAction: buildAction({
      id: "open-draft",
      label: "Open Draft",
      intent: "open-gmail-draft",
      enabled: Boolean(savedDraft?.url),
      reason: savedDraft?.url ? "" : "Save a Gmail draft first.",
      title: savedDraft?.url ? `Open Gmail draft ${normalizeText(savedDraft.subject) || "draft"}` : "Open draft",
      target: savedDraft?.url ? { draftId: savedDraft.draftId, url: savedDraft.url } : {},
    }),
    manualComposeAction: buildAction({
      id: "manual-compose",
      label: "Manual Compose",
      intent: "compose-new-email",
      enabled: ready,
      reason: ready ? "" : "Connect Google Inbox before composing a Gmail draft.",
      title: "Compose a Gmail draft manually",
      target: {},
      active: creatingNewDraft,
    }),
  };
}

function buildInboxDetail({
  ready,
  creatingNewDraft,
  draft,
  selectedThread,
  savedDraft,
  emailDraftAgentReady,
  draftingWithAgent,
  savingDraft,
}) {
  if (!creatingNewDraft && !selectedThread) {
    return {
      kind: "empty",
      header: {
        title: "Inbox",
        subtitle: ready ? "Choose an inbox thread to read it and prepare a draft." : "Connect Google Inbox to start.",
      },
      actions: [],
    };
  }

  const draftValidation = validateDraft({
    creatingNewDraft,
    draft,
    selectedThread,
  });
  const savedDraftLabel = savedDraft?.draftId ? "Update Gmail draft" : "Save Gmail draft";
  const openInGmailUrl = savedDraft?.url || selectedThread?.url || (selectedThread?.threadId ? gmailThreadUrl(selectedThread.threadId) : "");
  const mode = creatingNewDraft ? "compose" : "thread";
  const messages = creatingNewDraft
    ? []
    : selectedThread.messages.map((message) => ({
        ...message,
        threadId: message.threadId || selectedThread.threadId,
        to: message.to || "",
        cc: message.cc || "",
        replyTo: message.replyTo || "",
        date: message.date || "No date",
        subject: message.subject || displayInboxThreadSubject(selectedThread),
        body: message.body || message.snippet || "No message body available.",
        htmlBody: message.htmlBody || "",
        dateText: message.date || "No date",
        bodyText: message.body || message.snippet || "No message body available.",
        htmlDocument: buildInboxMessageDocument(message.htmlBody),
        renderMode: message.htmlBody ? "html" : "text",
      }));
  const title = creatingNewDraft
    ? normalizeText(draft.subject) || "New email"
    : displayInboxThreadSubject(selectedThread);
  const subtitle = creatingNewDraft
    ? normalizeText(draft.to) || "Manual Gmail draft"
    : displayInboxThreadSender(selectedThread);
  const actions = [
    buildAction({
      id: "open-draft-chat",
      label: "Open Draft Workflow",
      intent: "open-email-draft-chat",
      enabled: emailDraftAgentReady,
      reason: emailDraftAgentReady ? "" : "Connect a chat runtime before drafting with an agent.",
      title: creatingNewDraft ? "Open a chat to draft a new email" : `Open a chat to draft a reply to ${title}`,
      target: {
        mode: draft.mode,
        threadId: selectedThread?.threadId || "",
      },
    }),
    buildAction({
      id: "reset-draft",
      label: "Reset Draft",
      intent: "reset-inbox-draft",
      enabled: Boolean(draft.to || draft.subject || draft.body || savedDraft?.draftId || selectedThread),
      reason: draft.to || draft.subject || draft.body || savedDraft?.draftId || selectedThread ? "" : "Nothing to reset.",
      title: creatingNewDraft ? "Clear manual draft fields" : `Reset reply draft for ${title}`,
      target: {
        mode,
        threadId: selectedThread?.threadId || "",
      },
    }),
    buildAction({
      id: "draft-with-agent",
      label: draftingWithAgent ? "Drafting..." : "Draft with Agent",
      intent: "draft-inbox-with-agent",
      enabled: draftValidation.canDraftWithAgent && !draftingWithAgent,
      reason: draftingWithAgent ? "Drafting is already in progress." : draftValidation.draftWithAgentReason,
      title: creatingNewDraft ? "Ask an agent to draft a new email" : `Ask an agent to draft a reply to ${title}`,
      target: {
        mode: draft.mode,
        threadId: selectedThread?.threadId || "",
      },
      busy: draftingWithAgent,
    }),
    buildAction({
      id: "save-gmail-draft",
      label: savingDraft ? "Saving..." : savedDraftLabel,
      intent: "save-gmail-draft",
      enabled: draftValidation.canSave && !savingDraft,
      reason: savingDraft ? "Draft save is already in progress." : draftValidation.saveReason,
      title: safeTitleText(`${savedDraftLabel} ${title}`),
      target: {
        mode: draft.mode,
        threadId: selectedThread?.threadId || "",
        replyToMessageId: normalizeText(selectedThread?.replyToMessageId),
        savedDraftId: savedDraft?.draftId || "",
      },
      busy: savingDraft,
    }),
    buildAction({
      id: "open-in-gmail",
      label: savedDraft?.url ? "Open Draft in Gmail" : "Open in Gmail",
      intent: "open-gmail-url",
      enabled: Boolean(openInGmailUrl),
      reason: openInGmailUrl ? "" : "Choose a thread or save a draft first.",
      title: savedDraft?.url ? `Open Gmail draft ${title}` : `Open Gmail thread ${title}`,
      target: openInGmailUrl ? { url: openInGmailUrl, threadId: selectedThread?.threadId || "", draftId: savedDraft?.draftId || "" } : {},
    }),
  ];

  return {
    kind: mode,
    mode,
    header: {
      title,
      subtitle,
      badgeLabel: creatingNewDraft ? "Draft" : selectedThread.unread ? "Unread" : "Read",
      badgeTone: creatingNewDraft ? "default" : selectedThread.unread ? "warning" : "success",
      badge: creatingNewDraft
        ? { label: "Draft", tone: "default" }
        : { label: selectedThread.unread ? "Unread" : "Read", tone: selectedThread.unread ? "warning" : "success" },
      source: normalizeText(selectedThread?.source),
    },
    messages,
    draft: {
      mode: draft.mode,
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      body: draft.body,
      savedDraft: savedDraft
        ? {
            draftId: savedDraft.draftId,
            updatedAt: savedDraft.updatedAt,
            url: savedDraft.url,
          }
        : null,
      validation: draftValidation,
    },
    composer: {
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
      actions,
    },
    actions,
  };
}

function validateDraft({ creatingNewDraft, draft, selectedThread }) {
  const hasSelection = creatingNewDraft || Boolean(selectedThread);
  const hasRecipient = Boolean(normalizeText(draft.to));
  const hasSubject = Boolean(normalizeText(draft.subject));
  const hasBody = Boolean(normalizeText(draft.body));
  const canSave = hasSelection && hasSubject && hasBody && (!creatingNewDraft || hasRecipient);

  let saveReason = "";
  if (!hasSelection) saveReason = "Choose an inbox thread before saving a draft.";
  else if (creatingNewDraft && !hasRecipient) saveReason = "Add at least one recipient before saving a Gmail draft.";
  else if (!hasSubject) saveReason = "Add a subject before saving a Gmail draft.";
  else if (!hasBody) saveReason = "Draft body is empty.";

  const hasAgentContext = Boolean(selectedThread)
    || Boolean(normalizeText(draft.to) || normalizeText(draft.subject) || normalizeText(draft.body));
  const canDraftWithAgent = hasAgentContext;
  const draftWithAgentReason = canDraftWithAgent
    ? ""
    : "Choose an inbox thread or add a recipient, subject, or notes before drafting with an agent.";

  return {
    hasSelection,
    hasRecipient,
    hasSubject,
    hasBody,
    canSave,
    saveReason,
    canDraftWithAgent,
    draftWithAgentReason,
  };
}

function buildInboxThreadRow(thread, { selected, index }) {
  const subject = cleanInboxSubject(thread.subject) || "(No subject)";
  const fromEmail = emailAddressOnly(thread.from);
  return {
    id: thread.threadId,
    threadId: thread.threadId,
    selected,
    unread: thread.unread,
    index,
    title: subject,
    subtitle: thread.snippet || "",
    fromLabel: fromEmail || "Unknown sender",
    dateText: thread.date || "No date",
    source: thread.source || "",
    recipientType: thread.recipientType,
    badges: [
      thread.unread ? { label: "Unread", tone: "warning" } : { label: "Read", tone: "success" },
      thread.recipientType === "direct" ? { label: "My alias", tone: "default" } : { label: "Group alias", tone: "default" },
    ],
    openAction: buildAction({
      id: `open-thread-${thread.threadId}`,
      label: "Open Thread",
      intent: "open-inbox-thread",
      enabled: true,
      reason: "",
      title: `Open inbox thread ${subject}`,
      target: {
        threadId: thread.threadId,
        url: thread.url || gmailThreadUrl(thread.threadId),
      },
    }),
  };
}

function buildInboxEmptyState({ ready, loading, error, query, visibleThreads }) {
  if (visibleThreads.length > 0) return null;
  if (!ready) {
    return {
      kind: "setup_required",
      title: "Inbox not connected",
      body: "Connect Google Inbox to load unread threads and prepare Gmail drafts.",
      tone: "warning",
      cta: buildAction({
        id: "connect-inbox",
        label: "Connect Inbox",
        intent: "connect-google-inbox",
        enabled: true,
        reason: "",
        target: {},
      }),
    };
  }
  if (loading) {
    return {
      kind: "empty",
      title: "Loading inbox",
      body: "Checking inbox messages...",
      tone: "default",
    };
  }
  if (error) {
    return {
      kind: "error",
      title: "Inbox unavailable",
      body: error,
      tone: "warning",
    };
  }
  return {
    kind: "empty",
    title: query ? "No messages found" : "No messages",
    body: query ? "Try another search term or filter." : "Unread inbox messages will appear here.",
    tone: "default",
  };
}

function inboxHeaderSubtitle({ ready, loading, visibleCount, totalCount, query }) {
  if (!ready) return "Connect Google Inbox to read threads and save Gmail drafts.";
  if (loading) return "Loading Gmail threads...";
  if (query) return `${visibleCount} thread${visibleCount === 1 ? "" : "s"} match "${query}".`;
  if (visibleCount) return `${visibleCount} unread thread${visibleCount === 1 ? "" : "s"} ready.`;
  if (totalCount) return `${totalCount} thread${totalCount === 1 ? "" : "s"} loaded.`;
  return "Unread Gmail threads will appear here.";
}

function buildNotices({ error, status }) {
  const notices = [];
  if (error) notices.push({ tone: "warning", message: error });
  if (status) notices.push({ tone: error ? "default" : "info", message: status });
  return notices;
}

function matchesInboxQuery(thread, query) {
  if (!query) return true;
  const searchText = [
    thread.subject,
    thread.from,
    thread.to,
    thread.cc,
    thread.snippet,
    thread.date,
    thread.source,
    ...(thread.participants || []),
  ].join(" ").toLowerCase();
  return searchText.includes(query);
}

function matchesRecipientFilter(thread, filter) {
  if (filter === "all") return true;
  return (thread.recipientType || "group") === filter;
}

function countRecipients(threads, hiddenThreadIds) {
  return threads.reduce((counts, thread) => {
    if (hiddenThreadIds.has(thread.threadId)) return counts;
    const type = thread.recipientType === "direct" ? "direct" : "group";
    return {
      ...counts,
      [type]: counts[type] + 1,
    };
  }, { direct: 0, group: 0 });
}

function buildInboxMessageDocument(htmlBody) {
  const content = normalizeText(htmlBody);
  if (!content) return "";
  const secureContent = /<html[\s>]/i.test(content) ? content : `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: #ffffff; }
      body {
        color: #20201f;
        font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 12px 14px;
      }
      img, table { max-width: 100%; height: auto; }
      pre { white-space: pre-wrap; }
      a { color: #0a65cc; }
    </style>
  </head>
  <body>${content}</body>
</html>`;
  if (/<meta[^>]+http-equiv=["']content-security-policy["']/i.test(secureContent)) return secureContent;
  return secureContent.replace(
    /<head(\s[^>]*)?>/i,
    `<head$1>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: cid:; media-src 'none'; object-src 'none'; frame-src 'none'; connect-src 'none'; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">`,
  );
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

function gmailThreadUrl(threadId) {
  const value = normalizeText(threadId);
  return value ? `${GMAIL_BASE_URL}/#inbox/${encodeURIComponent(value)}` : `${GMAIL_BASE_URL}/#inbox`;
}

function emailAddressOnly(value) {
  const trimmed = normalizeText(value);
  const bracketed = trimmed.match(/<([^<>@\s]+@[^<>\s]+)>/);
  if (bracketed?.[1]) return bracketed[1];
  const loose = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return loose?.[0] || trimmed || "Unknown sender";
}

function cleanInboxSubject(value) {
  return normalizeText(value).replace(/\s*<<<[\s\S]*$/, "").trim();
}

function isInboxPlaceholderSubject(value) {
  const subject = cleanInboxSubject(value);
  return !subject || subject === "(No subject)";
}

function isInboxPlaceholderSender(value) {
  const sender = normalizeText(value);
  return !sender || sender === "Unknown sender";
}

function normalizeRecipientFilter(value) {
  return value === "direct" || value === "group" ? value : "all";
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
