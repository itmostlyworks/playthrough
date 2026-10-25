// Records the round being worked on: runs every flow like a person would, keeps each recording, records a flow that's new
// since Before on Before too, compares the round with each round before it, and says what's left before it can be handed
// over: an answer to each note, and why each change since the round before is there. Recording again keeps whatever the
// agent already wrote in the round.

import { list, notesToAnswer, problemsFinishing, quote, Refused, roundInProgress, type Reply } from "@vantage/review";
import { agent, unnamed } from "./agent.ts";
import { recordOnBefore } from "./before.ts";
import { compareWithEarlier } from "./compare.ts";
import { failedAt, runFlows } from "./flows.ts";
import type { Repo } from "./repo.ts";

export async function record(repo: Repo, id: string) {
  const review = await repo.reviews.get(id);
  if (review.accepted) throw new Refused(["This review is accepted, so nothing more can be recorded."]);
  const number = review.rounds.length ? roundInProgress(review) : 1;
  const { recorded, failed } = await runFlows(repo, id, number);
  if (failed.length)
    throw new Refused([
      `Round ${number} wasn't recorded, because ${failed.length > 1 ? "these flows" : "a flow"} failed:`,
      ...failed.map(failedAt),
      `Fix ${failed.length > 1 ? "them" : "it"} and record again.`,
    ]);
  await recordOnBefore(repo, id, number, recorded.map(({ flow }) => flow.name));

  const saved = review.rounds.find((round) => round.number === number);
  const flows = recorded.map(({ flow }) => {
    const line = saved?.flows.find((kept) => kept.name === flow.name)?.line;
    return line ? { ...flow, line } : flow;
  });
  for (const { files } of recorded) for (const { name, bytes } of files) await repo.reviews.saveFile(id, number, name, bytes);
  const written = saved?.replies ?? [];
  const waiting: Reply[] = notesToAnswer(review, number)
    .filter((note) => !written.some((reply) => reply.note === note))
    .map((note) => ({ note, words: "" }));
  const by = agent(saved?.by);
  // Compared before the round is kept, so it's never there to hand over without them.
  console.log(`\nComparing round ${number} with each round before it…`);
  const comparisons = await compareWithEarlier(repo.reviews, id, number, flows);
  await repo.reviews.saveRound(id, { number, by, flows, replies: [...written, ...waiting], accounts: saved?.accounts ?? {} });
  for (const comparison of comparisons) await repo.reviews.saveComparison(id, comparison);

  // A flow that's new to the reviewer can say at its start what it starts from, or the choice it shows.
  const previous = review.rounds.findLast((round) => round.number > 0 && round.number < number);
  const unsaid = flows.filter((flow) => !flow.line && !previous?.flows.some((kept) => kept.name === flow.name));
  const file = repo.show(repo.round(id, number));
  const left = problemsFinishing(await repo.reviews.get(id), number);
  console.log(`\nRecorded round ${number}: ${list(flows.map((flow) => `${quote(flow.name)} (${Math.round(flow.length)}s)`))}.`);
  const since = comparisons.find((comparison) => comparison.since === number - 1);
  if (since) console.log(`\n${changed(since.changes.length, number - 1)}`);
  if (left.length) console.log(`\nStill to do, in ${file}:\n${left.map((problem) => `  ${problem}`).join("\n")}`);
  if (since?.changes.some((change) => !saved?.accounts[change.id]))
    console.log(`\nSay why each change is there in “accounts”, by its id: { "line": "<why, in your words>" }, { "note": "<the note it was made for>" }, or { "notReal": "<why nothing really changed>" }.`);
  if (unsaid.length) {
    const [are, each] = unsaid.length > 1 ? ["are", "each"] : ["is", "it"];
    console.log(`\n${list(unsaid.map((flow) => quote(flow.name)))} ${are} new to the reviewer. In ${file}, ${each} can have a line at its start: what it starts from, or the choice it shows.`);
  }
  if (by === unnamed) console.log(`\nVantage can't tell which agent you are. Write your name in ${file} as “by”, and each of your answers shows it.`);
  console.log(left.length ? `\nThen hand it over: vantage wait ${id}` : `\nHand it over when it's ready: vantage wait ${id}`);
}

const changed = (count: number, since: number) => {
  const round = since === 0 ? "Before" : `round ${since}`;
  return count ? `${count} ${count > 1 ? "changes" : "change"} since ${round}.` : `Nothing changed since ${round}.`;
};
