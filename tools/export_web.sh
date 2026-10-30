#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"
mkdir -p "$ROOT/web"
"$GODOT_BIN" --headless --path "$PROJECT" --export-release "Web" "$ROOT/web/index.html"
