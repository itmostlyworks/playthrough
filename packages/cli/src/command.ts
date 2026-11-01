// A playthrough command, as another one sees it: the process it runs in, on which start of the machine. What a command
// writes in .playthrough/ for the others, it writes as this, so they know it for its own for as long as it's still at it.

import { readFileSync } from "node:fs";
import { uptime } from "node:os";

export type Command = { by: number; boot?: string | number };

export const thisCommand = (): Command => ({ by: process.pid, boot: boot() });

// The command is still at it: its process is running, and is the same one, not another that has its number since the
// machine started again.
export const stillAt = (command: Command) => sameBoot(command.boot) && running(command.by);

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

function running(pid: number): boolean {
  try {
    return process.kill(pid, 0);
  } catch (error) {
    return (error as { code?: string }).code === "EPERM";
  }
}
