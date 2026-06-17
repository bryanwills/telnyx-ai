import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export const harperPackageName = "harper.js";
export const harperRegistryUrl = "https://registry.npmjs.org/harper.js";
export const harperProjectUrl = "https://github.com/automattic/harper";
const harperStatusTtlMs = 6 * 60 * 60 * 1000;

const supportedDialects = new Set(["american", "british", "australian", "canadian", "indian"]);
const installStates = new Set(["not_installed", "installing", "updating", "ready", "removing"]);

export function defaultHarperAddonSettings(updatedAt = new Date().toISOString()) {
  return {
    installed: false,
    enabled: false,
    autoUpdate: true,
    defaultAction: "review",
    surfaces: {
      scribeSessions: true,
      inboxDrafts: true,
    },
    dialect: "american",
    installState: "not_installed",
    installedVersion: "",
    latestVersion: "",
    updateAvailable: false,
    lastCheckedAt: "",
    lastInstalledAt: "",
    lastError: "",
    packageName: harperPackageName,
    registryUrl: harperRegistryUrl,
    projectUrl: harperProjectUrl,
    download: null,
    updatedAt,
  };
}

export function normalizeHarperAddonSettings(value = {}) {
  const defaults = defaultHarperAddonSettings();
  const input = value && typeof value === "object" ? value : {};
  const surfaces = input.surfaces && typeof input.surfaces === "object" ? input.surfaces : {};
  const installedVersion = normalizeOptionalString(input.installedVersion);
  const latestVersion = normalizeOptionalString(input.latestVersion);
  const installed = Boolean(installedVersion);
  const installState = installStates.has(normalizeOptionalString(input.installState))
    ? normalizeOptionalString(input.installState)
    : installed
      ? "ready"
      : "not_installed";
  const download = input.download && typeof input.download === "object"
    ? {
        status: normalizeOptionalString(input.download.status) || (installState === "updating" ? "updating" : "installing"),
        receivedBytes: clampNumber(input.download.receivedBytes, 0, Number.MAX_SAFE_INTEGER, 0),
        totalBytes: clampNumber(input.download.totalBytes, 0, Number.MAX_SAFE_INTEGER, 0),
        startedAt: normalizeOptionalString(input.download.startedAt),
        updatedAt: normalizeOptionalString(input.download.updatedAt) || new Date().toISOString(),
      }
    : null;
  return {
    installed,
    enabled: installed && Boolean(input.enabled),
    autoUpdate: input.autoUpdate !== false,
    defaultAction: input.defaultAction === "polish" ? "polish" : defaults.defaultAction,
    surfaces: {
      scribeSessions: surfaces.scribeSessions !== false,
      inboxDrafts: surfaces.inboxDrafts !== false,
    },
    dialect: supportedDialects.has(normalizeOptionalString(input.dialect))
      ? normalizeOptionalString(input.dialect)
      : defaults.dialect,
    installState,
    installedVersion,
    latestVersion,
    updateAvailable: installed && latestVersion ? compareHarperVersions(latestVersion, installedVersion) > 0 : false,
    lastCheckedAt: normalizeOptionalString(input.lastCheckedAt),
    lastInstalledAt: normalizeOptionalString(input.lastInstalledAt),
    lastError: normalizeOptionalString(input.lastError),
    packageName: harperPackageName,
    registryUrl: harperRegistryUrl,
    projectUrl: harperProjectUrl,
    download: installState === "installing" || installState === "updating" ? download : null,
    updatedAt: normalizeOptionalString(input.updatedAt) || new Date().toISOString(),
  };
}

export function compareHarperVersions(left, right) {
  const [leftCore, leftPre = ""] = normalizeOptionalString(left).split("-", 2);
  const [rightCore, rightPre = ""] = normalizeOptionalString(right).split("-", 2);
  const leftParts = leftCore.split(".").map((part) => Number.parseInt(part || "0", 10));
  const rightParts = rightCore.split(".").map((part) => Number.parseInt(part || "0", 10));
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  if (!leftPre && rightPre) return 1;
  if (leftPre && !rightPre) return -1;
  if (leftPre && rightPre) {
    const prereleaseCompare = leftPre.localeCompare(rightPre, undefined, { numeric: true, sensitivity: "base" });
    if (prereleaseCompare !== 0) return prereleaseCompare > 0 ? 1 : -1;
  }
  return 0;
}

