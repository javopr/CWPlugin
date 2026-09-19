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

## Paso 1 — configurar credenciales (modo recomendado: dictando en el chat)

Por defecto, pide los cinco datos uno por uno en conversación normal (FQDN, Company
ID, Client ID, Public Key, Private Key):

1. Pide los cinco datos uno por uno en conversación normal.
2. Nunca repitas ni muestres las llaves completas de vuelta al usuario en el chat.
3. Invoca el subcomando `configure` del wrapper con `--json-args '{...}'` y esos cinco
   campos.

Cuando termines, corre el subcomando `test-connection` con el wrapper para verificar
que quedó bien configurado, y repórtale el resultado.

### Alternativa más segura (si el usuario prefiere que las llaves nunca pasen por el chat)

Si el usuario te dice que prefiere no dictar las llaves en la conversación, indícale
que puede configurarlo él mismo desde una terminal — así ni la Public Key ni la
Private Key pasan por el chat en ningún momento:

1. Dile la ruta exacta de la carpeta `scripts` del plugin. Esa ruta es el valor de la
   variable de entorno `${CLAUDE_PLUGIN_ROOT}` en tu sesión actual — resuélvela y
   dísela tal cual (ej. `C:\Users\...\claude\plugins\cwplugin\scripts` o
   `~/.claude/plugins/cwplugin/scripts`), para que no tenga que "encontrarla" a
   ciegas.
2. Dile que abra una terminal (PowerShell/Terminal/Bash) y navegue a esa carpeta
   (`cd "<ruta>"`), y corra:
   - Windows: `.\run.ps1 configure`
   - macOS/Linux: `./run.sh configure`
3. Esto lo lleva por un asistente interactivo que pregunta los cinco datos uno por
   uno — la Private Key no se muestra en pantalla mientras la escribe, y nada de esto
   pasa por la conversación con Claude.
4. Cuando el usuario te confirme que terminó, corre `test-connection` con el wrapper
   para verificar que quedó bien configurado, y repórtale el resultado.

### En ambos casos

- Si el resultado es exitoso (`ok: true`), confirma con un mensaje corto e indica el
  `apiBase` resuelto. Si usó el almacenamiento de respaldo (`usedFallbackSecretStorage:
  true`), avísale al usuario de esa nota de seguridad.
- Si falla, interpreta el `error.code` según la tabla de manejo de errores del skill
  `connectwise` y guía al usuario para corregir el dato incorrecto (normalmente FQDN,
  Company ID o las llaves).

Entrada del usuario para este comando: $ARGUMENTS
