import { requestAllPages } from "../cwClient.js";
import { loadContext } from "../context.js";
import { resolveTicket } from "../ticketResolver.js";
import type { TicketDetail, TicketNote } from "../types.js";

interface RawTicket {
  id: number;
  summary: string;
  company?: { name?: string; identifier?: string };
  status?: { name?: string };
  board?: { name?: string };
  recordType?: string;
  isIssueFlag?: boolean;
  initialDescription?: string;
  contact?: { name?: string };
  agreement?: { name?: string };
}

interface RawNote {
  id: number;
  text: string;
  createdBy?: string;
  dateCreated?: string;
  detailDescriptionFlag?: boolean;
  internalAnalysisFlag?: boolean;
  resolutionFlag?: boolean;
}

function toNote(raw: RawNote): TicketNote {
  return {
    id: raw.id,
    text: raw.text,
    createdBy: raw.createdBy,
    dateCreated: raw.dateCreated,
    detailDescriptionFlag: !!raw.detailDescriptionFlag,
    internalAnalysisFlag: !!raw.internalAnalysisFlag,
    resolutionFlag: !!raw.resolutionFlag,
  };
}

export async function getTicket(ticketId: number): Promise<unknown> {
  const { config, secrets } = loadContext();

  const resolved = await resolveTicket<RawTicket>(config, secrets, ticketId);
  const raw = resolved.raw;

  const rawNotes = await requestAllPages<RawNote>(config, secrets, {
    path: resolved.notesPath,
  });

  const timeEntries = await requestAllPages<unknown>(config, secrets, {
    path: "/time/entries",
    query: { conditions: `chargeToId=${ticketId}` },
  });

  const detail: TicketDetail = {
    id: raw.id,
    summary: raw.summary,
    company: raw.company?.name ?? raw.company?.identifier ?? "",
    status: raw.status?.name ?? "",
    board: raw.board?.name ?? "",
    recordType: raw.recordType ?? resolved.chargeToType,
    initialDescription: raw.initialDescription,
    contact: raw.contact?.name,
    agreement: raw.agreement?.name,
    notes: rawNotes.map(toNote),
    timeEntries,
    raw,
  };

  return { ok: true, ticket: detail };
}
