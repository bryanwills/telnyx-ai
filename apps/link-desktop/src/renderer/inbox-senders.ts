type InboxMessageLike = {
  from?: string | null;
};

type InboxThreadLike = {
  from?: string | null;
  participants?: Array<string | null | undefined>;
  messages?: InboxMessageLike[];
};

export function emailAddressOnly(value: string) {
  const trimmed = value.trim();
  const bracketed = trimmed.match(/<([^<>@\s]+@[^<>\s]+)>/);
  if (bracketed?.[1]) return bracketed[1];
  const loose = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return loose?.[0] || trimmed || "Unknown sender";
}

export function isInboxPlaceholderSender(value?: string | null) {
  const sender = String(value || "").trim();
  return !sender || sender === "Unknown sender";
}

export function preferredInboxSender(...candidates: Array<string | null | undefined>) {
  return candidates
    .map((candidate) => String(candidate || "").trim())
    .find((candidate) => !isInboxPlaceholderSender(candidate)) || "Unknown sender";
}

export function mergeInboxLatestSenderRecord(current: Record<string, string>, threadId: string, ...candidates: Array<string | null | undefined>) {
  const nextSender = preferredInboxSender(...candidates, current[threadId]);
  if (isInboxPlaceholderSender(nextSender) || current[threadId] === nextSender) return current;
  return { ...current, [threadId]: nextSender };
}

export function displayInboxThreadSender(thread?: InboxThreadLike | null) {
  const latestMessageSender = [...(thread?.messages ?? [])]
    .reverse()
    .find((message) => !isInboxPlaceholderSender(message.from))
    ?.from;
  const candidates = [
    latestMessageSender,
    thread?.from,
    ...(thread?.participants ?? []),
  ];
  return preferredInboxSender(...candidates);
}
