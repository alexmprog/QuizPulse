#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
case "${1:-}" in
    '')
        check=false
        ;;
    --check)
        check=true
        ;;
    *)
        echo 'Usage: ./format-all.sh [--check]' >&2
        exit 2
        ;;
esac
[[ $# -le 1 ]] || {
    echo 'Usage: ./format-all.sh [--check]' >&2
    exit 2
}
command -v shfmt >/dev/null 2>&1 || {
    echo 'shfmt not found; install it (e.g. brew install shfmt).' >&2
    exit 1
}
[[ -x node_modules/.bin/prettier ]] || {
    echo 'prettier not found; run pnpm install first.' >&2
    exit 1
}
[[ -x node_modules/.bin/eslint ]] || {
    echo 'eslint not found; run pnpm install first.' >&2
    exit 1
}

echo '[TypeScript / JSON / YAML] Prettier (120), ESLint'
if "$check"; then
    node_modules/.bin/prettier --check .
    node_modules/.bin/eslint .
else
    node_modules/.bin/prettier --write .
    node_modules/.bin/eslint --fix .
fi

echo '[Shell] shfmt'
sh_files=()
while IFS= read -r -d '' source; do sh_files+=("$source"); done < <(
    find . -type d \( -name node_modules -o -name dist -o -name .cache \) -prune \
        -o -type f -name '*.sh' -print0
)
if "$check"; then
    shfmt -d -i 4 -ci "${sh_files[@]}"
else
    shfmt -w -i 4 -ci "${sh_files[@]}"
fi

echo 'Formatting complete.'
