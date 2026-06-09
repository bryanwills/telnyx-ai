import type { TableauWidgetDefinition } from "./types.js";

export const DEFAULT_TABLEAU_WIDGET_MANIFEST: TableauWidgetDefinition[] = [
  {
    id: "tableau-revenue-pipeline",
    title: "Revenue pipeline",
    source: "Tableau",
    category: "Revenue",
    description: "Pipeline health, commit coverage, and quarter-to-date bookings.",
    cadence: "Refreshes hourly",
    refreshTtlSeconds: 300,
    chart: { type: "bar", xField: "stage", yField: "amount", metricField: "amount", metricFormat: "currency" },
    tableau: { viewId: "tableau_view_revenue_pipeline" },
    access: { allowedSquads: ["revops.squad", "sales.squad"], deniedUsers: [] }
  },
  {
    id: "tableau-support-volume",
    title: "Support volume",
    source: "Tableau",
    category: "Operations",
    description: "Ticket volume, backlog, escalation mix, and response-time trend.",
    cadence: "Refreshes daily",
    refreshTtlSeconds: 900,
    chart: { type: "line", xField: "day", yField: "tickets", metricField: "tickets", metricFormat: "number" },
    tableau: { viewId: "tableau_view_support_volume" },
    access: { allowedSquads: ["support.squad", "customer-ops.squad"], deniedUsers: [] }
  },
  {
    id: "tableau-product-adoption",
    title: "Product adoption",
    source: "Tableau",
    category: "Product",
    description: "Weekly active accounts, product mix, and activation funnel movement.",
    cadence: "Refreshes daily",
    refreshTtlSeconds: 900,
    chart: { type: "area", xField: "week", yField: "active_accounts", metricField: "active_accounts", metricFormat: "number" },
    tableau: { viewId: "tableau_view_product_adoption" },
    access: { allowedSquads: ["product-platform.squad", "growth.squad"], deniedUsers: [] }
  }
];

export function loadManifestFromEnvironment(env: NodeJS.ProcessEnv = process.env): TableauWidgetDefinition[] {
  const raw = env.TABLEAU_WIDGETS_MANIFEST_JSON;
  if (!raw) return DEFAULT_TABLEAU_WIDGET_MANIFEST;

  const parsed = JSON.parse(raw) as { widgets?: TableauWidgetDefinition[] } | TableauWidgetDefinition[];
  const widgets = Array.isArray(parsed) ? parsed : parsed.widgets;
  if (!Array.isArray(widgets)) {
    throw new Error("TABLEAU_WIDGETS_MANIFEST_JSON must be an array or an object with widgets[].");
  }
  return widgets.map(normalizeManifestWidget);
}

function normalizeManifestWidget(widget: TableauWidgetDefinition): TableauWidgetDefinition {
  if (!widget?.id || !widget.title || !widget.tableau?.viewId || !widget.chart?.yField) {
    throw new Error("Each Tableau widget manifest entry requires id, title, tableau.viewId, and chart.yField.");
  }
  return {
    ...widget,
    source: "Tableau",
    refreshTtlSeconds: positiveNumber(widget.refreshTtlSeconds, 300),
    access: widget.access ?? {}
  };
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
