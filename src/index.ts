import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile, spawn, type ChildProcess } from "node:child_process";

/**
 * pi-beb — beb mail as an event-driven wake for the pi coding agent.
 *
 * beb (https://getbeb.dev) delivers signed messages into a mailbox and
 * never interrupts anyone; wake policy belongs to the runtime. This
 * extension is that policy for pi, and it is all it is: beb owns
 * identity, the mailbox, waiting, and unread state; pi-beb owns when
 * unread mail deserves an agent turn.
 *
 * It knows two CLI contracts and one pi contract:
 *
 *   beb wait   — block until the next message arrives (kernel watch)
 *   beb list   — what stands unread; moves nothing
 *   sendMessage(followUp + triggerTurn) — wake idle, queue behind busy
 *
 * pi-beb never consumes mail. The wake carries `beb list` lines and the
 * verb to act on them; the cursor moves only when the agent runs
 * `beb read` itself.
 *
 * Which makes the mark load-bearing. `beb wait` measures from the
 * cursor by default, and the cursor is the agent's: a waiter that never
 * reads would find the same mail standing on every call and respawn in
 * a tight loop until the agent got around to it. `--from` measures from
 * what pi-beb has already seen instead, so each message wakes it once
 * however long the agent takes. beb prints the next mark on stdout on
 * arrival and on timeout alike, so the mark survives a leg boundary.
 *
 * Identity is BEB_IDENTITY, resolved once at session_start to pi's own
 * declaration or else the directory the session opened in. beb has read
 * nothing else since 0.6.0, and pinning is what keeps a session that
 * wanders between subdirectories signing as whoever it began as. Where
 * beb resolves nobody, pi-beb loads to silence.
 *
 * The pin goes on `process.env`, not just on the children pi-beb
 * spawns, because the agent runs beb too. pi builds every shell
 * environment by spreading `process.env` at spawn time, so one
 * assignment reaches the agent's own `beb read` and the user's `!beb
 * list` alike. Without it the extension knew who it was and the agent
 * it woke did not: `beb whoami` in the session answered "BEB_IDENTITY
 * is not set, so there is no identity to sign as", which is a strange
 * thing to be told by a session that was just handed mail.
 */
export default function (pi: ExtensionAPI) {
  let child: ChildProcess | null = null;
  let stopping = false;
  let lastWake = "";
  let identity = "";
  let mark = "";

  const bin = () => process.env.BEB_BIN || "beb";
  const env = () => ({ ...process.env, BEB_IDENTITY: identity });

  const beb = (args: string[]) =>
    new Promise<string | null>((resolve) => {
      execFile(bin(), args, { env: env() }, (err, stdout) =>
        resolve(err ? null : stdout),
      );
    });

  // The opening mark, taken without blocking. `wait --timeout 0` prints
  // it whether or not mail is standing and exits 2 in the second case,
  // so this reads stdout and ignores the code — unlike `beb` above,
  // where a non-zero exit is exactly the signal to stay quiet.
  const armMark = () =>
    new Promise<string>((resolve) => {
      execFile(bin(), ["wait", "--timeout", "0"], { env: env() }, (_e, out) =>
        resolve((out || "").trim()),
      );
    });

  // One wake per unread state: delivery ids are never reused, so
  // identical list output always means the same mail. An empty list is
  // silence, so a wake that lost the race to another reader stands down.
  const wake = async () => {
    const unread = await beb(["list", "--unread", "--limit", "10"]);
    if (!unread || unread === lastWake) return;
    lastWake = unread;
    pi.sendMessage(
      {
        customType: "beb-mail",
        content: `[beb] mail waits:\n${unread}read with: beb read`,
        display: true,
      },
      { deliverAs: "followUp", triggerTurn: true },
    );
  };

  // Park on `beb wait`. On arrival: respawn FIRST, then announce, so a
  // message landing between the old wait's exit and the new one's watch
  // is caught by the announce's `list` (the same arm-then-scan ordering
  // beb wait uses inside itself). Timeouts re-park quietly; a wait that
  // dies fast (identity gone, beb missing) retries gently, never hot.
  const park = () => {
    if (stopping || child) return;
    const args = mark
      ? ["wait", "--from", mark, "--timeout", "3600"]
      : ["wait", "--timeout", "3600"];
    child = spawn(bin(), args, {
      env: env(),
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.on("exit", (code) => {
      child = null;
      if (stopping) return;
      // The mark advances on a timeout too, so a leg boundary is never a
      // window in which an arrival becomes baseline and never fires.
      const next = out.trim();
      if (next) mark = next;
      // 0 arrived, 2 timed out, anything else is trouble: a refusal or a
      // missing binary returns at once, and retrying that at full speed
      // is the one way this loop can burn a core.
      setTimeout(
        () => {
          park();
          if (code === 0) void wake();
        },
        code === 0 || code === 2 ? 0 : 5000,
      );
    });
  };

  // Background resources start at session_start, never in the factory —
  // the factory may run in an invocation that never opens a session.
  pi.on("session_start", async (_event, ctx) => {
    // One-shot modes have no live session to wake.
    if (ctx.mode === "print" || ctx.mode === "json") return;

    // beb's own identity resolution, whatever it resolves to. A refusal
    // means this session is nobody: stay silent, hold nothing open.
    identity = process.env.BEB_IDENTITY || ctx.cwd;
    const who = await beb(["whoami"]);
    if (!who) return;

    // Only once beb has answered. Pinning a directory beb refuses would
    // replace its "BEB_IDENTITY is not set" -- which names `beb init` --
    // with a complaint about a directory nobody chose, and pi-beb's
    // rule is that resolving nobody means holding nothing.
    process.env.BEB_IDENTITY = identity;

    stopping = false;
    mark = await armMark();
    park();
    if (ctx.hasUI) ctx.ui.setStatus("beb", "standing by for mail");

    // Mail that arrived while pi was away is already waiting: one
    // catch-up wake at the start, through the same gate as any other.
    void wake();
  });

  pi.on("session_shutdown", async () => {
    stopping = true;
    child?.kill();
    child = null;
  });
}
