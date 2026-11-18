// What stepping in promises: what a moment did only in the page's memory is done again in the person's browser as the
// moment did it, so they land where the recording rests. Each page is a small board, served in Chromium as the app.
// And where it can't, why, said to the person plainly and to the agent whole.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, type Browser, type Page } from "@playwright/test";
import { Refused } from "@playthrough/change";
import { cantStepIn } from "../src/following.ts";
import { whyStopped } from "../src/reporter.ts";
import { SAYS } from "../src/step-in.ts";
import { runAlongside } from "../src/test.ts";

// A card a left click opens and a right click opens a menu on, as on Kan's board.
const BOARD = `<!doctype html><a id="card" href="#">Write the launch post</a><div id="said"></div>
<script>
  card.addEventListener("click", (e) => (e.preventDefault(), (said.innerHTML = "<h1>Write the launch post</h1>")));
  card.addEventListener("contextmenu", (e) => (e.preventDefault(), (said.innerHTML = '<div role="menu">Move to another list</div>')));
</script>`;

let browser: Browser;
let borrowed: string;
before(async () => {
  browser = await chromium.launch();
  borrowed = await mkdtemp(join(tmpdir(), "playthrough-step-in-"));
});
after(async () => {
  await browser.close();
  await rm(borrowed, { recursive: true, force: true });
});

// The app at http://app.test: the board, with what goes into each of its pages where it's stepped into, and a page that
// holds it in a frame, as the viewer does.
async function app(page: Page) {
  await page.route("http://app.test/**", (route) => {
    const board = new URL(route.request().url()).pathname === "/board";
    route.fulfill({ contentType: "text/html", body: board ? BOARD.replace("<a", `<script>${SAYS}</script><a`) : "<!doctype html>" });
  });
}

test("a moment that ends in a menu opened by a right click is stepped into with the menu open, never the card a left click opens", async () => {
  const running = await browser.newPage();
  await app(running);
  const { handed } = await runAlongside(
    running,
    { request: running.request, baseURL: "http://app.test", started: new Date().toISOString(), setup: {}, borrowed },
    async ({ page }) => {
      await page.goto("http://app.test/board");
      await page.getByRole("link", { name: "Write the launch post" }).click({ button: "right" });
    },
    { to: { moment: "The card's menu" } },
  );
  assert.deepEqual(handed?.again?.map(({ does, button }) => ({ does, button })), [{ does: "click", button: "right" }], "kept as a right click");
  await running.close();

  const person = await browser.newPage();
  await app(person);
  await person.goto("http://app.test/");
  const settled = person.evaluate(() => new Promise((done) => addEventListener("message", ({ data }) => data?.playthrough === "settled" && done(true))));
  await person.evaluate((again) => {
    sessionStorage.setItem("playthrough:again", JSON.stringify(again));
    document.body.append(Object.assign(document.createElement("iframe"), { src: "/board" }));
  }, handed!.again!);
  await settled;
  const board = person.frameLocator("iframe");
  assert.equal(await board.getByRole("menu").textContent(), "Move to another list");
  assert.equal(await board.getByRole("heading").count(), 0, "the card isn't opened");
  await person.close();
});

test("in the app, a single Escape is the app's, and twice is Back, the app hearing only the first", async () => {
  const person = await browser.newPage();
  await app(person);
  await person.goto("http://app.test/");
  const settled = person.evaluate(() => new Promise((done) => addEventListener("message", ({ data }) => data?.playthrough === "settled" && done(true))));
  await person.evaluate(() => {
    Object.assign(window, { backs: 0 });
    addEventListener("message", ({ data }) => data?.playthrough === "escape" && (window as unknown as { backs: number }).backs++);
    document.body.append(Object.assign(document.createElement("iframe"), { src: "/board" }));
  });
  await settled;
  const board = person.frames().find((frame) => frame.url().endsWith("/board"))!;
  await board.evaluate(() => (Object.assign(window, { heard: 0 }), addEventListener("keydown", (e) => e.key === "Escape" && (window as unknown as { heard: number }).heard++)));
  await board.focus("#card");
  const said = async () => [await board.evaluate(() => (window as unknown as { heard: number }).heard), await person.evaluate(() => (window as unknown as { backs: number }).backs)];

  await person.keyboard.press("Escape");
  await person.waitForTimeout(600);
  assert.deepEqual(await said(), [1, 0], "once: the app's, and nothing more");
  await person.keyboard.press("Escape");
  await person.keyboard.press("Escape");
  await person.waitForTimeout(100);
  assert.deepEqual(await said(), [2, 1], "twice: the app heard the first, and the second was Back");
  await person.close();
});

