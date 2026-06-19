#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/link-desktop"
SOURCE_APP_BUNDLE="$APP_DIR/node_modules/electron/dist/Electron.app"
MAIN_EXECUTABLE="$APP_DIR/node_modules/.bin/electron"
MAIN_PROCESS_PATTERN="$APP_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
MAIN_SCRIPT_PATTERN="$APP_DIR/src/main/main.js"
ENV_FILE="$APP_DIR/.env.local"
PUBLIC_DIR="$APP_DIR/public"
APP_ICON_ICNS="$PUBLIC_DIR/link-icon.icns"
APP_ICON_PNG="$PUBLIC_DIR/link-icon.png"
APP_FAVICON_PNG="$PUBLIC_DIR/link-favicon.png"
DEV_APP_BUNDLE="$ROOT_DIR/Telnyx Cloud Link.app"
DEV_APP_EXECUTABLE="$DEV_APP_BUNDLE/Contents/MacOS/Telnyx Cloud Link"
NESTED_ELECTRON_EXECUTABLE="$DEV_APP_BUNDLE/Contents/Resources/Electron.app/Contents/MacOS/Electron"
LEGACY_DEV_APP_EXECUTABLE="$ROOT_DIR/Link.app/Contents/MacOS/Link"
LEGACY_NESTED_ELECTRON_EXECUTABLE="$ROOT_DIR/Link.app/Contents/Resources/Electron.app/Contents/MacOS/Electron"

configure_node_path() {
  local candidate
  local node_bin_candidates=()
  shopt -s nullglob
  node_bin_candidates+=(
    "${NVM_BIN:-}"
    "$HOME/.nvm/versions/node"/*/bin
    "$HOME/.volta/bin"
    "$HOME/.fnm/node-versions"/*/installation/bin
    "/opt/homebrew/bin"
    "/usr/local/bin"
    "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  )
  shopt -u nullglob

  for candidate in "${node_bin_candidates[@]}"; do
    if [[ -n "$candidate" && -x "$candidate/npm" ]]; then
      PATH="$candidate:$PATH"
      export PATH
      return
    fi
  done

  if ! command -v npm >/dev/null 2>&1; then
    echo "npm was not found. Install Node.js 20+ or set NVM_BIN/PATH before running $0." >&2
    exit 127
  fi
}

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
}

stop_existing() {
  local pids remaining
  pids="$(
    {
      pgrep -f "$MAIN_PROCESS_PATTERN" || true
      pgrep -f "$MAIN_SCRIPT_PATTERN" || true
      pgrep -f "$DEV_APP_EXECUTABLE" || true
      pgrep -f "$NESTED_ELECTRON_EXECUTABLE" || true
      pgrep -f "$LEGACY_DEV_APP_EXECUTABLE" || true
      pgrep -f "$LEGACY_NESTED_ELECTRON_EXECUTABLE" || true
    } | sort -u
  )"
  if [[ -n "$pids" ]]; then
    kill -TERM $pids
    for _ in {1..20}; do
      remaining="$(
        {
          pgrep -f "$MAIN_PROCESS_PATTERN" || true
          pgrep -f "$MAIN_SCRIPT_PATTERN" || true
          pgrep -f "$DEV_APP_EXECUTABLE" || true
          pgrep -f "$NESTED_ELECTRON_EXECUTABLE" || true
          pgrep -f "$LEGACY_DEV_APP_EXECUTABLE" || true
          pgrep -f "$LEGACY_NESTED_ELECTRON_EXECUTABLE" || true
        } | sort -u
      )"
      if [[ -z "$remaining" ]]; then
        return
      fi
      sleep 0.25
    done
    kill -KILL $remaining 2>/dev/null || true
  fi
}

build_app() {
  npm --prefix "$ROOT_DIR/tools/link" run build
  npm --prefix "$APP_DIR" run build
}

