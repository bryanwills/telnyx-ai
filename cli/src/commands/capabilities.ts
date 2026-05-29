/**
 * telnyx-agent capabilities — Self-describing API surface.
 */

import { outputJson } from "../utils/output.ts";

interface Capability {
  name: string;
  description: string;
  actions: string[];
  governance: GovernanceMetadata;
}

interface GovernanceMetadata {
  risk_class: "read_only" | "guarded_write" | "live_write";
  approval_expectation: "none" | "confirm_before_mutation" | "confirm_before_external_effect";
  memory_scope: "stateless" | "host_controlled" | "customer_configured" | "app_scoped";
  model_behavior: "host_controlled" | "request_selected" | "customer_configured" | "app_defined";
}

interface CompositeCommand {
  name: string;
  description: string;
  governance: GovernanceMetadata;
}

const CAPABILITIES: Record<string, Capability[]> = {
  "📱 Messaging": [
    { name: "SMS / MMS", description: "Send and receive text and multimedia messages", actions: ["send_sms", "list_messaging_profiles", "create_messaging_profile"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  ],
  "📞 Voice": [
    { name: "Call Control", description: "Make and manage voice calls via SIP connections", actions: ["make_call", "list_connections"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  ],
  "🔢 Numbers": [
    { name: "Phone Numbers", description: "Search, buy, and manage phone numbers", actions: ["list_phone_numbers", "search_phone_numbers", "buy_phone_number"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  ],
  "🤖 AI": [
    { name: "Chat Completions", description: "LLM inference via Telnyx AI", actions: ["ai_chat"], governance: { risk_class: "guarded_write", approval_expectation: "confirm_before_mutation", memory_scope: "stateless", model_behavior: "request_selected" } },
    { name: "Embeddings", description: "Generate text embeddings", actions: ["ai_embed"], governance: { risk_class: "guarded_write", approval_expectation: "confirm_before_mutation", memory_scope: "stateless", model_behavior: "request_selected" } },
    { name: "Assistants", description: "Create and manage AI voice assistants", actions: ["list_ai_assistants", "create_ai_assistant"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "customer_configured", model_behavior: "customer_configured" } },
  ],
  "📠 Fax": [
    { name: "Fax", description: "Send faxes programmatically", actions: ["send_fax"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  ],
  "📡 IoT": [
    { name: "SIM Cards", description: "Manage IoT SIM cards and connectivity", actions: ["list_sim_cards"], governance: { risk_class: "guarded_write", approval_expectation: "confirm_before_mutation", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  ],
  "🔍 Lookup": [
    { name: "Number Lookup", description: "Carrier and caller ID lookups", actions: ["lookup_number"], governance: { risk_class: "guarded_write", approval_expectation: "confirm_before_mutation", memory_scope: "stateless", model_behavior: "host_controlled" } },
  ],
  "✅ Verify": [
    { name: "Phone Verification", description: "Send and verify phone codes (2FA)", actions: ["verify_phone", "verify_code", "create_verify_profile"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  ],
  "🔐 Networking": [
    { name: "WireGuard VPN", description: "Create private networks and WireGuard tunnels", actions: ["create_network", "create_wireguard_interface", "create_wireguard_peer"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  ],
  "⚡ Edge Compute": [
    { name: "Edge Functions", description: "Pair Telnyx AI workflows with Telnyx Edge Compute. telnyx-agent now provides an executable handoff and prefers API-key auth for agent use when supported by telnyx-edge.", actions: ["see_guides_edge_compute"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
    { name: "Deployment Handoff", description: "Use team-telnyx/ai for orchestration patterns and telnyx-edge for status, deploy, delete, secrets, bindings, and lifecycle management.", actions: ["telnyx_edge_status", "telnyx_edge_ship", "telnyx_edge_delete_func", "telnyx_edge_secrets", "telnyx_edge_bindings"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
    { name: "Storage / KV Boundary", description: "Upstream telnyx-edge exposes storage and KV namespace/key workflows. team-telnyx/ai documents that surface but intentionally leaves execution to the dedicated Edge CLI.", actions: ["telnyx_edge_storage_kv"], governance: { risk_class: "guarded_write", approval_expectation: "confirm_before_mutation", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
    { name: "Edge CLI Bridge", description: "Thin executable handoff from telnyx-agent into telnyx-edge for real MCP, typed call-event routing, and webhook starting points.", actions: ["edge_doctor", "setup_edge_mcp", "setup_edge_webhook"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  ],
  "📋 10DLC Compliance": [
    { name: "10DLC Registration", description: "Register brands and campaigns for US A2P messaging", actions: ["create_10dlc_brand", "create_10dlc_campaign", "assign_10dlc_number"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  ],
  "💰 Account": [
    { name: "Balance", description: "Check account balance and billing", actions: ["get_balance"], governance: { risk_class: "read_only", approval_expectation: "none", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  ],
  "💳 Payments": [
    { name: "x402 Crypto Payments", description: "Fund account with USDC on Base blockchain via x402 protocol", actions: ["get_payment_quote", "submit_payment"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  ],
  "🔄 Porting": [
    { name: "Number Porting", description: "Check portability, create and manage port-in orders, track requirements and documents", actions: ["check_portability", "list_porting_orders", "create_porting_order", "get_porting_order", "submit_porting_order", "cancel_porting_order", "list_porting_phone_numbers", "upload_porting_document", "list_porting_requirements"], governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
    { name: "Port-Out", description: "List and inspect port-out activity, reject or comment on port-out orders", actions: ["list_portout_orders", "get_portout_order", "list_portout_rejection_codes"], governance: { risk_class: "guarded_write", approval_expectation: "confirm_before_mutation", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  ],
};

const COMPOSITE_COMMANDS: CompositeCommand[] = [
  { name: "telnyx-agent setup-sms", description: "Zero to SMS: creates messaging profile, buys number, assigns it", governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-agent setup-voice", description: "Zero to voice: creates SIP connection, buys number, assigns it", governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-agent setup-iot", description: "Zero to IoT: lists SIMs, creates group, activates SIM", governance: { risk_class: "guarded_write", approval_expectation: "confirm_before_mutation", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-agent setup-ai", description: "Zero to AI assistant: creates assistant, buys number, wires them together", governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "customer_configured", model_behavior: "customer_configured" } },
  { name: "telnyx-agent setup-wireguard", description: "Zero to VPN: creates network, WireGuard interface, peer — outputs ready-to-use WG config", governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-edge status", description: "Check Edge CLI authentication, configuration, and connectivity before or after a handoff", governance: { risk_class: "read_only", approval_expectation: "none", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-edge ship", description: "Deploy an Edge Compute function with the dedicated telnyx-edge CLI (referenced by the Edge Compute guide)", governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-edge delete-func", description: "Remove an Edge Compute function with the dedicated telnyx-edge CLI when lifecycle cleanup is required", governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-agent edge-doctor", description: "Validate Edge Compute handoff prerequisites and point to the next concrete telnyx-edge steps", governance: { risk_class: "read_only", approval_expectation: "none", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-agent setup-edge-mcp", description: "Concrete MCP-on-Edge handoff: points to the real example and deploy command via telnyx-edge", governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-agent setup-edge-webhook", description: "Concrete webhook-on-Edge handoff: points to the real example and deploy command via telnyx-edge", governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-agent setup-verify", description: "Zero to verification: creates verify profile, buys number — outputs test command", governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-agent setup-10dlc", description: "Zero to A2P: creates 10DLC brand, campaign, optional number assignment", governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-agent setup-porting", description: "Zero to porting: checks portability, creates porting order, lists requirements, optionally submits", governance: { risk_class: "live_write", approval_expectation: "confirm_before_external_effect", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-agent status", description: "Account health overview — balance, numbers, profiles, connections", governance: { risk_class: "read_only", approval_expectation: "none", memory_scope: "host_controlled", model_behavior: "host_controlled" } },
  { name: "telnyx-agent capabilities", description: "This command — lists all available API capabilities", governance: { risk_class: "read_only", approval_expectation: "none", memory_scope: "stateless", model_behavior: "host_controlled" } },
];

export async function capabilitiesCommand(flags: Record<string, string | boolean>): Promise<void> {
  const jsonOutput = flags.json === true;

  if (jsonOutput) {
    outputJson({
      api_capabilities: CAPABILITIES,
      composite_commands: COMPOSITE_COMMANDS,
      total_tools: Object.values(CAPABILITIES).flat().reduce((sum, c) => sum + c.actions.length, 0),
    });
    return;
  }

  console.log("\n🔧 Telnyx Agent Toolkit — Capabilities");
  console.log("=======================================\n");

  console.log("📦 Composite Commands (one command, full stack):\n");
  for (const cmd of COMPOSITE_COMMANDS) {
    console.log(`  ${cmd.name}`);
    console.log(`    ${cmd.description}\n`);
    console.log(`    Governance: risk=${cmd.governance.risk_class}; approval=${cmd.governance.approval_expectation}; memory=${cmd.governance.memory_scope}; model=${cmd.governance.model_behavior}\n`);
  }

  console.log("─".repeat(50));
  console.log("\n🛠️  API Capabilities:\n");

  for (const [category, capabilities] of Object.entries(CAPABILITIES)) {
    console.log(`  ${category}`);
    for (const cap of capabilities) {
      console.log(`    ${cap.name} — ${cap.description}`);
      console.log(`      Tools: ${cap.actions.join(", ")}`);
      console.log(`      Governance: risk=${cap.governance.risk_class}; approval=${cap.governance.approval_expectation}; memory=${cap.governance.memory_scope}; model=${cap.governance.model_behavior}`);
    }
    console.log();
  }

  const total = Object.values(CAPABILITIES).flat().reduce((sum, c) => sum + c.actions.length, 0);
  console.log(`Total: ${total} API tools across ${Object.keys(CAPABILITIES).length} categories\n`);
}
