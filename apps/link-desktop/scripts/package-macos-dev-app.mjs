import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

function plistXml({
  bundleDisplayName,
  bundleExecutable,
  bundleIdentifier,
  bundleIconFile,
  version,
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${bundleDisplayName}</string>
  <key>CFBundleExecutable</key>
  <string>${bundleExecutable}</string>
  <key>CFBundleIconFile</key>
  <string>${bundleIconFile}</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleIdentifier}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${bundleDisplayName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${version}</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.productivity</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
}

function launcherSource({ appDir }) {
  const escapedAppDir = JSON.stringify(appDir);
  return `#include <errno.h>
#include <libgen.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(void) {
  const char *appDir = ${escapedAppDir};
  uint32_t executablePathSize = PATH_MAX;
  char executablePath[PATH_MAX];
  if (_NSGetExecutablePath(executablePath, &executablePathSize) != 0) {
    fprintf(stderr, "Unable to resolve launcher path.\\n");
    return 1;
  }

  char resolvedExecutablePath[PATH_MAX];
  if (realpath(executablePath, resolvedExecutablePath) == NULL) {
    perror("realpath");
    return 1;
  }

  char macOsDirBuffer[PATH_MAX];
  strncpy(macOsDirBuffer, resolvedExecutablePath, sizeof(macOsDirBuffer) - 1);
  macOsDirBuffer[sizeof(macOsDirBuffer) - 1] = '\\0';
  char *macOsDir = dirname(macOsDirBuffer);

  char nestedElectronExecutablePath[PATH_MAX];
  snprintf(
    nestedElectronExecutablePath,
    sizeof(nestedElectronExecutablePath),
    "%s/../Resources/Electron.app/Contents/MacOS/Electron",
    macOsDir
  );

  if (access(nestedElectronExecutablePath, X_OK) != 0) {
    perror("nested electron access");
    fprintf(stderr, "Expected Electron executable at %s\\n", nestedElectronExecutablePath);
    return 1;
  }

  char *const argv[] = {
    nestedElectronExecutablePath,
    (char *)appDir,
    NULL,
  };
  execv(nestedElectronExecutablePath, argv);
  perror("execv");
  return errno == 0 ? 1 : errno;
}
`;
}

async function removeIfExists(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function codesignIfAvailable(bundlePath, extraArgs = []) {
  try {
    await execFileAsync("/usr/bin/codesign", ["--force", "--sign", "-", ...extraArgs, bundlePath]);
  } catch (error) {
    console.warn(`codesign skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function setNestedElectronBranding(bundledElectronPath, iconSourcePath) {
  const infoPlistPath = path.join(bundledElectronPath, "Contents", "Info.plist");
  const resourcesPath = path.join(bundledElectronPath, "Contents", "Resources");
  await fs.copyFile(iconSourcePath, path.join(resourcesPath, "electron.icns"));
  await execFileAsync("/usr/libexec/PlistBuddy", ["-c", "Set :CFBundleName Cloud Link", infoPlistPath]);
  await execFileAsync("/usr/libexec/PlistBuddy", ["-c", "Set :CFBundleDisplayName Cloud Link", infoPlistPath]);
  await execFileAsync("/usr/libexec/PlistBuddy", ["-c", "Set :CFBundleIdentifier io.telnyx.link.runtime", infoPlistPath]);
  await execFileAsync("/usr/libexec/PlistBuddy", ["-c", "Set :CFBundleIconFile electron.icns", infoPlistPath]);
}

export async function packageMacosDevApp(appDir, options = {}) {
  if (process.platform !== "darwin") {
    throw new Error("packageMacosDevApp is only supported on macOS.");
  }

  const bundleName = options.bundleName || "Telnyx Cloud Link.app";
  const repoRoot = path.resolve(appDir, "../..");
  const bundlePath = path.resolve(options.bundlePath || path.join(repoRoot, bundleName));
  const compatibilityBundlePath = path.join(appDir, ".dev-runtime", bundleName);
  const contentsPath = path.join(bundlePath, "Contents");
  const macOsPath = path.join(contentsPath, "MacOS");
  const resourcesPath = path.join(contentsPath, "Resources");
  const launcherPath = path.join(macOsPath, "Telnyx Cloud Link");
  const sourcePath = path.join(appDir, "scripts", ".link-launcher.c");
  const sourceElectronBundlePath = path.join(appDir, "node_modules", "electron", "dist", "Electron.app");
  const bundledElectronPath = path.join(resourcesPath, "Electron.app");
  const iconSourcePath = path.join(appDir, "public", "link-icon.icns");
  const packageJsonPath = path.join(appDir, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  const version = packageJson.version || "0.1.0";

  await removeIfExists(bundlePath);
  await fs.mkdir(macOsPath, { recursive: true });
  await fs.mkdir(resourcesPath, { recursive: true });

  await fs.copyFile(iconSourcePath, path.join(resourcesPath, "link-icon.icns"));
  await fs.writeFile(
    path.join(contentsPath, "Info.plist"),
    plistXml({
      bundleDisplayName: "Cloud Link",
      bundleExecutable: "Telnyx Cloud Link",
      bundleIdentifier: "io.telnyx.link.devlauncher",
      bundleIconFile: "link-icon.icns",
      version,
    }),
    "utf8",
  );
  await fs.writeFile(path.join(contentsPath, "PkgInfo"), "APPL????", "utf8");

  await execFileAsync("/usr/bin/ditto", [sourceElectronBundlePath, bundledElectronPath]);
  await setNestedElectronBranding(bundledElectronPath, iconSourcePath);
  await codesignIfAvailable(bundledElectronPath, ["--deep"]);
  await fs.writeFile(sourcePath, launcherSource({ appDir }), "utf8");
  await execFileAsync("/usr/bin/clang", [
    "-Os",
    "-Wall",
    "-Wextra",
    "-o",
    launcherPath,
    sourcePath,
  ]);
  await fs.chmod(launcherPath, 0o755);
  await removeIfExists(sourcePath);
  await codesignIfAvailable(bundlePath, ["--deep"]);
  await removeIfExists(compatibilityBundlePath);
  await fs.mkdir(path.dirname(compatibilityBundlePath), { recursive: true });
  await execFileAsync("/usr/bin/ditto", [bundlePath, compatibilityBundlePath]);
  return { bundlePath, launcherPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const appDir = process.cwd();
  const result = await packageMacosDevApp(appDir);
  process.stdout.write(result.bundlePath);
}
