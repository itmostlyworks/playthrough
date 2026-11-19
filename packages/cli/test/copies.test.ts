// Each of git's worktrees is a copy of the app: its changes are found from any of them, it runs on a port of its own where
// app.json gives one, one already running from its folder is its app, wherever it answers, and another copy's never is.
// And each copy's app is one, shared by everyone using it, and stopped only by Playthrough where Playthrough started it.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { Refused } from "@playthrough/change";
import { answers, keepRunning, openFile, running, stopUnused, UNUSED, using } from "../src/app.ts";
import { thisCommand } from "../src/command.ts";
import { copies, inWorktree, repo } from "../src/repo.ts";
import { serving } from "../src/serving.ts";

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

test("app.json's url is where the app is and nothing more: one with a page of its own is refused, saying which to go to in the browser", async () => {
  await appJson(main, { start: "npm run dev", url: "http://localhost:3000/reports?tab=1" });
  await assert.rejects(repo(main).app(), (error: Refused) =>
    error.problems[0] === "playthrough/app.json's url is http://localhost:3000/reports?tab=1. Give only http://localhost:3000: a moment keeps the pages it goes to, so go to /reports?tab=1 in the browser.",
  );
  await appJson(main, { start: "npm run dev -- --port {port}", url: "http://localhost:{port}/#/board" });
  await assert.rejects(repo(main).app(), (error: Refused) => error.problems[0]!.includes("Give only http://localhost:{port}: a moment keeps the pages it goes to, so go to /#/board in the browser."));
  await appJson(main, { start: "npm run dev", url: "http://localhost:3000/" });
  assert.equal((await repo(main).app()).url, "http://localhost:3000/");
  await appJson(main, { start: "npm run dev -- --port {port}", url: "http://localhost:{port}/" });
  const { url, port } = await repo(main).app();
  assert.equal(url, `http://localhost:${port}/`);
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
  await writeFile(file, JSON.stringify({ by: other.pid, boot: thisCommand().boot }));
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

// An app as a dev server like Next's is: one to a folder, refusing a second there in its own words, as the terminal colours
// them. It serves a page.
const ONE_TO_A_FOLDER = `import { createServer } from "node:http";
import { openSync, rmSync } from "node:fs";
try { openSync("app.lock", "wx"); } catch { console.log("\\x1b[31m⨯ Another dev server is already running in this folder.\\x1b[39m"); process.exit(1); }
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => (rmSync("app.lock", { force: true }), process.exit()));
createServer((_, response) => (response.setHeader("content-type", "text/html"), response.end("<h1>The app</h1>"))).listen(Number(process.argv[2]), "127.0.0.1");`;
// Pages of another kind beside the app, as Storybook's.
const BESIDE = `import { createServer } from "node:http";
createServer((_, response) => (response.setHeader("content-type", "text/html"), response.end("<h1>Stories</h1>"))).listen(Number(process.argv[2]), "127.0.0.1");`;
// The person's own, started from a folder with its own command, on a port of its own choosing.
const theirs = async (folder: string, port: number, script = ONE_TO_A_FOLDER) => {
  const name = script === ONE_TO_A_FOLDER ? "dev.mjs" : "beside.mjs";
  await writeFile(join(folder, name), script);
  const server = spawn(process.execPath, [name, String(port)], { cwd: folder });
  await answering(`http://127.0.0.1:${port}`, true);
  return { url: `http://127.0.0.1:${port}`, stop: () => (server.kill(), new Promise((resolve) => server.once("exit", resolve))) };
};
const ported = { start: `node dev.mjs {port}`, url: "http://127.0.0.1:{port}" };
// Only where the machine says which folder a running app is from: macOS and Linux, not Windows.
const knowsFolders = { skip: serving() === undefined && "this machine doesn't say which folder a running app is from" };

test("an app already running from this copy's folder is used where it is, not started again", knowsFolders, async () => {
  process.env.PLAYTHROUGH_HOME = join(main, "home");
  await appJson(worktree, ported);
  const yours = await theirs(worktree, await free());
  try {
    const app = await repo(worktree).app();
    assert.equal(app.url, yours.url);
    assert.equal(await keepRunning(app, worktree), undefined);
  } finally {
    await yours.stop();
  }
  assert.notEqual((await repo(worktree).app()).url, yours.url);
});

test("an app Playthrough didn't start is never stopped by it", knowsFolders, async () => {
  process.env.PLAYTHROUGH_HOME = join(main, "home");
  await appJson(main, ported);
  const yours = await theirs(main, await free());
  try {
    const done = using(main);
    await running(await repo(main).app(), main);
    done();
    stopUnused(main, 0);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await answers(yours.url), true);
  } finally {
    await yours.stop();
  }
});

test("another copy's app is never taken for this one's", knowsFolders, async () => {
  process.env.PLAYTHROUGH_HOME = join(main, "home");
  const port = await free();
  // The worktree is inside the main one's folder: what runs from it is the worktree's, never the main one's.
  const yours = await theirs(worktree, port);
  try {
    await appJson(main, ported);
    assert.notEqual((await repo(main).app()).url, yours.url);
    await appJson(main, { start: "node dev.mjs", url: yours.url });
    await assert.rejects(keepRunning(await repo(main).app(), main), (error: Refused) => error.problems[0] === `The app answering at ${yours.url} is another copy's, running from ${worktree}. Whoever started it there can stop it, then try again.`);
  } finally {
    await yours.stop();
  }
});

test("when the app can't start, its own words are said, and what to do", knowsFolders, async () => {
  process.env.PLAYTHROUGH_HOME = join(main, "home");
  await appJson(worktree, ported);
  // Two serving pages from the folder: neither can be told for the app, and the app won't start beside them.
  const [one, other] = [await theirs(worktree, await free()), await theirs(worktree, await free(), BESIDE)];
  try {
    const app = await repo(worktree).app();
    await assert.rejects(running(app, worktree), (error: Refused) => {
      assert.deepEqual(error.problems, [
        `“node dev.mjs ${app.port}” ended before the app answered at ${app.url}.`,
        "It said, last:",
        "  ⨯ Another dev server is already running in this folder.",
        `Serving pages from this folder already: ${[one.url, other.url].sort().join(", ")}. If one is the app, Playthrough can't tell which, so it can't use it: whoever started it stops it, then try again.`,
      ]);
      return true;
    });
  } finally {
    await Promise.all([one.stop(), other.stop()]);
  }
  await writeFile(join(worktree, "dev.mjs"), `console.error("Error: Cannot find module 'next'"); process.exit(1);`);
  const app = await repo(worktree).app();
  await assert.rejects(running(app, worktree), (error: Refused) => error.problems.join("\n") === `“node dev.mjs ${app.port}” ended before the app answered at ${app.url}.\nIt said, last:\n  Error: Cannot find module 'next'\nCheck that playthrough/app.json starts the app there.`);
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
