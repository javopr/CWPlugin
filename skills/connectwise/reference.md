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

## Búsqueda de tickets — dos endpoints, no un filtro (dos niveles)

**VERIFICADO contra un tenant real (2026-09-19): `/service/tickets` y
`/project/tickets` son dos recursos genuinamente separados, NO el mismo recurso
filtrado por `recordType`.** Este fue un error real de una primera implementación:
se asumió que `conditions=recordType='ProjectTicket'` sobre `/service/tickets`
traería los tickets de proyecto — devolvía siempre `[]`. Confirmado también contra
la documentación oficial (developer.connectwise.com/Products/ConnectWise_PSA/REST):
`ProjectTickets` y `ProjectTicketNotes` son tags/recursos propios, distintos de
`Tickets`/`ServiceTicketNotes`. Diferencias concretas verificadas:

- Un ticket de `/project/tickets` **no tiene el campo `recordType`** (viene
  `undefined`) — usa `isIssueFlag` (`true`/`false`) para distinguir un "Project
  Ticket" de un "Project Issue" dentro del módulo Projects.
- El espacio de IDs no es compartido de forma transparente: `GET
  /service/tickets/{id}` con el ID de un project ticket responde **404** ("Ticket
  not found"), aunque ese ID sí exista en `/project/tickets/{id}`.
- Por eso `scripts/src/ticketResolver.ts` (`resolveTicket`) prueba primero
  `/service/tickets/{id}` y, si da 404, cae a `/project/tickets/{id}` — lo usan
  `get-ticket`, `add-time-entry` y `list-work-roles` para no asumir cuál es.

`search-tickets` con `recordType: "service"` consulta solo `/service/tickets`;
`recordType: "project"` consulta solo `/project/tickets`; `"any"`/sin especificar
consulta **ambos** y combina resultados (antes de este fix, "any" solo miraba
`/service/tickets` y silenciosamente nunca traía project tickets).

### Filtros server-side (`conditions`) — mismos operadores en ambos endpoints

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
```

Combinables con `and`. `orderBy=id desc` funciona para pedir los tickets mas
recientes primero (usado por el nivel 2, ver abajo). **VERIFICADO que ambos
endpoints soportan los mismos operadores** (`id=`, `contains`, `orderBy`) —
probado con `company/name contains 'X'` y `id=X` directamente contra
`/project/tickets`.

**Paginación**: cada request a `/service/tickets` o `/project/tickets` trae como
máximo `pageSize` resultados (100 por defecto en `search-tickets`) — para
compañías con más tickets que eso, hay que paginar (`requestAllPages`, como ya
hace `get-ticket` para notas/tiempo) o el resultado queda truncado sin avisar.
`search-tickets` actualmente **no** pagina automáticamente; es una limitación
conocida, pendiente de arreglar si se vuelve un problema recurrente.

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

## Notas — `GET /service/tickets/{id}/notes` o `GET /project/tickets/{id}/notes`

El path correcto depende de en cuál de los dos endpoints vive el ticket (ver
sección anterior) — `ticketResolver.ts` ya resuelve esto y expone `notesPath`.
Paginar con `page`/`pageSize` hasta que una página devuelva menos elementos que el
tamaño pedido. **VERIFICADO contra un tenant real:** campos confirmados por nota:
`id`, `text`, `createdBy`, `dateCreated` (ISO8601 UTC), `detailDescriptionFlag`,
`internalAnalysisFlag`, `resolutionFlag` — la nota inicial del ticket es la que tiene
`detailDescriptionFlag: true`.

## Entradas de tiempo existentes — `GET /time/entries?conditions=chargeToId={id}`

Funciona igual sin importar si el ticket es Service o Project — `chargeToId` es el
mismo ID del ticket en cualquiera de los dos endpoints.

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
  "billableOption": "Billable",
  "addToDetailDescriptionFlag": true,
  "addToInternalAnalysisFlag": false,
  "addToResolutionFlag": false
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
  `list-work-roles` y `list-work-types` (ver abajo) para que el skill le muestre las
  opciones reales antes de pedir confirmación. Implementado en
  `scripts/src/commands/listOptions.ts`.
- **`chargeToType` depende de dónde vive el ticket**: `"ServiceTicket"` para
  tickets de `/service/tickets`; para `/project/tickets`, `"ProjectTicket"` o
  `"ProjectIssue"` según el `isIssueFlag` del ticket. `ticketResolver.ts` calcula
  esto automáticamente — nunca asumir `"ServiceTicket"` a ciegas, un project
  ticket con el `chargeToType` equivocado falla.
- **`addToDetailDescriptionFlag`/`addToInternalAnalysisFlag`/`addToResolutionFlag`**:
  VERIFICADO contra un time entry real del tenant — son los tres checkboxes de
  "tipo de nota" (Discussion/Internal/Resolution) que ConnectWise muestra al
  entrar tiempo; exactamente uno debe ser `true`. El CLI expone esto como
  `noteType` en `add-time-entry` (default `"Discussion"`, igual que ConnectWise).
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

**IMPORTANTE — Work Role no es solo tenant-wide.** VERIFICADO contra un tenant real:
de 19 work roles activos en el tenant, un ticket específico solo permitía 16 —
ConnectWise restringe cuáles son seleccionables por la **Location** del ticket
(`ticket.location.id`, presente tanto en tickets de `/service/tickets` como de
`/project/tickets`), vía `GET /system/locations/{locationId}/workroles`. Cada
elemento trae `{ workRole: {id, name}, workRoleInactiveFlag }` — filtrar por
`workRoleInactiveFlag === false`. `list-work-roles` acepta `ticketId`, resuelve el
ticket (`ticketResolver`), y usa esa lista en vez de la tenant-wide. **No existe**
un endpoint equivalente para Work Type (`/system/locations/{id}/worktypes` da 404)
— Work Type sí es tenant-wide sin restricción adicional conocida.
