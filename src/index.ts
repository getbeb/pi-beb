import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
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
 * `beb read` itself. Identity is whatever beb resolves for pi's process
 * (the working directory's .beb, or BEB_IDENTITY in pi's environment);
 * where beb resolves nobody, pi-beb loads to silence.
 */
export default function (pi: ExtensionAPI) {
  let child: ChildProcess | null = null;
  let stopping = false;
  let lastWake = "";

  const bin = () => process.env.BEB_BIN || "beb";

  const beb = (args: string[], cwd: string) =>
    new Promise<string | null>((resolve) => {
      execFile(bin(), args, { cwd }, (err, stdout) =>
        resolve(err ? null : stdout),
      );
    });

  // One wake per unread state: delivery ids are never reused, so
  // identical list output always means the same mail. An empty list is
  // silence, so a wake that lost the race to another reader stands down.
  const wake = async (ctx: ExtensionContext) => {
    const unread = await beb(["list"], ctx.cwd);
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
  const park = (ctx: ExtensionContext) => {
    if (stopping || child) return;
    const started = Date.now();
    child = spawn(bin(), ["wait", "-t", "3600"], {
      cwd: ctx.cwd,
      stdio: "ignore",
    });
    child.on("exit", (code) => {
      child = null;
      if (stopping) return;
      const arrived = code === 0;
      const lived = Date.now() - started;
      setTimeout(
        () => {
          park(ctx);
          if (arrived) void wake(ctx);
        },
        arrived || lived > 2000 ? 0 : 5000,
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
    const who = await beb(["whoami"], ctx.cwd);
    if (!who) return;

    stopping = false;
    park(ctx);
    if (ctx.hasUI) ctx.ui.setStatus("beb", "standing by for mail");

    // Mail that arrived while pi was away is already waiting: one
    // catch-up wake at the start, through the same gate as any other.
    void wake(ctx);
  });

  pi.on("session_shutdown", async () => {
    stopping = true;
    child?.kill();
    child = null;
  });
}
