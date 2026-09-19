# Technical reference — ConnectWise Manage API

This document summarizes, for a human reader, what we verified against a real
ConnectWise Manage tenant while building cwplugin. It's the "for people" version of
[`skills/connectwise/reference.md`](../../skills/connectwise/reference.md), which is
the version Claude uses at runtime (shorter, instruction-oriented).

Everything marked **"verified"** here was tested with a real API call, not just read
from public documentation — several things turned out to differ from what's publicly
documented, see [CHANGELOG.md](../CHANGELOG.md) for the detail on each case.

## Authentication

```
Authorization: Basic base64("{companyId}+{publicKey}:{privateKey}")
clientId: {clientId}
Content-Type: application/json
```

`clientId` has been mandatory since 2019 — without it, the API returns 401 even if
the keys are correct.

## Resolving the tenant's base URL

ConnectWise doesn't have a fixed API URL — each tenant has its own "codebase"
(deployed version):

```
GET https://{fqdn}/login/companyinfo/{companyId}   (unauthenticated)
→ { "Codebase": "v4_6_release/", "SiteUrl": "..." }

apiBase = https://{fqdn}/{Codebase}apis/3.0
```

## Ticket search — two endpoints, not one filtered by a field

**Verified against a real tenant (2026-09-19): `/service/tickets` and
`/project/tickets` are two genuinely separate resources, NOT the same one
filtered by `recordType`.** This was a real bug in an earlier version of this
plugin: it assumed `conditions=recordType='ProjectTicket'` against
`/service/tickets` would return project tickets — it always returned `[]`.
Confirmed against ConnectWise's own official API docs too
(developer.connectwise.com/Products/ConnectWise_PSA/REST): `ProjectTickets` and
`ProjectTicketNotes` are their own tags/resources, distinct from
`Tickets`/`ServiceTicketNotes`. Concrete verified differences:

- A `/project/tickets` record has **no `recordType` field at all** (comes back
  `undefined`) — it uses `isIssueFlag` (`true`/`false`) instead, to tell a
  "Project Ticket" apart from a "Project Issue" within the Project module.
- The id space isn't transparently shared: `GET /service/tickets/{id}` with a
  project ticket's id returns **404** ("Ticket not found"), even though that id
  exists fine under `/project/tickets/{id}`.
- That's why `scripts/src/ticketResolver.ts` (`resolveTicket`) tries
  `/service/tickets/{id}` first and falls back to `/project/tickets/{id}` on a
  404 — used by `get-ticket`, `add-time-entry`, and `list-work-roles` so none of
  them have to assume which one a ticket lives in.

`search-tickets` with `recordType: "service"` only queries `/service/tickets`;
`recordType: "project"` only queries `/project/tickets`; `"any"` (the default)
queries **both** and merges results (before this fix, "any" only ever looked at
`/service/tickets` and silently never returned project tickets).

### Server-side filters (`conditions`) — same operators on both endpoints

Endpoint: `GET /service/tickets?conditions=...` or `GET /project/tickets?conditions=...`

**Verified**: the operator for partial matches on text fields is `contains`, **not**
`like` with `%...%` wildcards. We tried `like '%acme%'` against a real tenant and the
API silently ignored it — instead of failing with an error, it returned thousands of
unfiltered tickets. This is a dangerous failure mode: it looks like it "worked" but
the filter simply wasn't applied.

```
conditions = "id=12345"
conditions = "company/name contains 'acme'"
conditions = "summary contains 'printer'"
conditions = "status/name contains 'open'"
```

Combinable with `and`. `orderBy=id desc` requests the most recent tickets first.
**Verified both endpoints accept the same operators** (`id=`, `contains`,
`orderBy`) — tested directly against `/project/tickets`.

**Pagination**: each request to `/service/tickets` or `/project/tickets` returns
at most `pageSize` results (100 by default in `search-tickets`) — for companies
with more tickets than that, you need to paginate (`requestAllPages`, the way
`get-ticket` already does for notes/time entries) or the result is silently
truncated. `search-tickets` currently does **not** auto-paginate — a known
limitation, worth fixing if it becomes a recurring problem.

### Searching by "initial description"

**Verified**: the ticket does **not** have a plain `initialDescription` field. What
the ConnectWise UI calls "Initial Description" is actually the first note on the
ticket with `detailDescriptionFlag: true` — you have to read it from that ticket's
notes endpoint (see below); it can't be filtered server-side.

