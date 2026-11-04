// Where you are in a round: a scene and a moment in it, its title card included, and the scenes end to end.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Scene } from "@playthrough/review";
import { along, CARD, momentAt, titleCard } from "../src/moments.ts";

const scene = (length: number, steps: [string, number][]): Scene => ({ name: "Settle up", length, steps: steps.map(([title, at]) => ({ title, at })), recording: "settle-up.json" });

test("a step forward from one scene's end goes on into the next, through its title card", () => {
  const scenes = [{ ...scene(2, []), name: "See who owes whom" }, { ...scene(4, []), name: "Search" }];
  const end = along(scenes, { scene: "See who owes whom", at: 2 });
  assert.deepEqual(momentAt(scenes, end + 1), { scene: "Search", at: 1 - CARD });
  assert.deepEqual(momentAt(scenes, end + 100), { scene: "Search", at: 4 });
  assert.deepEqual(momentAt(scenes, -5), { scene: "See who owes whom", at: -CARD });
});

test("a scene's name comes up over its softened first frame, and is gone as its recording starts", () => {
  const middle = titleCard(-CARD / 2)!;
  assert.ok(middle.soft > 0.9 && middle.name === 1);
  assert.equal(titleCard(0), undefined);
  assert.ok(titleCard(-0.01)!.name < 0.1 && titleCard(-0.01)!.soft < 0.1);
});
