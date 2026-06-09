# Telnyx Tableau Widgets

Strict-access MCP app for standardized Link widgets backed by Tableau view data.

## Scope

Read tools:

- `tableau_widgets_catalog` lists only widgets the current user may see.
- `tableau_widget_data` returns normalized rows for one authorized widget.

## Access model

Access is an intersection:

- ACP identity must resolve from the request token.
- ACP must provide a verified user id, Okta email, and at least one squad.
- The widget manifest must explicitly allow the user or one of their squads.
- The Tableau REST API must authorize the same Okta email for the target view.

The service denies by default. Unauthorized users do not receive widget titles,
descriptions, Tableau view ids, workbook names, Tableau URLs, or detailed Tableau
errors.

## Environment

Required for live Tableau reads:

- `TABLEAU_BASE_URL`
- `TABLEAU_SITE_CONTENT_URL`
- `TABLEAU_CONNECTED_APP_CLIENT_ID`
- `TABLEAU_CONNECTED_APP_SECRET_ID`
- `TABLEAU_CONNECTED_APP_SECRET_VALUE`
- `TABLEAU_WIDGETS_ACP_IDENTITY_URL`

Optional:

- `TABLEAU_WIDGETS_MANIFEST_JSON` with `{ "widgets": [...] }`
- `TABLEAU_API_VERSION`, defaults to `3.22`
- `TABLEAU_WIDGETS_CACHE_TTL_MS`, defaults to `300000`

## Development

From `tools/mcp-apps`:

```bash
npm install
npm test --workspace @telnyx-mcp-apps/tableau-widgets
npm run typecheck --workspace @telnyx-mcp-apps/tableau-widgets
npm run build --workspace @telnyx-mcp-apps/tableau-widgets
```
