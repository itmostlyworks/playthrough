// Starts a review: a title for the change, as a pull request has, what was asked, in the person's words, and the flows
// that will show it, written before anything changes so they show the task as the person put it. Run again once they're
// written, it tries the app's setup and keeps Before: the app as it is, which each flow is recorded on with its round.

import { basename } from "node:path";
import { Refused } from "@playthrough/review";
import { agent } from "./agent.ts";
import { keepBefore } from "./before.ts";
import { flowsOf, howToWriteFlows, makeFlowsFolder } from "./flows.ts";
import type { Repo } from "./repo.ts";
import { trySetup } from "./try-setup.ts";

export async function start(repo: Repo, id: string, title?: string, asked?: string) {
  if (!(await repo.reviews.list()).includes(id)) {
    // Beside the reviews in .playthrough/, Playthrough keeps folders of its own, which it empties as it likes.
    if ([repo.tried, repo.borrowed].some((own) => basename(own) === id)) throw new Refused([`“${id}” is the name of a folder Playthrough keeps for itself. Give the review another name.`]);
    if (!title || !asked)
      throw new Refused([
        `There's no review called “${id}” yet. Start it with a few words for the change, as a pull request's title, and what was asked, in the person's words: playthrough start ${id} "<title>" "<what was asked>"`,
      ]);
    await repo.reviews.start(id, title, asked);
    await repo.keepOutOfGit();
    await makeFlowsFolder(repo, id);
    return console.log(`Started ${id}: “${title}”.

Write its flows before you change anything. They show what was asked, so write them from the task, not from the code.

${howToWriteFlows(repo, id)}

Then run playthrough start ${id} again. It tries the app's setup, and keeps the app as it is as Before, to record each flow on with round 1, so the person can compare. If the app is new, there's no Before: go straight to the work.`);
  }

  const review = await repo.reviews.get(id);
  if (title && title !== review.title)
    throw new Refused([`There's already a review called “${id}”, of “${review.title}”. Give this one another name, or carry that one on: playthrough start ${id}`]);
  const last = review.rounds.at(-1);
  if (last?.number === 0) throw new Refused([`Before is kept already. Change the app, then record round 1: playthrough record ${id}`]);
  if (last) throw new Refused([`Before is how the app was before the work, and ${id} has round ${last.number} already. Record the round being worked on: playthrough record ${id}`]);

  await flowsOf(repo, id);
  await trySetup(repo, `playthrough start ${id}`);
  // Kept before anything changes, as the app the work starts from. Each flow is recorded on it with its round, doing what
  // the round does, so nothing's recorded now: the flows are written for the work.
  const commit = keepBefore(repo, id);
  if (commit) {
    await repo.reviews.saveRound(id, { number: 0, by: agent(), flows: [], replies: [], accounts: {}, commit });
    await repo.reviews.finish(id, 0);
  }
  console.log(`
${commit ? "Kept Before: the app as it is now. Each flow is recorded on it with round 1, as far as the app as it was takes it, for the person to compare with." : "This folder isn't in git, or has no commits yet, so there's no Before: the app as it is can't be put back once you've changed it."}

Now change the app. Keep each flow's name, and each step's while it does the same job: they're matched across rounds by name. Once the work is done, add a flow for each choice you made that the person can see and didn't ask for. Then record round 1: playthrough record ${id}`);
}
