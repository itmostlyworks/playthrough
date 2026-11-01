// Starts a review: a title for the change, as a pull request has, what was asked, in the person's words, and the flows
// that will show it, written before anything changes so they show the task as the person put it. Run again once they're
// written, it records Before: the app as it is.

import { existsSync } from "node:fs";
import { list, quote, Refused } from "@playthrough/review";
import { agent } from "./agent.ts";
import { cantStart, changedOnBefore, howFar, keepBefore, noteRanOnBefore, recordBeforeAgain, refuseIfBroken, tryBeforeAgain } from "./before.ts";
import { called, howToWriteFlows, makeFlowsFolder, runFlows } from "./flows.ts";
import type { Repo } from "./repo.ts";
import { setupIn } from "./setup.ts";

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

Write its flows before you change anything. They show what was asked, so write them from the task, not from the code.

${howToWriteFlows(repo, id)}

Then run playthrough start ${id} again. It records Before: each flow on the app as it is, as far as the app can take it. If the app is new, there's no Before: go straight to the work.`);
  }

  const review = await repo.reviews.get(id);
  if (title && title !== review.title)
    throw new Refused([`There's already a review called “${id}”, of “${review.title}”. Give this one another name, or record that one's Before: playthrough start ${id}`]);
  const last = review.rounds.at(-1);
  const before = review.rounds.find((round) => round.number === 0);
  if (last?.number === 0 && (await recordBeforeAgain(repo, id, `playthrough start ${id}`, "Run this again."))) return;
  const changed = await changedOnBefore(repo, review);
  if (changed.length) return tryBeforeAgain(repo, id, changed, "Run this again.");
  if (last?.number === 0) throw new Refused([`Before is recorded already. Change the app, then record round 1: playthrough record ${id}`]);
  if (last) throw new Refused([`Before is how the app was before the work, and ${id} has round ${last.number} already. Record the round being worked on: playthrough record ${id}`]);

  // What it's recorded from is kept first, before running the app can change anything.
  const commit = keepBefore(repo, id);
  const { recorded, failed, written } = await runFlows(repo, id, 0, { first: () => true });
  refuseIfBroken(failed, "Before wasn't recorded", "Run this again.");
  if (!recorded.length)
    return console.log(`\nNone of the flows can start on the app as it is, so there's no Before. If one should, fix it and run this again. Otherwise change the app, then record round 1: playthrough record ${id}`);

  for (const { files } of recorded) for (const { name, bytes } of files) await repo.reviews.saveFile(id, 0, name, bytes);
  const flows = recorded.map(({ flow }) => flow);
  await repo.reviews.saveRound(id, { number: 0, by: agent(), flows, replies: [], accounts: {}, cantStart: cantStart(recorded, failed), ...(commit && { commit }) });
  await repo.reviews.finish(id, 0);
  await noteRanOnBefore(repo, id, written);
  console.log(`\nRecorded Before: ${called(flows.map((flow) => flow.name))}.`);
  for (const line of howFar(repo, id, recorded, failed, "the app as it is")) console.log(line);
  if (!commit) console.log(`This folder isn't in git, so Before isn't kept as a commit, and a flow added later can't be recorded on it.`);
  // What a run leaves in the app, said once it's seen: a flow saving something, with nothing to give it back.
  const wrote = recorded.find((kept) => kept.wrote);
  const { after } = await setupIn(repo.setup);
  if (wrote && !after)
    console.log(`
${quote(wrote.flow.name)} sends the app ${wrote.wrote}, which changes what it holds, and ${existsSync(repo.setup) ? "playthrough/setup.ts has no after, so what each flow makes stays in the app" : "there's no playthrough/setup.ts, so each flow starts on what the ones before it left, and what they make stays in the app"}: one for each flow recorded, two for a new one. Tell the person, with the step that would fix it; run playthrough alone for how setup.ts makes what each flow starts from, and gives it back.`);
  console.log(`
Now change the app. Keep each flow's name, and each step's while it does the same job: they're matched across rounds by name. Once the work is done, add a flow for each choice you made that the person can see and didn't ask for. Then record round 1: playthrough record ${id}`);
}
