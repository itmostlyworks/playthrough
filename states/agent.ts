// The pretend agent: in a state's copy, it stands in for the coding agent. Listening, it says so as playthrough wait
// does, takes what's sent as wait would, and a few seconds later hands back the next kept version, answering what was
// actually sent. When the kept versions run out, it just keeps working. Hand back now hands back at once, whatever it
// was doing: what's sent taken first, and with nothing sent, a version nobody asked for.

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

export type Kept = { change: Change; folder: string };

export function pretendAgent(repo: Repo, id: string, kept: Kept, state: State, signal: AbortSignal) {
  let pressed = Promise.withResolvers<void>();
  let running = false;
  // Working on what it took, until it hands it back.
  let working = false;
  let first = true;

  // The next kept version, handed back now, answering what it took. None left, it hands back nothing.
  async function handBack(): Promise<void> {
    const number = handBackInProgress(await repo.changes.get(id));
    const next = kept.change.handBacks.find((one) => one.number === number && one.finished);
    if (!next) return;
    const replies = answersFor(kept.change, next, await repo.changes.get(id));
    await keepHandBack(kept.folder, join(repo.root, ".playthrough", id), { ...next, replies, finished: new Date().toISOString() }, kept.change.comparisons);
  }

  async function run() {
    running = true;
    try {
      for (;;) {
        const change = await repo.changes.get(id);
        if (saidDone(change)) return;
        if (notesToAnswer(change, handBackInProgress(change)).length) {
          // Working for good, it's as long as a timer runs.
          const seconds = state.agent === "working" ? 2_000_000 : (first && state.landsIn) || WORKING;
          first = false;
          working = true;
          await Promise.race([pressed.promise, sleep(seconds * 1000, undefined, { signal })]).finally(() => (working = false));
          signal.throwIfAborted();
          if (!hasNext(await repo.changes.get(id))) return;
          await handBack();
          continue;
        }
        if (state.agent === "nobody") return;
        const stop = await listening(repo, id);
        try {
          await repo.changes.wait(id, (change) => sendsNotTaken(change).length > 0, signal);
        } finally {
          stop();
        }
        await repo.changes.take(id);
      }
    } finally {
      running = false;
    }
  }

  const hasNext = (change: Change) => kept.change.handBacks.some((one) => one.number === handBackInProgress(change) && one.finished);
  const started = () =>
    run().catch((error) => {
      if (!signal.aborted) console.error(`The pretend agent stopped: ${(error as Error).message}`);
    });
  void started();

  return {
    // Whether there's a kept version left to hand back.
    left: async () => hasNext(await repo.changes.get(id)),
    async handBackNow() {
      await repo.changes.take(id);
      if (!hasNext(await repo.changes.get(id))) return;
      // Working on what it took, it stops working and hands back; otherwise it hands back here, and goes on listening.
      if (working) {
        const now = pressed;
        pressed = Promise.withResolvers();
        return now.resolve();
      }
      await handBack();
      if (!running && state.agent !== "nobody") void started();
    },
  };
}
