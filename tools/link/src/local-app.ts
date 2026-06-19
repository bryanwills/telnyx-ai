import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseLinkAppManifestText } from "./app-manifest.js";
import type { LinkAppManifestFields } from "./app-manifest.js";
import type { LinkAppPublishIntentInput, LinkAppPublisherType } from "./app-publisher.js";
import type { RiskLevel } from "./types.js";

export interface LinkLocalAppPublishInput {
  name: string;
  slug?: string;
  description?: string;
  ownerSquad: string;
  audience: string;
  appType: LinkAppPublisherType;
  sourceRepo: string;
  sourceRef: string;
  sourceSubdir: string;
  installCommand?: string;
  buildCommand: string;
  startCommand?: string;
  outputDir?: string;
  envSchema: string[];
  reviewers: string[];
  riskLevel: RiskLevel;
}

export interface LinkLocalAppInspection {
  directory: string;
  manifestPath: string;
  packageName: string;
  publishInput: LinkLocalAppPublishInput;
  publisherPayload: LinkAppPublishIntentInput;
  git: {
    root: string;
    remote: string;
    head: string;
    dirty: boolean;
    sourceSubdir: string;
    remoteRefStatus?: "unchecked" | "available" | "missing" | "error";
    remoteRefDetail?: string;
  };
  warnings: string[];
}

export interface InspectLocalLinkAppOptions {
  gitBinary?: string;
  verifyRemoteRef?: boolean;
  requirePushedRef?: boolean;
  gitTimeoutMs?: number;
}

export type LinkLocalAppImportScope = "personal" | "company";

export interface ImportLocalLinkAppOptions extends InspectLocalLinkAppOptions {
  destinationRoot: string;
  scope?: LinkLocalAppImportScope;
  slug?: string;
  name?: string;
  description?: string;
  ownerSquad?: string;
  audience?: string;
  sourceRepo?: string;
  sourceRef?: string;
  replaceExisting?: boolean;
}

export interface LinkLocalAppImportResult extends LinkLocalAppInspection {
  imported: true;
  scope: LinkLocalAppImportScope;
  sourceDirectory: string;
  targetDirectory: string;
  createdManifest: boolean;
  replaced: boolean;
}

interface PackageJsonLike {
  name?: string;
  displayName?: string;
  description?: string;
  scripts?: Record<string, string>;
}

interface LocalAppManifestReadResult {
  path: string;
  data: LinkAppManifestFields;
}

export async function inspectLocalLinkApp(
  directoryPath: string,
  options: InspectLocalLinkAppOptions = {},
): Promise<LinkLocalAppInspection> {
  const appDirectory = path.resolve(String(directoryPath || ""));
  const appStat = await stat(appDirectory).catch(() => null);
  if (!appStat?.isDirectory()) throw new Error("Select a local app directory.");

  const manifest = await readLocalAppManifest(appDirectory);
  const packageJson = await readLocalPackageJson(appDirectory);
  const git = inspectLocalGitSource(appDirectory, options.gitBinary ?? "git", options.gitTimeoutMs);
  const access = optionalString(manifest.data.access || "vpn").toLowerCase();
  if (access !== "vpn") throw new Error("link-app.yml access must be vpn.");

  const publishInput = normalizeLocalPublishInput({
    name: manifest.data.name || packageJson.displayName || packageJson.name || path.basename(appDirectory),
    slug: manifest.data.slug,
    description: manifest.data.description || packageJson.description,
    ownerSquad: manifest.data.ownerSquad,
    audience: manifest.data.audience,
    appType: manifest.data.appType || "web",
    sourceRepo: manifest.data.sourceRepo || git.remote,
    sourceRef: manifest.data.sourceRef || git.head || "main",
    sourceSubdir: manifest.data.sourceSubdir || git.sourceSubdir || ".",
    installCommand: manifest.data.installCommand || inferInstallCommand(appDirectory),
    buildCommand: manifest.data.buildCommand || "npm run build",
    startCommand: manifest.data.startCommand || (packageJson.scripts?.start ? "npm start" : undefined),
    outputDir: manifest.data.outputDir || "dist",
    envSchema: manifest.data.envSchema,
    reviewers: manifest.data.reviewers,
    riskLevel: manifest.data.riskLevel || "medium",
  });

  const warnings: string[] = [];
  const shouldCheckRemoteRef = Boolean(options.verifyRemoteRef || options.requirePushedRef);
  const gitWithRemoteStatus = shouldCheckRemoteRef
    ? { ...git, ...checkRemoteSourceRef(appDirectory, options.gitBinary ?? "git", publishInput.sourceRef, options.gitTimeoutMs) }
    : { ...git, remoteRefStatus: "unchecked" as const };
  if (options.requirePushedRef && gitWithRemoteStatus.remoteRefStatus !== "available") {
    throw new Error(`source_ref is not present on origin and cannot be deployed by the publisher: ${gitWithRemoteStatus.remoteRefDetail || publishInput.sourceRef}`);
  }
  if (git.dirty) warnings.push("Local Git changes are not included in the publish request; commit and push before review.");
  if (manifest.data.sourceRef && git.head && manifest.data.sourceRef !== git.head) warnings.push("Manifest source_ref overrides the current Git commit.");
  if (gitWithRemoteStatus.remoteRefStatus === "missing") warnings.push("Current source_ref was not found on origin; push it before publishing to Edge.");
  if (gitWithRemoteStatus.remoteRefStatus === "error") warnings.push(`Could not verify source_ref on origin: ${gitWithRemoteStatus.remoteRefDetail}`);

  return {
    directory: appDirectory,
    manifestPath: manifest.path,
    packageName: packageJson.name ?? "",
    publishInput,
    publisherPayload: publisherPayloadFromLocalApp(publishInput),
    git: gitWithRemoteStatus,
    warnings,
  };
}

