// Where you are in a round: a flow and a moment in it, its title card included, and the flows end to end.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Flow } from "@mostlyworks/vantage-review";
import { along, CARD, momentAt, titleCard } from "../src/moments.ts";

const flow = (length: number, steps: [string, number][]): Flow => ({ name: "Settle up", length, steps: steps.map(([title, at]) => ({ title, at })), recording: "settle-up.json" });

test("a step forward from one flow's end goes on into the next, through its title card", () => {
  const flows = [{ ...flow(2, []), name: "See who owes whom" }, { ...flow(4, []), name: "Search" }];
  const end = along(flows, { flow: "See who owes whom", at: 2 });
  assert.deepEqual(momentAt(flows, end + 1), { flow: "Search", at: 1 - CARD });
  assert.deepEqual(momentAt(flows, end + 100), { flow: "Search", at: 4 });
  assert.deepEqual(momentAt(flows, -5), { flow: "See who owes whom", at: -CARD });
});

test("a flow's name comes up over its softened first frame, and is gone as its recording starts", () => {
  const middle = titleCard(-CARD / 2)!;
  assert.ok(middle.soft > 0.9 && middle.name === 1);
  assert.equal(titleCard(0), undefined);
  assert.ok(titleCard(-0.01)!.name < 0.1 && titleCard(-0.01)!.soft < 0.1);
});
