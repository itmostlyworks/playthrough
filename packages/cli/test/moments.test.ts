// What moments promise: the way to one is kept as a person would say it and run again from a fresh start, a moment is
// kept only where that lands, the change a command means is the one named last in that copy of the app, and running
// every moment again says of each whether it's the same.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import type { Reading, Thing } from "@playthrough/page";
import { madeBySetup, newId, Refused, type HandBack, type Moment, type Send } from "@playthrough/change";
import { change, changeHere, idOf, momentNamed, titleOf, momentsOf } from "../src/change.ts";
import { answer, howEachWent, wait } from "../src/moments.ts";
import { repo } from "../src/repo.ts";
import { problemsWithPeople } from "../src/setup.ts";
import { agentGone, agentWaiting, listening, unheardSaid } from "../src/wait.ts";
import { whyStopped } from "../src/reporter.ts";
import { fileOf, sameAddress, wayFile, wayIn, whatDiffers, wordsIn, type Done } from "../src/way.ts";

const folders: string[] = [];
after(() => Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true }))));
const quietly = async <T>(run: () => Promise<T>) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
  }
};

describe("the way to a moment", () => {
  const did: Done[] = [
    { does: "goto", on: "page", with: "/boards/qiaa4o4hklar" },
    { does: "click", on: "#__next > div:nth-of-type(2) > a", role: "link", name: "Settings" },
    { does: "fill", on: "#__next input", role: "textbox", name: "Card prefix", with: "WEB" },
    { does: "click", on: "#__next button", role: "button", name: "Save", nth: 1 },
    { does: "click", on: "#__next > div > span", what: "Saved" },
    { does: "click", on: "#__next > form p", text: "post on Monday", nth: 1 },
    { does: "press", on: "body", with: "Meta+k" },
  ];
  const way = wayFile({ words: "Cards now say WEB-1", person: "Maja", did, setup: { board: "qiaa4o4hklar" } });

  test("is written as a person would say each step: by role and name, which one where several share them, by its words where nothing names it, and by its place only where it says nothing", () => {
    assert.match(way, /await page\.getByRole\("link", \{ name: "Settings", exact: true \}\)\.click\(\);/);
    assert.match(way, /await page\.getByRole\("textbox", \{ name: "Card prefix", exact: true \}\)\.fill\("WEB"\);/);
    assert.match(way, /getByRole\("button", \{ name: "Save", exact: true \}\)\.nth\(1\)\.click\(\);/);
    assert.match(way, /await page\.locator\("#__next > div > span"\)\.click\(\); \/\/ Saved/);
    assert.match(way, /await page\.getByText\("post on Monday", \{ exact: true \}\)\.nth\(1\)\.click\(\);/);
    assert.match(way, /await page\.keyboard\.press\("Meta\+k"\);/);
  });

  test("types where the caret was put, as it was typed there, and finds a field the page gives no name by which of its kind it is", () => {
    const typed = wayFile({
      words: "Words typed at the start stay there",
      person: "Maja",
      did: [
        { does: "fill", on: "#__next form div", role: "textbox", nth: 1, with: "post on Monday" },
        { does: "press", on: "#__next form div", role: "textbox", nth: 1, with: "Home" },
        { does: "type", on: "#__next form div", role: "textbox", nth: 1, with: "Draft and " },
      ],
      setup: {},
      about: { role: "text", name: "Draft and post on Monday", disabled: false },
    });
    assert.match(typed, /await page\.getByRole\("textbox"\)\.nth\(1\)\.fill\("post on Monday"\);\n    await page\.getByRole\("textbox"\)\.nth\(1\)\.press\("Home"\);\n    await page\.getByRole\("textbox"\)\.nth\(1\)\.pressSequentially\("Draft and "\);/);
    const inWords = wayFile({ words: "Here", person: "Maja", did: [{ does: "press", on: "#__next p", text: "post on Monday", with: "Home" }, { does: "type", on: "#__next p", text: "post on Monday", with: "Draft and " }], setup: {} });
    assert.match(inWords, /await page\.keyboard\.press\("Home"\);\n    await page\.keyboard\.type\("Draft and "\);/, "keys on words with no role go where the focus is");
    assert.match(typed, /await expect\(page\.getByText\("Draft and post on Monday", \{ exact: true \}\)\)\.toBeVisible\(\);\n  \}\);/, "words are checked only for being there");
  });

  test("goes to what setup made for this run, not the one the agent's browser had: at once where the agent went there directly, and only where a click hasn't taken it already where one led there", () => {
    assert.match(way, /\n    await page\.goto\(`\$\{baseURL\}\/boards\/\$\{setup\.board\}`\);/);
    const passing = wayFile({ words: "Here", person: "Maja", did: [{ does: "goto", on: "page", with: "/login" }, ...did], setup: { board: "qiaa4o4hklar" } });
    assert.doesNotMatch(passing, /login/, "an address left for another before anything was done there isn't gone to");
    const led = wayFile({ words: "Here", person: "Maja", did: [...did, { does: "goto", on: "page", with: "/cards/qiaa4o4hklar", led: true }], setup: { board: "qiaa4o4hklar" } });
    assert.match(led, /waitForURL\(`\$\{baseURL\}\/cards\/\$\{setup\.board\}`, \{ timeout: 3000 \}\)\.catch\(\(\) => page\.goto\(`\$\{baseURL\}\/cards\/\$\{setup\.board\}`\)\)/);
  });

  test("is done as the person the agent was, and named by the moment's words, which its file is named by too", () => {
    assert.match(way, /test\.use\(\{ person: "Maja" \}\);/);
    assert.equal(wordsIn(way), "Cards now say WEB-1");
    assert.equal(fileOf("Cards now say WEB-1"), "cards-now-say-web-1.ts");
    assert.equal(wordsIn(wayFile({ words: 'The "Save" button is gone', person: "Sam", did: [], setup: {} })), 'The "Save" button is gone');
  });

  test("checks again what the moment is about: that it's there, what it says, and whether it can be changed", () => {
    const about = { role: "textbox", name: "Card prefix", value: "BS", disabled: true };
    const checked = wayFile({ words: "The prefix can't be changed", person: "Sam", did: [], setup: {}, about });
    assert.match(checked, /await expect\(page\.getByRole\("textbox", \{ name: "Card prefix", exact: true \}\)\)\.toBeVisible\(\);/);
    assert.match(checked, /\.toHaveValue\("BS"\);/);
    assert.match(checked, /\.not\.toBeEditable\(\);/);
    assert.doesNotMatch(wayIn(checked), /expect\(/, "going there by hand, nothing's checked");
  });

  test("found otherwise when run again, says what it looked for and what it found, as the agent would", () => {
    const gone = whyStopped("Error: \x1b[2mexpect(\x1b[22mlocator).toBeVisible() failed\n\nLocator: getByRole('link', { name: 'My cards', exact: true })\nExpected: visible\nTimeout: 5000ms\nError: element(s) not found\n\nCall log:");
    assert.deepEqual(gone, { why: "no link “My cards” was to be seen", checked: true });
    const stuck = whyStopped("expect(locator).toBeEnabled() failed\n\nLocator:  getByRole('button', { name: 'Save', exact: true })\nExpected: enabled\nReceived: disabled\nTimeout:  5000ms");
    assert.equal(stuck.why, "button “Save” was disabled, not enabled");
    const words = whyStopped("expect(locator).toBeVisible() failed\n\nLocator: getByText('Don\\'t panic', { exact: true })\nExpected: visible\nError: element(s) not found");
    assert.equal(words.why, "no words “Don't panic” were to be seen");
  });

  test("stopped on the way, says what it was to do and to what, never Playwright's words; anything else, as it was said", () => {
    const missing = whyStopped("TimeoutError: locator.click: Timeout 10000ms exceeded.\nCall log:\n\x1b[2m  - waiting for getByRole('button', { name: 'Close', exact: true })\x1b[22m\n");
    assert.deepEqual(missing, { why: "no button “Close” was there to click" });
    const stuck = whyStopped("TimeoutError: locator.fill: Timeout 10000ms exceeded.\nCall log:\n  - waiting for getByRole('textbox', { name: 'Title', exact: true })\n  - locator resolved to <input disabled/>\n  - element is not enabled\n");
    assert.equal(stuck.why, "textbox “Title” was there, but couldn't be filled in");
    assert.deepEqual(whyStopped("page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/"), { why: "page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/", asSaid: true });
  });

  test("does the way there before the moment's step, and only what the moment shows in it; going there by hand does both", () => {
    const shown = wayFile({ words: "The prefix is WEB", person: "Maja", did: did.slice(0, 4), setup: { board: "qiaa4o4hklar" }, from: 2 });
    const [way, step] = shown.split('await test.step("The prefix is WEB"');
    assert.match(way!, /^  await page\.getByRole\("link", \{ name: "Settings", exact: true \}\)\.click\(\);$/m);
    assert.doesNotMatch(step!, /Settings/);
    assert.match(step!, /fill\("WEB"\)[\s\S]*name: "Save"/);
    assert.match(wayIn(shown), /Settings[\s\S]*fill\("WEB"\)[\s\S]*Save/);
    assert.doesNotMatch(wayIn(shown), /test\.step/);
  });

  test("scrolls where the agent had before each thing it did: the way at once, ending where the moment's first is done; the moment as a person scrolls; and ends where the agent is", () => {
    const scrolled = (y: number, done: Done): Done => ({ ...done, scrolled: { x: 0, y } });
    const footer = [did[0]!, scrolled(0, did[1]!), scrolled(1200, did[3]!), scrolled(0, did[2]!)];
    const shown = wayFile({ words: "Back to top", person: "Maja", did: footer, setup: {}, from: 2, scrolled: { x: 0, y: 600 } });
    const [way, step] = shown.split('await test.step("Back to top"');
    assert.match(way!, /window\.scrollTo\(x, y\), \[0, 1200\]\);\n  await test\.step|window\.scrollTo\(x, y\), \[0, 1200\]\);$/m);
    assert.match(step!, /name: "Save"[\s\S]*behavior: "smooth" \}\), \[0, 0\]\);\n.*fill\("WEB"\)/);
    assert.match(step!, /waitForFunction[\s\S]*\[0, 600\], \{ timeout: 3000 \}\)\.catch/);
    const still = wayFile({ words: "The footer", person: "Maja", did: footer.slice(0, 2), setup: {}, from: 2, scrolled: { x: 0, y: 1200 } });
    assert.match(still.split("await test.step(")[0]!, /window\.scrollTo\(x, y\), \[0, 1200\]\);/, "a still's first frame is where the agent is");
  });

  test("puts each part of the page that scrolls by itself where the agent had it, as it does the page: the way at once, the moment as a person scrolls, ending where the agent is; a page loaded starts them at their start", () => {
    const results = { on: "#results", role: "region", name: "Results" };
    const inside = (y: number, done: Done): Done => ({ ...done, scrolled: { x: 0, y: 0, parts: [{ ...results, x: 0, y }] } });
    const panel = [did[0]!, inside(0, did[1]!), inside(2400, did[3]!), inside(2400, did[2]!), inside(600, did[3]!)];
    const shown = wayFile({ words: "The curve", person: "Maja", did: panel, setup: {}, from: 3, scrolled: { x: 0, y: 0, parts: [{ ...results, x: 0, y: 1800 }, { on: "#runs > ul", x: 0, y: 300 }] } });
    const [way, step] = shown.split('await test.step("The curve"');
    const part = 'test.scrollPart(page.getByRole("region", { name: "Results", exact: true })';
    assert.equal(way!.split(part).length, 2, "scrolled once, where it moved");
    assert.match(way!, /scrollPart\(page\.getByRole\("region", \{ name: "Results", exact: true \}\), \[0, 2400\]\);\n  await page\.getByRole\("button", \{ name: "Save"/);
    assert.match(step!, /fill\("WEB"\);\n.*scrollPart\(page\.getByRole\("region", \{ name: "Results", exact: true \}\), \[0, 600\], \{ smooth: true \}\);\n.*name: "Save"/);
    assert.match(step!, /\[0, 1800\], \{ smooth: true \}\);\n.*test\.scrollPart\(page\.locator\("#runs > ul"\), \[0, 300\], \{ smooth: true \}\);/, "ends where the agent is, a part with no name found by its place");
    const still = wayFile({ words: "The curve", person: "Maja", did: panel.slice(0, 3), setup: {}, from: 3, scrolled: { x: 0, y: 0, parts: [{ ...results, x: 0, y: 1800 }] } });
    assert.match(still.split("await test.step(")[0]!, /\[0, 1800\]\);\n/, "a still's first frame is where the agent is, at once");
    const reloaded = wayFile({ words: "Again", person: "Maja", did: [did[0]!, inside(2400, did[1]!), did[0]!, inside(2400, did[1]!)], setup: {} });
    assert.equal(reloaded.split(part).length, 3, "a page loaded has it at its start again");
    assert.match(wayIn(shown), /scrollPart[\s\S]*fill\("WEB"\)/, "going there by hand puts it there too");
  });

  test("brings what the moment first does comfortably into view before it starts, and what it's about before it's checked; a still's on the way; never going there by hand", () => {
    const about = { role: "textbox", name: "Card prefix", value: "WEB", disabled: false };
    const file = wayFile({ words: "The prefix is WEB", person: "Maja", did: did.slice(0, 4), setup: {}, from: 2, about });
    const [way, step] = file.split('await test.step("The prefix is WEB"');
    assert.match(way!, /await test\.inView\(page\.getByRole\("textbox", \{ name: "Card prefix", exact: true \}\), \{ offScreen: true \}\);\n\s*$/);
    assert.match(step!, /name: "Save"[\s\S]*await test\.inView\(page\.getByRole\("textbox", \{ name: "Card prefix", exact: true \}\)\);\n.*expect/);
    const still = wayFile({ words: "The prefix", person: "Sam", did: did.slice(0, 2), setup: {}, from: 2, about });
    assert.match(still.split("await test.step(")[0]!, /await test\.inView\(page\.getByRole\("textbox"/);
    assert.doesNotMatch(wayIn(file), /inView/);
  });

  test("a right click is done again as one, as a card's menu opens", () => {
    const menu = wayFile({ words: "The card's menu", person: "Maja", did: [{ does: "click", on: "#card", role: "link", name: "Write the launch post", button: "right" }], setup: {} });
    assert.match(menu, /getByRole\("link", \{ name: "Write the launch post", exact: true \}\)\.click\(\{ button: "right" \}\);/);
  });

  test("writes where it ended only while it's tried, never in the moment that's kept", () => {
    assert.match(wayFile({ words: "Here", person: "Maja", did, setup: {}, tried: true }), /writeFileSync\(new URL\("\.\/ended\.json"/);
    assert.doesNotMatch(way, /writeFileSync|ended\.json/);
  });
});

describe("a moment run again", () => {
  const thing = (role: string, name: string, x = 10, parts: Partial<Thing> = {}): Thing => ({
    role,
    name,
    words: name,
    box: { x, y: 10, width: 80, height: 20 },
    page: { x, y: 10 },
    look: { color: "rgb(0, 0, 0)", background: "rgba(0, 0, 0, 0)", size: "14px", weight: "400", border: "" },
    ...parts,
  });
  const reading = (...things: Thing[]): Reading => ({ step: "here", at: 0, screen: { width: 1280, height: 800 }, picture: "", things });
  const board = reading(thing("heading", "Website launch"), thing("link", "WEB-1 Write the launch post", 10, { words: "WEB-1 Write the launch post" }));

  test("lands where the page reads the same and the address is the same but for the ids each run made", () => {
    const landed = whatDiffers({ url: "http://localhost:3110/boards/qiaa4o4hklar", reading: board }, { url: "http://localhost:3110/boards/galeikvcthwn", reading: board });
    assert.deepEqual(landed, { differ: [], passing: [], timely: [], address: "/boards/…" });
  });

  test("doesn't land where what's on the page differs, and says what", () => {
    const elsewhere = reading(thing("heading", "Website launch"), thing("link", "BS-1 Write the launch post", 10, { words: "BS-1 Write the launch post" }));
    const { differ } = whatDiffers({ url: "http://localhost:3110/boards/1", reading: board }, { url: "http://localhost:3110/boards/2", reading: elsewhere });
    assert.ok(differ.length && differ.every((line) => /launch post/.test(line)), differ.join("\n"));
  });

  test("says how a thing looks different on each side, never only its unchanged name twice", () => {
    const pressed = reading(thing("button", "Tiles", 10, { look: { color: "rgb(255, 255, 255)", background: "rgb(37, 99, 235)", size: "14px", weight: "400", border: "" } }));
    const { differ } = whatDiffers({ url: "http://localhost/boards", reading: pressed }, { url: "http://localhost/boards", reading: reading(thing("button", "Tiles")) });
    assert.deepEqual(differ, ["button “Tiles” looks different: background rgb(37, 99, 235) where you are, rgba(0, 0, 0, 0) run again; text colour rgb(255, 255, 255) where you are, rgb(0, 0, 0) run again"]);
  });

  test("says what's on each side in a dozen lines at most: many things only run again never hide what's only where you are", () => {
    const boards = (prefix: string, from: number) => Array.from({ length: 14 }, (_, i) => thing("link", `${prefix} board ${i}`, from + i * 40));
    const { differ } = whatDiffers({ url: "http://localhost/boards", reading: reading(...boards("Mine", 10)) }, { url: "http://localhost/boards", reading: reading(...boards("Theirs", 700)) });
    assert.equal(differ.length, 13);
    assert.equal(differ.filter((line) => line.startsWith("only run again")).length, 6);
    assert.equal(differ.filter((line) => line.startsWith("only where you are")).length, 6);
    assert.equal(differ.at(-1), "and 16 more");
  });

  test("doesn't land where what it's about ends scrolled out of sight inside a part of the page that scrolls by itself, and says inside which", () => {
    const about = { role: "heading", name: "Compare curve", disabled: false };
    const here = { url: "http://localhost/runs", reading: board, about, partsAround: ["Results", ""] };
    assert.deepEqual(whatDiffers(here, { url: "http://localhost/runs", reading: board, outOfSight: 0 }).differ, ["heading “Compare curve” is in sight where you are, scrolled out of sight inside “Results” run again"]);
    assert.match(whatDiffers(here, { url: "http://localhost/runs", reading: board, outOfSight: 1 }).differ[0]!, /inside the part of the page around it that scrolls by itself run again$/);
    assert.deepEqual(whatDiffers(here, { url: "http://localhost/runs", reading: board, outOfSight: -1 }).differ, [], "in sight there too, it lands");
  });

  test("says first that it ended on another page, where it did", () => {
    const { differ } = whatDiffers({ url: "http://localhost/boards", reading: board }, { url: "http://localhost/settings", reading: board });
    assert.deepEqual(differ, ["the address: /boards where you are, /settings run again"]);
  });

  test("leaves out a message that passes by itself, as a toast, there in one and gone in the other", () => {
    const toasted = reading(...board.things, thing("status", "Card prefix updated", 600, { live: true }));
    const { differ, passing } = whatDiffers({ url: "http://localhost:3110/boards/1", reading: toasted }, { url: "http://localhost:3110/boards/1", reading: board });
    assert.deepEqual(differ, []);
    assert.equal(passing.length, 1);
  });

  test("leaves out words that tell the time, changed only in their numbers, and never other numbers", () => {
    const at = (synced: string, card: string) => reading(thing("text", synced, 600, { words: synced }), thing("link", card, 10, { words: card }));
    const { differ, timely } = whatDiffers({ url: "http://localhost/boards", reading: at("Synced 3 s ago", "WEB-1 Write") }, { url: "http://localhost/boards", reading: at("Synced 7 s ago", "WEB-1 Write") });
    assert.deepEqual([differ, timely], [[], ["Synced 7 s ago"]]);
    assert.equal(whatDiffers({ url: "http://localhost/boards", reading: at("Synced 3 s ago", "WEB-1 Write") }, { url: "http://localhost/boards", reading: at("Synced 3 s ago", "WEB-2 Write") }).differ.length, 1);
  });

  test("sets aside a number, or letters and digits of the same length, as an id; anything else in an address is a different place", () => {
    assert.equal(sameAddress("http://a/cards/kqtz12ab34cd", "http://a/cards/jywz98yx76wv"), "/cards/…");
    assert.equal(sameAddress("http://a/boards/12/cards/3", "http://a/boards/40/cards/7"), "/boards/…/cards/…");
    assert.equal(sameAddress("http://a/settings/workspace", "http://a/settings/account"), undefined);
    assert.equal(sameAddress("http://a/boards", "http://a/boards/qiaa4o4hklar"), undefined);
    assert.equal(sameAddress("http://a/cards/short", "http://a/cards/other"), undefined);
  });

  test("an address where a note was written says what that run's setup made as setup's, the same place in the agent's run", () => {
    const setup = { workspace: "qdn7k0ctncwq", board: "u8p2drvhftv7", person: "Maja" };
    assert.equal(madeBySetup("/boards/u8p2drvhftv7?view=list", setup), "/boards/${setup.board}?view=list");
    assert.equal(madeBySetup("/settings/account", setup), "/settings/account");
  });
});

describe("the change a command means", () => {
  const copy = async () => {
    const root = await mkdtemp(join(tmpdir(), "playthrough-change-"));
    folders.push(root);
    return repo(root);
  };

  test("is kept in a folder that says it's Playthrough's, and to get the person's notes through it, not its files", async () => {
    const here = await copy();
    await quietly(() => change(here, "Sort cards by date", "Sort them."));
    assert.match(readFileSync(join(here.root, ".playthrough", "README.md"), "utf8"), /Don't read or change these files: run npx playthrough[\s\S]*playthrough wait gets the person's notes/);
    assert.deepEqual(await here.changes.list(), ["sort-cards-by-date"], "and it's no change");
  });

  test("is none until the agent names one, and says how", async () => {
    await assert.rejects(changeHere(await copy()), (error: unknown) => error instanceof Refused && /^Say what the change is first, once: playthrough change "/.test(error.message));
  });

  test("is the one named last in this copy of the app, and naming one again by its title goes back to it", async () => {
    const here = await copy();
    await quietly(() => change(here, "Let admins change the card prefix", "Admins should be able to change the card prefix."));
    assert.equal(await changeHere(here), "let-admins-change-the-card-prefix");
    await quietly(() => change(here, "Keep the cursor in a checklist item", "The cursor jumps to the end."));
    assert.equal(await changeHere(here), "keep-the-cursor-in-a-checklist-item");
    await quietly(() => change(here, "Let admins change the card prefix", "Asked again, in other words."));
    assert.equal(await changeHere(here), "let-admins-change-the-card-prefix");
    const kept = await here.changes.get("let-admins-change-the-card-prefix");
    assert.deepEqual([kept.title, kept.asked], ["Let admins change the card prefix", "Admins should be able to change the card prefix."], "what was asked first stands");
  });

  test("is another copy's own: an agent in each of two worktrees works on its own", async () => {
    const [one, other] = [await copy(), await copy()];
    await quietly(() => change(one, "Comments and activity in tabs", "Put them in tabs."));
    await quietly(() => change(other, "Keep the cursor in a checklist item", "The cursor jumps."));
    assert.equal(await changeHere(one), "comments-and-activity-in-tabs");
    assert.equal(await changeHere(other), "keep-the-cursor-in-a-checklist-item");
  });

  test("needs both a title, as short as a pull request's, and what was asked", async () => {
    const here = await copy();
    await assert.rejects(change(here, "Fix it", undefined), /A change needs both/);
    await assert.rejects(change(here, "Fix the cursor that jumps to the end of a checklist item while you type in it", "It jumps."), /That title is 17 words/);
    assert.equal(idOf("Café: “Smörgås” tabs!"), "cafe-smorgas-tabs");
  });

  test("is never kept in a folder Playthrough keeps for itself, nor taken for another change whose title makes the same name", async () => {
    const here = await copy();
    await assert.rejects(change(here, "Borrowed", "Lend it."), /would be kept in \.playthrough\/borrowed, a folder Playthrough keeps for itself/);
    mkdirSync(join(here.root, ".playthrough", "tried"), { recursive: true });
    await assert.rejects(change(here, "Tried", "Try it."), /\.playthrough\/tried, a folder Playthrough keeps for itself/);
    await quietly(() => change(here, "Sort cards by date", "Sort them."));
    await assert.rejects(change(here, "Sort cards by: date", "Sort them otherwise."), /“Sort cards by: date” would be the change “Sort cards by date”, which is here already/);
    assert.equal((await here.changes.get("sort-cards-by-date")).asked, "Sort them.");
  });

  test("is titled as a person says it, without a commit's prefix", async () => {
    const here = await copy();
    await quietly(() => change(here, "feat: sort cards in a list by due date", "Let me sort the cards."));
    assert.equal(await changeHere(here), "sort-cards-in-a-list-by-due-date");
    assert.equal((await here.changes.get("sort-cards-in-a-list-by-due-date")).title, "Sort cards in a list by due date");
    assert.equal(titleOf("fix(board)!: keep the cursor"), "Keep the cursor");
    assert.equal(titleOf("Search: show matches"), "Search: show matches");
  });

  test("has its moments by their words, found whatever their case", async () => {
    const here = await copy();
    await quietly(() => change(here, "Comments and activity in tabs", "Put them in tabs."));
    const id = await changeHere(here);
    mkdirSync(here.moments(id), { recursive: true });
    writeFileSync(join(here.moments(id), fileOf("Activity is its own tab")), wayFile({ words: "Activity is its own tab", person: "Maja", did: [], setup: {} }));
    writeFileSync(join(here.moments(id), "package.json"), "{}");
    assert.deepEqual(momentsOf(here, id).map((one) => one.words), ["Activity is its own tab"]);
    assert.equal(momentNamed(here, id, "activity is its own TAB").words, "Activity is its own tab");
    assert.throws(() => momentNamed(here, id, "Comments first"), /There's no moment “Comments first”\. The moments: “Activity is its own tab”\./);
  });
});

describe("every moment run again", () => {
  const moment = (name: string, person = "Maja"): Moment => ({ name, length: 5, actions: [], recording: `${fileOf(name)}.json`, person, from: 0 });
  const handedBack: HandBack = { number: 1, by: "Claude Code", moments: [moment("Cards say WEB-1"), moment("The prefix can't be changed", "Sam")], replies: [], finished: "2026-11-12T10:00:00.000Z" };

  test("says of each that it's the same, different and how, or new since it was handed back", () => {
    const changes = [{ id: "c1", words: "“Card prefix” is new", seen: [{ moment: "The prefix can't be changed", at: 4 }] }];
    assert.deepEqual(howEachWent([moment("Cards say WEB-1"), moment("The prefix can't be changed", "Sam"), moment("A hint says what's allowed")], [], handedBack, changes), [
      "“Cards say WEB-1”: the same.",
      "“The prefix can't be changed”: different: “Card prefix” is new.",
      "“A hint says what's allowed”: new.",
    ]);
  });

  test("says where one couldn't get there stopped, and how to get it back as whoever it was", () => {
    const [stopped] = howEachWent([], [{ moment: "The prefix can't be changed", why: "no link “Settings” was there to click" }], handedBack, []);
    assert.equal(
      stopped,
      `“The prefix can't be changed”: couldn't get there: no link “Settings” was there to click. Get there by hand (playthrough as Sam "The prefix can't be changed" goes as far as it can) and mark it again with the same words, or leave it out: playthrough drop "The prefix can't be changed"`,
    );
  });

  test("says whether one stopped on its way there, in what it shows, or got there to find what it's about otherwise", () => {
    const [shows, otherwise] = howEachWent(
      [],
      [
        { moment: "The panel slides out", at: "The panel slides out", why: "no button “Close” was there to click" },
        { moment: "The panel slides in", at: "The panel slides in", why: "no heading “INV-1043” was to be seen", checked: true },
      ],
      handedBack,
      [],
    );
    assert.match(shows!, /^“The panel slides out”: got there, but not through what it shows: no button “Close” was there to click\. /);
    assert.match(otherwise!, /^“The panel slides in”: got there, but no heading “INV-1043” was to be seen\. /);
  });
});

describe("an agent listening", () => {
  test("is one whose wait is still running on this start of the machine, never another process given its number since; one that said nothing of the start is taken to be on this one", async () => {
    const here = repo(await mkdtemp(join(tmpdir(), "playthrough-waiting-")));
    folders.push(here.root);
    assert.equal(await agentWaiting(here, "marked"), false, "nobody yet");
    const stop = await listening(here, "marked");
    assert.equal(await agentWaiting(here, "marked"), true);
    stop();
    assert.equal(await agentWaiting(here, "marked"), false, "gone once it stops");
    const said = (pid: number, what: string) => writeFileSync(join(here.waiting("marked"), String(pid)), what);
    said(process.pid, JSON.stringify({ by: process.pid, boot: "another start of the machine" }));
    assert.equal(await agentWaiting(here, "marked"), false, "a number from before the machine started again");
    said(process.pid, "");
    assert.equal(await agentWaiting(here, "marked"), true, "an agent listening since before the start was noted");
    said(2 ** 22 + 1, "");
    rmSync(join(here.waiting("marked"), String(process.pid)));
    assert.equal(await agentWaiting(here, "marked"), false, "one whose process has ended");
  });

  // As Claude Code runs a command in the background: in a session of its own, through a shell given the command, here
  // with a timeout as well. The agent is this test's process, which started them.
  test("the agent that ran a command is the nearest process above it that isn't only how it was run", { skip: process.platform !== "linux" }, () => {
    const command = `import { agentOf } from ${JSON.stringify(new URL("../src/command.ts", import.meta.url).pathname)}; console.log(JSON.stringify(agentOf()))`;
    const ran = execFileSync("setsid", ["bash", "-c", `timeout 30 sh -c 'node --input-type=module -e "$0"' ${JSON.stringify(command)}`], { encoding: "utf8" });
    const agent = JSON.parse(ran);
    assert.equal(agent.by, process.pid);
    assert.equal(typeof agent.started, "number");
  });

  test("the agent notes were said to has ended only when it's known and its process, the same one, isn't running", { skip: process.platform !== "linux" }, async () => {
    const here = repo(await mkdtemp(join(tmpdir(), "playthrough-gone-")));
    folders.push(here.root);
    mkdirSync(join(here.root, ".playthrough", "marked"), { recursive: true });
    assert.equal(await agentGone(here, "marked"), false, "nothing known, as with notes taken before agents were looked for");
    const said = (agent: object) => writeFileSync(here.working("marked"), JSON.stringify(agent));
    const started = Number(readFileSync(`/proc/${process.pid}/stat`, "utf8").split(") ")[1]!.split(" ")[19]);
    said({ by: process.pid, started });
    assert.equal(await agentGone(here, "marked"), false, "still running");
    said({ by: process.pid, started: started + 1 });
    assert.equal(await agentGone(here, "marked"), true, "another process given its number since");
    said({ by: 2 ** 22 + 1 });
    assert.equal(await agentGone(here, "marked"), true, "ended");
  });
});

describe("notes sent with no agent listening", () => {
  const TOTAL = "total-under-the-invoices-table";
  const said = (words: string): Send => ({ id: newId(), handBack: 1, by: "Kit", sent: new Date().toISOString(), notes: [{ id: newId(), words, on: { handBack: 1, moment: "The total of all eight", at: 1 } }] });
  // The agent that made the change handed it back and was stopped; then the person sent a note on it.
  const leftBehind = async () => {
    const here = repo(await mkdtemp(join(tmpdir(), "playthrough-unheard-")));
    folders.push(here.root);
    await quietly(() => change(here, "Total under the invoices table", "Show the total under the table."));
    await here.changes.saveHandBack(TOTAL, { number: 1, by: "Claude Code", moments: [{ name: "The total of all eight", length: 2, actions: [], recording: "the-total-of-all-eight.json", person: "Ana", from: 0 }], replies: [] });
    await here.changes.finish(TOTAL, 1);
    await here.changes.send(TOTAL, said("Say what it's the total of, like “Total of 3 open invoices”."));
    return here;
  };
  const heard = async (run: () => Promise<unknown>) => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (...words: unknown[]) => void lines.push(words.join(" "));
    try {
      await run();
    } finally {
      console.log = log;
    }
    return lines.join("\n");
  };

  test("are said before anything an agent runs, by whom and on which change, with what gets them, until an agent listens", async () => {
    const here = await leftBehind();
    assert.deepEqual(await unheardSaid(here), [`Kit sent a note on “Total under the invoices table”, and no agent is listening for it. playthrough wait gets it, whatever change you're on.`]);
    const stop = await listening(here, TOTAL);
    assert.deepEqual(await unheardSaid(here), [], "an agent waiting has them");
    stop();
  });

  test("are what wait gives an agent on another change, and what's run here means their change from then on", async () => {
    const here = await leftBehind();
    await quietly(() => change(here, "Show the total of the shown invoices", "A total for what's shown."));
    const told = await heard(() => wait(here));
    assert.match(told, /These notes are on “Total under the invoices table”: what you run here means it now\.\n\nKit said:\n[\s\S]*Kit: Say what it's the total of/);
    assert.doesNotMatch(told, /Waiting for the person/);
    assert.equal(await changeHere(here), TOTAL);
    assert.deepEqual(await unheardSaid(here), [], "taken, they're the agent's");
  });

  test("taken by an agent that ended before answering, they're the next agent's, said and given as if never taken", async () => {
    const here = await leftBehind();
    await quietly(() => change(here, "Show the total of the shown invoices", "A total for what's shown."));
    await quietly(() => wait(here));
    writeFileSync(here.working(TOTAL), JSON.stringify({ by: process.pid }));
    assert.deepEqual(await unheardSaid(here), [], "while the agent that took them runs, they're its");
    writeFileSync(here.working(TOTAL), JSON.stringify({ by: 2 ** 22 + 1 }));
    assert.deepEqual(await unheardSaid(here), [`Kit sent a note on “Total under the invoices table”, and no agent is listening for it. playthrough wait gets it, whatever change you're on.`]);
    await quietly(() => change(here, "Show the total of the shown invoices", "A total for what's shown."));
    assert.match(await heard(() => wait(here)), /These notes are on “Total under the invoices table”[\s\S]*Kit said:[\s\S]*Kit: Say what it's the total of/);
    assert.deepEqual(await unheardSaid(here), [], "said again, they're the new agent's");
  });

  test("are what wait gives an agent that hasn't named a change", async () => {
    const here = await leftBehind();
    rmSync(join(here.root, ".playthrough", "working-on.json"));
    assert.match(await heard(() => wait(here)), /Kit said:[\s\S]*Say what it's the total of/);
    assert.equal(await changeHere(here), TOTAL);
  });
});

describe("a note that only asks something", () => {
  const COUNT = "count-on-every-list";
  const asked = (): Send => ({ id: newId(), handBack: 1, by: "Ivo", sent: new Date().toISOString(), notes: [{ id: "q1", words: "Does the count also update straight away when a card is moved?", on: { handBack: 1, moment: "Counts on every list", at: 1 } }] });
  const heard = async (run: () => Promise<unknown>) => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (...words: unknown[]) => void lines.push(words.join(" "));
    try {
      await run();
    } finally {
      console.log = log;
    }
    return lines.join("\n");
  };
  const aMinuteAgo = (file: string) => utimesSync(file, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  // Handed back, the app untouched since its one moment ran, and a question sent on it, which the agent has taken.
  const questioned = async () => {
    const here = repo(await mkdtemp(join(tmpdir(), "playthrough-asked-")));
    folders.push(here.root);
    execFileSync("git", ["init", "-q"], { cwd: here.root });
    writeFileSync(join(here.root, "list.tsx"), "export const List = () => null;\n");
    aMinuteAgo(join(here.root, "list.tsx"));
    await quietly(() => change(here, "Count on every list", "Show how many cards each list has."));
    await here.changes.saveHandBack(COUNT, { number: 1, by: "Claude Code", moments: [{ name: "Counts on every list", length: 2, actions: [], recording: "counts-on-every-list.json", person: "Ana", from: 0 }], replies: [] });
    await here.changes.saveFile(COUNT, 1, "counts-on-every-list.json", Buffer.from("{}"));
    await here.changes.finish(COUNT, 1);
    await here.changes.send(COUNT, asked());
    const told = await heard(() => wait(here));
    return { here, told };
  };

  test("is said to the agent as one to answer, where only a note asking for a change asks for the app to change", async () => {
    const { told } = await questioned();
    assert.match(told, /Where a note asks for a change, change the app, then run every moment again: playthrough again, which says what's different\. Where it only asks something, answer it: nothing has to change\./);
    assert.match(told, /playthrough answer <note> "<what you did, or your answer, in a line>"/);
  });

  test("is answered with nothing changed, the moments the person saw going on into the next hand-back as they are", async () => {
    const { here } = await questioned();
    await quietly(() => answer(here, "q1", "Yes: it moves with the card, before the page is loaded again."));
    const next = (await here.changes.get(COUNT)).handBacks.find((handBack) => handBack.number === 2)!;
    assert.deepEqual(next.moments.map((moment) => moment.name), ["Counts on every list"]);
    assert.deepEqual(next.replies, [{ note: "q1", words: "Yes: it moves with the card, before the page is loaded again." }]);
    assert.ok(await here.changes.file(COUNT, 2, "counts-on-every-list.json"), "with its recording");
  });

  test("waits for the moments to run again where the app has changed since they ran, before the answer or after it", async () => {
    const { here } = await questioned();
    writeFileSync(join(here.root, "list.tsx"), "export const List = () => 'changed';\n");
    await assert.rejects(answer(here, "q1", "Yes."), /Run playthrough again first: list\.tsx has changed since the moments were run, and the answer goes with the moments as they are now\./);
    aMinuteAgo(join(here.root, "list.tsx"));
    await quietly(() => answer(here, "q1", "Yes."));
    writeFileSync(join(here.root, "list.tsx"), "export const List = () => 'changed again';\n");
    await assert.rejects(wait(here), /list\.tsx has changed since the moments were run\. Run playthrough again, so the person sees them as they are now\./);
  });
});

describe("a note made where Step in didn't work", () => {
  test("says, under the person's words, why it didn't work, whole, as Playthrough said it then", async () => {
    const here = repo(await mkdtemp(join(tmpdir(), "playthrough-cant-step-in-")));
    folders.push(here.root);
    await quietly(() => change(here, "Overdue invoices are easy to chase", "Make overdue invoices easy to see and chase."));
    const id = "overdue-invoices-are-easy-to-chase";
    await here.changes.saveHandBack(id, { number: 1, by: "Claude Code", moments: [{ name: "A reminder goes to Alder Dental", length: 2, actions: [], recording: "a-reminder.json", person: "Sam", from: 0 }], replies: [] });
    await here.changes.finish(id, 1);
    const why = "playthrough/moments/a-reminder.ts couldn't be loaded, because Node says “Cannot find package 'kan-utils' imported from /tmp/kan/a-reminder.ts”.";
    await here.changes.send(id, { id: newId(), handBack: 1, by: "Anna", sent: new Date().toISOString(), notes: [{ id: "s1", words: "Step in doesn't work on this moment.", on: { handBack: 1, moment: "A reminder goes to Alder Dental", at: 1, cantStepIn: why } }] });
    const lines: string[] = [];
    const log = console.log;
    console.log = (...words: unknown[]) => void lines.push(words.join(" "));
    await wait(here).finally(() => (console.log = log));
    const told = lines.join("\n");
    assert.match(told, /s1 {2}on the moment “A reminder goes to Alder Dental”, as Sam\n {4}Anna: Step in doesn't work on this moment\.\n/);
    assert.ok(told.includes(`\n    They pressed Step in on this moment and it didn't work: ${why}\n`), told);
  });
});

describe("the app's people", () => {
  test("say who each is in a few words, as the person reviewing sees it beside their name", () => {
    assert.deepEqual(problemsWithPeople({ people: { Maja: "the admin", Sam: "a member" } }), []);
    const [problem] = problemsWithPeople({ people: { Maja: "the admin", Sam: "Designs for Bright Studio: a member of the workspace, not an admin. On a laptop." } });
    assert.match(problem!, /in 6 words at most, as \{ Maja: "the admin", Sam: "a member" \}\. Say “Sam” so/);
  });
});
