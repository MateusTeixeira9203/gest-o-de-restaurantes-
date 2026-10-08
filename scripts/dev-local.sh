#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  gestor_node_dir="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  if [[ ! -x "$gestor_node_dir/node" ]]; then
    echo "Instale Node.js 22.13 ou superior antes de iniciar o Gestor Food." >&2
    exit 1
  fi
  export PATH="$gestor_node_dir:$PATH"
fi
exec node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port "${PORT:-3000}"
