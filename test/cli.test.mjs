import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { startMockServer } from "./mock-cw-server.mjs";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, "..", "scripts", "dist", "cli.js");

let mock;
let configDir;

before(async () => {
  mock = await startMockServer();
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), "cwplugin-test-"));
});

after(async () => {
  await mock.close();
  fs.rmSync(configDir, { recursive: true, force: true });
});

async function runCli(subcommand, args) {
  // IMPORTANT: must be the async execFile, not execFileSync/spawnSync. The mock
  // HTTP server lives in this same test process; a *Sync spawn call blocks this
  // process's entire event loop until the child exits, which means the server
  // can never accept/respond to the child's request — a deadlock that only
  // "resolves" once the child's own fetch() hits its multi-minute internal
  // timeout. Keeping this async lets the event loop keep servicing the mock
  // server while we await the child.
  const env = {
    ...process.env,
    CWPLUGIN_CONFIG_DIR: configDir,
    CWPLUGIN_TEST_INSECURE_HTTP: "1",
  };
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [CLI_PATH, subcommand, "--json-args", JSON.stringify(args ?? {})],
      { env, encoding: "utf8" }
    );
    return { ok: true, json: JSON.parse(stdout) };
  } catch (err) {
    const stderr = err.stderr?.toString() ?? "";
    return { ok: false, json: stderr ? JSON.parse(stderr) : null, raw: stderr };
  }
}

test("configure fails validation with missing fields", async () => {
  const result = await runCli("configure", { fqdn: mock.fqdn });
  assert.equal(result.ok, false);
  assert.equal(result.json.error.code, "VALIDATION_ERROR");
});

test("configure succeeds against the mock server", async () => {
  const result = await runCli("configure", {
    fqdn: mock.fqdn,
    companyId: mock.companyId,
    clientId: mock.clientId,
    publicKey: mock.publicKey,
    privateKey: mock.privateKey,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.json.ok, true);
  assert.match(result.json.apiBase, /apis\/3\.0$/);
});

test("test-connection succeeds once configured", async () => {
  const result = await runCli("test-connection");
  assert.equal(result.ok, true, JSON.stringify(result));
});

test("search-tickets combines criteria and returns matches", async () => {
  const result = await runCli("search-tickets", { company: "acme", recordType: "service" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.json.count, 1);
  assert.equal(result.json.tickets[0].id, 1001);
});

test("search-tickets level 2: scans notes of the last N candidate tickets", async () => {
  // ConnectWise has no flat "initialDescription" ticket field — it's the first note
  // with detailDescriptionFlag=true, so this filters client-side over notes of the
  // most recent `noteScanLimit` tickets matching the level-1 criteria.
  const result = await runCli("search-tickets", { company: "acme", initialDescription: "impresora", noteScanLimit: 5 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.json.count, 1);
  assert.equal(result.json.tickets[0].id, 1001);
  assert.ok(result.json.scannedTicketCount >= 1);
});

test("search-tickets level 2 works without other level-1 criteria (bounded by noteScanLimit)", async () => {
  const result = await runCli("search-tickets", { initialDescription: "impresora", noteScanLimit: 10 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.json.count, 1);
  assert.equal(result.json.tickets[0].id, 1001);
});

test("search-tickets returns zero results without throwing", async () => {
  const result = await runCli("search-tickets", { company: "nope-inc" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.json.count, 0);
});

test("get-ticket returns full detail including all paginated notes", async () => {
  const result = await runCli("get-ticket", { id: 1001 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.json.ticket.id, 1001);
  assert.equal(result.json.ticket.notes.length, 2);
});

test("get-ticket on unknown id returns NOT_FOUND", async () => {
  const result = await runCli("get-ticket", { id: 404404 });
  assert.equal(result.ok, false);
  assert.equal(result.json.error.code, "NOT_FOUND");
});

test("add-time-entry validates required fields before calling the API", async () => {
  const result = await runCli("add-time-entry", { ticketId: 1001, note: "test" });
  assert.equal(result.ok, false);
  assert.equal(result.json.error.code, "VALIDATION_ERROR");
  assert.ok(result.json.error.details.missing.length > 0);
});

test("add-time-entry succeeds end-to-end against the mock server", async () => {
  const result = await runCli("add-time-entry", {
    ticketId: 1001,
    note: "Trabajo de prueba",
    date: "2026-09-18",
    startTime: "09:00",
    endTime: "11:00",
    workRole: "Engineer",
    workType: "Remote Support",
    billable: true,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.json.timeEntry.chargeToType, "ServiceTicket");
  assert.equal(result.json.timeEntry.billableOption, "Billable");
});

test("reset clears configuration", async () => {
  const result = await runCli("reset");
  assert.equal(result.ok, true, JSON.stringify(result));
  const after = await runCli("test-connection");
  assert.equal(after.ok, false);
  assert.equal(after.json.error.code, "NOT_CONFIGURED");
});
