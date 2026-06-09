---
name: Outbound Prospecting MCP
description: Find and enrich outbound prospecting contacts through the credit-gated Quinn MCP workflow.
owner: GTM
team: Sales
risk_level: high
tools_required:
  - outbound_prospecting.account_resolve
  - outbound_prospecting.contact_gap_analysis
  - outbound_prospecting.provider_waterfall
  - salesforce.contacts.write
customer_safe: false
approval_required: true
product: outbound-prospecting
language: mcp
---

## When to use it

Use when a Telnyx sales rep needs to find contacts for a target account through the outbound prospecting MCP workflow.

## Inputs needed

- Target company name or domain
- Requesting rep identity
- Target persona, region, or buying committee
- Campaign or Salesforce context when available

## Workflow steps

- Resolve the account in Salesforce and stop on ambiguous matches.
- Run Rules of Engagement and contact gap analysis before provider spend.
- Execute the approved region-aware provider waterfall across Cognism, Lusha, Clearbit, and Apollo when signed.
- Verify emails, dedupe against existing Salesforce contacts, and meter provider usage against quotas.
- Write approved contacts back to Salesforce and report usage alerts where required.

## Expected output format

- Account match and eligibility status
- Contact gaps and recommended personas
- Provider waterfall summary
- Verified contacts prepared or written
- Quota and credit usage summary
- Hard stops, approvals, and follow-up actions

## Safety notes

This skill can affect Salesforce data and paid prospecting credits. It must remain approval-gated and should only run through the approved MCP server for team-telnyx/outbound-prospecting-mcp.
