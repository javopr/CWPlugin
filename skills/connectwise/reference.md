# Referencia técnica — ConnectWise Manage API

> **Estado: Fase 0 completada (2026-09-18).** Todo lo marcado como VERIFICADO en este
> archivo fue probado end-to-end contra un tenant real (busqueda de tickets en sus dos
> niveles, detalle de ticket con notas, y creación real de una entrada de tiempo). Los
> puntos que quedan como "A CONFIRMAR" no bloquean el uso normal del plugin.

## Autenticación

```
Authorization: Basic base64("{companyId}+{publicKey}:{privateKey}")
clientId: {clientId}
Content-Type: application/json
```

## Resolución de la base URL

```
GET https://{fqdn}/login/companyinfo/{companyId}   (sin autenticar)
→ { "Codebase": "v2024_1/", "SiteUrl": "..." }

apiBase = https://{fqdn}/{Codebase}apis/3.0
```

## Búsqueda de tickets — `GET /service/tickets` (dos niveles)

### Nivel 1 — filtros server-side

Query param `conditions`, **VERIFICADO contra un tenant real** — el operador correcto
para coincidencia parcial en campos de texto es `contains`, NO `like '%...%'` (`like`
con comodines `%` fue probado contra un tenant real y la API lo ignoro silenciosamente,
devolviendo miles de tickets sin filtrar en vez de fallar con un error — cuidado con
ese modo de falla silencioso si se agregan mas condiciones en el futuro, siempre
probar contra datos reales, no asumir):

```
conditions = "id=12345"
conditions = "company/name contains 'acme'"
conditions = "summary contains 'printer'"
conditions = "status/name contains 'open'"
conditions = "recordType='ServiceTicket'"   # o 'ProjectTicket'
```

Combinables con `and`. `orderBy=id desc` funciona para pedir los tickets mas
recientes primero (usado por el nivel 2, ver abajo).

### Nivel 2 — búsqueda por descripción inicial (notas)

**VERIFICADO contra un tenant real (Fase 0, 2026-09-18): el ticket NO tiene un campo
plano `initialDescription`.** Lo que ConnectWise llama "Initial Description" en la UI
es en realidad la primera nota del ticket con `detailDescriptionFlag: true` (ver
`/service/tickets/{id}/notes` mas abajo) — no es filtrable server-side.

Diseño (decidido con el usuario tras probar y descartar un enfoque de "traer todos los
candidatos y filtrar" que era lento/pesado contra tenants reales con muchos tickets):
`search-tickets` con `initialDescription` presente pide al API los `noteScanLimit`
tickets mas recientes (`orderBy=id desc`, default 10, maximo 50) que cumplan los
filtros de nivel 1, y revisa la nota inicial de cada uno, uno por uno, del lado del
cliente. Es una operacion explicita — el skill debe preguntarle al usuario antes de
activarla, normalmente porque una busqueda de nivel 1 no encontro nada. Implementado
en `scripts/src/commands/searchTickets.ts`.

## Notas — `GET /service/tickets/{id}/notes`

Paginar con `page`/`pageSize` hasta que una página devuelva menos elementos que el
tamaño pedido. **VERIFICADO contra un tenant real:** campos confirmados por nota:
`id`, `text`, `createdBy`, `dateCreated` (ISO8601 UTC), `detailDescriptionFlag`,
`internalAnalysisFlag`, `resolutionFlag` — la nota inicial del ticket es la que tiene
`detailDescriptionFlag: true`.

## Entradas de tiempo existentes — `GET /time/entries?conditions=chargeToId={id}`

## Crear entrada de tiempo — `POST /time/entries`

```json
{
  "chargeToType": "ServiceTicket",
  "chargeToId": 12345,
  "timeStart": "2026-09-18T09:00:00",
  "timeEnd": "2026-09-18T11:00:00",
  "notes": "texto de la nota",
  "workRole": { "name": "Engineer" },
  "workType": { "name": "Remote Support" },
  "billableOption": "Billable"
}
```

**VERIFICADO contra un tenant real (Fase 0), con un POST exitoso de extremo a
extremo (entrada de tiempo real #1420629 en el ticket 1173650, 2026-09-18):**
- `timeStart`/`timeEnd` en formato `"YYYY-MM-DDTHH:mm:ss"` sin zona horaria son
  rechazados con HTTP 400 `UnsupportedFormat`. El formato con milisegundos
  (`"...ss.sssZ"`, lo que produce `Date#toISOString()` sin modificar) **tambien** es
  rechazado. El formato correcto es ISO 8601 en UTC **sin milisegundos**:
  `"YYYY-MM-DDTHH:mm:ssZ"` (ej. `"2026-09-18T13:00:00Z"`). El CLI convierte la
  fecha/hora local de la maquina a UTC y recorta los milisegundos. Implementado en
  `scripts/src/commands/addTimeEntry.ts` (`toIsoDateTime`).
- `workRole`/`workType` SI usan `{ "name": "..." }` (no `{ "id": N }`) — pero el
  nombre debe coincidir EXACTO con uno real del tenant (`NotFound` si no existe).
  **No hay que pedirle al usuario que recuerde el nombre exacto** — el CLI expone
  `list-work-roles` y `list-work-types` (`GET /time/workRoles` y
  `GET /time/workTypes`, filtrando `inactiveFlag`) para que el skill le muestre las
  opciones reales antes de pedir confirmación. Implementado en
  `scripts/src/commands/listOptions.ts`.
- `billableOption` confirmado: `"DoNotBill"` funciona para `billable:false`. Los
  otros valores del enum (`Billable`, `NoCharge`, `NoDefault`) no se probaron
  explicitamente pero son los documentados públicamente y siguen el mismo patrón.
- Un ticket con status que no permite entradas de tiempo (ej. `Closed`) responde
  HTTP 400 con `code: "TimeEntryApi"` y un mensaje legible
  ("Please update the status of this ticket before entering time..."). El CLI
  actualmente deja que este error pase como `UNKNOWN_ERROR` (HTTP 400 generico);
  si se vuelve un caso frecuente, vale la pena darle un `ErrorCode` propio.

## Listas de opciones — `GET /time/workRoles`, `GET /time/workTypes`

**VERIFICADO contra un tenant real.** Ambos devuelven `{ id, name, inactiveFlag, ... }`
paginable igual que los demas listados. El tenant de prueba tenia 19 work roles y 114
work types activos. Usar estos endpoints (vía `list-work-roles`/`list-work-types`) en
vez de asumir nombres como "Engineer" o "Remote Support" — esos NO existen en todos
los tenants y dan `NotFound` en el POST de `/time/entries`.
