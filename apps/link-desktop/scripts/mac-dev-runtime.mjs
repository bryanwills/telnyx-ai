import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const macDevBundleRoot = path.join(tmpdir(), "telnyx-link-desktop-dev");
const macDevBundleName = "Link.app";
const macDevExecutableName = "Link";
const macDevBundleId = "io.telnyx.link.dev";
const macDevIconName = "link-icon.icns";

export const macDevExecutablePath = path.join(
  macDevBundleRoot,
  macDevBundleName,
  "Contents",
  "MacOS",
  macDevExecutableName,
);

async function copyIfPresent(sourcePath, targetPath) {
  try {
    await fs.copyFile(sourcePath, targetPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function setPlistValue(infoPlistPath, key, type, value) {
  const plistValue = String(value).replace(/"/g, '\\"');
  try {
    await execFileAsync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${plistValue}`, infoPlistPath]);
  } catch {
    await execFileAsync("/usr/libexec/PlistBuddy", ["-c", `Add :${key} ${type} ${plistValue}`, infoPlistPath]);
  }
}

export async function prepareMacDevRuntime(appDir) {
  if (process.platform !== "darwin") {
    return {
      executablePath: path.join(appDir, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"),
    };
  }

  const sourceBundlePath = path.join(appDir, "node_modules/electron/dist/Electron.app");
  const bundlePath = path.join(macDevBundleRoot, macDevBundleName);
  const executablePath = path.join(bundlePath, "Contents", "MacOS", macDevExecutableName);
  const originalExecutablePath = path.join(bundlePath, "Contents", "MacOS", "Electron");
  const infoPlistPath = path.join(bundlePath, "Contents", "Info.plist");
  const sourceIconPath = path.join(appDir, "public", macDevIconName);
  const sourceIconPngPath = path.join(appDir, "public", "link-icon.png");
  const sourceFaviconPath = path.join(appDir, "public", "link-favicon.png");
  const bundleResourcesPath = path.join(bundlePath, "Contents", "Resources");

  await fs.rm(bundlePath, { recursive: true, force: true });
  await fs.mkdir(macDevBundleRoot, { recursive: true });
  await fs.cp(sourceBundlePath, bundlePath, { recursive: true });
  await fs.rename(originalExecutablePath, executablePath);
  await copyIfPresent(sourceIconPath, path.join(bundleResourcesPath, macDevIconName));
  await copyIfPresent(sourceIconPath, path.join(bundleResourcesPath, "electron.icns"));
  await copyIfPresent(sourceIconPngPath, path.join(bundleResourcesPath, "link-icon.png"));
  await copyIfPresent(sourceFaviconPath, path.join(bundleResourcesPath, "link-favicon.png"));
  await setPlistValue(infoPlistPath, "CFBundleExecutable", "string", macDevExecutableName);
  await setPlistValue(infoPlistPath, "CFBundleName", "string", "Link");
  await setPlistValue(infoPlistPath, "CFBundleDisplayName", "string", "Link");
  await setPlistValue(infoPlistPath, "CFBundleIconFile", "string", macDevIconName);
  await setPlistValue(infoPlistPath, "CFBundleIdentifier", "string", macDevBundleId);

  return { executablePath };
}
