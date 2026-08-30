#!/usr/bin/env bash
# Rebuild and (re)start a production server for perf runs.
#   APP_DIR  checkout to build and serve (default: this repo)
#   PORT     port to listen on (default: 3100)
set -e
cd "${APP_DIR:-$(dirname "$0")/../..}"
PORT="${PORT:-3100}"
LOG="$(pwd)/.perf-server.log"
PID=$(netstat -ano | grep -E ":${PORT}\s.*LISTEN" | head -1 | awk '{print $NF}')
if [ -n "$PID" ]; then taskkill //PID "$PID" //F >/dev/null 2>&1 || true; sleep 1; fi
npm run build 2>&1 | grep -E "error|Error|✓ Compiled|Finished" | head -5
(PERF_TIMING=1 npx next start -p "$PORT" > "$LOG" 2>&1 &)
for i in $(seq 1 30); do sleep 1; grep -q "Ready" "$LOG" 2>/dev/null && break; done
tail -1 "$LOG"
