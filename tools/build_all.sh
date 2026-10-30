#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT/tools/import.sh"
"$ROOT/tools/export_web.sh"
"$ROOT/tools/export_server.sh"
cd "$ROOT/server"
npm install
npm run build
echo "Build complete."
