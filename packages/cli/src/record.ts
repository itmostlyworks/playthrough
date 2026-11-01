// Records the round being worked on: runs every flow like a person would, keeps each recording, records a flow that's new
// since Before on Before too, places each note's answer on its thing there, compares the round with each round before it,
// and says what's left before it can be handed over: an answer to each note, and why each change since the round before
// is there. Recording again keeps whatever the agent already wrote in the round.

import { placeIn } from "@playthrough/page";
import { inOrderJoined, lastSeen, list, LONGEST_LINE, notesToAnswer, problemsFinishing, quote, Refused, roundInProgress, type Flow, type Reply, type Review } from "@playthrough/review";
import { agent, unnamed } from "./agent.ts";
import { changedOnBefore, recordBeforeAgain, recordOnBefore, tryBeforeAgain } from "./before.ts";
import { compareWithEarlier } from "./compare.ts";
import { called, failedAt, runFlows, whereItStopped } from "./flows.ts";
import type { Repo } from "./repo.ts";
import { readingsOn } from "./reporter.ts";
import { saidOf, walkForks, type WalkedNote } from "./walk.ts";

export async function record(repo: Repo, id: string) {
  const review = await repo.reviews.get(id);
  if (review.accepted) throw new Refused(["This review is accepted, so nothing more can be recorded."]);
  const number = review.rounds.length ? roundInProgress(review) : 1;
  // A flow new since the last round is recorded twice on Before, when there's a Before to put back; otherwise here.
  const onBefore = !!review.rounds.find((round) => round.number === 0)?.commit;
  const first = (flow: string) => !onBefore && !review.rounds.some((round) => round.number !== number && round.flows.some((kept) => kept.name === flow));
  // Until round 1 is handed over, Before follows a setup, or a flow, changed since it was recorded.
  if (number === 1 && !(await recordBeforeAgain(repo, id, `playthrough record ${id}`, "Record again."))) {
    const again = await changedOnBefore(repo, review);
    if (again.length) await tryBeforeAgain(repo, id, again, "Record again.");
  }
  const { recorded, failed } = await runFlows(repo, id, number, { first });
  if (failed.length)
    throw new Refused([
      `\nRound ${number} wasn't recorded, because ${failed.length > 1 ? "these flows" : "a flow"} failed:`,
      ...failed.map(failedAt),
      `Fix ${failed.length > 1 ? "them" : "it"} and record again, which runs ${failed.length > 1 ? "them" : "it"} first. ${whereItStopped(repo, id, failed)}`,
    ]);
  await recordOnBefore(repo, id, number, recorded.map(({ flow }) => flow.name));

  const saved = review.rounds.find((round) => round.number === number);
  // In the order they joined the review, as Before keeps them, rather than their files': one new here comes last.
  const joined = inOrderJoined(review);
  const place = (name: string) => (joined.includes(name) ? joined.indexOf(name) : joined.length);
  const flows = recorded
    .map(({ flow }) => {
      const line = saved?.flows.find((kept) => kept.name === flow.name)?.line;
      return line ? { ...flow, line } : flow;
    })
    .sort((a, b) => place(a.name) - place(b.name));
  for (const { files } of recorded) for (const { name, bytes } of files) await repo.reviews.saveFile(id, number, name, bytes);
  const written = saved?.replies ?? [];
  const waiting: Reply[] = notesToAnswer(review, number)
    .filter((note) => !written.some((reply) => reply.note === note))
    .map((note) => ({ note, words: "" }));
  const by = agent(saved?.by);
  const walked = await walkForks(repo, review, number, flows);
  const replies = await Promise.all([...written, ...waiting].map((reply) => placed(repo, review, number, flows, reply, walked)));
  // Compared before the round is kept, so it's never there to hand over without them.
  console.log(`\nComparing round ${number} with each round before it…`);
  const comparisons = await compareWithEarlier(repo.reviews, id, number, flows);
  await repo.reviews.saveRound(id, { number, by, flows, replies, accounts: saved?.accounts ?? {} });
  for (const comparison of comparisons) await repo.reviews.saveComparison(id, comparison);

  // A flow that's new to the person can say at its start what it starts from, or the choice it shows.
  const previous = review.rounds.findLast((round) => round.number > 0 && round.number < number);
  const unsaid = flows.filter((flow) => !flow.line && !previous?.flows.some((kept) => kept.name === flow.name));
  const file = repo.show(repo.round(id, number));
  const left = problemsFinishing(await repo.reviews.get(id), number);
  console.log(`\nRecorded round ${number}: ${flows.length > 3 ? called(flows.map((flow) => flow.name)) : list(flows.map((flow) => `${quote(flow.name)} (${Math.round(flow.length)}s)`))}.`);
  const since = comparisons.find((comparison) => comparison.since === number - 1);
  if (since) console.log(`\n${changed(since.changes.length, number - 1)}`);
  // Compared at rest, an answer that moves shows as no change at all: its note can play the step it's seen in instead.
  if (since && !since.changes.length && replies.some((reply) => reply.on && !reply.on.app && !reply.watch))
    console.log(`Nothing at rest shows an answer that moves, like an animation: if yours does, add "watch": "<the title of the step it's seen in>" to its reply in ${file}, and the note plays that step.`);
  if (walked.length) console.log(`\n${walked.map(saidOf).join("\n")}`);
  if (left.length) console.log(`\nStill to do, in ${file}:\n${left.map((problem) => `  ${problem}`).join("\n")}`);
  // How to say why is said the first time the review is recorded; after that, what's still to do says what's missing.
  if (number === 1 && !saved && since?.changes.length)
    console.log(`\nSay why each change is there in “accounts”, by its id: { "line": "<why, in your words>" }, { "note": "<the id of the note it was made for>" }, or { "notReal": "<why nothing really changed>" }.`);
  if (unsaid.length) {
    const [are, each] = unsaid.length > 1 ? ["are", "each"] : ["is", "it"];
    console.log(`\n${list(unsaid.map((flow) => quote(flow.name)))} ${are} new to the person. In ${file}, ${each} can have a line at its start, as “line” in its flow under “flows”: what it starts from, or the choice it shows, in a sentence of up to ${LONGEST_LINE} characters.`);
  }
  if (by === unnamed) console.log(`\nPlaythrough can't tell which agent you are. Write your name in ${file} as “by”, and each of your answers shows it.`);
  // It waits for the person's notes, which can take hours.
  console.log(`\n${left.length ? "Then hand it over" : "Hand it over when it's ready"}, in the background, so you're told when the person's notes come: playthrough wait ${id}`);
}

