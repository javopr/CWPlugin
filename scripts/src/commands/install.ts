import { writeConfig, deleteConfig } from "../config.js";
import { setSecrets, deleteSecrets } from "../secretStore.js";
import { resolveCompanyInfo, buildApiBase, testConnection, CwApiError } from "../cwClient.js";
import type { ConfigureArgs, NonSecretConfig } from "../types.js";

export async function configure(args: ConfigureArgs): Promise<unknown> {
  const { fqdn, companyId, clientId, publicKey, privateKey } = args;

  for (const [field, value] of Object.entries({ fqdn, companyId, clientId, publicKey, privateKey })) {
    if (!value || !value.trim()) {
      throw new CwApiError("VALIDATION_ERROR", `Missing required field: ${field}`);
    }
  }

  const companyInfo = await resolveCompanyInfo(fqdn, companyId);
  const apiBase = buildApiBase(fqdn, companyInfo.codebase);

  const config: NonSecretConfig = {
    fqdn,
    companyId,
    clientId,
    apiBase,
    codebase: companyInfo.codebase,
    resolvedAt: new Date().toISOString(),
  };

  await testConnection(config, { publicKey, privateKey });

  const result = setSecrets({ publicKey, privateKey });
  writeConfig(config);

  return {
    ok: true,
    apiBase,
    usedFallbackSecretStorage: result.usedFallback,
    message: result.usedFallback
      ? "Credentials saved. Note: no operating system credential store was found (secret-tool); a local file with restricted permissions was used as a fallback."
      : "Credentials saved in the operating system's native credential store.",
  };
}

export function reset(): unknown {
  deleteConfig();
  deleteSecrets();
  return { ok: true, message: "ConnectWise configuration removed." };
}
