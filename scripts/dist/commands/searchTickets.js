import { request } from "../cwClient.js";
import { loadContext } from "../context.js";
const DEFAULT_NOTE_SCAN_LIMIT = 10;
const MAX_NOTE_SCAN_LIMIT = 50;
// The initial-description note is always the first one created on the ticket,
// so a single bounded page is enough to find it. Some tickets (e.g. ones fed by
// a monitoring integration) accumulate hundreds/thousands of notes over time —
// never paginate through a ticket's full note history just to find this one.
const NOTE_LOOKUP_PAGE_SIZE = 200;
function escapeConditionValue(value) {
    return value.replace(/'/g, "\\'");
}
// Level 1 filters: fields ConnectWise can filter server-side on the ticket
// list itself (fast, cheap, one request).
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
    if (args.recordType && args.recordType !== "any") {
        const recordType = args.recordType === "service" ? "ServiceTicket" : "ProjectTicket";
        clauses.push(`recordType='${recordType}'`);
    }
    return clauses.join(" and ");
}
function toSummary(raw) {
    return {
        id: raw.id,
        summary: raw.summary,
        company: raw.company?.name ?? raw.company?.identifier ?? "",
        status: raw.status?.name ?? "",
        board: raw.board?.name ?? "",
        recordType: raw.recordType ?? "",
    };
}
async function matchesInitialDescription(config, secrets, ticketId, needle) {
    const notes = await request(config, secrets, {
        path: `/service/tickets/${ticketId}/notes`,
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
    // Level 1: ticketId / company / summary / status / recordType — a single,
    // fast, server-side filtered request.
    if (!args.initialDescription) {
        const raw = await request(config, secrets, {
            path: "/service/tickets",
            query: { conditions: conditions || undefined, pageSize: 100 },
        });
        const tickets = raw.map(toSummary);
        return { ok: true, count: tickets.length, tickets };
    }
    // Level 2: search the initial note text (ConnectWise has no server-side
    // field for this — see reference.md). Explicit and bounded: only scans the
    // `noteScanLimit` most recent tickets matching the level-1 filters (default
    // 10, capped at 50), never the whole tenant. This is meant to run only when
    // the user asks to expand a search into notes, e.g. after a level-1 search
    // came back empty.
    const limit = Math.min(args.noteScanLimit ?? DEFAULT_NOTE_SCAN_LIMIT, MAX_NOTE_SCAN_LIMIT);
    const candidates = await request(config, secrets, {
        path: "/service/tickets",
        query: { conditions: conditions || undefined, orderBy: "id desc", pageSize: limit },
    });
    const matches = [];
    for (const ticket of candidates) {
        if (await matchesInitialDescription(config, secrets, ticket.id, args.initialDescription)) {
            matches.push(ticket);
        }
    }
    const tickets = matches.map(toSummary);
    return { ok: true, count: tickets.length, tickets, scannedTicketCount: candidates.length };
}