export function publisherPayloadFromLocalApp(input: LinkLocalAppPublishInput): LinkAppPublishIntentInput {
  return {
    app: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      owner_squad: input.ownerSquad,
      audience: input.audience,
      app_type: input.appType,
      access: "vpn",
      risk_level: input.riskLevel,
      env_schema: input.envSchema,
      reviewers: input.reviewers,
    },
    source: {
      repo: input.sourceRepo,
      ref: input.sourceRef,
      subdir: input.sourceSubdir,
    },
    build: {
      install_command: input.installCommand,
      command: input.buildCommand,
      start_command: input.startCommand,
      output_dir: input.outputDir,
    },
  };
}

export async function importLocalLinkApp(
  sourceDirectoryPath: string,
  options: ImportLocalLinkAppOptions,
): Promise<LinkLocalAppImportResult> {
  const destinationRoot = path.resolve(requiredString(options.destinationRoot, "destination_root"));
  const sourceDirectory = await resolveImportSourceRoot(path.resolve(String(sourceDirectoryPath || "")));
  const sourceStat = await stat(sourceDirectory).catch(() => null);
  if (!sourceStat?.isDirectory()) throw new Error("Select a local app directory or extracted app bundle.");

  const manifest = await readOptionalLocalAppManifest(sourceDirectory);
  const packageJson = await readLocalPackageJson(sourceDirectory);
  const scope = normalizeImportScope(options.scope);
  const appName = optionalString(options.name) || manifest.data.name || packageJson.displayName || packageJson.name || path.basename(sourceDirectory);
  const slug = slugify(optionalString(options.slug) || manifest.data.slug || packageJson.name || appName);
  const targetDirectory = path.resolve(destinationRoot, scope, slug);
  if (!targetDirectory.startsWith(`${destinationRoot}${path.sep}`)) throw new Error("Import target must stay inside the edge-apps directory.");

  const sourceRealPath = realpathSync(sourceDirectory);
  const targetExists = existsSync(targetDirectory);
  const targetRealPath = targetExists ? realpathSync(targetDirectory) : "";
  const importingInPlace = targetRealPath === sourceRealPath;
  const warnings: string[] = [];
  if (targetDirectory.startsWith(`${sourceRealPath}${path.sep}`) && !importingInPlace) {
    throw new Error("Choose an app source outside the target import folder or choose a different slug.");
  }
  if (targetExists && !importingInPlace && !options.replaceExisting) {
    throw new Error(`An imported app already exists at ${targetDirectory}. Enable replace existing to overwrite it.`);
  }
  if (targetExists && !importingInPlace) await rm(targetDirectory, { recursive: true, force: true });
  if (!importingInPlace) {
    await mkdir(path.dirname(targetDirectory), { recursive: true });
    await copyImportDirectory(sourceDirectory, targetDirectory, warnings);
  }

  const targetManifest = await readOptionalLocalAppManifest(targetDirectory);
  const targetPackageJson = await readLocalPackageJson(targetDirectory);
  const needsStaticBuildScript = !targetPackageJson.scripts?.build && !targetManifest.data.buildCommand;
  if (needsStaticBuildScript) await writeStaticImportBuildScript(targetDirectory);

  const sourceSubdir = normalizePathForManifest(path.join(path.basename(destinationRoot), scope, slug));
  await writeImportedLinkAppManifest(targetDirectory, {
    manifest: targetManifest.data,
    packageJson: targetPackageJson,
    scope,
    slug,
    name: appName,
    description: options.description,
    ownerSquad: options.ownerSquad,
    audience: options.audience,
    sourceRepo: options.sourceRepo,
    sourceRef: options.sourceRef,
    sourceSubdir,
    needsStaticBuildScript,
    warnings,
  });

  const inspection = await inspectLocalLinkApp(targetDirectory, options);
  return {
    ...inspection,
    imported: true,
    sourceDirectory,
    targetDirectory,
    scope,
    createdManifest: !manifest.path,
    replaced: Boolean(targetExists && !importingInPlace),
    warnings: [...warnings, ...inspection.warnings],
  };
}

