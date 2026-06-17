#!/usr/bin/env bash
# build-app.sh – Build TelnyxDictation and package into a .app bundle.
set -euo pipefail

PRODUCT_NAME="TelnyxDictation"
CONFIGURATION="${1:-release}"
BUILD_DIR=".build/${CONFIGURATION}"
APP_BUNDLE="Telnyx Link.app"
LEGACY_APP_BUNDLE="${PRODUCT_NAME}.app"
CONTENTS_DIR="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"

echo "▸ Building ${PRODUCT_NAME} (${CONFIGURATION})…"
swift build -c "$CONFIGURATION"

echo "▸ Assembling ${APP_BUNDLE}…"
rm -rf "$APP_BUNDLE" "$LEGACY_APP_BUNDLE"
mkdir -p "$MACOS_DIR"

# Copy executable
cp "${BUILD_DIR}/${PRODUCT_NAME}" "${MACOS_DIR}/"

# Copy and fix Info.plist
cp SupportingFiles/Info.plist "${CONTENTS_DIR}/Info.plist"

# Ad-hoc codesign with audio-input entitlement (required for mic access on macOS 14+)
ENTITLEMENTS="SupportingFiles/TelnyxDictation.entitlements"
if [ -f "$ENTITLEMENTS" ]; then
    echo "▸ Codesigning with entitlements…"
    codesign --force --sign - --identifier com.telnyx.dictation --entitlements "$ENTITLEMENTS" "${MACOS_DIR}/${PRODUCT_NAME}"
fi

echo "✓ ${APP_BUNDLE} ready."
echo "  Run with: open ${APP_BUNDLE}"
