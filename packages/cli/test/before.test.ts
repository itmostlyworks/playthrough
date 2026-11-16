// The app as it was before the change: the code where the branch left origin's default one, never the agent's own work,
// and an export of it that runs with what git ignores brought over from the working folder.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { codeBefore, exported } from "../src/before.ts";

let folder = "";
let origin = "";
let app = "";
const env = { ...process.env, GIT_AUTHOR_NAME: "Ana", GIT_AUTHOR_EMAIL: "ana@example.com", GIT_COMMITTER_NAME: "Ana", GIT_COMMITTER_EMAIL: "ana@example.com" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "commit.gpgSign=false", ...args], { cwd, env, encoding: "utf8", stdio: "pipe" }).trim();

beforeEach(async () => {
  folder = await realpath(await mkdtemp(join(tmpdir(), "playthrough-before-")));
  origin = join(folder, "origin");
  app = join(folder, "app");
  await mkdir(join(origin, "playthrough"), { recursive: true });
  await mkdir(join(origin, "packages", "sort"), { recursive: true });
  await writeFile(join(origin, "playthrough", "app.json"), JSON.stringify({ start: "node serve.js {port}", url: "http://localhost:{port}" }));
  await writeFile(join(origin, ".gitignore"), "node_modules/\n.env\n.next/\n");
  await writeFile(join(origin, "packages", "sort", "index.js"), "export const order = 'starred first';\n");
  git(origin, "init", "--quiet", "--initial-branch=main");
  git(origin, "add", "--all");
  git(origin, "commit", "--quiet", "--message", "The app");
  git(folder, "clone", "--quiet", origin, app);
});

afterEach(() => rm(folder, { recursive: true, force: true }));

test("the code as it was is where the branch left origin's default one, the agent's commits still the change's", async () => {
  const base = git(app, "rev-parse", "HEAD");
  await writeFile(join(app, "packages", "sort", "index.js"), "export const order = 'A to Z';\n");
  git(app, "commit", "--quiet", "--all", "--message", "A to Z");
  assert.equal(codeBefore(app), base);
});

test("nothing is said to be before where the code now is the code as it was", async () => {
  assert.equal(codeBefore(app), undefined);
  await writeFile(join(app, ".env"), "SECRET=1\n");
  assert.equal(codeBefore(app), undefined, "what git ignores isn't the change");
  await writeFile(join(app, "new.js"), "\n");
  assert.ok(codeBefore(app), "a new file is");
});

test("without an origin that names its default branch, there's no before", async () => {
  git(app, "remote", "remove", "origin");
  await writeFile(join(app, "new.js"), "\n");
  assert.equal(codeBefore(app), undefined);
});

test("the export brings over ignored files and dependencies, the app's own packages as they were, and leaves builds", async () => {
  const base = git(app, "rev-parse", "HEAD");
  await writeFile(join(app, ".env"), "SECRET=1\n");
  await mkdir(join(app, "node_modules", "@app"), { recursive: true });
  await mkdir(join(app, "node_modules", "left-pad"), { recursive: true });
  await writeFile(join(app, "node_modules", "left-pad", "index.js"), "export default 1;\n");
  await symlink(join("..", "..", "packages", "sort"), join(app, "node_modules", "@app", "sort"));
  await mkdir(join(app, ".next"));
  await writeFile(join(app, ".next", "build.js"), "\n");
  await writeFile(join(app, "packages", "sort", "index.js"), "export const order = 'A to Z';\n");
  await writeFile(join(app, "playthrough", "app.json"), JSON.stringify({ start: "node serve.js --port {port}", url: "http://localhost:{port}" }));

  const before = await exported(app, base);
  assert.equal(before, join(app, ".playthrough", "before", base));
  assert.equal(readFileSync(join(before, ".env"), "utf8"), "SECRET=1\n");
  assert.equal(readFileSync(join(before, "node_modules", "@app", "sort", "index.js"), "utf8"), "export const order = 'starred first';\n");
  assert.equal(realpathSync(join(before, "node_modules", "@app", "sort")), join(before, "packages", "sort"));
  assert.equal(readFileSync(join(before, "node_modules", "left-pad", "index.js"), "utf8"), "export default 1;\n");
  assert.ok(!existsSync(join(before, ".next")), "the app builds it again");
  assert.match(readFileSync(join(before, "playthrough", "app.json"), "utf8"), /--port/, "started as Playthrough starts the app now");
  assert.ok(!existsSync(join(before, ".playthrough", "before")), "never an export inside an export");
  assert.ok(!git(app, "worktree", "list").includes(".playthrough"), "not one of git's worktrees");
});
