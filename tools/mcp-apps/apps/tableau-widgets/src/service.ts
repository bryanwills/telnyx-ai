import { createHash } from "node:crypto";

import { evaluateWidgetAccess } from "./entitlement.js";
import { DEFAULT_TABLEAU_WIDGET_MANIFEST } from "./manifest.js";
import { normalizeWidgetData, sanitizeTableauError, TableauWidgetError } from "./tableauClient.js";
import type {
  AccessAuditEvent,
  AccessAuditLogger,
  AuthorizedWidgetCatalogItem,
  IdentityResolver,
  TableauIdentity,
  TableauWidgetClient,
  TableauWidgetDefinition,
  WidgetDataResult
} from "./types.js";

export class TableauWidgetAccessError extends Error {
  constructor(
    public readonly reason: string,
    public readonly status?: number
  ) {
    super("This Tableau widget is not available for the signed-in user.");
    this.name = "TableauWidgetAccessError";
  }
}

export interface TableauWidgetServiceOptions {
  manifest?: TableauWidgetDefinition[];
  identityResolver?: IdentityResolver;
  tableauClient?: TableauWidgetClient;
  auditLogger?: AccessAuditLogger;
  clock?: () => Date;
  cacheTtlMs?: number;
}

interface CacheEntry {
  expiresAtMs: number;
  data: WidgetDataResult;
}

export function createTableauWidgetService(options: TableauWidgetServiceOptions = {}) {
  const manifest = options.manifest ?? DEFAULT_TABLEAU_WIDGET_MANIFEST;
  const clock = options.clock ?? (() => new Date());
  const cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
  const cache = new Map<string, CacheEntry>();

  async function resolveIdentity(token: string): Promise<TableauIdentity | undefined> {
    if (!token || !options.identityResolver) return undefined;
    return options.identityResolver.resolve(token);
  }

  async function listAuthorizedCatalog(token: string): Promise<{ widgets: AuthorizedWidgetCatalogItem[]; updatedAt: string }> {
    const identity = await resolveIdentity(token);
    const widgets: AuthorizedWidgetCatalogItem[] = [];

    for (const widget of manifest) {
      const decision = evaluateWidgetAccess(widget, identity);
      if (!decision.allowed || !identity) {
        await audit(widget.id, identity, "deny", decision.reason);
        continue;
      }

      try {
        const access = await requireTableauClient().assertViewAccess(widget, identity);
        await audit(widget.id, identity, "allow", decision.reason, access.status);
        widgets.push(toCatalogItem(widget));
      } catch (error) {
        const sanitized = sanitizeTableauError(error);
        await audit(widget.id, identity, "deny", "tableau_denied", sanitized.status);
      }
    }

    return { widgets, updatedAt: clock().toISOString() };
  }

  async function getWidgetData(token: string, widgetId: string): Promise<WidgetDataResult> {
    const widget = manifest.find((item) => item.id === widgetId);
    if (!widget) throw new TableauWidgetAccessError("widget_not_found");
    const identity = await resolveIdentity(token);
    const decision = evaluateWidgetAccess(widget, identity);
    if (!decision.allowed || !identity) {
      await audit(widget.id, identity, "deny", decision.reason);
      throw new TableauWidgetAccessError(decision.reason);
    }

    const cacheKey = dataCacheKey(identity, widget.id);
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAtMs > clock().getTime()) return cached.data;

    try {
      const response = await requireTableauClient().queryViewData(widget, identity);
      const data = normalizeWidgetData(widget, response.csv, clock());
      cache.set(cacheKey, {
        data,
        expiresAtMs: clock().getTime() + Math.min(cacheTtlMs, widget.refreshTtlSeconds * 1000)
      });
      await audit(widget.id, identity, "allow", decision.reason, response.status);
      return data;
    } catch (error) {
      cache.delete(cacheKey);
      const sanitized = sanitizeTableauError(error);
      await audit(widget.id, identity, "deny", "tableau_denied", sanitized.status);
      throw new TableauWidgetAccessError("tableau_denied", error instanceof TableauWidgetError ? error.status : undefined);
    }
  }

  function requireTableauClient(): TableauWidgetClient {
    if (!options.tableauClient) throw new TableauWidgetAccessError("tableau_client_unavailable");
    return options.tableauClient;
  }

  async function audit(
    widgetId: string,
    identity: TableauIdentity | undefined,
    decision: AccessAuditEvent["decision"],
    reason: string,
    tableauStatus?: number
  ): Promise<void> {
    await options.auditLogger?.record({
      at: clock().toISOString(),
      widgetId,
      userId: identity?.userId,
      emailHash: identity?.email ? hashEmail(identity.email) : undefined,
      squads: identity?.squads,
      decision,
      reason,
      tableauStatus
    });
  }

  return { listAuthorizedCatalog, getWidgetData };
}

export type TableauWidgetService = ReturnType<typeof createTableauWidgetService>;

export function toCatalogItem(widget: TableauWidgetDefinition): AuthorizedWidgetCatalogItem {
  return {
    id: widget.id,
    title: widget.title,
    source: "Tableau",
    category: widget.category,
    description: widget.description,
    cadence: widget.cadence,
    refreshTtlSeconds: widget.refreshTtlSeconds,
    chart: widget.chart
  };
}

function dataCacheKey(identity: TableauIdentity, widgetId: string): string {
  return createHash("sha256")
    .update("tableau-widget-cache:v1\0")
    .update(identity.userId)
    .update("\0")
    .update(identity.email.toLowerCase())
    .update("\0")
    .update(widgetId)
    .digest("hex");
}

function hashEmail(email: string): string {
  return createHash("sha256").update("tableau-widget-email:v1\0").update(email.trim().toLowerCase()).digest("hex");
}
