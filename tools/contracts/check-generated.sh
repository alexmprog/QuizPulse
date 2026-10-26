#!/usr/bin/env bash
# Fails when packages/api-types/src/generated.ts is stale relative to contracts/openapi.yaml.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
node_modules/.bin/openapi-typescript contracts/openapi.yaml -o "$tmp/generated.ts" >/dev/null
cmp "$tmp/generated.ts" packages/api-types/src/generated.ts || {
    echo 'generated.ts is stale; run pnpm gen' >&2
    exit 1
}
