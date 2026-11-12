// A rough try (explorations/moments-12-nov): the agent checks its own work in a browser Playthrough starts, signed in as
// someone, and says "here". Playthrough keeps the way there, as it was done, and runs it again from a fresh start,
// recorded as a scene is, to see it lands in the same place.
//
//   playthrough as <person>           starts the app and a browser signed in as them, open to the agent's own tool
//   playthrough moment "<words>"      keeps the way there since `as`, and runs it again from a fresh start

import { chromium, request as requests, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { differences, pathTo, type Reading } from "@playthrough/page";
import { quote, Refused, type Did } from "@playthrough/review";
import { keepRunning } from "./app.ts";
import { readPage } from "./read.ts";
import type { Repo } from "./repo.ts";
import { readingsOf } from "./reporter.ts";
import { recorder, runOnce } from "./scenes.ts";
import { make, personIn, setupIn } from "./setup.ts";

const DEBUGGING = 9333;
const LAPTOP = { width: 1280, height: 800 };

// What `as` keeps while the agent works, for `moment` to read.
type Live = { person: string; started: string; setup: Record<string, unknown>; url: string; debugging: number; did: Did[]; began: number };
const folder = (repo: Repo) => join(repo.root, ".playthrough", "moments");
const liveFile = (repo: Repo) => join(folder(repo), "live.json");

// Copied from test.ts, which can't be imported here without becoming a test file.
const DAY = 24 * 60 * 60 * 1000;
const onReviewDay = (started: string, now = Date.now()) => new Date(now - (Math.floor(now / DAY) - Math.floor(Date.parse(started) / DAY)) * DAY);
const seeded = `(() => {
  let seed = 20251026;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;

// What's done in any of the browser's pages, kept as a person's is when they take a scene over (take-over.ts), whoever
// drives: a click, words in a field, Enter in a field, and past what take-over keeps, a key with Ctrl or ⌘ or Escape,
// on whatever has the focus or the page itself. And each page loaded, with its address, as a way of getting there
// that no listener hears. Nothing here is replayed, so what isn't trusted is kept too: a tool may set a field's words
// from a script.
const NOTING = `(() => {
  if (window.top !== window) return;
  const keep = (done) => window.__playthroughDid?.(done);
  const pressable = "a, button, input, select, textarea, label, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [role=option], [role=combobox], [role=textbox], [contenteditable=''], [contenteditable=true]";
  const words = (element) => (element.innerText?.trim() || element.getAttribute?.("aria-label") || element.value || element.placeholder || "").trim().replace(/\\s+/g, " ").slice(0, 80);
  const thing = (target) => {
    const pressed = target?.closest?.(pressable);
    if (pressed && !pressed.querySelector(pressable)) return pressed;
    for (let at = target; at && at !== (pressed ?? document.body); at = at.parentElement) if (at.nodeType === 1 && words(at)) return at;
    return pressed ?? target;
  };
  const path = ${pathTo};
  const arrived = () => keep({ does: "goto", on: "page", with: location.pathname + location.search + location.hash });
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", arrived, { once: true });
  else arrived();
  addEventListener("click", (e) => {
    const on = thing(e.target);
    if (!on.matches?.("input:not([type=checkbox]):not([type=radio]), textarea, select")) keep({ does: "click", on: path(on), what: words(on) });
  }, true);
  addEventListener("input", (e) => {
    const on = e.target;
    if (!on.matches?.("input, textarea, select, [contenteditable]")) return;
    if (on.tagName === "SELECT") keep({ does: "selectOption", on: path(on), with: on.value, what: words(on) });
    else if (!["checkbox", "radio"].includes(on.type)) keep({ does: "fill", on: path(on), with: on.isContentEditable ? on.innerText : on.value, what: on.getAttribute("aria-label") || on.placeholder || "" });
  }, true);
  addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches?.("input")) keep({ does: "press", on: path(e.target), with: "Enter", what: words(e.target) });
    else if ((e.metaKey || e.ctrlKey || e.key === "Escape") && !["Meta", "Control", "Shift", "Alt"].includes(e.key)) {
      const key = [e.ctrlKey && "Control", e.metaKey && "Meta", e.altKey && "Alt", e.shiftKey && "Shift", e.key].filter(Boolean).join("+");
      const focused = document.activeElement && document.activeElement !== document.body ? path(document.activeElement) : "body";
      keep({ does: "press", on: focused, with: key });
    }
  }, true);
})();`;

export async function as(repo: Repo, person: string) {
  const setup = await setupIn(repo.setup);
  personIn(setup, person);
  const app = await repo.app();
  const began = Date.now();
  await keepRunning(app, repo.root);
  const profile = await mkdtemp(join(tmpdir(), "playthrough-as-"));
  // The browser's own first window, rather than one of Playwright's: a tool attaching over the debugging port finds the
  // pages there, signed in, with what's set up here on them, and any page it opens there gets the same.
  const context = await chromium.launchPersistentContext(profile, {
    headless: !process.env.PLAYTHROUGH_HEADED,
    args: [`--remote-debugging-port=${DEBUGGING}`],
    ...setup.use,
    baseURL: app.url,
    locale: "en-US",
    timezoneId: "UTC",
    viewport: LAPTOP,
    handleSIGINT: false,
  });
  const started = new Date().toISOString();
  await context.clock.setSystemTime(onReviewDay(started));
  await context.addInitScript({ content: seeded });
  const page = context.pages()[0] ?? (await context.newPage());
  const request = await requests.newContext({ baseURL: app.url });
  const made = await make(setup, repo.borrowed, { page, request, baseURL: app.url, person });
  await setup.signIn?.({ page, person, setup: made.setup });

  const live: Live = { person, started, setup: made.setup, url: app.url, debugging: DEBUGGING, did: [], began };
  mkdirSync(folder(repo), { recursive: true });
  const save = () => writeFileSync(liveFile(repo), JSON.stringify(live, null, 2));
  await context.exposeBinding("__playthroughDid", (_source, done: Did) => {
    const last = live.did.at(-1);
    if (done.does === "fill" && last?.does === "fill" && last.on === done.on) live.did.pop();
    live.did.push(done);
    save();
  });
  await context.addInitScript({ content: NOTING });
  await page.goto(app.url);
  save();
  console.log(`Ready in ${((Date.now() - began) / 1000).toFixed(1)}s: a browser signed in as ${person}, on ${app.url}, what they start from made by playthrough/setup.ts:
  ${JSON.stringify(made.setup)}
