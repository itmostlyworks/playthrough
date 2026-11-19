// One page lists what's waiting from every app on the machine: an app is known from the first command run in it, by
// the folder it was run from, and one gone from disk drops out by itself. Each copy has a name of its own to be found by.

import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, test } from "node:test";
import { everyCopy, know, knownApps, machine } from "../src/machine.ts";
import { thisCommand } from "../src/command.ts";

let folder = "";
const app = async (...path: string[]) => {
  const root = join(folder, ...path);
  await mkdir(join(root, "playthrough"), { recursive: true });
  await mkdir(join(root, ".playthrough"), { recursive: true });
  return root;
};

beforeEach(async () => {
  folder = await realpath(await mkdtemp(join(tmpdir(), "playthrough-machine-")));
  process.env.PLAYTHROUGH_HOME = join(folder, "home");
});
afterEach(async () => {
  delete process.env.PLAYTHROUGH_HOME;
  await rm(folder, { recursive: true });
});

test("an app is known once a command runs in it, once, and a folder Playthrough isn't in is never known", async () => {
  const shop = await app("shop");
  know(shop);
  know(shop);
  know(join(folder, "elsewhere"));
  assert.deepEqual(knownApps(), [shop]);
});

test("an app gone from disk drops out of what's known", async () => {
  const [shop, blog] = [await app("shop"), await app("blog")];
  know(shop);
  know(blog);
  await rm(shop, { recursive: true });
  assert.deepEqual(knownApps(), [blog]);
  assert.deepEqual(everyCopy().map((copy) => copy.root), [blog]);
});

test("each copy is found by its folder's name, and two folders of one name by a number after the first", async () => {
  const [one, two] = [await app("a", "shop"), await app("b", "shop")];
  know(one);
  know(two);
  assert.deepEqual(everyCopy(), [
    { name: "shop", root: one },
    { name: "shop-2", root: two },
  ]);
});

// The command as an agent's shell runs it, which may give up on it and take what it started with it.
const playthrough = async (...words: string[]) =>
  (await run(process.execPath, [fileURLToPath(new URL("../src/playthrough.ts", import.meta.url)), ...words], { cwd: folder, env: { ...process.env, PLAYTHROUGH_PORT: String(port) } })).stdout;
const run = promisify(execFile);
let port = 0;
const viewerBuilt = existsSync(fileURLToPath(new URL("../viewer/index.html", import.meta.url)));

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

test("playthrough open comes back with the page's address and leaves it open, says it again while it is, and playthrough close closes it", { skip: !viewerBuilt && "the viewer isn't built: npm run build", timeout: 30_000 }, async () => {
  port = await freePort();
  const page = `http://localhost:${port}/`;
  const answering = () => fetch(page).then((answer) => answer.ok, () => false);
  assert.equal(await playthrough("close"), "Playthrough isn't open.\n");
  assert.equal(await playthrough("open"), `Playthrough is open at ${page}\nIt stays open until playthrough close.\n`);
  assert.equal(await answering(), true);
  assert.equal(await playthrough("open"), `Playthrough is already open at ${page}\n`);
  assert.equal(await playthrough("close"), `Playthrough is closed: ${page} no longer answers.\n`);
  assert.equal(await answering(), false);
  assert.equal(await playthrough("close"), "Playthrough isn't open.\n");
});

test("a page killed hard isn't open, even once another process has its number: close says so and stops nothing, and open opens it again", { skip: !viewerBuilt && "the viewer isn't built: npm run build", timeout: 30_000 }, async () => {
  port = await freePort();
  const page = `http://localhost:${port}/`;
  await playthrough("open");
  const left = join(machine(), "open.json");
  const killed = JSON.parse(await readFile(left, "utf8"));
  process.kill(killed.by, "SIGKILL");
  // A number comes round again only after thousands of others, so never in the second its last process started: the
  // one second macOS tells a process's start by.
  await new Promise((resolve) => setTimeout(resolve, 1000 - (Date.now() % 1000)));
  const another = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30_000)"]);
  await writeFile(left, JSON.stringify({ ...killed, by: another.pid }));
  try {
    assert.equal(await playthrough("close"), "Playthrough isn't open.\n");
    assert.equal(another.exitCode ?? another.signalCode, null);
    assert.equal(await playthrough("open"), `Playthrough is open at ${page}\nIt stays open until playthrough close.\n`);
    assert.equal(await playthrough("close"), `Playthrough is closed: ${page} no longer answers.\n`);
  } finally {
    another.kill();
  }
});

test("a page an earlier version left open, which didn't write its port, is closed by open, which opens in its place", { skip: !viewerBuilt && "the viewer isn't built: npm run build", timeout: 30_000 }, async () => {
  port = await freePort();
  const page = `http://localhost:${port}/`;
  const earlier = spawn(process.execPath, ["-e", "process.on('SIGINT', () => process.exit()); setTimeout(() => {}, 30_000)"]);
  await new Promise((resolve) => earlier.once("spawn", resolve));
  await mkdir(machine(), { recursive: true });
  await writeFile(join(machine(), "open.json"), JSON.stringify({ by: earlier.pid, boot: thisCommand().boot }));
  const closed = new Promise((resolve) => earlier.once("exit", resolve));
  try {
    assert.equal(await playthrough("open"), `The Playthrough an earlier version left open is closed, for this one.\nPlaythrough is open at ${page}\nIt stays open until playthrough close.\n`);
    await closed;
    assert.equal(await playthrough("close"), `Playthrough is closed: ${page} no longer answers.\n`);
  } finally {
    earlier.kill();
  }
});
