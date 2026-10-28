// How far Before goes with a flow, Before kept as a commit, and the agent's work put back after Vantage was stopped while
// a flow recorded on Before, in a small repo of its own. Recording on Before itself is in the loop's promises.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { Refused } from "@mostlyworks/vantage-review";
import type { TestCase, TestResult } from "@playwright/test/reporter";
import { keepBefore, putBack, refuseIfBroken } from "../src/before.ts";
import { repo, type Repo } from "../src/repo.ts";
import Flows, { READINGS, RECORDING, type Failed, type Recorded } from "../src/reporter.ts";

let root = "";
let app: Repo;
const env = { ...process.env, GIT_AUTHOR_NAME: "Ana", GIT_AUTHOR_EMAIL: "ana@example.com", GIT_COMMITTER_NAME: "Ana", GIT_COMMITTER_EMAIL: "ana@example.com" };
const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgSign=false", ...args], { cwd: root, env, encoding: "utf8", stdio: "pipe" }).trim();
const file = (name: string) => readFile(join(root, name), "utf8");

// The agent's work: a change staged, a change after it not, a new file, and a file git ignores.
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vantage-git-"));
  app = repo(root);
  git("init", "--quiet", "--initial-branch=main");
  await writeFile(join(root, ".gitignore"), "secret.env\n");
  await writeFile(join(root, "app.txt"), "as committed");
  git("add", "--all");
  git("commit", "--quiet", "--message", "The app");
  await writeFile(join(root, "app.txt"), "staged");
  git("add", "app.txt");
  await writeFile(join(root, "app.txt"), "changed since");
  await writeFile(join(root, "new.txt"), "new");
  await writeFile(join(root, "secret.env"), "KEY=1");
});
afterEach(() => rm(root, { recursive: true }));

const state = () => ({ branch: git("symbolic-ref", "--short", "HEAD"), status: git("status", "--porcelain"), staged: git("diff", "--cached"), stashes: git("stash", "list") });

describe("Before kept as a commit", () => {
  test("it's the working copy as it is, with what isn't committed, and the agent's branch and index stay as they were", async () => {
    await app.keepOutOfGit();
    await mkdir(join(root, ".vantage/overdue"), { recursive: true });
    await writeFile(join(root, ".vantage/overdue/review.json"), "{}");
    const was = state();
    const commit = keepBefore(app, "overdue");
    assert.equal(git("rev-parse", "refs/vantage/overdue/before"), commit, "a ref keeps it");
    assert.equal(git("show", `${commit}:app.txt`), "changed since");
    assert.equal(git("show", `${commit}:new.txt`), "new");
    assert.throws(() => git("show", `${commit}:secret.env`), "what git ignores stays as it is, out of it");
    assert.throws(() => git("show", `${commit}:.vantage/overdue/review.json`), "and so do the reviews");
    assert.deepEqual(state(), was);
  });

  test("outside git there's none", async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), "vantage-"));
    assert.equal(keepBefore(repo(elsewhere), "overdue"), undefined);
    await rm(elsewhere, { recursive: true });
  });
});

describe("The agent's work, set aside while a flow records on Before", () => {
  // As a command stopped halfway leaves it: set aside in a stash, the working copy on Before, and where it all is written
  // down by a command that's gone.
  async function stoppedHalfway() {
    await app.keepOutOfGit();
    const commit = keepBefore(app, "overdue")!;
    git("commit", "--quiet", "--message", "More work");
    await writeFile(join(root, "app.txt"), "changed again");
    await writeFile(join(root, "new.txt"), "newer");
    const was = state();
    const stash = "Vantage: your work, set aside while flows record on Before";
    await writeFile(app.setAside, JSON.stringify({ back: "main", stash, by: spawnSync(process.execPath, ["-e", ""]).pid }));
    git("stash", "push", "--quiet", "--include-untracked", "--message", stash);
    git("checkout", "--quiet", "--detach", commit);
    return was;
  }

  test("the next command puts it back before anything else: its branch, what was staged, what wasn't, and new files", async () => {
    const was = await stoppedHalfway();
    await putBack(app);
    assert.deepEqual(state(), was);
    assert.deepEqual([await file("app.txt"), await file("new.txt"), await file("secret.env")], ["changed again", "newer", "KEY=1"]);
    await putBack(app);
    assert.deepEqual(state(), was, "once it's back, there's nothing more to do");
  });

  test("where git can't put it back by itself, it says the two commands that do", async () => {
    await stoppedHalfway();
    await writeFile(join(root, "app.txt"), "changed on Before");
    await assert.rejects(
      putBack(app),
      (error) =>
        error instanceof Refused &&
        /Your work is still set aside, from recording a flow on Before, and git couldn't put it back by itself, because it says:\n  error: Your local changes/.test(error.message) &&
        /Put it back with git checkout main, then git stash pop --index stash@\{0\}\. Vantage carries on once it's back\./.test(error.message),
    );
  });
});

describe("How far Before goes with a flow", () => {
  // A flow as Playwright tells the reporter it ended on Before: its two steps, the second stopped by `error`.
  async function ended(error: string) {
    const folder = await mkdtemp(join(tmpdir(), "vantage-"));
    const reporter = new Flows({ folder, before: true, taken: [] });
    const start = Date.now();
    const steps = [
      { category: "test.step", title: "Open the expenses", startTime: new Date(start), duration: 1000 },
      { category: "test.step", title: "Search for the cabin", startTime: new Date(start + 1000), duration: 10_000, error: { message: error } },
    ];
    const attachments = [
      { name: RECORDING, contentType: "application/json", body: Buffer.from(JSON.stringify([{ timestamp: start }, { timestamp: start + 11_000 }])) },
      { name: READINGS, contentType: "application/json", body: Buffer.from("[]") },
    ];
    reporter.onTestEnd({ title: "Search the expenses", location: { file: "spliit.ts", line: 1 } } as TestCase, { status: "failed", steps, attachments, error: { message: error } } as unknown as TestResult);
    reporter.onEnd();
    const ran: { recorded: Recorded[]; failed: Failed[] } = JSON.parse(await readFile(join(folder, "flows.json"), "utf8"));
    await rm(folder, { recursive: true });
    return ran;
  }

  test("it goes as far as the app as it was can take it, marked where it stopped, with Playwright's reason", async () => {
    const { recorded, failed } = await ended("TimeoutError: locator.click: Timeout 10000ms exceeded.\nCall log: …");
    assert.deepEqual(recorded[0]?.flow.steps.map((step) => step.title), ["Open the expenses"]);
    assert.equal(recorded[0]?.flow.stopped, "Search for the cabin");
    assert.deepEqual(failed, [{ flow: "Search the expenses", at: "Search for the cabin", why: "TimeoutError: locator.click: Timeout 10000ms exceeded." }]);
  });

  test("a flow the browser stopped, not the app, says nothing about the app: nothing of the run is kept, and running again tries again", async () => {
    const { recorded, failed } = await ended("Error: page.goto: Page crashed");
    assert.deepEqual([recorded, failed], [[], [{ flow: "Search the expenses", at: "Search for the cabin", why: "Error: page.goto: Page crashed", broken: true }]]);
    assert.throws(
      () => refuseIfBroken(failed, "Before wasn't recorded", "Run this again."),
      /Before wasn't recorded, because the browser stopped a flow, not the app:\n  “Search the expenses”, at the step “Search for the cabin”\nPlaywright says why above\. Run this again\.$/,
    );
  });
});
