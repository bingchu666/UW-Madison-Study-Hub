#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/.uwstudyhub.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No running process found."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if ps -p "$PID" >/dev/null 2>&1; then
  kill "$PID" || true
  echo "Stopped process $PID"
else
  echo "Process $PID not running."
fi

rm -f "$PID_FILE"
