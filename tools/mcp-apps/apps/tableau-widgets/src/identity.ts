import type { IdentityResolver, TableauIdentity } from "./types.js";

export interface AcpIdentityResolverOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export function createAcpIdentityResolver(options: AcpIdentityResolverOptions): IdentityResolver {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  return {
    async resolve(token: string): Promise<TableauIdentity | undefined> {
      if (!token) return undefined;
      const response = await fetchImpl(`${baseUrl}/api/me`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "telnyx-auth-rev2": token
        }
      });
      if (!response.ok) return undefined;
      return normalizeIdentity(await response.json());
    }
  };
}

export function createAcpIdentityResolverFromEnvironment(env: NodeJS.ProcessEnv = process.env): IdentityResolver | undefined {
  const baseUrl = env.TABLEAU_WIDGETS_ACP_IDENTITY_URL || env.AGENT_CONTROL_PLANE_URL;
  if (!baseUrl) return undefined;
  return createAcpIdentityResolver({ baseUrl });
}

export function normalizeIdentity(payload: unknown): TableauIdentity | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const user = objectRecord(record.user);
  const userId = stringField(record, "user_id") || stringField(record, "id") || stringField(user, "id");
  const email = stringField(record, "email") || stringField(record, "user_email") || stringField(user, "email") || stringField(record, "name");
  const squads = arrayField(record, "squads") || arrayField(record, "squad_ids") || arrayField(user, "squads") || membershipsToSquads(record.memberships);
  const displayName = stringField(record, "display_name") || stringField(user, "display_name") || stringField(record, "name");
  if (!userId || !email) return undefined;
  return { userId, email, squads: squads ?? [], displayName };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function arrayField(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
}

function membershipsToSquads(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => objectRecord(item))
    .map((item) => stringField(item, "squad") || stringField(item, "squad_id") || stringField(item, "id"))
    .filter(Boolean);
}
