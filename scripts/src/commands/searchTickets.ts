import { request } from "../cwClient.js";
import { loadContext } from "../context.js";
import type { SearchTicketsArgs, TicketSummary, NonSecretConfig, Secrets } from "../types.js";

interface RawTicket {
  id: number;
  summary: string;
  company?: { name?: string; identifier?: string };
  status?: { name?: string };
  board?: { name?: string };
  recordType?: string;
  isIssueFlag?: boolean;
}

interface RawNote {
  text: string;
  detailDescriptionFlag?: boolean;
}

const DEFAULT_NOTE_SCAN_LIMIT = 10;
const MAX_NOTE_SCAN_LIMIT = 50;
// The initial-description note is always the first one created on the ticket,
// so a single bounded page is enough to find it. Some tickets (e.g. ones fed by
// a monitoring integration) accumulate hundreds/thousands of notes over time —
// never paginate through a ticket's full note history just to find this one.
const NOTE_LOOKUP_PAGE_SIZE = 200;

// ConnectWise stores Project module tickets in a genuinely separate resource from
// Service Desk tickets — not just a different `recordType` on the same one.
// Verified against a real tenant: `/service/tickets` never returns project work
// items (even filtering by recordType), they only show up under `/project/tickets`,
// and that resource has no `recordType` field at all (it uses `isIssueFlag`
// instead, to tell a "Project Ticket" apart from a "Project Issue"). See
// CONNECTWISE-API.md for the full writeup.
interface TicketSource {
  kind: "service" | "project";
  path: string;
}

const SERVICE_SOURCE: TicketSource = { kind: "service", path: "/service/tickets" };
const PROJECT_SOURCE: TicketSource = { kind: "project", path: "/project/tickets" };

function sourcesFor(recordType: SearchTicketsArgs["recordType"]): TicketSource[] {
  if (recordType === "service") return [SERVICE_SOURCE];
  if (recordType === "project") return [PROJECT_SOURCE];
  return [SERVICE_SOURCE, PROJECT_SOURCE];
}

function escapeConditionValue(value: string): string {
  return value.replace(/'/g, "\\'");
}

// Level 1 filters: fields ConnectWise can filter server-side on the ticket
// list itself (fast, cheap, one request per source).
function buildConditions(args: SearchTicketsArgs): string {
  const clauses: string[] = [];
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

function toSummary(raw: RawTicket, source: TicketSource): TicketSummary {
  const recordType =
    raw.recordType ?? (source.kind === "project" ? (raw.isIssueFlag ? "ProjectIssue" : "ProjectTicket") : "");
  return {
    id: raw.id,
    summary: raw.summary,
    company: raw.company?.name ?? raw.company?.identifier ?? "",
    status: raw.status?.name ?? "",
    board: raw.board?.name ?? "",
    recordType,
  };
}

async function matchesInitialDescription(
  config: NonSecretConfig,
  secrets: Secrets,
  source: TicketSource,
  ticketId: number,
  needle: string
): Promise<boolean> {
  const notes = await request<RawNote[]>(config, secrets, {
    path: `${source.path}/${ticketId}/notes`,
    query: { pageSize: NOTE_LOOKUP_PAGE_SIZE },
  });
  const initialNote = notes.find((n) => n.detailDescriptionFlag);
  if (!initialNote) return false;
  return initialNote.text.toLowerCase().includes(needle.toLowerCase());
}

export async function searchTickets(args: SearchTicketsArgs): Promise<unknown> {
  const { config, secrets } = loadContext();
  const conditions = buildConditions(args);
  const sources = sourcesFor(args.recordType);

  // Level 1: ticketId / company / summary / status — a single, fast,
  // server-side filtered request per source (Service Desk and/or Projects).
  if (!args.initialDescription) {
    const tickets: TicketSummary[] = [];
    for (const source of sources) {
      const raw = await request<RawTicket[]>(config, secrets, {
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

  const tickets: TicketSummary[] = [];
  let scannedTicketCount = 0;
  for (const source of sources) {
    const candidates = await request<RawTicket[]>(config, secrets, {
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