async function readLocalAppManifest(appDirectory: string): Promise<LocalAppManifestReadResult> {
  const candidates = ["link-app.yml", "link-app.yaml", "link-app.json"];
  for (const filename of candidates) {
    const manifestPath = path.join(appDirectory, filename);
    const text = await readFile(manifestPath, "utf8").catch(() => "");
    if (!text) continue;
    return {
      path: manifestPath,
      data: parseLinkAppManifestText(text, filename),
    };
  }
  throw new Error("Selected directory must contain link-app.yml, link-app.yaml, or link-app.json.");
}

async function readOptionalLocalAppManifest(appDirectory: string): Promise<LocalAppManifestReadResult> {
  const candidates = ["link-app.yml", "link-app.yaml", "link-app.json"];
  for (const filename of candidates) {
    const manifestPath = path.join(appDirectory, filename);
    const text = await readFile(manifestPath, "utf8").catch(() => "");
    if (!text) continue;
    return {
      path: manifestPath,
      data: parseLinkAppManifestText(text, filename),
    };
  }
  return {
    path: "",
    data: { envSchema: [], reviewers: [] },
  };
}

async function readLocalPackageJson(appDirectory: string): Promise<PackageJsonLike> {
  const text = await readFile(path.join(appDirectory, "package.json"), "utf8").catch(() => "");
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as PackageJsonLike : {};
  } catch {
    throw new Error("package.json is not valid JSON.");
  }
}

function inspectLocalGitSource(appDirectory: string, gitBinary: string, timeoutMs = 5000): LinkLocalAppInspection["git"] {
  const runGit = (...args: string[]) =>
    execFileSync(gitBinary, ["-C", appDirectory, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      maxBuffer: 128 * 1024,
    }).trim();
  const runGitOptional = (...args: string[]) => {
    try {
      return runGit(...args);
    } catch {
      return "";
    }
  };
  const root = realpathSync(runGit("rev-parse", "--show-toplevel"));
  const resolvedAppDirectory = realpathSync(appDirectory);
  const remote = runGitOptional("config", "--get", "remote.origin.url") || runGit("remote", "get-url", "origin");
  const head = runGit("rev-parse", "HEAD");
  const statusText = runGit("status", "--porcelain");
  const sourceSubdir = normalizePathForManifest(path.relative(root, resolvedAppDirectory)) || ".";
  return {
    root,
    remote,
    head,
    dirty: Boolean(statusText),
    sourceSubdir,
    remoteRefStatus: "unchecked",
  };
}

