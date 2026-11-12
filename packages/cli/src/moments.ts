// A rough try (explorations/moments-12-nov): the agent checks its own work in a browser Playthrough starts, signed in as
// someone, and says "here". Playthrough keeps the way there, as it was done, and runs it again from a fresh start,
// recorded as a scene is, to see it lands in the same place.
//
//   playthrough as <person>           starts the app and a browser signed in as them, open to the agent's own tool
//   playthrough moment "<what's there>" ["<what it's about>"]
//                                     keeps the way there since `as`, and runs it again from a fresh start

import { chromium, request as requests, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { differences, pathTo, type Reading } from "@playthrough/page";
import { quote, Refused } from "@playthrough/review";
import { keepRunning } from "./app.ts";
import { hovering, readPage, unhovered } from "./read.ts";
import type { Repo } from "./repo.ts";
import { readingsOf } from "./reporter.ts";
import { recorder, runOnce, type Ran } from "./scenes.ts";
import { giveBackLeft, make, personIn, setupIn } from "./setup.ts";

const DEBUGGING = 9333;
const LAPTOP = { width: 1280, height: 800 };

// What was done, as take-over keeps a person's (Did), and what it was done on as getByRole finds it: its role and name,
// and which of those alike it was, where it isn't the only one. Only by its path where it has no role and name.
type Done = { does: string; on: string; with?: string; what?: string; role?: string; name?: string; nth?: number };
// What `as` keeps while the agent works, for `moment` to read.
type Live = { pid: number; person: string; started: string; setup: Record<string, unknown>; url: string; debugging: number; did: Done[]; began: number };
const folder = (repo: Repo) => join(repo.root, ".playthrough", "moments");
const liveFile = (repo: Repo) => join(folder(repo), "live.json");
const againFile = (repo: Repo) => join(folder(repo), "again.json");

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
  // As getByRole finds it, from Chrome's own accessibility tree (ComputedAccessibilityInfo, switched on at launch).
  const named = (element) => {
    const role = element.computedRole, name = (element.computedName || "").trim().replace(/\\s+/g, " ");
    if (!role || !name || ["generic", "none", "presentation", "StaticText", "paragraph", "group"].includes(role)) return {};
    const alike = [...document.querySelectorAll(element.tagName + ", [role]")].filter((other) => other.computedRole === role && (other.computedName || "").trim().replace(/\\s+/g, " ") === name);
    const nth = alike.indexOf(element);
    return { role, name, ...(alike.length > 1 && nth >= 0 && { nth }) };
  };
  // Named as the page shows it with nothing pointed at: Kan's links add their shortcut ("Settings G S") on hover.
  const hovering = ${hovering};
  const on = (element) => {
    hovering(false);
    try {
      // Words with no role of their own, inside a link or a button, are that link or button.
      for (let at = element; at && at !== document.body; at = at.parentElement) {
        const found = named(at);
        if (found.role) return { on: path(at), ...found };
      }
      return { on: path(element) };
    } finally {
      hovering(true);
    }
  };
  window.__playthroughNamed = named;
  window.__playthroughHovering = hovering;
  const arrived = () => keep({ does: "goto", on: "page", with: location.pathname + location.search + location.hash });
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", arrived, { once: true });
  else arrived();
  addEventListener("click", (e) => {
    const target = thing(e.target);
    if (!target.matches?.("input:not([type=checkbox]):not([type=radio]), textarea, select")) keep({ does: "click", ...on(target), what: words(target) });
  }, true);
  addEventListener("input", (e) => {
    const target = e.target;
    if (!target.matches?.("input, textarea, select, [contenteditable]")) return;
    if (target.tagName === "SELECT") keep({ does: "selectOption", ...on(target), with: target.value, what: words(target) });
    else if (!["checkbox", "radio"].includes(target.type)) keep({ does: "fill", ...on(target), with: target.isContentEditable ? target.innerText : target.value, what: target.getAttribute("aria-label") || target.placeholder || "" });
  }, true);
  addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches?.("input")) keep({ does: "press", ...on(e.target), with: "Enter", what: words(e.target) });
    else if ((e.metaKey || e.ctrlKey || e.key === "Escape") && !["Meta", "Control", "Shift", "Alt"].includes(e.key)) {
      const key = [e.ctrlKey && "Control", e.metaKey && "Meta", e.altKey && "Alt", e.shiftKey && "Shift", e.key].filter(Boolean).join("+");
      const focused = document.activeElement && document.activeElement !== document.body ? on(document.activeElement) : { on: "body" };
      keep({ does: "press", ...focused, with: key });
    }
  }, true);
})();`;

export async function as(repo: Repo, person: string) {
  const setup = await setupIn(repo.setup);
  personIn(setup, person);
  const app = await repo.app();
  const began = Date.now();
  // A browser open already starts again from a fresh start, as this person, rather than a new one starting.
  if (await startAgain(repo, person, began)) return;
  await clearEarlier();
  // Stopped, by Ctrl+C or a kill, what setup made is given back by app.ts's own handling, which this sets up; stopped
  // so that nothing runs after it, the next one gives it back here.
  await keepRunning(app, repo.root);
  await giveBackLeft(setup, repo.borrowed);
  const profile = mkdtempSync(join(tmpdir(), "playthrough-as-"));
  process.once("exit", () => rmSync(profile, { recursive: true, force: true }));
  // The browser's own first window, rather than one of Playwright's: a tool attaching over the debugging port finds the
  // pages there, signed in, with what's set up here on them, and any page it opens there gets the same.
  const context = await chromium.launchPersistentContext(profile, {
    headless: !process.env.PLAYTHROUGH_HEADED,
    args: [`--remote-debugging-port=${DEBUGGING}`, "--enable-blink-features=ComputedAccessibilityInfo"],
    ...setup.use,
    baseURL: app.url,
    locale: "en-US",
    timezoneId: "UTC",
    viewport: LAPTOP,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  const started = new Date().toISOString();
  await context.clock.setSystemTime(onReviewDay(started));
  await context.addInitScript({ content: seeded });
  const page = context.pages()[0] ?? (await context.newPage());
  const request = await requests.newContext({ baseURL: app.url });
  let made = await make(setup, repo.borrowed, { page, request, baseURL: app.url, person });
  await setup.signIn?.({ page, person, setup: made.setup });

  const live: Live = { pid: process.pid, person, started, setup: made.setup, url: app.url, debugging: DEBUGGING, did: [], began };
  mkdirSync(folder(repo), { recursive: true });
  const save = () => writeFileSync(liveFile(repo), JSON.stringify(live, null, 2));
  // Asked to start again (startAgain): what was made is given back, the browser forgets who it was signed in as, and
  // what every scene starts from is made again, for whoever's asked for; the way there starts again from the app's start.
  process.on("SIGUSR1", async () => {
    try {
      const { person: next } = JSON.parse(readFileSync(againFile(repo), "utf8"));
      personIn(setup, next);
      await made.giveBack();
      await context.clearCookies();
      for (const open of context.pages().slice(1)) await open.close();
      await page.goto(app.url);
      await page.evaluate(() => (localStorage.clear(), sessionStorage.clear()));
      made = await make(setup, repo.borrowed, { page, request, baseURL: app.url, person: next });
      await setup.signIn?.({ page, person: next, setup: made.setup });
      Object.assign(live, { person: next, setup: made.setup, did: [], began: Date.now() });
      await page.goto(app.url);
      save();
    } catch (error) {
      writeFileSync(againFile(repo), JSON.stringify({ failed: String((error as Error)?.message ?? error) }));
    }
  });
  await context.exposeBinding("__playthroughDid", (_source, done: Done) => {
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
  or Playwright MCP: --cdp-endpoint http://localhost:${DEBUGGING}
When you're looking at what was asked for: playthrough moment "<who, where, what's there>"
Ctrl+C ends it, and gives back what was made. playthrough as again starts this browser again from a fresh start.`);
  await new Promise(() => {});
}

