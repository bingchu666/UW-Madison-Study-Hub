#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PID_FILE="$ROOT_DIR/.uwstudyhub.pid"
LOG_FILE="$ROOT_DIR/logs/app.log"

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE")"
  if ps -p "$OLD_PID" >/dev/null 2>&1; then
    echo "Stopping existing process ($OLD_PID)..."
    kill "$OLD_PID" || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

echo "Building frontend..."
npm run build:prod

if [ -f "$ROOT_DIR/.env.local" ]; then
  echo "Loading environment from .env.local ..."
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/.env.local"
  set +a
fi

echo "Starting production server..."
nohup env NODE_ENV=production PORT=4000 node server/index.js > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

sleep 1
if ps -p "$NEW_PID" >/dev/null 2>&1; then
  echo "Deployed successfully."
  echo "PID: $NEW_PID"
  echo "App: http://localhost:4000"
  echo "Log: $LOG_FILE"
else
  echo "Warning: process not detected after start."
  echo "Check log: $LOG_FILE"
  echo "You can run: npm run status:local"
fi
