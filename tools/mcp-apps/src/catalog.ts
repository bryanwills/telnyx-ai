import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createServer as createGovernedCommunicationsServer } from "../apps/governed-communications/src/server.js";
import { createServer as createNumberIntelligenceServer } from "../apps/number-intelligence/src/server.js";
import { createServer as createUsageCostExplorerServer } from "../apps/usage-cost-explorer/src/server.js";
import { createServer as createVoiceMonitorServer } from "../apps/voice-monitor/src/server.js";

export type McpAppSlug = "governed-communications" | "number-intelligence" | "usage-cost-explorer" | "voice-monitor";

export interface McpAppGovernance {
  readonly accessMode: "read_only" | "governed_write";
  readonly leastPrivilegeApiKey: string;
  readonly actionBoundary: string;
  readonly futureWritePath: string;
  readonly sensitiveDataRedaction: string;
  readonly externalRuntimePattern?: {
    readonly useCase: string;
    readonly preserveIds: readonly string[];
    readonly handoffTarget: string;
  };
}

export interface McpAppDefinition {
  slug: McpAppSlug;
  name: string;
  description: string;
  endpoint: string;
  toolNames: readonly string[];
  resourceUris: readonly string[];
  governance: McpAppGovernance;
  createServer: () => McpServer;
}

export const MCP_APP_DEFINITIONS: readonly McpAppDefinition[] = [
  {
    slug: "governed-communications",
    name: "Governed Communications",
    description: "Bounded outbound messaging, call start, verification, and status follow-up with server-side selector policy.",
    endpoint: "/apps/governed-communications/mcp",
    toolNames: [
      "communications_send_message",
      "communications_start_call",
      "communications_start_verification",
      "communications_get_message_status",
      "communications_get_call_status",
      "communications_get_call_timeline",
      "communications_get_verification_status",
      "communications_list_owned_senders"
    ],
    resourceUris: ["ui://governed-communications/index.html"],
    governance: {
      accessMode: "governed_write",
      leastPrivilegeApiKey: "Use a restricted Telnyx API key plus server-side selector policy for the bounded sender and connection set.",
      actionBoundary: "This app allows only the outbound communication actions and status reads exposed by its tool list.",
      futureWritePath: "Any new mutation must keep preview, selector-policy, and approval or confirmation requirements instead of broadening the runtime prompt surface.",
      sensitiveDataRedaction: "Runtime responses preserve operational IDs while avoiding broader account discovery beyond the app allowlist."
    },
    createServer: createGovernedCommunicationsServer
  },
  {
    slug: "number-intelligence",
    name: "Number Intelligence",
    description: "Phone-number analysis using Telnyx Number Lookup and read-first readiness signals.",
    endpoint: "/apps/number-intelligence/mcp",
    toolNames: ["number_intelligence_analyze", "number_intelligence_batch_analyze"],
    resourceUris: ["ui://number-intelligence/index.html"],
    governance: {
      accessMode: "read_only",
      leastPrivilegeApiKey: "Use a read-only Telnyx API key that can call Number Lookup without account mutation scopes.",
      actionBoundary: "This app stays inside number analysis and readiness signals; it does not create orders, messaging sends, or voice actions.",
      futureWritePath: "Any future order-creation or purchasing path should move to a separate governed surface with explicit confirmation.",
      sensitiveDataRedaction: "Responses should preserve the minimum number context needed for follow-up while keeping the workflow read-first."
    },
    createServer: createNumberIntelligenceServer
  },
  {
    slug: "usage-cost-explorer",
    name: "Usage & Cost Explorer",
    description: "Balance, usage reports, billing groups, and guarded billing controls.",
    endpoint: "/apps/usage-cost-explorer/mcp",
    toolNames: [
      "billing_overview",
      "billing_auto_recharge_setup",
      "billing_stored_payment_top_up",
      "billing_get_balance",
      "billing_get_auto_recharge_preferences",
      "billing_list_billing_groups",
      "billing_get_billing_group",
      "billing_usage_report_options",
      "billing_query_usage",
      "billing_preview_auto_recharge_update",
      "billing_update_auto_recharge_preferences",
      "billing_preview_stored_payment_transaction",
      "billing_create_stored_payment_transaction",
      "billing_preview_billing_group_update",
      "billing_update_billing_group",
      "billing_create_billing_group"
    ],
    resourceUris: [
      "ui://usage-cost-explorer/index.html",
      "ui://usage-cost-explorer/auto-recharge.html",
      "ui://usage-cost-explorer/stored-payment-top-up.html"
    ],
    governance: {
      accessMode: "governed_write",
      leastPrivilegeApiKey: "Use a billing-scoped key and keep the app-specific confirmation token flow intact across retries.",
      actionBoundary: "Reads are direct; every exposed mutation is intentionally bounded to billing controls defined by this app contract.",
      futureWritePath: "New financial side effects require a preview response plus confirmation token or stronger approval gate before execution.",
      sensitiveDataRedaction: "Financial reads preserve the fields needed for review while avoiding unnecessary payment or secret disclosure."
    },
    createServer: createUsageCostExplorerServer
  },
  {
    slug: "voice-monitor",
    name: "Voice Monitor",
    description: "Read-only active-call monitoring, call timelines, call status, and recording discovery.",
    endpoint: "/apps/voice-monitor/mcp",
    toolNames: [
      "voice_monitor_dashboard",
      "voice_monitor_list_options",
      "voice_monitor_active_calls",
      "voice_monitor_call_timeline",
      "voice_monitor_call_status",
      "voice_monitor_recordings",
      "voice_monitor_debug_report"
    ],
    resourceUris: ["ui://voice-monitor/index.html"],
    governance: {
      accessMode: "read_only",
      leastPrivilegeApiKey: "Use a read-only Telnyx API key limited to voice diagnostics and call-monitoring reads for the target account.",
      actionBoundary: "This app can inspect active calls, call events, call status, recordings metadata, and debug surfaces but cannot answer, hang up, transfer, speak, or modify voice resources.",
      futureWritePath: "If an operator needs call control or other voice mutations, hand off to a separate governed app or reviewed toolkit flow with explicit confirmation and audit capture.",
      sensitiveDataRedaction: "Outputs preserve operational IDs for follow-up while redacting phone numbers, recording URLs, transcripts, credentials, and other secrets.",
      externalRuntimePattern: {
        useCase: "External agent runtimes can mount this app as a default read-only voice diagnostics workspace after a live call or webhook failure.",
        preserveIds: ["connection_id", "call_control_id", "call_leg_id", "call_session_id", "assistant_id", "conversation_id"],
        handoffTarget: "Escalate write operations to a separate reviewed surface instead of extending this diagnostic runtime in-prompt."
      }
    },
    createServer: createVoiceMonitorServer
  }
] as const;

export interface PublicMcpAppInfo {
  slug: McpAppSlug;
  name: string;
  description: string;
  endpoint: string;
  toolNames: readonly string[];
  resourceUris: readonly string[];
  governance: McpAppGovernance;
}

export function listPublicApps(): PublicMcpAppInfo[] {
  return MCP_APP_DEFINITIONS.map(({ slug, name, description, endpoint, toolNames, resourceUris, governance }) => ({
    slug,
    name,
    description,
    endpoint,
    toolNames,
    resourceUris,
    governance
  }));
}

export function findMcpApp(slug: string): McpAppDefinition | undefined {
  return MCP_APP_DEFINITIONS.find((app) => app.slug === slug);
}
