// A fork is a question, not a flow: where a person took a flow over in the app and said something there, Playthrough keeps
// their steps and walks them again on every new version, until they say it's fixed. Walked, each fork with a note still
// open is recorded on the round being worked on, the flow to where they took it over and then their steps, and each open
// note's answer is placed where it was on that recording, on what it's on if the page has it; where their steps don't
// get there any more, where they stopped. A note settled as fixed isn't walked again.

import { dirname, join } from "node:path";
import { allNotes, list, notesToAnswer, pausedAt, quote, Refused, roundInProgress, type Flow, type Place, type Review } from "@playthrough/review";
import { walkFork } from "./flows.ts";
import type { Repo } from "./repo.ts";

// Where each walked note's answer goes, whether its steps got there, the one they stopped at, and a picture of it.
export type WalkedNote = { note: string; flow: string; on?: Place; reached: boolean; stopped?: string; picture?: string };

// The fork a note made in the app is on: the person's time in the app, whose notes share it.
const forkOf = (recording: string) => recording.match(/^(?:branches\/(.+)-\d+|walks\/(.+))\.json$/)?.slice(1).find(Boolean) ?? recording.replace(/\W+/g, "-");

export async function walkForks(repo: Repo, review: Review, round: number, flows: Flow[]): Promise<WalkedNote[]> {
  const everyNote = allNotes(review);
  const open = notesToAnswer(review, round).flatMap((id) => {
    const kept = everyNote.get(id);
    return kept?.note.on?.app ? [{ ...kept, id }] : [];
  });
  const forks = Map.groupBy(open, ({ note }) => forkOf(note.on!.app!.recording));
  const walked: WalkedNote[] = [];
  for (const [fork, notes] of forks) {
    const from = notes[0]!.note.on!.app!.from;
    const then = review.rounds.find((kept) => kept.number === notes[0]!.round)?.flows.find((flow) => flow.name === from.flow);
    const now = flows.find((flow) => flow.name === from.flow);
    const paused = then && pausedAt(then, from.at);
    const unwalked = (stopped: string) => notes.map(({ id }): WalkedNote => ({ note: id, flow: from.flow, reached: false, stopped }));
    if (!now || !paused) {
      walked.push(...unwalked(`${quote(from.flow)} isn't in round ${round}`));
      continue;
    }
    // One walk for the fork, as far as its furthest note: each note's steps are the start of the next one's.
    const did = notes.map(({ note }) => note.on!.app!.did).reduce((longest, one) => (one.length > longest.length ? one : longest));
    console.log(`\nWalking ${quote(from.flow)} again, as ${list([...new Set(notes.map(({ note }) => quote(note.id)))])} left it in the app…`);
    const run = await walkFork(repo, review.id, { flow: from.flow, step: paused.step, actions: paused.actions, did, look: notes.map(({ note }) => ({ after: note.on!.app!.did.length, css: note.on!.element?.css })) });
    if (!run) {
      walked.push(...unwalked(`${quote(from.flow)} doesn't get to where they took it over`));
      continue;
    }
    const recording = `walks/${fork}.json`;
    const start = run.events[0]!.timestamp;
    // Stopped short, the fork ends where the steps did, the answer at its tip, not where the trying gave up: just past
    // it, so playing stops at the answer and then comes back down.
    const length = run.stopped ? Math.round(((run.done.at(-1) ?? run.from) + 0.08) * 1000) / 1000 : Math.round(run.events.at(-1)!.timestamp - start) / 1000;
    await repo.reviews.saveFile(review.id, round, recording, Buffer.from(JSON.stringify(run.events)));
    await repo.reviews.saveFile(review.id, round, `readings/${recording}`, Buffer.from(JSON.stringify(run.readings)));
    await repo.reviews.saveFile(review.id, round, `assets/${recording}`, Buffer.from(JSON.stringify(run.assets)));
    for (const { name, bytes } of run.files) await repo.reviews.saveFile(review.id, round, name, bytes);
    const app = { from: { flow: from.flow, at: run.from }, did: did.slice(0, run.done.length), recording, length };
    for (const [i, { id, note }] of notes.entries()) {
      const steps = note.on!.app!.did.length;
      const reached = run.done.length >= steps;
      const at = (reached ? run.done[steps - 1] : run.done.at(-1)) ?? run.from;
      const node = reached ? run.found[i] : null;
      const on: Place = { flow: from.flow, at, ...(node && note.on!.element && { element: { role: note.on!.element.role, name: note.on!.element.name, node } }), app };
      const picture = run.pictures[i] && (await keepPicture(repo, review.id, round, `notes/${id}-walked.png`, run.pictures[i]!));
      walked.push({ note: id, flow: from.flow, on, reached, ...(!reached && { stopped: run.stopped ?? "" }), ...(picture && { picture }) });
    }
  }
  return walked;
}

async function keepPicture(repo: Repo, id: string, round: number, name: string, bytes: Buffer) {
  await repo.reviews.saveFile(id, round, name, bytes);
  return repo.show(join(dirname(repo.round(id, round)), "files", name));
}

// What the agent reads about each walk: whether the person's steps still get to their note on the version as it is now,
// and if not, the one they stop at.
export function saidOf(walked: WalkedNote): string {
  const fork = `the steps note ${walked.note} was made after, on ${quote(walked.flow)}`;
  if (walked.reached) return `Walked ${fork} again: they get to the note.${walked.picture ? ` As it is now: ${walked.picture}` : ""}`;
  if (walked.on)
    return `Walked ${fork} again: they stop at ${quote(walked.stopped ?? "")}, which they can't do now, and the person sees that there. Fix what it's on, or say in your answer to note ${walked.note} why their steps changed.`;
  return `Couldn't walk ${fork} again: ${walked.stopped}.`;
}

// From the command line, while the agent works: the round being worked on's open forks walked on the app as it is now,
// and, once the round is recorded, each answer placed on its walk.
export async function walk(repo: Repo, id: string) {
  const review = await repo.reviews.get(id);
  if (review.accepted) throw new Refused(["This review is accepted, so there's nothing left to walk."]);
  const number = roundInProgress(review);
  const saved = review.rounds.find((round) => round.number === number);
  const flows = saved?.flows ?? review.rounds.findLast((round) => round.number > 0)?.flows ?? [];
  const walked = await walkForks(repo, review, number, flows);
  if (!walked.length) return console.log(`Nothing to walk: round ${number} answers no note made in the app.`);
  if (saved) {
    const placed = (reply: (typeof saved.replies)[number]) => {
      const on = walked.find((one) => one.note === reply.note)?.on;
      return on ? { ...reply, on } : reply;
    };
    await repo.reviews.saveRound(id, { ...saved, replies: saved.replies.map(placed) });
  }
  console.log(`\n${walked.map(saidOf).join("\n")}`);
}

