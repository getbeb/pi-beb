# pi-beb

beb mail as an event-driven wake for the pi coding agent.

[beb](https://getbeb.dev) delivers signed messages into a mailbox and
never interrupts anyone; wake policy belongs to the runtime. pi-beb is
that policy for pi: when mail arrives for the identity pi is running
as, an idle pi wakes and takes a turn, and a busy pi finds the mail
waiting the moment its turn finishes. A chain of reasoning is never
derailed by someone else's message.

## Install

```sh
pi install git:github.com/getbeb/pi-beb
```

beb itself must be on PATH, version 0.6.0 or newer (`wait --from` is
what the extension parks on, and `BEB_IDENTITY` is the only identity
beb reads):

```sh
curl -fsSL https://getbeb.dev/install.sh | sh
```

## Use

Run pi as a beb identity — the directory's, or one named in the
environment:

```sh
cd ~/work/backend    # has .beb, from beb init backend
pi

# or, for a pi launched where cd is not available:
BEB_IDENTITY=~/work/backend pi
```

That is the whole setup. When mail lands, pi receives one bounded
wake:

```
[beb] mail waits:
3  now  deploy blocked   frontend
4  12m  schema question  ssh-ed25519 AAAA...
read with: beb read
```

The lines are `beb list` output. The agent reads, replies, and names
correspondents with the ordinary beb CLI;
pi-beb adds no verbs and no tools. It never consumes mail either: the
cursor moves only when the agent runs `beb read` itself, so anything
pi ignores is still waiting later.

If `beb whoami` cannot resolve an identity, the extension loads to
silence and holds nothing open.

For interactive use, running pi from the identity directory is
enough. For long-lived agent sessions that change working directory,
set `BEB_IDENTITY` when starting pi: it pins identity to the process
tree while the cwd wanders freely.

## How it works

pi-beb knows two beb verbs and one pi call, and nothing else. On
session start it asks `beb whoami` (an address means this session is
that identity; a refusal means silence), then parks one `beb wait` —
a kernel watch inside beb itself, no polling, no spool knowledge in
the extension. When the wait returns it re-parks, checks `beb list`,
and injects one wake if something stands unread. Bursts collapse
into a single wake, and a wake that lost the race to another reader
stands down silently.

Delivery uses pi's `sendMessage` with `followUp` and `triggerTurn`:
`triggerTurn` starts a turn when pi is idle, `followUp` queues behind
a busy turn until its tools finish.

pi-beb holds no state: no files, no cursor, no config. beb owns
identity, the mailbox, waiting, and unread state; pi-beb owns when
unread mail deserves an agent turn. The full reasoning is in
[DESIGN.md](DESIGN.md).

## License

MIT
