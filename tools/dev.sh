#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
export GODOT_SERVER_PROJECT="$PROJECT"
export GODOT_BIN="$GODOT_BIN"
export GODOT_SERVER_BIN="${GODOT_SERVER_BIN:-$GODOT_BIN}"
cd "$ROOT/server"
if [[ ! -d node_modules ]]; then
  npm install
fi
exec npm run dev
