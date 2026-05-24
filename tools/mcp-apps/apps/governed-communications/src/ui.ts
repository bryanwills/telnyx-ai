export const GOVERNED_COMMUNICATIONS_UI_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Governed Communications</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --panel: #fffaf2;
        --ink: #1e2430;
        --muted: #616a77;
        --line: #dccfb7;
        --accent: #bb5a2a;
      }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, sans-serif;
        background:
          radial-gradient(circle at top right, rgba(187, 90, 42, 0.12), transparent 34%),
          linear-gradient(180deg, #f7f2ea 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }
      .hero, .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: 0 18px 36px rgba(33, 32, 28, 0.08);
      }
      .hero {
        padding: 28px;
        margin-bottom: 18px;
      }
      h1, h2 { margin: 0 0 8px; }
      p { color: var(--muted); line-height: 1.5; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
      }
      .panel {
        padding: 18px;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 0.92em;
      }
      ul { margin: 10px 0 0; padding-left: 18px; }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Governed Communications</h1>
        <p>
          Bounded outbound messaging, call start, verification, and status follow-up with selector allowlists,
          redaction, and idempotent mutation replay.
        </p>
      </section>
      <section class="grid">
        <article class="panel">
          <h2>Mutating tools</h2>
          <ul>
            <li><code>communications_send_message</code></li>
            <li><code>communications_start_call</code></li>
            <li><code>communications_start_verification</code></li>
          </ul>
        </article>
        <article class="panel">
          <h2>Read-first tools</h2>
          <ul>
            <li><code>communications_get_message_status</code></li>
            <li><code>communications_get_call_status</code></li>
            <li><code>communications_get_call_timeline</code></li>
            <li><code>communications_get_verification_status</code></li>
            <li><code>communications_list_owned_senders</code></li>
          </ul>
        </article>
        <article class="panel">
          <h2>Runtime contract</h2>
          <ul>
            <li>Caller-supplied <code>idempotency_key</code> required on mutations</li>
            <li>Server-side sender, profile, and connection allowlists</li>
            <li>Model-visible output redacts phone numbers and message bodies</li>
          </ul>
        </article>
      </section>
    </main>
  </body>
</html>`;