// The browser open already, told to start again as this person, and said ready once it has: in a few seconds, where a
// new one takes ten.
async function startAgain(repo: Repo, person: string, began: number): Promise<boolean> {
  let live: Live;
  try {
    live = JSON.parse(readFileSync(liveFile(repo), "utf8"));
    process.kill(live.pid, 0);
  } catch {
    return false;
  }
  writeFileSync(againFile(repo), JSON.stringify({ person }));
  process.kill(live.pid, "SIGUSR1");
  for (let waited = 0; waited < 120_000; waited += 250) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const again = JSON.parse(readFileSync(againFile(repo), "utf8"));
    if (again.failed) throw new Refused([`The browser open already couldn't start again as ${person}: ${again.failed}. Stop it (Ctrl+C), then run this again.`]);
    const now: Live = JSON.parse(readFileSync(liveFile(repo), "utf8"));
    if (now.began > began)
      return (
        console.log(`Started again in ${((Date.now() - began) / 1000).toFixed(1)}s, in the browser open already: signed in as ${person}, on ${now.url}, from a fresh start made by playthrough/setup.ts:
  ${JSON.stringify(now.setup)}
Your tool stays attached at http://localhost:${now.debugging}. When you're looking at what was asked for: playthrough moment "<who, where, what's there>"`),
        true
      );
  }
  throw new Refused([`The browser open already didn't start again within two minutes. Stop it (Ctrl+C), then run this again.`]);
}

