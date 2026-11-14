// Whether an agent is listening for what the person says: playthrough wait, run in the background, says so beside the
// change while it waits, and the person's page asks.

import { rmSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stillAt, thisCommand, type Command } from "./command.ts";
import type { Repo } from "./repo.ts";

// While it waits, it says so beside the change, so the person can be told when nobody is: an agent's command in the
// background can be ended by the agent's own time limit, and what's sent then sits until it's run again. Ended by a
// signal, it leaves its file behind, so an agent counts as waiting only while its process runs: the same process, on
// the same start of the machine, not another given its number since.
export async function listening(repo: Repo, id: string): Promise<() => void> {
  const file = join(repo.waiting(id), String(process.pid));
  await mkdir(repo.waiting(id), { recursive: true });
  await writeFile(file, JSON.stringify(thisCommand()));
  const gone = () => rmSync(file, { force: true });
  process.once("exit", gone);
  return () => {
    process.off("exit", gone);
    gone();
  };
}

export async function agentWaiting(repo: Repo, id: string): Promise<boolean> {
  const agents = await readdir(repo.waiting(id)).catch(() => []);
  const still = await Promise.all(
    agents.map(async (pid) => {
      // One written before the machine's start was noted in it is empty: it's taken to be on this one, as it was.
      const said = await readFile(join(repo.waiting(id), pid), "utf8").catch(() => undefined);
      if (said === undefined) return false;
      try {
        const command: Command = said.trim() ? JSON.parse(said) : { by: Number(pid) };
        return stillAt(command);
      } catch {
        return false;
      }
    }),
  );
  return still.some(Boolean);
}
