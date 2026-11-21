// The pretend agent: in a state's copy, it stands in for the coding agent. Listening, it says so as playthrough wait
// does, takes what's sent as wait would, and a few seconds later hands back the next kept version, answering what was
// actually sent. When the kept versions run out, it just keeps working.

import { handBackInProgress, notesToAnswer, saidDone, sendsNotTaken, type Change } from "@playthrough/change";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { Repo } from "../packages/cli/src/repo.ts";
import { listening } from "../packages/cli/src/wait.ts";
import { answersFor } from "./as-it-was.ts";
import { keepHandBack } from "./copy.ts";
import type { State } from "./list.ts";

// How long it works on what it took before handing back.
const WORKING = 4;

// Runs until the change is done, there's nothing more it would do, or it's stopped.
export function pretendAgent(repo: Repo, id: string, kept: { change: Change; folder: string }, state: State, signal: AbortSignal) {
  const run = async () => {
    for (let first = true; ; first = false) {
      const change = await repo.changes.get(id);
      if (saidDone(change)) return;
      const working = handBackInProgress(change);
      if (notesToAnswer(change, working).length) {
        const next = kept.change.handBacks.find((one) => one.number === working && one.finished);
        if (state.agent === "working" || !next) return;
        await sleep(((first && state.landsIn) || WORKING) * 1000, undefined, { signal });
        const replies = answersFor(kept.change, next, await repo.changes.get(id));
        await keepHandBack(kept.folder, join(repo.root, ".playthrough", id), { ...next, replies, finished: new Date().toISOString() }, kept.change.comparisons);
        continue;
      }
      if (state.agent !== "listening") return;
      const stop = await listening(repo, id);
      try {
        await repo.changes.wait(id, (change) => sendsNotTaken(change).length > 0, signal);
      } finally {
        stop();
      }
      await repo.changes.take(id);
    }
  };
  return run().catch((error) => {
    if (!signal.aborted) console.error(`The pretend agent stopped: ${(error as Error).message}`);
  });
}
