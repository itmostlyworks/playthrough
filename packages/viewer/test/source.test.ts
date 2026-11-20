// The viewer asks one source for everything: `playthrough open` unless another page hands it its own, which is then
// where every file, picture and answer comes from.

import assert from "node:assert/strict";
import { test } from "node:test";
import { from, keepBranch, noteFrame, picture, source, type Keeping, type Source } from "../src/api.ts";
import { keepTakenOver, takenOverHere, stored } from "../src/kept.ts";
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
  takeOver: async () => ({ address: "demo/app/", setup: {} }),
  keepBranch: async (_, branch) => branch.events.length,
  frame: async () => ({ picture: "readings/invoices/1.png", screen: { width: 1280, height: 800 } }),
  still: async () => undefined,
};

test("it's `playthrough open` until another page hands the viewer a source of its own", () => {
  assert.equal(source, server);
  assert.equal(picture("invoices/checks", 1, "invoices.json", 0), "/api/changes/invoices/checks/hand-backs/1/files/readings/invoices/1.png");
});

test("what the viewer keeps between visits and for the tab is kept where its source says: at `playthrough open`'s, the browser's own storage, under the same keys", () => {
  const browser = { localStorage: new Map<string, string>(), sessionStorage: new Map<string, string>() };
  for (const [name, held] of Object.entries(browser))
    Object.defineProperty(globalThis, name, { configurable: true, value: { getItem: (key: string) => held.get(key) ?? null, setItem: (key: string, value: string) => held.set(key, value), removeItem: (key: string) => held.delete(key) } });
  const kept = (mine: Map<string, string>): Keeping => ({ getItem: (key) => mine.get(key) ?? null, setItem: (key, value) => void mine.set(key, value), removeItem: (key) => void mine.delete(key) });
  try {
    keepTakenOver("invoices/checks");
    browser.localStorage.set("playthrough:moments:invoices/checks", "[]");
    assert.equal(browser.sessionStorage.get("playthrough:taken-over:invoices/checks"), "yes");
    assert.equal(stored((change) => `playthrough:moments:${change}`, "invoices/checks"), "[]");

    const betweenVisits = new Map<string, string>();
    const forTheTab = new Map<string, string>();
    from({ ...handed, kept: kept(betweenVisits), keptForTheTab: kept(forTheTab) });
    assert.equal(takenOverHere("invoices/checks"), false);
    keepTakenOver("invoices/lake");
    assert.equal(forTheTab.get("playthrough:taken-over:invoices/lake"), "yes");
    assert.equal(stored((change) => `playthrough:moments:${change}`, "invoices/checks"), null);

    from(handed);
    keepTakenOver("invoices/trip");
    assert.equal(takenOverHere("invoices/trip"), true);
    assert.deepEqual([...browser.sessionStorage.keys()], ["playthrough:taken-over:invoices/checks"]);
  } finally {
    from(server);
    for (const name of Object.keys(browser)) delete (globalThis as Record<string, unknown>)[name];
  }
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
