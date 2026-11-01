// Each run makes its own world to start from, and gives it back once it's over, so an app, shared or not, isn't left
// with one for every run: setup's `after` takes away what setup made, whether the run ends or the command it ran in does.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { giveBackLeft, make, setupIn, watching, type Setup } from "../src/setup.ts";

let borrowed = "";
let given: Record<string, any>[] = [];
const app: Setup = { make: () => ({ board: "Website launch" }), after: ({ setup }) => void given.push(setup) };
const baseURL = "http://localhost:3010";
// A process that has ended: none has this number.
const ended = 2 ** 22 + 1;

beforeEach(async () => {
  borrowed = join(await mkdtemp(join(tmpdir(), "playthrough-setup-")), "borrowed");
  given = [];
});
afterEach(() => rm(borrowed, { recursive: true, force: true }));
const left = () => readdir(borrowed).catch(() => []);

describe("What setup makes for a run", () => {
  test("is given back once the run is over, as setup returned it", async () => {
    const made = await make(app, borrowed, { page: undefined as never, request: undefined as never, baseURL });
    assert.deepEqual(made.setup, { board: "Website launch" });
    assert.equal((await left()).length, 1, "written down while it's out");
    await made.giveBack();
    assert.deepEqual(given, [{ board: "Website launch" }]);
    assert.deepEqual(await left(), []);
  });

  test("isn't written down when setup has nothing to give it back", async () => {
    const made = await make({ make: app.make }, borrowed, { page: undefined as never, request: undefined as never, baseURL });
    await made.giveBack();
    assert.deepEqual(await left(), []);
  });

  test("by a command that ended first is given back by the next", async () => {
    await mkdir(borrowed);
    await writeFile(join(borrowed, `${ended}-a.json`), JSON.stringify({ baseURL, setup: { board: "Left" } }));
    await giveBackLeft(app, borrowed);
    assert.deepEqual(given, [{ board: "Left" }]);
    assert.deepEqual(await left(), []);
  });

  test("by a command still running is left to it", async () => {
    await mkdir(borrowed);
    await writeFile(join(borrowed, `${process.pid}-a.json`), JSON.stringify({ baseURL, setup: { board: "Mine" } }));
    await giveBackLeft(app, borrowed);
    assert.deepEqual(given, []);
    assert.equal((await left()).length, 1);
  });

  test("that can't be given back now is kept, to be tried again", async () => {
    await mkdir(borrowed);
    await writeFile(join(borrowed, `${ended}-a.json`), JSON.stringify({ baseURL, setup: { board: "Left" } }));
    await giveBackLeft({ ...app, after: () => Promise.reject(new Error("The app isn't answering")) }, borrowed);
    assert.deepEqual(await left(), [`${process.pid}-a.json`], "this command's now, tried again once it ends");
  });
});

describe("What setup sends the app", () => {
  // Playwright's request as setup uses it, answering everything.
  const request = { get: async () => "read", post: async () => "made", delete: async () => "taken", fetch: async () => "fetched", storageState: async () => ({}) } as never;

  test("tells each request that changes what the app holds, and none that only reads it", async () => {
    let changed = 0;
    const watched = watching(request, () => changed++) as unknown as Record<string, (...args: unknown[]) => Promise<string>>;
    assert.equal(await watched.get!("/boards"), "read", "and answers as the request does");
    await watched.fetch!("/boards");
    await watched.fetch!("/boards", { method: "HEAD" });
    await watched.storageState!();
    assert.equal(changed, 0);
    await watched.post!("/boards", { data: { name: "Website launch" } });
    await watched.delete!("/boards/1");
    await watched.fetch!("/boards", { method: "put" });
    assert.equal(changed, 3);
  });
});

describe("How setup opens the app's pages", () => {
  test("is up to it, but for what Playthrough keeps the same for every flow, or a flow sets with test.use", async () => {
    const folder = await mkdtemp(join(tmpdir(), "playthrough-setup-"));
    try {
      await writeFile(join(folder, "setup.ts"), `export const use = { userAgent: "playwright" };\n`);
      assert.deepEqual((await setupIn(join(folder, "setup.ts"))).use, { userAgent: "playwright" });
      await writeFile(join(folder, "theirs.ts"), `export const use = { userAgent: "playwright", viewport: { width: 390, height: 844 }, locale: "sv-SE" };\n`);
      await assert.rejects(setupIn(join(folder, "theirs.ts")), /playthrough\/setup\.ts's use sets viewport and locale, which Playthrough keeps the same for every flow, or a flow sets with test\.use, like its screen\. Take them out of use\./);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
