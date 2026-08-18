# pi-beb

beb mail as an event-driven wake for the pi coding agent.

[beb](https://getbeb.dev/) delivers signed messages into a mailbox and
never interrupts anyone. pi-beb adds the wake policy for pi: mail
arriving while pi is idle starts a turn; mail arriving during a turn
waits until the turn ends.

Nothing lands mid-turn.

## Install

```sh
pi install git:github.com/getbeb/pi-beb
```

Requires beb 0.10.0 or newer:

```sh
curl -fsSL https://getbeb.dev/install.sh | sh
```

## Use

Run pi from a beb identity:

```sh
cd ~/work/backend    # has .beb, from beb init backend
pi
```

pi-beb pins that identity for the session, so changing directories
later does not change who signs.

You can also name the identity explicitly:

```sh
BEB_IDENTITY=~/work/backend pi
```

Unread mail arrives as a turn:

```text
[beb] mail waits:
4  12m  schema question  ssh-ed25519 AAAA...
3  4h   deploy blocked   frontend
read with: beb read
```

Mail arriving while pi is idle starts a turn. Mail arriving while pi is
busy queues behind it and lands when that turn's tools finish.

pi-beb never consumes mail: the cursor moves only when the agent runs
`beb read`. If no beb identity can be resolved, the extension stays
quiet.

For long-lived sessions that may change working directory, prefer
setting `BEB_IDENTITY` when launching pi.

## How it works

At session start, pi-beb pins one beb identity and parks a background
wait for new mail.

When the wait returns it re-parks, checks for unread mail, and injects
one wake. Bursts collapse into a single wake, and a wake that lost the
race to another reader stands down silently. pi-beb adds no verbs and no
tools, and holds no state of its own.

See [DESIGN.md](DESIGN.md) for wake semantics and delivery details.

## License

MIT
