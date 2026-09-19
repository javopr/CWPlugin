import * as http from "http";

// Minimal mock of the ConnectWise Manage REST surface used by cwplugin's CLI.
// No framework dependency, consistent with the CLI's zero-dependency design.

const VALID_COMPANY_ID = "testco";
const VALID_CLIENT_ID = "test-client-id";
const VALID_PUBLIC_KEY = "test-public-key";
const VALID_PRIVATE_KEY = "test-private-key";
const CODEBASE = "v2024_1/";

// ConnectWise stores Service Desk tickets and Project module tickets in two
// genuinely separate resources — /service/tickets never returns project work
// items, and /project/tickets records have no `recordType` field (they use
// `isIssueFlag` instead). Verified against a real tenant.
const FIXTURE_SERVICE_TICKETS = [
  {
    id: 1001,
    summary: "La impresora de la oficina no imprime",
    company: { name: "Acme Corp", identifier: "acme" },
    status: { name: "Open" },
    board: { name: "Service Board" },
    recordType: "ServiceTicket",
    location: { id: 11 },
  },
];

// Tenant-wide work role list — a superset of what any single Location allows.
const FIXTURE_WORK_ROLES = [
  { id: 1, name: "Engineer", inactiveFlag: false },
  { id: 2, name: "Manager", inactiveFlag: false },
  { id: 3, name: "Old Role", inactiveFlag: true },
];

// ConnectWise restricts selectable work roles per ticket Location — verified
// against a real tenant. This location only allows "Engineer" (plus an inactive
// role that must be filtered out), deliberately missing "Manager" so tests can
// prove ticket-scoped lookup differs from the tenant-wide list above.
const FIXTURE_LOCATION_WORK_ROLES = {
  11: [
    { workRole: { id: 1, name: "Engineer" }, workRoleInactiveFlag: false },
    { workRole: { id: 3, name: "Old Role" }, workRoleInactiveFlag: true },
  ],
};

const FIXTURE_PROJECT_TICKETS = [
  {
    id: 1002,
    summary: "Migracion de servidor de archivos",
    company: { name: "Acme Corp", identifier: "acme" },
    status: { name: "In Progress" },
    board: { name: "Project Board" },
    isIssueFlag: false,
  },
];

const FIXTURE_NOTES = {
  1001: [
    { id: 1, text: "Nota inicial: impresora sin respuesta.", detailDescriptionFlag: true, internalAnalysisFlag: false, resolutionFlag: false },
    { id: 2, text: "Se reinicio la impresora, sigue igual.", detailDescriptionFlag: false, internalAnalysisFlag: true, resolutionFlag: false },
  ],
  1002: [],
};

