// The agent's browser: the app, signed in as one of its people, open to the agent's own tool over Chrome's debugging
// port, so it checks its work as someone would use it. Whatever drives it, what's done there is kept as it's done, for
// `playthrough moment` to write as the way there.
//
//   playthrough as <person> ["<moment>"]  starts the app and the browser, signed in as them, and, named, goes a kept
//                                         moment's way there; the browser open already starts again, fresh

import { chromium, request as requests, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathTo } from "@playthrough/page";
import { quote, Refused } from "@playthrough/review";
import { keepRunning } from "./app.ts";
import { changeHere, momentNamed } from "./change.ts";
import { hovering } from "./read.ts";
import type { Repo } from "./repo.ts";
import { giveBackLeft, make, personIn, problemsWithPeople, setupIn } from "./setup.ts";
import { wayIn, type Done } from "./way.ts";

const DEBUGGING = 9333;
const LAPTOP = { width: 1280, height: 800 };

// What the browser keeps while the agent works, for `moment` to read: who it's signed in as, what setup made for them,
// and what's been done since it started.
export type Browser = { pid: number; person: string; started: string; setup: Record<string, unknown>; url: string; debugging: number; did: Done[]; began: number };
export const browserFile = (repo: Repo) => join(repo.root, ".playthrough", "browser.json");
// Asked to start again, as whom, and where to: written by the next `as`, read by the one running.
const againFile = (repo: Repo) => join(repo.root, ".playthrough", "browser-again.json");

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

export async function as(repo: Repo, person: string, at?: string) {
  const to = at === undefined ? undefined : await momentNamed(repo, await changeHere(repo), at);
  const setup = await setupIn(repo.setup);
  const problems = problemsWithPeople(setup);
  if (problems.length) throw new Refused(problems);
  personIn(setup, person);
  const app = await repo.app();
  const began = Date.now();
  // A browser open already starts again from a fresh start, as this person, rather than a new one starting.
  if (await startAgain(repo, person, began, to?.words)) return;
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
  // On the change's day, as each moment's way is run again, so what's dated reads the same in both.
  const started = await changeHere(repo).then((id) => repo.reviews.get(id).then((change) => change.started), () => new Date().toISOString());
  await context.clock.setSystemTime(onReviewDay(started));
  await context.addInitScript({ content: seeded });
  const page = context.pages()[0] ?? (await context.newPage());
  const request = await requests.newContext({ baseURL: app.url });
  let made = await make(setup, repo.borrowed, { page, request, baseURL: app.url, person });
  await setup.signIn?.({ page, person, setup: made.setup });

  const live: Browser = { pid: process.pid, person, started, setup: made.setup, url: app.url, debugging: DEBUGGING, did: [], began };
  mkdirSync(join(repo.root, ".playthrough"), { recursive: true });
  const save = () => writeFileSync(browserFile(repo), JSON.stringify(live, null, 2));
  // Asked to start again (startAgain): what was made is given back, the browser forgets who it was signed in as, and
  // what every scene starts from is made again, for whoever's asked for; the way there starts again from the app's start.
  process.on("SIGUSR1", async () => {
    try {
      const { person: next, at: there } = JSON.parse(readFileSync(againFile(repo), "utf8"));
      personIn(setup, next);
      await made.giveBack();
      await context.clearCookies();
      for (const open of context.pages().slice(1)) await open.close();
      await page.goto(app.url);
      await page.evaluate(() => (localStorage.clear(), sessionStorage.clear()));
      made = await make(setup, repo.borrowed, { page, request, baseURL: app.url, person: next });
      await setup.signIn?.({ page, person: next, setup: made.setup });
      Object.assign(live, { person: next, setup: made.setup, did: [] });
      await page.goto(app.url);
      const went = there ? await takeTo(page, await momentNamed(repo, await changeHere(repo), there), made.setup, app.url) : undefined;
      writeFileSync(againFile(repo), JSON.stringify({ went }));
      // Ready only now: what's kept as it goes there is saved on the way, and the one waiting goes by this.
      live.began = Date.now();
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
  const went = to && (await takeTo(page, to, made.setup, app.url));
  save();
  console.log(`Ready in ${((Date.now() - began) / 1000).toFixed(1)}s: a browser signed in as ${person}, on ${app.url}, what they start from made by playthrough/setup.ts:
  ${JSON.stringify(made.setup)}
Drive it with your own tool over its debugging port, http://localhost:${DEBUGGING}:
  agent-browser --cdp ${DEBUGGING} snapshot
  or Playwright: chromium.connectOverCDP("http://localhost:${DEBUGGING}"), then its first context's page
  or Playwright MCP: --cdp-endpoint http://localhost:${DEBUGGING}
${went ? `${went}\n` : ""}When you're looking at what was asked for: playthrough moment "<what's there>"
Ctrl+C ends it, and gives back what was made. playthrough as again starts this browser again from a fresh start.`);
  await new Promise(() => {});
}

// The browser open already, told to start again as this person, and said ready once it has: in a few seconds, where a
// new one takes ten.
async function startAgain(repo: Repo, person: string, began: number, at?: string): Promise<boolean> {
  let live: Browser;
  try {
    live = JSON.parse(readFileSync(browserFile(repo), "utf8"));
    process.kill(live.pid, 0);
  } catch {
    return false;
  }
  writeFileSync(againFile(repo), JSON.stringify({ person, at }));
  process.kill(live.pid, "SIGUSR1");
  for (let waited = 0; waited < 120_000; waited += 250) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const now: Browser = JSON.parse(readFileSync(browserFile(repo), "utf8"));
    const again = JSON.parse(readFileSync(againFile(repo), "utf8"));
    if (again.failed) throw new Refused([`The browser open already couldn't start again as ${person}: ${again.failed}. Stop it (Ctrl+C), then run this again.`]);
    if (now.began > began)
      return (
        console.log(`Started again in ${((Date.now() - began) / 1000).toFixed(1)}s, in the browser open already: signed in as ${person}, on ${now.url}, from a fresh start made by playthrough/setup.ts:
  ${JSON.stringify(now.setup)}
${again.went ? `${again.went}\n` : ""}Your tool stays attached at http://localhost:${now.debugging}. When you're looking at what was asked for: playthrough moment "<what's there>"`),
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

// Done in the browser as the moment's way there does it, on what setup made for this browser, as far as it goes; and
// said, where it got.
async function takeTo(page: Page, to: { words: string; file: string }, setup: Record<string, unknown>, baseURL: string): Promise<string> {
  const going = new Function("page", "setup", "baseURL", `return (async () => {\n${wayIn(readFileSync(to.file, "utf8"))}\n})();`) as (page: Page, setup: unknown, baseURL: string) => Promise<void>;
  return going(page, setup, baseURL).then(
    () => `It's at the moment ${quote(to.words)}, by the way the moment got there.`,
    (error) => `It couldn't get all the way to ${quote(to.words)}: ${String(error?.message ?? error).split("\n")[0]}. Go on from there by hand.`,
  );
}
