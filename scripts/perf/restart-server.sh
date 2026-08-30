#!/usr/bin/env bash
# Rebuild and (re)start the production server on :3100 for perf runs.
set -e
cd "$(dirname "$0")/../.."
PID=$(netstat -ano | grep -E ":3100\s.*LISTEN" | head -1 | awk '{print $NF}')
if [ -n "$PID" ]; then taskkill //PID "$PID" //F >/dev/null 2>&1 || true; sleep 1; fi
npm run build 2>&1 | grep -E "error|Error|✓ Compiled|Finished" | head -5
(PERF_TIMING=1 npx next start -p 3100 > .perf-server.log 2>&1 &)
for i in $(seq 1 30); do sleep 1; grep -q "Ready" .perf-server.log 2>/dev/null && break; done
tail -1 .perf-server.log