Drive it with your own tool over its debugging port, http://localhost:${DEBUGGING}:
  agent-browser --cdp ${DEBUGGING} snapshot
  or Playwright: chromium.connectOverCDP("http://localhost:${DEBUGGING}"), then its first context's page
When you're looking at what was asked for: playthrough moment "<who, where, what's there>"
Ctrl+C ends it, and gives back what was made.`);
  const end = async () => {
    await context.close().catch(() => {});
    await made.giveBack().catch(() => {});
    await rm(profile, { recursive: true, force: true });
    process.exit(0);
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, end);
  await new Promise(() => {});
}

export async function moment(repo: Repo, words: string) {
  if (!existsSync(liveFile(repo))) throw new Refused(["There's no browser to keep a moment from. Start one: playthrough as <person>"]);
  const live: Live = JSON.parse(readFileSync(liveFile(repo), "utf8"));
  const began = Date.now();

  // Where the agent is now, as the page is read at a step's end.
  const browser = await chromium.connectOverCDP(`http://localhost:${live.debugging}`).catch(() => {
    throw new Refused([`The browser from playthrough as ${live.person} isn't running any more. Start it again.`]);
  });
  const pages = browser.contexts().flatMap((context) => context.pages()).filter((page) => page.url().startsWith(live.url));
  const here = pages.at(-1);
  if (!here) throw new Refused([`No page in the browser is on the app (${live.url}).`]);
  const there = { url: here.url(), reading: await readAt(here) };
  await browser.close();

  // The way there, as a scene, run from a fresh start as the same person and recorded as record records one.
  const slug = words.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "moment";
  const scenes = join(folder(repo), slug);
  mkdirSync(scenes, { recursive: true });
  writeFileSync(join(scenes, "package.json"), `{ "type": "module" }\n`);
  writeFileSync(join(scenes, "scene.ts"), sceneOf(words, live));
  const app = await repo.app();
  console.log(`Running the way there again, from a fresh start, as ${live.person}…`);
  const ran = await runOnce({ scenes, only: [words], app, root: repo.root, recorder, before: false, taken: [], started: live.started });
  const recorded = ran.recorded[0];
  const failed = ran.failed[0];
  const took = (Date.now() - began) / 1000;
  const kept = { words, person: live.person, did: live.did, live: { url: there.url, setup: live.setup }, took, sinceAs: (Date.now() - live.began) / 1000 };
  if (!recorded) {
    writeFileSync(join(scenes, "moment.json"), JSON.stringify({ ...kept, landed: false, failed }, null, 2));
    throw new Refused([`It didn't get there again${failed ? `: ${failed.at ? `at ${quote(failed.at)}, ` : ""}${failed.why ?? ""}` : "."}`, `The way there is in ${repo.show(join(scenes, "scene.ts"))}.`]);
  }
  for (const { name, bytes } of recorded.files) {
    mkdirSync(join(scenes, "recording", name, ".."), { recursive: true });
    writeFileSync(join(scenes, "recording", name), bytes);
  }
  const readings: Reading[] = JSON.parse(recorded.files.find((file) => file.name === readingsOf(recorded.scene))!.bytes.toString());
  const again = readings.at(-1)!;
  // The same address, with what setup made for each run in its place, and the same things read on the page.
  const url = (address: string, setup: Record<string, unknown>) => swapped(new URL(address).pathname + new URL(address).search, setup);
  const ended: { url: string; setup: Record<string, unknown> } = JSON.parse(readFileSync(join(scenes, "ended.json"), "utf8"));
  const endedAt = ended.url;
  // Each run makes its own board, so the address is the same once what setup made for each is set aside.
  const sameAddress = url(there.url, live.setup) === url(endedAt, ended.setup);
  // A message that comes and goes by itself, as a toast, is there or not by how long ago it came.
  const passing = (one: (typeof all)[number]) => ("now" in one ? one.now : one.then).live;
  const { differences: all } = differences(there.reading, again);
  const differ = all.filter((one) => !passing(one));
  const landed = !differ.length;
  if (all.length > differ.length) console.log(`Left out, as messages that pass: ${all.filter(passing).map(said).join("; ")}.`);
  writeFileSync(join(scenes, "moment.json"), JSON.stringify({ ...kept, landed, again: { url: endedAt, length: recorded.scene.length }, differences: differ.map(said) }, null, 2));
  console.log(`\nKept ${quote(words)} in ${repo.show(scenes)}, ${took.toFixed(1)}s, ${((Date.now() - live.began) / 1000).toFixed(0)}s since playthrough as.`);
  console.log(`Run again from a fresh start, it ${landed ? "landed where you are" : `ended somewhere else: ${differ.length} ${differ.length > 1 ? "things differ" : "thing differs"}:\n${differ.slice(0, 12).map((one) => `  ${said(one)}`).join("\n")}`}.`);
  console.log(`Address: here ${new URL(there.url).pathname}, again ${new URL(endedAt).pathname}${sameAddress ? " (the same, but for what setup made)" : " (not the same)"}.`);
}

