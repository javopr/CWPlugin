---
name: cw-install
description: Configura las credenciales de ConnectWise Manage (FQDN, Company ID, Client ID, Public/Private Key) para el plugin cwplugin.
---

Sigue las instrucciones del skill `connectwise` para el flujo de instalación. **Usa
siempre el wrapper (`scripts/run.ps1` en Windows, `scripts/run.sh` en macOS/Linux)
para invocar el CLI, nunca `node` directamente** — el wrapper encuentra Node.js sin
depender del PATH de la terminal actual, así que no hace falta abrir una terminal
nueva ni reiniciar nada, ni siquiera justo después de instalar Node en este mismo paso.

## Paso 0 — asegurar que Node.js esté instalado

1. Intenta correr cualquier subcomando simple del wrapper, por ejemplo
   `test-connection`, con el wrapper correspondiente al sistema operativo (ver la
   sección "Como invocar el CLI" del skill `connectwise`).
2. Si la respuesta es `{"error":{"code":"NODE_NOT_FOUND", ...}}`, **explícale al
   usuario que necesitas instalar Node.js en su máquina y pide su confirmación
   explícita antes de hacerlo** (instalar software es una acción de sistema, nunca la
   ejecutes sin que el usuario diga que sí). Detecta el sistema operativo y propón el
   método disponible:
   - **Windows**: si existe `winget` (`winget --version`), ejecuta
     `winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements`.
     Si no existe `winget`, dile al usuario que descargue el instalador LTS desde
     https://nodejs.org y lo corra manualmente — no intentes descargar/ejecutar un
     instalador `.msi`/`.exe` tú mismo sin un gestor de paquetes de por medio.
   - **macOS**: si existe Homebrew (`brew --version`), ejecuta `brew install node`. Si
     no, dile al usuario que descargue el instalador desde https://nodejs.org o instale
     Homebrew primero.
   - **Linux**: intenta detectar el gestor de paquetes (`apt-get`, `dnf`, `pacman`,
     etc.) y usa el que corresponda (ej. `sudo apt-get install -y nodejs npm`). Si no
     puedes detectar uno con confianza, o si el comando requiere `sudo` y no estás
     seguro de que el usuario quiera dar esa contraseña en este flujo, dile al usuario
     que instale Node.js manualmente (https://nodejs.org o `nvm`) y avísale cuando esté
     listo para continuar.
3. Después de instalar, **vuelve a llamar exactamente al mismo comando del wrapper**
   (ej. `test-connection` otra vez). El wrapper busca Node.js directamente en las
   ubicaciones típicas de instalación cada vez que corre, así que encuentra el Node
   recién instalado de inmediato — no hace falta pedirle al usuario que abra una
   terminal nueva ni que reinicie nada. Si por alguna razón sigue sin encontrarlo,
   ahí sí pídele que confirme que la instalación terminó bien o que abra una sesión
   nueva.

## Paso 1 — configurar credenciales (modo recomendado: en su propia terminal)

Por defecto, **no pidas las llaves de la API en este chat**. Dile al usuario que abra
una terminal (PowerShell/Terminal/Bash) él mismo y corra el wrapper correspondiente:

- Windows: `powershell -File "${CLAUDE_PLUGIN_ROOT}\scripts\run.ps1" configure`
- macOS/Linux: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run.sh" configure`

Esto lo lleva por un asistente interactivo que pregunta FQDN, Company ID, Client ID,
Public Key y Private Key uno por uno — las llaves no se muestran en pantalla mientras
las escribe, y nada de esto pasa por la conversación con Claude. Explícale que esto es
justamente para que sus credenciales nunca queden expuestas en el chat.

Cuando el usuario te confirme que terminó, corre el subcomando `test-connection` con
el wrapper para verificar que quedó bien configurado, y repórtale el resultado.

### Alternativa (si el usuario prefiere dictarte los datos en el chat)

Solo si el usuario te pide explícitamente hacerlo así (por ejemplo, porque no tiene
fácil acceso a una terminal):

1. Pide los cinco datos uno por uno en conversación normal.
2. Nunca repitas ni muestres las llaves completas de vuelta al usuario en el chat.
3. Invoca el subcomando `configure` del wrapper con `--json-args '{...}'` y esos cinco
   campos.

### En ambos casos

- Si el resultado es exitoso (`ok: true`), confirma con un mensaje corto e indica el
  `apiBase` resuelto. Si usó el almacenamiento de respaldo (`usedFallbackSecretStorage:
  true`), avísale al usuario de esa nota de seguridad.
- Si falla, interpreta el `error.code` según la tabla de manejo de errores del skill
  `connectwise` y guía al usuario para corregir el dato incorrecto (normalmente FQDN,
  Company ID o las llaves).

Entrada del usuario para este comando: $ARGUMENTS
