// What the loop promises, from a change named to Done, as the store keeps it: what a person and an agent can count on
// whatever page or command they use. A change is kept as a review, a moment as a scene with one step, a hand-back as a
// round.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { allNotes, conversation, memory, newId, notesToAnswer, Refused, Reviews, roundInProgress, saidDone, waitingForTheAgent, type Note, type Round, type Scene, type Send } from "../src/index.ts";

const CHANGE = "change-the-card-prefix";

// A moment: its way there, then its one step, shown from where the step starts.
const moment = (name: string, done: number[] = [3, 4]): Scene => ({
  name,
  length: 6,
  steps: [{ title: name, at: 2, actions: done, began: done.map((at, i) => ({ action: i ? "click button “Update”" : "type textbox “Card prefix”", at: at - 0.5 })) }],
  recording: `${name.toLowerCase().replace(/\W+/g, "-")}.json`,
  person: "Maja",
  from: 2,
});
const PREFIX = moment("Cards now say WEB-1");
const STILL = moment("Sam can't change the prefix", []);

const handBack = async (reviews: Reviews, scenes: Scene[], replies: Round["replies"] = []) => {
  const number = roundInProgress(await reviews.get(CHANGE));
  await reviews.saveRound(CHANGE, { number, by: "Claude Code", scenes, replies, accounts: {} });
  await reviews.finish(CHANGE, number);
  return number;
};

let clock = Date.parse("2026-11-14T09:00:00Z");
const said = (round: number, parts: Partial<Send>): Send => ({ id: newId(), round, by: "Ludwig", sent: new Date((clock += 1000)).toISOString(), notes: [], verdicts: [], looksGood: [], ...parts });
const onThing = (words: string, scene = PREFIX.name): Note => ({ id: newId(), words, on: { scene, at: 5, element: { role: "textbox", name: "Card prefix" } } });
const done = (round: number, scenes: Scene[]) => said(round, { looksGood: scenes.map((scene) => scene.name) });

async function named() {
  const reviews = new Reviews(memory());
  await reviews.start(CHANGE, "Change the card prefix", "Let a workspace admin change the card prefix.");
  return reviews;
}

async function handedBack() {
  const reviews = await named();
  await handBack(reviews, [PREFIX, STILL]);
  return reviews;
}

