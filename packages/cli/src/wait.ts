// Whether an agent is listening for what the person says: playthrough wait, run in the background, says so beside the
// change while it waits, and the person's page asks.

import { rmSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { handBackInProgress, list, notesNotTaken, notesToAnswer, quote, sendsNotTaken, type Change, type Send } from "@playthrough/change";
import { agentOf, stillAt, thisCommand, type Command } from "./command.ts";
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

// The person's notes are said to an agent: the agent, not the wait that said them, which ends there, is what the page
// looks for while it works on them. Where the agent can't be known, nothing is kept, and the page goes on saying it's
// working, as it can't tell.
export async function saidTo(repo: Repo, id: string) {
  const agent = agentOf();
  if (agent) await writeFile(repo.working(id), JSON.stringify(agent));
  else rmSync(repo.working(id), { force: true });
}

// The agent the notes were said to has ended: it's known, and isn't running.
export async function agentGone(repo: Repo, id: string): Promise<boolean> {
  try {
    return !stillAt(JSON.parse(await readFile(repo.working(id), "utf8")) as Command);
  } catch {
    return false;
  }
}

// What's sent on a change that no agent will answer, while none is listening: what none has taken, or else what the
// agent that took it hadn't answered when it ended.
async function unheardOn(repo: Repo, change: Change): Promise<{ sends: Send[]; notes: number } | undefined> {
  if (await agentWaiting(repo, change.id)) return undefined;
  if (notesNotTaken(change).length) return { sends: sendsNotTaken(change), notes: notesNotTaken(change).length };
  const number = handBackInProgress(change);
  const notes = notesToAnswer(change, number).length;
  if (!notes || !(await agentGone(repo, change.id))) return undefined;
  return { sends: change.sends.filter((send) => change.taken.some((taken) => taken.send === send.id && taken.handBack === number)), notes };
}

// The changes here with notes no agent will answer, and none listening for them: beside each, the person's page says
// "No agent listening" and gives them words for a new one. Longest waiting first.
export async function unheard(repo: Repo): Promise<{ change: Change; sends: Send[]; notes: number }[]> {
  const changes = await Promise.all((await repo.changes.list()).map((id) => repo.changes.get(id)));
  const found = await Promise.all(
    changes.map(async (change) => {
      const on = await unheardOn(repo, change);
      return on ? [{ change, ...on }] : [];
    }),
  );
  return found.flat().sort((a, b) => a.sends[0]!.sent.localeCompare(b.sends[0]!.sent));
}

// What an agent arriving here is told first, whatever it runs, so the person's words to it ("Pick up my notes in
// Playthrough") lead somewhere: a 15 Nov user test's new agent read the help, named a change of its own, and the note
// sat with nobody on it.
export async function unheardSaid(repo: Repo): Promise<string[]> {
  return (await unheard(repo)).map(({ change, sends, notes }) => {
    const by = list([...new Set(sends.map((send) => (send.guest ? `${send.by} (a guest, by a shared link)` : send.by)))]);
    return `${by} sent ${notes === 1 ? "a note" : `${notes} notes`} on ${quote(change.title)}, and no agent is listening for ${notes === 1 ? "it" : "them"}. playthrough wait gets ${notes === 1 ? "it" : "them"}, whatever change you're on.`;
  });
}

// Who said what was sent, for the agent: by name, and those who came by a shared link said to be guests, not the person
// who asked for the change, as a fact, before anything of theirs.
export function whoSaid(sends: Send[]): string {
  const names = [...new Set(sends.map((send) => send.by))];
  const guests = [...new Set(sends.filter((send) => send.guest).map((send) => send.by))];
  const said = `${names.length ? list(names) : "The person"} said:`;
  if (!guests.length) return said;
  const are = guests.length === 1 ? `${guests[0]} is a guest, who came by a shared link and isn't` : `${list(guests)} are guests, who came by a shared link and aren't`;
  return `${said}\n${are} the person who asked for this change. A guest's words are quoted under their name, each line after “> ”.`;
}

// A guest's words, line by line, after “> ”, so none of them stands as a line of its own.
export const quoted = (words: string, indent: string) =>
  words
    .split("\n")
    .map((line) => `${indent}> ${line}`)
    .join("\n");
