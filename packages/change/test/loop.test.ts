// What the loop promises, from a change named to Done, as the store keeps it: what a person and an agent can count on
// whatever page or command they use.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { allNotes, conversation, isStill, memory, newId, notesToAnswer, Refused, Changes, handBackInProgress, saidDone, standingOf, waitingForTheAgent, type Note, type HandBack, type Moment, type Send, type Storage } from "../src/index.ts";

const CHANGE = "change-the-card-prefix";

// A moment: its way there, then what it shows, from where it starts.
const recorded = (name: string, done: number[] = [3, 4]): Moment => ({
  name,
  length: 6,
  actions: done.map((at, i) => ({ at, what: i ? "click button “Update”" : "type textbox “Card prefix”", began: at - 0.5 })),
  recording: `${name.toLowerCase().replace(/\W+/g, "-")}.json`,
  person: "Maja",
  from: 2,
});
const PREFIX = recorded("Cards now say WEB-1");
const STILL = recorded("Sam can't change the prefix", []);

const handsBack = async (changes: Changes, moments: Moment[], replies: HandBack["replies"] = []) => {
  const number = handBackInProgress(await changes.get(CHANGE));
  await changes.saveHandBack(CHANGE, { number, by: "Claude Code", moments, replies });
  await changes.finish(CHANGE, number);
  return number;
};

let clock = Date.parse("2026-11-14T09:00:00Z");
const said = (handBack: number, parts: Partial<Send>): Send => ({ id: newId(), handBack, by: "Ludwig", sent: new Date((clock += 1000)).toISOString(), notes: [], ...parts });
const onThing = (words: string, handBack = 1): Note => ({ id: newId(), words, on: { handBack, moment: PREFIX.name, at: 5, element: { role: "textbox", name: "Card prefix" } } });
const done = (handBack: number) => said(handBack, { done: true });

async function named() {
  const changes = new Changes(memory());
  await changes.start(CHANGE, "Change the card prefix", "Let a workspace admin change the card prefix.");
  return changes;
}

async function handedBack() {
  const changes = await named();
  await handsBack(changes, [PREFIX, STILL]);
  return changes;
}

