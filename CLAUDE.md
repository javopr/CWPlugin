# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Claude Code plugin (`cwplugin`) that lets Claude search ConnectWise Manage tickets,
show ticket detail, and log time entries from a conversation. It only works inside a
Claude Code session (terminal, VS Code extension, or the desktop app's Claude Code
surface) — it does not work in a regular claude.ai chat conversation, since plugin
commands/skills aren't loaded there.

## Commands

```
cd scripts
npm install
npm run build   # compiles scripts/src (TypeScript) -> scripts/dist (committed JS)
npm test        # runs test/cli.test.mjs against a local mock ConnectWise server
```

Run a single test: `node --test test/cli.test.mjs` doesn't support name filtering
directly here — use `node --test --test-name-pattern="<substring>" test/cli.test.mjs`
from the repo root.

**`scripts/dist/` is committed and must be rebuilt (`npm run build`) after every
change to `scripts/src/`** — the plugin ships pre-compiled so end users only need
Node.js, not TypeScript. Forgetting this means the shipped CLI silently keeps the old
behavior even though the source changed.

## Architecture

**Two layers**: `.md` files (commands + skills, loaded by Claude Code at runtime) and
a local Node CLI (`scripts/`) that those instructions shell out to.

- `commands/*.md` — slash commands (`/cw-buscar`, `/cw-ticket`, `/cw-tiempo`,
  `/cw-install`). Thin wrappers that point Claude at the `connectwise` skill.
- `skills/connectwise/SKILL.md` — the actual operating instructions Claude follows:
  how to invoke the CLI, the two-level ticket search flow, the time-entry flow, error
  code → user-message mapping. This is what to edit when Claude's *behavior* around
  the CLI needs to change (not the CLI itself).
- `skills/connectwise/reference.md` — deeper API details loaded only when needed
  (exact `conditions=` syntax, verified field names/formats). Keep this in sync with
  actual CLI behavior — it drifted out of sync once already (see CHANGELOG 1.1.2) when
  an implementation detail changed but this file wasn't updated with it, and a stale
  hypothesis about ConnectWise's API stayed written down as fact.
- `scripts/src/cli.ts` — entrypoint; dispatches subcommands (`configure`,
  `search-tickets`, `get-ticket`, `add-time-entry`, `list-work-roles`,
  `list-work-types`, `test-connection`, `reset`) and handles all three ways args can
  arrive: `--json-args`, `--json-file` (needed because PowerShell can mis-serialize
  long `--json-args` values), or piped stdin.
- `scripts/run.ps1` / `scripts/run.sh` — wrappers that locate Node.js by scanning
  typical install paths rather than trusting the calling shell's `PATH`. This exists
  so a just-installed Node is usable immediately, without opening a new terminal.
- `scripts/src/ticketResolver.ts` — **the key architectural fact about this API**:
  ConnectWise Service Desk tickets (`/service/tickets`) and Project module tickets
  (`/project/tickets`) are genuinely separate resources with separate id spaces, not
  one resource distinguished by a field. `resolveTicket()` tries `/service/tickets/{id}`
  first, falls back to `/project/tickets/{id}` on 404, and is the only place that
  should know this — `getTicket.ts`, `addTimeEntry.ts`, and `listOptions.ts`
  (`list-work-roles`) all go through it rather than assuming which endpoint a ticket
  lives in.
- `scripts/src/commands/searchTickets.ts` — queries `/service/tickets` and/or
  `/project/tickets` depending on `recordType` (`"any"` queries both and merges).
  Does its own note-scanning for level-2 "search inside ticket notes" queries, since
  ConnectWise has no server-side field for that. **Known limitation**: does not
  paginate past the first page (`pageSize: 100`) — a company with more tickets than
  that gets silently truncated results. Documented in reference.md /
  CONNECTWISE-API.md but not yet fixed.
- `scripts/src/commands/listOptions.ts` (`list-work-roles`) — Work Role options are
  not simply tenant-wide: ConnectWise restricts which roles are selectable per
  ticket's **Location** (`GET /system/locations/{id}/workroles`). Pass `ticketId` to
  get the correctly-scoped list; omitting it falls back to the unscoped tenant-wide
  list (`GET /time/workRoles`), which can include roles the user won't actually see
  as options in ConnectWise's own UI. Work Type has no equivalent per-location
  restriction (verified — no such endpoint exists).
