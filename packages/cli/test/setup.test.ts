// Each run makes its own world to start from, and gives it back once it's over, so an app, shared or not, isn't left
// with one for every run: setup's `after` takes away what setup made, whether the run ends or the command it ran in does.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { giveBackLeft, make, type Setup } from "../src/setup.ts";

let borrowed = "";
let given: Record<string, any>[] = [];
const app: Setup = { make: () => ({ board: "Website launch" }), after: ({ setup }) => void given.push(setup) };
const baseURL = "http://localhost:3010";
// A process that has ended: none has this number.
const ended = 2 ** 22 + 1;

beforeEach(async () => {
  borrowed = join(await mkdtemp(join(tmpdir(), "vantage-setup-")), "borrowed");
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
