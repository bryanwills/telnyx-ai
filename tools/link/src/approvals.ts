import type { ApprovalDecision, ChannelType, LinkTool, RiskLevel } from "./types.js";

const APPROVAL_ACTIONS = new Set([
  "post_external_slack",
  "send_email",
  "update_customer_visible_doc",
  "create_customer_visible_doc",
  "production_change",
  "salesforce_write",
  "customer_record_write",
  "billing_affecting_change",
  "high_risk_tool",
]);

export function actionRequiresApproval(action: string | undefined): boolean {
  return Boolean(action && APPROVAL_ACTIONS.has(action));
}

export function evaluateApproval({
  action,
  channelType,
  riskLevel = "low",
  customerVisible = false,
  tool,
}: {
  action?: string;
  channelType?: ChannelType;
  riskLevel?: RiskLevel;
  customerVisible?: boolean;
  tool?: Pick<LinkTool, "name" | "approvalRequired">;
} = {}): ApprovalDecision {
  const policyMatches: string[] = [];

  if (actionRequiresApproval(action)) {
    policyMatches.push(action!);
  }

  if (channelType === "shared_customer" && customerVisible) {
    policyMatches.push("shared_customer_external_post");
  }

  if (riskLevel === "high") {
    policyMatches.push("high_risk");
  }

  if (tool?.approvalRequired) {
    policyMatches.push(`tool:${tool.name}`);
  }

  const uniqueMatches = [...new Set(policyMatches)];
  const approvalRequired = uniqueMatches.length > 0;

  return {
    approvalRequired,
    approvalStatus: approvalRequired ? "approval_required" : "not_required",
    action,
    approverRole: approvalRequired ? "human_owner" : null,
    reason: approvalRequired
      ? "Human approval is required before this action can affect a customer-visible or high-risk surface."
      : "No human approval is required for this deterministic read-only local action.",
    policyMatches: uniqueMatches,
  };
}
