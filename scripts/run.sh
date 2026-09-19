#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_PATH="$SCRIPT_DIR/dist/cli.js"
CONFIG_DIR="$HOME/.cwplugin"
NODE_PATH_FILE="$CONFIG_DIR/node-path.txt"

test_node() {
  [ -n "${1:-}" ] && [ -x "$1" ] && "$1" --version >/dev/null 2>&1
}

resolve_node() {
  # 1. A path we successfully resolved before.
  if [ -f "$NODE_PATH_FILE" ]; then
    cached="$(cat "$NODE_PATH_FILE")"
    if test_node "$cached"; then
      echo "$cached"
      return
    fi
  fi

  # 2. node already resolvable via PATH in this session.
  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi

  # 3. Well-known install locations — checked directly on disk, so this finds
  #    a just-installed Node.js immediately without needing a new shell.
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node "$HOME/.nvm/current/bin/node"; do
    if test_node "$candidate"; then
      echo "$candidate"
      return
    fi
  done

  echo ""
}

NODE_BIN="$(resolve_node)"

if [ -z "$NODE_BIN" ]; then
  echo '{"error":{"code":"NODE_NOT_FOUND","message":"No se encontro Node.js 18+ en esta maquina. Instalalo (brew install node en macOS, o el gestor de paquetes de tu distro en Linux) y vuelve a intentar; no hace falta reiniciar nada, este script busca Node de nuevo en cada llamada."}}' >&2
  exit 1
fi

mkdir -p "$CONFIG_DIR"
printf '%s' "$NODE_BIN" > "$NODE_PATH_FILE"

exec "$NODE_BIN" "$CLI_PATH" "$@"
