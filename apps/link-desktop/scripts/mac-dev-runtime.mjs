import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const macDevBundleName = "Telnyx Cloud Link.app";
const macDevRuntimeDirName = ".dev-runtime";
const macDevExecutableName = "Electron";
const macDevAppDirName = "app";

async function setPlistValue(infoPlistPath, key, type, value) {
  const plistValue = String(value).replace(/"/g, '\\"');
  try {
    await execFileAsync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${plistValue}`, infoPlistPath]);
  } catch {
    await execFileAsync("/usr/libexec/PlistBuddy", ["-c", `Add :${key} ${type} ${plistValue}`, infoPlistPath]);
  }
}

async function writeMacDevAppBootstrap(appDir, bundleResourcesPath) {
  const bootstrapDir = path.join(bundleResourcesPath, macDevAppDirName);
  const mainEntryPath = path.join(appDir, "src/main/main.js");
  const rendererEntryPath = path.join(appDir, "dist/renderer/index.html");
  const mainEntryUrl = pathToFileURL(mainEntryPath).href;
  const bootstrapPackageJson = {
    name: "link",
    productName: "Cloud Link",
    version: "0.1.0-dev",
    private: true,
    type: "module",
    main: "index.mjs",
  };
  const bootstrapScript = `import process from "node:process";

process.env.LINK_DESKTOP_RENDERER ??= ${JSON.stringify(rendererEntryPath)};
await import(${JSON.stringify(mainEntryUrl)});
`;

  await fs.rm(bootstrapDir, { recursive: true, force: true });
  await fs.mkdir(bootstrapDir, { recursive: true });
  await fs.writeFile(path.join(bootstrapDir, "package.json"), `${JSON.stringify(bootstrapPackageJson, null, 2)}\n`);
  await fs.writeFile(path.join(bootstrapDir, "index.mjs"), bootstrapScript);
}

async function codesignIfAvailable(bundlePath) {
  try {
    await execFileAsync("/usr/bin/codesign", ["--force", "--sign", "-", bundlePath]);
  } catch (error) {
    console.warn(`codesign skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function prepareMacDevRuntime(appDir) {
  if (process.platform !== "darwin") {
    return {
      executablePath: path.join(appDir, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"),
    };
  }

  const macDevBundleRoot = path.join(appDir, macDevRuntimeDirName);
  const sourceBundlePath = path.join(appDir, "node_modules/electron/dist/Electron.app");
  const bundlePath = path.join(macDevBundleRoot, macDevBundleName);
  const executablePath = path.join(bundlePath, "Contents", "MacOS", macDevExecutableName);
  const bundleResourcesPath = path.join(bundlePath, "Contents", "Resources");
  const infoPlistPath = path.join(bundlePath, "Contents", "Info.plist");
  const iconSourcePath = path.join(appDir, "public", "link-icon.icns");

  await fs.rm(bundlePath, { recursive: true, force: true });
  await fs.mkdir(macDevBundleRoot, { recursive: true });
  await execFileAsync("/usr/bin/ditto", [sourceBundlePath, bundlePath]);
  await writeMacDevAppBootstrap(appDir, bundleResourcesPath);
  await fs.copyFile(iconSourcePath, path.join(bundleResourcesPath, "electron.icns"));
  await setPlistValue(infoPlistPath, "CFBundleName", "string", "Cloud Link");
  await setPlistValue(infoPlistPath, "CFBundleDisplayName", "string", "Cloud Link");
  await setPlistValue(infoPlistPath, "CFBundleIdentifier", "string", "io.telnyx.link.dev");
  await setPlistValue(infoPlistPath, "CFBundleIconFile", "string", "electron.icns");
  await codesignIfAvailable(bundlePath);

  return { bundlePath, executablePath };
}
