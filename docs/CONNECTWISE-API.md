# Referencia técnica — API de ConnectWise Manage

Este documento resume, para un lector humano, lo que verificamos contra un tenant
real de ConnectWise Manage al construir cwplugin. Es la versión "para personas" de
[`skills/connectwise/reference.md`](../skills/connectwise/reference.md), que es la
versión que usa Claude en tiempo de ejecución (más corta y orientada a instrucciones).

Todo lo que dice **"verificado"** aquí fue probado con una llamada real, no solo leído
en documentación pública — varias cosas resultaron distintas a lo documentado
públicamente, ver [CHANGELOG.md](CHANGELOG.md) para el detalle de cada caso.

## Autenticación

```
Authorization: Basic base64("{companyId}+{publicKey}:{privateKey}")
clientId: {clientId}
Content-Type: application/json
```

El `clientId` es obligatorio desde 2019 — sin él, la API responde 401 aunque las
llaves sean correctas.

## Resolver la URL base del tenant

ConnectWise no tiene una URL de API fija — cada tenant tiene su propio "codebase"
(versión desplegada):

```
GET https://{fqdn}/login/companyinfo/{companyId}   (sin autenticar)
→ { "Codebase": "v4_6_release/", "SiteUrl": "..." }

apiBase = https://{fqdn}/{Codebase}apis/3.0
```

## Búsqueda de tickets

Endpoint: `GET /service/tickets?conditions=...`

**Verificado**: el operador para coincidencia parcial en campos de texto es
`contains`, **no** `like` con comodines `%...%`. Probamos `like '%acme%'` contra un
tenant real y la API lo ignoró silenciosamente — en vez de fallar con un error,
devolvió miles de tickets sin filtrar. Es un modo de falla peligroso: parece que
"funcionó" pero el filtro simplemente no se aplicó.

```
conditions = "id=12345"
conditions = "company/name contains 'acme'"
conditions = "summary contains 'printer'"
conditions = "status/name contains 'open'"
conditions = "recordType='ServiceTicket'"   # o 'ProjectTicket'
```

Combinables con `and`. `orderBy=id desc` pide los tickets más recientes primero.

### Búsqueda por "descripción inicial"

**Verificado**: el ticket **no tiene** un campo plano `initialDescription`. Lo que la
UI de ConnectWise llama "Initial Description" es en realidad la primera nota del
ticket con `detailDescriptionFlag: true` — hay que leerla desde
`/service/tickets/{id}/notes`, no se puede filtrar del lado del servidor.

Por eso cwplugin implementa esta búsqueda en dos niveles: primero filtra por los
campos normales del ticket (rápido, servidor), y solo si el usuario lo pide
explícitamente, revisa las notas de los N tickets más recientes que califican
(acotado, para no tener que escanear notas de todo el tenant).

## Notas de un ticket

Endpoint: `GET /service/tickets/{id}/notes` (paginado con `page`/`pageSize`).

**Verificado**, campos por nota: `id`, `text`, `createdBy`, `dateCreated` (ISO8601
UTC), `detailDescriptionFlag`, `internalAnalysisFlag`, `resolutionFlag`.

Un ticket alimentado por una integración de monitoreo (ej. FortiMonitor) puede
acumular cientos o miles de notas automáticas con el tiempo — si necesitas encontrar
la nota inicial, no hace falta traer el historial completo, siempre es la primera
(`detailDescriptionFlag: true`), normalmente en la primera página.

## Entradas de tiempo

### Listar las existentes

`GET /time/entries?conditions=chargeToId={id}`

### Crear una — `POST /time/entries`

```json
{
  "chargeToType": "ServiceTicket",
  "chargeToId": 12345,
  "timeStart": "2026-09-18T13:00:00Z",
  "timeEnd": "2026-09-18T13:15:00Z",
  "notes": "texto de la nota",
  "workRole": { "name": "Incident Handler" },
  "workType": { "name": "Remote-Standard" },
  "billableOption": "DoNotBill"
}
```

**Verificado** con una entrada real creada de extremo a extremo:

- **Fecha/hora**: rechaza `"YYYY-MM-DDTHH:mm:ss"` sin zona horaria (HTTP 400,
  `UnsupportedFormat`). También rechaza el formato con milisegundos que produce
  `Date#toISOString()` por defecto (`"...ss.sssZ"`). El formato correcto es
  `"YYYY-MM-DDTHH:mm:ssZ"` — UTC, sin milisegundos.
- **`workRole`/`workType`**: sí usan `{ "name": "..." }`, pero el nombre debe
  coincidir **exacto** con uno real del tenant — si no, la API responde
  `NotFound` con un mensaje claro (`"workRole Engineer not found"`). Estos valores
  varían por tenant; nunca asumas nombres comunes como "Engineer" o "Remote
  Support" — pueden no existir.
- **`billableOption`**: `"DoNotBill"` y `"Billable"` confirmados funcionando. Los
  otros valores del enum público (`NoCharge`, `NoDefault`) no se probaron pero
  siguen el mismo patrón.
- **Status del ticket**: si el ticket no permite entradas de tiempo por su status
  actual (ej. `Closed`), la API responde HTTP 400 con un mensaje legible
  ("Please update the status of this ticket before entering time...").

## Listas de Work Roles y Work Types

- `GET /time/workRoles`
- `GET /time/workTypes`

Ambos devuelven `{ id, name, inactiveFlag, ... }`, paginables igual que los demás
listados. **Verificado**: en el tenant de prueba había 19 work roles activos y 114
work types activos (la mayoría variantes "Travel - &lt;ciudad&gt;"). cwplugin los
consulta antes de pedirle al usuario que elija, en vez de asumir nombres — ver el
bug correspondiente en [CHANGELOG.md](CHANGELOG.md).