That's why cwplugin implements this search in two levels: first it filters by the
ticket's normal fields (fast, server-side), and only if the user explicitly asks for
it, it scans the notes of the N most recent qualifying tickets (bounded, so it
doesn't have to scan notes across the whole tenant).

## A ticket's notes

Endpoint: `GET /service/tickets/{id}/notes` or `GET /project/tickets/{id}/notes`
(paginated with `page`/`pageSize`) — whichever endpoint the ticket lives in;
`ticketResolver.ts` figures this out and exposes it as `notesPath`.

**Verified** fields per note: `id`, `text`, `createdBy`, `dateCreated` (ISO8601 UTC),
`detailDescriptionFlag`, `internalAnalysisFlag`, `resolutionFlag`.

A ticket fed by a monitoring integration (e.g. FortiMonitor) can accumulate hundreds
or thousands of automated notes over time — if you need to find the initial note,
you don't need to pull the full history; it's always the first one
(`detailDescriptionFlag: true`), usually on the first page.

## Time entries

### Listing existing ones

`GET /time/entries?conditions=chargeToId={id}`

### Creating one — `POST /time/entries`

```json
{
  "chargeToType": "ServiceTicket",
  "chargeToId": 12345,
  "timeStart": "2026-09-18T13:00:00Z",
  "timeEnd": "2026-09-18T13:15:00Z",
  "notes": "note text",
  "workRole": { "name": "Incident Handler" },
  "workType": { "name": "Remote-Standard" },
  "billableOption": "DoNotBill",
  "addToDetailDescriptionFlag": true,
  "addToInternalAnalysisFlag": false,
  "addToResolutionFlag": false
}
```

**Verified** with a real entry created end-to-end:

- **Date/time**: rejects `"YYYY-MM-DDTHH:mm:ss"` without a time zone (HTTP 400,
  `UnsupportedFormat`). It also rejects the millisecond format that
  `Date#toISOString()` produces by default (`"...ss.sssZ"`). The correct format is
  `"YYYY-MM-DDTHH:mm:ssZ"` — UTC, no milliseconds.
- **`workRole`/`workType`**: they do use `{ "name": "..." }`, but the name must
  match one that **exactly** exists in the tenant — otherwise the API responds with
  `NotFound` and a clear message (`"workRole Engineer not found"`). These values
  vary per tenant; never assume common names like "Engineer" or "Remote Support" —
  they may not exist.
- **`chargeToType` depends on where the ticket lives**: `"ServiceTicket"` for
  `/service/tickets` tickets; for `/project/tickets`, `"ProjectTicket"` or
  `"ProjectIssue"` depending on that ticket's `isIssueFlag`. `ticketResolver.ts`
  computes this automatically — never assume `"ServiceTicket"`, a project ticket
  with the wrong `chargeToType` fails.
- **`addToDetailDescriptionFlag`/`addToInternalAnalysisFlag`/`addToResolutionFlag`**:
  verified against a real time entry — these are the three "note type" checkboxes
  (Discussion/Internal/Resolution) ConnectWise shows when logging time; exactly
  one should be `true`. Exposed as `noteType` on `add-time-entry` (default
  `"Discussion"`, matching ConnectWise's own default).
- **`billableOption`**: `"DoNotBill"` and `"Billable"` confirmed working. The other
  values in the public enum (`NoCharge`, `NoDefault`) weren't tested but follow the
  same pattern.
- **Ticket status**: if the ticket's current status doesn't allow time entries
  (e.g. `Closed`), the API responds with HTTP 400 and a readable message ("Please
  update the status of this ticket before entering time...").

## Work Role and Work Type lists

- `GET /time/workRoles`
- `GET /time/workTypes`

Both return `{ id, name, inactiveFlag, ... }`, paginated like the other listings.
**Verified**: the test tenant had 19 active work roles and 114 active work types
(mostly "Travel - &lt;city&gt;" variants). cwplugin queries them before asking the
user to pick one, instead of assuming names — see the corresponding bug in
[CHANGELOG.md](../CHANGELOG.md).

**Work Role is not just tenant-wide.** Verified against a real tenant: of 19
active tenant-wide work roles, one specific ticket only allowed 16 of them —
ConnectWise restricts which roles are selectable by that ticket's **Location**
(`ticket.location.id`, present on tickets from both `/service/tickets` and
`/project/tickets`), via `GET /system/locations/{locationId}/workroles`. Each
item is `{ workRole: {id, name}, workRoleInactiveFlag }` — filter on
`workRoleInactiveFlag === false`. `list-work-roles` accepts a `ticketId` and uses
this scoped list instead of the tenant-wide one. **No equivalent endpoint exists
for Work Type** (`/system/locations/{id}/worktypes` returns 404) — Work Type is
genuinely tenant-wide with no known further restriction.
