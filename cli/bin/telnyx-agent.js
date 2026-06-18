#!/usr/bin/env node
/**
 * telnyx-agent — Agent-friendly CLI for Telnyx API v2.
 * Composite commands that reduce multi-step workflows to a single command.
 */

import "tsx";

const { run } = await import("../src/index.ts");

run(process.argv.slice(2)).catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
