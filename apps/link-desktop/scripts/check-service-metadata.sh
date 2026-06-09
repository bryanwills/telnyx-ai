#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
METATOOL_URL="${METATOOL_URL:-http://infra-svc-metatool.query.consul:8080}"

if [[ -f "$APP_DIR/meta-prod.yml" ]]; then
  curl --silent --show-error \
    "$METATOOL_URL?action=check" \
    -F "metadev=@$APP_DIR/meta-dev.yml" \
    -F "metaprod=@$APP_DIR/meta-prod.yml"
else
  curl --silent --show-error \
    "$METATOOL_URL?action=check" \
    -F "metadev=@$APP_DIR/meta-dev.yml"
fi
