// Records the round being worked on: runs every flow like a person would, keeps each recording, and says what's left
// before the round can be handed over. Recording again keeps whatever the agent already wrote in the round.

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { notesToAnswer, problemsFinishing, Refused, roundInProgress, type Flow, type Reply } from "@vantage/review";
import type { App, Repo } from "./repo.ts";
import { howToWriteFlows, makeFlowsFolder } from "./start.ts";
import { list } from "./words.ts";

// What the run needs to know, passed to Playwright whole: where the flows are, the folder the recordings go to, the app,
// and rrweb's recorder, which goes into every page.
export type Run = { flows: string; folder: string; app: App; root: string; recorder: string };

export async function record(repo: Repo, id: string) {
  const review = await repo.reviews.get(id);
  if (review.accepted) throw new Refused(["This review is accepted, so nothing more can be recorded."]);
  const number = review.rounds.length ? roundInProgress(review) : 1;
  const flows = repo.flows(id);
  if (!(await readdir(flows).catch(() => [])).some((name) => /\.[cm]?[jt]s$/.test(name)))
    throw new Refused([`${id} has no flows yet. ${howToWriteFlows(repo, id)}`]);
  await makeFlowsFolder(repo, id);
  const app = await repo.app();

  const folder = await mkdtemp(join(tmpdir(), "vantage-"));
  console.log(`Recording round ${number} of ${id}…`);
  const recorder = join(dirname(createRequire(import.meta.url).resolve("@rrweb/record")), "record.umd.min.cjs");
  if (!(await playwright({ flows, folder, app, root: repo.root, recorder })))
    throw new Refused([`Round ${number} wasn't recorded, because a flow failed. Fix it and record again.`]);

  const saved = review.rounds.find((round) => round.number === number);
  const recorded: Flow[] = (JSON.parse(await readFile(join(folder, "flows.json"), "utf8")) as Flow[]).map((flow) => {
    const line = saved?.flows.find((kept) => kept.name === flow.name)?.line;
    return line ? { ...flow, line } : flow;
  });
  for (const flow of recorded) await repo.reviews.saveFile(id, number, flow.recording, await readFile(join(folder, flow.recording)));
  const written = saved?.replies ?? [];
  const waiting: Reply[] = notesToAnswer(review, number)
    .filter((note) => !written.some((reply) => reply.note === note))
    .map((note) => ({ note, words: "" }));
  // Claude Code says in its shell that it's Claude Code. Any other agent writes its name in the round, as `by`, once.
  const by = process.env.CLAUDECODE ? "Claude Code" : ((saved ?? review.rounds.at(-1))?.by ?? "Agent");
  await repo.reviews.saveRound(id, { number, by, flows: recorded, replies: [...written, ...waiting], accounts: saved?.accounts ?? {} });
  await rm(folder, { recursive: true });

  const left = problemsFinishing(await repo.reviews.get(id), number);
  const lengths = recorded.map((flow) => `“${flow.name}” (${Math.round(flow.length)}s)`);
  console.log(`\nRecorded round ${number}: ${list(lengths)}.`);
  if (left.length)
    console.log(`\nAnswer each note in ${repo.show(repo.round(id, number))}:\n${left.map((problem) => `  ${problem}`).join("\n")}\nThen hand it over: vantage wait ${id}`);
  else console.log(`\nHand it over when it's ready: vantage wait ${id}`);
}

function playwright(run: Run): Promise<boolean> {
  const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
  const config = fileURLToPath(new URL("./playwright.config.ts", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "test", "--config", config], {
      cwd: run.root,
      stdio: "inherit",
      env: { ...process.env, VANTAGE_RUN: JSON.stringify(run) },
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code === 0));
  });
}