export function applyHarperFinding(text, finding) {
  if (finding.suggestionKind === "insert_after") {
    return `${text.slice(0, finding.end)}${finding.replacementText}${text.slice(finding.end)}`;
  }
  if (finding.suggestionKind === "replace" || finding.suggestionKind === "remove") {
    return `${text.slice(0, finding.start)}${finding.replacementText}${text.slice(finding.end)}`;
  }
  return text;
}

export function createHarperAddonManager({ app, fetchImpl, loadSettings, saveSettings }) {
  let activity = null;
  let installPromise = null;
  let registryCache = null;
  let linterRuntime = {
    version: "",
    dialect: "",
    vocabularySignature: "",
    moduleExports: null,
    binaryExports: null,
    linter: null,
  };

  function harperRoot() {
    return path.join(app.getPath("userData"), "scribes", "addons", "harper");
  }

  function harperVersionsRoot() {
    return path.join(harperRoot(), "versions");
  }

  function harperVersionRoot(version) {
    const normalized = normalizeOptionalString(version);
    if (!normalized || /[\\/]/.test(normalized) || normalized.includes("..")) {
      throw new Error("Unsafe Harper add-on version.");
    }
    return path.join(harperVersionsRoot(), normalized);
  }

  function harperVersionEntryPath(version, relativePath) {
    const target = path.join(harperVersionRoot(version), relativePath);
    assertHarperPathInsideRoot(target);
    return target;
  }

  function assertHarperPathInsideRoot(targetPath) {
    const root = path.resolve(harperRoot());
    const target = path.resolve(targetPath);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Refusing to access a Harper add-on path outside the add-on store.");
    }
  }

  function loadPersistedSettings() {
    return normalizeHarperAddonSettings(loadSettings());
  }

  async function persistSettings(nextValue) {
    const normalized = normalizeHarperAddonSettings(nextValue);
    await saveSettings(normalized);
    return normalized;
  }

  async function clearLinterRuntime() {
    if (linterRuntime.linter && typeof linterRuntime.linter.dispose === "function") {
      await linterRuntime.linter.dispose().catch(() => {});
    }
    linterRuntime = {
      version: "",
      dialect: "",
      vocabularySignature: "",
      moduleExports: null,
      binaryExports: null,
      linter: null,
    };
  }

  async function ensureStorageRoot() {
    await fs.mkdir(harperVersionsRoot(), { recursive: true });
  }

  function installedRuntimeExists(settings) {
    if (!settings.installedVersion) return false;
    return fsSync.existsSync(harperVersionEntryPath(settings.installedVersion, "package.json"))
      && fsSync.existsSync(harperVersionEntryPath(settings.installedVersion, "dist/index.js"))
      && fsSync.existsSync(harperVersionEntryPath(settings.installedVersion, "dist/binaryInlined.js"));
  }

  async function reconcileInstalledState() {
    const current = loadPersistedSettings();
    if (!current.installedVersion || installedRuntimeExists(current)) return current;
    await clearLinterRuntime();
    return persistSettings({
      ...current,
      installed: false,
      enabled: false,
      installState: "not_installed",
      installedVersion: "",
      updateAvailable: false,
      download: null,
      lastError: "Harper add-on files were missing and the local install was reset.",
      updatedAt: new Date().toISOString(),
    });
  }

  function withActivity(settings) {
    const merged = normalizeHarperAddonSettings({
      ...settings,
      ...(activity ? {
        installState: activity.installState,
        download: activity.download || null,
      } : {}),
    });
    if (activity?.lastError) merged.lastError = activity.lastError;
    return merged;
  }

  function shouldRefreshMetadata(settings, forceRefresh) {
    if (forceRefresh) return true;
    if (!settings.lastCheckedAt) return true;
    const lastCheckedAt = Date.parse(settings.lastCheckedAt);
    if (!Number.isFinite(lastCheckedAt)) return true;
    return Date.now() - lastCheckedAt > harperStatusTtlMs;
  }

  async function fetchRegistryRelease({ forceRefresh = false, version } = {}) {
    if (!forceRefresh && registryCache && Date.now() - registryCache.fetchedAt < 5 * 60 * 1000) {
      return resolveRegistryRelease(registryCache.metadata, version);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(harperRegistryUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          accept: "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`Harper registry request failed (${response.status} ${response.statusText || "HTTP error"}).`);
      }
      const metadata = await response.json();
      registryCache = {
        metadata,
        fetchedAt: Date.now(),
      };
      return resolveRegistryRelease(metadata, version);
    } catch (error) {
      throw new Error(error?.name === "AbortError" ? "Harper registry request timed out." : errorMessage(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getStatus({ forceRefresh = false, allowAutoUpdate = true } = {}) {
    const current = await reconcileInstalledState();
    const currentWithActivity = withActivity(current);
    if (activity || installPromise) return currentWithActivity;
    if (!shouldRefreshMetadata(current, forceRefresh)) return currentWithActivity;
    try {
      const release = await fetchRegistryRelease({ forceRefresh });
      const next = await persistSettings({
        ...current,
        installed: installedRuntimeExists(current),
        latestVersion: release.latestVersion,
        updateAvailable: current.installedVersion ? compareHarperVersions(release.latestVersion, current.installedVersion) > 0 : false,
        lastCheckedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      if (allowAutoUpdate && next.autoUpdate && next.installed && next.updateAvailable) {
        try {
          return await installAddon({
            version: release.latestVersion,
            enableAfterInstall: next.enabled,
            automatic: true,
            release,
          });
        } catch {
          return withActivity(loadPersistedSettings());
        }
      }
      return withActivity(next);
    } catch (error) {
      const next = await persistSettings({
        ...current,
        lastCheckedAt: new Date().toISOString(),
        lastError: errorMessage(error),
        updatedAt: new Date().toISOString(),
      });
      return withActivity(next);
    }
  }

  async function installAddon({ version, enableAfterInstall = true, automatic = false, release } = {}) {
    if (installPromise) return installPromise;
    installPromise = doInstallAddon({ version, enableAfterInstall, automatic, release }).finally(() => {
      installPromise = null;
      activity = null;
    });
    return installPromise;
  }

  async function doInstallAddon({ version, enableAfterInstall, automatic, release } = {}) {
    const current = await reconcileInstalledState();
    const resolvedRelease = release || await fetchRegistryRelease({ forceRefresh: true, version });
    const targetVersion = normalizeOptionalString(version) || resolvedRelease.version;
    if (!targetVersion) throw new Error("Harper does not have a latest published package version yet.");
    if (current.installedVersion === targetVersion && installedRuntimeExists(current)) {
      const next = await persistSettings({
        ...current,
        installed: true,
        enabled: current.enabled || Boolean(enableAfterInstall),
        latestVersion: resolvedRelease.latestVersion,
        updateAvailable: compareHarperVersions(resolvedRelease.latestVersion, targetVersion) > 0,
        lastCheckedAt: new Date().toISOString(),
        lastInstalledAt: current.lastInstalledAt || new Date().toISOString(),
        lastError: "",
        installState: "ready",
        download: null,
        updatedAt: new Date().toISOString(),
      });
      return withActivity(next);
    }

    await ensureStorageRoot();
    const previousVersion = current.installedVersion;
    const operation = current.installed ? "updating" : "installing";
    const startedAt = new Date().toISOString();
    activity = {
      installState: operation,
      download: {
        status: operation,
        receivedBytes: 0,
        totalBytes: 0,
        startedAt,
        updatedAt: startedAt,
      },
      lastError: "",
    };
    await persistSettings({
      ...current,
      latestVersion: resolvedRelease.latestVersion,
      installState: operation,
      download: activity.download,
      lastError: "",
      updatedAt: startedAt,
    });

    const stagingDir = path.join(harperVersionsRoot(), `.download-${targetVersion}-${Date.now()}-${crypto.randomUUID()}`);
    assertHarperPathInsideRoot(stagingDir);
    const tempFile = path.join(stagingDir, `${harperPackageName.replace(/[^a-z0-9.-]+/gi, "-")}-${targetVersion}.tgz`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10 * 60_000);
    try {
      await fs.mkdir(stagingDir, { recursive: true });
      const response = await fetchImpl(resolvedRelease.tarballUrl, {
        method: "GET",
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`Harper download failed (${response.status} ${response.statusText || "HTTP error"}).`);
      }
      const totalBytes = Number(response.headers.get("content-length")) || 0;
      if (activity?.download) {
        activity.download.totalBytes = totalBytes;
        activity.download.updatedAt = new Date().toISOString();
      }
      await streamResponseToFile(response, tempFile, controller.signal, (receivedBytes) => {
        if (!activity?.download) return;
        activity.download.receivedBytes = receivedBytes;
        activity.download.totalBytes = totalBytes || activity.download.totalBytes;
        activity.download.updatedAt = new Date().toISOString();
      });
      await verifyDownloadedFile(tempFile, resolvedRelease);
      await assertSafeTarArchive(tempFile);
      await execFileAsync("tar", ["-xzf", tempFile, "-C", stagingDir], {
        timeout: 5 * 60_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      await fs.rm(tempFile, { force: true });
      const extractedRoot = path.join(stagingDir, "package");
      assertHarperPathInsideRoot(extractedRoot);
      await verifyExtractedHarperPackage(extractedRoot, targetVersion);
      const finalRoot = harperVersionRoot(targetVersion);
      await fs.rm(finalRoot, { recursive: true, force: true });
      await fs.rename(extractedRoot, finalRoot);
      await pruneVersions(harperVersionsRoot(), [targetVersion, previousVersion].filter(Boolean));
      if (previousVersion && previousVersion !== targetVersion) {
        await clearLinterRuntime();
      }
      const installedAt = new Date().toISOString();
      const next = await persistSettings({
        ...current,
        installed: true,
        enabled: current.enabled || Boolean(enableAfterInstall),
        installState: "ready",
        installedVersion: targetVersion,
        latestVersion: resolvedRelease.latestVersion,
        updateAvailable: compareHarperVersions(resolvedRelease.latestVersion, targetVersion) > 0,
        lastCheckedAt: installedAt,
        lastInstalledAt: installedAt,
        lastError: "",
        download: null,
        updatedAt: installedAt,
      });
      return withActivity(next);
    } catch (error) {
      const message = automatic
        ? `Harper auto-update failed. ${errorMessage(error)}`
        : errorMessage(error);
      const next = await persistSettings({
        ...current,
        latestVersion: resolvedRelease.latestVersion || current.latestVersion,
        updateAvailable: current.installedVersion ? compareHarperVersions(resolvedRelease.latestVersion || current.latestVersion, current.installedVersion) > 0 : false,
        installState: current.installedVersion ? "ready" : "not_installed",
        download: null,
        lastError: message,
        updatedAt: new Date().toISOString(),
      });
      activity = {
        installState: next.installState,
        download: null,
        lastError: message,
      };
      throw new Error(message);
    } finally {
      clearTimeout(timeout);
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function removeAddon() {
    if (installPromise) {
      throw new Error("Harper is currently installing or updating. Wait for that work to finish before removing it.");
    }
    const current = await reconcileInstalledState();
    activity = {
      installState: "removing",
      download: null,
      lastError: "",
    };
    await persistSettings({
      ...current,
      installState: "removing",
      download: null,
      lastError: "",
      updatedAt: new Date().toISOString(),
    });
    try {
      await clearLinterRuntime();
      await fs.rm(harperRoot(), { recursive: true, force: true });
      const next = await persistSettings({
        ...current,
        installed: false,
        enabled: false,
        installState: "not_installed",
        installedVersion: "",
        updateAvailable: false,
        lastError: "",
        download: null,
        updatedAt: new Date().toISOString(),
      });
      return withActivity(next);
    } finally {
      activity = null;
    }
  }

  async function reviewText(input = {}) {
    const current = await getStatus({ forceRefresh: false, allowAutoUpdate: true });
    if (current.installState === "installing" || current.installState === "updating" || current.installState === "removing") {
      throw new Error("Harper is still preparing the local add-on. Wait for the install or update to finish.");
    }
    if (!current.installed || !current.installedVersion || !installedRuntimeExists(current)) {
      throw new Error("Install Harper before running grammar review.");
    }
    const runtimeSettings = normalizeHarperAddonSettings({
      ...current,
      ...(input.settings && typeof input.settings === "object" ? input.settings : {}),
    });
    const linter = await ensureLinter(runtimeSettings, input.customVocabulary || []);
    const text = String(input.text || "");
    const checkedAt = new Date().toISOString();
    const likelyEnglish = text.trim().length < 32 ? true : await linter.isLikelyEnglish(text).catch(() => true);
    const lints = await linter.lint(text, { language: "plaintext" });
    return {
      findings: lints
        .map((lint, index) => findingFromLint(lint, index, linterRuntime.moduleExports))
        .filter(Boolean),
      warning: likelyEnglish ? "" : "Harper is tuned for English. Review suggestions carefully before applying them.",
      checkedAt,
    };
  }

  async function polishText(input = {}) {
    const review = await reviewText(input);
    const appliedFindings = selectNonOverlappingFindings(review.findings);
    const text = appliedFindings.reduce(
      (current, finding) => applyHarperFinding(current, finding),
      String(input.text || ""),
    );
    return {
      ...review,
      text,
      appliedFindings,
    };
  }

  async function ensureLinter(settings, customVocabulary) {
    if (!settings.installedVersion) {
      throw new Error("Harper is not installed.");
    }
    if (!installedRuntimeExists(settings)) {
      throw new Error("Harper add-on files are missing. Reinstall the add-on.");
    }
    if (!linterRuntime.linter || linterRuntime.version !== settings.installedVersion) {
      await clearLinterRuntime();
      const moduleUrl = pathToFileURL(harperVersionEntryPath(settings.installedVersion, "dist/index.js")).href;
      const binaryUrl = pathToFileURL(harperVersionEntryPath(settings.installedVersion, "dist/binaryInlined.js")).href;
      linterRuntime.moduleExports = await import(moduleUrl);
      linterRuntime.binaryExports = await import(binaryUrl);
      const linter = new linterRuntime.moduleExports.LocalLinter({
        binary: linterRuntime.binaryExports.binaryInlined,
        dialect: dialectFromSetting(settings.dialect, linterRuntime.moduleExports.Dialect),
      });
      await linter.setup();
      linterRuntime.linter = linter;
      linterRuntime.version = settings.installedVersion;
      linterRuntime.dialect = settings.dialect;
      linterRuntime.vocabularySignature = "";
    }
    if (linterRuntime.dialect !== settings.dialect) {
      await linterRuntime.linter.setDialect(dialectFromSetting(settings.dialect, linterRuntime.moduleExports.Dialect));
      linterRuntime.dialect = settings.dialect;
    }
    const vocabulary = normalizeVocabulary(customVocabulary);
    const signature = vocabulary.join("\n");
    if (signature !== linterRuntime.vocabularySignature) {
      await linterRuntime.linter.clearWords();
      if (vocabulary.length > 0) await linterRuntime.linter.importWords(vocabulary);
      linterRuntime.vocabularySignature = signature;
    }
    return linterRuntime.linter;
  }

  return {
    getStatus,
    installAddon,
    removeAddon,
    reviewText,
    polishText,
  };
}

function resolveRegistryRelease(metadata, requestedVersion) {
  const latestVersion = normalizeOptionalString(metadata?.["dist-tags"]?.latest);
  const version = normalizeOptionalString(requestedVersion) || latestVersion;
  if (!latestVersion || !version) {
    throw new Error("Harper npm metadata did not include a latest package version.");
  }
  const versionEntry = metadata?.versions?.[version];
  if (!versionEntry || typeof versionEntry !== "object") {
    throw new Error(`Harper ${version} is not available from npm.`);
  }
  const tarballUrl = normalizeOptionalString(versionEntry.dist?.tarball);
  const integrity = normalizeOptionalString(versionEntry.dist?.integrity);
  const shasum = normalizeOptionalString(versionEntry.dist?.shasum);
  const tarball = new URL(tarballUrl);
  if (tarball.protocol !== "https:") {
    throw new Error("Harper tarball URL must use HTTPS.");
  }
  return {
    packageName: harperPackageName,
    latestVersion,
    version,
    tarballUrl: tarball.toString(),
    integrity,
    shasum,
    publishedAt: normalizeOptionalString(metadata?.time?.[version]),
  };
}

function normalizeVocabulary(words) {
  return [...new Set(
    (Array.isArray(words) ? words : [])
      .map((word) => String(word || "").trim())
      .filter(Boolean),
  )];
}

function dialectFromSetting(dialect, Dialect) {
  if (dialect === "british") return Dialect.British;
  if (dialect === "australian") return Dialect.Australian;
  if (dialect === "canadian") return Dialect.Canadian;
  if (dialect === "indian") return Dialect.Indian;
  return Dialect.American;
}

function findingFromLint(lint, index, moduleExports) {
  const rawSuggestions = lint.suggestions();
  const suggestions = Array.isArray(rawSuggestions) ? rawSuggestions : [];
  const suggestion = suggestions[0] || null;
  if (!suggestion) {
    for (const entry of suggestions) entry.free?.();
    lint.free?.();
    return null;
  }
  const span = lint.span();
  const finding = {
    id: `harper-${index}-${span.start}-${span.end}`,
    message: lint.message(),
    lintKind: lint.lint_kind_pretty() || lint.lint_kind() || "Grammar",
    problemText: lint.get_problem_text(),
    start: span.start,
    end: span.end,
    replacementText: suggestion.get_replacement_text(),
    suggestionKind: suggestion.kind() === moduleExports.SuggestionKind.Replace
      ? "replace"
      : suggestion.kind() === moduleExports.SuggestionKind.Remove
        ? "remove"
        : suggestion.kind() === moduleExports.SuggestionKind.InsertAfter
          ? "insert_after"
          : null,
  };
  span.free?.();
  for (const entry of suggestions) entry.free?.();
  lint.free?.();
  return finding;
}

function selectNonOverlappingFindings(findings) {
  const sorted = [...findings]
    .filter((finding) => finding?.suggestionKind)
    .sort((left, right) => right.start - left.start || right.end - left.end);
  const selected = [];
  let boundary = Number.POSITIVE_INFINITY;
  for (const finding of sorted) {
    if (finding.end > boundary) continue;
    selected.push(finding);
    boundary = finding.start;
  }
  return selected;
}

async function verifyExtractedHarperPackage(extractedRoot, version) {
  const packageJsonPath = path.join(extractedRoot, "package.json");
  const distIndexPath = path.join(extractedRoot, "dist/index.js");
  const distBinaryPath = path.join(extractedRoot, "dist/binaryInlined.js");
  for (const requiredPath of [packageJsonPath, distIndexPath, distBinaryPath]) {
    if (!fsSync.existsSync(requiredPath)) {
      throw new Error(`Harper ${version} is missing ${path.relative(extractedRoot, requiredPath)} after extraction.`);
    }
  }
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  if (normalizeOptionalString(packageJson.name) !== harperPackageName) {
    throw new Error("Downloaded Harper package name did not match the expected npm package.");
  }
  if (normalizeOptionalString(packageJson.version) !== normalizeOptionalString(version)) {
    throw new Error(`Downloaded Harper package version mismatch. Expected ${version}.`);
  }
}

async function verifyDownloadedFile(filePath, release) {
  const fileBuffer = await fs.readFile(filePath);
  const integrityToken = selectIntegrityToken(release.integrity);
  if (integrityToken) {
    const [algorithm, expectedDigest] = integrityToken.split("-", 2);
    const actualDigest = crypto.createHash(algorithm).update(fileBuffer).digest("base64");
    if (actualDigest !== expectedDigest) {
      throw new Error("Downloaded Harper package failed integrity verification.");
    }
    return;
  }
  if (release.shasum) {
    const actualShasum = crypto.createHash("sha1").update(fileBuffer).digest("hex");
    if (actualShasum !== release.shasum) {
      throw new Error("Downloaded Harper package failed checksum verification.");
    }
  }
}

function selectIntegrityToken(integrity) {
  const normalized = normalizeOptionalString(integrity);
  if (!normalized) return "";
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.find((token) => token.startsWith("sha512-"))
    || tokens.find((token) => token.startsWith("sha384-"))
    || tokens[0]
    || "";
}

async function streamResponseToFile(response, targetPath, signal, onProgress) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await new Promise(async (resolve, reject) => {
    const file = fsSync.createWriteStream(targetPath, { flags: "wx" });
    let receivedBytes = 0;
    file.on("error", reject);
    try {
      for await (const chunk of response.body) {
        if (signal.aborted) throw new Error("Download canceled.");
        const buffer = Buffer.from(chunk);
        receivedBytes += buffer.length;
        onProgress?.(receivedBytes);
        if (!file.write(buffer)) {
          await new Promise((drainResolve) => file.once("drain", drainResolve));
        }
      }
      file.end(resolve);
    } catch (error) {
      file.destroy();
      reject(error);
    }
  });
}

async function assertSafeTarArchive(archivePath) {
  const { stdout } = await execFileAsync("tar", ["-tzf", archivePath], {
    timeout: 2 * 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const unsafeEntry = stdout.split(/\r?\n/).find((entry) => {
    const trimmed = entry.trim();
    return trimmed && (!trimmed.startsWith("package/") || path.isAbsolute(trimmed) || trimmed.split(/[\\/]+/).includes(".."));
  });
  if (unsafeEntry) throw new Error(`Harper package archive contains an unsafe path: ${unsafeEntry}`);
}

async function pruneVersions(versionsRoot, keepVersions) {
  const keep = new Set(keepVersions.filter(Boolean));
  const entries = await fs.readdir(versionsRoot, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory()) return;
    if (entry.name.startsWith(".")) return;
    if (keep.has(entry.name)) return;
    await fs.rm(path.join(versionsRoot, entry.name), { recursive: true, force: true });
  }));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeOptionalString(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function errorMessage(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "Unexpected error");
}