// What a browser stopped so that nothing ran after it left (TaskStop, a kill -9): the browser itself, still holding the
// port, and its profile. What it made is given back once the app is there (giveBackLeft).
async function clearEarlier() {
  try {
    execFileSync("pkill", ["-f", `playthrough-as-.*remote-debugging-port=${DEBUGGING}|remote-debugging-port=${DEBUGGING}.*playthrough-as-`]);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch {}
  for (const name of readdirSync(tmpdir())) if (name.startsWith("playthrough-as-")) rmSync(join(tmpdir(), name), { recursive: true, force: true });
}

// What a moment is about, read live: one thing on the page, by its role and name, with what can be checked of it again.
type About = { role: string; name: string; value?: string; disabled: boolean; checked?: boolean };

export async function moment(repo: Repo, words: string, onWords?: string) {
  if (!existsSync(liveFile(repo))) throw new Refused(["There's no browser to keep a moment from. Start one: playthrough as <person>"]);
  const live: Live = JSON.parse(readFileSync(liveFile(repo), "utf8"));
  // Who and where, the person sees from the moment itself: the words say only what's there, short enough to sit under
  // a picture of it.
  const counted = words.trim().split(/\s+/).length;
  if (counted > 10)
    throw new Refused([`That's ${counted} words. Say only what's there, in under eight (“Cards now say WEB-1 to WEB-5”): the person already sees who it is and where.`]);
  const began = Date.now();

  // Where the agent is now, as the page is read at a step's end.
  const browser = await chromium.connectOverCDP(`http://localhost:${live.debugging}`).catch(() => {
    throw new Refused([`The browser from playthrough as ${live.person} isn't running any more. Start it again.`]);
  });
  const pages = browser.contexts().flatMap((context) => context.pages()).filter((page) => page.url().startsWith(live.url));
  const here = pages.at(-1);
  if (!here) throw new Refused([`No page in the browser is on the app (${live.url}).`]);
  const there = { url: here.url(), reading: await readAt(here), about: await aboutOn(here, words, onWords) };
  if (onWords && !there.about) throw new Refused([`Nothing on the page is called ${quote(onWords)}, as a button, a field or a heading is. Say it as the page names it, or leave it out.`]);
  await browser.close();

  // The way there, as a scene, run from a fresh start as the same person and recorded as record records one: tried in
  // a folder of its own, and kept only if it lands, in place of one kept before by the same words.
  const slug = `${live.person} ${words}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "moment";
  const keptIn = join(folder(repo), slug);
  const scenes = join(folder(repo), "trying", slug);
  rmSync(scenes, { recursive: true, force: true });
  mkdirSync(scenes, { recursive: true });
  writeFileSync(join(scenes, "package.json"), `{ "type": "module" }\n`);
  writeFileSync(join(scenes, "scene.ts"), sceneOf(words, live, there.about));
  const app = await repo.app();
  console.log(`Running the way there again, from a fresh start, as ${live.person}…`);
  const ran = await runOnce({ scenes, only: [words], app, root: repo.root, recorder, before: false, taken: [], started: live.started });
  const recorded = ran.recorded[0];
  const failed = ran.failed[0];
  const notKept = (why: string) => {
    rmSync(scenes, { recursive: true, force: true });
    return new Refused([`Not kept: run again from a fresh start, ${why}`, "Tell the person only about moments that landed. Fix what's said, or get there another way, and mark it again."]);
  };
  if (!recorded) {
    if (there.about && failed?.why?.includes("expect(")) throw notKept(`it got there, but ${aboutSaid(there.about)} wasn't so: ${failed.why}`);
    throw notKept(`it didn't get there${failed ? `: ${failed.at ? `at ${quote(failed.at)}, ` : ""}${failed.why ?? ""}` : "."}`);
  }
  const readings: Reading[] = JSON.parse(recorded.files.find((file) => file.name === readingsOf(recorded.scene))!.bytes.toString());
  const again = readings.at(-1)!;
  const endedAt: string = JSON.parse(readFileSync(join(scenes, "ended.json"), "utf8")).url;
  // Each run makes its own board and cards, so addresses are compared with their ids set aside.
  const address = addressOf(there.url, endedAt);
  // A message that comes and goes by itself, as a toast, is there or not by how long ago it came.
  const passing = (one: (typeof all)[number]) => ("now" in one ? one.now : one.then).live;
  const { differences: all } = differences(there.reading, again);
  const differ = all.filter((one) => !passing(one));
  const unlike = [
    ...differ.slice(0, 12).map((one) => `  ${said(one)}`),
    ...(address === undefined ? [`  the address: ${new URL(there.url).pathname} here, ${new URL(endedAt).pathname} again`] : []),
  ];
  if (unlike.length) throw notKept(`it ended somewhere else. What differs from where you are:\n${unlike.join("\n")}`);

  for (const { name, bytes } of recorded.files) {
    mkdirSync(join(scenes, "recording", name, ".."), { recursive: true });
    writeFileSync(join(scenes, "recording", name), bytes);
  }
  const took = (Date.now() - began) / 1000;
  writeFileSync(join(scenes, "moment.json"), JSON.stringify({ words, person: live.person, about: there.about, did: live.did, live: { url: there.url, setup: live.setup }, took, landed: true, again: { url: endedAt, length: recorded.scene.length } }, null, 2));
  rmSync(keptIn, { recursive: true, force: true });
  renameSync(scenes, keptIn);
  await onThePage(repo, recorded).catch((error) => console.log(`It isn't on the page: ${error?.problems?.join(" ") ?? error}`));
  if (all.length) console.log(`Left out, as messages that pass: ${all.map(said).join("; ")}.`);
  console.log(`\nKept ${quote(words)} in ${repo.show(keptIn)}, ${took.toFixed(1)}s: run again from a fresh start, it landed where you are.`);
  if (there.about) console.log(`It's about ${aboutSaid(there.about)}, checked again on the way: it held.`);
  console.log(`Compared: what's read on the page, and the address with the ids each run made set aside (${address}, the same).`);
}

