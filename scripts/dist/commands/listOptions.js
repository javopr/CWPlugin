import { requestAllPages } from "../cwClient.js";
import { loadContext } from "../context.js";
export async function listWorkRoles() {
    const { config, secrets } = loadContext();
    const raw = await requestAllPages(config, secrets, { path: "/time/workRoles" });
    const roles = raw.filter((r) => !r.inactiveFlag).map((r) => ({ id: r.id, name: r.name }));
    return { ok: true, count: roles.length, workRoles: roles };
}
export async function listWorkTypes(filter) {
    const { config, secrets } = loadContext();
    const raw = await requestAllPages(config, secrets, { path: "/time/workTypes" });
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
