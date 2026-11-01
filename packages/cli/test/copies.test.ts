// Each of git's worktrees is a copy of the app: its reviews are found from any of them, it runs on a port of its own where
// app.json gives one, and at the address the app always has, what answers in a worktree is never taken for its own.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { Refused } from "@playthrough/review";
import { keepRunning } from "../src/app.ts";
import { copies, inWorktree, repo } from "../src/repo.ts";
import { start } from "../src/start.ts";

let main = "";
let worktree = "";
const env = { ...process.env, GIT_AUTHOR_NAME: "Ana", GIT_AUTHOR_EMAIL: "ana@example.com", GIT_COMMITTER_NAME: "Ana", GIT_COMMITTER_EMAIL: "ana@example.com" };
const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgSign=false", ...args], { cwd: main, env, encoding: "utf8", stdio: "pipe" }).trim();
const appJson = (root: string, app: object) => writeFile(join(root, "playthrough", "app.json"), JSON.stringify(app));

beforeEach(async () => {
  main = await realpath(await mkdtemp(join(tmpdir(), "playthrough-copies-")));
  git("init", "--quiet", "--initial-branch=main");
  await mkdir(join(main, "playthrough"));
  await appJson(main, { start: "node serve.ts", url: "http://localhost:4400" });
  git("add", "--all");
  git("commit", "--quiet", "--message", "The app");
  worktree = join(main, "copy");
  git("worktree", "add", "--quiet", "-b", "work", worktree);
});
afterEach(() => rm(main, { recursive: true }));

test("every worktree is a copy of the app, the main one first, and only a worktree beside it is one", () => {
  assert.deepEqual(copies(worktree), [main, worktree]);
  assert.deepEqual(copies(main), [main, worktree]);
  assert.equal(inWorktree(main), false);
  assert.equal(inWorktree(worktree), true);
});

test("given {port}, each copy of the app is started on a port of its own, the same each time it's asked", async () => {
  for (const root of [main, worktree]) await appJson(root, { start: "npm run dev -- --port {port}", url: "http://localhost:{port}" });
  const [one, again, other] = [await repo(main).app(), await repo(main).app(), await repo(worktree).app()];
  assert.deepEqual(one, again);
  assert.equal(one.url, `http://localhost:${one.port}`);
  assert.equal(one.start, `npm run dev -- --port ${one.port}`);
  assert.notEqual(other.port, one.port);
});

test("{port} in only one of start and url is refused, saying to put it in both", async () => {
  await appJson(main, { start: "npm run dev", url: "http://localhost:{port}" });
  await assert.rejects(repo(main).app(), (error: Refused) => error instanceof Refused && /in both/.test(error.problems[0]!));
});

test("at the address the app always has, what answers is the app in the main folder, and in a worktree it's refused as maybe another copy", async () => {
  const server = createServer((_, response) => response.end("someone's app"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.equal(await keepRunning({ start: "node serve.ts", url }, main), undefined);
    await assert.rejects(keepRunning({ start: "node serve.ts", url }, worktree), (error: Refused) => error instanceof Refused && /else answers/.test(error.problems[0]!));
  } finally {
    server.close();
  }
});

test("a review's name taken in another worktree is refused, as the person finds them all in one place", async () => {
  await repo(main).reviews.start("due-soon", "Due soon", "Show what's due soon");
  await assert.rejects(start(repo(worktree), "due-soon", "Due soon", "Show what's due soon"), (error: Refused) => error instanceof Refused && /another worktree/.test(error.problems[0]!));
});
