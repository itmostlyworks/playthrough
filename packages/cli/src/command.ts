// A playthrough command, as another one sees it: the process it runs in, on which start of the machine. What a command
// writes in .playthrough/ for the others, it writes as this, so they know it for its own for as long as it's still at it.

import { readFileSync } from "node:fs";
import { uptime } from "node:os";

// `started`, where it's known, tells the process from another given its number since on the same start of the machine.
export type Command = { by: number; boot?: string | number; started?: number };

export const thisCommand = (): Command => ({ by: process.pid, boot: boot(), started: processOf(process.pid)?.started });

// The command is still at it: its process is running, and is the same one, not another that has its number since the
// machine started again, or since it ended, as one killed hard leaves what it wrote for another to be taken for it.
export const stillAt = (command: Command) => sameBoot(command.boot) && running(command.by) && (command.started === undefined || (processOf(command.by)?.started ?? command.started) === command.started);

// The agent that ran this command, which goes on after it: the nearest process above it that isn't only how it was run.
// What only runs it ends with it: anything in its session, which an agent starts for each command (Claude Code does),
// and a shell given the command (`bash -c`) or a package runner (`npx`) above that. An agent that runs its commands in
// its own session is passed by for what started it, as is a person's shell for their terminal: they end later, if at
// all, so the page is late to say it, never early. Known only where /proc says it; elsewhere, nothing.
export function agentOf(): Command | undefined {
  const session = processOf(process.pid)?.session;
  if (session === undefined) return undefined;
  for (let pid = process.ppid; pid > 1; ) {
    const one = processOf(pid);
    if (!one) return undefined;
    if (one.session !== session && !givenCommand(one.words)) return { by: pid, boot: boot(), started: one.started };
    pid = one.parent;
  }
  return undefined;
}

const SHELLS = ["sh", "bash", "zsh", "dash", "ksh", "fish"];
const RUNNER = /^(npm|npx|pnpm|pnpx|yarn|bunx?)\b/;
const nameOf = (word = "") => word.split("/").at(-1)!.replace(/^-/, "");

function givenCommand(words: string[]): boolean {
  const [first = "", second] = words;
  // A runner names itself in its first word, or, when run by node, in its script's.
  if (RUNNER.test(nameOf(first.split(" ")[0])) || RUNNER.test(nameOf(second))) return true;
  return SHELLS.includes(nameOf(first)) && words.slice(1).some((word) => /^-[a-z]*c[a-z]*$/.test(word));
}

// A process as /proc says it: its parent, its session, when it started since the machine did, the words it runs, and
// whether it has ended, waiting only for its parent to see it (a zombie).
function processOf(pid: number): { parent: number; session: number; started: number; words: string[]; ended: boolean } | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const words = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean);
    return { parent: Number(fields[1]), session: Number(fields[3]), started: Number(fields[19]), words, ended: fields[0] === "Z" || fields[0] === "X" };
  } catch {
    return undefined;
  }
}

// Which start of the machine this is. Linux names each one; elsewhere it's when it started, which a clock set since moves
// by no more than a few minutes.
function boot(): string | number {
  try {
    return readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
  } catch {
    return Date.now() / 1000 - uptime();
  }
}

// One written before Playthrough noted the start is taken to be this one's, as it always was.
function sameBoot(then: string | number | undefined, now = boot()): boolean {
  if (typeof then === "number" && typeof now === "number") return Math.abs(then - now) < 300;
  return then === undefined || then === now;
}

// Killed hard where nothing reaps it, as under a container's first process, a process has ended but is still there.
function running(pid: number): boolean {
  if (processOf(pid)?.ended) return false;
  try {
    return process.kill(pid, 0);
  } catch (error) {
    return (error as { code?: string }).code === "EPERM";
  }
}
