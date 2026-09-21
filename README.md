# cwplugin

Plugin de Claude Code para buscar tickets de ConnectWise Manage (Service y Project) y
registrar entradas de tiempo, directamente desde una conversación.

Documentación adicional en [`docs/`](docs/) (cada versión tiene su propia carpeta;
los enlaces de abajo apuntan a la versión vigente, v1.1.2):
[Guía de instalación](docs/v1.1.2/INSTALL.md) ·
[Referencia técnica de la API de ConnectWise](docs/v1.1.2/CONNECTWISE-API.md) ·
[Changelog](docs/CHANGELOG.md)

## Requisitos

- [Node.js](https://nodejs.org) **18 o superior** en la máquina donde corre Claude Code
  (el plugin ejecuta un CLI local, no un servidor). Si no lo tienes instalado, `/cw-install`
  lo detecta y te ofrece instalarlo automáticamente (winget en Windows, Homebrew en
  macOS, el gestor de paquetes disponible en Linux) — siempre pidiendo tu confirmación
  antes de instalar nada.
- Una cuenta de API de ConnectWise Manage: FQDN, Company ID, Client ID (registrado en
  [developer.connectwise.com](https://developer.connectwise.com)), Public Key y Private
  Key.
- macOS/Linux: `security` (viene con macOS) o `secret-tool` (paquete `libsecret-tools`/
  `libsecret` en Linux) para el almacenamiento seguro de credenciales. Windows no
  necesita nada adicional (usa DPAPI, incluido en el sistema).

## Instalación

El mecanismo exacto depende de dónde uses Claude (app de escritorio, VS Code, o el
CLI de terminal) — ver la [guía de instalación completa](docs/v1.1.2/INSTALL.md) con los
pasos verificados para cada uno.


## Uso

- **Buscar tickets**: escribe en lenguaje natural ("busca el ticket 12345", "tickets
  abiertos de Acme sobre impresoras") o usa `/cw-buscar <criterios>`.
- **Detalle de un ticket**: "analiza el ticket 12345" o `/cw-ticket 12345` — trae todas
  las notas, tiempos, agreement, company y contacto.
- **Registrar tiempo**: "entra 2 horas al ticket 12345" o `/cw-tiempo <detalles>` — el
  plugin preguntará por cualquier dato que falte (nota, fecha, horas, work role, work
  type, facturable).
- **Reconfigurar o borrar credenciales**: `/cw-install` de nuevo, o corre el
  subcomando `reset` con el wrapper (`scripts/run.ps1 reset` / `scripts/run.sh reset`).

## Seguridad — cómo se guardan las credenciales

- Datos no sensibles (FQDN, Company ID, Client ID, URL base resuelta) se guardan en
  texto plano en `~/.cwplugin/config.json` (no son secretos).
- Las llaves pública/privada de la API se guardan **solo** en el almacén de
  credenciales del sistema operativo:
  - Windows: cifradas con DPAPI (`System.Security.Cryptography.ProtectedData`), ligado
    a tu perfil de usuario de Windows.
  - macOS: en el Keychain, vía el comando `security`.
  - Linux: vía `secret-tool` (libsecret). Si no está instalado, se usa un archivo local
    con permisos `0600` como respaldo — el CLI te avisa cuando esto ocurre.
- El plugin nunca pide ni guarda un passphrase maestro. Claude nunca llama a la API de
  ConnectWise directamente; siempre lo hace a través de este CLI, que es el único
  componente que lee las llaves.

## Desarrollo

```
cd scripts
npm install
npm run build   # compila scripts/src (TypeScript) a scripts/dist (JS committeado)
npm test        # corre test/cli.test.mjs contra un servidor mock local
```

`scripts/dist/` se distribuye pre-compilado para que el usuario final solo necesite
Node.js, sin instalar TypeScript.

## Estado de la verificación del esquema de ConnectWise

Todo el comportamiento de la API (sintaxis de `conditions=`, formato de
`/time/entries`, listas de work roles/types, etc.) fue verificado end-to-end contra
un tenant real, no solo contra documentación pública — ver el detalle en
[`docs/v1.1.2/CONNECTWISE-API.md`](docs/v1.1.2/CONNECTWISE-API.md) y la bitácora de bugs
encontrados en [`docs/CHANGELOG.md`](docs/CHANGELOG.md).
[`skills/connectwise/reference.md`](skills/connectwise/reference.md) es la versión
corta que usa Claude en tiempo de ejecución.

## Smoke test manual (contra un ambiente real de ConnectWise)

1. `/cw-install` con credenciales reales.
2. `/cw-buscar` de un ticket conocido — confirma que aparece en los resultados.
3. `/cw-ticket <id>` — confirma que las notas, tiempos y demás campos coinciden con lo
   que ves en la UI de ConnectWise.
4. `/cw-tiempo` completo contra un ticket de prueba — confirma en la UI de ConnectWise
   que la entrada de tiempo se creó correctamente, y bórrala manualmente después.
