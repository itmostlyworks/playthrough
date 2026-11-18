// What outlives the command that starts it, as the agent's browser (`as`) and the page (`open`) do: the same command
// started again as a process of its own, told by its channel (process.send) that it's the one behind. The command comes
// back once that one says it's ready, with everything it said, or, where it ended before then, refuses with it; stopped
// before then, it stops it too. An agent's shell that gives up on a command takes everything it started with it: on
// 15 Nov, `as`; in a real run on 0.7.1, `open`.

import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { Refused } from "@playthrough/change";

// What it says after it's ready goes on into the log; ended before then having said nothing, it's said as `ended`.
export async function startBehind(log: string, ended: string) {
  mkdirSync(dirname(log), { recursive: true });
  const output = openSync(log, "w");
  const behind = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: ["ignore", output, output, "ipc"], detached: true });
  closeSync(output);
  const stopping = () => behind.kill("SIGINT");
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, stopping);
  const ready = await new Promise<boolean>((resolve) => {
    behind.once("message", () => resolve(true));
    behind.once("exit", () => resolve(false));
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.off(signal, stopping);
  const said = readFileSync(log, "utf8").trimEnd();
  if (!ready) throw new Refused([said || ended]);
  behind.disconnect();
  behind.unref();
  console.log(said);
}

// Said by the one behind, once it is: the command that started it comes back.
export function sayReady() {
  process.send!("ready");
  process.disconnect();
}
