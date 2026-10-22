// What every store promises. Each storage runs the same tests: a hosted one will have to pass them too.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { folder } from "../src/folder.ts";
import { memory, newId, Refused, Reviews, type Flow, type Round, type Send, type Storage } from "../src/index.ts";

const folders: string[] = [];
after(() => Promise.all(folders.map((path) => rm(path, { recursive: true }))));

const storages: [string, () => Promise<Storage>][] = [
  ["in memory", async () => memory()],
  ["in a folder", async () => folder(folders[folders.push(await mkdtemp(join(tmpdir(), "vantage-"))) - 1] ?? "")],
];

const flow = (name: string, length = 6): Flow => ({
  name,
  length,
  steps: [
    { title: "Open the invoices", at: 0 },
    { title: "Export the quarter", at: 2 },
  ],
  recording: `${name.toLowerCase().replaceAll(" ", "-")}.json`,
});

const round = (number: number, parts: Partial<Round> = {}): Round => ({
  number,
  flows: [flow("Export a quarter"), flow("Cancel halfway")],
  changes: [],
  replies: [],
  unprompted: [],
  ...parts,
});

let clock = Date.parse("2026-10-22T09:00:00Z");
const send = (round: number, parts: Partial<Send> = {}): Send => ({
  id: newId(),
  round,
  by: "Ana",
  sent: new Date((clock += 1000)).toISOString(),
  notes: [],
  verdicts: [],
  looksGood: [],
  ...parts,
});

const note = (words: string, at = 3) => ({ id: newId(), on: { flow: "Export a quarter", at }, words });

const refused = (pattern: RegExp) => (error: unknown) => {
  assert.ok(error instanceof Refused, `expected a refusal, got ${error}`);
  assert.match(error.message, pattern);
  return true;
};

