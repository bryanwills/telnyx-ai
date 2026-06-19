#!/usr/bin/env node

import { LinkRuntime } from "./runtime.js";
import { formatSharedChannelResponse } from "./shared-channel.js";
import { createLinkAppPublisherServer, LinkAppPublisherService, listenLinkAppPublisherServer, TelnyxEdgeCliDeployer } from "./app-publisher.js";
import { createSkillRegistryServer, listenSkillRegistryServer, SkillRegistryService } from "./skill-registry.js";
import { createMessageGatewayServer, listenMessageGatewayServer, MessageGatewayService } from "./message-gateway.js";
import {
  CloudLinkSessionService,
  createCloudLinkSessionServer,
  listenCloudLinkSessionServer,
  TelnyxHostedSessionRunner,
  TelnyxSmsNotificationAdapter,
} from "./session-daemon.js";
import { inspectLocalLinkApp } from "./local-app.js";

const runtime = new LinkRuntime();
const [command = "chat", ...args] = process.argv.slice(2);

try {
  if (command === "chat") {
    const prompt = args.join(" ") || "Help me understand what Telnyx Cloud Link can do in the local runtime.";
    const result = await runtime.chat({ prompt, actorId: "dev_user" });
    console.log(result.response ?? result.finalOutput);
  } else if (command === "skill") {
    const skillName = args.join(" ") || "Account Briefing";
    const result = await runtime.runSkill(skillName, {
      accountId: "acct_mock_001",
      query: skillName,
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "shared-channel") {
    const result = runtime.runSharedChannel({
      actorId: "dev_user",
      channelType: "shared_customer",
      customerIdentifier: "Acme Messaging Co.",
      userPrompt: "Draft a customer-safe response about the SMS delivery escalation.",
      requestedAction: "post update to shared customer Slack channel",
      threadContext:
        "Internal note: carrier route id R-42 showed latency. Raw log trace id abc123. Customer impact appears limited to delayed SMS delivery for a subset of US traffic.",
    });
    console.log(formatSharedChannelResponse(result));
  } else if (command === "app-publisher") {
    const port = Number(args.find((arg) => /^\d+$/.test(arg)) ?? process.env.PORT ?? 0);
    const requireAuth = !args.includes("--dev-no-auth");
    const storagePath = optionValue(args, "--storage") || process.env.LINK_APP_PUBLISHER_STORAGE;
    const useEdgeDeployer = args.includes("--edge-deployer") || process.env.LINK_APP_PUBLISHER_DEPLOYER === "telnyx-edge";
    const enforceReviewers = args.includes("--enforce-reviewers") || process.env.LINK_APP_PUBLISHER_ENFORCE_REVIEWERS === "1";
    const requireAuthContext = args.includes("--require-auth-context") || process.env.LINK_APP_PUBLISHER_REQUIRE_AUTH_CONTEXT === "1";
    const buildLogBaseUrl = optionValue(args, "--build-log-base-url") || process.env.LINK_APP_PUBLISHER_BUILD_LOG_BASE_URL;
    const deployer = useEdgeDeployer
      ? new TelnyxEdgeCliDeployer({
          workspaceRoot: optionValue(args, "--workspace-root") || process.env.LINK_APP_PUBLISHER_WORKSPACE_ROOT,
        })
      : undefined;
    const service = new LinkAppPublisherService({ storagePath, deployer, enforceReviewers, buildLogBaseUrl });
    const server = createLinkAppPublisherServer(service, { requireAuth, requireAuthContext });
    const listener = await listenLinkAppPublisherServer(server, port);
    const readiness = service.readiness();
    const httpReady = readiness.ready && requireAuth && requireAuthContext;
    console.log(`Cloud Link App Publisher listening at ${listener.url}`);
    if (storagePath) console.log(`Catalog storage: ${storagePath}`);
    console.log(useEdgeDeployer ? "Deployer: telnyx-edge ship" : "Deployer: record-only local adapter");
    console.log(enforceReviewers ? "Reviewer policy: enforced" : "Reviewer policy: permissive");
    console.log(requireAuth ? "Auth required: Bearer, x-telnyx-auth-rev2, or x-telnyx-api-key." : "Auth disabled for local development.");
    console.log(requireAuthContext ? "Auth context: required" : "Auth context: not required");
    if (buildLogBaseUrl) console.log(`Build logs: ${buildLogBaseUrl}`);
    console.log(httpReady ? "Readiness: ready for production publish flow" : "Readiness: not production ready; check GET /readyz");
  } else if (command === "skill-registry") {
    const port = Number(args.find((arg) => /^\d+$/.test(arg)) ?? process.env.PORT ?? 0);
    const requireAuth = !args.includes("--dev-no-auth");
    const requireAuthContext = args.includes("--require-auth-context") || process.env.LINK_SKILL_REGISTRY_REQUIRE_AUTH_CONTEXT === "1";
    const storagePath = optionValue(args, "--storage") || process.env.LINK_SKILL_REGISTRY_STORAGE;
    const service = new SkillRegistryService({ storagePath });
    const server = createSkillRegistryServer(service, { requireAuth, requireAuthContext });
    const listener = await listenSkillRegistryServer(server, port);
    const readiness = service.readiness();
    const httpReady = readiness.ready && requireAuth && requireAuthContext;
    console.log(`Cloud Link Skill Registry listening at ${listener.url}`);
    if (storagePath) console.log(`Registry storage: ${storagePath}`);
    console.log(requireAuth ? "Auth required: Bearer, x-telnyx-auth-rev2, or x-telnyx-api-key." : "Auth disabled for local development.");
    console.log(requireAuthContext ? "Auth context: required" : "Auth context: not required");
    console.log(httpReady ? "Readiness: ready for production skill tracking" : "Readiness: not production ready; check GET /readyz");
  } else if (command === "message-gateway") {
    const port = Number(args.find((arg) => /^\d+$/.test(arg)) ?? process.env.PORT ?? 0);
    const requireAuth = !args.includes("--dev-no-auth");
    const requireAuthContext = args.includes("--require-auth-context") || process.env.LINK_MESSAGE_GATEWAY_REQUIRE_AUTH_CONTEXT === "1";
    const storagePath = optionValue(args, "--storage") || process.env.LINK_MESSAGE_GATEWAY_STORAGE;
    const service = new MessageGatewayService({ storagePath });
    const server = createMessageGatewayServer(service, { requireAuth, requireAuthContext });
    const listener = await listenMessageGatewayServer(server, port);
    const readiness = service.readiness();
    const httpReady = readiness.ready && requireAuth && requireAuthContext;
    console.log(`Cloud Link Message Gateway listening at ${listener.url}`);
    if (storagePath) console.log(`Delivery ledger storage: ${storagePath}`);
    console.log("Adapters: Slack, Google Chat, and A2A record-only adapters are active unless replaced by the hosted service.");
    console.log(requireAuth ? "Auth required: Bearer, x-telnyx-auth-rev2, or x-telnyx-api-key." : "Auth disabled for local development.");
    console.log(requireAuthContext ? "Auth context: required" : "Auth context: not required");
    console.log(httpReady ? "Readiness: ready for production delivery routing" : "Readiness: not production ready; check GET /readyz");
  } else if (command === "session-daemon") {
    const port = Number(args.find((arg) => /^\d+$/.test(arg)) ?? process.env.PORT ?? 0);
    const requireAuth = !args.includes("--dev-no-auth");
    const requireAuthContext = args.includes("--require-auth-context") || process.env.LINK_SESSION_DAEMON_REQUIRE_AUTH_CONTEXT === "1";
    const storagePath = optionValue(args, "--storage") || process.env.LINK_SESSION_DAEMON_STORAGE;
    const runnerUrl = optionValue(args, "--runner-url") || process.env.LINK_SESSION_RUNNER_URL;
    const runner = runnerUrl ? new TelnyxHostedSessionRunner({ runnerUrl }) : undefined;
    const service = new CloudLinkSessionService({
      storagePath,
      runner,
      smsAdapter: new TelnyxSmsNotificationAdapter(),
    });
    const server = createCloudLinkSessionServer(service, { requireAuth, requireAuthContext });
    const listener = await listenCloudLinkSessionServer(server, port);
    const readiness = service.readiness();
    const httpReady = readiness.ready && requireAuth && requireAuthContext;
    console.log(`Cloud Link Session Daemon listening at ${listener.url}`);
    if (storagePath) console.log(`Session ledger storage: ${storagePath}`);
    console.log(runnerUrl ? `Runner: Telnyx-hosted PTY runner at ${runnerUrl}` : "Runner: record-only local adapter; set LINK_SESSION_RUNNER_URL for production PTY ownership.");
    console.log("Notifications: Telnyx SMS only. Push and email are disabled.");
    console.log(requireAuth ? "Auth required: Bearer, x-telnyx-auth-rev2, or x-telnyx-api-key." : "Auth disabled for local development.");
    console.log(requireAuthContext ? "Auth context: required" : "Auth context: not required");
    console.log(httpReady ? "Readiness: ready for production session control" : "Readiness: not production ready; check GET /readyz");
  } else if (command === "publish-local-app") {
    const directory = optionValue(args, "--dir") || firstPositional(args) || process.cwd();
    const publisherUrl = (optionValue(args, "--publisher-url") || process.env.LINK_APP_PUBLISHER_URL || "http://127.0.0.1:4300").replace(/\/$/, "");
    const inspection = await inspectLocalLinkApp(directory, localInspectionOptions(args));
    if (args.includes("--dry-run")) {
      console.log(JSON.stringify(inspection, null, 2));
    } else {
      const response = await fetch(`${publisherUrl}/publish-intents`, {
        method: "POST",
        headers: publisherHeaders(args),
        body: JSON.stringify(inspection.publisherPayload),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Publisher rejected local app (${response.status}): ${text}`);
      console.log(text);
    }
  } else if (command === "publisher-e2e-smoke") {
    const result = await runPublisherE2eSmoke(args);
    console.log(JSON.stringify(result, null, 2));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function optionValue(args: string[], name: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function firstPositional(args: string[]): string | undefined {
  const optionsWithValues = new Set([
    "--dir",
    "--publisher-url",
    "--token",
    "--reviewer",
    "--reviewer-groups",
    "--notes",
    "--app-url-override",
    "--app-url-path",
    "--app-url-timeout-ms",
    "--allow-app-statuses",
    "--git-timeout-ms",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const previous = args[index - 1];
    if (!arg || arg.startsWith("--") || optionsWithValues.has(previous)) continue;
    return arg;
  }
  return undefined;
}

function publisherHeaders(args: string[]): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const reviewer = optionValue(args, "--reviewer") || process.env.TELNYX_ACTOR;
  const reviewerGroups = optionValue(args, "--reviewer-groups") || process.env.TELNYX_GROUPS || process.env.TELNYX_ON_BEHALF_OF;
  if (reviewer) headers["x-telnyx-actor"] = reviewer;
  if (reviewerGroups) headers["x-telnyx-groups"] = reviewerGroups;
  if (args.includes("--dev-no-auth")) return headers;
  const explicitToken = optionValue(args, "--token");
  if (explicitToken) {
    headers.authorization = `Bearer ${explicitToken}`;
    return headers;
  }
  if (process.env.TELNYX_AUTH_REV2) {
    headers.authorization = `Bearer ${process.env.TELNYX_AUTH_REV2}`;
  }
  if (process.env.TELNYX_API_KEY) {
    headers["x-telnyx-api-key"] = process.env.TELNYX_API_KEY;
  }
  return headers;
}

async function runPublisherE2eSmoke(args: string[]): Promise<Record<string, unknown>> {
  const directory = optionValue(args, "--dir") || firstPositional(args) || process.cwd();
  const publisherUrl = (optionValue(args, "--publisher-url") || process.env.LINK_APP_PUBLISHER_URL || "http://127.0.0.1:4300").replace(/\/$/, "");
  const requireReady = args.includes("--require-ready");
  const checkAppUrl = args.includes("--check-app-url");
  const headers = publisherHeaders(args);
  const inspection = await inspectLocalLinkApp(directory, localInspectionOptions(args));
  const readiness = await fetchPublisherJson(`${publisherUrl}/readyz`, { headers }, false);
  if (requireReady && (!readiness.ok || readiness.status !== 200 || readiness.payload?.ready !== true)) {
    throw new Error(`Publisher is not production ready (${readiness.status}): ${JSON.stringify(readiness.payload)}`);
  }

  const publish = await fetchPublisherJson(`${publisherUrl}/publish-intents`, {
    method: "POST",
    headers,
    body: JSON.stringify(inspection.publisherPayload),
  });
  const app = recordValue(publish.payload.app);
  const appId = stringValue(app.id);
  if (!appId) throw new Error(`Publisher response did not include app.id: ${JSON.stringify(publish.payload)}`);

  const review = await fetchPublisherJson(`${publisherUrl}/apps/${encodeURIComponent(appId)}/reviews`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      decision: "approve",
      notes: optionValue(args, "--notes") || "publisher e2e smoke",
    }),
  });
  const deployments = await fetchPublisherJson(`${publisherUrl}/apps/${encodeURIComponent(appId)}/deployments`, {
    headers,
  });
  const deploymentLogs = await fetchLatestDeploymentLogs(publisherUrl, appId, deployments.payload, headers);
  const duplicate = await fetchPublisherJson(`${publisherUrl}/apps/${encodeURIComponent(appId)}/duplicate`, {
    method: "POST",
    headers,
  });
  const appUrlCheck = checkAppUrl ? await checkApprovedAppUrl(args, review.payload) : undefined;

  return {
    ok: true,
    publisherUrl,
    readiness: readiness.payload,
    manifest: inspection.manifestPath,
    source: inspection.publisherPayload.source,
    warnings: inspection.warnings,
    publish: publish.payload,
    review: review.payload,
    deployments: deployments.payload,
    deploymentLogs,
    duplicate: duplicate.payload,
    ...(appUrlCheck ? { appUrlCheck } : {}),
  };
}

async function fetchLatestDeploymentLogs(
  publisherUrl: string,
  appId: string,
  deploymentsPayload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | undefined> {
  const deployments = Array.isArray(deploymentsPayload.deployments) ? deploymentsPayload.deployments : [];
  const latestDeployment = deployments.map(recordValue).find((deployment) => stringValue(deployment.id));
  const deploymentId = stringValue(latestDeployment?.id);
  if (!deploymentId) return undefined;
  return (await fetchPublisherJson(`${publisherUrl}/apps/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}/logs`, {
    headers,
  })).payload;
}

async function fetchPublisherJson(url: string, init: RequestInit = {}, throwOnError = true): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> }> {
  const response = await fetch(url, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (throwOnError && !response.ok) throw new Error(`Publisher request failed (${response.status}): ${text}`);
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function localInspectionOptions(args: string[]): { verifyRemoteRef?: boolean; requirePushedRef?: boolean; gitTimeoutMs?: number } {
  return {
    verifyRemoteRef: args.includes("--verify-pushed-ref") || args.includes("--require-pushed-ref"),
    requirePushedRef: args.includes("--require-pushed-ref"),
    gitTimeoutMs: optionValue(args, "--git-timeout-ms") ? positiveIntegerOption(args, "--git-timeout-ms", 5000) : undefined,
  };
}

async function checkApprovedAppUrl(args: string[], reviewPayload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const overrideUrl = optionValue(args, "--app-url-override");
  const approvedUrl = overrideUrl || approvedAppUrl(reviewPayload);
  if (!approvedUrl) {
    throw new Error("Publisher review response did not include an approved app URL to check.");
  }
  const url = appUrlWithPath(approvedUrl, optionValue(args, "--app-url-path"));
  const timeoutMs = positiveIntegerOption(args, "--app-url-timeout-ms", 10_000);
  const allowedSpec = optionValue(args, "--allow-app-statuses") || "200-399";
  const allowedStatuses = parseAllowedStatuses(allowedSpec);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    const allowed = allowedStatuses.some((range) => response.status >= range.min && response.status <= range.max);
    if (!allowed) {
      throw new Error(`Approved app URL returned ${response.status}; allowed statuses: ${allowedSpec}`);
    }
    return {
      ok: true,
      url,
      status: response.status,
      allowedStatuses: allowedSpec,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Approved app URL returned")) throw error;
    throw new Error(`Approved app URL check failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function approvedAppUrl(payload: Record<string, unknown>): string {
  const app = recordValue(payload.app);
  return stringValue(app.vpnUrl) || stringValue(app.deployedUrl) || stringValue(app.previewUrl);
}

function appUrlWithPath(value: string, pathSuffix?: string): string {
  const url = new URL(value);
  const normalizedPath = pathSuffix?.trim();
  if (normalizedPath) {
    url.pathname = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  }
  return url.toString();
}

function positiveIntegerOption(args: string[], name: string, fallback: number): number {
  const raw = optionValue(args, name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function parseAllowedStatuses(value: string): Array<{ min: number; max: number }> {
  return value.split(",").map((part) => {
    const trimmed = part.trim();
    const match = trimmed.match(/^(\d{3})(?:-(\d{3}))?$/);
    if (!match) throw new Error(`Invalid --allow-app-statuses entry: ${trimmed}`);
    const min = Number(match[1]);
    const max = Number(match[2] ?? match[1]);
    if (min > max || min < 100 || max > 599) throw new Error(`Invalid --allow-app-statuses range: ${trimmed}`);
    return { min, max };
  });
}
