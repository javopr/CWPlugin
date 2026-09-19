import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { NonSecretConfig } from "./types.js";

export function configDir(): string {
  // Override used by tests (and available to advanced users) to relocate the
  // config directory instead of ~/.cwplugin.
  return process.env.CWPLUGIN_CONFIG_DIR ?? path.join(os.homedir(), ".cwplugin");
}

function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function ensureConfigDir(): void {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
}

export function readConfig(): NonSecretConfig | null {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    return JSON.parse(raw) as NonSecretConfig;
  } catch {
    return null;
  }
}

export function writeConfig(config: NonSecretConfig): void {
  ensureConfigDir();
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function deleteConfig(): void {
  try {
    fs.unlinkSync(configPath());
  } catch {
    // already gone
  }
}
