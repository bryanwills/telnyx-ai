#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const repoRoot = resolve(args.repoRoot ?? ".");
const inventoryPath = resolve(
  repoRoot,
  args.inventory ?? "docs/tel-36-ai-tooling-package-inventory.json"
);
const outputPath = resolve(
  repoRoot,
  args.output ?? "secret-scan-results.jsonl"
);

const findings = loadRawFindings(resolve(repoRoot, args.input ?? "gitleaks-report.json"));
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
const normalized = findings
  .map((finding) => normalizeFinding(finding, inventory, repoRoot))
  .filter(Boolean);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  normalized.map((finding) => JSON.stringify(finding)).join("\n") + (normalized.length ? "\n" : ""),
  "utf8"
);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function loadRawFindings(inputPath) {
  const raw = readFileSync(inputPath, "utf8").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.findings)) return parsed.findings;
  if (Array.isArray(parsed.results)) return parsed.results;
  return [];
}

function normalizeFinding(finding, inventory, repoRootPath) {
  const repoRelativePath = normalizePath(relative(repoRootPath, resolve(repoRootPath, finding.File || finding.file || "")));
  if (!isTargetSurface(repoRelativePath)) {
    return null;
  }

  const route = selectRoute(repoRelativePath, inventory);
  const classification = classifyFinding(finding, repoRelativePath);
  const escalated =
    classification.validation_status === "confirmed_live" ||
    classification.finding_class === "publish_credential";

  return {
    finding_id: createFindingId(finding, repoRelativePath),
    scanner: "gitleaks",
    rule_id: finding.RuleID ?? finding.ruleID ?? "unknown",
    description: finding.Description ?? finding.description ?? null,
    file_path: repoRelativePath,
    line: finding.StartLine ?? finding.startLine ?? finding.line ?? null,
    commit: finding.Commit ?? finding.commit ?? null,
    secret_redacted: redactSecret(
      finding.Secret ?? finding.secret ?? finding.Match ?? finding.match ?? ""
    ),
    match_redacted: redactMatch(
      finding.Match ?? finding.match ?? "",
      finding.Secret ?? finding.secret ?? ""
    ),
    owner_route: {
      route_key: route.routeKey,
      owner_team: route.ownerTeam,
      owner_label: route.ownerLabel,
      path_prefix: route.pathPrefix,
      surface: route.surface
    },
    classification,
    triage_state: escalated ? "cto_escalated" : "owner_routed",
    escalation: {
      target: escalated ? "cto" : null,
      reason: escalated
        ? classification.validation_status === "confirmed_live"
          ? "confirmed_live_credential"
          : "publish_credential_class"
        : null,
      required: escalated
    }
  };
}

function normalizePath(value) {
  return value.split("\\").join("/").replace(/^\.\//, "");
}

function isTargetSurface(path) {
  return [
    "guides/",
    "inference/",
    "skills/",
    "providers/",
    "plugins/",
    "cli/",
    "tools/",
    "README.md",
    "agent.json",
    "gemini-extension.json"
  ].some((prefix) => path === prefix || path.startsWith(prefix));
}

function selectRoute(path, inventory) {
  const routes = [...(inventory.routes ?? [])].sort(
    (left, right) => right.pathPrefix.length - left.pathPrefix.length
  );
  return routes.find((route) => path === route.pathPrefix || path.startsWith(route.pathPrefix)) ?? inventory.defaultRoute;
}

function classifyFinding(finding, path) {
  const haystack = [
    finding.RuleID,
    finding.Description,
    finding.Match,
    finding.Secret,
    path
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const confirmed =
    isTrue(finding.live) ||
    isTrue(finding.verified) ||
    isTrue(finding.validated) ||
    isTrue(finding.confirmed) ||
    isConfirmedString(finding.validation_status) ||
    isConfirmedString(finding.validationStatus);

  const publishCredential =
    /(npm|node_auth_token|pypi|twine|rubygems|gemfury|package[-_ ]registry|publish[-_ ]token|packagecloud)/i.test(
      haystack
    );

  return {
    finding_class: publishCredential
      ? "publish_credential"
      : confirmed
        ? "live_credential"
        : "unconfirmed_secret",
    validation_status: confirmed ? "confirmed_live" : "unconfirmed"
  };
}

function isTrue(value) {
  return value === true || value === 1 || value === "true";
}

function isConfirmedString(value) {
  return typeof value === "string" && ["live", "confirmed", "valid", "active"].includes(value.toLowerCase());
}

function redactSecret(value) {
  if (!value) return null;
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function redactMatch(match, secret) {
  if (!match) return null;
  if (secret && match.includes(secret)) {
    return match.split(secret).join(redactSecret(secret));
  }
  return match.replace(/[A-Za-z0-9_\/+=-]{8,}/g, (token) => redactSecret(token));
}

function createFindingId(finding, path) {
  const stable = [
    path,
    finding.RuleID ?? finding.ruleID ?? "",
    finding.StartLine ?? finding.startLine ?? finding.line ?? "",
    finding.Commit ?? finding.commit ?? "",
    finding.Match ?? finding.match ?? ""
  ].join(":");
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}
