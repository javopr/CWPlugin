---
name: connectwise
description: Busca tickets de ConnectWise Manage (Service tickets y Project tickets) por Ticket ID, Company Name, Initial Description o Status, analiza el detalle de un ticket (notas, tiempos, agreement, company, contactos), y crea entradas de tiempo contra un ticket. Usar cuando el usuario mencione ConnectWise, CW, un ticket de soporte o de proyecto, "busca el ticket", "ticket de servicio", "analiza el ticket", "entra horas/tiempo al ticket", registrar tiempo, service board, o project ticket.
---

# ConnectWise Manage — tickets y entradas de tiempo

Este skill conecta la conversacion con ConnectWise Manage a traves de un CLI local
(`${CLAUDE_PLUGIN_ROOT}/scripts/dist/cli.js`). **Nunca llames a la API de ConnectWise
directamente** (ni con curl, ni con fetch improvisado) — siempre invoca este CLI vía
Bash/PowerShell. El CLI es el unico componente que lee las llaves de la API (desde el
almacen de credenciales del sistema operativo) y habla con ConnectWise; tu nunca debes
ver ni repetir esas llaves.

## Como invocar el CLI

**Nunca invoques `node` directamente** — usa siempre el script wrapper del plugin.
El wrapper busca Node.js en las ubicaciones típicas de instalación (no depende de que
`node` esté en el PATH de la sesión actual), así que funciona aunque Node se haya
instalado hace un momento en la misma conversación, sin pedirle al usuario que abra
una terminal nueva o reinicie nada.

- **Windows**: `powershell -NoProfile -File "${CLAUDE_PLUGIN_ROOT}\scripts\run.ps1" <subcomando> --json-args '{"clave":"valor"}'`
- **macOS/Linux**: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" <subcomando> --json-args '{"clave":"valor"}'`

Pasa los argumentos como un unico bloque JSON en `--json-args`. **Para payloads con
mas de 2-3 campos, o en PowerShell en general, usa `--json-file <ruta>` en vez de
`--json-args`** — PowerShell puede re-serializar mal las comillas escapadas dentro de
un argumento de linea de comandos cuando el JSON es largo (esto causo un fallo real
verificado: `add-time-entry` con varios campos fallaba con "JSON no valido" pese a que
el JSON era correcto). `--json-file` evita el problema por completo:

1. Escribe el JSON a un archivo temporal (ej. con la herramienta Write, en el
   directorio de scratchpad).
2. Invoca `... <subcomando> --json-file "<ruta-al-archivo>"`.

Ejemplo: en vez de
`... add-time-entry --json-args '{"ticketId":123,"note":"...", ...}'`, escribe el
JSON a `args.json` y llama `... add-time-entry --json-file "C:\...\args.json"`.

`--json-args` sigue sirviendo bien para payloads cortos de 1-2 campos (ej.
`{"id":12345}` para `get-ticket`).

Si el wrapper responde `{"error":{"code":"NODE_NOT_FOUND", ...}}`, sigue el flujo de
instalación de Node.js descrito en `/cw-install` (pedir confirmación antes de
instalar) y **vuelve a llamar exactamente al mismo comando** — no hace falta ninguna
otra acción, el wrapper vuelve a buscar Node en cada llamada.

Toda respuesta es JSON:
- Éxito: en stdout, siempre con `"ok": true`.
- Error: en stderr, `{"error": {"code": "...", "message": "..."}}` con exit code distinto de 0.

Nunca muestres el JSON crudo al usuario — interpreta el resultado y respondele en
lenguaje natural, en el mismo idioma en que te escribió.

## Subcomandos disponibles

- `configure` — instalación/reconfiguración (ver `/cw-install`).
- `reset` — borra la configuración y las credenciales guardadas.
- `search-tickets` — busca tickets, en dos niveles (ver "Flujo de búsqueda" abajo):
  - **Nivel 1** (rápido, vía la API): `ticketId` (number), `company` (string,
    coincidencia parcial), `summary` (string, coincidencia parcial), `status`
    (string, coincidencia parcial), `recordType` (`"any"` | `"service"` |
    `"project"`).
  - **Nivel 2** (solo cuando el usuario lo pida explícitamente): agrega
    `initialDescription` (string — texto a buscar en la nota inicial/"Detail
    Description" del ticket; ConnectWise no indexa este campo, así que el CLI
    revisa las notas de los tickets candidatos una por una) y opcionalmente
    `noteScanLimit` (number, default 10, máximo 50 — cuántos de los tickets más
    recientes que cumplen el nivel 1 se revisan).
- `get-ticket` — detalle completo. Arg: `id` (number). Devuelve el ticket, **todas**
  sus notas (paginadas por el CLI, no solo la primera página), sus entradas de tiempo,
  agreement, company y contacto.
- `add-time-entry` — crea una entrada de tiempo. Args requeridos: `ticketId` (number),
  `note` (string), `date` (`YYYY-MM-DD`), `startTime`/`endTime` (`HH:mm`), `workRole`
  (string — debe coincidir EXACTO con un nombre real, ver `list-work-roles`),
  `workType` (string — idem, ver `list-work-types`), `billable` (boolean).
- `list-work-roles` / `list-work-types` — devuelven los Work Roles/Work Types reales
  y activos del tenant (`{id, name}`). Úsalos para mostrarle opciones al usuario en
  vez de asumir nombres como "Engineer" — esos valores varían por tenant y dan error
  `NotFound` si no existen exactamente así.
- `test-connection` — valida que las credenciales guardadas funcionan.

## Flujo de búsqueda de tickets (dos niveles)

**Nivel 1 — siempre primero:**

1. Extrae del mensaje del usuario los criterios de nivel 1 que ya haya dado (ticket
   ID, company, summary, status, recordType). No preguntes por criterios que el
   usuario no mencionó — simplemente busca con lo que tengas.
