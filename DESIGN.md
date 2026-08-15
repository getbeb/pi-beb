# pi-beb

beb mail as an event-driven wake for the pi coding agent.

beb delivers signed messages into a mailbox and never interrupts
anyone; wake policy belongs to the runtime. pi-beb is that policy for
pi: when mail arrives for the identity pi is running as, an idle pi
wakes and a busy pi finds the mail waiting at the end of its turn.

## The two primitives it joins

From beb, two verbs and nothing else: `wait` blocks on a kernel
watch until the next message arrives, edge-triggered; `list` shows
what stands unread and moves nothing. beb owns identity, the
mailbox, the filesystem, waiting, and unread state; pi-beb never
touches the spool and holds no knowledge of where or how it is
kept. The CLI is the public interface; the spool ABI stays beb's
implementation boundary.

From pi, message injection: `sendMessage` with `triggerTurn` starts a
turn when pi is idle, and `deliverAs: followUp` queues behind a busy
turn until its chain of tools finishes. Mail wakes without ever
derailing reasoning mid-thought.

pi-beb owns exactly what is left between them: when unread mail
deserves an agent turn.

## Invariants

1. pi-beb never consumes mail. It wakes; the agent reads. The cursor
   moves only by the agent running `beb read` itself.
2. Mail never interrupts a turn. Idle pi wakes; busy pi finishes,
   then finds it.
3. Injected text is bounded: the unread `list` lines and the verbs to
   act on them, never a body. Bodies are uncapped and belong to
   `beb read`, in the agent's own hands.
4. pi-beb holds no state: no files, no cursor, no config. Everything
   it knows it learns from beb at the moment it looks.
5. No identity, no activity. pi-beb stands as whatever identity beb
   resolves for pi's process, which since beb 0.6.0 means
   `BEB_IDENTITY` and nothing else. pi-beb resolves it once at
   session start — pi's own declaration, or else the directory the
   session opened in — and pins it. Where beb resolves nobody,
   pi-beb loads to silence, and pins nothing.

   The pin goes on `process.env`, not only on the children pi-beb
   spawns, because the agent runs beb too and it is the agent that
   was told to run `beb read`. pi builds every shell environment by
   spreading `process.env` at spawn time, so one assignment covers
   the extension, the agent's bash tool, and the user's `!beb list`
   alike. Without it a session could be handed mail and then be told
   `BEB_IDENTITY is not set, so there is no identity to sign as` by
   the very tool that woke it. That assumption about pi's internals
   is the one thing here worth a test, and `tests/pin.mjs` checks it
   against pi's real bash backend.

## Behavior

On `session_start`, pi-beb asks `beb whoami`. A refusal means this
session is nobody: stay silent, hold nothing open. An address means
this session is that identity: park one `beb wait` and stand by.

When the wait returns, pi-beb re-parks first and announces second,
so a message landing in the gap is caught by the announcement's
`list` — the same arm-then-scan ordering beb wait keeps inside
itself. Once at startup, the same announcement covers mail that
arrived while pi was away. A wake:

    [beb] mail waits:
    3  frontend
    4  ssh-ed25519 AAAA...
    read with: beb read

The lines are `beb list` output, unmodified. Arrivals in a burst
collapse into one wake: the first return's `list` shows them all,
and the re-parked wait's baseline already includes them. A wake
fires only when `list` shows something unread, so a wake that lost
the race to another reader of the same identity stands down in
silence.

The agent answers mail with the same four verbs every other beb user
has. pi-beb adds no verbs, no tools, and no reply path of its own.

## Out of scope

Consuming on the agent's behalf, delivering bodies, presence,
multiple identities per session (beb resolves one identity per
process), remote mailboxes, spool knowledge of any kind, and any
fallback polling. Whatever pi-beb cannot learn by running beb, it
does not know.

## Design test

Every proposed feature answers one question:

> Is this necessary to wake pi when mail arrives for the identity it
> is running as?
