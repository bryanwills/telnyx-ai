#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/link-desktop"
APP_NAME="Electron"
MAIN_PROCESS_PATTERN="$APP_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
ENV_FILE="$APP_DIR/.env.local"

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
  local pids
  pids="$(pgrep -f "$MAIN_PROCESS_PATTERN" || true)"
  if [[ -n "$pids" ]]; then
    kill -TERM $pids
  fi
}

build_app() {
  npm --prefix "$ROOT_DIR/tools/link" run build
  npm --prefix "$APP_DIR" run build
}

run_app() {
  cd "$APP_DIR"
  LINK_DESKTOP_RENDERER=dist/renderer/index.html "$APP_DIR/node_modules/.bin/electron" src/main/main.js
}

launch_app() {
  cd "$APP_DIR"
  LINK_DESKTOP_RENDERER=dist/renderer/index.html "$APP_DIR/node_modules/.bin/electron" src/main/main.js &
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
    cd "$APP_DIR"
    lldb -- "$APP_DIR/node_modules/.bin/electron" src/main/main.js
    ;;
  --logs|logs|--telemetry|telemetry)
    launch_app
    /usr/bin/log stream --info --style compact --predicate 'process == "Electron"'
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
