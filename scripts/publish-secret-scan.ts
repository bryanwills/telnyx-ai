import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

export type SourceSurface = "docs" | "examples" | "templates" | "publish_artifact" | "other";

export type Suppression = {
  kind: "inline";
  reason: string;
};

export type SecretFinding = {
  reportVersion: "1";
  findingId: string;
  evidenceFingerprint: string;
  detectorId: string;
  secretClass: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: "low" | "medium" | "high";
  path: string;
  line: number;
  sourceSurface: SourceSurface;
  matchLength: number;
  suppression?: Suppression;
};

export type ScanReport = {
  reportVersion: "1";
  scannedPaths: string[];
  summary: {
    filesScanned: number;
    findings: number;
    blockingFindings: number;
    suppressedFindings: number;
  };
  findings: SecretFinding[];
};

type Detector = {
  detectorId: string;
  secretClass: string;
  severity: SecretFinding["severity"];
  confidence: SecretFinding["confidence"];
  pattern: RegExp;
  extractValue(match: RegExpExecArray): string;
};

const REPORT_VERSION = "1";
const DEFAULT_SCAN_PATHS = [
  ".github",
  "guides",
  "skills",
  "providers",
  "cli",
  "plugins",
  "tools",
];
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".env",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sh",
  ".text",
  ".tpl",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const SUPPRESSION_PATTERN = /secret-scan:\s*ignore(?:\s+reason=([^\n]+))?/i;

const DETECTORS: Detector[] = [
  {
    detectorId: "github_pat",
    secretClass: "github_pat",
    severity: "critical",
    confidence: "high",
    pattern: /\b(ghp_[A-Za-z0-9]{36})\b/g,
    extractValue: (match) => match[1],
  },
  {
    detectorId: "npm_token",
    secretClass: "npm_token",
    severity: "critical",
    confidence: "high",
    pattern: /\b(npm_[A-Za-z0-9]{36})\b/g,
    extractValue: (match) => match[1],
  },
  {
    detectorId: "aws_access_key_id",
    secretClass: "aws_access_key_id",
    severity: "high",
    confidence: "high",
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    extractValue: (match) => match[1],
  },
  {
    detectorId: "generic_env_secret",
    secretClass: "generic_api_secret",
    severity: "high",
    confidence: "medium",
    pattern: /\b[A-Z][A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\b\s*[:=]\s*["']?([A-Za-z0-9/_+=-]{20,})["']?/g,
    extractValue: (match) => match[1],
  },
];

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function isTextFile(path: string): boolean {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}

function walkFiles(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }

  const stats = statSync(path);
  if (stats.isFile()) {
    return isTextFile(path) ? [path] : [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    files.push(...walkFiles(join(path, entry.name)));
  }
  return files;
}

function classifySourceSurface(path: string): SourceSurface {
  const normalizedPath = normalizePath(path).toLowerCase();

  if (normalizedPath.includes("/examples/")) {
    return "examples";
  }
  if (normalizedPath.includes("/templates/")) {
    return "templates";
  }
  if (
    normalizedPath.startsWith("guides/") ||
    normalizedPath.startsWith("skills/") ||
    normalizedPath.startsWith("providers/") ||
    normalizedPath.endsWith(".md")
  ) {
    return "docs";
  }
  if (
    normalizedPath.includes("/artifacts/") ||
    normalizedPath.startsWith(".github/") ||
    normalizedPath.startsWith("cli/") ||
    normalizedPath.startsWith("plugins/") ||
    normalizedPath.startsWith("tools/")
  ) {
    return "publish_artifact";
  }
  return "other";
}

function getSuppression(line: string): Suppression | undefined {
  const match = line.match(SUPPRESSION_PATTERN);
  if (!match) {
    return undefined;
  }

  return {
    kind: "inline",
    reason: match[1]?.trim() || "inline ignore",
  };
}

function isPlaceholderValue(value: string): boolean {
  const normalized = value.toLowerCase();
  const placeholderPatterns = [
    /changeme/,
    /dummy/,
    /example/,
    /placeholder/,
    /redacted/,
    /sample/,
    /test[-_]?key/,
    /your[_-]/,
    /^\${.+}$/,
    /^<.+>$/,
  ];

  if (placeholderPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  return /^([a-z0-9])\1{9,}$/i.test(value);
}

function scanLine(path: string, line: string, lineNumber: number): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const suppression = getSuppression(line);

  for (const detector of DETECTORS) {
    detector.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = detector.pattern.exec(line)) !== null) {
      const secretValue = detector.extractValue(match);
      if (isPlaceholderValue(secretValue)) {
        continue;
      }

      const evidenceFingerprint = hashText(`${detector.detectorId}:${secretValue}`).slice(0, 16);
      const relativePath = normalizePath(path);
      const findingId = hashText(
        [
          REPORT_VERSION,
          detector.detectorId,
          detector.secretClass,
          relativePath,
          String(lineNumber),
          evidenceFingerprint,
        ].join(":")
      ).slice(0, 20);

      findings.push({
        reportVersion: REPORT_VERSION,
        findingId,
        evidenceFingerprint,
        detectorId: detector.detectorId,
        secretClass: detector.secretClass,
        severity: detector.severity,
        confidence: detector.confidence,
        path: relativePath,
        line: lineNumber,
        sourceSurface: classifySourceSurface(relativePath),
        matchLength: secretValue.length,
        suppression,
      });
    }
  }

  return findings;
}

export function scanPaths(scanPaths: string[], baseDir = process.cwd()): ScanReport {
  const normalizedPaths = scanPaths.map((path) => normalizePath(path));
  const findings: SecretFinding[] = [];
  let filesScanned = 0;

  for (const scanPath of scanPaths) {
    for (const file of walkFiles(join(baseDir, scanPath))) {
      filesScanned += 1;
      const relativePath = normalizePath(relative(baseDir, file));
      const content = readFileSync(file, "utf8");
      const lines = content.split(/\r?\n/);

      lines.forEach((line, index) => {
        findings.push(...scanLine(relativePath, line, index + 1));
      });
    }
  }

  const suppressedFindings = findings.filter((finding) => finding.suppression).length;

  return {
    reportVersion: REPORT_VERSION,
    scannedPaths: normalizedPaths,
    summary: {
      filesScanned,
      findings: findings.length,
      blockingFindings: findings.length - suppressedFindings,
      suppressedFindings,
    },
    findings,
  };
}

function parseArgs(argv: string[]): { scanPaths: string[]; failOnFindings: boolean } {
  const scanPaths: string[] = [];
  let failOnFindings = false;

  for (const arg of argv) {
    if (arg === "--ci") {
      failOnFindings = true;
      continue;
    }
    if (arg === "--no-fail-on-findings") {
      failOnFindings = false;
      continue;
    }
    scanPaths.push(arg);
  }

  return {
    scanPaths: scanPaths.length > 0 ? scanPaths : DEFAULT_SCAN_PATHS,
    failOnFindings,
  };
}

function main() {
  const { scanPaths: requestedPaths, failOnFindings } = parseArgs(process.argv.slice(2));
  const report = scanPaths(requestedPaths, process.cwd());
  console.log(JSON.stringify(report, null, 2));

  if (failOnFindings && report.summary.blockingFindings > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
