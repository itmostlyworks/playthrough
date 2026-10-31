// What every store promises. Each storage runs the same tests: a hosted one will have to pass them too.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { folder } from "../src/folder.ts";
import { conversation, memory, newId, Refused, Reviews, type Change, type Flow, type Round, type Send, type Storage } from "../src/index.ts";

const folders: string[] = [];
after(() => Promise.all(folders.map((path) => rm(path, { recursive: true }))));

const storages: [string, () => Promise<Storage>][] = [
  ["in memory", async () => memory()],
  ["in a folder", async () => folder(folders[folders.push(await mkdtemp(join(tmpdir(), "playthrough-"))) - 1] ?? "")],
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
  by: "Claude Code",
  flows: [flow("Export a quarter"), flow("Cancel halfway")],
  replies: [],
  accounts: {},
  ...parts,
});

const change = (id: string, words: string, at = 2, flow = "Export a quarter"): Change => ({ id, words, seen: [{ flow, at }] });

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
    // A review with Before and a first round recorded, ready for notes.
    async function recorded() {
      const reviews = new Reviews(await storage());
      await reviews.start("invoice-export", "Export a quarter's invoices as a CSV");
      await reviews.saveRound("invoice-export", round(0));
      await reviews.finish("invoice-export", 0);
      await reviews.saveRound("invoice-export", round(1, { accounts: { c1: { line: "Export sits where the totals are." } } }));
      await reviews.saveComparison("invoice-export", { round: 1, since: 0, changes: [change("c1", "“Export” button is new")] });
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

    test("a review starts with its title, what was asked, and nothing recorded", async () => {
      const reviews = new Reviews(await storage());
      const asked = "Can I get last quarter's invoices out as a spreadsheet?";
      const review = await reviews.start("invoice-export", "Export a quarter's invoices as a CSV", asked);
      assert.deepEqual([review.title, review.asked], ["Export a quarter's invoices as a CSV", asked]);
      assert.equal((await reviews.get("invoice-export")).asked, asked);
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

    test("the first round is Before, or round 1 when the app is new", async () => {
      const reviews = new Reviews(await storage());
      await reviews.start("invoice-export", "A title");
      await assert.rejects(reviews.saveRound("invoice-export", round(2)), refused(/first round is 0/));
      await reviews.saveRound("invoice-export", round(1));
      await reviews.finish("invoice-export", 1);
      assert.equal((await reviews.get("invoice-export")).rounds[0]?.number, 1);
    });

    test("a round is compared only with a round before it, so a first round with no Before has no changes", async () => {
      const reviews = new Reviews(await storage());
      await reviews.start("invoice-export", "A title");
      await reviews.saveRound("invoice-export", round(1));
      const compared = { round: 1, since: 0, changes: [change("c1", "“Export” button is new")] };
      await assert.rejects(reviews.saveComparison("invoice-export", compared), refused(/there's no Before to compare it with/));
      await assert.rejects(reviews.saveComparison("invoice-export", { ...compared, since: 1 }), refused(/only compared with a round before it/));
    });

    test("what a round is compared with is kept until the round is finished, then it never changes", async () => {
      const reviews = await recorded();
      assert.deepEqual((await reviews.get("invoice-export")).comparisons.map(({ round, since }) => [round, since]), [[1, 0]]);
      await assert.rejects(reviews.saveComparison("invoice-export", { round: 1, since: 0, changes: [] }), refused(/Round 1 is finished/));
      await reviews.saveRound("invoice-export", round(2));
      await reviews.saveComparison("invoice-export", { round: 2, since: 1, changes: [change("c2", "Moved down")] });
      await reviews.saveComparison("invoice-export", { round: 2, since: 1, changes: [] });
      assert.deepEqual((await reviews.get("invoice-export")).comparisons.at(-1)?.changes, []);
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

    test("Before gains a flow added later, with its files, or the word that the app as it was can't start it; a flow tried again takes the place of what it had of it; a file it has stays as it is", async () => {
      const reviews = await recorded();
      const recording = new TextEncoder().encode("[]");
      const add = (flows: Flow[], cantStart: string[], files = [{ name: "export-a-year.json", bytes: recording }]) =>
        reviews.addToBefore("invoice-export", { flows, cantStart, files });
      await add([flow("Export a year")], ["Open the export"]);
      const before = (await reviews.get("invoice-export")).rounds[0];
      assert.deepEqual(before?.flows.map((flow) => flow.name), ["Export a quarter", "Cancel halfway", "Export a year"]);
      assert.deepEqual([before?.cantStart, !!before?.finished], [["Open the export"], true]);
      assert.deepEqual(await reviews.file("invoice-export", 0, "export-a-year.json"), recording);

      await add([flow("Export a quarter")], [], []);
      await add([flow("Open the export")], [], []);
      const again = (await reviews.get("invoice-export")).rounds[0];
      assert.deepEqual([again?.flows.map((flow) => flow.name), again?.cantStart], [["Cancel halfway", "Export a year", "Export a quarter", "Open the export"], []]);
      const other = [{ name: "export-a-year.json", bytes: new TextEncoder().encode("[{}]") }];
      await assert.rejects(add([flow("Export a month")], [], other), refused(/Before has a file called “export-a-year\.json” already, with something else in it/));
      // A file kept by what's in it, like a font two flows load, comes again the same.
      await add([flow("Export a month")], []);

      const app = new Reviews(await storage());
      await app.start("new-app", "A title");
      await app.saveRound("new-app", round(1));
      await assert.rejects(app.addToBefore("new-app", { flows: [flow("Export a year")], cantStart: [], files: [] }), refused(/no Before to add a flow to/));
    });

    test("finishing twice is the same as finishing once", async () => {
      const reviews = await recorded();
      const finished = (await reviews.get("invoice-export")).rounds[1]?.finished;
      await reviews.finish("invoice-export", 1);
      assert.equal((await reviews.get("invoice-export")).rounds[1]?.finished, finished);
    });

    test("a round isn't handed over until the agent says why each change new since the round before is there", async () => {
      const reviews = await recorded();
      await reviews.saveRound("invoice-export", round(2));
      await reviews.saveComparison("invoice-export", { round: 2, since: 0, changes: [change("c1", "“Export” button is new"), change("c2", "Download CSV and Cancel swapped")] });
      await reviews.saveComparison("invoice-export", { round: 2, since: 1, changes: [change("c2", "Download CSV and Cancel swapped")] });
      await assert.rejects(
        reviews.finish("invoice-export", 2),
        refused(/^Round 2: say why c2 is there \(Download CSV and Cancel swapped, in “Export a quarter” at 0:02\): its line, the note it was made for, or why nothing really changed\.$/),
      );
      await reviews.saveRound("invoice-export", round(2, { accounts: { c2: { notReal: "The page was still drawing." } } }));
      await reviews.finish("invoice-export", 2);
    });

    test("a round compared at all is compared with every round before it before it's handed over", async () => {
      const reviews = await recorded();
      await reviews.saveRound("invoice-export", round(2));
      await reviews.saveComparison("invoice-export", { round: 2, since: 1, changes: [] });
      await assert.rejects(reviews.finish("invoice-export", 2), refused(/^Round 2 isn't compared with Before yet, so it can't be handed over\. Record it again\.$/));
      await reviews.saveComparison("invoice-export", { round: 2, since: 0, changes: [change("c1", "“Export” button is new")] });
      await reviews.finish("invoice-export", 2);
    });

    test("what the agent says is about one of the round's changes, and a change made for a note names a note that exists", async () => {
      const reviews = await recorded();
      await reviews.saveRound("invoice-export", round(2, { accounts: { c9: { line: "Moved it." }, c1: { note: "nobody" } } }));
      await reviews.saveComparison("invoice-export", { round: 2, since: 1, changes: [] });
      await reviews.saveComparison("invoice-export", { round: 2, since: 0, changes: [change("c1", "“Export” button is new")] });
      await assert.rejects(reviews.finish("invoice-export", 2), (error: unknown) => {
        assert.ok(error instanceof Refused);
        assert.deepEqual(error.problems, [
          "Round 2 says something about the change c9, which isn't one of this round's changes.",
          "Round 2: the change c1 (“Export” button is new) was made for note nobody, which doesn't exist.",
        ]);
        return true;
      });
    });

    test("a flow that's gone is a change with no moment, on the earlier round's flow", async () => {
      const reviews = await recorded();
      await reviews.saveRound("invoice-export", round(2, { flows: [flow("Export a quarter")] }));
      const gone = { id: "c2", words: "No longer recorded", seen: [{ flow: "Cancel halfway" }] };
      await reviews.saveComparison("invoice-export", { round: 2, since: 1, changes: [gone] });
      const late = { ...gone, seen: [{ flow: "Cancel halfway", at: 1 }] };
      await assert.rejects(reviews.saveComparison("invoice-export", { round: 2, since: 1, changes: [late] }), refused(/isn't there/));
    });

    test("notes go only on finished rounds after Before", async () => {
      const reviews = new Reviews(await storage());
      await reviews.start("invoice-export", "A title");
      await reviews.saveRound("invoice-export", round(0));
      await reviews.finish("invoice-export", 0);
      await reviews.saveRound("invoice-export", round(1));
      await assert.rejects(reviews.send("invoice-export", send(0, { notes: [note("Hm")] })), refused(/Round 0 is Before/));
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

    test("a note's conversation reads in order: the note, then each round's reply by the agent that recorded it, and what people said", async () => {
      const { reviews, asked } = await working();
      await reviews.saveRound("invoice-export", round(2, { by: "Codex", replies: [{ note: asked.id, words: "It fades in now." }] }));
      await reviews.finish("invoice-export", 2);
      await reviews.send("invoice-export", send(2, { verdicts: [{ note: asked.id, verdict: "not quite", words: "Now it's too slow." }] }));
      await reviews.send("invoice-export", send(2, { by: "Bo", verdicts: [{ note: asked.id, verdict: "looks good" }] }));

      assert.deepEqual(conversation(await reviews.get("invoice-export"), asked.id), [
        { by: "Ana", agent: false, round: 1, words: "The dialog snaps in." },
        { by: "Codex", agent: true, round: 2, words: "It fades in now." },
        { by: "Ana", agent: false, round: 2, words: "Now it's too slow.", verdict: "not quite" },
        { by: "Bo", agent: false, round: 2, words: "", verdict: "looks good" },
      ]);
    });

    test("a note has one state for everyone, so a Not quite from anyone after a Looks good sends the answer back", async () => {
      const { reviews, asked } = await working();
      await reviews.saveRound("invoice-export", round(2, { replies: [{ note: asked.id, words: "It fades in now." }] }));
      await reviews.finish("invoice-export", 2);
      await reviews.send("invoice-export", send(2, { by: "Ana", verdicts: [{ note: asked.id, verdict: "looks good" }] }));
      await reviews.send("invoice-export", send(2, { by: "Ben", verdicts: [{ note: asked.id, verdict: "not quite", words: "Too slow." }] }));
      assert.equal((await reviews.take("invoice-export")).length, 2);
      await reviews.saveRound("invoice-export", round(3));
      await assert.rejects(reviews.finish("invoice-export", 3), refused(/needs an answer to note/));
    });

    test("a note whose last word is Looks good asks nothing more, whoever said the words before it", async () => {
      const { reviews, asked } = await working();
      await reviews.saveRound("invoice-export", round(2, { replies: [{ note: asked.id, words: "It fades in now." }] }));
      await reviews.finish("invoice-export", 2);
      await reviews.send("invoice-export", send(2, { by: "Ben", verdicts: [{ note: asked.id, verdict: "not quite", words: "Too slow." }] }));
      await reviews.send("invoice-export", send(2, { by: "Ana", verdicts: [{ note: asked.id, verdict: "looks good", words: "It's fine, it's meant to be calm." }] }));
      await reviews.take("invoice-export");
      await reviews.saveRound("invoice-export", round(3));
      await reviews.finish("invoice-export", 3);
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
      const misspelled = round(2, { accounts: { c2: { lne: "Moved it." } as never } });
      await assert.rejects(reviews.saveRound("invoice-export", misspelled), refused(/^Round 2: what it says about the change c2 says one of \{ line \}, \{ note \} or \{ notReal \}\.$/));
    });

    test("a round the agent edited by hand is checked when it's handed over, so a misspelling is refused by name", async () => {
      const reviews = await recorded();
      await reviews.saveRound("invoice-export", round(2));
      await reviews.saveComparison("invoice-export", { round: 2, since: 1, changes: [change("c2", "Download CSV and Cancel swapped")] });
      const edited = { ...round(2), accounts: { c2: { lne: "Download sits on the right." } }, brief: "I swapped them." };
      await reviews.storage.write("invoice-export/rounds/2/round.json", new TextEncoder().encode(JSON.stringify(edited)));
      await assert.rejects(reviews.finish("invoice-export", 2), (error: unknown) => {
        assert.ok(error instanceof Refused);
        assert.deepEqual(error.problems, [
          "Round 2: what it says about the change c2 says one of { line }, { note } or { notReal }.",
          "Round 2 has “brief”, which isn't one of its fields.",
        ]);
        return true;
      });
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

    test("the work can't be accepted while a note waits for the agent's answer", async () => {
      const { reviews, asked } = await working();
      await assert.rejects(reviews.accept("invoice-export", "Ben"), refused(new RegExp(`Note ${asked.id}, “The dialog snaps in.”, still waits for the agent's answer`)));
      await reviews.saveRound("invoice-export", round(2, { replies: [{ note: asked.id, words: "It fades in now." }] }));
      await reviews.finish("invoice-export", 2);
      await reviews.accept("invoice-export", "Ben");
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
