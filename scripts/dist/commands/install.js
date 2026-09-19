import { writeConfig, deleteConfig } from "../config.js";
import { setSecrets, deleteSecrets } from "../secretStore.js";
import { resolveCompanyInfo, buildApiBase, testConnection, CwApiError } from "../cwClient.js";
export async function configure(args) {
    const { fqdn, companyId, clientId, publicKey, privateKey } = args;
    for (const [field, value] of Object.entries({ fqdn, companyId, clientId, publicKey, privateKey })) {
        if (!value || !value.trim()) {
            throw new CwApiError("VALIDATION_ERROR", `Falta el campo requerido: ${field}`);
        }
    }
    const companyInfo = await resolveCompanyInfo(fqdn, companyId);
    const apiBase = buildApiBase(fqdn, companyInfo.codebase);
    const config = {
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
            ? "Credenciales guardadas. Nota: no se encontro un almacen de credenciales del sistema operativo (secret-tool); se uso un archivo local con permisos restringidos como respaldo."
            : "Credenciales guardadas en el almacen nativo del sistema operativo.",
    };
}
export function reset() {
    deleteConfig();
    deleteSecrets();
    return { ok: true, message: "Configuracion de ConnectWise eliminada." };
}
