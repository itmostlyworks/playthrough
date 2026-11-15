// Whether an agent is listening for what the person says: playthrough wait, run in the background, says so beside the
// change while it waits, and the person's page asks.

import { rmSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { list, notesNotTaken, quote, sendsNotTaken, type Change } from "@playthrough/change";
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

// The changes here with notes sent that no agent has taken, and none listening for them: beside each, the person's page
// says "No agent listening" and gives them words for a new one. Longest waiting first.
export async function unheard(repo: Repo): Promise<Change[]> {
  const changes = await Promise.all((await repo.changes.list()).map((id) => repo.changes.get(id)));
  const found = await Promise.all(changes.map(async (change) => notesNotTaken(change).length > 0 && !(await agentWaiting(repo, change.id))));
  const sent = (change: Change) => sendsNotTaken(change)[0]!.sent;
  return changes.filter((_, i) => found[i]).sort((a, b) => sent(a).localeCompare(sent(b)));
}

// What an agent arriving here is told first, whatever it runs, so the person's words to it ("Pick up my notes in
// Playthrough") lead somewhere: a 15 Nov user test's new agent read the help, named a change of its own, and the note
// sat with nobody on it.
export async function unheardSaid(repo: Repo): Promise<string[]> {
  return (await unheard(repo)).map((change) => {
    const notes = notesNotTaken(change).length;
    const by = list([...new Set(sendsNotTaken(change).map((send) => send.by))]);
    return `${by} sent ${notes === 1 ? "a note" : `${notes} notes`} on ${quote(change.title)}, and no agent is listening for ${notes === 1 ? "it" : "them"}. playthrough wait gets ${notes === 1 ? "it" : "them"}, whatever change you're on.`;
  });
}
