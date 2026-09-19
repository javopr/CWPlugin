import { request, CwApiError } from "./cwClient.js";
import type { NonSecretConfig, Secrets } from "./types.js";

// ConnectWise stores tickets from the Project module (board type "Project") in a
// genuinely separate resource from Service Desk tickets — not just a different
// `recordType` value on the same one. Verified against a real tenant: a project
// ticket's id returns 404 on `/service/tickets/{id}`, has no `recordType` field at
// all, and only resolves via `/project/tickets/{id}` (which instead has an
// `isIssueFlag` distinguishing a "Project Ticket" from a "Project Issue").
export type TicketKind = "service" | "project";

export interface ResolvedTicket<T> {
  kind: TicketKind;
  raw: T;
  notesPath: string;
  chargeToType: "ServiceTicket" | "ProjectTicket" | "ProjectIssue";
}

interface RawServiceTicket {
  id: number;
  recordType?: string;
}

interface RawProjectTicket {
  id: number;
  isIssueFlag?: boolean;
}

/** Looks up a ticket by id, trying the Service Desk resource first, then Projects. */
export async function resolveTicket<T = RawServiceTicket & RawProjectTicket>(
  config: NonSecretConfig,
  secrets: Secrets,
  ticketId: number
): Promise<ResolvedTicket<T>> {
  try {
    const raw = await request<T>(config, secrets, { path: `/service/tickets/${ticketId}` });
    return {
      kind: "service",
      raw,
      notesPath: `/service/tickets/${ticketId}/notes`,
      chargeToType: "ServiceTicket",
    };
  } catch (err) {
    if (!(err instanceof CwApiError) || err.code !== "NOT_FOUND") throw err;
  }

  const raw = await request<T>(config, secrets, { path: `/project/tickets/${ticketId}` });
  const isIssue = (raw as unknown as RawProjectTicket).isIssueFlag === true;
  return {
    kind: "project",
    raw,
    notesPath: `/project/tickets/${ticketId}/notes`,
    chargeToType: isIssue ? "ProjectIssue" : "ProjectTicket",
  };
}
