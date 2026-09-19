import type { CliError, ErrorCode, NonSecretConfig, Secrets } from "./types.js";

export class CwApiError extends Error {
  code: ErrorCode;
  httpStatus?: number;
  details?: unknown;

  constructor(code: ErrorCode, message: string, httpStatus?: number, details?: unknown) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  toCliError(): CliError {
    return {
      error: {
        code: this.code,
        message: this.message,
        httpStatus: this.httpStatus,
        details: this.details,
      },
    };
  }
}

export interface CompanyInfo {
  codebase: string; // e.g. "v2024_1/"
  siteUrl?: string;
}

function scheme(): string {
  // Test-only escape hatch so the mock HTTP server can stand in for a real
  // ConnectWise tenant without needing TLS. Never set this in production use.
  return process.env.CWPLUGIN_TEST_INSECURE_HTTP === "1" ? "http" : "https";
}

export async function resolveCompanyInfo(fqdn: string, companyId: string): Promise<CompanyInfo> {
  const url = `${scheme()}://${fqdn}/login/companyinfo/${encodeURIComponent(companyId)}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET" });
  } catch (err) {
    throw new CwApiError("NETWORK_ERROR", `No se pudo contactar ${fqdn}. Verifica el FQDN. (${(err as Error).message})`);
  }
  if (!res.ok) {
    throw new CwApiError(
      "NETWORK_ERROR",
      `companyinfo respondio ${res.status} para company "${companyId}". Verifica el FQDN y el Company ID.`,
      res.status
    );
  }
  const body = (await res.json()) as { Codebase?: string; SiteUrl?: string };
  if (!body.Codebase) {
    throw new CwApiError("NETWORK_ERROR", "La respuesta de companyinfo no incluyo el campo Codebase.");
  }
  return { codebase: body.Codebase, siteUrl: body.SiteUrl };
}

export function buildApiBase(fqdn: string, codebase: string): string {
  const normalizedCodebase = codebase.endsWith("/") ? codebase : `${codebase}/`;
  return `${scheme()}://${fqdn}/${normalizedCodebase}apis/3.0`;
}

function authHeaders(config: NonSecretConfig, secrets: Secrets): Record<string, string> {
  const credentials = `${config.companyId}+${secrets.publicKey}:${secrets.privateKey}`;
  const encoded = Buffer.from(credentials, "utf8").toString("base64");
  return {
    Authorization: `Basic ${encoded}`,
    clientId: config.clientId,
    "Content-Type": "application/json",
  };
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string; // e.g. "/service/tickets"
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

function buildUrl(apiBase: string, opts: RequestOptions): string {
  const url = new URL(`${apiBase}${opts.path}`);
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function rawRequest(
  config: NonSecretConfig,
  secrets: Secrets,
  opts: RequestOptions
): Promise<Response> {
  const url = buildUrl(config.apiBase, opts);
  try {
    return await fetch(url, {
      method: opts.method ?? "GET",
      headers: authHeaders(config, secrets),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    throw new CwApiError("NETWORK_ERROR", `Fallo de red llamando a ConnectWise: ${(err as Error).message}`);
  }
}

async function toApiError(res: Response): Promise<CwApiError> {
  let details: unknown;
  try {
    details = await res.json();
  } catch {
    details = undefined;
  }
  if (res.status === 401) {
    const message = JSON.stringify(details ?? "");
    if (message.toLowerCase().includes("clientid")) {
      return new CwApiError(
        "AUTH_MISSING_CLIENTID",
        "El header clientId parece invalido o falta. Verifica el Client ID registrado en developer.connectwise.com.",
        401,
        details
      );
    }
    return new CwApiError(
      "AUTH_INVALID",
      "Las credenciales de ConnectWise no son validas o expiraron. Ejecuta /cw-install para reconfigurar.",
      401,
      details
    );
  }
  if (res.status === 404) {
    return new CwApiError("NOT_FOUND", "No se encontro el recurso solicitado en ConnectWise.", 404, details);
  }
  if (res.status === 429) {
    return new CwApiError("RATE_LIMITED", "ConnectWise esta limitando las solicitudes (429). Intenta de nuevo en un momento.", 429, details);
  }
  return new CwApiError(
    "UNKNOWN_ERROR",
    `ConnectWise respondio con un error inesperado (HTTP ${res.status}).`,
    res.status,
    details
  );
}

/** Authenticated request with one retry on 429 honoring Retry-After. */
export async function request<T>(
  config: NonSecretConfig,
  secrets: Secrets,
  opts: RequestOptions
): Promise<T> {
  let res = await rawRequest(config, secrets, opts);
  if (res.status === 429) {
    const retryAfterHeader = res.headers.get("Retry-After");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 2000;
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterMs, 10000)));
    res = await rawRequest(config, secrets, opts);
  }
  if (!res.ok) {
    throw await toApiError(res);
  }
  return (await res.json()) as T;
}

const MAX_PAGES_SAFETY_CAP = 25;

/** Paginate through a list endpoint, collecting all pages. */
export async function requestAllPages<T>(
  config: NonSecretConfig,
  secrets: Secrets,
  opts: RequestOptions,
  pageSize = 1000
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  // ConnectWise caps pageSize (commonly at 1000); loop until a short page is
  // returned. MAX_PAGES_SAFETY_CAP is a hard stop so a pagination quirk (or a
  // record with a genuinely huge number of children, e.g. a ticket flooded
  // with automated monitoring notes) can never hang a call indefinitely.
  while (true) {
    const pageResults = await request<T[]>(config, secrets, {
      ...opts,
      query: { ...opts.query, page, pageSize },
    });
    results.push(...pageResults);
    if (pageResults.length < pageSize) break;
    page += 1;
    if (page > MAX_PAGES_SAFETY_CAP) {
      throw new CwApiError(
        "UNKNOWN_ERROR",
        `Se alcanzo el limite de seguridad de paginacion (${MAX_PAGES_SAFETY_CAP} paginas de ${pageSize}) en ${opts.path}. Hay mas datos de los esperados; acota la consulta.`
      );
    }
  }
  return results;
}

export async function testConnection(config: NonSecretConfig, secrets: Secrets): Promise<void> {
  await request(config, secrets, { path: "/system/info" });
}
