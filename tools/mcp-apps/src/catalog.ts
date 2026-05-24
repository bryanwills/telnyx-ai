import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createServer as createGovernedCommunicationsServer } from "../apps/governed-communications/src/server.js";
import { createServer as createNumberIntelligenceServer } from "../apps/number-intelligence/src/server.js";
import { createServer as createUsageCostExplorerServer } from "../apps/usage-cost-explorer/src/server.js";
import { createServer as createVoiceMonitorServer } from "../apps/voice-monitor/src/server.js";

export type McpAppSlug = "governed-communications" | "number-intelligence" | "usage-cost-explorer" | "voice-monitor";

export interface McpAppDefinition {
  slug: McpAppSlug;
  name: string;
  description: string;
  endpoint: string;
  toolNames: readonly string[];
  resourceUris: readonly string[];
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
    createServer: createGovernedCommunicationsServer
  },
  {
    slug: "number-intelligence",
    name: "Number Intelligence",
    description: "Phone-number analysis using Telnyx Number Lookup and read-first readiness signals.",
    endpoint: "/apps/number-intelligence/mcp",
    toolNames: ["number_intelligence_analyze", "number_intelligence_batch_analyze"],
    resourceUris: ["ui://number-intelligence/index.html"],
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
}

export function listPublicApps(): PublicMcpAppInfo[] {
  return MCP_APP_DEFINITIONS.map(({ slug, name, description, endpoint, toolNames, resourceUris }) => ({
    slug,
    name,
    description,
    endpoint,
    toolNames,
    resourceUris
  }));
}

export function findMcpApp(slug: string): McpAppDefinition | undefined {
  return MCP_APP_DEFINITIONS.find((app) => app.slug === slug);
}
