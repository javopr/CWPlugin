export interface NonSecretConfig {
  fqdn: string;
  companyId: string;
  clientId: string;
  apiBase: string;
  codebase: string;
  resolvedAt: string;
}

export interface Secrets {
  publicKey: string;
  privateKey: string;
}

export type RecordTypeFilter = "any" | "service" | "project";

export interface SearchTicketsArgs {
  ticketId?: number;
  company?: string;
  summary?: string;
  status?: string;
  recordType?: RecordTypeFilter;
  /** Level 2 search only: text to look for in the ticket's initial note. */
  initialDescription?: string;
  /** Level 2 search only: how many of the most recent matching tickets to scan (default 10, max 50). */
  noteScanLimit?: number;
}

export interface AddTimeEntryArgs {
  ticketId: number;
  note: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  workRole: string;
  workType: string;
  billable: boolean;
}

export interface ConfigureArgs {
  fqdn: string;
  companyId: string;
  clientId: string;
  publicKey: string;
  privateKey: string;
}

export type ErrorCode =
  | "AUTH_INVALID"
  | "AUTH_MISSING_CLIENTID"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "NETWORK_ERROR"
  | "VALIDATION_ERROR"
  | "KEYCHAIN_UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "UNKNOWN_ERROR";

export interface CliError {
  error: {
    code: ErrorCode;
    message: string;
    httpStatus?: number;
    details?: unknown;
  };
}

export interface TicketSummary {
  id: number;
  summary: string;
  company: string;
  status: string;
  board: string;
  recordType: string;
}

export interface TicketNote {
  id: number;
  text: string;
  createdBy?: string;
  dateCreated?: string;
  detailDescriptionFlag: boolean;
  internalAnalysisFlag: boolean;
  resolutionFlag: boolean;
}

export interface TicketDetail extends TicketSummary {
  initialDescription?: string;
  contact?: string;
  agreement?: string;
  notes: TicketNote[];
  timeEntries: unknown[];
  raw: unknown;
}
