#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
mkdir -p "$ROOT/build/server"
"$GODOT_BIN" --headless --path "$PROJECT" --export-release "Linux Server" "$ROOT/build/server/frog_server"
chmod +x "$ROOT/build/server/frog_server"