// Each moment, as a scene of one review, "marked", in its one round, so the page shows it as it shows a scene: a try.
// playthrough open marked shows them.
async function onThePage(repo: Repo, recorded: Ran["recorded"][number]) {
  const id = "marked";
  if (!(await repo.reviews.list()).includes(id)) await repo.reviews.start(id, "Moments marked", "What the agent marked as it checked its work");
  const round = (await repo.reviews.get(id)).rounds.find((round) => round.number === 1);
  rmSync(join(repo.root, ".playthrough", id, "rounds", "1", "round.json"), { force: true });
  for (const { name, bytes } of recorded.files) await repo.reviews.saveFile(id, 1, name, bytes);
  const scenes = [...(round?.scenes ?? []).filter((scene) => scene.name !== recorded.scene.name), recorded.scene];
  // A finished round is never saved again, so for this try it's written anew and finished again, the page showing only
  // what's finished.
  await repo.reviews.saveRound(id, { number: 1, by: "Agent", scenes, replies: [], accounts: {} });
  await repo.reviews.finish(id, 1);
}

// The page as a step's end reads it, with nothing pointed at, and the picture left out.
async function readAt(page: Page): Promise<Reading> {
  await page.waitForLoadState().catch(() => {});
  await page.waitForTimeout(500);
  return { step: "here", at: 0, picture: "", ...(await unhovered(page, () => readPage(page))) };
}

// Two addresses, part by part, with the ids in them set aside: where they differ, a part that's a number in both, or
// letters and digits of one length, as Kan's ids are (qiaa4o4hklar, galeikvcthwn), is an id each run made for itself.
// Said as the address with those parts as "…", or nothing where they aren't the same.
function addressOf(here: string, again: string): string | undefined {
  const [these, those] = [new URL(here).pathname.split("/"), new URL(again).pathname.split("/")];
  if (these.length !== those.length) return undefined;
  const id = (one: string, other: string) => /^\d+$/.test(one + other) || (one.length === other.length && one.length >= 8 && /^[a-z0-9_-]+$/i.test(one + other));
  const parts = these.map((part, i) => (part === those[i] ? part : id(part, those[i]!) ? "…" : undefined));
  return parts.includes(undefined) ? undefined : parts.join("/");
}

