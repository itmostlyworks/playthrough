// Each of git's worktrees is a copy of the app: its reviews are found from any of them, it runs on a port of its own where
// app.json gives one, and at the address the app always has, what answers in a worktree is never taken for its own. And
// each copy's app is one, shared by everyone using it.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { Refused } from "@playthrough/review";
import { answers, keepRunning, openFile, running, stopUnused, UNUSED, using } from "../src/app.ts";
import { thisCommand } from "../src/command.ts";
import { copies, inWorktree, repo } from "../src/repo.ts";

let main = "";
let worktree = "";
const env = { ...process.env, GIT_AUTHOR_NAME: "Ana", GIT_AUTHOR_EMAIL: "ana@example.com", GIT_COMMITTER_NAME: "Ana", GIT_COMMITTER_EMAIL: "ana@example.com" };
const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgSign=false", ...args], { cwd: main, env, encoding: "utf8", stdio: "pipe" }).trim();
const appJson = (root: string, app: object) => writeFile(join(root, "playthrough", "app.json"), JSON.stringify(app));
// A port nothing is using now.
const free = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

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

// What a copy's app answers with, a moment after it may have been stopped.
const answering = async (url: string, expected: boolean) => {
  for (let tries = 0; tries < 50 && (await answers(url)) !== expected; tries++) await new Promise((resolve) => setTimeout(resolve, 100));
  return answers(url);
};
// Someone else using the app: another process, as a command or Playthrough open is.
const someoneElse = async (file: string) => {
  const other = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ ...thisCommand(), by: other.pid }));
  return other;
};

test("a copy's app is one, started by whoever wants it first, used as it is by everyone else, and stopped only once nobody is using it", async () => {
  process.env.PLAYTHROUGH_HOME = join(main, "home");
  await writeFile(join(main, "serve.mjs"), `import { createServer } from "node:http"; createServer((_, response) => response.end("the app")).listen(Number(process.argv[2]), "127.0.0.1");`);
  const url = `http://127.0.0.1:${await free()}`;
  const app = { start: `node serve.mjs ${new URL(url).port}`, url };
  const agent = await someoneElse(join(main, ".playthrough", "using", "agent"));
  try {
    const done = using(main);
    assert.equal(typeof (await running(app, main)), "number");
    assert.equal(await running(app, main), undefined);
    done();
    assert.equal(await answers(url), true);
    agent.kill();
    await new Promise((resolve) => agent.once("exit", resolve));
    stopUnused(main, 0);
    assert.equal(await answering(url, false), false);
  } finally {
    agent.kill();
    stopUnused(main, 0);
  }
});

test("with Playthrough open, an app nobody is using is kept until it has gone unused for fifteen minutes", async () => {
  process.env.PLAYTHROUGH_HOME = join(main, "home");
  await writeFile(join(main, "serve.mjs"), `import { createServer } from "node:http"; createServer((_, response) => response.end("the app")).listen(Number(process.argv[2]), "127.0.0.1");`);
  const url = `http://127.0.0.1:${await free()}`;
  const open = await someoneElse(openFile());
  try {
    const done = using(main);
    await running({ start: `node serve.mjs ${new URL(url).port}`, url }, main);
    done();
    stopUnused(main, UNUSED);
    assert.equal(await answers(url), true);
    stopUnused(main, 0);
    assert.equal(await answering(url, false), false);
  } finally {
    open.kill();
    stopUnused(main, 0);
  }
});
