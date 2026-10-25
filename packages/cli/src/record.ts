// Records the round being worked on: runs every flow like a person would, keeps each recording, and says what's left
// before the round can be handed over. Recording again keeps whatever the agent already wrote in the round.

import { notesToAnswer, problemsFinishing, Refused, roundInProgress, type Reply } from "@vantage/review";
import { agent, unnamed } from "./agent.ts";
import { runFlows } from "./flows.ts";
import type { Repo } from "./repo.ts";
import { list, quote } from "./words.ts";

export async function record(repo: Repo, id: string) {
  const review = await repo.reviews.get(id);
  if (review.accepted) throw new Refused(["This review is accepted, so nothing more can be recorded."]);
  const number = review.rounds.length ? roundInProgress(review) : 1;
  const { recorded, failed } = await runFlows(repo, id, `Recording round ${number} of ${id}…`);
  if (failed.length) throw new Refused([`Round ${number} wasn't recorded, because ${list(failed.map(quote))} failed. Fix ${failed.length > 1 ? "them" : "it"} and record again.`]);

  const saved = review.rounds.find((round) => round.number === number);
  const flows = recorded.map(({ flow }) => {
    const line = saved?.flows.find((kept) => kept.name === flow.name)?.line;
    return line ? { ...flow, line } : flow;
  });
  for (const { flow, bytes } of recorded) await repo.reviews.saveFile(id, number, flow.recording, bytes);
  const written = saved?.replies ?? [];
  const waiting: Reply[] = notesToAnswer(review, number)
    .filter((note) => !written.some((reply) => reply.note === note))
    .map((note) => ({ note, words: "" }));
  const by = agent(saved?.by);
  await repo.reviews.saveRound(id, { number, by, flows, replies: [...written, ...waiting], accounts: saved?.accounts ?? {} });

  // A flow that's new to the reviewer can say at its start what it starts from, or the choice it shows.
  const previous = review.rounds.findLast((round) => round.number > 0 && round.number < number);
  const unsaid = flows.filter((flow) => !flow.line && !previous?.flows.some((kept) => kept.name === flow.name));
  const file = repo.show(repo.round(id, number));
  const left = problemsFinishing(await repo.reviews.get(id), number);
  console.log(`\nRecorded round ${number}: ${list(flows.map((flow) => `${quote(flow.name)} (${Math.round(flow.length)}s)`))}.`);
  if (left.length) console.log(`\nStill to do, in ${file}:\n${left.map((problem) => `  ${problem}`).join("\n")}`);
  if (unsaid.length) {
    const [are, each] = unsaid.length > 1 ? ["are", "each"] : ["is", "it"];
    console.log(`\n${list(unsaid.map((flow) => quote(flow.name)))} ${are} new to the reviewer. In ${file}, ${each} can have a line at its start: what it starts from, or the choice it shows.`);
  }
  if (by === unnamed) console.log(`\nVantage can't tell which agent you are. Write your name in ${file} as “by”, and each of your answers shows it.`);
  console.log(left.length ? `\nThen hand it over: vantage wait ${id}` : `\nHand it over when it's ready: vantage wait ${id}`);
}
