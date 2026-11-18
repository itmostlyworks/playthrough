// What following a note promises: before it's handed back, the agent is told where each note's thing shows in its
// moments, and how it looks against the frame the note was written on, from what the hand-back already keeps; and it
// can stand where a note was written. Each frame is a small page read in Chromium, as a moment's would be.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import type { Glimpse, Reading } from "@playthrough/page";
import type { Change, Moment, Note } from "@playthrough/change";
import { follow, followedSaid, framesOf, scrolledAt, writtenOn, type MomentFrame } from "../src/followed.ts";
import { readPage } from "../src/read.ts";
import { wayIn } from "../src/way.ts";

let browser: Browser;
let page: Page;
before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});
after(() => browser.close());

const read = async (html: string, at: number): Promise<Glimpse> => {
  await page.setContent(`<style>body { font: 16px sans-serif; margin: 24px }</style>${html}`);
  return { step: "Pick a range", at, ...(await readPage(page)) };
};
// A date picker: closed, opened by Pick dates, a day chosen in it, and closed again at the end.
const closed = `<h1>Trip</h1><button>Pick dates</button>`;
const open = (day = `<span>Oct 5, 2026</span>`) => `<h1>Trip</h1><button>Pick dates</button><div role="dialog" aria-label="Calendar"><button>Oct 5</button>${day}</div>`;
const PICK = { at: 1, what: "click button “Pick dates”" };
const DAY = { at: 2, what: "click button “Oct 5”" };
const picking = (name = "Pick a range", actions = [PICK, DAY]): Moment => ({ name, length: 4, recording: `${name}.json`, from: 0.5, actions });
// The moment as kept: its first frame, a frame after each thing done, and its end.
async function framesFor(moment: Moment, pages: string[]): Promise<MomentFrame[]> {
  const glimpses: Glimpse[] = [];
  for (const [i, html] of pages.slice(0, -1).entries()) glimpses.push(await read(html, i ? moment.actions[i - 1]!.at + 0.3 : 0.6));
  const end: Reading = { ...(await read(pages.at(-1)!, 3.5)), picture: "readings/end.png" };
  return framesOf(moment, [end], glimpses);
}
// The note, on the words in the open picker, written after Pick dates was clicked.
const noteOn = async (frames: MomentFrame[]): Promise<Note> => {
  const thing = frames[1]!.read.things.find((one) => one.name === "Oct 5, 2026")!;
  return { id: "n2", words: "This wraps onto two lines", on: { handBack: 1, moment: "Pick a range", at: 1.3, element: { role: thing.role, name: thing.name, node: 7 } } };
};
const change = (note: Note): Change => ({ id: "trip", title: "Trip dates", started: new Date().toISOString(), handBacks: [], comparisons: [], taken: [], sends: [{ id: "s1", handBack: 1, by: "Sam", sent: new Date().toISOString(), notes: [note] }] });

