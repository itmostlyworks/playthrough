// Records the round being worked on: runs every scene like a person would, keeps each recording, records the scenes new to
// the review on Before too, places each note's answer on its thing there, compares the round with each round before it,
// and says what's left before it can be handed over: an answer to each note, and why each step changed since the round
// before, or in a scene new this round, since Before. Recording again keeps whatever the agent already wrote in the round.

import { existsSync } from "node:fs";
import { placeIn } from "@playthrough/page";
import { inOrderJoined, lastSeen, list, LONGEST_LINE, notesToAnswer, problemsFinishing, quote, Refused, roundInProgress, toAccountFor, type Scene, type Reply, type Review } from "@playthrough/review";
import { agent, unnamed } from "./agent.ts";
import { handedOver, recordOnBefore } from "./before.ts";
import { compareWithEarlier } from "./compare.ts";
import { called, failedAt, runScenes, whereItStopped } from "./scenes.ts";
import type { Repo } from "./repo.ts";
import { readingsOn } from "./reporter.ts";
import { setupIn } from "./setup.ts";
import { runForks, saidOf, unfinished, type OnFork } from "./forks.ts";

export async function record(repo: Repo, id: string) {
  const review = await repo.reviews.get(id);
  if (review.accepted) throw new Refused(["This review is accepted, so nothing more can be recorded."]);
  const number = review.rounds.length ? roundInProgress(review) : 1;
  // Until its round is handed over, a scene new to the review is recorded twice, to see what changes by itself.
  const ran = await runScenes(repo, id, number, { first: (scene) => !handedOver(review, scene) });
  const { recorded, failed } = ran;
  if (failed.length)
    throw new Refused([
      `\nRound ${number} wasn't recorded, because ${failed.length > 1 ? "these scenes" : "a scene"} failed:`,
      ...failed.map(failedAt),
      `Fix ${failed.length > 1 ? "them" : "it"} and record again, which runs ${failed.length > 1 ? "them" : "it"} first. ${whereItStopped(repo, id, failed)}`,
    ]);
  await recordOnBefore(repo, id, number, ran);

  // As it is now, not as it was before recording: the agent may have written answers into it meanwhile.
  const saved = (await repo.reviews.get(id)).rounds.find((round) => round.number === number);
  // In the order they joined the review, as Before keeps them, rather than their files': one new here comes last.
  const joined = inOrderJoined(review);
  const place = (name: string) => (joined.includes(name) ? joined.indexOf(name) : joined.length);
  const scenes = recorded
    .map(({ scene }) => {
      const line = saved?.scenes.find((kept) => kept.name === scene.name)?.line;
      return line ? { ...scene, line } : scene;
    })
    .sort((a, b) => place(a.name) - place(b.name));
  for (const { files } of recorded) for (const { name, bytes } of files) await repo.reviews.saveFile(id, number, name, bytes);
  const written = saved?.replies ?? [];
  const waiting: Reply[] = notesToAnswer(review, number)
    .filter((note) => !written.some((reply) => reply.note === note))
    .map((note) => ({ note, words: "" }));
  const by = agent(saved?.by);
  const forked = await runForks(repo, review, number, scenes);
  const forkless = unfinished(forked);
  if (forkless.length) throw new Refused([`\nRound ${number} wasn't recorded:`, ...forkless]);
  const replies = await Promise.all([...written, ...waiting].map((reply) => placed(repo, review, number, scenes, reply, forked)));
  // Compared before the round is kept, so it's never there to hand over without them.
  console.log(`\nComparing round ${number} with each round before it…`);
  const comparisons = await compareWithEarlier(repo.reviews, id, number, scenes);
  await repo.reviews.saveRound(id, { number, by, scenes, replies, accounts: saved?.accounts ?? {} });
  for (const comparison of comparisons) await repo.reviews.saveComparison(id, comparison);

  // A scene that's new to the person can say what it starts from, and whether it shows the change or what the change
  // leaves alone. One that shows nothing different from Before is asked which: it may never reach the change.
  const previous = review.rounds.findLast((round) => round.number > 0 && round.number < number);
  const before = comparisons.find((comparison) => comparison.since === 0);
  const same = before ? scenes.filter((scene) => !scene.line && !before.changes.some((change) => change.seen.some((seen) => seen.scene === scene.name))) : [];
  const unsaid = scenes.filter((scene) => !scene.line && !same.includes(scene) && !previous?.scenes.some((kept) => kept.name === scene.name));
  const file = repo.show(repo.round(id, number));
  const left = problemsFinishing(await repo.reviews.get(id), number);
  console.log(`\nRecorded round ${number}: ${scenes.length > 3 ? called(scenes.map((scene) => scene.name)) : list(scenes.map((scene) => `${quote(scene.name)} (${Math.round(scene.length)}s)`))}.`);
  const since = comparisons.find((comparison) => comparison.since === number - 1);
  const named = toAccountFor(since);
  if (since) console.log(`\n${changed(named.length, number - 1)}`);
  // What only the pictures show is for the person's eyes: said, so the work's look isn't a surprise, and asking nothing.
  const pictured = since?.changes.filter((change) => change.pictureOnly) ?? [];
  if (pictured.length) {
    const [parts, look, them, need] = pictured.length > 1 ? [`${pictured.length} parts of the page`, "look", "them", "they need"] : ["One part of the page", "looks", "it", "it needs"];
    console.log(`${parts} only ${look} different in the pictures, with nothing read there changed${pictured.length > 3 ? "" : `: ${list(pictured.map((change) => quote(change.words)))}`}. The person sees ${them} on the recording, and ${need} nothing from you, unless it's what you changed for a note: then say so in “accounts”, and it shows in your answer.`);
  }
  // Compared at rest, an answer that moves shows as no change at all: its note can play the step it's seen in instead.
  if (since && !since.changes.length && replies.some((reply) => reply.on && !reply.on.app && !reply.watch))
    console.log(`Nothing at rest shows an answer that moves, like an animation: if yours does, add "watch": "<the title of the step it's seen in>" to its reply in ${file}, and the note plays that step.`);
  if (forked.length) console.log(`\n${forked.map(saidOf).join("\n")}`);
  if (left.length) console.log(`\nStill to do, in ${file}:\n${left.map((problem) => `  ${problem}`).join("\n")}`);
  // How to say why is said the first time the review is recorded; after that, what's still to do says what's missing.
  if (number === 1 && !saved && named.length)
    console.log(`\nSay why each step changed in “accounts”, once for all that changed there, under the id it's given: { "line": "<why, in your words>" }, { "note": "<the id of the note it was made for>" }, or { "notReal": "<why nothing really changed>" }.`);
  // What a run leaves in the app, said once, as it's first seen: a scene saving something, with nothing to give it back.
  const wrote = number === 1 && !saved && recorded.find((kept) => kept.wrote);
  if (wrote && !(await setupIn(repo.setup)).after)
    console.log(`
${quote(wrote.scene.name)} sends the app ${wrote.wrote}, which changes what it holds, and ${existsSync(repo.setup) ? "playthrough/setup.ts has no after, so what each scene makes stays in the app" : "there's no playthrough/setup.ts, so each scene starts on what the ones before it left, and what they make stays in the app"}: one for each scene recorded, three for a new one. Tell the person, with the step that would fix it; run playthrough alone for how setup.ts makes what each scene starts from, and gives it back.`);
  if (same.length) {
    const [shows, them, each] = same.length > 1 ? ["show", "them", "each"] : ["shows", "it", "it"];
    console.log(`\n${list(same.map((scene) => quote(scene.name)))} ${shows} nothing different from Before. If that's what ${them} ${same.length > 1 ? "are" : "is"} for, something the change leaves alone that still works, say so in ${each}'s “line” under “scenes” in ${file}, in a sentence of up to ${LONGEST_LINE} characters. If ${them} should show the work, ${them} ${same.length > 1 ? "don't" : "doesn't"} reach it yet: take ${them} as far as the change, and record again.`);
  }
  if (unsaid.length) {
    const [are, each] = unsaid.length > 1 ? ["are", "each"] : ["is", "it"];
    console.log(`\n${list(unsaid.map((scene) => quote(scene.name)))} ${are} new to the person. In ${file}, ${each} can have a line, as “line” in its scene under “scenes”: what it starts from, and whether it shows the change or what the change leaves alone, in a sentence of up to ${LONGEST_LINE} characters.`);
  }
  if (by === unnamed) console.log(`\nPlaythrough can't tell which agent you are. Write your name in ${file} as “by”, and each of your answers shows it.`);
  // It waits for the person's notes, which can take hours.
  console.log(`\n${left.length ? "Then hand it over" : "Hand it over when it's ready"}, in the background, so you're told when the person's notes come: playthrough wait ${id}`);
}

