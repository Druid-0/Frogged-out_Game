#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/frog_arena_25d_godot4"

if [[ -z "${GODOT_BIN:-}" ]]; then
  if command -v godot >/dev/null 2>&1; then
    GODOT_BIN="$(command -v godot)"
  else
    echo "Godot 4.x executable not found. Set GODOT_BIN to the editor binary." >&2
    exit 1
  fi
fi

export ROOT PROJECT GODOT_BIN