- `scripts/src/cwClient.ts` — auth headers, base-URL resolution (each tenant has a
  distinct "codebase" fetched from an unauthenticated `companyinfo` endpoint),
  `request`/`requestAllPages`, and `CwApiError` → the error-code table the skill uses
  to talk to the user.
- `scripts/src/secretStore.ts` — OS-native credential storage (Windows DPAPI, macOS
  Keychain via `security`, Linux via `secret-tool`/libsecret with a `0600`-permission
  file fallback). Non-secret config (FQDN, Company ID, resolved API base) lives in
  plain JSON at `~/.cwplugin/config.json` via `config.ts`. Claude never sees the keys
  directly — only this CLI reads them.
- `test/mock-cw-server.mjs` — a from-scratch HTTP mock of the ConnectWise REST surface
  (no framework), covering `/service/tickets`, `/project/tickets`, their `/notes`
  subpaths, `/time/entries`, `/time/workRoles`, and `/system/locations/{id}/workroles`.
  `matchesConditions()` implements just enough of ConnectWise's `conditions=` grammar
  (`contains`, `like`, `=`, `and`, one level of parenthesized `or`) to exercise the
  CLI's real query strings. When adding a new endpoint or filter to the CLI, extend
  this mock rather than only unit-testing in isolation — several real bugs here were
  only catchable by exercising the actual HTTP request/response shape.
- Async subprocess note: `test/cli.test.mjs` must invoke the CLI with `execFile`
  (async), never `execFileSync`/`spawnSync` — a sync spawn from the same process that
  hosts the mock server deadlocks the event loop, so the mock server can never respond.
- `cli.ts`'s top-level error handler sets `process.exitCode` rather than calling
  `process.exit()` — calling `process.exit()` right after a failed HTTP request (e.g.
  two 404s in a row from `resolveTicket` trying both ticket endpoints) can race
  libuv's socket teardown on Windows and crash the process instead of printing the
  error.

## Docs layout

`docs/` is organized **per release version** (`docs/v1.1.1/`, `docs/v1.1.2/`, ...) —
each version folder gets a copy of `INSTALL.md` and `CONNECTWISE-API.md` current as of
that release (copied unchanged if nothing changed). `docs/CHANGELOG.md` is the one
exception: it stays a single accumulating file at the `docs/` root, not versioned into
subfolders. When cutting a new version, create its folder, update the `README.md`
links to point at it, and add a version bump in both `.claude-plugin/plugin.json` and
`scripts/package.json`.

`docs/CHANGELOG.md` entries follow a "what broke → how it was found → how it was
fixed" format, usually quoting the user's own words that surfaced the bug. This is
deliberate: it's the primary way a fresh Claude Code session (e.g., on a different
machine) picks up the reasoning behind non-obvious past decisions, since conversation
history and Claude's memory don't travel with the git repo.

## Keeping this repo the single source of truth

The user works on this project from multiple machines and expects full continuity
between them regardless of which one they're on. Claude Code's conversation history
and its local memory are per-machine and do **not** sync — the git repo is the only
thing that does. So: **whenever a working convention, behavioral rule, or non-obvious
decision changes, write it into this file, `skills/connectwise/SKILL.md`, or
`docs/CHANGELOG.md` in the same session it changes — don't rely on remembering it
for next time.** Concretely:

- A rule about *how the CLI/API behaves* (a ConnectWise quirk, a new endpoint, a
  verified field) → `skills/connectwise/reference.md` and/or
  `docs/v<current>/CONNECTWISE-API.md`.
- A rule about *how Claude should behave when using the skill* (how to present
  choices, what to ask before doing, thresholds like the 100-note cutoff) →
  `skills/connectwise/SKILL.md`.
- A rule about *how to work in this repo itself* (build/test steps, architecture
  facts, cross-cutting gotchas) → this file.
- A bug and its fix, with what surfaced it → `docs/CHANGELOG.md`.

If a user preference doesn't fit any of those (e.g., "run tests before saying
something is done") it's likely already covered by Claude Code's own default
behavior and doesn't need repo-level codification — only project-specific
conventions need to live here.
