import { request } from "../cwClient.js";
import { loadContext } from "../context.js";
import { CwApiError } from "../cwClient.js";
import { resolveTicket } from "../ticketResolver.js";
import type { AddTimeEntryArgs, NoteType } from "../types.js";

const VALID_NOTE_TYPES: NoteType[] = ["Discussion", "Internal", "Resolution"];

// Verified against a real tenant's time entries: the note-type checkboxes shown
// in ConnectWise's UI when logging time map to these three flags on the POST
// body (same three flags as a ticket note's detailDescription/internalAnalysis/
// resolution). ConnectWise defaults to Discussion when none is set explicitly.
function noteTypeFlags(noteType: NoteType): {
  addToDetailDescriptionFlag: boolean;
  addToInternalAnalysisFlag: boolean;
  addToResolutionFlag: boolean;
} {
  return {
    addToDetailDescriptionFlag: noteType === "Discussion",
    addToInternalAnalysisFlag: noteType === "Internal",
    addToResolutionFlag: noteType === "Resolution",
  };
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
  if (args.noteType !== undefined && !VALID_NOTE_TYPES.includes(args.noteType)) {
    throw new CwApiError(
      "VALIDATION_ERROR",
      `noteType invalido: "${args.noteType}". Valores validos: ${VALID_NOTE_TYPES.join(", ")}`
    );
  }
  const { config, secrets } = loadContext();

  const { chargeToType } = await resolveTicket(config, secrets, args.ticketId);

  const body = {
    chargeToType,
    chargeToId: args.ticketId,
    timeStart: toIsoDateTime(args.date, args.startTime),
    timeEnd: toIsoDateTime(args.date, args.endTime),
    notes: args.note,
    workRole: { name: args.workRole },
    workType: { name: args.workType },
    billableOption: args.billable ? "Billable" : "DoNotBill",
    ...noteTypeFlags(args.noteType ?? "Discussion"),
  };

  const created = await request<unknown>(config, secrets, {
    method: "POST",
    path: "/time/entries",
    body,
  });

  return { ok: true, timeEntry: created };
}