test("on the way to where it's stepped into, a key is pressed once the page has come to rest, as it was recorded", async () => {
  const running = await browser.newPage();
  // A card that takes a moment to load which board it's on, and Escape goes back to that board.
  await running.route("http://app.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/card") return setTimeout(() => void route.fulfill({ body: "launch" }), 500);
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><a id="card" href="#">Write the launch post</a>
<script>
  let board;
  card.addEventListener("click", (e) => (e.preventDefault(), fetch("/card").then((answer) => answer.text()).then((name) => (board = name))));
  addEventListener("keydown", (e) => e.key === "Escape" && (location.href = "/board?back-to=" + board));
</script>`,
    });
  });
  const { handed } = await runAlongside(
    running,
    { request: running.request, baseURL: "http://app.test", started: new Date().toISOString(), setup: {}, borrowed },
    async ({ page }) => {
      await page.goto("http://app.test/board");
      await page.getByRole("link", { name: "Write the launch post" }).click();
      await page.keyboard.press("Escape");
    },
    { to: { moment: "Escape goes back to the board" } },
  );
  assert.equal(handed?.url, "http://app.test/board?back-to=launch");
  await running.close();
});

// Where a step in can't happen, the person reads why in a line of their own, over the bar; the agent gets it whole.
test("a moment's file that can't be loaded is said to the person as its steps not loading; the file and Node's words are the agent's", () => {
  const cant = cantStepIn.loaded("playthrough/moments/a-reminder.ts", new Error("Cannot find package 'kan-utils' imported from /tmp/kan/a-reminder.ts\n    at packageResolve (node:internal)"));
  assert.equal(cant.plainly, "This moment's steps couldn't be loaded.");
  assert.deepEqual(cant.problems, ["playthrough/moments/a-reminder.ts couldn't be loaded, because Node says “Cannot find package 'kan-utils' imported from /tmp/kan/a-reminder.ts”."]);
});

test("an app that doesn't start is said to the person as that, whatever stopped it", () => {
  const cant = cantStepIn.started(new Refused(["The app didn't answer at http://localhost:3000 within three minutes of being started. Look at .playthrough/app.log for why."]));
  assert.equal(cant.plainly, "The app didn't start.");
  assert.match(cant.problems[0]!, /app\.log/);
});

test("a moment that stops on the way is said in Playthrough's own words for where it stopped, and in none it doesn't have", () => {
  const missing = cantStepIn.stopped({ at: "Open the settings", ...whyStopped("TimeoutError: locator.click: Timeout 10000ms exceeded.\nCall log:\n  - waiting for getByRole('link', { name: 'Settings', exact: true })\n") });
  assert.equal(missing.plainly, "On the way here, no link “Settings” was there to click.");
  assert.deepEqual(missing.problems, ["This moment can't be opened on the app as it is now: it stopped at “Open the settings”: no link “Settings” was there to click."]);
  const crashed = cantStepIn.stopped({ at: "Open the settings", ...whyStopped("page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/") });
  assert.equal(crashed.plainly, "Something went wrong getting there.");
  assert.match(crashed.problems[0]!, /ERR_CONNECTION_REFUSED/);
});

test("anything else that stops a step in is said to the person as something going wrong, and whole to the agent", () => {
  const cant = cantStepIn.other(new Error("listen EADDRINUSE: address already in use 127.0.0.1:5830"));
  assert.equal(cant.plainly, "Something went wrong getting there.");
  assert.deepEqual(cant.problems, ["listen EADDRINUSE: address already in use 127.0.0.1:5830"]);
  const late = cantStepIn.late();
  assert.equal(late.plainly, "It took more than a minute getting there.");
  assert.equal(cantStepIn.other(late), late, "one said where it was made stays as it was said");
});