function checkRemoteSourceRef(
  appDirectory: string,
  gitBinary: string,
  sourceRef: string,
  timeoutMs = 5000,
): Pick<LinkLocalAppInspection["git"], "remoteRefStatus" | "remoteRefDetail"> {
  try {
    const output = execFileSync(gitBinary, ["-C", appDirectory, "ls-remote", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    const refs = output.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [hash = "", ref = ""] = line.split(/\s+/);
      return { hash, ref };
    });
    const available = refs.some(({ hash, ref }) => hash === sourceRef || ref === sourceRef || ref.endsWith(`/${sourceRef}`));
    return {
      remoteRefStatus: available ? "available" : "missing",
      remoteRefDetail: available ? "source_ref is present on origin" : sourceRef,
    };
  } catch (error) {
    return {
      remoteRefStatus: "error",
      remoteRefDetail: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeLocalPublishInput(input: Partial<LinkLocalAppPublishInput>): LinkLocalAppPublishInput {
  const name = requiredString(input.name, "name");
  const sourceRepo = requiredString(input.sourceRepo, "source_repo");
  if (!isSafeSourceRepoUrl(sourceRepo)) throw new Error("source_repo must be a team-telnyx GitHub URL.");
  const sourceSubdir = optionalString(input.sourceSubdir) || ".";
  if (sourceSubdir.split("/").includes("..")) throw new Error("source_subdir cannot contain parent directory segments.");
  const startCommand = optionalString(input.startCommand);
  const outputDir = optionalString(input.outputDir);
  const installCommand = optionalString(input.installCommand);
  if (!startCommand && !outputDir) throw new Error("Provide either start_command or output_dir.");
  const envSchema = Array.isArray(input.envSchema) ? input.envSchema.map(optionalString).filter(Boolean) : [];
  assertNoSecretValues(envSchema);
  return {
    name,
    slug: optionalString(input.slug) || slugify(name),
    description: optionalString(input.description) || "Private Cloud Link app.",
    ownerSquad: requiredString(input.ownerSquad, "owner_squad"),
    audience: requiredString(input.audience, "audience"),
    appType: input.appType === "mcp_app" ? "mcp_app" : "web",
    sourceRepo,
    sourceRef: optionalString(input.sourceRef) || "main",
    sourceSubdir,
    installCommand: installCommand || undefined,
    buildCommand: optionalString(input.buildCommand) || "npm run build",
    startCommand: startCommand || undefined,
    outputDir: outputDir || undefined,
    envSchema,
    reviewers: Array.isArray(input.reviewers) ? input.reviewers.map(optionalString).filter(Boolean) : [],
    riskLevel: normalizeRiskLevel(input.riskLevel),
  };
}

function inferInstallCommand(appDirectory: string): string | undefined {
  if (existsSync(path.join(appDirectory, "package-lock.json")) || existsSync(path.join(appDirectory, "npm-shrinkwrap.json"))) return "npm ci";
  if (existsSync(path.join(appDirectory, "pnpm-lock.yaml"))) return "pnpm install --frozen-lockfile";
  if (existsSync(path.join(appDirectory, "yarn.lock"))) return "yarn install --frozen-lockfile";
  if (existsSync(path.join(appDirectory, "bun.lockb")) || existsSync(path.join(appDirectory, "bun.lock"))) return "bun install";
  if (existsSync(path.join(appDirectory, "package.json"))) return "npm install";
  return undefined;
}

async function resolveImportSourceRoot(sourceDirectory: string): Promise<string> {
  if (await looksLikeImportableAppDirectory(sourceDirectory)) return sourceDirectory;
  const entries = await readdir(sourceDirectory, { withFileTypes: true }).catch(() => []);
  const childDirectories = entries
    .filter((entry) => entry.isDirectory() && entry.name !== "__MACOSX" && !entry.name.startsWith("."))
    .map((entry) => path.join(sourceDirectory, entry.name));
  if (childDirectories.length === 1 && await looksLikeImportableAppDirectory(childDirectories[0])) {
    return childDirectories[0];
  }
  return sourceDirectory;
}

async function looksLikeImportableAppDirectory(directory: string): Promise<boolean> {
  const candidates = ["link-app.yml", "link-app.yaml", "link-app.json", "package.json", "index.html", "src"];
  for (const candidate of candidates) {
    const candidateStat = await stat(path.join(directory, candidate)).catch(() => null);
    if (candidateStat?.isFile() || candidateStat?.isDirectory()) return true;
  }
  return false;
}

async function copyImportDirectory(sourceDirectory: string, targetDirectory: string, warnings: string[]): Promise<void> {
  const limits = { files: 5000, bytes: 100 * 1024 * 1024, depth: 40 };
  const totals = { files: 0, bytes: 0 };
  await mkdir(targetDirectory, { recursive: true });

  async function walk(source: string, target: string, depth: number): Promise<void> {
    if (depth > limits.depth) throw new Error("Imported app folder is too deeply nested.");
    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      const skipReason = skippedImportEntryReason(entry.name, entry.isDirectory());
      if (skipReason) {
        warnings.push(`${entry.name} skipped during import: ${skipReason}`);
        continue;
      }
      if (entry.isSymbolicLink()) {
        warnings.push(`${entry.name} skipped during import: symbolic links are not copied.`);
        continue;
      }
      if (entry.isDirectory()) {
        await mkdir(targetPath, { recursive: true });
        await walk(sourcePath, targetPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const fileStat = await stat(sourcePath);
      totals.files += 1;
      totals.bytes += fileStat.size;
      if (totals.files > limits.files) throw new Error("Imported app has too many files.");
      if (totals.bytes > limits.bytes) throw new Error("Imported app is larger than the 100 MB import limit.");
      await copyFile(sourcePath, targetPath);
    }
  }

  await walk(sourceDirectory, targetDirectory, 0);
}

function skippedImportEntryReason(name: string, directory: boolean): string {
  const lower = name.toLowerCase();
  if (directory && [".git", ".hg", ".svn", "node_modules", ".next", ".nuxt", ".turbo", ".cache"].includes(lower)) {
    return "dependency, build, or source-control cache";
  }
  if (lower === ".ds_store" || lower === "thumbs.db") return "local OS metadata";
  if (lower === ".env" || lower.startsWith(".env.")) return "environment files may contain secrets";
  if (/(\.pem|\.p12|\.pfx|\.key|id_rsa|id_dsa|id_ed25519)$/i.test(name)) return "private key material is not imported";
  return "";
}

async function writeStaticImportBuildScript(targetDirectory: string): Promise<void> {
  const scriptsDirectory = path.join(targetDirectory, "scripts");
  await mkdir(scriptsDirectory, { recursive: true });
  await writeFile(path.join(scriptsDirectory, "link-build.mjs"), `import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, "dist");
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const skippedNames = new Set(["dist", "node_modules", ".git", ".hg", ".svn", ".next", ".nuxt", ".turbo", ".cache"]);
const skippedFiles = new Set(["link-app.yml", "link-app.yaml", "link-app.json", "func.toml", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"]);

function shouldCopy(source) {
  const relative = path.relative(root, source);
  if (!relative) return true;
  const parts = relative.split(path.sep);
  if (skippedNames.has(parts[0])) return false;
  if (skippedFiles.has(path.basename(source))) return false;
  if (relative === path.join("scripts", "link-build.mjs")) return false;
  return true;
}

for (const entry of fs.readdirSync(root)) {
  const source = path.join(root, entry);
  if (!shouldCopy(source)) continue;
  fs.cpSync(source, path.join(output, entry), { recursive: true, force: true, filter: shouldCopy });
}
`, "utf8");
}

async function writeImportedLinkAppManifest(
  targetDirectory: string,
  input: {
    manifest: LinkAppManifestFields;
    packageJson: PackageJsonLike;
    scope: LinkLocalAppImportScope;
    slug: string;
    name: string;
    description?: string;
    ownerSquad?: string;
    audience?: string;
    sourceRepo?: string;
    sourceRef?: string;
    sourceSubdir: string;
    needsStaticBuildScript: boolean;
    warnings: string[];
  },
): Promise<void> {
  const manifest = input.manifest;
  const packageJson = input.packageJson;
  const requestedSourceRepo = optionalString(input.sourceRepo) || manifest.sourceRepo || "https://github.com/team-telnyx/link";
  const sourceRepo = isSafeSourceRepoUrl(requestedSourceRepo) ? requestedSourceRepo : "https://github.com/team-telnyx/link";
  if (sourceRepo !== requestedSourceRepo) {
    input.warnings.push("source_repo was reset to https://github.com/team-telnyx/link because imported apps must use a team-telnyx repository.");
  }
  const buildCommand = manifest.buildCommand || (packageJson.scripts?.build ? "npm run build" : "node scripts/link-build.mjs");
  const installCommand = manifest.installCommand || (packageJson.scripts?.build ? inferInstallCommand(targetDirectory) : undefined);
  const outputDir = manifest.outputDir || "dist";
  const ownerSquad = optionalString(input.ownerSquad) || manifest.ownerSquad || (input.scope === "company" ? "company-tools.squad" : "personal.tools");
  const audience = optionalString(input.audience) || manifest.audience || (input.scope === "company" ? "Telnyx employees" : "Personal");
  const description = optionalString(input.description) || manifest.description || packageJson.description || "Imported Cloud Link app hosted on Telnyx dev Edge.";
  const reviewers = manifest.reviewers.length ? manifest.reviewers : input.scope === "company" ? ["link-platform.squad"] : [];
  const fields: [string, string | undefined][] = [
    ["name", optionalString(input.name) || manifest.name || titleize(input.slug)],
    ["slug", input.slug],
    ["description", description],
    ["owner_squad", ownerSquad],
    ["audience", audience],
    ["app_type", manifest.appType || "web"],
    ["source_repo", sourceRepo],
    ["source_ref", optionalString(input.sourceRef) || manifest.sourceRef || "main"],
    ["source_subdir", input.sourceSubdir],
    ["install_command", installCommand],
    ["build_command", buildCommand],
    ["output_dir", outputDir],
    ["environment", "dev"],
    ["access", "vpn"],
    ["risk_level", manifest.riskLevel || "low"],
  ];
  const lines = fields
    .filter(([, value]) => optionalString(value))
    .map(([key, value]) => `${key}: ${yamlScalar(value)}`);
  if (manifest.envSchema.length > 0) {
    lines.push("env_schema:", ...manifest.envSchema.map((item) => `  - ${yamlScalar(item)}`));
  }
  if (reviewers.length > 0) {
    lines.push("reviewers:", ...reviewers.map((item) => `  - ${yamlScalar(item)}`));
  }
  await writeFile(path.join(targetDirectory, "link-app.yml"), `${lines.join("\n")}\n`, "utf8");
  if (input.needsStaticBuildScript) input.warnings.push("Generated scripts/link-build.mjs so this static folder can emit dist/ for Edge preview and deploy.");
}

function normalizeImportScope(value: unknown): LinkLocalAppImportScope {
  return optionalString(value) === "company" ? "company" : "personal";
}

function yamlScalar(value: unknown): string {
  const text = optionalString(value);
  if (/^[A-Za-z0-9_.:/@ -]+$/.test(text) && !/^[-?:,[\]{}#&*!|>'"%@`]/.test(text)) return text;
  return JSON.stringify(text);
}

function titleize(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Link App";
}

function isSafeSourceRepoUrl(value: string): boolean {
  return (
    /^https:\/\/github\.com\/team-telnyx\/[A-Za-z0-9_.-]+(?:\.git)?(?:\/)?$/i.test(value) ||
    /^git@github\.com:team-telnyx\/[A-Za-z0-9_.-]+(?:\.git)?$/i.test(value)
  );
}

function assertNoSecretValues(envSchema: string[]): void {
  const secretValue = envSchema.find((entry) => entry.includes("=") || /secret|token|key/i.test(entry) && entry.includes(":"));
  if (secretValue) throw new Error(`env_schema must declare variable names only, not secret values: ${secretValue}`);
}

function requiredString(value: unknown, label: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeRiskLevel(value: unknown): RiskLevel {
  const normalized = optionalString(value);
  return normalized === "low" || normalized === "medium" || normalized === "high" ? normalized : "medium";
}

function normalizePathForManifest(value: string): string {
  return value.split(path.sep).filter(Boolean).join("/");
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "link-app"
  );
}
