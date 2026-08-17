#!/usr/bin/env bash
# Tests for pi-beb, in two halves: what it assumes beb does (wake.sh,
# shell), and what it assumes pi does (pin.mjs, against pi's real bash
# backend). Needs beb on PATH or in BEB_BIN, and npm install for the
# second half.
# Run: bash tests/test.sh
set -u

HERE=$(cd "$(dirname "$0")/.." && pwd)
BEB=${BEB_BIN:-beb}
# An ambient identity from the developer's shell would satisfy the very
# refusal the first assertion depends on.
unset BEB_IDENTITY

have=$("$BEB" --version 2>/dev/null | awk '{print $2}')
[ -n "$have" ] || { echo "not ok - no beb on PATH or in BEB_BIN"; exit 1; }
gate=0.10.0
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

# One counter across both halves, and one total at the end. Two scripts
# each announcing their own total is how a suite comes to report fewer
# tests than it printed.
n=0
ok() { n=$((n + 1)); echo "ok $n - $1"; }
die() { echo "not ok - $1"; exit 1; }

# What pi-beb assumes beb does, checked against the beb on PATH.
. "$HERE/tests/wake.sh"

# What pi-beb assumes pi does, checked against pi's real bash backend.
cd "$HERE" && PI_BEB_TEST_BASE=$n node tests/pin.mjs "$S/id" || exit 1
n=$((n + 2))

echo "all $n tests passed"
