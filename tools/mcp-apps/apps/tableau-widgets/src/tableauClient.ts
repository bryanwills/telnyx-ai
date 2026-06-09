import { createHmac, randomUUID } from "node:crypto";

import type { TableauIdentity, TableauWidgetDefinition, TableauWidgetRow, WidgetDataResult } from "./types.js";

export class TableauWidgetError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "TableauWidgetError";
  }
}

export interface TableauRestClientOptions {
  baseUrl: string;
  apiVersion?: string;
  siteContentUrl: string;
  connectedAppClientId: string;
  connectedAppSecretId: string;
  connectedAppSecretValue: string;
  fetch?: typeof fetch;
  now?: () => Date;
}

interface TableauSession {
  token: string;
  siteId: string;
}

const DEFAULT_SCOPES = ["tableau:content:read", "tableau:views:download"];

export class TableauRestClient {
  private readonly fetchImpl: typeof fetch;
  private readonly apiVersion: string;
  private readonly now: () => Date;
  private readonly baseUrl: string;

  constructor(private readonly options: TableauRestClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.apiVersion = options.apiVersion ?? "3.22";
    this.now = options.now ?? (() => new Date());
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
  }

  async assertViewAccess(widget: TableauWidgetDefinition, identity: TableauIdentity): Promise<{ status?: number }> {
    const session = await this.signIn(identity.email, ["tableau:content:read"]);
    const response = await this.fetchImpl(this.apiUrl(session.siteId, `/views/${encodeURIComponent(widget.tableau.viewId)}`), {
      method: "GET",
      headers: this.tableauHeaders(session)
    });
    if (!response.ok) throw await this.errorFromResponse(response);
    return { status: response.status };
  }

  async queryViewData(widget: TableauWidgetDefinition, identity: TableauIdentity): Promise<{ csv: string; status?: number }> {
    const session = await this.signIn(identity.email, DEFAULT_SCOPES);
    const response = await this.fetchImpl(this.apiUrl(session.siteId, `/views/${encodeURIComponent(widget.tableau.viewId)}/data`), {
      method: "GET",
      headers: { ...this.tableauHeaders(session), Accept: "text/csv" }
    });
    if (!response.ok) throw await this.errorFromResponse(response);
    return { csv: await response.text(), status: response.status };
  }

