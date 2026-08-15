#!/usr/bin/env bash
# Tests for pi-beb. Needs beb 0.6.0+ on PATH or in BEB_BIN, and the dev
# dependency installed (npm install) for pi's own bash backend.
# Run: bash tests/test.sh
set -u

HERE=$(cd "$(dirname "$0")/.." && pwd)
BEB=${BEB_BIN:-beb}
# An ambient identity from the developer's shell would satisfy the very
# refusal the first assertion depends on.
unset BEB_IDENTITY

have=$("$BEB" --version 2>/dev/null | awk '{print $2}')
[ -n "$have" ] || { echo "not ok - no beb on PATH or in BEB_BIN"; exit 1; }
gate=0.8.0
older=$(printf '%s\n%s\n' "$gate" "$have" | sort -t. -k1,1n -k2,2n -k3,3n | head -n 1)
if [ "$have" != "$gate" ] && [ "$older" = "$have" ]; then
    echo "not ok - beb $have is older than $gate (identity, wait --from)"
    exit 1
fi

[ -d "$HERE/node_modules/@earendil-works/pi-coding-agent" ] || {
    echo "not ok - run npm install first; the pin test drives pi's own bash backend"
    exit 1
}

S=$(mktemp -d)
trap 'rm -rf "$S"' EXIT
export XDG_CONFIG_HOME=$S/config XDG_DATA_HOME=$S/data
mkdir -p "$S/config/beb" "$S/id"
(cd "$S/id" && "$BEB" init pinid >/dev/null 2>&1) || { echo "not ok - init"; exit 1; }

cd "$HERE" && node tests/pin.mjs "$S/id"
