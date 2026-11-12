// One page lists what's waiting from every app on the machine: an app is known from the first command run in it, by
// the folder it was run from, and one gone from disk drops out by itself. Each copy has a name of its own to be found by.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { everyCopy, know, knownApps } from "../src/machine.ts";

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
