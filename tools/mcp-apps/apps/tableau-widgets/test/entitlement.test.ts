import { describe, expect, it } from "vitest";

import { evaluateWidgetAccess } from "../src/entitlement.js";
import type { TableauIdentity, TableauWidgetDefinition } from "../src/types.js";

const baseWidget: TableauWidgetDefinition = {
  id: "sensitive-widget",
  title: "Sensitive widget",
  source: "Tableau",
  category: "Revenue",
  description: "Should not leak to unauthorized users.",
  cadence: "Hourly",
  refreshTtlSeconds: 300,
  chart: { type: "bar", xField: "stage", yField: "amount" },
  tableau: { viewId: "view_sensitive" },
  access: {
    allowedUsers: ["allowed@telnyx.com"],
    allowedSquads: ["revops.squad"],
    deniedUsers: ["blocked@telnyx.com"]
  }
};

const identity: TableauIdentity = {
  userId: "user_1",
  email: "allowed@telnyx.com",
  squads: ["support.squad"]
};

describe("evaluateWidgetAccess", () => {
  it("allows explicitly listed users when identity has squad context", () => {
    expect(evaluateWidgetAccess(baseWidget, identity)).toEqual({ allowed: true, reason: "allowed_user" });
  });

  it("allows squad members", () => {
    expect(evaluateWidgetAccess(baseWidget, { ...identity, email: "member@telnyx.com", squads: ["revops.squad"] })).toEqual({
      allowed: true,
      reason: "allowed_squad"
    });
  });

  it("lets explicit denies override user and squad grants", () => {
    expect(evaluateWidgetAccess(baseWidget, { ...identity, email: "blocked@telnyx.com", squads: ["revops.squad"] })).toEqual({
      allowed: false,
      reason: "explicit_deny"
    });
  });

  it("denies missing identity, email, and squad context", () => {
    expect(evaluateWidgetAccess(baseWidget)).toEqual({ allowed: false, reason: "missing_identity" });
    expect(evaluateWidgetAccess(baseWidget, { ...identity, email: "" })).toEqual({ allowed: false, reason: "missing_email" });
    expect(evaluateWidgetAccess(baseWidget, { ...identity, squads: [] })).toEqual({ allowed: false, reason: "missing_squad" });
  });

  it("denies users who are not in allowed users or squads", () => {
    expect(evaluateWidgetAccess(baseWidget, { ...identity, email: "other@telnyx.com", squads: ["support.squad"] })).toEqual({
      allowed: false,
      reason: "not_entitled"
    });
  });
});