// What the moment is about: the thing named, or else the thing on the page whose name its words say, the longest, a
// field before a heading. Worked out, only a name of two words or more: one word, as a person's name, says too little.
async function aboutOn(page: Page, words: string, onWords?: string): Promise<About | undefined> {
  return page.evaluate(
    ({ words, onWords }) => {
      const named = (window as any).__playthroughNamed;
      if (!named) return undefined;
      const said = (onWords ?? words).toLowerCase();
      const hovering = (window as any).__playthroughHovering;
      hovering(false);
      const all = [...document.querySelectorAll("a, button, input, select, textarea, h1, h2, h3, h4, [role]")].map((element) => ({ element, ...named(element) }));
      hovering(true);
      const candidates = all
        .filter((one) => one.role && one.name && (onWords ? one.name.toLowerCase() === said : /\s/.test(one.name) && said.includes(one.name.toLowerCase())))
        // A field or a control before a heading of the same name: what can be changed is what's checked.
        .sort((a, b) => b.name.length - a.name.length || Number(a.role === "heading") - Number(b.role === "heading"));
      const found = candidates[0];
      if (!found) return undefined;
      const element = found.element as HTMLInputElement;
      const field = "value" in element && ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
      return {
        role: found.role,
        name: found.name,
        ...(field && { value: element.value }),
        disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true" || element.readOnly === true,
        ...(["checkbox", "radio"].includes(element.type) && { checked: element.checked }),
      };
    },
    { words, onWords },
  );
}

const aboutSaid = (about: About) =>
  `${about.role} “${about.name}”${about.value !== undefined ? `, saying “${about.value}”` : ""}${about.disabled ? ", which can't be changed" : ""}${about.checked !== undefined ? (about.checked ? ", checked" : ", not checked") : ""}`;

// An address with what setup made written as setup's: the board made for this run is the board made for that one.
function swapped(address: string, setup: Record<string, unknown>) {
  let out = address;
  for (const [key, value] of Object.entries(setup)) if (typeof value === "string" && value.length > 6) out = out.split(value).join(`\${setup.${key}}`);
  return out;
}

const said = (one: ReturnType<typeof differences>["differences"][number]) =>
  "now" in one && "then" in one ? `${one.what}: ${one.then.role} “${one.then.name}” → “${one.now.name}”` : one.what === "new" ? `only again: ${one.now.role} “${one.now.name}”` : `only here: ${one.then.role} “${one.then.name}”`;

// The way there, written as a scene: each page gone to, and what was done on each, found as getByRole finds it, or by
// its path where it has no role and name. Then what it's about, as it was.
function sceneOf(words: string, live: Live, about?: About): string {
  const lines = live.did.map((did) => {
    const at = did.role && did.name ? `getByRole(${JSON.stringify(did.role)}, { name: ${JSON.stringify(did.name)}, exact: true })${did.nth !== undefined ? `.nth(${did.nth})` : ""}` : `locator(${JSON.stringify(did.on)})`;
    const what = did.what && !did.name ? ` // ${did.what.replace(/\n/g, " ")}` : "";
    const given = JSON.stringify(did.with ?? "");
    if (did.does === "goto") {
      const address = "`${baseURL}" + swapped(String(did.with), live.setup) + "`";
      // Gone to where an action led already, it's there; gone to directly, it goes.
      return `    await page.waitForURL(${address}, { timeout: 3000 }).catch(() => page.goto(${address}));`;
    }
    if (did.does === "fill") return `    await page.${at}.fill(${given});${what}`;
    if (did.does === "type") return `    await page.${at}.pressSequentially(${given});${what}`;
    if (did.does === "selectOption") return `    await page.${at}.selectOption(${given});${what}`;
    if (did.does === "press") return did.on === "body" ? `    await page.keyboard.press(${given});` : `    await page.${at}.press(${given});${what}`;
    return `    await page.${at}.click();${what}`;
  });
  const thing = about && `page.getByRole(${JSON.stringify(about.role)}, { name: ${JSON.stringify(about.name)}, exact: true })`;
  const checks = !about
    ? []
    : [
        `    await expect(${thing}).toBeVisible();`,
        ...(about.value !== undefined ? [`    await expect(${thing}).toHaveValue(${JSON.stringify(about.value)});`] : []),
        ...(about.value !== undefined || ["button", "checkbox", "radio", "switch", "combobox", "textbox"].includes(about.role)
          ? [about.disabled ? `    await expect(${thing}).${about.value !== undefined ? "not.toBeEditable" : "toBeDisabled"}();` : `    await expect(${thing}).toBeEnabled();`]
          : []),
        ...(about.checked !== undefined ? [`    await expect(${thing}).toBeChecked({ checked: ${about.checked} });`] : []),
      ];
  return `import { writeFileSync } from "node:fs";
import { expect, test } from "playthrough/test";

test.use({ person: ${JSON.stringify(live.person)} });

test(${JSON.stringify(words)}, async ({ page, setup, baseURL }) => {
  await test.step(${JSON.stringify(words)}, async () => {
${[...lines, ...checks].join("\n")}
  });
  writeFileSync(new URL("./ended.json", import.meta.url), JSON.stringify({ url: page.url() }));
});
`;
}
