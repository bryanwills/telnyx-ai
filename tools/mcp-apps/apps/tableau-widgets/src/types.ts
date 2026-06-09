export type WidgetChartType = "kpi" | "line" | "bar" | "area";
export type WidgetCategory = "Revenue" | "Operations" | "Product";
export type WidgetValueFormat = "currency" | "number" | "percent";

export interface WidgetChartSpec {
  type: WidgetChartType;
  xField?: string;
  yField: string;
  seriesField?: string;
  metricField?: string;
  metricFormat?: WidgetValueFormat;
}

export interface WidgetAccessPolicy {
  allowedUsers?: string[];
  allowedSquads?: string[];
  deniedUsers?: string[];
}

export interface TableauWidgetDefinition {
  id: string;
  title: string;
  source: "Tableau";
  category: WidgetCategory;
  description: string;
  cadence: string;
  refreshTtlSeconds: number;
  chart: WidgetChartSpec;
  tableau: {
    viewId: string;
    siteContentUrl?: string;
  };
  access: WidgetAccessPolicy;
}

export interface AuthorizedWidgetCatalogItem {
  id: string;
  title: string;
  source: "Tableau";
  category: WidgetCategory;
  description: string;
  cadence: string;
  refreshTtlSeconds: number;
  chart: WidgetChartSpec;
}

export interface TableauIdentity {
  userId: string;
  email: string;
  squads: string[];
  displayName?: string;
}

export interface TableauWidgetRow {
  [field: string]: string | number | null;
}

export interface WidgetDataResult {
  widgetId: string;
  source: "Tableau";
  status: "ready";
  updatedAt: string;
  columns: string[];
  rows: TableauWidgetRow[];
  metric: string;
  trend: string;
}

export interface TableauWidgetClient {
  assertViewAccess(widget: TableauWidgetDefinition, identity: TableauIdentity): Promise<{ status?: number }>;
  queryViewData(widget: TableauWidgetDefinition, identity: TableauIdentity): Promise<{ csv: string; status?: number }>;
}

export interface IdentityResolver {
  resolve(token: string): Promise<TableauIdentity | undefined>;
}

export interface AccessAuditEvent {
  at: string;
  widgetId: string;
  userId?: string;
  emailHash?: string;
  squads?: string[];
  decision: "allow" | "deny";
  reason: string;
  tableauStatus?: number;
}

export interface AccessAuditLogger {
  record(event: AccessAuditEvent): void | Promise<void>;
}
