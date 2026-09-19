import { request } from "../cwClient.js";
import { loadContext } from "../context.js";
import { CwApiError } from "../cwClient.js";
import type { AddTimeEntryArgs } from "../types.js";

interface RawTicket {
  id: number;
  recordType?: string;
}

const REQUIRED_FIELDS: Array<keyof AddTimeEntryArgs> = [
  "ticketId",
  "note",
  "date",
  "startTime",
  "endTime",
  "workRole",
  "workType",
  "billable",
];

function validate(args: Partial<AddTimeEntryArgs>): void {
  const missing = REQUIRED_FIELDS.filter((field) => args[field] === undefined || args[field] === "");
  if (missing.length > 0) {
    throw new CwApiError(
      "VALIDATION_ERROR",
      `Faltan campos requeridos para la entrada de tiempo: ${missing.join(", ")}`,
      undefined,
      { missing }
    );
  }
}

function toIsoDateTime(date: string, time: string): string {
  // VERIFICADO contra un tenant real (Fase 0): ConnectWise rejects a bare
  // "YYYY-MM-DDTHH:mm:ss" with "UnsupportedFormat" — it requires a timezone
  // designator, AND also rejects the fractional-seconds form
  // ("...ss.sssZ") that Date#toISOString() produces by default. It wants
  // exactly "YYYY-MM-DDTHH:mm:ssZ" (no milliseconds). `date`/`time` are
  // treated as wall-clock time in this machine's local timezone and
  // converted to UTC.
  const local = new Date(`${date}T${time}:00`);
  if (Number.isNaN(local.getTime())) {
    throw new CwApiError("VALIDATION_ERROR", `Fecha/hora invalida: "${date} ${time}"`);
  }
  return local.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function addTimeEntry(args: AddTimeEntryArgs): Promise<unknown> {
  validate(args);
  const { config, secrets } = loadContext();

  const ticket = await request<RawTicket>(config, secrets, {
    path: `/service/tickets/${args.ticketId}`,
  });

  const chargeToType = ticket.recordType === "ProjectTicket" ? "ProjectTicket" : "ServiceTicket";

  const body = {
    chargeToType,
    chargeToId: args.ticketId,
    timeStart: toIsoDateTime(args.date, args.startTime),
    timeEnd: toIsoDateTime(args.date, args.endTime),
    notes: args.note,
    workRole: { name: args.workRole },
    workType: { name: args.workType },
    billableOption: args.billable ? "Billable" : "DoNotBill",
  };

  const created = await request<unknown>(config, secrets, {
    method: "POST",
    path: "/time/entries",
    body,
  });

  return { ok: true, timeEntry: created };
}
