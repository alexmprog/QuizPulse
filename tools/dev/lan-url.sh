#!/usr/bin/env bash
# Prints the LAN address of this machine so phones on the home network can join a game.
#   tools/dev/lan-url.sh          -> PUBLIC_BASE_URL=http://<ip>:8080   (web port)
#   tools/dev/lan-url.sh --api    -> http://<ip>:3000                   (API only)
set -euo pipefail

mode=web
case "${1:-}" in
    '') ;;
    --api) mode=api ;;
    *)
        echo 'Usage: tools/dev/lan-url.sh [--api]' >&2
        exit 2
        ;;
esac

ip=''
for iface in en0 en1; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    [[ -z "$ip" ]] || break
done
[[ -n "$ip" ]] || {
    echo 'No LAN address found on en0/en1; are you connected to a network?' >&2
    exit 1
}

if [[ "$mode" == api ]]; then
    echo "http://$ip:3000"
else
    echo "PUBLIC_BASE_URL=http://$ip:8080"
    echo "Put this line into .env (see .env.example) and restart the api so QR codes point at this machine." >&2
fi
