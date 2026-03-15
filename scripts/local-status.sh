#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/.uwstudyhub.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "Status: stopped"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if ps -p "$PID" >/dev/null 2>&1; then
  echo "Status: running (PID $PID)"
  echo "URL: http://localhost:4000"
else
  echo "Status: stale pid file (PID $PID not running)"
fi