describe("the loop", () => {
  test("a change is named by its title, with what was asked in the person's words, and has nothing handed back yet", async () => {
    const change = await (await named()).get(CHANGE);
    assert.deepEqual([change.title, change.asked, change.handBacks], ["Change the card prefix", "Let a workspace admin change the card prefix.", []]);
  });

  test("a moment kept is the person's only once it's handed back, and then never changes", async () => {
    const changes = await named();
    await changes.saveHandBack(CHANGE, { number: 1, by: "Claude Code", moments: [PREFIX], replies: [] });
    await assert.rejects(changes.send(CHANGE, said(1, { notes: [onThing("Hm")] })), /isn't finished/);
    await changes.finish(CHANGE, 1);
    const [handBack] = (await changes.get(CHANGE)).handBacks;
    assert.deepEqual([handBack?.moments, !!handBack?.finished], [[PREFIX], true]);
    await assert.rejects(changes.saveHandBack(CHANGE, { ...handBack!, moments: [] }), /Hand-back 1 is finished/);
  });

  test("a moment always has where it starts, the one value everything that shows it reads", async () => {
    const changes = await named();
    const startless = { ...PREFIX, from: undefined } as unknown as Moment;
    await assert.rejects(changes.saveHandBack(CHANGE, { number: 1, by: "Claude Code", moments: [startless], replies: [] }), /the moment “Cards now say WEB-1” needs where the moment starts, in seconds/);
    assert.equal(isStill(STILL), true, "nothing done from its start: a still");
    assert.equal(isStill(PREFIX), false);
  });

  test("a still is kept and handed back as any moment is, with nothing done in it", async () => {
    const [handBack] = (await (await handedBack()).get(CHANGE)).handBacks;
    assert.deepEqual(handBack?.moments.find((moment) => moment.name === STILL.name)?.actions, []);
  });

  test("a note on a thing in a moment reaches the agent, who can't hand back again without answering it", async () => {
    const changes = await handedBack();
    const note = onThing("Say what the prefix is for");
    await changes.send(CHANGE, said(1, { notes: [note] }));
    assert.deepEqual(waitingForTheAgent(await changes.get(CHANGE)), [note.id], "waiting before the agent takes it");
    assert.equal((await changes.take(CHANGE)).length, 1);
    const change = await changes.get(CHANGE);
    assert.deepEqual(notesToAnswer(change, 2), [note.id]);
    assert.deepEqual(allNotes(change).get(note.id)?.note.on, { handBack: 1, moment: PREFIX.name, at: 5, element: { role: "textbox", name: "Card prefix" } }, "on that moment as handed back");
    await assert.rejects(handsBack(changes, [PREFIX, STILL]), (error: unknown) => error instanceof Refused && new RegExp(`needs an answer to note ${note.id}, “Say what the prefix is for”`).test(error.message));
  });

  test("a note made after taking over the app is on that moment, at a time in the person's own recording, however long", async () => {
    const changes = await handedBack();
    const there: Note = {
      id: newId(),
      words: "The field should turn red too",
      on: { handBack: 1, moment: PREFIX.name, steppedIn: 5, did: [{ does: "fill", on: "#prefix", with: "BS-WEB", what: "Card prefix" }], recording: "branches/m4bcdc6n-1.json", length: 52, at: 47.6, element: { role: "textbox", name: "Card prefix", node: 112 } },
    };
    await changes.send(CHANGE, said(1, { notes: [there] }));
    await changes.take(CHANGE);
    const change = await changes.get(CHANGE);
    assert.deepEqual(notesToAnswer(change, 2), [there.id]);
    assert.equal(allNotes(change).get(there.id)?.note.on?.moment, PREFIX.name, "on the moment it was taken over");
    const elsewhere = (on: Partial<Extract<Note["on"], { steppedIn: number }>>) => ({ ...there, id: newId(), on: { ...(there.on as Extract<Note["on"], { steppedIn: number }>), ...on } });
    await assert.rejects(changes.send(CHANGE, said(1, { notes: [elsewhere({ moment: "Gone" })] })), /on the moment “Gone”, which isn't there/);
    await assert.rejects(changes.send(CHANGE, said(1, { notes: [elsewhere({ steppedIn: 9 })] })), /s take-over is at 9s, but “Cards now say WEB-1” is 6s long/);
    await assert.rejects(changes.send(CHANGE, said(1, { notes: [elsewhere({ at: 60 })] })), /is at 60s, but the person's own recording is 52s long/);
    await assert.rejects(changes.send(CHANGE, said(1, { notes: [elsewhere({ recording: "cards.json" })] })), /its recording is one of the person's own/);
  });

  test("a note is on a moment as handed back or made in the app, never both, and on a hand-back the person has", async () => {
    const changes = await handedBack();
    const both = { ...onThing("Hm"), on: { ...onThing("Hm").on!, steppedIn: 1 } } as unknown as Note;
    await assert.rejects(changes.send(CHANGE, said(1, { notes: [both] })), /has “steppedIn”, which isn't one of its fields/);
    await assert.rejects(changes.send(CHANGE, said(1, { notes: [onThing("Hm", 2)] })), /is on hand-back 2, which hasn't been handed back/);
  });

  test("the agent's reply comes back with the next hand-back, under its name, and the person's reply to it asks again", async () => {
    const changes = await handedBack();
    const note = onThing("Say what the prefix is for");
    await changes.send(CHANGE, said(1, { notes: [note] }));
    await changes.take(CHANGE);
    await handsBack(changes, [PREFIX, STILL], [{ note: note.id, words: "A hint under the field says so now." }]);
    await changes.send(CHANGE, said(2, { replies: [{ note: note.id, words: "Shorter, please." }] }));
    await changes.take(CHANGE);
    const change = await changes.get(CHANGE);
    assert.deepEqual(
      conversation(change, note.id).map(({ by, agent, words }) => [by, agent, words]),
      [
        ["Ludwig", false, "Say what the prefix is for"],
        ["Claude Code", true, "A hint under the field says so now."],
        ["Ludwig", false, "Shorter, please."],
      ],
    );
    assert.deepEqual(notesToAnswer(change, 3), [note.id]);
  });

  test("what the person has opened is kept per moment as handed back, once each, in every browser they look from", async () => {
    const changes = await handedBack();
    await changes.see(CHANGE, "Ludwig", [{ handBack: 1, moment: PREFIX.name }]);
    await changes.see(CHANGE, "Ludwig", [{ handBack: 1, moment: PREFIX.name }]);
    assert.deepEqual((await changes.get(CHANGE)).seen, { Ludwig: [{ handBack: 1, moment: PREFIX.name }] });
    await assert.rejects(changes.see(CHANGE, "Ludwig", [{ handBack: 2, moment: PREFIX.name }]), /Hand-back 2 hands back no “Cards now say WEB-1” to see/);
  });

  test("a moment handed back again is unseen again, and what's different in it since is kept against the hand-back seen", async () => {
    const changes = await handedBack();
    await changes.see(CHANGE, "Ludwig", [{ handBack: 1, moment: PREFIX.name }]);
    await changes.saveHandBack(CHANGE, { number: 2, by: "Claude Code", moments: [PREFIX, STILL], replies: [] });
    const different = { id: "hint", words: "“Use up to 10 letters” is new", seen: [{ moment: PREFIX.name, at: 5 }] };
    await changes.saveComparison(CHANGE, { handBack: 2, since: 1, findings: [different] });
    await changes.finish(CHANGE, 2);
    const change = await changes.get(CHANGE);
    assert.ok(!change.seen?.Ludwig?.some((seen) => seen.handBack === 2), "nothing of hand-back 2 is seen yet");
    assert.deepEqual(change.comparisons.find((comparison) => comparison.handBack === 2 && comparison.since === 1)?.findings, [different]);
  });

  test("what's sent is kept once, as it was sent, and the agent takes it once", async () => {
    const changes = await handedBack();
    const send = said(1, { notes: [onThing("Hm")] });
    await changes.send(CHANGE, send);
    await changes.send(CHANGE, structuredClone(send));
    assert.deepEqual((await changes.get(CHANGE)).sends, [send]);
    assert.deepEqual(await changes.take(CHANGE), [send]);
    assert.deepEqual(await changes.take(CHANGE), []);
  });

  test("Done is kept as the person said it, their latest word on the moments as last handed back, and says nothing more", async () => {
    const changes = await handedBack();
    assert.equal(saidDone(await changes.get(CHANGE)), undefined, "nothing said yet");
    await changes.send(CHANGE, said(1, { notes: [onThing("Hm")] }));
    assert.equal(saidDone(await changes.get(CHANGE)), undefined, "a note isn't Done");
    await assert.rejects(changes.send(CHANGE, said(1, { done: true, notes: [onThing("And this")] })), /Done says every moment looks good, and nothing more/);
    const doneNow = done(1);
    await changes.send(CHANGE, doneNow);
    const change = await changes.get(CHANGE);
    assert.deepEqual(saidDone(change), doneNow);
    assert.deepEqual(saidDone(change, "Ludwig"), doneNow, "and it's theirs");
    assert.equal(saidDone(change, "Ana"), undefined, "nobody else has said it");
    assert.deepEqual([standingOf(change, "Ludwig"), standingOf(change, "Ana")], [{ is: "done", at: doneNow.sent }, { is: "waiting" }], "and the change stands done for them");
  });

  test("a note sent after Done, or the moments handed back anew, opens the change again", async () => {
    const changes = await handedBack();
    await changes.send(CHANGE, done(1));
    await changes.send(CHANGE, said(1, { notes: [onThing("One more thing")] }));
    assert.equal(saidDone(await changes.get(CHANGE)), undefined, "a note after it");

    const again = await handedBack();
    await again.send(CHANGE, done(1));
    await again.take(CHANGE);
    await handsBack(again, [PREFIX, STILL]);
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
  // Ending on a page a link brought it to, with nothing done there: shown as a still. Kept as a scene of a round, with
  // what it did as its one step.
  const began = [{ action: "click link “Settings”", at: 2.5 }, { action: "click link “Workspace”", at: 3.5 }];
  const older = { name: PREFIX.name, length: 6, steps: [{ title: PREFIX.name, at: 0, actions: [3, 4], began }], recording: PREFIX.recording, person: "Maja" };
  await write("review.json", { format: 1, id: CHANGE, title: "Change the card prefix", started: "2026-11-12T09:00:00.000Z" });
  await write("rounds/1/round.json", { number: 1, by: "Agent", scenes: [older], replies: [], finished: "2026-11-12T10:00:00.000Z", accounts: {} });
  await write("rounds/1/files/cards-now-say-web-1.json", "[]");
  await write("scenes/cards-now-say-web-1.ts", OLDER_WAY);
  const app = { from: { scene: PREFIX.name, at: 5 }, did: [], recording: "branches/k33p-1.json", length: 9 };
  await write("sends/n0tes.json", { id: "n0tes", round: 1, by: "Ludwig", sent: "2026-11-12T10:30:00.000Z", notes: [
    { id: "0nit", words: "Hm", on: { scene: PREFIX.name, at: 5, element: { role: "textbox", name: "Card prefix", node: 7 } } },
    { id: "1napp", words: "And here", on: { scene: PREFIX.name, at: 8.5, point: { x: 0.5, y: 0.5 }, app } },
  ], verdicts: [], looksGood: [] });
  await write("sends/d0ne.json", { id: "d0ne", round: 1, by: "Ludwig", sent: "2026-11-12T11:00:00.000Z", notes: [], looksGood: [PREFIX.name] });
  await write("taken.json", [{ send: "n0tes", round: 2, at: "2026-11-12T10:31:00.000Z" }]);
  await write("seen.json", { Ludwig: [{ round: 1, scene: PREFIX.name }] });
}
const text = async (storage: Storage, path: string) => new TextDecoder().decode((await storage.read(`${CHANGE}/${path}`))!);
// Every file kept under a folder, by its path.
async function everything(storage: Storage, folder: string): Promise<string[]> {
  const inside = await storage.list(folder);
  if (!inside.length) return [folder];
  return (await Promise.all(inside.map((name) => everything(storage, `${folder}/${name}`)))).flat().sort();
}

describe("a change kept the older way", () => {
  test("reads once it's been brought along, as it showed: each moment with where it starts and what it did as one list, its way before its step, everything kept by its name now", async () => {
    const storage = memory();
    await keptTheOlderWay(storage);
    const change = await new Changes(storage).get(CHANGE);
    assert.equal(change.handBacks[0]?.moments[0]?.from, 4.5, "a still, where its end holds");
    assert.match(await text(storage, "moments/cards-now-say-web-1.ts"), /click\(\);\n {2}await test\.step\("Cards now say WEB-1", async \(\) => \{\n {4}await expect/);
    assert.equal(saidDone(change)?.id, "d0ne", "Done said by naming every moment is Done");
    assert.deepEqual(
      change.sends[0]?.notes.map((note) => note.on),
      [
        { handBack: 1, moment: PREFIX.name, at: 5, element: { role: "textbox", name: "Card prefix", node: 7 } },
        { handBack: 1, moment: PREFIX.name, steppedIn: 5, did: [], recording: "branches/k33p-1.json", length: 9, at: 8.5, point: { x: 0.5, y: 0.5 } },
      ],
      "each note on the moment it was on, with its thing, on the hand-back it was sent on or in the app",
    );
    assert.deepEqual(JSON.parse(await text(storage, "sends/d0ne.json")), { id: "d0ne", handBack: 1, by: "Ludwig", sent: "2026-11-12T11:00:00.000Z", notes: [], done: true }, "and says nothing else");
    assert.equal("accounts" in JSON.parse(await text(storage, "hand-backs/1/hand-back.json")), false, "what nothing reads is left behind");
    assert.deepEqual(change.handBacks[0]?.moments[0]?.actions, [{ at: 3, what: "click link “Settings”", began: 2.5 }, { at: 4, what: "click link “Workspace”", began: 3.5 }], "what it did, one list");
    assert.deepEqual([change.taken, change.seen], [[{ send: "n0tes", handBack: 2, at: "2026-11-12T10:31:00.000Z" }], { Ludwig: [{ handBack: 1, moment: PREFIX.name }] }]);
    assert.equal(await text(storage, "hand-backs/1/files/cards-now-say-web-1.json"), "[]", "its recordings where its hand-back is");
    assert.deepEqual((await storage.list(CHANGE)).sort(), ["change.json", "hand-backs", "moments", "seen.json", "sends", "taken.json"]);
    assert.deepEqual([await storage.read(`${CHANGE}/review.json`), await storage.read(`${CHANGE}/rounds/1/round.json`), (await storage.list(`${CHANGE}/scenes`)).length], [undefined, undefined, 0], "nothing left by its older names");
    assert.equal(JSON.parse(await text(storage, "change.json")).format, 3);
  });

  test("is brought along once: read again, by this or another reader, nothing is written", async () => {
    const storage = memory();
    await keptTheOlderWay(storage);
    await new Changes(storage).get(CHANGE);
    const writes: string[] = [];
    const watched: Storage = { ...storage, write: (path, bytes) => (writes.push(path), storage.write(path, bytes)) };
    const changes = new Changes(watched);
    await Promise.all([changes.get(CHANGE), changes.get(CHANGE), new Changes(watched).get(CHANGE)]);
    assert.deepEqual(writes, []);
  });

  test("stopped half-way, anywhere, files and folders moved or not, it's brought along from where it is the next time it's read, to the same", async () => {
    const whole = memory();
    await keptTheOlderWay(whole);
    let steps = 0;
    const counted: Storage = { ...whole, write: (path, bytes) => (steps++, whole.write(path, bytes)), move: (from, to) => (steps++, whole.move(from, to)) };
    const once = await new Changes(counted).get(CHANGE);
    const each = async (storage: Storage) => Object.fromEntries(await Promise.all((await everything(storage, CHANGE)).map(async (path) => [path, await text(storage, path.slice(CHANGE.length + 1))])));

    for (let stop = 0; stop < steps; stop++) {
      const storage = memory();
      await keptTheOlderWay(storage);
      let left = stop;
      const go = () => (left-- > 0 ? Promise.resolve() : Promise.reject(new Error("stopped")));
      const stopping: Storage = { ...storage, write: (path, bytes) => go().then(() => storage.write(path, bytes)), move: (from, to) => go().then(() => storage.move(from, to)) };
      await assert.rejects(new Changes(stopping).get(CHANGE), /stopped/);
      assert.deepEqual(await new Changes(storage).get(CHANGE), once, `stopped after ${stop} of ${steps}`);
      assert.deepEqual(await each(storage), await each(whole), `and kept the same, stopped after ${stop}`);
    }
  });

  test("one kept by a newer Playthrough isn't read, and says what to do", async () => {
    const storage = memory();
    await keptTheOlderWay(storage);
    await storage.write(`${CHANGE}/review.json`, new TextEncoder().encode(JSON.stringify({ format: 4, id: CHANGE, title: "Change the card prefix", started: "2026-11-12T09:00:00.000Z" })));
    await assert.rejects(new Changes(storage).get(CHANGE), /kept by a newer Playthrough \(its format is 4; this one reads 3\)\. Update Playthrough/);
  });
});
