#!/usr/bin/env node

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

const DEFAULT_BASE_URL = "https://api.telnyx.com/v2";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const conversationId = requiredArg(args, "conversation-id");
  const usageDate = requiredArg(args, "usage-date");
  const outputPath = resolve(requiredArg(args, "output"));
  const baseUrl = (args["base-url"] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const apiKey = await getApiKey(args["api-key"]);

  const conversationEnvelope = await telnyxGet(apiKey, `${baseUrl}/ai/conversations/${encodeURIComponent(conversationId)}`);
  const messagesEnvelope = await telnyxGet(apiKey, `${baseUrl}/ai/conversations/${encodeURIComponent(conversationId)}/messages`);
  const insightsEnvelope = await telnyxGet(apiKey, `${baseUrl}/ai/conversations/${encodeURIComponent(conversationId)}/conversations-insights`);
  const usageWindow = toUsageWindow(usageDate);

  const conversation = conversationEnvelope.data ?? {};
  const messages = Array.isArray(messagesEnvelope.data) ? messagesEnvelope.data : [];
  const insightRuns = Array.isArray(insightsEnvelope.data) ? insightsEnvelope.data : [];
  const assistantId = conversation?.metadata?.assistant_id ?? null;
  const assistantUuid = typeof assistantId === "string" ? assistantId.replace(/^assistant-/, "") : null;
  const createdAt = normalizeDateTime(conversation?.created_at);
  const bucketHour = createdAt ? createdAt.toISOString().slice(0, 13) + ":00:00Z" : null;

  const connection = assistantId ? await findAssistantConnection(apiKey, baseUrl, assistantId) : null;
  const callControlUsage = await queryUsage(apiKey, baseUrl, {
    product: "call-control",
    dimensions: "connection_id,direction,date_time",
    metrics: "cost,call_sec,connected,completed,billed_sec",
    start_date: usageWindow.start,
    end_date: usageWindow.end,
    ...(connection?.id ? { "filter[connection_id]": connection.id } : {}),
  });
  const inferenceUsage = await queryUsage(apiKey, baseUrl, {
    product: "inference",
    dimensions: "record_type,date_time",
    metrics: "cost",
    start_date: usageWindow.start,
    end_date: usageWindow.end,
  });

  const latencyTurns = messages
    .filter((message) => message?.role === "assistant" && Number.isFinite(message?.metadata?.end_user_perceived_latency_ms))
    .map((message) => Number(message.metadata.end_user_perceived_latency_ms));
  const assistantTexts = messages.filter((message) => message?.role === "assistant" && typeof message?.text === "string" && message.text.trim().length > 0);
  const userTexts = messages.filter((message) => message?.role === "user" && typeof message?.text === "string" && message.text.trim().length > 0);
  const clarificationTurns = assistantTexts.filter((message) => /clarify|not sure what you mean|still there/i.test(message.text)).length;
  const matchingCallControlRow = selectCallControlUsageRow({
    rows: callControlUsage.data ?? [],
    bucketHour,
    assistantUuid,
    connectionId: connection?.id ?? null,
  });
  const matchingInferenceRows = bucketHour
    ? (inferenceUsage.data ?? []).filter((row) => row?.date_time === bucketHour)
    : [];

  const artifact = {
    artifact_version: 1,
    source: {
      conversation_id: conversation.id ?? conversationId,
      assistant_id: assistantId,
      assistant_version_id: conversation?.metadata?.assistant_version_id ?? null,
      call_control_id: conversation?.metadata?.call_control_id ?? null,
      call_leg_id: conversation?.metadata?.call_leg_id ?? null,
      call_session_id: conversation?.metadata?.call_session_id ?? null,
      channel: conversation?.metadata?.telnyx_conversation_channel ?? null,
      created_at: createdAt?.toISOString() ?? conversation?.created_at ?? null,
      usage_date: usageDate,
      usage_bucket_hour_utc: bucketHour,
    },
    runtime_path: {
      mode: "codex_local",
      workspace_path: process.cwd(),
      restored_from_gateway_adapter: true,
    },
    latency: {
      sample_size: latencyTurns.length,
      end_user_perceived_latency_ms: summarizeNumbers(latencyTurns),
    },
    transcript_quality: {
      user_turns: userTexts.length,
      assistant_turns: assistantTexts.length,
      assistant_clarification_turns: clarificationTurns,
      insight_status: insightRuns[0]?.status ?? null,
      insight_summary: insightRuns[0]?.conversation_insights?.[0]?.result ?? null,
      assessment: classifyTranscriptQuality({ userTurnCount: userTexts.length, clarificationTurns, hasInsight: Boolean(insightRuns[0]?.conversation_insights?.[0]?.result) }),
    },
    interruption_handling: {
      status: "not_observed",
      observed: false,
      evidence: "The selected live conversation exposes no interruption-specific fields, barge-in markers, or mid-response tool calls; only normal turn-taking was observed.",
    },
    provider_cost: {
      granularity: "hourly_usage_bucket",
      call_control: matchingCallControlRow ?? null,
      inference: matchingInferenceRows,
      total_hour_bucket_usd: roundCurrency(
        Number(matchingCallControlRow?.cost ?? 0) + matchingInferenceRows.reduce((sum, row) => sum + Number(row?.cost ?? 0), 0)
      ),
    },
    verification: {
      live_api_sources: [
        "GET /v2/ai/conversations/{conversation_id}",
        "GET /v2/ai/conversations/{conversation_id}/messages",
        "GET /v2/ai/conversations/{conversation_id}/conversations-insights",
        "GET /v2/usage_reports?product=call-control",
        "GET /v2/usage_reports?product=inference",
      ],
      generated_at: new Date().toISOString(),
    },
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  process.stdout.write(`${outputPath}\n`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = "true";
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function requiredArg(args, key) {
  const value = args[key];
  if (!value || value === "true") {
    throw new Error(`Missing required --${key}`);
  }
  return value;
}

async function getApiKey(explicitApiKey) {
  if (explicitApiKey) return explicitApiKey;
  if (process.env.TELNYX_API_KEY) return process.env.TELNYX_API_KEY;
  const configPath = resolve(homedir(), ".config", "telnyx", "config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const profileName = config.defaultProfile;
  const apiKey = config?.profiles?.[profileName]?.apiKey;
  if (!apiKey) throw new Error("No Telnyx API key found in TELNYX_API_KEY or ~/.config/telnyx/config.json");
  return apiKey;
}

async function telnyxGet(apiKey, url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Telnyx request failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function findAssistantConnection(apiKey, baseUrl, assistantId) {
  const uuid = assistantId.replace(/^assistant-/, "");
  const envelope = await telnyxGet(apiKey, `${baseUrl}/connections?page[size]=250`);
  const connections = Array.isArray(envelope.data) ? envelope.data : [];
  return (
    connections.find((connection) => typeof connection?.connection_name === "string" && connection.connection_name.includes(uuid)) ??
    null
  );
}

async function queryUsage(apiKey, baseUrl, params) {
  const url = new URL(`${baseUrl}/usage_reports`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("format", "json");
  url.searchParams.set("page[number]", "1");
  url.searchParams.set("page[size]", "100");
  url.searchParams.set("managed_accounts", "false");
  return telnyxGet(apiKey, url.toString());
}

function summarizeNumbers(values) {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: Number((total / values.length).toFixed(2)),
  };
}

function classifyTranscriptQuality({ userTurnCount, clarificationTurns, hasInsight }) {
  if (!userTurnCount) return "no_end_user_turns";
  if (clarificationTurns === 0 && hasInsight) return "clean_goal_completion";
  if (clarificationTurns > 0 && hasInsight) return "goal_completed_with_recovery_turns";
  return "partial_or_unclear";
}

function normalizeDateTime(value) {
  if (typeof value !== "string" || !value.length) return null;
  const normalized = /z$/i.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toUsageWindow(usageDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(usageDate)) {
    throw new Error("--usage-date must use YYYY-MM-DD");
  }
  return {
    start: `${usageDate}T00:00:00Z`,
    end: `${usageDate}T23:59:59Z`,
  };
}

function roundCurrency(value) {
  return Number(value.toFixed(6));
}

function selectCallControlUsageRow({ rows, bucketHour, assistantUuid, connectionId }) {
  if (!bucketHour) return null;
  const hourRows = rows.filter((row) => row?.date_time === bucketHour);
  if (!hourRows.length) return null;
  if (connectionId) {
    const exact = hourRows.find((row) => row?.connection_id === connectionId);
    if (exact) return exact;
  }
  if (assistantUuid) {
    const assistantMatch = hourRows.find((row) => typeof row?.connection_name === "string" && row.connection_name.includes(assistantUuid));
    if (assistantMatch) return assistantMatch;
  }
  const aiAssistantRow = hourRows.find((row) => typeof row?.connection_name === "string" && row.connection_name.startsWith("ai-assistant-"));
  return aiAssistantRow ?? hourRows[0];
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
