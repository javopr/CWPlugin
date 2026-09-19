# Changelog — cwplugin

Todas las versiones fueron probadas contra un tenant real de ConnectWise Manage
antes de publicarse (no solo contra el servidor mock de pruebas).

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
  detalle completo en [CONNECTWISE-API.md](CONNECTWISE-API.md). Se cambió a
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
  [CONNECTWISE-API.md](CONNECTWISE-API.md) — ConnectWise exige
  `"YYYY-MM-DDTHH:mm:ssZ"` exacto, sin milisegundos.
- **Node.js recién instalado no se detectaba** en la misma terminal/sesión: el
  PATH del sistema operativo no se actualiza en procesos ya abiertos. Se creó un
  script wrapper (`scripts/run.ps1` / `scripts/run.sh`) que busca Node.js
  directamente en las rutas típicas de instalación en vez de depender del PATH,
  así que funciona incluso justo después de instalar Node en la misma conversación.