// Each answer shows where its note's thing is on this round's recording, found by Playthrough from the last round it was
// seen on, never said by the agent: the next try lands right beside what was noted. One made in the app is placed on its
// fork as it was walked again, where the person's steps got to.
async function placed(repo: Repo, review: Review, number: number, flows: Flow[], reply: Reply, walked: WalkedNote[]): Promise<Reply> {
  const answer: Reply = { note: reply.note, words: reply.words, ...(reply.watch && { watch: reply.watch }) };
  const seen = lastSeen(review, reply.note, number);
  const walk = seen?.on.app && walked.find((one) => one.note === reply.note)?.on;
  if (walk) return { ...answer, on: walk };
  const flow = seen && flows.find((flow) => flow.name === seen.on.flow);
  const then = seen && review.rounds.find((round) => round.number === seen.round)?.flows.find((kept) => kept.name === seen.on.flow);
  if (!seen || seen.on.app || !flow || !then) return answer;
  const from = { flow: then, readings: await readingsOn(repo.reviews, review.id, seen.round, then) };
  return { ...answer, on: placeIn(seen.on, from, { flow, readings: await readingsOn(repo.reviews, review.id, number, flow) }) };
}

const changed = (count: number, since: number) => {
  const round = since === 0 ? "Before" : `round ${since}`;
  return count ? `${count} ${count > 1 ? "changes" : "change"} since ${round}.` : `Nothing changed since ${round}.`;
};
