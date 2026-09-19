import { requestAllPages } from "../cwClient.js";
import { loadContext } from "../context.js";

interface RawWorkRole {
  id: number;
  name: string;
  inactiveFlag?: boolean;
}

interface RawWorkType {
  id: number;
  name: string;
  inactiveFlag?: boolean;
}

export async function listWorkRoles(): Promise<unknown> {
  const { config, secrets } = loadContext();
  const raw = await requestAllPages<RawWorkRole>(config, secrets, { path: "/time/workRoles" });
  const roles = raw.filter((r) => !r.inactiveFlag).map((r) => ({ id: r.id, name: r.name }));
  return { ok: true, count: roles.length, workRoles: roles };
}

export async function listWorkTypes(): Promise<unknown> {
  const { config, secrets } = loadContext();
  const raw = await requestAllPages<RawWorkType>(config, secrets, { path: "/time/workTypes" });
  const types = raw.filter((t) => !t.inactiveFlag).map((t) => ({ id: t.id, name: t.name }));
  return { ok: true, count: types.length, workTypes: types };
}
