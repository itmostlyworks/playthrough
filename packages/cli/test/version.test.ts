// The version running is one command away, as the package says it, and nothing else is said with it.

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const playthrough = (...words: string[]) => promisify(execFile)(process.execPath, [fileURLToPath(new URL("../src/playthrough.ts", import.meta.url)), ...words]);
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("playthrough --version says the version and nothing else; a word more is refused, and --help with it is the help", async () => {
  assert.equal((await playthrough("--version")).stdout, `${version}\n`);
  await assert.rejects(playthrough("--version", "now"), (error: { stderr: string }) => error.stderr.endsWith("That's more than it takes: playthrough --version\n"));
  assert.match((await playthrough("--version", "--help")).stdout, /^Playthrough: a person reviews your work/);
});
