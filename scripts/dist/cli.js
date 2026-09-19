#!/usr/bin/env node
import * as fs from "fs";
import { configure, reset } from "./commands/install.js";
import { searchTickets } from "./commands/searchTickets.js";
import { getTicket } from "./commands/getTicket.js";
import { addTimeEntry } from "./commands/addTimeEntry.js";
import { listWorkRoles, listWorkTypes } from "./commands/listOptions.js";
import { loadContext } from "./context.js";
import { testConnection, CwApiError } from "./cwClient.js";
import { promptText, promptSecret } from "./prompt.js";
const MIN_NODE_MAJOR = 18;
function checkNodeVersion() {
    const major = Number(process.versions.node.split(".")[0]);
    if (major < MIN_NODE_MAJOR) {
        printError(new CwApiError("UNKNOWN_ERROR", `Este CLI requiere Node.js ${MIN_NODE_MAJOR}+ (version actual: ${process.versions.node}).`));
        process.exit(1);
    }
}
function readStdinSync() {
    try {
        return fs.readFileSync(0, "utf8");
    }
    catch {
        return "";
    }
}
function parseJsonFrom(raw, sourceLabel) {
    try {
        return JSON.parse(raw);
    }
    catch {
        printError(new CwApiError("VALIDATION_ERROR", `El JSON recibido via ${sourceLabel} no es valido.`));
        process.exit(1);
    }
}
/**
 * Args can come from three places, in order of preference:
 *   1. --json-args '<json>'   (fine for short payloads / bash)
 *   2. --json-file <path>     (most robust — avoids ALL shell quoting issues,
 *                              recommended for PowerShell and for Claude-driven
 *                              calls with non-trivial payloads)
 *   3. piped stdin             (e.g. a PowerShell here-string piped in)
 * Returns { args, provided } — provided=false means "no args given at all",
 * which some subcommands (configure) treat as "go interactive" rather than
 * as a validation error.
 */
function parseArgs() {
    const jsonArgsIdx = process.argv.indexOf("--json-args");
    if (jsonArgsIdx !== -1) {
        const raw = process.argv[jsonArgsIdx + 1];
        if (!raw)
            return { args: {}, provided: false };
        return { args: parseJsonFrom(raw, "--json-args"), provided: true };
    }
    const jsonFileIdx = process.argv.indexOf("--json-file");
    if (jsonFileIdx !== -1) {
        const path = process.argv[jsonFileIdx + 1];
        if (!path)
            return { args: {}, provided: false };
        let raw;
        try {
            raw = fs.readFileSync(path, "utf8");
        }
        catch (err) {
            printError(new CwApiError("VALIDATION_ERROR", `No se pudo leer --json-file "${path}": ${err.message}`));
            process.exit(1);
        }
        return { args: parseJsonFrom(raw, "--json-file"), provided: true };
    }
    if (!process.stdin.isTTY) {
        const raw = readStdinSync().trim();
        if (raw) {
            return { args: parseJsonFrom(raw, "stdin"), provided: true };
        }
    }
    return { args: {}, provided: false };
}
function printSuccess(payload) {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}
function printError(err) {
    if (err instanceof CwApiError) {
        process.stderr.write(JSON.stringify(err.toCliError(), null, 2) + "\n");
        return;
    }
    process.stderr.write(JSON.stringify({ error: { code: "UNKNOWN_ERROR", message: err?.message ?? String(err) } }, null, 2) + "\n");
}
async function promptForConfigureArgs() {
    console.log("Configuracion de ConnectWise Manage para cwplugin.");
    console.log("Los datos se guardan cifrados en el almacen de credenciales de tu sistema operativo.\n");
    const fqdn = await promptText("FQDN de ConnectWise (ej. na.myconnectwise.net): ");
    const companyId = await promptText("Company ID: ");
    const clientId = await promptText("Client ID (developer.connectwise.com): ");
    const publicKey = await promptSecret("Public Key (no se mostrara en pantalla): ");
    const privateKey = await promptSecret("Private Key (no se mostrara en pantalla): ");
    return { fqdn, companyId, clientId, publicKey, privateKey };
}
async function main() {
    checkNodeVersion();
    const subcommand = process.argv[2];
    const { args, provided } = parseArgs();
    switch (subcommand) {
        case "configure": {
            const configureArgs = provided ? args : await promptForConfigureArgs();
            const result = await configure(configureArgs);
            printSuccess(result);
            return;
        }
        case "reset": {
            printSuccess(reset());
            return;
        }
        case "search-tickets": {
            const result = await searchTickets(args);
            printSuccess(result);
            return;
        }
        case "get-ticket": {
            const id = Number(args.id);
            if (!id)
                throw new CwApiError("VALIDATION_ERROR", "Falta el campo 'id' del ticket.");
            const result = await getTicket(id);
            printSuccess(result);
            return;
        }
        case "add-time-entry": {
            const result = await addTimeEntry(args);
            printSuccess(result);
            return;
        }
        case "list-work-roles": {
            printSuccess(await listWorkRoles());
            return;
        }
        case "list-work-types": {
            const filter = args.filter;
            printSuccess(await listWorkTypes(filter));
            return;
        }
        case "test-connection": {
            const { config, secrets } = loadContext();
            await testConnection(config, secrets);
            printSuccess({ ok: true, apiBase: config.apiBase });
            return;
        }
        default:
            throw new CwApiError("VALIDATION_ERROR", `Subcomando desconocido: "${subcommand}". Subcomandos validos: configure, reset, search-tickets, get-ticket, add-time-entry, list-work-roles, list-work-types, test-connection.`);
    }
}
main().catch((err) => {
    printError(err);
    process.exit(1);
});