describe("the loop", () => {
  test("a change is named by its title, with what was asked in the person's words, and has nothing handed back yet", async () => {
    const review = await (await named()).get(CHANGE);
    assert.deepEqual([review.title, review.asked, review.rounds], ["Change the card prefix", "Let a workspace admin change the card prefix.", []]);
  });

  test("a moment kept is the person's only once it's handed back, and then never changes", async () => {
    const reviews = await named();
    await reviews.saveRound(CHANGE, { number: 1, by: "Claude Code", scenes: [PREFIX], replies: [], accounts: {} });
    await assert.rejects(reviews.send(CHANGE, said(1, { notes: [onThing("Hm")] })), /isn't finished/);
    await reviews.finish(CHANGE, 1);
    const [round] = (await reviews.get(CHANGE)).rounds;
    assert.deepEqual([round?.scenes, !!round?.finished], [[PREFIX], true]);
    await assert.rejects(reviews.saveRound(CHANGE, { ...round!, scenes: [] }), /Round 1 is finished/);
  });

  test("a still is kept and handed back as any moment is, with nothing done in it", async () => {
    const [round] = (await (await handedBack()).get(CHANGE)).rounds;
    assert.deepEqual(round?.scenes.find((scene) => scene.name === STILL.name)?.steps[0]?.actions, []);
  });

  test("a note on a thing in a moment reaches the agent, who can't hand back again without answering it", async () => {
    const reviews = await handedBack();
    const note = onThing("Say what the prefix is for");
    await reviews.send(CHANGE, said(1, { notes: [note] }));
    assert.deepEqual(waitingForTheAgent(await reviews.get(CHANGE)), [note.id], "waiting before the agent takes it");
    assert.equal((await reviews.take(CHANGE)).length, 1);
    const review = await reviews.get(CHANGE);
    assert.deepEqual(notesToAnswer(review, 2), [note.id]);
    assert.deepEqual(allNotes(review).get(note.id)?.note.on?.element, { role: "textbox", name: "Card prefix" });
    await assert.rejects(handBack(reviews, [PREFIX, STILL]), (error: unknown) => error instanceof Refused && new RegExp(`needs an answer to note ${note.id}, “Say what the prefix is for”`).test(error.message));
  });

  test("a note made after stepping into the app is on that moment, at a time in the person's own recording, however long", async () => {
    const reviews = await handedBack();
    const there: Note = {
      id: newId(),
      words: "The field should turn red too",
      on: { scene: PREFIX.name, at: 47.6, element: { role: "textbox", name: "Card prefix", node: 112 }, app: { from: { scene: PREFIX.name, at: 5 }, did: [{ does: "fill", on: "#prefix", with: "BS-WEB", what: "Card prefix" }], recording: "branches/m4bcdc6n-1.json", length: 52 } },
    };
    await reviews.send(CHANGE, said(1, { notes: [there] }));
    await reviews.take(CHANGE);
    assert.deepEqual(notesToAnswer(await reviews.get(CHANGE), 2), [there.id]);
    const elsewhere = { ...there, id: newId(), on: { ...there.on!, app: { ...there.on!.app!, from: { scene: "Gone", at: 1 } } } };
    await assert.rejects(reviews.send(CHANGE, said(1, { notes: [elsewhere] })), /on the scene “Gone”, which isn't there/);
  });

  test("the agent's reply comes back with the next hand-back, under its name, and the person's reply to it asks again", async () => {
    const reviews = await handedBack();
    const note = onThing("Say what the prefix is for");
    await reviews.send(CHANGE, said(1, { notes: [note] }));
    await reviews.take(CHANGE);
    await handBack(reviews, [PREFIX, STILL], [{ note: note.id, words: "A hint under the field says so now." }]);
    await reviews.send(CHANGE, said(2, { replies: [{ note: note.id, words: "Shorter, please." }] }));
    await reviews.take(CHANGE);
    const review = await reviews.get(CHANGE);
    assert.deepEqual(
      conversation(review, note.id).map(({ by, agent, words }) => [by, agent, words]),
      [
        ["Ludwig", false, "Say what the prefix is for"],
        ["Claude Code", true, "A hint under the field says so now."],
        ["Ludwig", false, "Shorter, please."],
      ],
    );
    assert.deepEqual(notesToAnswer(review, 3), [note.id]);
  });

  test("what the person has opened is kept per moment as handed back, once each, in every browser they look from", async () => {
    const reviews = await handedBack();
    await reviews.see(CHANGE, "Ludwig", [{ round: 1, scene: PREFIX.name }]);
    await reviews.see(CHANGE, "Ludwig", [{ round: 1, scene: PREFIX.name }]);
    assert.deepEqual((await reviews.get(CHANGE)).seen, { Ludwig: [{ round: 1, scene: PREFIX.name }] });
    await assert.rejects(reviews.see(CHANGE, "Ludwig", [{ round: 2, scene: PREFIX.name }]), /Round 2 hands back no “Cards now say WEB-1” to see/);
  });

  test("a moment handed back again is unseen again, and what's different in it since is kept against the hand-back seen", async () => {
    const reviews = await handedBack();
    await reviews.see(CHANGE, "Ludwig", [{ round: 1, scene: PREFIX.name }]);
    await reviews.saveRound(CHANGE, { number: 2, by: "Claude Code", scenes: [PREFIX, STILL], replies: [], accounts: {} });
    const different = { id: "hint", words: "“Use up to 10 letters” is new", seen: [{ scene: PREFIX.name, at: 5 }] };
    await reviews.saveComparison(CHANGE, { round: 2, since: 1, changes: [different] });
    await reviews.finish(CHANGE, 2);
    const review = await reviews.get(CHANGE);
    assert.ok(!review.seen?.Ludwig?.some((seen) => seen.round === 2), "nothing of round 2 is seen yet");
    assert.deepEqual(review.comparisons.find((comparison) => comparison.round === 2 && comparison.since === 1)?.changes, [different]);
  });

  test("what's sent is kept once, as it was sent, and the agent takes it once", async () => {
    const reviews = await handedBack();
    const send = said(1, { notes: [onThing("Hm")] });
    await reviews.send(CHANGE, send);
    await reviews.send(CHANGE, structuredClone(send));
    assert.deepEqual((await reviews.get(CHANGE)).sends, [send]);
    assert.deepEqual(await reviews.take(CHANGE), [send]);
    assert.deepEqual(await reviews.take(CHANGE), []);
  });

  test("Done is the person's latest word saying every moment handed back looks good, and nothing more", async () => {
    const reviews = await handedBack();
    assert.equal(saidDone(await reviews.get(CHANGE)), undefined, "nothing said yet");
    await reviews.send(CHANGE, said(1, { looksGood: [PREFIX.name] }));
    assert.equal(saidDone(await reviews.get(CHANGE)), undefined, "one moment of two isn't Done");
    const doneNow = done(1, [PREFIX, STILL]);
    await reviews.send(CHANGE, doneNow);
    const review = await reviews.get(CHANGE);
    assert.deepEqual(saidDone(review), doneNow);
    assert.deepEqual(saidDone(review, "Ludwig"), doneNow, "and it's theirs");
    assert.equal(saidDone(review, "Ana"), undefined, "nobody else has said it");
  });

  test("a note sent after Done, or the moments handed back anew, opens the change again", async () => {
    const reviews = await handedBack();
    await reviews.send(CHANGE, done(1, [PREFIX, STILL]));
    await reviews.send(CHANGE, said(1, { notes: [onThing("One more thing")] }));
    assert.equal(saidDone(await reviews.get(CHANGE)), undefined, "a note after it");

    const again = await handedBack();
    await again.send(CHANGE, done(1, [PREFIX, STILL]));
    await again.take(CHANGE);
    await handBack(again, [PREFIX, STILL]);
    assert.equal(saidDone(await again.get(CHANGE)), undefined, "handed back since");
  });
});
