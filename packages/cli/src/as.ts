// The agent's browser: the app, signed in as one of its people, open to the agent's own tool over Chrome's debugging
// port, so it checks its work as someone would use it. Whatever drives it, what's done there is kept as it's done, for
// `playthrough moment` to write as the way there.
//
//   playthrough as <person> ["<moment>"]  starts the app and the browser, signed in as them, and, named, goes a kept
//                                         moment's way there; the browser open already starts again, fresh

import { chromium, request as requests, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
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

// The debugging port a browser here is reached at: this one, unless another copy's browser has it.
const DEBUGGING = 9333;
const LAPTOP = { width: 1280, height: 800 };

// What the browser keeps while the agent works, for `moment` to read: who it's signed in as, what setup made for them,
// and what's been done since it started.
export type Browser = { pid: number; person: string; started: string; setup: Record<string, unknown>; url: string; debugging: number; profile: string; did: Done[]; began: number };
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
  // The field being typed in at its caret, until something else is done.
  let typedIn;
  // Where it was done, so what took the agent to another page is known, however the page got there.
  const keep = (done) => {
    if (done.does !== "type") typedIn = undefined;
    window.__playthroughDid?.({ ...done, address: location.pathname });
  };
  const pressable = "a, button, input, select, textarea, label, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [role=option], [role=combobox], [role=textbox], [contenteditable=''], [contenteditable=true]";
  const words = (element) => (element.innerText?.trim() || element.getAttribute?.("aria-label") || element.value || element.placeholder || "").trim().replace(/\\s+/g, " ").slice(0, 80);
  const thing = (target) => {
    const pressed = target?.closest?.(pressable);
    if (pressed && !pressed.querySelector(pressable)) return pressed;
    for (let at = target; at && at !== (pressed ?? document.body); at = at.parentElement) if (at.nodeType === 1 && words(at)) return at;
    return pressed ?? target;
  };
  const path = ${pathTo};
  // As getByRole finds it, from Chrome's own accessibility tree (ComputedAccessibilityInfo, switched on at launch): by
  // its role and name, and a field the page gives no name by its role alone, which of them it is.
  const nameOf = (element) => (element.computedName || "").trim().replace(/\\s+/g, " ");
  const named = (element) => {
    const role = element.computedRole, name = nameOf(element);
    const field = ["textbox", "searchbox", "combobox", "spinbutton"].includes(role);
    if (!role || (!name && !field) || ["generic", "none", "presentation", "StaticText", "paragraph", "group"].includes(role)) return {};
    const alike = [...document.querySelectorAll("*")].filter((other) => other.computedRole === role && (!name || nameOf(other) === name));
    const nth = alike.indexOf(element);
    return { role, ...(name && { name }), ...((alike.length > 1 || !name) && nth >= 0 && { nth }) };
  };
  // Named as the page shows it with nothing pointed at: Kan's links add their shortcut ("Settings G S") on hover.
  const hovering = ${hovering};
  const own = (element) => (element.innerText ?? "").trim().replace(/\\s+/g, " ");
  const on = (element) => {
    hovering(false);
    try {
      // Words with no role of their own, inside a link or a button, are that link or button.
      for (let at = element; at && at !== document.body; at = at.parentElement) {
        const found = named(at);
        if (found.role) return { on: path(at), ...found };
      }
      // Nothing named holds it: by its words, as getByText finds them, the innermost that says them; and by its place
      // only where it says nothing, as a place moves whenever the page around it does.
      const said = own(element);
      if (said && said.length <= 80) {
        let inner = element;
        for (let child; (child = [...inner.children].find((one) => own(one) === said)); ) inner = child;
        const alike = [...document.body.querySelectorAll("*")].filter((one) => own(one) === said && ![...one.children].some((child) => own(child) === said));
        const nth = alike.indexOf(inner);
        return { on: path(element), text: said, ...(alike.length > 1 && nth >= 0 && { nth }) };
      }
      return { on: path(element) };
    } finally {
      hovering(true);
    }
  };
  window.__playthroughNamed = named;
  window.__playthroughHovering = hovering;
  // A page loaded from another of the app's, by a link followed or a form sent, was led there; one gone to directly wasn't.
  const led = (() => {
    try {
      return new URL(document.referrer).origin === location.origin;
    } catch {
      return false;
    }
  })();
  const arrived = () => keep({ does: "goto", on: "page", with: location.pathname + location.search + location.hash, ...(led && { led }) });
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", arrived, { once: true });
  else arrived();
  addEventListener("click", (e) => {
    const target = thing(e.target);
    if (!target.matches?.("input:not([type=checkbox]):not([type=radio]), textarea, select")) keep({ does: "click", ...on(target), what: words(target) });
  }, true);
  // Words typed where the caret was put, not at the end, are kept as typed there, and what's typed after them too:
  // what a fix to where the caret goes is about. Anywhere else, the field's words once typed are what's kept.
  let typing = false, typingAt;
  addEventListener("beforeinput", (e) => {
    const target = e.target;
    const text = target.isContentEditable ? target.innerText.replace(/\\n$/, "") : target.value ?? "";
    const selection = target.isContentEditable ? getSelection() : undefined;
    // At the end, or over all of it, what's typed makes the field's words whole, as filling it does.
    const whole = selection
      ? selection.toString().replace(/\\n$/, "") === text || (selection.isCollapsed && !!selection.focusNode && (() => { const range = document.createRange(); range.selectNodeContents(target); range.setStart(selection.focusNode, selection.focusOffset); return range.toString().replace(/\\n$/, "") === ""; })())
      : (target.selectionStart === 0 && target.selectionEnd === text.length) || (target.selectionStart === text.length && target.selectionEnd === text.length);
    typing = e.inputType === "insertText" && !!e.data && (typedIn === target || (!!text && !whole));
    // Found as it is before the words change it.
    if (typing && typedIn !== target) typingAt = on(target);
  }, true);
  addEventListener("input", (e) => {
    const target = e.target;
    if (!target.matches?.("input, textarea, select, [contenteditable]")) return;
    if (target.tagName === "SELECT") keep({ does: "selectOption", ...on(target), with: target.value, what: words(target) });
    else if (typing) {
      keep({ does: "type", ...typingAt, with: e.data });
      typedIn = target;
    }
    else if (!["checkbox", "radio"].includes(target.type)) keep({ does: "fill", ...on(target), with: target.isContentEditable ? target.innerText : target.value, what: target.getAttribute("aria-label") || target.placeholder || "" });
  }, true);
  addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches?.("input")) keep({ does: "press", ...on(e.target), with: "Enter", what: words(e.target) });
    // What moves the caret in a field, so what's typed next goes where it went; and Tab, which leaves it, as a field
    // may save on leaving.
    else if ((["Home", "End", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && e.target.matches?.("input, textarea, [contenteditable]")) || (e.key === "Tab" && !e.ctrlKey && !e.metaKey))
      keep({ does: "press", ...(e.target === document.body ? { on: "body" } : on(e.target)), with: e.shiftKey && e.key === "Tab" ? "Shift+Tab" : e.key });
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
  await clearEarlier(repo);
  // Stopped, by Ctrl+C or a kill, what setup made is given back by app.ts's own handling, which this sets up; stopped
  // so that nothing runs after it, the next one gives it back here.
  await keepRunning(app, repo.root);
  await giveBackLeft(setup, repo.borrowed);
  const profile = mkdtempSync(join(tmpdir(), "playthrough-as-"));
  const debugging = await freeFrom(DEBUGGING);
  process.once("exit", () => rmSync(profile, { recursive: true, force: true }));
  // The browser's own first window, rather than one of Playwright's: a tool attaching over the debugging port finds the
  // pages there, signed in, with what's set up here on them, and any page it opens there gets the same.
  const context = await chromium.launchPersistentContext(profile, {
    headless: !process.env.PLAYTHROUGH_HEADED,
    args: [`--remote-debugging-port=${debugging}`, "--enable-blink-features=ComputedAccessibilityInfo"],
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

  const live: Browser = { pid: process.pid, person, started, setup: made.setup, url: app.url, debugging, profile, did: [], began };
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
    // A field's words, typed a key at a time, are what it says once typed; and what's typed at the caret, one run of it.
    if (done.does === "fill" && last?.does === "fill" && last.on === done.on) live.did.pop();
    if (done.does === "type" && last?.does === "type" && last.on === done.on) last.with = `${last.with}${done.with}`;
    else live.did.push(done);
    save();
  });
  await context.addInitScript({ content: NOTING });
  await page.goto(app.url);
  const went = to && (await takeTo(page, to, made.setup, app.url));
  save();
  console.log(`Ready in ${((Date.now() - began) / 1000).toFixed(1)}s: a browser signed in as ${person}, on ${app.url}, what they start from made by playthrough/setup.ts:
  ${JSON.stringify(made.setup)}
Drive it with your own tool over its debugging port, http://localhost:${debugging}${debugging === DEBUGGING ? "" : `, as another copy's browser has ${DEBUGGING}`}:
  agent-browser --cdp ${debugging} snapshot
  or Playwright: chromium.connectOverCDP("http://localhost:${debugging}"), then its first context's page
  or Playwright MCP: --cdp-endpoint http://localhost:${debugging}
${went ? `${went}\n` : ""}When you're looking at what was asked for: playthrough moment "<what's there>"
Ctrl+C ends it, and gives back what was made. playthrough as again starts this browser again from a fresh start.`);
  await new Promise(() => {});
}

// This copy's browser, stopped as Ctrl+C stops it, giving back what was made, once the agent hands back: it was for
// checking the work, and left running it holds the app and its port. Says whether there was one.
export async function stopBrowser(repo: Repo): Promise<boolean> {
  let live: Browser;
  try {
    live = JSON.parse(readFileSync(browserFile(repo), "utf8"));
    process.kill(live.pid, "SIGINT");
  } catch {
    return false;
  }
  for (let waited = 0; waited < 15_000; waited += 250) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      process.kill(live.pid, 0);
    } catch {
      break;
    }
  }
  return true;
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

// What this copy's browser left when it was stopped so that nothing ran after it (TaskStop, a kill -9): the browser
// itself, still holding its port, and its profile; another copy's browser is left as it is. What it made is given back
// once the app is there (giveBackLeft).
async function clearEarlier(repo: Repo) {
  let profile: string | undefined;
  try {
    profile = (JSON.parse(readFileSync(browserFile(repo), "utf8")) as Browser).profile;
  } catch {}
  if (!profile?.startsWith(join(tmpdir(), "playthrough-as-"))) return;
  try {
    execFileSync("pkill", ["-f", `user-data-dir=${profile}`]);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch {}
  rmSync(profile, { recursive: true, force: true });
}

// The port asked for, or the next that nothing is listening on.
async function freeFrom(port: number): Promise<number> {
  const free = await new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
  return free ? port : freeFrom(port + 1);
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
