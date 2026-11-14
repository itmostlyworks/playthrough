// What every store promises. Each storage runs the same tests: a hosted one will have to pass them too.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { folder } from "../src/folder.ts";
import { conversation, memory, newId, Refused, Changes, type Finding, type Scene, type Round, type Send, type Storage } from "../src/index.ts";

const folders: string[] = [];
after(() => Promise.all(folders.map((path) => rm(path, { recursive: true }))));

const storages: [string, () => Promise<Storage>][] = [
  ["in memory", async () => memory()],
  ["in a folder", async () => folder(folders[folders.push(await mkdtemp(join(tmpdir(), "playthrough-"))) - 1] ?? "")],
];

const scene = (name: string, length = 6): Scene => ({
  name,
  length,
  steps: [
    { title: "Open the invoices", at: 0 },
    { title: "Export the quarter", at: 2 },
  ],
  recording: `${name.toLowerCase().replaceAll(" ", "-")}.json`,
  from: 2,
});

const round = (number: number, parts: Partial<Round> = {}): Round => ({
  number,
  by: "Claude Code",
  scenes: [scene("Export a quarter"), scene("Cancel halfway")],
  replies: [],
  ...parts,
});

const finding = (id: string, words: string, at = 2, scene = "Export a quarter"): Finding => ({ id, words, seen: [{ scene, at }] });

let clock = Date.parse("2026-10-22T09:00:00Z");
const send = (round: number, parts: Partial<Send> = {}): Send => ({
  id: newId(),
  round,
  by: "Ana",
  sent: new Date((clock += 1000)).toISOString(),
  notes: [],
  ...parts,
});

const note = (words: string, at = 3, round = 1) => ({ id: newId(), on: { round, scene: "Export a quarter", at }, words });

const refused = (pattern: RegExp) => (error: unknown) => {
  assert.ok(error instanceof Refused, `expected a refusal, got ${error}`);
  assert.match(error.message, pattern);
  return true;
};