// The page as a step's end reads it, with the picture left out.
async function readAt(page: Page): Promise<Reading> {
  await page.waitForLoadState().catch(() => {});
  await page.waitForTimeout(500);
  return { step: "here", at: 0, picture: "", ...(await readPage(page)) };
}

// An address with what setup made written as setup's: the board made for this run is the board made for that one.
function swapped(address: string, setup: Record<string, unknown>) {
  let out = address;
  for (const [key, value] of Object.entries(setup)) if (typeof value === "string" && value.length > 6) out = out.split(value).join(`\${setup.${key}}`);
  return out;
}

const said = (one: ReturnType<typeof differences>["differences"][number]) =>
  "now" in one && "then" in one ? `${one.what}: ${one.then.role} “${one.then.name}” → “${one.now.name}”` : one.what === "new" ? `only again: ${one.now.role} “${one.now.name}”` : `only here: ${one.then.role} “${one.then.name}”`;

// The way there, written as a scene: each page gone to, and what was done on each, on what's at its path.
function sceneOf(words: string, live: Live): string {
  const lines = live.did.map((did) => {
    const at = JSON.stringify(did.on);
    const what = did.what ? ` // ${did.what.replace(/\n/g, " ")}` : "";
    const given = JSON.stringify(did.with ?? "");
    if (did.does === "goto") {
      const address = "`${baseURL}" + swapped(String(did.with), live.setup) + "`";
      // Gone to where an action led already, it's there; gone to directly, it goes.
      return `    await page.waitForURL(${address}, { timeout: 3000 }).catch(() => page.goto(${address}));`;
    }
    if (did.does === "fill") return `    await page.locator(${at}).fill(${given});${what}`;
    if (did.does === "type") return `    await page.locator(${at}).pressSequentially(${given});${what}`;
    if (did.does === "selectOption") return `    await page.locator(${at}).selectOption(${given});${what}`;
    if (did.does === "press") return did.on === "body" ? `    await page.keyboard.press(${given});` : `    await page.locator(${at}).press(${given});${what}`;
    return `    await page.locator(${at}).click();${what}`;
  });
  return `import { writeFileSync } from "node:fs";
import { test } from "playthrough/test";

test.use({ person: ${JSON.stringify(live.person)} });

test(${JSON.stringify(words)}, async ({ page, setup, baseURL }) => {
  await test.step(${JSON.stringify(words)}, async () => {
${lines.join("\n")}
  });
  writeFileSync(new URL("./ended.json", import.meta.url), JSON.stringify({ url: page.url(), setup }));
});
`;
}
