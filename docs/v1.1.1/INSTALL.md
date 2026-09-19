# Guía de instalación — cwplugin

Esta guía es para usuarios finales que quieren instalar y usar el plugin. Si vas a
modificar el código, ve el [README](../../README.md) principal (sección "Desarrollo").

## Requisitos

- [Node.js](https://nodejs.org) **18 o superior**. Si no lo tienes, el propio flujo
  de instalación (`/cw-install`) lo detecta y te ofrece instalarlo — solo confirma
  cuando te lo pida.
- Una cuenta de API de ConnectWise Manage: **FQDN**, **Company ID**, **Client ID**
  (se registra en [developer.connectwise.com](https://developer.connectwise.com)),
  **Public Key** y **Private Key**.
- macOS/Linux: `security` (viene con macOS) o `secret-tool` (paquete `libsecret-tools`
  en Debian/Ubuntu, `libsecret` en Fedora/Arch) para guardar las credenciales de forma
  segura. Windows no necesita nada adicional.

## Cómo instalar, según dónde uses Claude

El mecanismo para agregar un plugin cambia según el cliente. Verificamos estos tres:

### App de escritorio de Claude

1. Abre **Settings → Plugins**.
2. Click en **"Add"** (arriba a la derecha) → **"Marketplace"**.
3. Ingresa el repositorio: `javopr/CWPlugin` (o la URL completa
   `https://github.com/javopr/CWPlugin`).
4. Una vez agregado el marketplace, instala el plugin `cwplugin` desde la pestaña
   **"Your plugins"** o **"Discover"**.

> **Importante**: el repositorio debe ser **público** en GitHub para que el
> marketplace pueda leerlo. Si lo tienes privado, la app no va a encontrar nada.

### VS Code (extensión de Claude Code)

El comando de chat `/plugin` puede no estar disponible en algunas versiones de la
extensión. Si `/plugin marketplace add ...` te responde "isn't available in this
environment":

1. Busca un ícono de engranaje o "..." dentro del panel de chat de Claude Code (no el
   menú general de VS Code) — ahí puede estar la gestión de plugins.
2. Prueba comandos alternativos como `/reload-plugins` para ver si el plugin ya está
   configurado desde otro lado (ej. si lo agregaste primero en la app de escritorio,
   a veces se sincroniza).
3. Si nada de esto funciona en tu versión, instala primero desde la app de escritorio
   — suele ser el camino más confiable.

### Terminal (CLI oficial de Claude Code)

Si tienes el CLI de Claude Code instalado (`npm install -g @anthropic-ai/claude-code`
o similar):

```
claude plugin marketplace add javopr/CWPlugin
claude plugin install cwplugin@cwplugin-marketplace
```

## Configurar tus credenciales de ConnectWise

Una vez instalado el plugin, dentro de cualquier conversación:

```
/cw-install
```

**Recomendado**: cuando te lo pida, dile que prefieres configurarlo tú mismo en una
terminal — así tus llaves de API nunca pasan por el chat. Abre una terminal donde esté
el plugin instalado y corre:

- Windows (PowerShell): `.\run.ps1 configure` (desde la carpeta `scripts` del plugin)
- macOS/Linux: `./run.sh configure`

Te va a preguntar FQDN, Company ID, Client ID, Public Key y Private Key uno por uno —
las llaves no se muestran en pantalla mientras las escribes. Se guardan cifradas en el
almacén de credenciales de tu sistema operativo (Windows: DPAPI; macOS: Keychain;
Linux: `secret-tool`), nunca en texto plano, y nunca se te pide un passphrase.

## Verificar que quedó bien

```
/cw-buscar <algo que sepas que existe, ej. un Ticket ID>
```

Si te devuelve resultados, quedó todo configurado. Si da error, el mensaje te dice
qué revisar (credenciales inválidas, FQDN incorrecto, etc.).

## Problemas comunes

### "node no se reconoce como un comando" al instalar Node

Si acabas de instalar Node.js y la terminal actual no lo reconoce, es porque el PATH
del sistema no se actualiza en terminales ya abiertas. El plugin usa un script
("wrapper") que busca Node.js directamente en las rutas típicas de instalación, así
que normalmente **no necesitas abrir una terminal nueva** — si de todas formas ves
este error corriendo `node` directamente (no a través del plugin), abre una terminal
nueva o reinicia la aplicación desde la que la abriste (VS Code, etc.).

### Un JSON con muchos campos falla con "JSON no válido" en PowerShell

Es un problema conocido de cómo PowerShell pasa argumentos con comillas a programas
externos. El wrapper también acepta el JSON por archivo (`--json-file <ruta>`) o por
entrada estándar (pipe) — evita el problema por completo. Si estás usando el plugin a
través de una conversación normal, Claude ya maneja esto automáticamente.

### `/plugin` dice "isn't available in this environment"

Ver la sección de VS Code arriba — no es un problema del plugin, es que ese comando de
chat específico no está habilitado en esa versión/cliente. Usa la ruta alterna descrita
para ese cliente.
