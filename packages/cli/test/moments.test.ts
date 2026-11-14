// What moments promise: the way to one is kept as a person would say it and run again from a fresh start, a moment is
// kept only where that lands, the change a command means is the one named last in that copy of the app, and running
// every moment again says of each whether it's the same.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import type { Reading, Thing } from "@playthrough/page";
import { Refused, type Round, type Scene } from "@playthrough/change";
import { change, changeHere, idOf, momentNamed, titleOf, momentsOf } from "../src/change.ts";
import { howEachWent } from "../src/moments.ts";
import { repo } from "../src/repo.ts";
import { problemsWithPeople } from "../src/setup.ts";
import { agentWaiting, listening } from "../src/wait.ts";
import { fileOf, sameAddress, sceneOf, wayIn, whatDiffers, wordsIn, type Done } from "../src/way.ts";

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
  const way = sceneOf({ words: "Cards now say WEB-1", person: "Maja", did, setup: { board: "qiaa4o4hklar" } });

  test("is written as a person would say each step: by role and name, which one where several share them, by its words where nothing names it, and by its place only where it says nothing", () => {
    assert.match(way, /await page\.getByRole\("link", \{ name: "Settings", exact: true \}\)\.click\(\);/);
    assert.match(way, /await page\.getByRole\("textbox", \{ name: "Card prefix", exact: true \}\)\.fill\("WEB"\);/);
    assert.match(way, /getByRole\("button", \{ name: "Save", exact: true \}\)\.nth\(1\)\.click\(\);/);
    assert.match(way, /await page\.locator\("#__next > div > span"\)\.click\(\); \/\/ Saved/);
    assert.match(way, /await page\.getByText\("post on Monday", \{ exact: true \}\)\.nth\(1\)\.click\(\);/);
    assert.match(way, /await page\.keyboard\.press\("Meta\+k"\);/);
  });

  test("types where the caret was put, as it was typed there, and finds a field the page gives no name by which of its kind it is", () => {
    const typed = sceneOf({
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
    const inWords = sceneOf({ words: "Here", person: "Maja", did: [{ does: "press", on: "#__next p", text: "post on Monday", with: "Home" }, { does: "type", on: "#__next p", text: "post on Monday", with: "Draft and " }], setup: {} });
    assert.match(inWords, /await page\.keyboard\.press\("Home"\);\n    await page\.keyboard\.type\("Draft and "\);/, "keys on words with no role go where the focus is");
    assert.match(typed, /await expect\(page\.getByText\("Draft and post on Monday", \{ exact: true \}\)\)\.toBeVisible\(\);\n  \}\);/, "words are checked only for being there");
  });

  test("goes to what setup made for this run, not the one the agent's browser had: at once where the agent went there directly, and only where a click hasn't taken it already where one led there", () => {
    assert.match(way, /\n    await page\.goto\(`\$\{baseURL\}\/boards\/\$\{setup\.board\}`\);/);
    const passing = sceneOf({ words: "Here", person: "Maja", did: [{ does: "goto", on: "page", with: "/login" }, ...did], setup: { board: "qiaa4o4hklar" } });
    assert.doesNotMatch(passing, /login/, "an address left for another before anything was done there isn't gone to");
    const led = sceneOf({ words: "Here", person: "Maja", did: [...did, { does: "goto", on: "page", with: "/cards/qiaa4o4hklar", led: true }], setup: { board: "qiaa4o4hklar" } });
    assert.match(led, /waitForURL\(`\$\{baseURL\}\/cards\/\$\{setup\.board\}`, \{ timeout: 3000 \}\)\.catch\(\(\) => page\.goto\(`\$\{baseURL\}\/cards\/\$\{setup\.board\}`\)\)/);
  });

  test("is done as the person the agent was, and named by the moment's words, which its file is named by too", () => {
    assert.match(way, /test\.use\(\{ person: "Maja" \}\);/);
    assert.equal(wordsIn(way), "Cards now say WEB-1");
    assert.equal(fileOf("Cards now say WEB-1"), "cards-now-say-web-1.ts");
    assert.equal(wordsIn(sceneOf({ words: 'The "Save" button is gone', person: "Sam", did: [], setup: {} })), 'The "Save" button is gone');
  });

  test("checks again what the moment is about: that it's there, what it says, and whether it can be changed", () => {
    const about = { role: "textbox", name: "Card prefix", value: "BS", disabled: true };
    const checked = sceneOf({ words: "The prefix can't be changed", person: "Sam", did: [], setup: {}, about });
    assert.match(checked, /await expect\(page\.getByRole\("textbox", \{ name: "Card prefix", exact: true \}\)\)\.toBeVisible\(\);/);
    assert.match(checked, /\.toHaveValue\("BS"\);/);
    assert.match(checked, /\.not\.toBeEditable\(\);/);
    assert.doesNotMatch(wayIn(checked), /expect\(/, "going there by hand, nothing's checked");
  });

  test("does the way there before the moment's step, and only what the moment shows in it; going there by hand does both", () => {
    const shown = sceneOf({ words: "The prefix is WEB", person: "Maja", did: did.slice(0, 4), setup: { board: "qiaa4o4hklar" }, from: 2 });
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
    const shown = sceneOf({ words: "Back to top", person: "Maja", did: footer, setup: {}, from: 2, scrolled: { x: 0, y: 600 } });
    const [way, step] = shown.split('await test.step("Back to top"');
    assert.match(way!, /window\.scrollTo\(x, y\), \[0, 1200\]\);\n  await test\.step|window\.scrollTo\(x, y\), \[0, 1200\]\);$/m);
    assert.match(step!, /name: "Save"[\s\S]*behavior: "smooth" \}\), \[0, 0\]\);\n.*fill\("WEB"\)/);
    assert.match(step!, /waitForFunction[\s\S]*\[0, 600\], \{ timeout: 3000 \}\)\.catch/);
    const still = sceneOf({ words: "The footer", person: "Maja", did: footer.slice(0, 2), setup: {}, from: 2, scrolled: { x: 0, y: 1200 } });
    assert.match(still.split("await test.step(")[0]!, /window\.scrollTo\(x, y\), \[0, 1200\]\);/, "a still's first frame is where the agent is");
  });

  test("brings what the moment first does comfortably into view before it starts, and what it's about before it's checked; a still's on the way; never going there by hand", () => {
    const about = { role: "textbox", name: "Card prefix", value: "WEB", disabled: false };
    const moment = sceneOf({ words: "The prefix is WEB", person: "Maja", did: did.slice(0, 4), setup: {}, from: 2, about });
    const [way, step] = moment.split('await test.step("The prefix is WEB"');
    assert.match(way!, /await test\.inView\(page\.getByRole\("textbox", \{ name: "Card prefix", exact: true \}\), \{ offScreen: true \}\);\n\s*$/);
    assert.match(step!, /name: "Save"[\s\S]*await test\.inView\(page\.getByRole\("textbox", \{ name: "Card prefix", exact: true \}\)\);\n.*expect/);
    const still = sceneOf({ words: "The prefix", person: "Sam", did: did.slice(0, 2), setup: {}, from: 2, about });
    assert.match(still.split("await test.step(")[0]!, /await test\.inView\(page\.getByRole\("textbox"/);
    assert.doesNotMatch(wayIn(moment), /inView/);
  });

  test("a right click is done again as one, as a card's menu opens", () => {
    const menu = sceneOf({ words: "The card's menu", person: "Maja", did: [{ does: "click", on: "#card", role: "link", name: "Write the launch post", button: "right" }], setup: {} });
    assert.match(menu, /getByRole\("link", \{ name: "Write the launch post", exact: true \}\)\.click\(\{ button: "right" \}\);/);
  });

  test("writes where it ended only while it's tried, never in the moment that's kept", () => {
    assert.match(sceneOf({ words: "Here", person: "Maja", did, setup: {}, tried: true }), /writeFileSync\(new URL\("\.\/ended\.json"/);
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
});

describe("the change a command means", () => {
  const copy = async () => {
    const root = await mkdtemp(join(tmpdir(), "playthrough-change-"));
    folders.push(root);
    return repo(root);
  };

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
    mkdirSync(here.scenes(id), { recursive: true });
    writeFileSync(join(here.scenes(id), fileOf("Activity is its own tab")), sceneOf({ words: "Activity is its own tab", person: "Maja", did: [], setup: {} }));
    writeFileSync(join(here.scenes(id), "package.json"), "{}");
    assert.deepEqual(momentsOf(here, id).map((one) => one.words), ["Activity is its own tab"]);
    assert.equal(momentNamed(here, id, "activity is its own TAB").words, "Activity is its own tab");
    assert.throws(() => momentNamed(here, id, "Comments first"), /There's no moment “Comments first”\. The moments: “Activity is its own tab”\./);
  });
});

describe("every moment run again", () => {
  const scene = (name: string, person = "Maja"): Scene => ({ name, length: 5, steps: [{ title: name, at: 0 }], recording: `${fileOf(name)}.json`, person, from: 0 });
  const handedBack: Round = { number: 1, by: "Claude Code", scenes: [scene("Cards say WEB-1"), scene("The prefix can't be changed", "Sam")], replies: [], finished: "2026-11-12T10:00:00.000Z" };

  test("says of each that it's the same, different and how, or new since it was handed back", () => {
    const changes = [{ id: "c1", words: "“Card prefix” is new", seen: [{ scene: "The prefix can't be changed", at: 4 }] }];
    assert.deepEqual(howEachWent([scene("Cards say WEB-1"), scene("The prefix can't be changed", "Sam"), scene("A hint says what's allowed")], [], handedBack, changes), [
      "“Cards say WEB-1”: the same.",
      "“The prefix can't be changed”: different: “Card prefix” is new.",
      "“A hint says what's allowed”: new.",
    ]);
  });

  test("says where one couldn't get there stopped, and how to get it back as whoever it was", () => {
    const [stopped] = howEachWent([], [{ scene: "The prefix can't be changed", why: "Timeout 10000ms exceeded, waiting for getByRole('link', { name: 'Settings' })" }], handedBack, []);
    assert.equal(
      stopped,
      `“The prefix can't be changed”: couldn't get there, where the way stopped: “Timeout 10000ms exceeded, waiting for getByRole('link', { name: 'Settings' })”. Get there by hand (playthrough as Sam "The prefix can't be changed" goes as far as it can) and mark it again with the same words, or leave it out: playthrough drop "The prefix can't be changed"`,
    );
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
});

describe("the app's people", () => {
  test("say who each is in a few words, as the person reviewing sees it beside their name", () => {
    assert.deepEqual(problemsWithPeople({ people: { Maja: "the admin", Sam: "a member" } }), []);
    const [problem] = problemsWithPeople({ people: { Maja: "the admin", Sam: "Designs for Bright Studio: a member of the workspace, not an admin. On a laptop." } });
    assert.match(problem!, /in 6 words at most, as \{ Maja: "the admin", Sam: "a member" \}\. Say “Sam” so/);
  });
});
