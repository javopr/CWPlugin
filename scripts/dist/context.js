import { readConfig } from "./config.js";
import { getSecrets } from "./secretStore.js";
import { CwApiError } from "./cwClient.js";
export function loadContext() {
    const config = readConfig();
    if (!config) {
        throw new CwApiError("NOT_CONFIGURED", "ConnectWise no esta configurado todavia. Ejecuta /cw-install para configurar FQDN, Company ID, Client ID y las llaves de API.");
    }
    const secrets = getSecrets();
    if (!secrets) {
        throw new CwApiError("NOT_CONFIGURED", "Faltan las llaves de API de ConnectWise en el almacen de credenciales. Ejecuta /cw-install para reconfigurar.");
    }
    return { config, secrets };
}
