import type { LinkTool, ToolContext, ToolMetadata } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, LinkTool>();

  constructor(tools: LinkTool[] = []) {
    tools.forEach((tool) => this.register(tool));
  }

  register(tool: LinkTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    validateTool(tool);
    this.tools.set(tool.name, tool);
  }

  get(name: string): LinkTool | undefined {
    return this.tools.get(name);
  }

  list(): LinkTool[] {
    return [...this.tools.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  async invoke(name: string, input: Record<string, unknown> = {}, context: ToolContext = {}): Promise<{
    tool: ToolMetadata;
    output: unknown;
  }> {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const output = await tool.invoke(input, context);
    context.auditLogger?.record({
      actorId: context.actorId,
      surface: context.surface ?? "tool_gateway",
      eventType: "tool.invoked",
      action: name,
      target: String(input.accountId ?? input.customerIdentifier ?? input.query ?? "") || null,
      metadata: {
        tool: tool.name,
        category: tool.category,
        riskLevel: tool.riskLevel,
        approvalRequired: tool.approvalRequired,
      },
    });

    return {
      tool: metadataForTool(tool),
      output,
    };
  }
}

export function metadataForTool(tool: LinkTool): ToolMetadata {
  return {
    name: tool.name,
    description: tool.description,
    category: tool.category,
    visibility: tool.visibility,
    capability: tool.capability,
    riskLevel: tool.riskLevel,
    approvalRequired: tool.approvalRequired,
    outputCanBeShownExternally: tool.outputCanBeShownExternally,
  };
}

export const mockedTools: LinkTool[] = [
  readTool({
    name: "slack.search",
    description: "Search mocked internal Slack messages and thread snippets.",
    category: "slack",
    visibility: "internal_only",
    riskLevel: "medium",
    outputCanBeShownExternally: false,
    invoke: ({ query }) => ({
      matches: [
        {
          channel: "#support-escalations",
          author: "mock_support_lead",
          summary: `Mocked Slack discussion about ${String(query ?? "the customer issue")} with internal-only triage notes.`,
        },
      ],
    }),
  }),
  {
    name: "slack.post_message",
    description: "Mock a Slack post action. Real posting must stay approval-gated.",
    category: "slack",
    visibility: "customer_safe",
    capability: "write",
    riskLevel: "high",
    approvalRequired: true,
    outputCanBeShownExternally: true,
    invoke: ({ channelId, text }) => ({
      posted: false,
      channelId,
      text,
      note: "Deterministic local fixture. No Slack message was posted.",
    }),
  },
  readTool({
    name: "salesforce.account_lookup",
    description: "Look up mocked Salesforce account, opportunity, and renewal context.",
    category: "crm",
    visibility: "internal_only",
    riskLevel: "medium",
    outputCanBeShownExternally: false,
    invoke: ({ accountId = "acct_mock_001" }) => ({
      accountId,
      accountName: "Acme Messaging Co.",
      segment: "Mid-market",
      lifecycleStage: "Expansion",
      renewalDate: "2026-09-30",
      openOpportunities: ["Global SMS delivery optimization"],
    }),
  }),
  readTool({
    name: "google_workspace.search",
    description: "Search mocked Google Docs, Drive files, and meeting notes.",
    category: "workspace",
    visibility: "internal_only",
    riskLevel: "medium",
    outputCanBeShownExternally: false,
    invoke: ({ query }) => ({
      documents: [{ title: "Acme QBR notes", summary: `Mocked workspace note about ${String(query ?? "delivery reliability")}.` }],
    }),
  }),
  readTool({
    name: "guru.search",
    description: "Search mocked Guru cards and knowledge sources.",
    category: "knowledge",
    visibility: "internal_only",
    riskLevel: "low",
    outputCanBeShownExternally: false,
    invoke: ({ query }) => ({
      cards: [{ title: "Messaging Delivery Investigation Playbook", summary: `Mocked Guru card for ${String(query ?? "Telnyx guidance")}.` }],
    }),
  }),
  readTool({
    name: "linear_jira.search",
    description: "Search mocked Linear or Jira tickets.",
    category: "ticketing",
    visibility: "internal_only",
    riskLevel: "medium",
    outputCanBeShownExternally: false,
    invoke: ({ query }) => ({
      issues: [{ key: "LINK-101", status: "In Progress", summary: `Mocked ticket related to ${String(query ?? "customer escalation")}.` }],
    }),
  }),
  readTool({
    name: "github.repo_search",
    description: "Search mocked GitHub repositories and code references.",
    category: "code",
    visibility: "internal_only",
    riskLevel: "medium",
    outputCanBeShownExternally: false,
    invoke: ({ query }) => ({
      repositories: [{ name: "telnyx-messaging-service", summary: `Mocked code reference for ${String(query ?? "delivery pipeline")}.` }],
    }),
  }),
  readTool({
    name: "datadog.incident_lookup",
    description: "Look up mocked Datadog monitors, incidents, and service status.",
    category: "observability",
    visibility: "internal_only",
    riskLevel: "medium",
    outputCanBeShownExternally: false,
    invoke: ({ incidentId = "INC-MOCK-42" }) => ({
      incidentId,
      status: "Monitoring",
      impact: "Elevated SMS latency in one mock carrier route",
      monitor: "mocked-datadog-monitor",
    }),
  }),
  readTool({
    name: "snowflake.query_preview",
    description: "Return mocked Snowflake analytical query previews.",
    category: "data_warehouse",
    visibility: "internal_only",
    riskLevel: "medium",
    outputCanBeShownExternally: false,
    invoke: ({ queryName = "message_delivery_rollup" }) => ({
      queryName,
      rows: [
        { metric: "delivery_success_rate", value: "98.7%" },
        { metric: "p95_delivery_latency_seconds", value: 12.4 },
      ],
      note: "Mocked analytical preview; no warehouse was queried.",
    }),
  }),
  readTool({
    name: "telnyx.account_lookup",
    description: "Look up mocked Telnyx customer account state.",
    category: "telnyx_account",
    visibility: "internal_only",
    riskLevel: "medium",
    outputCanBeShownExternally: false,
    invoke: ({ accountId = "acct_mock_001" }) => ({
      accountId,
      accountName: "Acme Messaging Co.",
      products: ["Messaging", "Voice"],
      health: "Watch",
      openEscalations: 1,
    }),
  }),
  readTool({
    name: "telnyx.messaging_logs.lookup",
    description: "Look up mocked Telnyx Messaging delivery logs.",
    category: "telnyx_messaging",
    visibility: "internal_only",
    riskLevel: "medium",
    outputCanBeShownExternally: false,
    invoke: ({ messageId = "msg_mock_123" }) => ({
      messageId,
      direction: "outbound",
      status: "delivered",
      carrierHandoff: "mocked_carrier",
      rawLog: "redacted in customer-safe workflows",
    }),
  }),
  readTool({
    name: "telnyx.voice_sip_traces.lookup",
    description: "Look up mocked Telnyx Voice and SIP trace summaries.",
    category: "telnyx_voice",
    visibility: "internal_only",
    riskLevel: "medium",
    outputCanBeShownExternally: false,
    invoke: ({ callId = "call_mock_123" }) => ({
      callId,
      result: "completed",
      pddMs: 820,
      sipTraceSummary: "Mocked trace indicates normal setup and teardown.",
    }),
  }),
  readTool({
    name: "telnyx.network_carrier_status.lookup",
    description: "Look up mocked Telnyx network and carrier status.",
    category: "telnyx_network",
    visibility: "internal_only",
    riskLevel: "medium",
    outputCanBeShownExternally: false,
    invoke: ({ region = "US" }) => ({
      region,
      status: "degraded",
      affectedCarrier: "Mock Carrier A",
      mitigation: "Traffic shifted to alternate route in mock data.",
    }),
  }),
  readTool({
    name: "telnyx.billing_revenue.lookup",
    description: "Look up mocked billing and revenue context.",
    category: "billing",
    visibility: "internal_only",
    riskLevel: "high",
    approvalRequired: true,
    outputCanBeShownExternally: false,
    invoke: ({ accountId = "acct_mock_001" }) => ({
      accountId,
      mrr: 42000,
      billingStatus: "current",
      note: "Mocked financial data. Treat as internal-only.",
    }),
  }),
];

export function createDefaultToolRegistry(): ToolRegistry {
  return new ToolRegistry(mockedTools);
}

function readTool(tool: Omit<LinkTool, "capability" | "approvalRequired"> & { approvalRequired?: boolean }): LinkTool {
  return {
    capability: "read",
    approvalRequired: false,
    ...tool,
  };
}

function validateTool(tool: LinkTool): void {
  const required: (keyof LinkTool)[] = [
    "name",
    "description",
    "category",
    "visibility",
    "capability",
    "riskLevel",
    "approvalRequired",
    "outputCanBeShownExternally",
    "invoke",
  ];

  for (const key of required) {
    if (tool[key] === undefined || tool[key] === null) {
      throw new Error(`Tool ${tool.name || "<unknown>"} is missing ${String(key)}`);
    }
  }
}
