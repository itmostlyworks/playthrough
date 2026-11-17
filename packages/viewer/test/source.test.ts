// The viewer asks one source for everything: `playthrough open` unless another page hands it its own, which is then
// where every file, picture and answer comes from.

import assert from "node:assert/strict";
import { test } from "node:test";
import { from, keepBranch, noteFrame, picture, source, type Source } from "../src/api.ts";
import { server } from "../src/server.ts";

const files = (change: string, handBack: number) => `demo/changes/${change}/${handBack}/`;
const handed: Source = {
  you: async () => "You",
  changes: (told) => (told([]), () => {}),
  file: (change, handBack, name) => files(change, handBack) + name,
  send: async () => [],
  seen: async () => [],
  readyIn: async () => ({ in: 400, starting: false }),
  keepReady: () => {},
  stepIn: async () => ({ address: "demo/app/", setup: {} }),
  keepBranch: async (_, branch) => branch.events.length,
  frame: async () => ({ picture: "readings/invoices/1.png", screen: { width: 1280, height: 800 } }),
  still: async () => undefined,
};

test("it's `playthrough open` until another page hands the viewer a source of its own", () => {
  assert.equal(source, server);
  assert.equal(picture("invoices/checks", 1, "invoices.json", 0), "/api/changes/invoices/checks/hand-backs/1/files/readings/invoices/1.png");
});

test("handed a source, a moment's pictures, a note's frame and what you did in the app are the source's", async () => {
  from(handed);
  try {
    assert.equal(picture("invoices/checks", 1, "invoices.json", 0), "demo/changes/invoices/checks/1/readings/invoices/1.png");
    const framed = await noteFrame("invoices/checks", "a note", { handBack: 1, recording: "invoices.json", at: 2 });
    assert.equal(framed?.src, "demo/changes/invoices/checks/1/readings/invoices/1.png");
    assert.equal(await keepBranch("invoices/checks", 1, { moment: "invoices", at: 2 }, [{}, {}], "branches/yours.json"), 2);
  } finally {
    from(server);
  }
});
