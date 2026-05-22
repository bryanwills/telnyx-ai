# Publish secret scan suppressions

Use `secret-scan: ignore reason=<why>` on the same line as an intentionally fake fixture or placeholder that must remain in a publish surface.

Rules:
- Only suppress synthetic test material or documented placeholders.
- Include a human-readable `reason=...` so triage consumers know why the finding is safe.
- Suppressed findings remain in the JSON report with suppression metadata, but they do not count as blocking findings.