2. Llama a `search-tickets` con solo esos campos (sin `initialDescription`).
3. Si `count === 1`: muestra el resumen del ticket y pregunta si quiere el detalle
   completo.
4. Si `count > 1`: muestra una lista compacta en tabla markdown (ID | Company |
   Resumen | Status | Board) y pide que el usuario elija cuál.
5. Si `count === 0`: dile al usuario explícitamente que no hubo resultados a nivel 1.
   Si el usuario mencionó texto que suena a contenido de la descripción/nota inicial
   (no un criterio de nivel 1), **pregúntale si quiere que revises las notas de los
   últimos N tickets** que cumplan los demás criterios (por defecto los últimos 10;
   puedes ofrecer un número distinto si lo pide) — no lo hagas automáticamente sin
   preguntar, porque implica revisar tickets uno por uno y toma más tiempo.

**Nivel 2 — solo si el usuario confirma que quiere buscar en notas:**

6. Llama a `search-tickets` otra vez, ahora con `initialDescription` (el texto a
   buscar) más los criterios de nivel 1 que apliquen, y `noteScanLimit` si el usuario
   pidió un número distinto de 10.
7. El resultado incluye `scannedTicketCount` (cuántos tickets se revisaron). Si
   `count === 0`, dile al usuario cuántos tickets se revisaron y ofrece aumentar
   `noteScanLimit` o acotar más los criterios de nivel 1 (ej. compañía) para que los
   últimos N tickets candidatos sean más relevantes.
8. Si hay resultados, preséntalos igual que en el nivel 1 (uno solo → resumen +
   ofrecer detalle; varios → tabla de disambiguación).

**Detalle de un ticket (ambos niveles):**

9. Cuando el usuario pida "detalle", "analiza", o similar sobre un ticket específico,
   llama a `get-ticket` y presenta la información organizada en secciones: Resumen,
   Status/Board, Company/Contacto, Notas (de más reciente a más antigua; si son
   muchas, resume las más antiguas y detalla las recientes), Entradas de tiempo,
   Agreement.

## Flujo de entrada de tiempo

1. Extrae del mensaje del usuario lo que ya haya dado: ticket, nota, fecha, hora de
   inicio, hora de fin, work role, work type, billable (sí/no).
2. Para cada campo que falte, pregúntalo en la conversación normal (este skill no
   puede invocar formularios; solo puede conversar). Puedes agrupar varias preguntas
   en un mismo mensaje si faltan varios campos.
3. **Para work role y work type, nunca le pidas al usuario que escriba el nombre a
   ciegas** — llama a `list-work-roles`/`list-work-types` y deja que elija de la
   lista real:
   - **`list-work-roles`**: normalmente son pocos (el tenant de prueba tenía 19).
     **Muestra la lista COMPLETA siempre**, nunca la recortes.
   - **`list-work-types`**: puede haber muchos (el tenant de prueba tenía 114, la
     mayoría variantes de "Travel - <ciudad>"). Aquí sí puedes acortar: si el
     usuario ya dio una pista del tipo (ej. "remoto", "onsite"), filtra la lista
     por esa palabra y muéstrale solo las que calzan; si no dio ninguna pista,
     muéstrale las más comunes/genéricas primero (ej. las que no empiezan con
     "Travel -") y ofrece buscar por palabra clave si no encuentra la que busca.
     Nunca inventes ni asumas un work type — siempre debe venir de esta lista.
   - Si el usuario ya mencionó un nombre de role o type, verifica que coincida
     EXACTO con uno real de la lista antes de continuar; si no coincide, muéstrale
     las opciones más parecidas de la lista real (nunca lo pases sin verificar).
4. Antes de llamar a `add-time-entry`, confirma con el usuario un resumen de una
   línea (ej. "2h en el ticket #12345, 2026-09-18 09:00–11:00, no facturable, role
   Incident Handler, tipo Remote-Standard, nota: '...' — ¿confirmas?"). Es una
   escritura con efecto secundario real en ConnectWise: siempre pide confirmación
   explícita antes de ejecutar.
5. Llama a `add-time-entry` solo después de la confirmación. Si el ticket no permite
   entradas de tiempo por su status actual (ConnectWise devuelve un mensaje explícito
   al respecto), dile al usuario que el status del ticket lo bloquea y que debe
   cambiarlo primero en ConnectWise.

## Manejo de errores (por código)

| code | Qué decirle al usuario |
|---|---|
| `NOT_CONFIGURED` | ConnectWise no está configurado. Sugiere ejecutar `/cw-install`. |
| `AUTH_INVALID` / `AUTH_MISSING_CLIENTID` | Las credenciales no son válidas o falta el Client ID. Sugiere `/cw-install` para reconfigurar. |
| `RATE_LIMITED` | ConnectWise está limitando las solicitudes; el CLI ya reintentó una vez. Avisa que se debe esperar un momento y reintentar. |
| `NOT_FOUND` | No existe ese ticket/recurso. Confírmale el ID al usuario. |
| `NETWORK_ERROR` | Problema de conectividad o FQDN incorrecto. Sugiere revisar el FQDN con `/cw-install`. |
| `VALIDATION_ERROR` | Faltan campos — dile exactamente cuáles (vienen en `details.missing` cuando aplica) y pregúntalos. |
| `KEYCHAIN_UNAVAILABLE` | El almacén de credenciales del sistema operativo no está disponible; revisa la nota de instalación. |

## Referencia detallada

Para la sintaxis exacta de `conditions=`, la forma exacta del payload de
`/time/entries`, y los nombres de campo confirmados contra el tenant real, consulta
`skills/connectwise/reference.md` (se carga solo cuando haga falta ese nivel de
detalle).
