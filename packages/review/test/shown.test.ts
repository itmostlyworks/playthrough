// Where a moment starts: the thing the agent tagged happening, and nothing of the way there.

import assert from "node:assert/strict";
import { test } from "node:test";
import { shownFrom, startOf, type Done, type Scene } from "../src/index.ts";

const goto: Done = { does: "goto", went: true };
const link = (went = true): Done => ({ does: "click", role: "link", went });
const button = (went = false): Done => ({ does: "click", role: "button", went });
const type: Done = { does: "fill", role: "textbox" };

test("a moment starts where you arrived on the page it ends on: the links followed there are the way, never shown", () => {
  assert.deepEqual(startOf([goto, link(), link(), type, button()]), { at: 3 });
});

test("nothing done since arriving is a still", () => {
  assert.deepEqual(startOf([goto, link(), link()]), { at: 3 });
  assert.deepEqual(startOf([goto]), { at: 1 });
});

test("an address gone to directly is arriving, as a link followed is", () => {
  assert.deepEqual(startOf([goto, type, button(), goto, button()]), { at: 4 });
});

test("a moment starts where the one before it ended, if that came after arriving", () => {
  assert.deepEqual(startOf([goto, link(), type, button(), button()], 4), { at: 4 });
  assert.deepEqual(startOf([goto, link(), type, button()], 4), { at: 4 }, "marked again with nothing done since, it's a still");
  assert.deepEqual(startOf([goto, link(), link(), type], 1), { at: 3 }, "arriving later than the one before, it starts there");
});

test("a button that lands on a new page is doing something: it stays in the moment", () => {
  assert.deepEqual(startOf([goto, type, button(true), type, button()]), { at: 2 });
  assert.deepEqual(startOf([goto, type, button(true), { does: "goto" }, type]), { at: 2 }, "the page it led to loading is its going");
});

test("a button that brought you here with nothing done since can't be told: pressing it, or what it brought", () => {
  assert.deepEqual(startOf([goto, type, button(true)]), { at: 2, unclear: "brought" });
  assert.deepEqual(startOf([goto, type, button(true), { does: "goto" }]), { at: 2, unclear: "brought" });
  assert.deepEqual(startOf([goto, type, button(true)], 3), { at: 3 }, "the moment before was the button: this one's a still");
});

test("a moment showing more than four things done is more than one thing happening, and can't be told", () => {
  assert.deepEqual(startOf([goto, type, button(), type, button(), button()]), { at: 1, unclear: "long" });
  assert.deepEqual(startOf([goto, type, button(), type, button()]), { at: 1 });
});

test("with nothing gone to, it starts at the start", () => {
  assert.deepEqual(startOf([type, button()]), { at: 0 });
});

const kept = (began: [string, number, number][], length = 10): Scene => ({
  name: "“BS-WEB” is refused",
  length,
  recording: "bs-web.json",
  steps: [{ title: "“BS-WEB” is refused", at: 0, actions: began.map(([, , at]) => at), began: began.map(([action, at]) => ({ action, at })) }],
});

test("a moment kept before moments had a start is shown from where the rule starts it, a little before its first thing", () => {
  const scene = kept([["click link “Settings”", 1, 1.5], ["click link “Workspace”", 2.5, 3], ["type textbox “Card prefix”", 4.5, 5.5], ["click button “Update”", 6.5, 7]]);
  assert.equal(shownFrom(scene), 3.5);
});

test("one kept before that ends on a page arrived at by a link, with nothing done there, is a still: where its end holds", () => {
  assert.equal(shownFrom(kept([["click link “Settings”", 1, 1.5], ["click link “Workspace”", 2.5, 3]])), 8.5);
  assert.equal(shownFrom(kept([["click link “Settings”", 1, 1.5], ["click link “Workspace”", 2.5, 3]], 4)), 3.1, "and never before the last thing done");
});

test("never from before the thing done before the first shown", () => {
  assert.equal(shownFrom(kept([["click link “Settings”", 1, 1.5], ["press Enter textbox “Search”", 1.8, 2]])), 1.5);
});

test("one with a start is shown from it", () => {
  assert.equal(shownFrom({ ...kept([["click link “Settings”", 1, 1.5]]), from: 0.4 }), 0.4);
});
