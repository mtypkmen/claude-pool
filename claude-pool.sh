#!/usr/bin/env sh
dir="$(cd "$(dirname "$0")" && pwd)"
if ! curl -s -o /dev/null http://127.0.0.1:8787/_s; then
  (node "$dir/server.js" >/dev/null 2>&1 &)
  sleep 2
fi
ANTHROPIC_BASE_URL=http://127.0.0.1:8787 exec claude "$@"
