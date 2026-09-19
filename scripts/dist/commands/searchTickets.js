import { request } from "../cwClient.js";
import { loadContext } from "../context.js";
const DEFAULT_NOTE_SCAN_LIMIT = 10;
const MAX_NOTE_SCAN_LIMIT = 50;
// The initial-description note is always the first one created on the ticket,
// so a single bounded page is enough to find it. Some tickets (e.g. ones fed by
// a monitoring integration) accumulate hundreds/thousands of notes over time —
// never paginate through a ticket's full note history just to find this one.
const NOTE_LOOKUP_PAGE_SIZE = 200;
const SERVICE_SOURCE = { kind: "service", path: "/service/tickets" };
const PROJECT_SOURCE = { kind: "project", path: "/project/tickets" };
function sourcesFor(recordType) {
    if (recordType === "service")
        return [SERVICE_SOURCE];
    if (recordType === "project")
        return [PROJECT_SOURCE];
    return [SERVICE_SOURCE, PROJECT_SOURCE];
}
function escapeConditionValue(value) {
    return value.replace(/'/g, "\\'");
}
// Level 1 filters: fields ConnectWise can filter server-side on the ticket
// list itself (fast, cheap, one request per source).
function buildConditions(args) {
    const clauses = [];
    if (args.ticketId !== undefined) {
        clauses.push(`id=${args.ticketId}`);
    }
    if (args.company) {
        clauses.push(`company/name contains '${escapeConditionValue(args.company)}'`);
    }
    if (args.summary) {
        clauses.push(`summary contains '${escapeConditionValue(args.summary)}'`);
    }
    if (args.status) {
        clauses.push(`status/name contains '${escapeConditionValue(args.status)}'`);
    }
    return clauses.join(" and ");
}
function toSummary(raw, source) {
    const recordType = raw.recordType ?? (source.kind === "project" ? (raw.isIssueFlag ? "ProjectIssue" : "ProjectTicket") : "");
    return {
        id: raw.id,
        summary: raw.summary,
        company: raw.company?.name ?? raw.company?.identifier ?? "",
        status: raw.status?.name ?? "",
        board: raw.board?.name ?? "",
        recordType,
    };
}
async function matchesInitialDescription(config, secrets, source, ticketId, needle) {
    const notes = await request(config, secrets, {
        path: `${source.path}/${ticketId}/notes`,
        query: { pageSize: NOTE_LOOKUP_PAGE_SIZE },
    });
    const initialNote = notes.find((n) => n.detailDescriptionFlag);
    if (!initialNote)
        return false;
    return initialNote.text.toLowerCase().includes(needle.toLowerCase());
}
export async function searchTickets(args) {
    const { config, secrets } = loadContext();
    const conditions = buildConditions(args);
    const sources = sourcesFor(args.recordType);
    // Level 1: ticketId / company / summary / status — a single, fast,
    // server-side filtered request per source (Service Desk and/or Projects).
    if (!args.initialDescription) {
        const tickets = [];
        for (const source of sources) {
            const raw = await request(config, secrets, {
                path: source.path,
                query: { conditions: conditions || undefined, pageSize: 100 },
            });
            tickets.push(...raw.map((t) => toSummary(t, source)));
        }
        return { ok: true, count: tickets.length, tickets };
    }
    // Level 2: search the initial note text (ConnectWise has no server-side
    // field for this — see reference.md). Explicit and bounded: only scans the
    // `noteScanLimit` most recent tickets matching the level-1 filters (default
    // 10, capped at 50) per source, never the whole tenant. This is meant to run
    // only when the user asks to expand a search into notes, e.g. after a
    // level-1 search came back empty.
    const limit = Math.min(args.noteScanLimit ?? DEFAULT_NOTE_SCAN_LIMIT, MAX_NOTE_SCAN_LIMIT);
    const tickets = [];
    let scannedTicketCount = 0;
    for (const source of sources) {
        const candidates = await request(config, secrets, {
            path: source.path,
            query: { conditions: conditions || undefined, orderBy: "id desc", pageSize: limit },
        });
        scannedTicketCount += candidates.length;
        for (const ticket of candidates) {
            if (await matchesInitialDescription(config, secrets, source, ticket.id, args.initialDescription)) {
                tickets.push(toSummary(ticket, source));
            }
        }
    }
    return { ok: true, count: tickets.length, tickets, scannedTicketCount };
}
