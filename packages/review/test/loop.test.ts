// What the loop promises, from a change named to Done, as the store keeps it: what a person and an agent can count on
// whatever page or command they use. A change is kept as a review, a moment as a scene with one step, a hand-back as a
// round.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { allNotes, conversation, memory, newId, notesToAnswer, Refused, Reviews, roundInProgress, saidDone, standingOf, waitingForTheAgent, type Note, type Round, type Scene, type Send, type Storage } from "../src/index.ts";

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
  await reviews.saveRound(CHANGE, { number, by: "Claude Code", scenes, replies });
  await reviews.finish(CHANGE, number);
  return number;
};

let clock = Date.parse("2026-11-14T09:00:00Z");
const said = (round: number, parts: Partial<Send>): Send => ({ id: newId(), round, by: "Ludwig", sent: new Date((clock += 1000)).toISOString(), notes: [], ...parts });
const onThing = (words: string, scene = PREFIX.name): Note => ({ id: newId(), words, on: { scene, at: 5, element: { role: "textbox", name: "Card prefix" } } });
const done = (round: number) => said(round, { done: true });

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
    await reviews.saveRound(CHANGE, { number: 1, by: "Claude Code", scenes: [PREFIX], replies: [] });
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
    await reviews.saveRound(CHANGE, { number: 2, by: "Claude Code", scenes: [PREFIX, STILL], replies: [] });
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

  test("Done is kept as the person said it, their latest word on the moments as last handed back, and says nothing more", async () => {
    const reviews = await handedBack();
    assert.equal(saidDone(await reviews.get(CHANGE)), undefined, "nothing said yet");
    await reviews.send(CHANGE, said(1, { notes: [onThing("Hm")] }));
    assert.equal(saidDone(await reviews.get(CHANGE)), undefined, "a note isn't Done");
    await assert.rejects(reviews.send(CHANGE, said(1, { done: true, notes: [onThing("And this")] })), /Done says every moment looks good, and nothing more/);
    const doneNow = done(1);
    await reviews.send(CHANGE, doneNow);
    const review = await reviews.get(CHANGE);
    assert.deepEqual(saidDone(review), doneNow);
    assert.deepEqual(saidDone(review, "Ludwig"), doneNow, "and it's theirs");
    assert.equal(saidDone(review, "Ana"), undefined, "nobody else has said it");
    assert.deepEqual([standingOf(review, "Ludwig"), standingOf(review, "Ana")], [{ is: "done", at: doneNow.sent }, { is: "waiting" }], "and the change stands done for them");
  });

  test("a note sent after Done, or the moments handed back anew, opens the change again", async () => {
    const reviews = await handedBack();
    await reviews.send(CHANGE, done(1));
    await reviews.send(CHANGE, said(1, { notes: [onThing("One more thing")] }));
    assert.equal(saidDone(await reviews.get(CHANGE)), undefined, "a note after it");

    const again = await handedBack();
    await again.send(CHANGE, done(1));
    await again.take(CHANGE);
    await handBack(again, [PREFIX, STILL]);
    assert.equal(saidDone(await again.get(CHANGE)), undefined, "handed back since");
  });
});

