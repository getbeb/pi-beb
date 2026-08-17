// The pin reaches the shell pi runs commands in.
//
// pi-beb sets process.env.BEB_IDENTITY at session_start so the agent's
// own `beb read` resolves an identity, not just the children pi-beb
// spawns. That works because pi builds every shell environment by
// spreading process.env at spawn time — which is an assumption about
// somebody else's code, so it is checked here against pi's real local
// bash backend rather than trusted.
//
// Run through tests/test.sh, which supplies the identity directory.
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

const dir = process.argv[2];
const ops = createLocalBashOperations();
// Numbered from where the shell half left off, so the suite counts once.
let n = Number(process.env.PI_BEB_TEST_BASE || 0);
const ok = (m) => console.log(`ok ${++n} - ${m}`);
const die = (m) => {
  console.log(`not ok - ${m}`);
  process.exit(1);
};

const whoami = () =>
  new Promise((resolve) => {
    let out = "";
    ops
      .exec("beb whoami", dir, { onData: (d) => (out += d) })
      .then(({ exitCode }) => resolve({ exitCode, out }));
  });

const before = await whoami();
if (before.exitCode === 0) die(`an unpinned shell already had an identity: ${before.out}`);
if (!before.out.includes("BEB_IDENTITY is not set"))
  die(`unexpected refusal before the pin: ${before.out}`);
ok("without the pin, the agent's own shell has no identity to sign as");

process.env.BEB_IDENTITY = dir; // exactly what session_start does
const after = await whoami();
if (after.exitCode !== 0) die(`the pin did not reach the shell: ${after.out}`);
if (!after.out.startsWith("ssh-ed25519 ")) die(`no address on stdout: ${after.out}`);
ok("assigning process.env pins the identity for pi's own bash backend");