function isAuthorized(req) {
  const auth = req.headers["authorization"] || "";
  const clientId = req.headers["clientid"] || "";
  if (clientId !== VALID_CLIENT_ID) return false;
  const expected = `Basic ${Buffer.from(`${VALID_COMPANY_ID}+${VALID_PUBLIC_KEY}:${VALID_PRIVATE_KEY}`).toString("base64")}`;
  return auth === expected;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

function matchesSingleClause(ticket, clause) {
  const idMatch = clause.match(/^id=(\d+)$/);
  if (idMatch) return ticket.id === Number(idMatch[1]);

  const likeMatch = clause.match(/^(\S+) like '%(.*)%'$/);
  if (likeMatch) {
    const [, field, value] = likeMatch;
    const actual = field
      .split("/")
      .reduce((obj, key) => (obj ? obj[key] : undefined), ticket);
    return String(actual ?? "").toLowerCase().includes(value.toLowerCase());
  }

  const containsMatch = clause.match(/^(\S+) contains '(.*)'$/);
  if (containsMatch) {
    const [, field, value] = containsMatch;
    const actual = field
      .split("/")
      .reduce((obj, key) => (obj ? obj[key] : undefined), ticket);
    return String(actual ?? "").toLowerCase().includes(value.toLowerCase());
  }

  const eqMatch = clause.match(/^(\S+)='(.*)'$/);
  if (eqMatch) {
    const [, field, value] = eqMatch;
    return ticket[field] === value;
  }

  return true;
}

function matchesConditions(ticket, conditions) {
  if (!conditions) return true;
  const clauses = conditions.split(" and ");
  return clauses.every((clause) => {
    const orGroup = clause.match(/^\((.+)\)$/);
    if (orGroup) {
      return orGroup[1].split(" or ").some((sub) => matchesSingleClause(ticket, sub));
    }
    return matchesSingleClause(ticket, clause);
  });
}

export function startMockServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname.startsWith("/login/companyinfo/")) {
      sendJson(res, 200, { Codebase: CODEBASE, SiteUrl: "https://mock.example.com" });
      return;
    }

    if (!isAuthorized(req)) {
      sendJson(res, 401, { message: "invalid credentials or missing clientId" });
      return;
    }

    // The real CLI builds apiBase as https://{fqdn}/{codebase}apis/3.0, so every
    // authenticated request arrives prefixed with "/{codebase}apis/3.0" — strip
    // that prefix here to get the logical path used in the checks below.
    const apiPrefix = `/${CODEBASE}apis/3.0`;
    const logicalPath = url.pathname.startsWith(apiPrefix)
      ? url.pathname.slice(apiPrefix.length)
      : url.pathname;

    if (logicalPath === "/system/info") {
      sendJson(res, 200, { version: "mock-1.0" });
      return;
    }

    if (logicalPath === "/service/tickets" || logicalPath === "/project/tickets") {
      const fixture = logicalPath === "/service/tickets" ? FIXTURE_SERVICE_TICKETS : FIXTURE_PROJECT_TICKETS;
      const conditions = url.searchParams.get("conditions");
      const page = Number(url.searchParams.get("page") || "1");
      const filtered = fixture.filter((t) => matchesConditions(t, conditions));
      sendJson(res, 200, page === 1 ? filtered : []);
      return;
    }

    const ticketMatch = logicalPath.match(/^\/(service|project)\/tickets\/(\d+)$/);
    if (ticketMatch) {
      const fixture = ticketMatch[1] === "service" ? FIXTURE_SERVICE_TICKETS : FIXTURE_PROJECT_TICKETS;
      const ticket = fixture.find((t) => t.id === Number(ticketMatch[2]));
      if (!ticket) {
        sendJson(res, 404, { message: "not found" });
        return;
      }
      sendJson(res, 200, ticket);
      return;
    }

    const notesMatch = logicalPath.match(/^\/(service|project)\/tickets\/(\d+)\/notes$/);
    if (notesMatch) {
      const page = Number(url.searchParams.get("page") || "1");
      const notes = FIXTURE_NOTES[Number(notesMatch[2])] || [];
      sendJson(res, 200, page === 1 ? notes : []);
      return;
    }

    if (logicalPath === "/time/workRoles") {
      const page = Number(url.searchParams.get("page") || "1");
      sendJson(res, 200, page === 1 ? FIXTURE_WORK_ROLES : []);
      return;
    }

    const locationRolesMatch = logicalPath.match(/^\/system\/locations\/(\d+)\/workroles$/);
    if (locationRolesMatch) {
      const page = Number(url.searchParams.get("page") || "1");
      const roles = FIXTURE_LOCATION_WORK_ROLES[Number(locationRolesMatch[1])] || [];
      sendJson(res, 200, page === 1 ? roles : []);
      return;
    }

    if (logicalPath === "/time/entries" && req.method === "GET") {
      const page = Number(url.searchParams.get("page") || "1");
      sendJson(res, 200, page === 1 ? [] : []);
      return;
    }

    if (logicalPath === "/time/entries" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const parsed = JSON.parse(body);
        sendJson(res, 200, { id: 9999, ...parsed });
      });
      return;
    }

    sendJson(res, 404, { message: `unhandled mock route: ${req.method} ${url.pathname}` });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        fqdn: `127.0.0.1:${port}`,
        companyId: VALID_COMPANY_ID,
        clientId: VALID_CLIENT_ID,
        publicKey: VALID_PUBLIC_KEY,
        privateKey: VALID_PRIVATE_KEY,
        apiBase: `http://127.0.0.1:${port}/apis/3.0`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
