export const memoryScopes = [
  "user_profile",
  "team",
  "account_customer",
  "project",
  "channel",
  "skill_usage",
] as const;

export class MemoryStorePlaceholder {
  readonly enabled = false;

  async recall(): Promise<{ enabled: false; memories: never[]; note: string }> {
    return {
      enabled: false,
      memories: [],
      note: "Memory recall is disabled in the deterministic local runtime. Future recall must be permission-aware and source-attributed.",
    };
  }

  async remember(): Promise<{ enabled: false; persisted: false; note: string }> {
    return {
      enabled: false,
      persisted: false,
      note: "Memory writes are disabled in the deterministic local runtime.",
    };
  }
}

export const futureMemoryBehavior = {
  dailySynthesis:
    "Summarize useful, permission-safe work context daily while preserving source attribution and expiration dates.",
  cleanupPipeline:
    "Remove stale, low-value, sensitive, or permission-revoked memories through scheduled cleanup.",
  sourceAttribution:
    "Every remembered fact should retain source system, source object, timestamp, and access policy metadata.",
  permissionAwareRecall:
    "Recall must filter by user, team, account, channel, and tool authorization before an agent sees memory.",
  userControls: "Employees should be able to inspect, pin, correct, disable, or delete personal memory.",
  retentionPolicy: "Retention must be configurable by memory type and comply with Telnyx data handling policies.",
  customerDataBoundaries:
    "Customer data must not be mixed across accounts, Slack Connect channels, or unauthorized teams.",
};
