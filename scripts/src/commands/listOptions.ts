import { requestAllPages } from "../cwClient.js";
import { loadContext } from "../context.js";
import { resolveTicket } from "../ticketResolver.js";

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

interface RawLocationWorkRole {
  workRole: { id: number; name: string };
  workRoleInactiveFlag?: boolean;
}

interface RawTicketWithLocation {
  location?: { id: number };
}

// ConnectWise's tenant-wide /time/workRoles list is a superset — the roles a
// member can actually pick for a given ticket are further restricted by that
// ticket's Location (verified against a real tenant: a location had only 16 of
// the 19 active tenant-wide roles, and offering one of the missing 3 as an
// option confused the user because it isn't selectable in ConnectWise's own UI
// for that ticket). When a ticketId is given, scope to that location's roles.
export async function listWorkRoles(ticketId?: number): Promise<unknown> {
  const { config, secrets } = loadContext();

  if (ticketId !== undefined) {
    const { raw } = await resolveTicket<RawTicketWithLocation>(config, secrets, ticketId);
    const locationId = raw.location?.id;
    if (locationId !== undefined) {
      const locationRoles = await requestAllPages<RawLocationWorkRole>(config, secrets, {
        path: `/system/locations/${locationId}/workroles`,
      });
      const roles = locationRoles
        .filter((r) => !r.workRoleInactiveFlag)
        .map((r) => ({ id: r.workRole.id, name: r.workRole.name }));
      return { ok: true, count: roles.length, scopedToTicketId: ticketId, workRoles: roles };
    }
  }

  const raw = await requestAllPages<RawWorkRole>(config, secrets, { path: "/time/workRoles" });
  const roles = raw.filter((r) => !r.inactiveFlag).map((r) => ({ id: r.id, name: r.name }));
  return { ok: true, count: roles.length, workRoles: roles };
}

export async function listWorkTypes(filter?: string): Promise<unknown> {
  const { config, secrets } = loadContext();
  const raw = await requestAllPages<RawWorkType>(config, secrets, { path: "/time/workTypes" });
  const active = raw.filter((t) => !t.inactiveFlag);
  const totalCount = active.length;

  const filtered = filter
    ? active.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))
    : active;

  const types = filtered.map((t) => ({ id: t.id, name: t.name }));
  return {
    ok: true,
    count: types.length,
    totalCount,
    filterApplied: filter ?? null,
    workTypes: types,
  };
}
