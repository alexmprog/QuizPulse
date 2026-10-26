#!/usr/bin/env bash
# End-to-end check of a running backend (docker compose up -d): register, copy a pack, play a whole game with two
# players over sockets, and find it in the host's history. Prints "SMOKE OK" as the last line on success.
#   API_URL=http://localhost:3000 tools/dev/smoke.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export API_URL="${API_URL:-http://localhost:3000}"

curl --fail --silent --show-error --max-time 5 "$API_URL/healthz" >/dev/null || {
    echo "The API does not answer at $API_URL; start it with: docker compose up -d" >&2
    exit 1
}
[[ -d "$root/apps/api/node_modules/socket.io-client" ]] || {
    echo 'socket.io-client is missing; run: pnpm install' >&2
    exit 1
}

exec node "$root/tools/dev/smoke.mjs"
