# Installation guide — cwplugin

This guide is for end users who want to install and use the plugin. If you're going
to modify the code, see the main [README](../../README.md) (section "Desarrollo").

> **Important — where this plugin works**: `cwplugin` is a **Claude Code plugin**. It
> only loads, and its commands (`/cw-install`, `/cw-buscar`, etc.) only become
> available, inside a **Claude Code** session — the terminal (`claude`), the Claude
> Code extension in VS Code, or the Claude Code tab in the desktop app (if your
> client has one) or in Cowork.
>
> **It does not work in a regular Claude chat conversation** (claude.ai web, or the
> normal chat in the desktop app). If you ask about a ConnectWise ticket there,
> Claude has no access to `cwplugin` at all — it may instead try to answer using
> whatever Connectors you have configured (e.g. Gmail), which has nothing to do with
> this plugin and won't have the data you're looking for. If that happens, the fix
> isn't a configuration problem — it just means you're in the wrong kind of
> conversation. Switch to Claude Code (or Cowork) and try again there.

## Requirements

- [Node.js](https://nodejs.org) **18 or higher**. If you don't have it, the
  installation flow itself (`/cw-install`) detects that and offers to install it —
  just confirm when it asks.
- A ConnectWise Manage API account: **FQDN** (e.g. `connect.intwo.cloud`),
  **Company ID**, **Client ID**, **Public Key**, and **Private Key**.
- macOS/Linux: `security` (comes with macOS) or `secret-tool` (`libsecret-tools`
  package on Debian/Ubuntu, `libsecret` on Fedora/Arch) for secure credential
  storage. Windows doesn't need anything extra.

### Getting your Client ID

The **Client ID** is not something you generate yourself — it identifies the
integration/app registered against your ConnectWise Manage instance. Ask your
ConnectWise administrator (or whoever manages the ConnectWise developer account for
your company) for it; you don't need access to developer.connectwise.com yourself to
get one.

### Creating your Public Key / Private Key (API member key pair)

These are tied to your own ConnectWise Manage member account, and you can generate
them yourself if you have access to ConnectWise Manage:

1. Log into ConnectWise Manage.
2. Click your name in the top-right corner and select **My Account**.
3. Open the **API Keys** tab.
4. Click **+** to add a new key and give it a description (e.g. "cwplugin").
5. ConnectWise generates a **Public Key** and a **Private Key**, tied to your own
   member account (the plugin will act as you — tickets and time entries will be
   created under this user). Copy the **Private Key right away** — ConnectWise only
   shows it once; if you lose it, you'll need to delete the key and create a new one.

If you don't see an **API Keys** tab under My Account, ask your ConnectWise
administrator to enable API key access for your member, or to create the key pair
for you.

## How to install, depending on where you use Claude

The mechanism for adding a plugin changes depending on the client. We've verified
these three:

### Claude desktop app

Adding the marketplace and installing the plugin are **two separate steps** — adding
the marketplace only registers it as a source; it does not install `cwplugin` by
itself.

1. Open **Settings → Plugins**.
2. Click **"Add"** (top right) → **"Marketplace"**.
3. In the **URL** field, enter `javopr/CWPlugin` and click **Sync**.
   - If you see "This marketplace is already added", that's fine — it just means
     this step already happened before. Close the dialog and continue to step 4.
4. Now go to the **"Discover"** tab (not "Your plugins" — that one only lists
   plugins you've *already* installed, so right after adding the marketplace it
   will look empty and say "Add your first plugins"). `cwplugin` should be listed
   there, coming from the marketplace you just added.
5. Click **Install** on `cwplugin` specifically. Only after this step will it show
   up under "Your plugins" and its commands (`/cw-install`, `/cw-buscar`, etc.)
   become available in a conversation.

> **Important**: the repository must be **public** on GitHub for the marketplace to
> be able to read it. If it's private, the app won't find anything.

### VS Code (Claude Code extension)

The `/plugin` chat command may not be available in some versions of the extension.
If `/plugin marketplace add ...` responds with "isn't available in this
environment":

1. Look for a gear icon or "..." inside the Claude Code chat panel (not the general
   VS Code menu) — plugin management may be there.
2. Try alternate commands like `/reload-plugins` to see if the plugin is already
   configured from somewhere else (e.g. if you added it first from the desktop app,
   it sometimes syncs).
3. If none of this works on your version, install from the desktop app first — it's
   usually the most reliable path.

### Terminal (official Claude Code CLI)

If you have the Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`
or similar):

```
claude plugin marketplace add javopr/CWPlugin
claude plugin install cwplugin@cwplugin-marketplace
```

## Configuring your ConnectWise credentials

Once the plugin is installed, from any conversation:

```
/cw-install
```

By default, just answer with the five values when Claude asks for them, one by one
(FQDN, Company ID, Client ID, Public Key, Private Key) — Claude will not show your
keys back to you, and it configures the plugin for you.

### More secure alternative: configuring it yourself in a terminal

If you'd rather your Private Key never goes through the chat at all, tell Claude
that and ask it for the exact folder to use — Claude knows where the plugin was
installed on your machine and can give you the exact path (it's different for every
install, so don't guess it). Then:

1. Open a terminal (PowerShell/Terminal/Bash) and navigate to that folder's
   `scripts` subfolder (`cd "<path Claude gave you>\scripts"`).
2. Run:
   - Windows (PowerShell): `.\run.ps1 configure`
   - macOS/Linux: `./run.sh configure`

The interactive assistant will ask you, one by one:

- **ConnectWise FQDN** (e.g. `connect.intwo.cloud`)
- **Company ID**
- **Client ID** ("ask developer for clientId" — ask whoever administers your
  ConnectWise account if you don't have it on hand)
- **Public Key** — shown on screen as you type it.
- **Private Key** — **not** shown on screen as you type it.

Either way, credentials are stored encrypted in your operating system's credential
store (Windows: DPAPI; macOS: Keychain; Linux: `secret-tool`), never in plain text, and
you're never asked for a passphrase.

## Verifying it worked

```
/cw-buscar <something you know exists, e.g. a Ticket ID>
```

If it returns results, everything is configured correctly. If it errors out, the
message tells you what to check (invalid credentials, wrong FQDN, etc.).

## Common issues

### "node is not recognized as a command" while installing Node

If you just installed Node.js and the current terminal doesn't recognize it, it's
because the system PATH doesn't update in already-open terminals. The plugin uses a
script ("wrapper") that looks for Node.js directly in the typical installation
paths, so you normally **don't need to open a new terminal** — if you still see this
error running `node` directly (not through the plugin), open a new terminal or
restart the application you opened it from (VS Code, etc.).

### A JSON with many fields fails with "invalid JSON" in PowerShell

This is a known issue with how PowerShell passes quoted arguments to external
programs. The wrapper also accepts JSON via file (`--json-file <path>`) or via
standard input (pipe) — this avoids the problem entirely. If you're using the plugin
through a normal conversation, Claude already handles this automatically.

### `/plugin` says "isn't available in this environment"

See the VS Code section above — this isn't a plugin issue, that specific chat
command just isn't enabled in that version/client. Use the alternate path described
for that client.
