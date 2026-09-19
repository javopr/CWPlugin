import { request, CwApiError } from "./cwClient.js";
/** Looks up a ticket by id, trying the Service Desk resource first, then Projects. */
export async function resolveTicket(config, secrets, ticketId) {
    try {
        const raw = await request(config, secrets, { path: `/service/tickets/${ticketId}` });
        return {
            kind: "service",
            raw,
            notesPath: `/service/tickets/${ticketId}/notes`,
            chargeToType: "ServiceTicket",
        };
    }
    catch (err) {
        if (!(err instanceof CwApiError) || err.code !== "NOT_FOUND")
            throw err;
    }
    const raw = await request(config, secrets, { path: `/project/tickets/${ticketId}` });
    const isIssue = raw.isIssueFlag === true;
    return {
        kind: "project",
        raw,
        notesPath: `/project/tickets/${ticketId}/notes`,
        chargeToType: isIssue ? "ProjectIssue" : "ProjectTicket",
    };
}
