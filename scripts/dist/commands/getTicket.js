import { requestAllPages } from "../cwClient.js";
import { loadContext } from "../context.js";
import { resolveTicket } from "../ticketResolver.js";
function toNote(raw) {
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
export async function getTicket(ticketId) {
    const { config, secrets } = loadContext();
    const resolved = await resolveTicket(config, secrets, ticketId);
    const raw = resolved.raw;
    const rawNotes = await requestAllPages(config, secrets, {
        path: resolved.notesPath,
    });
    const timeEntries = await requestAllPages(config, secrets, {
        path: "/time/entries",
        query: { conditions: `chargeToId=${ticketId}` },
    });
    const detail = {
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