for (const [kept, storage] of storages) {
  describe(`Reviews kept ${kept}`, () => {
    // A review with its before and a first round recorded, ready for notes.
    async function recorded() {
      const reviews = new Reviews(await storage());
      await reviews.start("invoice-export", "Export a quarter's invoices as a CSV");
      await reviews.saveRound("invoice-export", round(0));
      await reviews.finish("invoice-export", 0);
      const change = { id: "c1", on: { flow: "Export a quarter", at: 2 }, words: "Says “Export”, was nothing", because: "asked" as const };
      await reviews.saveRound("invoice-export", round(1, { changes: [change] }));
      await reviews.finish("invoice-export", 1);
      return reviews;
    }

    // The agent took a note on round 1 and is working on round 2.
    async function working(words = "The dialog snaps in.") {
      const reviews = await recorded();
      const asked = note(words);
      await reviews.send("invoice-export", send(1, { notes: [asked] }));
      await reviews.take("invoice-export");
      return { reviews, asked };
    }

    test("a review starts with its title and nothing recorded", async () => {
      const reviews = new Reviews(await storage());
      const review = await reviews.start("invoice-export", "Export a quarter's invoices as a CSV");
      assert.equal(review.title, "Export a quarter's invoices as a CSV");
      assert.deepEqual([review.rounds, review.sends, review.taken], [[], [], []]);
      assert.deepEqual(await reviews.list(), ["invoice-export"]);
    });

    test("a review's id is lowercase words joined by dashes, and only one review has it", async () => {
      const reviews = new Reviews(await storage());
      await assert.rejects(reviews.start("../Export", "A title"), refused(/lowercase words joined by dashes/));
      await assert.rejects(reviews.get("../elsewhere"), refused(/lowercase words joined by dashes/));
      await reviews.start("invoice-export", "A title");
      await assert.rejects(reviews.start("invoice-export", "Another"), refused(/already a review called/));
    });

    test("the first round is the before, or round 1 when the app is new", async () => {
      const reviews = new Reviews(await storage());
      await reviews.start("invoice-export", "A title");
      await assert.rejects(reviews.saveRound("invoice-export", round(2)), refused(/first round is 0/));
      await reviews.saveRound("invoice-export", round(1));
      await reviews.finish("invoice-export", 1);
      assert.equal((await reviews.get("invoice-export")).rounds[0]?.number, 1);
    });

    test("a round with no round before it has nothing to compare, so no changes", async () => {
      const reviews = new Reviews(await storage());
      await reviews.start("invoice-export", "A title");
      const change = { id: "c1", on: { flow: "Export a quarter", at: 1 }, words: "Says “Export”" };
      await assert.rejects(reviews.saveRound("invoice-export", round(1, { changes: [change] })), refused(/no round before it/));
    });

    test("a round can be saved as often as needed until it's finished, then it never changes", async () => {
      const reviews = await recorded();
      await reviews.saveRound("invoice-export", round(2, { flows: [flow("Export a quarter")] }));
      await reviews.saveRound("invoice-export", round(2));
      assert.equal((await reviews.get("invoice-export")).rounds[2]?.flows.length, 2);
      await reviews.finish("invoice-export", 2);
      await assert.rejects(reviews.saveRound("invoice-export", round(2)), refused(/Round 2 is finished/));
      await assert.rejects(reviews.saveRound("invoice-export", round(4)), refused(/being worked on is 3/));
    });

    test("finishing twice is the same as finishing once", async () => {
      const reviews = await recorded();
      const finished = (await reviews.get("invoice-export")).rounds[1]?.finished;
      await reviews.finish("invoice-export", 1);
      assert.equal((await reviews.get("invoice-export")).rounds[1]?.finished, finished);
    });

    test("a round can't finish until every change on screen is accounted for", async () => {
      const reviews = await recorded();
      const change = { id: "c2", on: { flow: "Export a quarter", at: 2 }, words: "Download CSV and Cancel swapped places" };
      await reviews.saveRound("invoice-export", round(2, { changes: [change] }));
      await assert.rejects(reviews.finish("invoice-export", 2), refused(/“Download CSV and Cancel swapped places” needs a because/));
      await reviews.saveRound("invoice-export", round(2, { changes: [{ ...change, because: { noise: "The clock moved on." } }] }));
      await reviews.finish("invoice-export", 2);
    });

    test("only round 1 can say a change was asked for, against the before", async () => {
      const reviews = await recorded();
      const change = { id: "c2", on: { flow: "Export a quarter", at: 2 }, words: "Says “CSV”", because: "asked" as const };
      await reviews.saveRound("invoice-export", round(2, { changes: [change] }));
      await assert.rejects(reviews.finish("invoice-export", 2), refused(/only round 1 can say/));
    });

    test("a change that follows from another has to lead back to a cause, not round in a circle", async () => {
      const reviews = await recorded();
      const at = { flow: "Export a quarter", at: 2 };
      const changes = [
        { id: "c2", on: at, words: "The table moved down", because: { follows: "c3" } },
        { id: "c3", on: at, words: "A banner shows", because: { follows: "c2" } },
      ];
      await reviews.saveRound("invoice-export", round(2, { changes }));
      await assert.rejects(reviews.finish("invoice-export", 2), refused(/leads back to it/));
      const banner = { id: "x1", on: at, words: "I added a banner saying the export is ready." };
      await reviews.saveRound("invoice-export", round(2, { changes: [changes[0]!, { ...changes[1]!, because: { unprompted: "x1" } }], unprompted: [banner] }));
      await reviews.finish("invoice-export", 2);
    });

    test("a flow that's gone is a change with no moment, on the round before's flow", async () => {
      const reviews = await recorded();
      const gone = { id: "c2", on: { flow: "Cancel halfway" }, words: "No longer recorded", because: { noise: "The task dropped it." } };
      await reviews.saveRound("invoice-export", round(2, { flows: [flow("Export a quarter")], changes: [gone] }));
      await reviews.finish("invoice-export", 2);
      const late = { ...gone, on: { flow: "Cancel halfway", at: 1 } };
      await assert.rejects(reviews.saveRound("invoice-export", round(3, { flows: [flow("Export a quarter")], changes: [late] })), refused(/isn't there/));
    });

    test("notes go only on finished rounds after the before", async () => {
      const reviews = new Reviews(await storage());
      await reviews.start("invoice-export", "A title");
      await reviews.saveRound("invoice-export", round(0));
      await reviews.finish("invoice-export", 0);
      await reviews.saveRound("invoice-export", round(1));
      await assert.rejects(reviews.send("invoice-export", send(0, { notes: [note("Hm")] })), refused(/Round 0 is the before/));
      await assert.rejects(reviews.send("invoice-export", send(1, { notes: [note("Hm")] })), refused(/isn't finished/));
    });

    test("a note's place is on a flow in its round, at a moment within it", async () => {
      const reviews = await recorded();
      const elsewhere = { id: newId(), on: { flow: "Pay an invoice", at: 1 }, words: "Hm" };
      await assert.rejects(reviews.send("invoice-export", send(1, { notes: [elsewhere] })), refused(/“Pay an invoice”, which isn't there/));
      await assert.rejects(reviews.send("invoice-export", send(1, { notes: [note("Hm", 9)] })), refused(/is at 9s, but “Export a quarter” is 6s long/));
      const twice = { ...note("Hm"), on: { flow: "Export a quarter", at: 1, point: { x: 0.5, y: 0.5 }, box: { x: 0, y: 0, width: 1, height: 1 } } };
      await assert.rejects(reviews.send("invoice-export", send(1, { notes: [twice] })), refused(/more than one thing/));
    });

    test("a round can't finish until every note it took is answered", async () => {
      const { reviews, asked } = await working();
      await reviews.saveRound("invoice-export", round(2));
      await assert.rejects(reviews.finish("invoice-export", 2), refused(new RegExp(`answer to note ${asked.id}, “The dialog snaps in.”`)));
      await reviews.saveRound("invoice-export", round(2, { replies: [{ note: asked.id, words: "It fades in now, like the other dialogs." }] }));
      await reviews.finish("invoice-export", 2);
    });

    test("a reply goes in its note's flow", async () => {
      const { reviews, asked } = await working();
      const reply = { note: asked.id, words: "It fades in now.", on: { flow: "Cancel halfway", at: 1 } };
      await reviews.saveRound("invoice-export", round(2, { replies: [reply] }));
      await assert.rejects(reviews.finish("invoice-export", 2), refused(/A reply goes in its note's flow/));
    });

    test("a change answering a note has to answer one this round took", async () => {
      const { reviews, asked } = await working();
      const reply = { note: asked.id, words: "It fades in now." };
      const change = (note: string) => ({ id: "c2", on: { flow: "Export a quarter", at: 2 }, words: "Looks different", because: { note } });
      await reviews.saveRound("invoice-export", round(2, { replies: [reply], changes: [change("someone-else")] }));
      await assert.rejects(reviews.finish("invoice-export", 2), refused(/isn't one this round answers/));
      await reviews.saveRound("invoice-export", round(2, { replies: [reply], changes: [change(asked.id)] }));
      await reviews.finish("invoice-export", 2);
    });

    test("looks good settles a note, and not quite asks again, in words", async () => {
      const { reviews, asked } = await working();
      await reviews.saveRound("invoice-export", round(2, { replies: [{ note: asked.id, words: "It fades in now." }] }));
      await reviews.finish("invoice-export", 2);

      await assert.rejects(reviews.send("invoice-export", send(2, { verdicts: [{ note: asked.id, verdict: "not quite" }] })), refused(/needs words/));
      await reviews.send("invoice-export", send(2, { verdicts: [{ note: asked.id, verdict: "not quite", words: "Now it's too slow." }] }));
      await reviews.take("invoice-export");
      await reviews.saveRound("invoice-export", round(3));
      await assert.rejects(reviews.finish("invoice-export", 3), refused(/needs an answer/));
      await reviews.saveRound("invoice-export", round(3, { replies: [{ note: asked.id, words: "Faster now." }] }));
      await reviews.finish("invoice-export", 3);

      await reviews.send("invoice-export", send(3, { verdicts: [{ note: asked.id, verdict: "looks good", words: "Lovely." }] }));
      await reviews.take("invoice-export");
      await reviews.saveRound("invoice-export", round(4));
      await reviews.finish("invoice-export", 4);
    });

    test("when two people judge the same note, the later verdict counts", async () => {
      const { reviews, asked } = await working();
      await reviews.saveRound("invoice-export", round(2, { replies: [{ note: asked.id, words: "It fades in now." }] }));
      await reviews.finish("invoice-export", 2);
      await reviews.send("invoice-export", send(2, { by: "Ana", verdicts: [{ note: asked.id, verdict: "not quite", words: "Too slow." }] }));
      await reviews.send("invoice-export", send(2, { by: "Ben", verdicts: [{ note: asked.id, verdict: "looks good" }] }));
      assert.equal((await reviews.take("invoice-export")).length, 2);
      await reviews.saveRound("invoice-export", round(3));
      await reviews.finish("invoice-export", 3);
    });

    test("the agent's unprompted notes are judged like anyone's", async () => {
      const reviews = await recorded();
      const banner = { id: newId(), on: { flow: "Export a quarter", at: 2 }, words: "I added a banner saying the export is ready." };
      await reviews.saveRound("invoice-export", round(2, { unprompted: [banner] }));
      await reviews.finish("invoice-export", 2);
      await reviews.send("invoice-export", send(2, { verdicts: [{ note: banner.id, verdict: "not quite", words: "Please change this back." }] }));
      await reviews.take("invoice-export");
      await reviews.saveRound("invoice-export", round(3));
      await assert.rejects(reviews.finish("invoice-export", 3), refused(/needs an answer to note .*“I added a banner/));
    });

    test("a verdict is on a note that exists, and a new note has words, not a verdict", async () => {
      const reviews = await recorded();
      await assert.rejects(reviews.send("invoice-export", send(1, { verdicts: [{ note: "nobody", verdict: "looks good" }] })), refused(/no note nobody/));
      const fresh = note("Hm");
      const both = send(1, { notes: [fresh], verdicts: [{ note: fresh.id, verdict: "looks good" }] });
      await assert.rejects(reviews.send("invoice-export", both), refused(/is new: it needs words, not a verdict/));
    });

    test("a whole flow can look good, if the round has it", async () => {
      const reviews = await recorded();
      await reviews.send("invoice-export", send(1, { looksGood: ["Export a quarter"] }));
      await assert.rejects(reviews.send("invoice-export", send(1, { looksGood: ["Pay an invoice"] })), refused(/no flow called “Pay an invoice”/));
    });

    test("what's sent or recorded in the wrong shape is refused in plain words, naming the thing", async () => {
      const reviews = await recorded();
      const typo = { ...round(2), replies: [{ note: "abc", txt: "Fixed." }] };
      await assert.rejects(
        reviews.saveRound("invoice-export", typo as never),
        refused(/^Round 2: the reply to note abc needs its words, even if empty until it's answered\.\nRound 2: the reply to note abc has “txt”, which isn't one of its fields\.$/),
      );
      const nameless = { ...round(2), flows: [{ ...flow("Export a quarter"), steps: [{ title: "Open", at: "soon" }] }, { length: 3 }] };
      await assert.rejects(reviews.saveRound("invoice-export", nameless as never), (error: unknown) => {
        assert.ok(error instanceof Refused);
        assert.deepEqual(error.problems, [
          "Round 2: the step “Open” in the flow “Export a quarter” needs the moment it starts, in seconds.",
          "Round 2: flow 2 needs a name.",
          "Round 2: flow 2 needs its steps, a list, even if it's empty.",
          "Round 2: flow 2 needs its recording: the name of a file in the round.",
        ]);
        return true;
      });
      const misspelled = { id: "c2", on: { flow: "Export a quarter", at: 2 }, words: "Says “CSV”", because: { nte: "abc" } };
      await assert.rejects(reviews.saveRound("invoice-export", round(2, { changes: [misspelled as never] })), refused(/the change “Says “CSV”” has a because that isn't one of/));
    });

    test("sending the same send twice keeps it once, and a different send can't reuse its id", async () => {
      const reviews = await recorded();
      const once = send(1, { notes: [note("The dialog snaps in.")] });
      await reviews.send("invoice-export", once);
      await reviews.send("invoice-export", structuredClone(once));
      assert.equal((await reviews.get("invoice-export")).sends.length, 1);
      await assert.rejects(reviews.send("invoice-export", { ...once, by: "Ben" }), refused(/already sent as/));
    });

    test("there's nothing to send in an empty send", async () => {
      const reviews = await recorded();
      await assert.rejects(reviews.send("invoice-export", send(1)), refused(/nothing in this send/));
    });

    test("notes sent after the agent took the others wait for the next round", async () => {
      const { reviews, asked } = await working();
      const late = note("And the button is too small.");
      await reviews.send("invoice-export", send(1, { notes: [late] }));
      await reviews.saveRound("invoice-export", round(2, { replies: [{ note: asked.id, words: "It fades in now." }] }));
      await reviews.finish("invoice-export", 2);

      const taken = await reviews.take("invoice-export");
      assert.deepEqual(taken.map((sent) => sent.notes[0]?.id), [late.id]);
      await reviews.saveRound("invoice-export", round(3));
      await assert.rejects(reviews.finish("invoice-export", 3), refused(/“And the button is too small.”/));
    });

    test("taking takes each send once", async () => {
      const { reviews } = await working();
      assert.deepEqual(await reviews.take("invoice-export"), []);
    });

    test("accepting is final: no rounds or sends come after it, and accepting again keeps the first", async () => {
      const reviews = await recorded();
      await reviews.accept("invoice-export", "Ana");
      await reviews.accept("invoice-export", "Ben");
      assert.equal((await reviews.get("invoice-export")).accepted?.by, "Ana");
      await assert.rejects(reviews.saveRound("invoice-export", round(2)), refused(/accepted/));
      await assert.rejects(reviews.send("invoice-export", send(1, { notes: [note("Hm")] })), refused(/accepted/));
      assert.deepEqual(await reviews.take("invoice-export"), []);
    });

    test("there's nothing to accept before a round is finished", async () => {
      const reviews = new Reviews(await storage());
      await reviews.start("invoice-export", "A title");
      await assert.rejects(reviews.accept("invoice-export", "Ana"), refused(/no finished round to accept/));
    });

    test("files go in the round being worked on and come back as they were", async () => {
      const reviews = await recorded();
      const recording = new TextEncoder().encode('{"events":[]}');
      await reviews.saveFile("invoice-export", 2, "export-a-quarter.json", recording);
      assert.deepEqual(await reviews.file("invoice-export", 2, "export-a-quarter.json"), recording);
      await assert.rejects(reviews.saveFile("invoice-export", 1, "late.json", recording), refused(/round being worked on, 2/));
      await assert.rejects(reviews.saveFile("invoice-export", 2, "../../escape.json", recording), refused(/can't be a file's name/));
      await assert.rejects(reviews.file("invoice-export", 2, "../round.json"), refused(/can't be a file's name/));
    });

    test("a refusal keeps nothing", async () => {
      const reviews = await recorded();
      await assert.rejects(reviews.send("invoice-export", send(1, { notes: [{ ...note("Hm"), words: "" }] })), Refused);
      assert.deepEqual((await reviews.get("invoice-export")).sends, []);
    });

    test("waiting ends once the review is the way you want it", async () => {
      const reviews = await recorded();
      const waiting = reviews.wait("invoice-export", (review) => review.sends.length > 0);
      await reviews.send("invoice-export", send(1, { notes: [note("The dialog snaps in.")] }));
      assert.equal((await waiting).sends.length, 1);
    });

    test("waiting can be stopped", async () => {
      const reviews = await recorded();
      const stop = new AbortController();
      const waiting = reviews.wait("invoice-export", () => false, stop.signal);
      stop.abort();
      await assert.rejects(waiting, { name: "AbortError" });
    });
  });
}
