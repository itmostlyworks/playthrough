// A note made in the app is a question, not a flow: where a person took a flow over in the app and said something there,
// the agent writes what they did as a fork of that flow (test.fork), and Playthrough runs it on every new version until
// they say it's fixed. Each fork with a note still open is recorded on the round being worked on, the flow to where they
// took it over and then the fork, and each open note's answer is placed on what it's on, where the fork first shows it;
// where it doesn't, at the fork's end. A note settled as fixed isn't run again, and its fork goes with it.

import { dirname, join } from "node:path";
import { firstShown } from "@playthrough/page";
import { allNotes, list, notesToAnswer, pausedAt, quote, Refused, roundInProgress, type Flow, type Place, type Review } from "@playthrough/review";
import { runFork } from "./flows.ts";
import type { Repo } from "./repo.ts";

// Where each note's answer goes, on its fork run again: the fork's name, none where the agent hasn't written one; whether
// what the note's on was found there; where the fork failed; and a picture of where it ended.
export type OnFork = { note: string; flow: string; step?: string; fork?: string; on?: Place; found: boolean; failed?: { at?: string; why: string }; picture?: string };

// The fork a note made in the app is on: the person's time in the app, whose notes share it.
const forkOf = (recording: string) => recording.match(/^(?:branches\/(.+)-\d+|forks\/(.+))\.json$/)?.slice(1).find(Boolean) ?? recording.replace(/\W+/g, "-");

export async function runForks(repo: Repo, review: Review, round: number, flows: Flow[]): Promise<OnFork[]> {
  const everyNote = allNotes(review);
  const open = notesToAnswer(review, round).flatMap((id) => {
    const kept = everyNote.get(id);
    return kept?.note.on?.app ? [{ ...kept, id }] : [];
  });
  const forks = Map.groupBy(open, ({ note }) => forkOf(note.on!.app!.recording));
  const ran: OnFork[] = [];
  for (const [fork, notes] of forks) {
    const from = notes[0]!.note.on!.app!.from;
    const then = review.rounds.find((kept) => kept.number === notes[0]!.round)?.flows.find((flow) => flow.name === from.flow);
    const now = flows.find((flow) => flow.name === from.flow);
    const paused = then && pausedAt(then, from.at);
    const unrun = (failed: string) => notes.map(({ id }): OnFork => ({ note: id, flow: from.flow, found: false, failed: { why: failed } }));
    if (!now || !paused) {
      ran.push(...unrun(`${quote(from.flow)} isn't in round ${round}`));
      continue;
    }
    console.log(`\nRunning ${quote(from.flow)} to where ${list([...new Set(notes.map(({ note }) => quote(note.id)))])} took it over, then its fork…`);
    const run = await runFork(repo, review.id, { flow: from.flow, step: paused.step, actions: paused.actions, notes: notes.map(({ id }) => id) });
    if (!run) {
      ran.push(...unrun(`${quote(from.flow)} doesn't get to where they took it over, the step ${quote(paused.step)}`));
      continue;
    }
    const step = paused.step;
    if (!run.fork || run.failed) {
      ran.push(...notes.map(({ id }): OnFork => ({ note: id, flow: from.flow, step, found: false, ...(run.fork && { fork: run.fork }), ...(run.failed && { failed: run.failed }) })));
      continue;
    }
    const recording = `forks/${fork}.json`;
    const start = run.events[0]!.timestamp;
    const length = Math.round(run.events.at(-1)!.timestamp - start) / 1000;
    await repo.reviews.saveFile(review.id, round, recording, Buffer.from(JSON.stringify(run.events)));
    await repo.reviews.saveFile(review.id, round, `readings/${recording}`, Buffer.from(JSON.stringify(run.readings)));
    await repo.reviews.saveFile(review.id, round, `assets/${recording}`, Buffer.from(JSON.stringify(run.assets)));
    for (const { name, bytes } of run.files) await repo.reviews.saveFile(review.id, round, name, bytes);
    const picture = run.picture && (await keepPicture(repo, review.id, round, `notes/${fork}-fork.png`, run.picture));
    const seen = [...run.readings, ...run.glimpses].filter((glimpse) => glimpse.at >= run.from);
    for (const { id, note } of notes) {
      const app = { from: { flow: from.flow, at: run.from }, did: note.on!.app!.did, recording, length, steps: run.steps };
      const shown = note.on!.element && firstShown(note.on!.element, seen);
      const on: Place = { flow: from.flow, at: shown ? shown.at : Math.max(run.from, length - 0.1), ...(shown && { element: shown.element }), app };
      ran.push({ note: id, flow: from.flow, step, fork: run.fork, on, found: !!shown, ...(picture && { picture }) });
    }
  }
  return ran;
}