// Each answer shows where its note's thing is on this round's recording, found by Playthrough from the last round it was
// seen on, never said by the agent: the next try lands right beside what was noted. One made in the app is on its fork,
// run again, where the fork first shows what it's on (forks.ts).
async function placed(repo: Repo, review: Review, number: number, scenes: Scene[], reply: Reply, forked: OnFork[]): Promise<Reply> {
  const answer: Reply = { note: reply.note, words: reply.words, ...(reply.watch && { watch: reply.watch }) };
  const fork = forked.find((one) => one.note === reply.note);
  if (fork) return fork.on ? { ...answer, on: fork.on } : answer;
  const seen = lastSeen(review, reply.note, number);
  const scene = seen && scenes.find((scene) => scene.name === seen.on.scene);
  const then = seen && review.rounds.find((round) => round.number === seen.round)?.scenes.find((kept) => kept.name === seen.on.scene);
  if (!seen || !scene || !then) return answer;
  const from = { scene: then, readings: await readingsOn(repo.reviews, review.id, seen.round, then) };
  return { ...answer, on: placeIn(seen.on, from, { scene, readings: await readingsOn(repo.reviews, review.id, number, scene) }) };
}

const changed = (count: number, since: number) => {
  const round = since === 0 ? "Before" : `round ${since}`;
  // Only what the scenes show is compared: nothing changed there isn't nothing changed.
  return count
    ? `${count} ${count > 1 ? "changes" : "change"} since ${round}.`
    : `Nothing changed in what the scenes show since ${round}. What they don't show, as a colour on hover or a tooltip never opened, isn't compared: if you changed something like that, a step that shows it lets the person see it.`;
};