  private async signIn(email: string, scopes: string[]): Promise<TableauSession> {
    const jwt = createConnectedAppJwt({
      clientId: this.options.connectedAppClientId,
      secretId: this.options.connectedAppSecretId,
      secretValue: this.options.connectedAppSecretValue,
      subject: email,
      scopes,
      now: this.now
    });
    const response = await this.fetchImpl(`${this.baseUrl}/api/${this.apiVersion}/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        credentials: {
          jwt,
          site: { contentUrl: this.options.siteContentUrl }
        }
      })
    });
    if (!response.ok) throw await this.errorFromResponse(response);
    const payload = await response.json() as {
      credentials?: {
        token?: string;
        site?: { id?: string };
      };
    };
    const token = payload.credentials?.token;
    const siteId = payload.credentials?.site?.id;
    if (!token || !siteId) throw new TableauWidgetError("Tableau sign-in did not return a usable session.");
    return { token, siteId };
  }

  private apiUrl(siteId: string, path: string): string {
    return `${this.baseUrl}/api/${this.apiVersion}/sites/${encodeURIComponent(siteId)}${path}`;
  }

  private tableauHeaders(session: TableauSession): Record<string, string> {
    return {
      Accept: "application/json",
      "X-Tableau-Auth": session.token
    };
  }

  private async errorFromResponse(response: Response): Promise<TableauWidgetError> {
    const detail = await response.text().catch(() => "");
    return new TableauWidgetError(`Tableau request failed with ${response.status}: ${sanitizeTableauErrorText(detail).slice(0, 300)}`, response.status);
  }
}

export function createTableauClientFromEnvironment(env: NodeJS.ProcessEnv = process.env): TableauRestClient | undefined {
  const baseUrl = env.TABLEAU_BASE_URL;
  const siteContentUrl = env.TABLEAU_SITE_CONTENT_URL;
  const connectedAppClientId = env.TABLEAU_CONNECTED_APP_CLIENT_ID;
  const connectedAppSecretId = env.TABLEAU_CONNECTED_APP_SECRET_ID;
  const connectedAppSecretValue = env.TABLEAU_CONNECTED_APP_SECRET_VALUE;
  if (!baseUrl || !siteContentUrl || !connectedAppClientId || !connectedAppSecretId || !connectedAppSecretValue) return undefined;
  return new TableauRestClient({
    baseUrl,
    siteContentUrl,
    connectedAppClientId,
    connectedAppSecretId,
    connectedAppSecretValue,
    apiVersion: env.TABLEAU_API_VERSION
  });
}

export function createConnectedAppJwt(input: {
  clientId: string;
  secretId: string;
  secretValue: string;
  subject: string;
  scopes: string[];
  now?: () => Date;
}): string {
  const now = input.now?.() ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload = {
    iss: input.clientId,
    sub: input.subject,
    aud: "tableau",
    exp: issuedAt + 5 * 60,
    iat: issuedAt,
    jti: randomUUID(),
    scp: input.scopes
  };
  const header = { alg: "HS256", typ: "JWT", kid: input.secretId, iss: input.clientId };
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = createHmac("sha256", input.secretValue).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

export function normalizeWidgetData(widget: TableauWidgetDefinition, csv: string, now = new Date()): WidgetDataResult {
  const parsedRows = parseCsv(csv);
  const fields = chartFields(widget);
  const rows = parsedRows.map((row) => {
    const normalized: TableauWidgetRow = {};
    for (const field of fields) normalized[field] = coerceCell(row[field]);
    return normalized;
  });
  const metricField = widget.chart.metricField ?? widget.chart.yField;
  const metricValues = rows.map((row) => numericCell(row[metricField])).filter((value): value is number => typeof value === "number");
  const lastMetric = metricValues.at(-1);
  const firstMetric = metricValues[0];
  return {
    widgetId: widget.id,
    source: "Tableau",
    status: "ready",
    updatedAt: now.toISOString(),
    columns: fields,
    rows,
    metric: typeof lastMetric === "number" ? formatMetric(lastMetric, widget.chart.metricFormat) : "No data",
    trend: trendLabel(firstMetric, lastMetric, widget.chart.metricFormat)
  };
}

export function parseCsv(csv: string): Record<string, string>[] {
  const records = parseCsvRecords(csv);
  const [headers, ...body] = records;
  if (!headers || headers.length === 0) return [];
  return body
    .filter((record) => record.some((cell) => cell.trim() !== ""))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""])));
}

export function sanitizeTableauError(error: unknown): { status?: number; message: string } {
  if (error instanceof TableauWidgetError) {
    return {
      status: error.status,
      message: error.status ? `Tableau request failed with ${error.status}.` : "Tableau request failed."
    };
  }
  if (error instanceof Error) return { message: sanitizeTableauErrorText(error.message) };
  return { message: "Tableau request failed." };
}

function sanitizeTableauErrorText(value: string): string {
  return value
    .replace(/(Bearer|JWT|X-Tableau-Auth)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/(token|secret|jwt|authorization|x-tableau-auth)["':=\s]+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted jwt]");
}

function chartFields(widget: TableauWidgetDefinition): string[] {
  return [...new Set([widget.chart.xField, widget.chart.yField, widget.chart.seriesField, widget.chart.metricField].filter((field): field is string => Boolean(field)))];
}

function coerceCell(value: string | undefined): string | number | null {
  if (value === undefined || value.trim() === "") return null;
  const trimmed = value.trim();
  const numeric = Number(trimmed.replace(/[$,%]/g, ""));
  return Number.isFinite(numeric) && /^[$-]?\d[\d,]*(?:\.\d+)?%?$/.test(trimmed.replace(/,/g, "")) ? numeric : trimmed;
}

function numericCell(value: string | number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatMetric(value: number, format = "number"): string {
  if (format === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  if (format === "percent") return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function trendLabel(first: number | undefined, last: number | undefined, format = "number"): string {
  if (typeof first !== "number" || typeof last !== "number" || first === 0) return "Trend unavailable";
  const delta = last - first;
  const sign = delta >= 0 ? "+" : "";
  const formatted = format === "percent" ? `${sign}${delta.toFixed(1)} pts` : `${sign}${formatMetric(delta, format)}`;
  return `${formatted} vs first point`;
}

function parseCsvRecords(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (quoted && char === "\"" && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