// A change as an older Playthrough kept it: format 1, its moments without a start, each way doing everything in its step.
const OLDER_WAY = `import { expect, test } from "playthrough/test";

test("Cards now say WEB-1", async ({ page, setup, baseURL }) => {
  await test.step("Cards now say WEB-1", async () => {
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByRole("link", { name: "Workspace", exact: true }).click();
    await expect(page.getByText("WEB-1", { exact: true })).toBeVisible();
  });
});
`;
async function keptTheOlderWay(storage: Storage) {
  const write = (path: string, value: unknown) => storage.write(`${CHANGE}/${path}`, new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)));
  // Ending on a page a link brought it to, with nothing done there: shown as a still.
  const began = [{ action: "click link “Settings”", at: 2.5 }, { action: "click link “Workspace”", at: 3.5 }];
  const older = { ...PREFIX, steps: [{ ...PREFIX.steps[0]!, at: 0, began }], from: undefined };
  await write("review.json", { format: 1, id: CHANGE, title: "Change the card prefix", started: "2026-11-12T09:00:00.000Z" });
  await write("rounds/1/round.json", { number: 1, by: "Agent", scenes: [older], replies: [], finished: "2026-11-12T10:00:00.000Z" });
  await write("scenes/cards-now-say-web-1.ts", OLDER_WAY);
  await write("sends/d0ne.json", { id: "d0ne", round: 1, by: "Ludwig", sent: "2026-11-12T11:00:00.000Z", notes: [], looksGood: [PREFIX.name] });
}
const text = async (storage: Storage, path: string) => new TextDecoder().decode((await storage.read(`${CHANGE}/${path}`))!);

describe("a change kept the older way", () => {
  test("reads once it's been brought along, as it showed: each moment with where it starts, its way before its step", async () => {
    const storage = memory();
    await keptTheOlderWay(storage);
    const review = await new Reviews(storage).get(CHANGE);
    assert.equal(review.rounds[0]?.scenes[0]?.from, 4.5, "a still, where its end holds");
    assert.match(await text(storage, "scenes/cards-now-say-web-1.ts"), /click\(\);\n {2}await test\.step\("Cards now say WEB-1", async \(\) => \{\n {4}await expect/);
    assert.equal(saidDone(review)?.id, "d0ne", "Done said by naming every moment is Done");
    assert.deepEqual(JSON.parse(await text(storage, "sends/d0ne.json")), { id: "d0ne", round: 1, by: "Ludwig", sent: "2026-11-12T11:00:00.000Z", notes: [], done: true }, "and says nothing else");
    assert.equal("accounts" in JSON.parse(await text(storage, "rounds/1/round.json")), false, "what nothing reads is left behind");
    assert.equal(JSON.parse(await text(storage, "review.json")).format, 2);
  });

  test("is brought along once: read again, by this or another reader, nothing is written", async () => {
    const storage = memory();
    await keptTheOlderWay(storage);
    await new Reviews(storage).get(CHANGE);
    const writes: string[] = [];
    const watched: Storage = { ...storage, write: (path, bytes) => (writes.push(path), storage.write(path, bytes)) };
    const reviews = new Reviews(watched);
    await Promise.all([reviews.get(CHANGE), reviews.get(CHANGE), new Reviews(watched).get(CHANGE)]);
    assert.deepEqual(writes, []);
  });

  test("stopped half-way, it's brought along from where it is the next time it's read, to the same", async () => {
    const whole = memory();
    await keptTheOlderWay(whole);
    const once = await new Reviews(whole).get(CHANGE);

    const storage = memory();
    await keptTheOlderWay(storage);
    let left = 1;
    const stopping: Storage = { ...storage, write: async (path, bytes) => (left-- > 0 ? storage.write(path, bytes) : Promise.reject(new Error("stopped"))) };
    await assert.rejects(new Reviews(stopping).get(CHANGE), /stopped/);
    assert.equal(JSON.parse(await text(storage, "review.json")).format, 1, "still says it's older");
    assert.deepEqual(await new Reviews(storage).get(CHANGE), once);
    assert.equal(await text(storage, "scenes/cards-now-say-web-1.ts"), await text(whole, "scenes/cards-now-say-web-1.ts"));
  });

  test("one kept by a newer Playthrough isn't read, and says what to do", async () => {
    const storage = memory();
    await keptTheOlderWay(storage);
    await storage.write(`${CHANGE}/review.json`, new TextEncoder().encode(JSON.stringify({ format: 3, id: CHANGE, title: "Change the card prefix", started: "2026-11-12T09:00:00.000Z" })));
    await assert.rejects(new Reviews(storage).get(CHANGE), /kept by a newer Playthrough \(its format is 3; this one reads 2\)\. Update Playthrough/);
  });
});
