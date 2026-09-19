import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { configDir, ensureConfigDir } from "./config.js";
const SERVICE = "cwplugin";
const ACCOUNT = "connectwise-api";
class KeychainUnavailableError extends Error {
}
function secretsFilePath() {
    return path.join(configDir(), "secrets.dat");
}
// --- Windows: DPAPI via a small inline PowerShell helper -----------------
function windowsProtect(plaintext) {
    const script = `
Add-Type -AssemblyName System.Security
$bytes = [System.Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd())
$protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($protected))
`;
    const result = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { input: plaintext, encoding: "utf8" });
    return result.trim();
}
function windowsUnprotect(base64Ciphertext) {
    const script = `
Add-Type -AssemblyName System.Security
$b64 = [Console]::In.ReadToEnd()
$bytes = [Convert]::FromBase64String($b64)
$plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($plain))
`;
    const result = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { input: base64Ciphertext, encoding: "utf8" });
    return result;
}
function windowsSet(secrets) {
    ensureConfigDir();
    const plaintext = JSON.stringify(secrets);
    const ciphertext = windowsProtect(plaintext);
    fs.writeFileSync(secretsFilePath(), ciphertext, { encoding: "utf8", mode: 0o600 });
}
function windowsGet() {
    let ciphertext;
    try {
        ciphertext = fs.readFileSync(secretsFilePath(), "utf8");
    }
    catch {
        return null;
    }
    const plaintext = windowsUnprotect(ciphertext);
    return JSON.parse(plaintext);
}
function windowsDelete() {
    try {
        fs.unlinkSync(secretsFilePath());
    }
    catch {
        // already gone
    }
}
// --- macOS: Keychain via the `security` CLI -------------------------------
function macSet(secrets) {
    const payload = JSON.stringify(secrets);
    try {
        execFileSync("security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT], {
            stdio: "ignore",
        });
    }
    catch {
        // no existing entry, fine
    }
    execFileSync("security", [
        "add-generic-password",
        "-s", SERVICE,
        "-a", ACCOUNT,
        "-w", payload,
        "-U",
    ]);
}
function macGet() {
    try {
        const payload = execFileSync("security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"], { encoding: "utf8" }).trim();
        return JSON.parse(payload);
    }
    catch {
        return null;
    }
}
function macDelete() {
    try {
        execFileSync("security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT], {
            stdio: "ignore",
        });
    }
    catch {
        // already gone
    }
}
// --- Linux: secret-tool (libsecret), with a file-permission fallback -----
function secretToolAvailable() {
    try {
        execFileSync("secret-tool", ["--version"], { stdio: "ignore" });
        return true;
    }
    catch {
        return false;
    }
}
function linuxSecretToolSet(secrets) {
    const payload = JSON.stringify(secrets);
    execFileSync("secret-tool", ["store", "--label=ConnectWise API credentials (cwplugin)", "service", SERVICE, "account", ACCOUNT], { input: payload });
}
function linuxSecretToolGet() {
    try {
        const payload = execFileSync("secret-tool", ["lookup", "service", SERVICE, "account", ACCOUNT], { encoding: "utf8" }).trim();
        if (!payload)
            return null;
        return JSON.parse(payload);
    }
    catch {
        return null;
    }
}
function linuxSecretToolDelete() {
    try {
        execFileSync("secret-tool", ["clear", "service", SERVICE, "account", ACCOUNT], {
            stdio: "ignore",
        });
    }
    catch {
        // already gone
    }
}
function linuxFileFallbackSet(secrets) {
    ensureConfigDir();
    fs.writeFileSync(secretsFilePath(), JSON.stringify(secrets), {
        encoding: "utf8",
        mode: 0o600,
    });
}
function linuxFileFallbackGet() {
    try {
        const raw = fs.readFileSync(secretsFilePath(), "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function linuxFileFallbackDelete() {
    try {
        fs.unlinkSync(secretsFilePath());
    }
    catch {
        // already gone
    }
}
export function setSecrets(secrets) {
    switch (process.platform) {
        case "win32":
            windowsSet(secrets);
            return { usedFallback: false };
        case "darwin":
            macSet(secrets);
            return { usedFallback: false };
        case "linux":
            if (secretToolAvailable()) {
                linuxSecretToolSet(secrets);
                return { usedFallback: false };
            }
            linuxFileFallbackSet(secrets);
            return { usedFallback: true };
        default:
            throw new KeychainUnavailableError(`Unsupported platform: ${process.platform}`);
    }
}
export function getSecrets() {
    switch (process.platform) {
        case "win32":
            return windowsGet();
        case "darwin":
            return macGet();
        case "linux":
            if (secretToolAvailable()) {
                return linuxSecretToolGet();
            }
            return linuxFileFallbackGet();
        default:
            throw new KeychainUnavailableError(`Unsupported platform: ${process.platform}`);
    }
}
export function deleteSecrets() {
    switch (process.platform) {
        case "win32":
            windowsDelete();
            return;
        case "darwin":
            macDelete();
            return;
        case "linux":
            if (secretToolAvailable()) {
                linuxSecretToolDelete();
            }
            linuxFileFallbackDelete();
            return;
        default:
            throw new KeychainUnavailableError(`Unsupported platform: ${process.platform}`);
    }
}
export { KeychainUnavailableError };
