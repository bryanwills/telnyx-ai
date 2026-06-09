import type { TableauIdentity, TableauWidgetDefinition } from "./types.js";

export type AccessReason =
  | "missing_identity"
  | "missing_email"
  | "missing_squad"
  | "explicit_deny"
  | "not_entitled"
  | "allowed_user"
  | "allowed_squad";

export interface AccessDecision {
  allowed: boolean;
  reason: AccessReason;
}

export function evaluateWidgetAccess(widget: TableauWidgetDefinition, identity?: TableauIdentity): AccessDecision {
  if (!identity?.userId) return deny("missing_identity");
  if (!identity.email || !isEmailLike(identity.email)) return deny("missing_email");
  if (!Array.isArray(identity.squads) || identity.squads.filter(Boolean).length === 0) return deny("missing_squad");

  if (matchesUser(widget.access.deniedUsers, identity)) return deny("explicit_deny");
  if (matchesUser(widget.access.allowedUsers, identity)) return { allowed: true, reason: "allowed_user" };
  if (matchesSquad(widget.access.allowedSquads, identity.squads)) return { allowed: true, reason: "allowed_squad" };
  return deny("not_entitled");
}

function deny(reason: AccessReason): AccessDecision {
  return { allowed: false, reason };
}

function matchesUser(values: string[] | undefined, identity: TableauIdentity): boolean {
  const normalized = new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  return normalized.has(identity.email.trim().toLowerCase()) || normalized.has(identity.userId.trim().toLowerCase());
}

function matchesSquad(values: string[] | undefined, squads: string[]): boolean {
  const allowed = new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  return squads.some((squad) => allowed.has(squad.trim().toLowerCase()));
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
