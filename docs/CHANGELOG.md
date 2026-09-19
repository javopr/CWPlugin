# Changelog — cwplugin

Todas las versiones fueron probadas contra un tenant real de ConnectWise Manage
antes de publicarse (no solo contra el servidor mock de pruebas).

## 1.1.2

**Corregido**

- `list-work-roles` devolvía TODOS los Work Roles activos del tenant, pero
  ConnectWise restringe cuáles son realmente seleccionables por la **Location**
  del ticket — un tenant real con 19 roles activos solo permitía 16 para un
  ticket específico. Ofrecer los 3 que faltaban confundía al usuario porque ni
  siquiera aparecían como opción en su propio ConnectWise. Ahora `list-work-roles`
  acepta `ticketId` y filtra por `/system/locations/{id}/workroles` de ese
  ticket; sin `ticketId` cae de vuelta a la lista completa del tenant.
  - **Cómo se encontró**: el usuario reportó "a mi me salen 16" viendo la lista
    completa de 19 que le mostré, y confirmó que uno de los roles que le
    sugerí ("US - Network Engineer, Senior") no le aparece como opción real.

**Agregado**

- Se definió un umbral explícito para "muchas notas" al presentar el detalle de un
  ticket: 100 o menos se muestran todas completas; más de 100, se detallan las 100
  más recientes y se resume el resto. Antes la instrucción decía "si son muchas"
  sin ningún número, lo cual era inconsistente entre conversaciones.
- `add-time-entry` ahora acepta `noteType` (`"Discussion"` | `"Internal"` |
  `"Resolution"`, default `"Discussion"`) — mapea a los mismos tres checkboxes
  de tipo de nota que ConnectWise muestra al entrar tiempo (verificado contra un
  time entry real del tenant: `addToDetailDescriptionFlag`,
  `addToInternalAnalysisFlag`, `addToResolutionFlag`).
- El flujo del skill para elegir Work Role/Work Type/billable/noteType ahora usa
  el selector de opciones (AskUserQuestion) en vez de listas de texto plano, en
  tandas de 4 cuando hay más opciones, sin inventar un orden de "más probables".

**Mejorado**

- La búsqueda de tickets por palabra clave (`summary`) ya no se rinde con cero
  resultados cuando el usuario pregunta en un idioma distinto al de los datos. El
  skill ahora prueba automáticamente la traducción del término (español↔inglés) y
  sinónimos obvios antes de decir que no encontró nada, y combina los resultados de
  todas las variantes en una sola respuesta.
  - **Cómo se encontró**: el usuario pidió que la búsqueda "no fuera tan literal" —
    buscar "migración" no encontraba tickets redactados en inglés como "migration
    plan" en el mismo tenant.

**Corregido**

- La búsqueda de "project tickets" (`recordType: "project"`) no encontraba nada en un
  tenant real. La causa: dentro del módulo Projects de ConnectWise, un ítem de
  trabajo puede quedar guardado como `recordType='ProjectTicket'` **o** como
  `recordType='ProjectIssue'`, según cómo el tenant trackee el trabajo del proyecto —
  este plugin solo filtraba por `ProjectTicket`. Ahora `search-tickets` con
  `recordType: "project"` filtra por ambos con un `or`.
  - **Cómo se encontró**: un usuario buscó un project ticket real de un cliente y la
    búsqueda devolvió cero resultados incluso sin ningún otro filtro, aunque la
    compañía y los service tickets sí se encontraban bien.

**Cambiado**

- Todos los mensajes del asistente interactivo de instalación (`configure`) y del
  CLI ahora están en inglés (antes mezclaban español e inglés).
- El ejemplo de FQDN en el prompt de instalación cambió de `na.myconnectwise.net`
  a `connect.intwo.cloud`.
- El prompt de Client ID ahora dice "ask developer for clientId" en vez de
  referenciar `developer.connectwise.com`.
- La Public Key ahora se muestra en pantalla mientras se escribe (antes se
  ocultaba igual que la Private Key); la Private Key sigue oculta.
- La guía de instalación ahora explica, paso a paso, cómo generar el par
  Public Key/Private Key desde ConnectWise Manage (nombre de usuario arriba a la
  derecha → My Account → tab API Keys), y aclara que el Client ID se debe pedir al
  administrador de ConnectWise.
- El flujo recomendado de `/cw-install` cambió: por defecto ahora se piden las
  credenciales dictadas en el chat (más simple), y configurarlo desde una terminal
  propia queda como alternativa "más segura" para quien no quiera que sus llaves
  pasen por la conversación. Antes era al revés, y la instrucción de "abre una
  terminal donde está instalado el plugin" no explicaba cómo encontrar esa carpeta —
  ahora Claude le da al usuario la ruta exacta (resuelta desde `$CLAUDE_PLUGIN_ROOT`)
  cuando elige esa alternativa.
- La sección de instalación desde la app de escritorio ahora explica que "agregar el
  marketplace" e "instalar el plugin" son dos pasos separados, y que hay que buscar
  `cwplugin` en la pestaña **Discover** (no en "Your plugins", que aparece vacía
  hasta que el plugin ya está instalado). Un usuario reportó confusión real siguiendo
  la versión anterior, más resumida, de estos pasos.
