import { describe, expect, it } from "vitest";

import { createTableauWidgetService, TableauWidgetAccessError } from "../src/service.js";
import { sanitizeTableauError, TableauWidgetError } from "../src/tableauClient.js";
import type {
  AccessAuditEvent,
  IdentityResolver,
  TableauIdentity,
  TableauWidgetClient,
  TableauWidgetDefinition
} from "../src/types.js";

const widgets: TableauWidgetDefinition[] = [
  {
    id: "allowed-widget",
    title: "Allowed pipeline",
    source: "Tableau",
    category: "Revenue",
    description: "Visible only to RevOps.",
    cadence: "Hourly",
    refreshTtlSeconds: 300,
    chart: { type: "bar", xField: "stage", yField: "amount", metricField: "amount", metricFormat: "currency" },
    tableau: { viewId: "view_allowed" },
    access: { allowedSquads: ["revops.squad"] }
  },
  {
    id: "secret-widget",
    title: "Sensitive executive revenue",
    source: "Tableau",
    category: "Revenue",
    description: "This title must not leak.",
    cadence: "Hourly",
    refreshTtlSeconds: 300,
    chart: { type: "line", xField: "month", yField: "amount", metricFormat: "currency" },
    tableau: { viewId: "view_secret" },
    access: { allowedSquads: ["executive.squad"] }
  }
];

const revopsIdentity: TableauIdentity = {
  userId: "user_revops",
  email: "revops@telnyx.com",
  squads: ["revops.squad"]
};

function resolver(identity: TableauIdentity | undefined): IdentityResolver {
  return { async resolve() { return identity; } };
}

function client(csv = "stage,amount\nProspect,10\nCommit,35\nClosed,50\n", deniedViewIds = new Set<string>()): TableauWidgetClient {
  return {
    async assertViewAccess(widget) {
      if (deniedViewIds.has(widget.tableau.viewId)) throw new TableauWidgetError("Tableau denied Bearer secret_token", 403);
      return { status: 200 };
    },
    async queryViewData(widget) {
      if (deniedViewIds.has(widget.tableau.viewId)) throw new TableauWidgetError("Tableau denied JWT abc.def.ghi", 403);
      return { csv, status: 200 };
    }
  };
}

describe("TableauWidgetService", () => {
  it("filters unauthorized catalog entries without leaking metadata", async () => {
    const service = createTableauWidgetService({
      manifest: widgets,
      identityResolver: resolver(revopsIdentity),
      tableauClient: client()
    });

    const catalog = await service.listAuthorizedCatalog("tar2");
    expect(catalog.widgets.map((widget) => widget.id)).toEqual(["allowed-widget"]);
    expect(JSON.stringify(catalog)).not.toContain("Sensitive executive revenue");
    expect(JSON.stringify(catalog)).not.toContain("view_secret");
  });

  it("normalizes Tableau CSV into chart rows and a formatted metric", async () => {
    const service = createTableauWidgetService({
      manifest: widgets,
      identityResolver: resolver(revopsIdentity),
      tableauClient: client()
    });

    const data = await service.getWidgetData("tar2", "allowed-widget");
    expect(data).toMatchObject({
      widgetId: "allowed-widget",
      columns: ["stage", "amount"],
      metric: "$50",
      trend: "+$40 vs first point"
    });
    expect(data.rows).toEqual([
      { stage: "Prospect", amount: 10 },
      { stage: "Commit", amount: 35 },
      { stage: "Closed", amount: 50 }
    ]);
  });

  it("redacts Tableau authorization details from errors", () => {
    expect(sanitizeTableauError(new TableauWidgetError("Bearer secret_token and abc.def.ghi", 403))).toEqual({
      status: 403,
      message: "Tableau request failed with 403."
    });
    expect(sanitizeTableauError(new Error("jwt: abc.def.ghi token supersecret")).message).not.toContain("abc.def.ghi");
  });

  it("isolates cache entries by user", async () => {
    let activeIdentity = revopsIdentity;
    let calls = 0;
    const service = createTableauWidgetService({
      manifest: widgets,
      identityResolver: { async resolve() { return activeIdentity; } },
      tableauClient: {
        async assertViewAccess() { return { status: 200 }; },
        async queryViewData() {
          calls += 1;
          return { csv: `stage,amount\nClosed,${calls}\n`, status: 200 };
        }
      },
      cacheTtlMs: 60_000
    });

    await expect(service.getWidgetData("tar2", "allowed-widget")).resolves.toMatchObject({ metric: "$1" });
    await expect(service.getWidgetData("tar2", "allowed-widget")).resolves.toMatchObject({ metric: "$1" });
    activeIdentity = { ...revopsIdentity, userId: "user_revops_2", email: "revops2@telnyx.com" };
    await expect(service.getWidgetData("tar2", "allowed-widget")).resolves.toMatchObject({ metric: "$2" });
    expect(calls).toBe(2);
  });

  it("denies and audits Tableau 403 without returning sensitive widget data", async () => {
    const events: AccessAuditEvent[] = [];
    const service = createTableauWidgetService({
      manifest: widgets,
      identityResolver: resolver(revopsIdentity),
      tableauClient: client("stage,amount\nClosed,50\n", new Set(["view_allowed"])),
      auditLogger: { record(event) { events.push(event); } }
    });

    await expect(service.getWidgetData("tar2", "allowed-widget")).rejects.toBeInstanceOf(TableauWidgetAccessError);
    expect(events.at(-1)).toMatchObject({ widgetId: "allowed-widget", decision: "deny", reason: "tableau_denied", tableauStatus: 403 });
    expect(JSON.stringify(events)).not.toContain("secret_token");
  });

  it("fails closed when ACP identity is unavailable", async () => {
    const service = createTableauWidgetService({
      manifest: widgets,
      identityResolver: resolver(undefined),
      tableauClient: client()
    });

    const catalog = await service.listAuthorizedCatalog("tar2");
    expect(catalog.widgets).toEqual([]);
    await expect(service.getWidgetData("tar2", "allowed-widget")).rejects.toMatchObject({ reason: "missing_identity" });
  });
});