prepare_dev_runtime() {
  if [[ "$OSTYPE" != darwin* ]]; then
    return
  fi

  DEV_APP_BUNDLE="$(
    cd "$APP_DIR" && node --input-type=module -e 'import("./scripts/package-macos-dev-app.mjs").then(async ({ packageMacosDevApp }) => { const runtime = await packageMacosDevApp(process.cwd()); process.stdout.write(runtime.bundlePath); })'
  )"
  DEV_APP_EXECUTABLE="$DEV_APP_BUNDLE/Contents/MacOS/Telnyx Cloud Link"
  NESTED_ELECTRON_EXECUTABLE="$DEV_APP_BUNDLE/Contents/Resources/Electron.app/Contents/MacOS/Electron"
  MAIN_EXECUTABLE="$DEV_APP_EXECUTABLE"
  MAIN_PROCESS_PATTERN="$NESTED_ELECTRON_EXECUTABLE"
}

sync_source_bundle_branding() {
  if [[ -f "$APP_ICON_ICNS" ]]; then
    cp "$APP_ICON_ICNS" "$SOURCE_APP_BUNDLE/Contents/Resources/link-icon.icns"
    cp "$APP_ICON_ICNS" "$SOURCE_APP_BUNDLE/Contents/Resources/electron.icns"
  fi
  if [[ -f "$APP_ICON_PNG" ]]; then
    cp "$APP_ICON_PNG" "$SOURCE_APP_BUNDLE/Contents/Resources/link-icon.png"
  fi
  if [[ -f "$APP_FAVICON_PNG" ]]; then
    cp "$APP_FAVICON_PNG" "$SOURCE_APP_BUNDLE/Contents/Resources/link-favicon.png"
  fi
  /usr/libexec/PlistBuddy -c "Set :CFBundleName Cloud Link" "$SOURCE_APP_BUNDLE/Contents/Info.plist" >/dev/null
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Cloud Link" "$SOURCE_APP_BUNDLE/Contents/Info.plist" >/dev/null
  /usr/libexec/PlistBuddy -c "Set :CFBundleIconFile link-icon.icns" "$SOURCE_APP_BUNDLE/Contents/Info.plist" >/dev/null
  /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier io.telnyx.link.dev" "$SOURCE_APP_BUNDLE/Contents/Info.plist" >/dev/null
}

prepare_launcher_branding() {
  if [[ "$OSTYPE" == darwin* ]]; then
    prepare_dev_runtime
  else
    sync_source_bundle_branding
  fi
}

run_app() {
  prepare_launcher_branding
  cd "$APP_DIR"
  if [[ "$OSTYPE" == darwin* ]]; then
    open -W -n "$DEV_APP_BUNDLE"
  else
    LINK_DESKTOP_RENDERER=dist/renderer/index.html "$MAIN_EXECUTABLE" src/main/main.js
  fi
}

launch_app() {
  prepare_launcher_branding
  cd "$APP_DIR"
  if [[ "$OSTYPE" == darwin* ]]; then
    open -n "$DEV_APP_BUNDLE"
  else
    LINK_DESKTOP_RENDERER=dist/renderer/index.html "$MAIN_EXECUTABLE" src/main/main.js &
  fi
}

stop_existing
load_env
configure_node_path
build_app

case "$MODE" in
  run)
    run_app
    ;;
  --debug|debug)
    prepare_launcher_branding
    cd "$APP_DIR"
    if [[ "$OSTYPE" == darwin* ]]; then
      lldb -- "$MAIN_EXECUTABLE"
    else
      lldb -- "$MAIN_EXECUTABLE" src/main/main.js
    fi
    ;;
  --logs|logs|--telemetry|telemetry)
    launch_app
    /usr/bin/log stream --info --style compact --predicate 'process == "Telnyx Cloud Link" || process == "Link" || process == "Electron"'
    ;;
  --verify|verify)
    launch_app
    sleep 3
    pgrep -f "$MAIN_PROCESS_PATTERN" >/dev/null
    stop_existing
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