- La guía ahora aclara, al inicio, que `cwplugin` solo funciona dentro de una sesión
  de Claude Code (terminal, VS Code, o la pestaña de Claude Code/Cowork en la app de
  escritorio) y **no** en una conversación de chat normal (claude.ai web o el chat
  estándar del escritorio).
  - **Cómo se encontró**: un usuario preguntó por un ticket en un chat normal y
    Claude respondió que el plugin de ConnectWise "no está operativo aquí" e intentó
    contestar usando su Connector de Gmail en su lugar — una confusión real que la
    guía no prevenía.

## 1.1.1

**Corregido**

- `list-work-types` ahora acepta un filtro (`filter`, substring case-insensitive) y
  devuelve `totalCount` además de `count`. Antes, cuando había muchos work types
  (114 en el tenant de prueba), el skill mostraba un subconjunto sin decir que era
  parcial — el usuario veía una lista "incompleta" sin saber que podía pedir más o
  buscar por palabra clave.
  - **Cómo se encontró**: probando el flujo de entrada de tiempo en vivo, el usuario
    reportó "el worktime creo que tampoco me presenta todos".
- El skill ya no puede inventar la nota (`note`) de una entrada de tiempo. Antes,
  si el usuario no la daba explícitamente, Claude generaba un texto genérico en vez
  de preguntarla — la nota describe trabajo real y solo el usuario la puede dar.
  - **Cómo se encontró**: mismo flujo en vivo — "la nota la asumió, le puso una nota
    automáticamente, no me preguntó".

## 1.1.0

**Corregido**

- La instrucción del skill sobre acortar listas largas de opciones (agregada
  pensando en los 114 work types) se estaba aplicando también a los work roles,
  que normalmente son pocos (19 en el tenant de prueba) y deberían mostrarse
  completos siempre.
  - **Cómo se encontró**: "los work roles que me da a escoger están incompletos",
    probando el plugin ya instalado como plugin real (no solo el CLI a mano).

## 1.0.0 — primera versión

Versión inicial funcional: búsqueda de tickets (dos niveles), detalle completo de
ticket, entrada de tiempo, instalación con credenciales cifradas en el almacén
nativo del sistema operativo, y un wrapper que instala/encuentra Node.js sin
depender del PATH de la terminal.

Antes de este release se hizo una ronda completa de verificación ("Fase 0") contra
un tenant real, y aparecieron varios problemas que no se hubieran detectado solo
con el servidor mock de pruebas:

- **Deadlock en las pruebas automatizadas**: el test usaba una llamada síncrona
  (`execFileSync`) para invocar el CLI desde el mismo proceso que hospedaba el
  servidor mock — la llamada síncrona bloqueaba el event loop completo, así que el
  servidor nunca podía responder al CLI, hasta que el timeout interno de `fetch`
  (~5 minutos) lo liberaba. Se cambió a `execFile` asíncrono.
- **DPAPI (Windows) fallaba silenciosamente**: el script de PowerShell usaba
  `[System.Security.Cryptography.ProtectedData]` sin cargar antes el ensamblado
  `System.Security` (`Add-Type -AssemblyName System.Security`), así que fallaba con
  "Unable to find type" en cualquier máquina Windows real.
- **El operador `like` no funciona como se esperaba** en `conditions=` — ver el
  detalle completo en [CONNECTWISE-API.md](v1.1.1/CONNECTWISE-API.md). Se cambió a
  `contains` para company/status.
- **`initialDescription` no es un campo del ticket** — es la primera nota con
  `detailDescriptionFlag: true`. Esto obligó a rediseñar la búsqueda por
  descripción inicial como una operación de dos niveles, explícita y acotada (ver
  CONNECTWISE-API.md), en vez de un filtro más del nivel 1.
- **Riesgo de paginación sin límite**: la búsqueda por notas inicialmente traía
  *todos* los tickets candidatos sin límite de páginas, y por cada uno traía *todo*
  su historial de notas — un ticket alimentado por una integración de monitoreo
  puede tener miles de notas automáticas, así que una sola búsqueda podía tardar
  minutos sin dar ninguna señal de progreso. Se agregó un límite duro de páginas
  como red de seguridad, y se rediseñó la búsqueda para nunca traer más que los N
  tickets más recientes que pide el usuario (por defecto 10).
- **PowerShell no pasa JSON largo de forma confiable como argumento de línea de
  comandos** — re-serializa mal las comillas escapadas cuando el JSON tiene varios
  campos, y el CLI recibía un JSON corrupto sin razón aparente. Se agregaron dos
  formas alternas de pasar los argumentos: `--json-file <ruta>` y JSON por entrada
  estándar (pipe / here-string), ambas evitan el problema por completo.
- **Formato de fecha/hora rechazado por la API**: ver el detalle en
  [CONNECTWISE-API.md](v1.1.1/CONNECTWISE-API.md) — ConnectWise exige
  `"YYYY-MM-DDTHH:mm:ssZ"` exacto, sin milisegundos.
- **Node.js recién instalado no se detectaba** en la misma terminal/sesión: el
  PATH del sistema operativo no se actualiza en procesos ya abiertos. Se creó un
  script wrapper (`scripts/run.ps1` / `scripts/run.sh`) que busca Node.js
  directamente en las rutas típicas de instalación en vez de depender del PATH,
  así que funciona incluso justo después de instalar Node en la misma conversación.