async function keepPicture(repo: Repo, id: string, round: number, name: string, bytes: Buffer) {
  await repo.reviews.saveFile(id, round, name, bytes);
  return repo.show(join(dirname(repo.round(id, round)), "files", name));
}

// What stops the round being recorded: a note made in the app with no fork written for it, or whose fork failed.
export function unfinished(ran: OnFork[]): string[] {
  const unwritten = ran.filter((one) => !one.fork && one.step);
  const failed = ran.filter((one) => one.fork && one.failed);
  const lines = failed.map(({ note, fork, failed }) => `The fork ${quote(fork!)} for note ${note} failed${failed!.at ? ` at its step ${quote(failed!.at)}` : ""}, where Playwright says “${failed!.why}”. Fix it and record again.`);
  for (const [flow, notes] of Map.groupBy(unwritten, (one) => one.flow)) {
    const ids = notes.map((one) => one.note);
    lines.push(
      `${ids.length > 1 ? `Notes ${list(ids)} were` : `Note ${ids[0]} was`} made in the app, and ${ids.length > 1 ? "have" : "has"} no fork yet. Write what the person did there as a fork of ${quote(flow)}, after it in its file, finding things by role and name as its steps do:

  test.fork("<what they do there>", { notes: [${ids.map((id) => `"${id}"`).join(", ")}] }, async ({ page }) => {
    await test.step("<a step of theirs>", async () => { … });
  });

It runs from where they took the flow over, in its step ${quote(notes[0]!.step!)}, every round until the note is settled, and your answer goes on what the note is on, where the fork first shows it. Then record again.`,
    );
  }
  return lines;
}

// What the agent reads about each fork run again: whether it shows what the note is on, on the version as it is now.
export function saidOf(ran: OnFork): string {
  if (!ran.fork) return `Couldn't run note ${ran.note}'s fork: ${ran.failed?.why}.`;
  const noted = ran.on?.element ? `the ${ran.on.element.role} ${quote(ran.on.element.name)}` : "what it's on";
  if (ran.found) return `Ran ${quote(ran.fork)}, note ${ran.note}'s fork: it shows ${noted}, and your answer is there.${ran.picture ? ` Where it ends: ${ran.picture}` : ""}`;
  return `Ran ${quote(ran.fork)}, note ${ran.note}'s fork: it never shows what the note is on, so your answer is at its end.${ran.picture ? ` Where it ends: ${ran.picture}` : ""}`;
}

// From the command line, while the agent works: the round being worked on's notes made in the app, their forks run on the
// app as it is now, and, once the round is recorded, each answer placed on its fork.
export async function forks(repo: Repo, id: string) {
  const review = await repo.reviews.get(id);
  if (review.accepted) throw new Refused(["This review is accepted, so there's no fork left to run."]);
  const number = roundInProgress(review);
  const saved = review.rounds.find((round) => round.number === number);
  const flows = saved?.flows ?? review.rounds.findLast((round) => round.number > 0)?.flows ?? [];
  const ran = await runForks(repo, review, number, flows);
  if (!ran.length) return console.log(`Nothing to run: round ${number} answers no note made in the app.`);
  const left = unfinished(ran);
  if (left.length) throw new Refused(left);
  // As it is now, not as it was before running them: the agent may have written answers into it meanwhile.
  const now = saved && (await repo.reviews.get(id)).rounds.find((round) => round.number === number);
  if (now) {
    const placed = (reply: (typeof now.replies)[number]) => {
      const on = ran.find((one) => one.note === reply.note)?.on;
      return on ? { ...reply, on } : reply;
    };
    await repo.reviews.saveRound(id, { ...now, replies: now.replies.map(placed) });
  }
  console.log(`\n${ran.map(saidOf).join("\n")}`);
}