for (const [kept, storage] of storages) {
  describe(`Changes kept ${kept}`, () => {
    // A change with its first round handed back, ready for notes.
    async function recorded() {
      const changes = new Changes(await storage());
      await changes.start("invoice-export", "Export a quarter's invoices as a CSV");
      await changes.saveRound("invoice-export", round(1));
      await changes.finish("invoice-export", 1);
      return changes;
    }

    // The agent took a note on round 1 and is working on round 2.
    async function working(words = "The dialog snaps in.") {
      const changes = await recorded();
      const asked = note(words);
      await changes.send("invoice-export", send(1, { notes: [asked] }));
      await changes.take("invoice-export");
      return { changes, asked };
    }

    test("a change starts with its title, what was asked, and nothing recorded", async () => {
      const changes = new Changes(await storage());
      const asked = "Can I get last quarter's invoices out as a spreadsheet?";
      const change = await changes.start("invoice-export", "Export a quarter's invoices as a CSV", asked);
      assert.deepEqual([change.title, change.asked], ["Export a quarter's invoices as a CSV", asked]);
      assert.equal((await changes.get("invoice-export")).asked, asked);
      assert.deepEqual([change.rounds, change.sends, change.taken], [[], [], []]);
      assert.deepEqual(await changes.list(), ["invoice-export"]);
    });

    test("a change's id is lowercase words joined by dashes, and only one change has it", async () => {
      const changes = new Changes(await storage());
      await assert.rejects(changes.start("../Export", "A title"), refused(/lowercase words joined by dashes/));
      await assert.rejects(changes.get("../elsewhere"), refused(/lowercase words joined by dashes/));
      await changes.start("invoice-export", "A title");
      await assert.rejects(changes.start("invoice-export", "Another"), refused(/already a change called/));
    });

    test("asked for a change that isn't there, it says which are", async () => {
      const changes = new Changes(await storage());
      await changes.start("invoice-export", "A title");
      await assert.rejects(changes.get("invoice-exports"), refused(/^There's no change called “invoice-exports”\. The changes here: “invoice-export”\.$/));
    });

    test("the first round is 1, and each after it the next", async () => {
      const changes = new Changes(await storage());
      await changes.start("invoice-export", "A title");
      await assert.rejects(changes.saveRound("invoice-export", round(2)), refused(/^Round 2 can't be recorded yet: the round being worked on is 1\.$/));
      await assert.rejects(changes.saveRound("invoice-export", round(0)), Refused);
      await changes.saveRound("invoice-export", round(1));
      await changes.finish("invoice-export", 1);
      assert.equal((await changes.get("invoice-export")).rounds[0]?.number, 1);
    });

    test("a round is compared only with a round before it", async () => {
      const changes = new Changes(await storage());
      await changes.start("invoice-export", "A title");
      await changes.saveRound("invoice-export", round(1));
      await assert.rejects(changes.saveComparison("invoice-export", { round: 1, since: 1, changes: [] }), refused(/only compared with a round before it/));
      await assert.rejects(changes.saveComparison("invoice-export", { round: 1, since: 0, changes: [] }), refused(/needs the round it's compared with, from 1/));
    });

    test("what a round is compared with is kept until the round is finished, then it never changes", async () => {
      const changes = await recorded();
      await changes.saveRound("invoice-export", round(2));
      await changes.saveComparison("invoice-export", { round: 2, since: 1, changes: [finding("c2", "Moved down")] });
      assert.deepEqual((await changes.get("invoice-export")).comparisons.map(({ round, since }) => [round, since]), [[2, 1]]);
      await changes.saveComparison("invoice-export", { round: 2, since: 1, changes: [] });
      assert.deepEqual((await changes.get("invoice-export")).comparisons.at(-1)?.changes, []);
      await changes.finish("invoice-export", 2);
      await assert.rejects(changes.saveComparison("invoice-export", { round: 2, since: 1, changes: [] }), refused(/Round 2 is finished/));
    });

    test("a round can be saved as often as needed until it's finished, then it never changes", async () => {
      const changes = await recorded();
      await changes.saveRound("invoice-export", round(2, { scenes: [scene("Export a quarter")] }));
      await changes.saveRound("invoice-export", round(2));
      assert.equal((await changes.get("invoice-export")).rounds[1]?.scenes.length, 2);
      await changes.finish("invoice-export", 2);
      await assert.rejects(changes.saveRound("invoice-export", round(2)), refused(/Round 2 is finished/));
      await assert.rejects(changes.saveRound("invoice-export", round(4)), refused(/being worked on is 3/));
    });

    test("finishing twice is the same as finishing once", async () => {
      const changes = await recorded();
      const finished = (await changes.get("invoice-export")).rounds[1]?.finished;
      await changes.finish("invoice-export", 1);
      assert.equal((await changes.get("invoice-export")).rounds[1]?.finished, finished);
    });

    test("what each person has opened is kept with the change, once each, and only moments handed back", async () => {
      const changes = await recorded();
      await changes.see("invoice-export", "Ana", [{ round: 1, scene: "Export a quarter" }]);
      await changes.see("invoice-export", "Ana", [{ round: 1, scene: "Export a quarter" }, { round: 1, scene: "Cancel halfway" }]);
      await changes.see("invoice-export", "Ben", [{ round: 1, scene: "Cancel halfway" }]);
      assert.deepEqual((await changes.get("invoice-export")).seen, {
        Ana: [{ round: 1, scene: "Export a quarter" }, { round: 1, scene: "Cancel halfway" }],
        Ben: [{ round: 1, scene: "Cancel halfway" }],
      });
      await changes.saveRound("invoice-export", round(2));
      await assert.rejects(changes.see("invoice-export", "Ana", [{ round: 2, scene: "Export a quarter" }]), refused(/^Round 2 hands back no “Export a quarter” to see\.$/));
    });

    test("a round compared at all is compared with every round before it before it's handed back", async () => {
      const changes = await recorded();
      await changes.saveRound("invoice-export", round(2));
      await changes.finish("invoice-export", 2);
      await changes.saveRound("invoice-export", round(3));
      await changes.saveComparison("invoice-export", { round: 3, since: 2, changes: [] });
      await assert.rejects(changes.finish("invoice-export", 3), refused(/^Round 3 isn't compared with round 1 yet, so it can't be handed back\. Run every moment again\.$/));
      await changes.saveComparison("invoice-export", { round: 3, since: 1, changes: [finding("c1", "“Export” button is new")] });
      await changes.finish("invoice-export", 3);
    });

    test("a scene that's gone is a change with no moment, on the earlier round's scene", async () => {
      const changes = await recorded();
      await changes.saveRound("invoice-export", round(2, { scenes: [scene("Export a quarter")] }));
      const gone = { id: "c2", words: "No longer recorded", seen: [{ scene: "Cancel halfway" }] };
      await changes.saveComparison("invoice-export", { round: 2, since: 1, changes: [gone] });
      const late = { ...gone, seen: [{ scene: "Cancel halfway", at: 1 }] };
      await assert.rejects(changes.saveComparison("invoice-export", { round: 2, since: 1, changes: [late] }), refused(/isn't there/));
    });

    test("notes go only on rounds handed back", async () => {
      const changes = new Changes(await storage());
      await changes.start("invoice-export", "A title");
      await changes.saveRound("invoice-export", round(1));
      await assert.rejects(changes.send("invoice-export", send(1, { notes: [note("Hm")] })), refused(/isn't finished/));
      await assert.rejects(changes.send("invoice-export", send(0, { notes: [note("Hm")] })), Refused);
    });

    test("a note's place is on a scene in its round, at a moment within it", async () => {
      const changes = await recorded();
      const elsewhere = { id: newId(), on: { round: 1, scene: "Pay an invoice", at: 1 }, words: "Hm" };
      await assert.rejects(changes.send("invoice-export", send(1, { notes: [elsewhere] })), refused(/“Pay an invoice”, which isn't there/));
      await assert.rejects(changes.send("invoice-export", send(1, { notes: [note("Hm", 9)] })), refused(/is at 9s, but “Export a quarter” is 6s long/));
      const twice = { ...note("Hm"), on: { round: 1, scene: "Export a quarter", at: 1, point: { x: 0.5, y: 0.5 }, box: { x: 0, y: 0, width: 1, height: 1 } } };
      await assert.rejects(changes.send("invoice-export", send(1, { notes: [twice] })), refused(/more than one thing/));
    });

    test("a round can't finish until every note it took is answered", async () => {
      const { changes, asked } = await working();
      await changes.saveRound("invoice-export", round(2));
      await assert.rejects(changes.finish("invoice-export", 2), refused(new RegExp(`answer to note ${asked.id}, “The dialog snaps in.”`)));
      await changes.saveRound("invoice-export", round(2, { replies: [{ note: asked.id, words: "It fades in now, like the other dialogs." }] }));
      await changes.finish("invoice-export", 2);
    });

    test("a person's reply to an answer asks the agent again, whoever sends it", async () => {
      const { changes, asked } = await working();
      await changes.saveRound("invoice-export", round(2, { replies: [{ note: asked.id, words: "It fades in now." }] }));
      await changes.finish("invoice-export", 2);

      await changes.send("invoice-export", send(2, { by: "Ben", replies: [{ note: asked.id, words: "Now it's too slow." }] }));
      await changes.take("invoice-export");
      await changes.saveRound("invoice-export", round(3));
      await assert.rejects(changes.finish("invoice-export", 3), refused(/needs an answer/));
      await changes.saveRound("invoice-export", round(3, { replies: [{ note: asked.id, words: "Faster now." }] }));
      await changes.finish("invoice-export", 3);
    });

    test("a note's conversation reads in order: the note, then each round's reply by the agent that recorded it, and what people said", async () => {
      const { changes, asked } = await working();
      await changes.saveRound("invoice-export", round(2, { by: "Codex", replies: [{ note: asked.id, words: "It fades in now." }] }));
      await changes.finish("invoice-export", 2);
      await changes.send("invoice-export", send(2, { replies: [{ note: asked.id, words: "Now it's too slow." }] }));

      assert.deepEqual(conversation(await changes.get("invoice-export"), asked.id), [
        { by: "Ana", agent: false, round: 1, words: "The dialog snaps in." },
        { by: "Codex", agent: true, round: 2, words: "It fades in now." },
        { by: "Ana", agent: false, round: 2, words: "Now it's too slow." },
      ]);
    });

    test("a reply is on a note that exists, in words; and an answer isn't judged, only replied to", async () => {
      const { changes, asked } = await working();
      await changes.saveRound("invoice-export", round(2, { replies: [{ note: asked.id, words: "It fades in now." }] }));
      await changes.finish("invoice-export", 2);
      await assert.rejects(changes.send("invoice-export", send(2, { replies: [{ note: "nobody", words: "Hm" }] })), refused(/no note nobody on round 2 to reply to/));
      await assert.rejects(changes.send("invoice-export", send(2, { replies: [{ note: asked.id, words: " " }] })), refused(/needs words/));
    });

    test("Done says nothing more, and a send says something", async () => {
      const changes = await recorded();
      await changes.send("invoice-export", send(1, { done: true }));
      await assert.rejects(changes.send("invoice-export", send(1, { done: true, notes: [{ id: "n1", words: "Hm" }] })), refused(/Done says every moment looks good, and nothing more/));
      await assert.rejects(changes.send("invoice-export", send(1, {})), refused(/nothing in this send/));
    });

    test("what's sent or recorded in the wrong shape is refused in plain words, naming the thing", async () => {
      const changes = await recorded();
      const typo = { ...round(2), replies: [{ note: "abc", txt: "Fixed." }] };
      await assert.rejects(
        changes.saveRound("invoice-export", typo as never),
        refused(/^Round 2: the reply to note abc needs its words, even if empty until it's answered\.\nRound 2: the reply to note abc has “txt”, which isn't one of its fields\.$/),
      );
      const nameless = { ...round(2), scenes: [{ ...scene("Export a quarter"), steps: [{ title: "Open", at: "soon" }] }, { length: 3 }] };
      await assert.rejects(changes.saveRound("invoice-export", nameless as never), (error: unknown) => {
        assert.ok(error instanceof Refused);
        assert.deepEqual(error.problems, [
          "Round 2: the step “Open” in the scene “Export a quarter” needs the moment it starts, in seconds.",
          "Round 2: scene 2 needs a name.",
          "Round 2: scene 2 needs its steps, a list, even if it's empty.",
          "Round 2: scene 2 needs its recording: the name of a file in the round.",
          "Round 2: scene 2 needs where the moment starts, in seconds.",
        ]);
        return true;
      });
    });

    test("a round edited by hand is checked when it's handed back, so a misspelling is refused by name", async () => {
      const changes = await recorded();
      await changes.saveRound("invoice-export", round(2));
      const edited = { ...round(2), replies: [{ note: "abc", wrds: "Fixed." }] };
      await changes.storage.write("invoice-export/rounds/2/round.json", new TextEncoder().encode(JSON.stringify(edited)));
      await assert.rejects(changes.finish("invoice-export", 2), (error: unknown) => {
        assert.ok(error instanceof Refused);
        assert.deepEqual(error.problems, ["Round 2: the reply to note abc needs its words, even if empty until it's answered.", "Round 2: the reply to note abc has “wrds”, which isn't one of its fields."]);
        return true;
      });
    });

    test("a round edited by hand into something that isn't JSON is named, with what to do", async () => {
      const changes = await recorded();
      await changes.saveRound("invoice-export", round(2));
      await changes.storage.write("invoice-export/rounds/2/round.json", new TextEncoder().encode(`{ "number": 2 "by": "Claude Code" }`));
      await assert.rejects(changes.get("invoice-export"), refused(/^The change's file invoice-export\/rounds\/2\/round\.json isn't JSON: .+\. Put it right, then run this again\.$/));
    });

    test("a send's id and a note's are words a file can be called, as they name the files they're kept in", async () => {
      const changes = await recorded();
      await assert.rejects(changes.send("invoice-export", send(1, { id: "../../playthrough/app", notes: [note("Hm")] })), refused(/needs an id of letters, digits and dashes/));
      await assert.rejects(changes.send("invoice-export", send(1, { notes: [{ ...note("Hm"), id: "a/b" }] })), refused(/needs an id of letters, digits and dashes/));
    });

    test("sending the same send twice keeps it once, and a different send can't reuse its id", async () => {
      const changes = await recorded();
      const once = send(1, { notes: [note("The dialog snaps in.")] });
      await changes.send("invoice-export", once);
      await changes.send("invoice-export", structuredClone(once));
      assert.equal((await changes.get("invoice-export")).sends.length, 1);
      await assert.rejects(changes.send("invoice-export", { ...once, by: "Ben" }), refused(/already sent as/));
    });

    test("there's nothing to send in an empty send", async () => {
      const changes = await recorded();
      await assert.rejects(changes.send("invoice-export", send(1)), refused(/nothing in this send/));
    });

    test("notes sent after the agent took the others wait for the next round", async () => {
      const { changes, asked } = await working();
      const late = note("And the button is too small.");
      await changes.send("invoice-export", send(1, { notes: [late] }));
      await changes.saveRound("invoice-export", round(2, { replies: [{ note: asked.id, words: "It fades in now." }] }));
      await changes.finish("invoice-export", 2);

      const taken = await changes.take("invoice-export");
      assert.deepEqual(taken.map((sent) => sent.notes[0]?.id), [late.id]);
      await changes.saveRound("invoice-export", round(3));
      await assert.rejects(changes.finish("invoice-export", 3), refused(/“And the button is too small.”/));
    });

    test("taking takes each send once", async () => {
      const { changes } = await working();
      assert.deepEqual(await changes.take("invoice-export"), []);
    });

    test("files go in the round being worked on and come back as they were", async () => {
      const changes = await recorded();
      const recording = new TextEncoder().encode('{"events":[]}');
      await changes.saveFile("invoice-export", 2, "export-a-quarter.json", recording);
      assert.deepEqual(await changes.file("invoice-export", 2, "export-a-quarter.json"), recording);
      await assert.rejects(changes.saveFile("invoice-export", 1, "late.json", recording), refused(/round being worked on, 2/));
      await assert.rejects(changes.saveFile("invoice-export", 2, "../../escape.json", recording), refused(/can't be a file's name/));
      await assert.rejects(changes.file("invoice-export", 2, "../round.json"), refused(/can't be a file's name/));
    });

    test("a refusal keeps nothing", async () => {
      const changes = await recorded();
      await assert.rejects(changes.send("invoice-export", send(1, { notes: [{ ...note("Hm"), words: "" }] })), Refused);
      assert.deepEqual((await changes.get("invoice-export")).sends, []);
    });

    test("waiting ends once the change is the way you want it", async () => {
      const changes = await recorded();
      const waiting = changes.wait("invoice-export", (change) => change.sends.length > 0);
      await changes.send("invoice-export", send(1, { notes: [note("The dialog snaps in.")] }));
      assert.equal((await waiting).sends.length, 1);
    });

    test("waiting can be stopped", async () => {
      const changes = await recorded();
      const stop = new AbortController();
      const waiting = changes.wait("invoice-export", () => false, stop.signal);
      stop.abort();
      await assert.rejects(waiting, { name: "AbortError" });
    });
  });
}
