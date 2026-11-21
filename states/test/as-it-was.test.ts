// What a state promises of the change it starts: the kept change as it was at one of its versions, the person's part
// in it as the state says, and the pretend agent answering what was really sent.

import assert from "node:assert/strict";
import { test } from "node:test";
import { notesToAnswer, saidDone, standingOf, type Change, type HandBack, type Moment, type Note, type Send } from "@playthrough/change";
import { answersFor, asItWas } from "../as-it-was.ts";
import { states, type State } from "../list.ts";

const moment = (name: string): Moment => ({ name, length: 5, recording: `${name.toLowerCase().replace(/\W+/g, "-")}.json`, from: 1, actions: [{ at: 2 }] });
const [LIST, REMIND] = [moment("Only overdue invoices show"), moment("A reminder goes out")];
const note = (id: string, on: Moment, handBack: number): Note => ({ id, on: { handBack, moment: on.name, at: 3 }, words: `About ${on.name}` });
const version = (number: number, finished: string, replies: HandBack["replies"] = []): HandBack => ({ number, by: "Claude Code", moments: [LIST, REMIND], replies, finished });
const sent = (id: string, handBack: number, at: string, notes: Note[]): Send => ({ id, handBack, by: "You", sent: at, notes });

// Three versions: notes on the first, answered by the second; a note on the second, answered by the third.
const KEPT: Change = {
  id: "overdue-invoices",
  title: "Show overdue invoices",
  started: "2026-11-17T13:00:00.000Z",
  handBacks: [
    version(1, "2026-11-17T13:05:00.000Z"),
    version(2, "2026-11-17T13:10:00.000Z", [{ note: "noteonlist", words: "Each says how late." }, { note: "noteremind", words: "It names the day." }]),
    version(3, "2026-11-17T13:20:00.000Z", [{ note: "secondone", words: "Fixed." }]),
  ],
  comparisons: [{ handBack: 2, since: 1, findings: [] }, { handBack: 3, since: 2, findings: [] }, { handBack: 3, since: 1, findings: [] }],
  sends: [sent("firstsend", 1, "2026-11-17T13:06:00.000Z", [note("noteonlist", LIST, 1), note("noteremind", REMIND, 1)]), sent("secondsend", 2, "2026-11-17T13:12:00.000Z", [note("secondone", LIST, 2)])],
  taken: [{ send: "firstsend", handBack: 2, at: "2026-11-17T13:07:00.000Z" }, { send: "secondsend", handBack: 3, at: "2026-11-17T13:13:00.000Z" }],
};
const NOW = new Date("2026-11-21T12:00:00.000Z");
const named = (name: string): State => states.find((state) => state.name === name)!;
const made = (name: string) => asItWas(KEPT, named(name), "Ludwig", NOW);

test("a state on the noted version holds only what was handed back by then, nothing of the person's yet", () => {
  const { change, unsent } = made("handed-back");
  assert.deepEqual(change!.handBacks.map((one) => one.number), [1]);
  assert.deepEqual(change!.comparisons, []);
  assert.deepEqual([change!.sends, change!.taken, unsent], [[], [], []]);
});

test("its times are moved so the version was handed back just now", () => {
  assert.equal(made("handed-back").change!.handBacks[0]!.finished, NOW.toISOString());
  assert.equal(made("answers-came-back").change!.handBacks.at(-1)!.finished, NOW.toISOString());
});

test("notes written but not sent are the page's to keep; sent ones are the person's, and taken ones with the next version", () => {
  assert.deepEqual(made("notes-written").unsent.map((one) => one.id), ["noteonlist", "noteremind"]);
  const sent = made("no-agent-listening").change!;
  assert.deepEqual([sent.sends.map((one) => one.by), sent.taken], [["Ludwig"], []]);
  assert.deepEqual(notesToAnswer(made("agent-working").change!, 2), ["noteonlist", "noteremind"]);
});

test("the latest version comes with everything said before it, and Done said on it stands", () => {
  const { change } = made("all-caught-up");
  assert.deepEqual(change!.handBacks.map((one) => one.number), [1, 2, 3]);
  assert.ok(saidDone(change!, "Ludwig"));
  assert.equal(standingOf(change!, "Ludwig").is, "done");
});

test("watched as the state says: nothing, the versions before, or all but the latest's last moment", () => {
  const seen = (name: string) => made(name).change!.seen?.Ludwig?.map((one) => `${one.handBack} ${one.moment}`) ?? [];
  assert.deepEqual(seen("handed-back"), []);
  assert.deepEqual(seen("answers-came-back"), [`1 ${LIST.name}`, `1 ${REMIND.name}`, `2 ${LIST.name}`, `2 ${REMIND.name}`]);
  assert.deepEqual(seen("unseen-at-done").slice(-1), [`3 ${LIST.name}`]);
});

test("a long change is made from the latest version's own moments, each recording under a name of its own", () => {
  const { change, madeFrom } = made("a-long-change");
  const moments = change!.handBacks.at(-1)!.moments;
  assert.equal(moments.length, 15);
  assert.equal(new Set(moments.map((one) => one.name)).size, 15);
  assert.deepEqual(madeFrom[0], { handBack: 3, recording: "only-overdue-invoices-show-2.json", from: "only-overdue-invoices-show.json" });
});

test("no change at all where the state is empty", () => {
  assert.equal(made("nothing-here-yet").change, undefined);
});

test("the next version answers the notes really sent: the kept answer to the same note, else to one on its moment, else plainly", () => {
  const { change } = made("handed-back");
  const yours = sent("yoursend1", 1, NOW.toISOString(), [note("yourmoment", REMIND, 1), note("yourextra", LIST, 1), note("yourthird", LIST, 1)]);
  const now = { ...change!, sends: [yours], taken: [{ send: yours.id, handBack: 2, at: NOW.toISOString() }] };
  assert.deepEqual(answersFor(KEPT, KEPT.handBacks[1]!, now), [
    { note: "yourmoment", words: "It names the day." },
    { note: "yourextra", words: "Each says how late." },
    { note: "yourthird", words: "Done." },
  ]);
  const kept = { ...change!, sends: KEPT.sends.slice(0, 1), taken: KEPT.taken.slice(0, 1) };
  assert.deepEqual(answersFor(KEPT, KEPT.handBacks[1]!, kept), KEPT.handBacks[1]!.replies);
});
