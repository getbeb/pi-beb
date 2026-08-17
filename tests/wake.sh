#!/usr/bin/env bash
# The wake contract: what pi-beb assumes beb does.
#
# Sourced by tests/test.sh, which supplies $BEB, a temp XDG, and $n.
#
# pi-beb never consumes mail, so every one of these is a claim about
# somebody else's program. They were verified by hand against 0.9.0
# after a deploy and were guarded by nothing, which is the state that
# lets a beb change break the wake quietly: the extension would keep
# loading, keep parking, and simply stop waking.

R=$S/recv                        # the mailbox pi-beb watches
T=$S/send                        # somebody to hear from
mkdir -p "$R" "$T"
(cd "$R" && "$BEB" init recv >/dev/null 2>&1) || { echo "not ok - init recv"; exit 1; }
(cd "$T" && "$BEB" init send >/dev/null 2>&1) || { echo "not ok - init send"; exit 1; }
# Named for whose identity the verb runs as, not for the verb: a helper
# called send() turns "send recv --subject x" into "beb recv --subject x".
recv() { BEB_IDENTITY=$R "$BEB" "$@"; }
sender() { BEB_IDENTITY=$T "$BEB" "$@"; }

# Seconds a call took, to the hundredth.
elapsed() { python3 -c "import sys;print(f'{float(sys.argv[2])-float(sys.argv[1]):.2f}')" "$1" "$2"; }
now() { python3 -c 'import time;print(time.time())'; }

# --- armMark ------------------------------------------------------------
#
# pi-beb takes its opening mark with `wait --timeout 0` and reads stdout
# while ignoring the exit code, because an empty mailbox is exactly the
# case it needs a mark for.
mark=$(recv wait --timeout 0 2>/dev/null); rc=$?
case "$mark" in
    ''|*[!0-9]*) die "the opening mark was \"$mark\", not a number" ;;
esac
test "$rc" -eq 2 || die "wait --timeout 0 on an empty mailbox exited $rc, wanted 2"
ok "an empty mailbox still yields a mark on stdout, which is what arms the park"

# --- the wake -----------------------------------------------------------

sender send recv --subject "hello" --body "the body" >/dev/null 2>&1 || die "send"
t0=$(now)
mark2=$(recv wait --from "$mark" --timeout 10 2>/dev/null); rc=$?
took=$(elapsed "$t0" "$(now)")
test "$rc" -eq 0 || die "wait --from with mail standing exited $rc, wanted 0"
case "$mark2" in
    ''|*[!0-9]*) die "no next mark on stdout, got \"$mark2\"" ;;
esac
python3 -c "import sys;sys.exit(0 if float(sys.argv[1]) < 3 else 1)" "$took" ||
    die "the wake took ${took}s; it should return as the mail lands"
ok "mail standing wakes the park at once, and prints the mark to park from next"

# --- what the wake carries ----------------------------------------------
#
# pi-beb embeds `list` verbatim in the message it sends the agent, so the
# rows have to be on stdout and the prose has to not be.
rows=$(recv list 2>/dev/null)
test -n "$rows" || die "list said nothing on stdout with mail standing"
echo "$rows" | grep -q 'hello' || die "the subject is not in the rows: $rows"
echo "$rows" | grep -q '^beb:' && die "prose reached stdout, and would reach the agent"
ok "list puts the rows on stdout, so the wake can carry them as they are"

# --- never consuming ----------------------------------------------------

again=$(recv list 2>/dev/null)
test "$rows" = "$again" || die "list moved something; pi-beb would wake once and go quiet"
ok "list moves nothing, so the same mail is still there for the agent to read"

# --- the level trigger --------------------------------------------------
#
# The trap that bit all three plugins: `wait` measures from the cursor, so
# a waiter that never consumes finds the same mail standing every time it
# asks. pi-beb holds its own mark instead. If `--from` ever stopped
# excluding what the mark has seen, the extension would spin, waking the
# agent as fast as the loop goes round.
t0=$(now)
recv wait --from "$mark2" --timeout 3 >/dev/null 2>&1; rc=$?
took=$(elapsed "$t0" "$(now)")
test "$rc" -eq 2 || die "re-parking on the new mark exited $rc, wanted 2 (nothing new)"
python3 -c "import sys;sys.exit(0 if float(sys.argv[1]) >= 2.5 else 1)" "$took" ||
    die "it returned after ${took}s with the mail still unread, so pi-beb would spin"
ok "the same mail does not wake the same mark twice; the park blocks its whole leg"

# --- and a second message does wake it ----------------------------------

sender send recv --subject "second" --body "again" >/dev/null 2>&1 || die "second send"
t0=$(now)
recv wait --from "$mark2" --timeout 10 >/dev/null 2>&1; rc=$?
took=$(elapsed "$t0" "$(now)")
test "$rc" -eq 0 || die "a second message exited $rc, wanted 0"
python3 -c "import sys;sys.exit(0 if float(sys.argv[1]) < 3 else 1)" "$took" ||
    die "the second message took ${took}s to wake the park"
ok "a message the mark has not seen wakes it, however long the agent took"
