// Starts a review: a title for the change, as a pull request has, what was asked, in the person's words, and the flows
// that will show it, written before anything changes so they show the task as the person put it. Run again once they're
// written, it records Before: the app as it is.

import { list, quote, Refused } from "@playthrough/review";
import { agent } from "./agent.ts";
import { cantStart, howFar, keepBefore, refuseIfBroken, tryBeforeAgain } from "./before.ts";
import { howToWriteFlows, makeFlowsFolder, runFlows } from "./flows.ts";
import type { Repo } from "./repo.ts";

export async function start(repo: Repo, id: string, title?: string, asked?: string) {
  if (!(await repo.reviews.list()).includes(id)) {
    if (!title || !asked)
      throw new Refused([
        `There's no review called “${id}” yet. Start it with a few words for the change, as a pull request's title, and what was asked, in the person's words: playthrough start ${id} "<title>" "<what was asked>"`,
      ]);
    await repo.reviews.start(id, title, asked);
    await repo.keepOutOfGit();
    await makeFlowsFolder(repo, id);
    return console.log(`Started ${id}: “${title}”.

Write its flows before you change anything. They show what was asked, so write them from the task, not from the code: if you can start a fresh subagent, give it the task and what the screens look like, never the code, and use the flows it writes.

${howToWriteFlows(repo, id)}

Then run playthrough start ${id} again. It records Before: each flow on the app as it is, as far as the app can take it. If the app is new, there's no Before: go straight to the work.`);
  }

  const review = await repo.reviews.get(id);
  if (title && title !== review.title)
    throw new Refused([`There's already a review called “${id}”, of “${review.title}”. Give this one another name, or record that one's Before: playthrough start ${id}`]);
  const last = review.rounds.at(-1);
  const before = review.rounds.find((round) => round.number === 0);
  const short = before ? [...before.flows.filter((flow) => flow.stopped).map((flow) => flow.name), ...(before.cantStart ?? [])] : [];
  if (before && short.length) return tryBeforeAgain(repo, id, short);
  if (last?.number === 0) throw new Refused([`Before is recorded already. Change the app, then record round 1: playthrough record ${id}`]);
  if (last) throw new Refused([`Before is how the app was before the work, and ${id} has round ${last.number} already. Record the round being worked on: playthrough record ${id}`]);

  // What it's recorded from is kept first, before running the app can change anything.
  const commit = keepBefore(repo, id);
  const { recorded, failed } = await runFlows(repo, id, 0, { first: () => true });
  refuseIfBroken(failed, "Before wasn't recorded", "Run this again.");
  if (!recorded.length)
    return console.log(`\nNone of the flows can start on the app as it is, so there's no Before. If one should, fix it and run this again. Otherwise change the app, then record round 1: playthrough record ${id}`);

  for (const { files } of recorded) for (const { name, bytes } of files) await repo.reviews.saveFile(id, 0, name, bytes);
  const flows = recorded.map(({ flow }) => flow);
  await repo.reviews.saveRound(id, { number: 0, by: agent(), flows, replies: [], accounts: {}, cantStart: cantStart(recorded, failed), ...(commit && { commit }) });
  await repo.reviews.finish(id, 0);
  console.log(`\nRecorded Before: ${list(flows.map((flow) => quote(flow.name)))}.`);
  for (const line of howFar(repo, id, recorded, failed, "the app as it is")) console.log(line);
  if (!commit) console.log(`This folder isn't in git, so Before isn't kept as a commit, and a flow added later can't be recorded on it.`);
  console.log(`
Now change the app. Keep each flow's name, and each step's while it does the same job: they're matched across rounds by name. Once the work is done, add a flow for each choice you made that the reviewer can see and didn't ask for. Then record round 1: playthrough record ${id}`);
}
