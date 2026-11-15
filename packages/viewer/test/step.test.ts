// What's next on a change: which of its moments you haven't seen, where pressing it takes you, the words its step says,
// which part of every change it's in, and which change comes next.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Change, HandBack, Moment, Send } from "@playthrough/change";
import type { Listed } from "../src/api.ts";
import { firstUnseen, lookOf, sectionOf, stepOf, unseenOf, waitingInOrder } from "../src/step.ts";

const you = "Ana";

const moment = (name: string): Moment => ({ name, length: 6, actions: [], recording: `${name.toLowerCase().replaceAll(" ", "-")}.json`, from: 2 });

const handBack = (number: number, names: string[], parts: Partial<HandBack> = {}): HandBack => ({
  number,
  by: "Claude Code",
  moments: names.map(moment),
  replies: [],
  finished: `2026-11-1${number}T09:00:00.000Z`,
  ...parts,
});

const send = (number: number, parts: Partial<Send> = {}): Send => ({ id: `send-${number}`, handBack: number, by: you, sent: `2026-11-1${number}T10:00:00.000Z`, notes: [], ...parts });

const listed = (parts: Partial<Change> = {}): Listed => ({
  change: { id: "kan/hide-card-numbers", title: "Let admins hide card numbers", started: "2026-11-10T08:00:00.000Z", handBacks: [handBack(1, ["Admin opens settings", "Admin turns numbers off", "Member sees no numbers"])], comparisons: [], sends: [], taken: [], ...parts },
  app: "Kan",
  people: {},
  agentWaiting: true,
});

const seen = (...moments: [number, string][]) => ({ seen: { [you]: moments.map(([handBack, moment]) => ({ handBack, moment })) } });

test("a moment you haven't opened is unseen, and one you've opened in this hand-back is seen", () => {
  assert.deepEqual(unseenOf(listed(), you), [1, 2, 3]);
  assert.deepEqual(unseenOf(listed(seen([1, "Admin opens settings"])), you), [2, 3]);
});

test("a moment seen in an earlier hand-back stays seen, unless it looks different since", () => {
  const twice = { handBacks: [handBack(1, ["Admin opens settings", "Admin turns numbers off"]), handBack(2, ["Admin opens settings", "Admin turns numbers off"])], ...seen([1, "Admin opens settings"], [1, "Admin turns numbers off"]) };
  assert.deepEqual(unseenOf(listed(twice), you), []);
  const different = { handBack: 2, since: 1, findings: [{ id: "switch:moved", words: "The switch moved", seen: [{ moment: "Admin turns numbers off", at: 3 }] }] };
  assert.deepEqual(unseenOf(listed({ ...twice, comparisons: [different] as Change["comparisons"] }), you), [2]);
});

test("pressing a change goes to its first moment you haven't seen, and seen all through, to its first", () => {
  assert.deepEqual(firstUnseen(listed(seen([1, "Admin opens settings"])), you), { moment: 2 });
  assert.deepEqual(firstUnseen(listed(seen([1, "Admin opens settings"], [1, "Admin turns numbers off"], [1, "Member sees no numbers"])), you), { moment: 1 });
});

test("pressing a change goes to an answer you haven't read when it's on an earlier moment than anything unseen", () => {
  const note = { id: "n1", on: { handBack: 1, moment: "Admin opens settings", at: 3 }, words: "The toggle is hard to find." };
  const answered = handBack(2, ["Admin opens settings", "Admin turns numbers off", "Member sees no numbers"], { replies: [{ note: "n1", words: "Moved it to the top." }] });
  const change = listed({ handBacks: [handBack(1, ["Admin opens settings", "Admin turns numbers off", "Member sees no numbers"]), answered], sends: [send(1, { notes: [note] })], ...seen([1, "Admin opens settings"], [1, "Admin turns numbers off"]) });
  assert.deepEqual(firstUnseen(change, you), { moment: 1 });
});

test("the step says what's left to see, as so many more once some are seen, and all seen at the end", () => {
  assert.equal(lookOf(listed(), you), "See 3 moments");
  assert.equal(lookOf(listed(seen([1, "Admin opens settings"], [1, "Admin turns numbers off"])), you), "See 1 more moment");
  assert.equal(lookOf(listed(seen([1, "Admin opens settings"], [1, "Admin turns numbers off"], [1, "Member sees no numbers"])), you), "All 3 seen");
  assert.equal(lookOf(listed({ handBacks: [handBack(1, ["Admin opens settings"])], ...seen([1, "Admin opens settings"]) }), you), "Seen");
});

test("seen all through with nothing said, a change's step is Done; with something unseen, it's to look", () => {
  assert.equal(stepOf(listed(), you).is, "look");
  assert.equal(stepOf(listed(seen([1, "Admin opens settings"], [1, "Admin turns numbers off"], [1, "Member sees no numbers"])), you).is, "done");
});

test("sent with no agent listening, the step says so and what to tell yours", () => {
  const note = { id: "n1", on: { handBack: 1, moment: "Admin opens settings", at: 3 }, words: "The toggle is hard to find." };
  const change = listed({ sends: [send(1, { notes: [note] })] });
  assert.deepEqual(stepOf({ ...change, agentWaiting: false }, you), { is: "with", words: "No agent listening", tell: "Pick up my notes in Playthrough." });
  assert.deepEqual(stepOf(change, you), { is: "with", words: "Sent" });
});

test("a change is waiting on you once handed back, with your agents once you've sent on it or before it's handed back, and done once you say so", () => {
  assert.equal(sectionOf(listed(), you), "waiting");
  assert.equal(sectionOf(listed({ handBacks: [] }), you), "agents");
  assert.equal(sectionOf(listed({ sends: [send(1, { notes: [{ id: "n1", on: { handBack: 1, moment: "Admin opens settings", at: 3 }, words: "Hard to find." }] })] }), you), "agents");
  assert.equal(sectionOf(listed({ sends: [send(1, { done: true })] }), you), "done");
});

test("what's next is a change with something to see before one seen through, and of those, the longest waiting", () => {
  const change = (id: string, finished: string, parts: Partial<Change> = {}) => {
    const one = listed(parts);
    return { ...one, change: { ...one.change, id, handBacks: one.change.handBacks.map((kept) => ({ ...kept, finished })) } };
  };
  const seenThrough = seen([1, "Admin opens settings"], [1, "Admin turns numbers off"], [1, "Member sees no numbers"]);
  const changes = [
    change("kan/seen-through-oldest", "2026-11-10T09:00:00.000Z", seenThrough),
    change("kan/newer", "2026-11-12T09:00:00.000Z"),
    change("kan/older", "2026-11-11T09:00:00.000Z"),
    change("kan/sent", "2026-11-09T09:00:00.000Z", { sends: [send(1, { done: true })] }),
  ];
  assert.deepEqual(waitingInOrder(changes, you).map(({ change }) => change.id), ["kan/older", "kan/newer", "kan/seen-through-oldest"]);
});