describe("a note followed into what's handed back", () => {
  test("is found on its own moment at the frame lined up with the one it was written on, by the things done, and said to look the same where it does", async () => {
    const moment = picking();
    const then = await framesFor(moment, [closed, open(), open(), closed]);
    const note = await noteOn(then);
    const now = await framesFor(moment, [closed, open(), open(), closed]);
    const found = follow(note, { moment, frames: then }, [{ moment, frames: now, own: true, since: false }]);
    assert.equal(found?.frame.name, "after-1");
    assert.equal(followedSaid(change(note), "n2", found), "Note n2, the text “Oct 5, 2026” on “Pick a range”: shown after clicking the button “Pick dates”, and looks the same as when the note was written.");
  });

  test("looking different, says what's different as comparing hand-backs says it", async () => {
    const moment = picking();
    const then = await framesFor(moment, [closed, open(), open(), closed]);
    const note = await noteOn(then);
    const now = await framesFor(moment, [closed, open(`<span style="color: rgb(200, 0, 0)">Oct 5, 2026</span>`), open(), closed]);
    const said = followedSaid(change(note), "n2", follow(note, { moment, frames: then }, [{ moment, frames: now, own: true, since: false }]));
    assert.match(said!, /^Note n2, the text “Oct 5, 2026” on “Pick a range”: shown after clicking the button “Pick dates”, and looks different from when the note was written: .*Oct 5, 2026.* looks different/);
  });

  test("marked again with other things done, is found at the first frame of its moment that has it", async () => {
    const then = await framesFor(picking(), [closed, open(), open(), closed]);
    const note = await noteOn(then);
    const again = picking("Pick a range", [{ at: 1, what: "press ArrowDown button “Pick dates”" }]);
    const now = await framesFor(again, [closed, open(), closed]);
    const found = follow(note, { moment: picking(), frames: then }, [{ moment: again, frames: now, own: true, since: false }]);
    assert.equal(followedSaid(change(note), "n2", found), "Note n2, the text “Oct 5, 2026” on “Pick a range”: shown after pressing ArrowDown in the button “Pick dates”, and looks the same as when the note was written.");
  });

  test("gone from its own moment, is found in a moment marked since, and said so", async () => {
    const then = await framesFor(picking(), [closed, open(), open(), closed]);
    const note = await noteOn(then);
    const own = await framesFor(picking(), [closed, closed, closed, closed]);
    const marked = picking("A range across two months", [PICK]);
    const since = await framesFor(marked, [closed, open(), open()]);
    const found = follow(note, { moment: picking(), frames: then }, [
      { moment: picking(), frames: own, own: true, since: false },
      { moment: marked, frames: since, own: false, since: true },
    ]);
    assert.match(followedSaid(change(note), "n2", found)!, /^Note n2, the text “Oct 5, 2026” on “Pick a range”: shown in “A range across two months” after clicking the button “Pick dates”/);
  });

  test("shown nowhere, says so, fine if the note asked for it to go, and otherwise that the person would have its answer and nothing to look at", async () => {
    const then = await framesFor(picking(), [closed, open(), open(), closed]);
    const note = await noteOn(then);
    const now = await framesFor(picking(), [closed, closed, closed, closed]);
    const found = follow(note, { moment: picking(), frames: then }, [{ moment: picking(), frames: now, own: true, since: false }]);
    assert.equal(
      followedSaid(change(note), "n2", found),
      "Note n2, the text “Oct 5, 2026” on “Pick a range”: isn't in sight in that moment or any marked since the note was written. Fine if the note asked for it to go; otherwise the person has your answer and nothing to look at, so mark a moment that shows what you did.",
    );
  });

  test("written once a scroll after a thing done had settled, is on the page scrolled as it was, where a thing it had scrolled into sight was out of sight before", async () => {
    const moment = picking();
    const glimpses = [await read(closed, 0.6), await read(days(0), 1.3), { ...(await read(days(200), 1.8)), scrolled: 1.5 }, await read(days(200), 2.3)];
    const frames = framesOf(moment, [{ ...(await read(days(200), 3.5)), picture: "readings/end.png" }], glimpses);
    const oct5 = (frame: MomentFrame) => frame.read.things.find((one) => one.name === "Oct 5")!;
    assert.equal(oct5(frames[1]!).outOfSight, true);
    const on = { handBack: 1, moment: "Pick a range", at: 1.6, element: { role: "button", name: "Oct 5" } };
    const written = writtenOn(frames, on);
    assert.equal(written?.frame.name, "after-2");
    assert.equal(written?.thing.outOfSight, undefined);
    assert.equal(scrolledAt(frames, 1.6), true);
    const note: Note = { id: "n2", words: "Make it stand out", on };
    assert.match(followedSaid(change(note), "n2", follow(note, { moment, frames }, [{ moment, frames, own: true, since: false }]))!, /: shown after clicking the button “Pick dates” and the scroll after it, and looks the same/);
    assert.equal(writtenOn(frames, { ...on, at: 1.4 })?.frame.name, "after-1");
    assert.equal(scrolledAt(frames, 1.4), false);
  });

  // A calendar scrolled to Oct 5 once Pick dates was clicked, where the note was written.
  const days = (top: number) => `<h1>Trip</h1><button>Pick dates</button><div id="days" style="height: 60px; overflow: auto"><div style="height: 200px"></div><button>Oct 5</button></div><script>days.scrollTop = ${top}</script>`;
  const scrolledTo = async (then: string[]) => {
    const glimpses = [await read(then[0]!, 0.6), await read(then[1]!, 1.3), { ...(await read(then[2]!, 1.8)), scrolled: 1.5 }, await read(then[3]!, 2.3)];
    return framesOf(picking(), [{ ...(await read(then[4]!, 3.5)), picture: "readings/end.png" }], glimpses);
  };
  const onOct5: Note = { id: "n2", words: "Make it stand out", on: { handBack: 1, moment: "Pick a range", at: 1.6, element: { role: "button", name: "Oct 5" } } };

  test("out of sight in a frame, scrolled away inside a part, isn't said to be shown there, but where it comes into sight later in its moment", async () => {
    const then = await scrolledTo([closed, days(0), days(200), days(200), days(200)]);
    const now = await framesFor(picking(), [closed, days(0), days(0), days(200)]);
    const found = follow(onOct5, { moment: picking(), frames: then }, [{ moment: picking(), frames: now, own: true, since: false }]);
    assert.equal(found?.frame.name, undefined);
    assert.match(followedSaid(change(onOct5), "n2", found)!, /: shown at its end, and looks the same/);
  });

  test("out of sight in every frame of its moment, inside a part or past the screen's edge, isn't said to be shown at all", async () => {
    const then = await scrolledTo([closed, days(0), days(200), days(200), days(200)]);
    const never = await framesFor(picking(), [closed, days(0), days(0), days(0)]);
    const said = followedSaid(change(onOct5), "n2", follow(onOct5, { moment: picking(), frames: then }, [{ moment: picking(), frames: never, own: true, since: false }]));
    assert.match(said!, /: isn't in sight in that moment or any marked since the note was written\./);
    const below = `<h1>Trip</h1><button>Pick dates</button><div style="height: 2000px"></div><button>Oct 5</button>`;
    const offScreen = await framesFor(picking(), [closed, below, below, below]);
    const past = follow(onOct5, { moment: picking(), frames: then }, [{ moment: picking(), frames: offScreen, own: true, since: false }]);
    assert.equal(past, undefined);
  });

  test("written where its thing was out of sight, says where it's shown and nothing about how it looks", async () => {
    const then = await framesFor(picking(), [closed, days(0), days(0), days(0)]);
    const now = await framesFor(picking(), [closed, days(200), days(200), days(200)]);
    const note: Note = { ...onOct5, on: { ...onOct5.on!, at: 1.3 } };
    assert.equal(followedSaid(change(note), "n2", follow(note, { moment: picking(), frames: then }, [{ moment: picking(), frames: now, own: true, since: false }])), "Note n2, the button “Oct 5” on “Pick a range”: shown after clicking the button “Pick dates”.");
  });

  test("on no thing, a moment as a whole or the change, says nothing", () => {
    const whole: Note = { id: "n3", words: "Feels slow", on: { handBack: 1, moment: "Pick a range" } };
    assert.equal(followedSaid(change(whole), "n3", undefined), undefined);
    const general: Note = { id: "n4", words: "Nice work" };
    assert.equal(followedSaid(change(general), "n4", undefined), undefined);
  });
});

describe("standing where a note was written", () => {
  const file = `import { expect, test } from "playthrough/test";

test.use({ person: "Sam" });

test("Pick a range", async ({ page, setup, baseURL }) => {
  await page.goto(\`\${baseURL}/trip\`);
  await test.step("Pick a range", async () => {
    await page.getByRole("button", { name: "Pick dates", exact: true }).click();
    await page.evaluate(([x, y]) => window.scrollTo({ left: x, top: y, behavior: "smooth" }), [0, 200]);
    await page.getByRole("button", { name: "Oct 5", exact: true }).click();
    await expect(page.getByText("Oct 5, 2026", { exact: true })).toBeVisible();
  });
});
`;
  test("goes the way of its moment and stops after the things done by the time it was written", () => {
    const way = wayIn(file, 1);
    assert.match(way, /Pick dates/);
    assert.doesNotMatch(way, /Oct 5/);
    assert.doesNotMatch(way, /scrollTo/);
  });

  test("written once the scroll after those had settled, goes that scroll too, and stops before the next thing done", () => {
    const way = wayIn(file, 1, true);
    assert.match(way, /scrollTo/);
    assert.doesNotMatch(way, /Oct 5/);
  });

  test("before anything was done, stops where the moment starts; at its end, goes all of it", () => {
    assert.doesNotMatch(wayIn(file, 0), /Pick dates/);
    assert.match(wayIn(file, 0), /goto/);
    assert.match(wayIn(file), /name: "Oct 5"/);
  });
});
