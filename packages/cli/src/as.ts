// The agent's browser: the app, as one of its people, open to the agent's own tool over Chrome's debugging
// port, so it checks its work as someone would use it. Whatever drives it, what's done there is kept as it's done, for
// `playthrough moment` to write as the way there.
//
//   playthrough as <person> ["<moment>"]  starts the app and the browser, as them, and, named, goes a kept
//                                         moment's way there; the browser open already starts again, fresh. It comes
//                                         back once the browser is ready, and the browser runs on behind it
//   playthrough as <person> <note>        the same, going the way of the note's moment and stopping where it was
//                                         written
//   playthrough stop                      stops it

import { chromium, request as requests, type Page } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clicked, partsAround, pathTo } from "@playthrough/page";
import { allNotes, madeInApp, quote, Refused, type Change } from "@playthrough/change";
import { keepRunning, UNUSED } from "./app.ts";
import { changeHere, momentNamed } from "./change.ts";
import { hovering } from "./read.ts";
import type { Repo } from "./repo.ts";
import { giveBackLeft, make, personIn, problemsWithPeople, setupIn, type Setup } from "./setup.ts";
import { steadied } from "./steady.ts";
import { scrollPart, wayIn, type Done } from "./way.ts";

// The debugging port a browser here is reached at: this one, unless another copy's browser has it.
const DEBUGGING = 9333;
const LAPTOP = { width: 1280, height: 800 };

// What the browser keeps while the agent works, for `moment` to read: who it's open as, what setup made for them,
// and what's been done since it started.
export type Browser = { pid: number; person: string; started: string; setup: Record<string, unknown>; url: string; debugging: number; profile: string; did: Done[]; began: number };
export const browserFile = (repo: Repo) => join(repo.root, ".playthrough", "browser.json");
// Asked to start again, as whom, and where to: written by the next `as`, read by the one running.
const againFile = (repo: Repo) => join(repo.root, ".playthrough", "browser-again.json");

// What's done in any of the browser's pages, kept as a person's is when they step into a moment (step-in.ts), whoever
// drives: a click, words in a field, Enter in a field, and past what stepping in keeps, a key with Ctrl or ⌘ or Escape,
// on whatever has the focus or the page itself. And each page loaded, with its address, as a way of getting there
// that no listener hears. Nothing here is replayed, so what isn't trusted is kept too: a tool may set a field's words
// from a script.
export const NOTING = `(() => {
  if (window.top !== window) return;
  // The field being typed in at its caret, until something else is done; and the field words go into, found as it was
  // before them, until something other than typing is done.
  let typedIn, into;
  // Where it was done, so what took the agent to another page is known, however the page got there; and where the page
  // was scrolled, and each part of it that scrolls by itself, as scrolling is done by no listener here, and a moment
  // starts where the agent was looking.
  const keep = (done) => {
    if (done.does !== "type") typedIn = undefined;
    if (done.does !== "type" && done.does !== "fill") into = undefined;
    window.__playthroughDid?.({ ...done, address: location.pathname, scrolled: scrolled() });
  };
  // A part that scrolls by itself, as a panel, a long list or a dialog's body does, is kept once it's scrolled from its
  // start, and from then on while it's on the page, so one scrolled back is put back too; found again as what's done
  // there is, by its role and name, else its place.
  const moved = new Set();
  const scrolled = () => {
    for (const part of document.body?.querySelectorAll("*") ?? []) if (part.scrollTop || part.scrollLeft) moved.add(part);
    const parts = [...moved].filter((part) => part.isConnected).map((part) => ({ on: path(part), ...asWritten(() => named(part)), x: Math.round(part.scrollLeft), y: Math.round(part.scrollTop) }));
    return { x: Math.round(scrollX), y: Math.round(scrollY), ...(parts.length && { parts }) };
  };
  // Everything here is read as the page shows it with nothing pointed at, as Kan's links add their shortcut ("Settings
  // G S") on hover; and in its words as written, not as its style cases them, as getByRole and getByText find them again:
  // a fold upper-cased by CSS is still named "My boards". Once however deep the reading goes.
  const hovering = ${hovering};
  const written = new CSSStyleSheet();
  written.replaceSync("*, ::before, ::after { text-transform: none !important; }");
  let reading = 0;
  const asWritten = (read) => {
    if (!reading++) hovering(false), (document.adoptedStyleSheets = [...document.adoptedStyleSheets, written]);
    try {
      return read();
    } finally {
      if (!--reading) (document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => sheet !== written)), hovering(true);
    }
  };
  const clicked = ${clicked};
  // A rich-text editor's words are what's been typed in it: it's said by its label or what it asks for, and found by its
  // role and name, or else its place, never by what it says.
  const asks = (editor) => editor.getAttribute("aria-label") || editor.getAttribute("aria-placeholder") || editor.querySelector("[data-placeholder]")?.getAttribute("data-placeholder") || "";
  const words = (element) => asWritten(() => (element.isContentEditable ? asks(element) : element.innerText?.trim() || element.getAttribute?.("aria-label") || element.value || element.placeholder || "").trim().replace(/\\s+/g, " ").slice(0, 80));
  // What was clicked, and its words; on nothing that says any, where it was, saying nothing.
  const thing = (target) => {
    const on = clicked(target);
    return { target: on ?? target, what: on ? words(on) : "" };
  };
  const path = ${pathTo};
  // As getByRole finds it, from Chrome's own accessibility tree (ComputedAccessibilityInfo, switched on at launch): by
  // its role and name, and a field or a switch the page gives no name by its role alone, which of them it is.
  const nameOf = (element) => (element.computedName || "").trim().replace(/\\s+/g, " ");
  const named = (element) => {
    const role = element.computedRole, name = nameOf(element);
    const field = ["textbox", "searchbox", "combobox", "spinbutton", "switch", "checkbox", "radio", "slider"].includes(role);
    if (!role || (!name && !field) || ["generic", "none", "presentation", "StaticText", "paragraph", "group"].includes(role)) return {};
    const alike = [...document.querySelectorAll("*")].filter((other) => other.computedRole === role && (!name || nameOf(other) === name));
    const nth = alike.indexOf(element);
    return { role, ...(name && { name }), ...((alike.length > 1 || !name) && nth >= 0 && { nth }) };
  };
  const own = (element) => (element.innerText ?? "").trim().replace(/\\s+/g, " ");
  const on = (element) => asWritten(() => {
    if (element.isContentEditable) return { on: path(element), ...named(element) };
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
  });
  window.__playthroughNamed = named;
  window.__playthroughAsWritten = asWritten;
  window.__playthroughScrolled = scrolled;
  window.__playthroughPartsAround = ${partsAround};
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
  // A drag, kept only to be said, as nothing here can do it again: pressed, carried more than a click's wobble, and let
  // go, with the page taking the moves for itself on the way, as a card dragged on a board is (a drag-and-drop library
  // cancels them). Selecting words, a scrollbar or a slider, the page leaves the moves be. The click that ends it is
  // the drag's.
  let pressed, carried = false, dragged = false;
  addEventListener("pointerdown", (e) => {
    pressed = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY, target: e.target } : undefined;
    carried = dragged = false;
  }, true);
  // Read once the page has had it.
  for (const move of ["pointermove", "mousemove"]) addEventListener(move, (e) => pressed && setTimeout(() => (carried ||= e.defaultPrevented)), true);
  addEventListener("pointerup", (e) => {
    const from = pressed;
    pressed = undefined;
    if (!from || !carried || Math.hypot(e.clientX - from.x, e.clientY - from.y) <= 10) return;
    const { target, what } = thing(from.target);
    keep({ does: "drag", ...on(target), what });
    dragged = true;
  }, true);
  addEventListener("click", (e) => {
    if (dragged) return void (dragged = false);
    const { target, what } = thing(e.target);
    if (!target.matches?.("input:not([type=checkbox]):not([type=radio]), textarea, select")) keep({ does: "click", ...on(target), what });
  }, true);
  // A right click, as a card's menu opens on a board.
  addEventListener("contextmenu", (e) => {
    const { target, what } = thing(e.target);
    keep({ does: "click", ...on(target), what, button: "right" });
  }, true);
  // Words typed where the caret was put, not at the end, are kept as typed there, and what's typed after them too:
  // what a fix to where the caret goes is about. Anywhere else, the field's words once typed are what's kept.
  let typing = false;
  // Found as it is before the words change it: a rich-text editor said by what it asks for, which typing takes away.
  const field = (target) => ({ target, found: on(target), what: target.isContentEditable ? asks(target) : target.getAttribute("aria-label") || target.placeholder || "" });
  addEventListener("beforeinput", (e) => {
    const target = e.target;
    if (into?.target !== target) into = field(target);
    const text = target.isContentEditable ? asWritten(() => target.innerText).replace(/\\n$/, "") : target.value ?? "";
    const selection = target.isContentEditable ? getSelection() : undefined;
    // At the end, or over all of it, what's typed makes the field's words whole, as filling it does.
    const whole = selection
      ? selection.toString().replace(/\\n$/, "") === text || (selection.isCollapsed && !!selection.focusNode && (() => { const range = document.createRange(); range.selectNodeContents(target); range.setStart(selection.focusNode, selection.focusOffset); return range.toString().replace(/\\n$/, "") === ""; })())
      : (target.selectionStart === 0 && target.selectionEnd === text.length) || (target.selectionStart === text.length && target.selectionEnd === text.length);
    typing = e.inputType === "insertText" && !!e.data && (typedIn === target || (!!text && !whole));
  }, true);
  addEventListener("input", (e) => {
    const target = e.target;
    if (!target.matches?.("input, textarea, select, [contenteditable]")) return;
    if (target.tagName === "SELECT") keep({ does: "selectOption", ...on(target), with: target.value, what: words(target) });
    else {
      // A field set by a script, with no typing before it, is found as it is now.
      const { found, what } = into?.target === target ? into : field(target);
      if (typing) {
        keep({ does: "type", ...found, with: e.data });
        typedIn = target;
      }
      else if (!["checkbox", "radio"].includes(target.type)) keep({ does: "fill", ...found, with: target.isContentEditable ? asWritten(() => target.innerText) : target.value, what });
    }
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
  const to = at === undefined ? undefined : await placeNamed(repo, at);
  const setup = await setupIn(repo.setup);
  const problems = problemsWithPeople(setup);
  if (problems.length) throw new Refused(problems);
  personIn(setup, person);
  const app = await repo.app();
  const began = Date.now();
  // Run by the agent, a browser open already starts again from a fresh start, as this person, rather than a new one
  // starting; else the browser is started behind this command (startBehind), and it's that one that goes on from here.
  if (!process.send) return (await startAgain(repo, setup, person, began, to?.words)) || startBehind(repo);
  await clearEarlier(repo);
  // Stopped, by Ctrl+C or a kill, what setup made is given back by app.ts's own handling, which this sets up; stopped
  // so that nothing runs after it, the next one gives it back here.
  await keepRunning(app, repo.root);
  await giveBackLeft(setup, repo.borrowed);
  const profile = mkdtempSync(join(tmpdir(), "playthrough-as-"));
  const debugging = await freeFrom(DEBUGGING);
  process.once("exit", () => rmSync(profile, { recursive: true, force: true }));
  // The browser's own first window, rather than one of Playwright's: a tool attaching over the debugging port finds the
  // pages there, as the person, with what's set up here on them, and any page it opens there gets the same.
  const context = await chromium.launchPersistentContext(profile, {
    headless: !process.env.PLAYTHROUGH_HEADED,
    args: [`--remote-debugging-port=${debugging}`, "--enable-blink-features=ComputedAccessibilityInfo"],
    // As a recording's, the clipboard is the page's to write to (test.ts).
    permissions: ["clipboard-read", "clipboard-write"],
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
  const started = await changeHere(repo).then((id) => repo.changes.get(id).then((change) => change.started), () => new Date().toISOString());
  await context.addInitScript({ content: steadied(started) });
  const page = context.pages()[0] ?? (await context.newPage());
  const request = await requests.newContext({ baseURL: app.url });
  let made = await make(setup, repo.borrowed, { page, request, baseURL: app.url, person });
  await setup.signIn?.({ page, person, setup: made.setup });

  const live: Browser = { pid: process.pid, person, started, setup: made.setup, url: app.url, debugging, profile, did: [], began };
  mkdirSync(join(repo.root, ".playthrough"), { recursive: true });
  const save = () => writeFileSync(browserFile(repo), JSON.stringify(live, null, 2));
  // When something was last done in it, or it last started again: what its end, left alone, is counted from.
  let used = began;
  // Asked to start again (startAgain): what was made is given back, the browser forgets who it was open as, and
  // what every moment starts from is made again, for whoever's asked for; the way there starts again from the app's start.
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
      const went = there ? await takeTo(page, await placeNamed(repo, there), made.setup, app.url) : undefined;
      writeFileSync(againFile(repo), JSON.stringify({ went }));
      // Ready only now: what's kept as it goes there is saved on the way, and the one waiting goes by this.
      live.began = used = Date.now();
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
    used = Date.now();
    save();
  });
  await context.addInitScript({ content: NOTING });
  await page.goto(app.url);
  const went = to && (await takeTo(page, to, made.setup, app.url));
  save();
  console.log(`Ready in ${((Date.now() - began) / 1000).toFixed(1)}s: ${opened("a browser", repo, setup, person, app.url, made.setup)}
Drive it with your own tool over its debugging port, http://localhost:${debugging}${debugging === DEBUGGING ? "" : `, as another copy's browser has ${DEBUGGING}`}:
  agent-browser --cdp ${debugging} snapshot
  or Playwright: chromium.connectOverCDP("http://localhost:${debugging}"), then its first context's page
  or Playwright MCP: --cdp-endpoint http://localhost:${debugging}
${went ? `${went}\n` : ""}When you've just done what shows the change: playthrough moment "<what's there>"
It runs until you hand back (playthrough wait) or stop it (playthrough stop), or ${UNUSED / 60_000} minutes go by with nothing done in it. playthrough as again starts it again, fresh.`);
  // Said ready, the command the agent ran comes back. Left with nothing done in it for as long as an app is left unused,
  // it stops as Ctrl+C stops it, so an agent that ended without handing back leaves nothing running.
  process.send!("ready");
  process.disconnect();
  setInterval(() => Date.now() - used > UNUSED && process.kill(process.pid, "SIGINT"), 60_000);
}

// Who the browser is, saying only what Playthrough knows: "as Sam" is who the moment is done as, and signed in is said
// only where setup's signIn signed them in. Its default export may have, as signing up on page.request does, but nothing
// tells Playthrough so.
export function opened(browser: string, repo: Repo, setup: Setup, person: string, url: string, made: Record<string, unknown>): string {
  const what = setup.make ? `, what they start from made by playthrough/setup.ts:\n  ${JSON.stringify(made)}` : ".";
  if (setup.signIn) return `${browser} signed in as ${person} by playthrough/setup.ts's signIn, on ${url}${what}`;
  const at = `${browser} on ${url} as ${person}${what}`;
  if (setup.make) return `${at}\nplaythrough/setup.ts has no signIn: they're signed in only if its default export signed them in.`;
  return `${at} Nothing signed them in: ${existsSync(repo.setup) ? "playthrough/setup.ts has no signIn" : "there's no playthrough/setup.ts"}.`;
}

// The browser, started as a process of its own that outlives this one: this command comes back once it says it's
// ready, with everything it said, or, where it ended before then, refuses with it. Stopped before then, it stops it too.
// What it says after is in .playthrough/browser.log.
async function startBehind(repo: Repo) {
  const log = join(repo.root, ".playthrough", "browser.log");
  mkdirSync(join(repo.root, ".playthrough"), { recursive: true });
  const output = openSync(log, "w");
  const browser = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: ["ignore", output, output, "ipc"], detached: true });
  closeSync(output);
  const stopping = () => browser.kill("SIGINT");
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, stopping);
  const ready = await new Promise<boolean>((resolve) => {
    browser.once("message", () => resolve(true));
    browser.once("exit", () => resolve(false));
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.off(signal, stopping);
  const said = readFileSync(log, "utf8").trimEnd();
  if (!ready) throw new Refused([said || `The browser ended before it was ready. Look at .playthrough/browser.log for why.`]);
  browser.disconnect();
  browser.unref();
  console.log(said);
}

// This copy's browser, stopped as Ctrl+C stops it, giving back what was made, once the agent hands back or says stop: it
// was for checking the work, and left running it holds the app and its port. Says whether there was one.
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

export async function stop(repo: Repo) {
  console.log((await stopBrowser(repo)) ? "The browser from playthrough as is stopped." : "There's no browser from playthrough as running here.");
}

// The browser open already, told to start again as this person, and said ready once it has: in a few seconds, where a
// new one takes ten.
async function startAgain(repo: Repo, setup: Setup, person: string, began: number, at?: string): Promise<boolean> {
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
    if (again.failed) throw new Refused([`The browser open already couldn't start again as ${person}: ${again.failed}. Stop it (playthrough stop), then run this again.`]);
    if (now.began > began)
      return (
        console.log(`Started again in ${((Date.now() - began) / 1000).toFixed(1)}s, from a fresh start: ${opened("the browser open already", repo, setup, person, now.url, now.setup)}
${again.went ? `${again.went}\n` : ""}Your tool stays attached at http://localhost:${now.debugging}. When you've just done what shows the change: playthrough moment "<what's there>"`),
        true
      );
  }
  throw new Refused([`The browser open already didn't start again within two minutes. Stop it (playthrough stop), then run this again.`]);
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

// Where `as` goes: a moment, by its words, or a note, by its id, which is its moment as far as the note was written:
// after as many of the things the moment shows as had been done by then.
type Place = { words: string; file: string; note?: string; done?: number };
async function placeNamed(repo: Repo, at: string): Promise<Place> {
  const id = await changeHere(repo);
  const change = await repo.changes.get(id);
  const noted = allNotes(change).get(at.trim())?.note;
  if (!noted?.on) return momentNamed(repo, id, at);
  const on = noted.on;
  const moment = momentNamed(repo, id, on.moment);
  return { ...moment, note: noted.id, ...(!madeInApp(on) && on.at !== undefined && { done: doneBy(change, on.handBack, on.moment, on.at) }) };
}

// How many of the things a moment shows had been done by a time in its recording on a hand-back: all of them, if that's
// its end.
export function doneBy(change: Change, handBack: number, name: string, at: number): number | undefined {
  const moment = change.handBacks.find((one) => one.number === handBack)?.moments.find((one) => one.name === name);
  const shown = moment?.actions.filter((action) => action.at >= moment.from) ?? [];
  const done = shown.filter((action) => action.at <= at).length;
  return moment && done < shown.length ? done : undefined;
}

// Done in the browser as the moment's way there does it, on what setup made for this browser, as far as it goes; and
// said, where it got.
async function takeTo(page: Page, to: Place, setup: Record<string, unknown>, baseURL: string): Promise<string> {
  const going = new Function("page", "setup", "baseURL", "test", `return (async () => {\n${wayIn(readFileSync(to.file, "utf8"), to.done)}\n})();`) as (page: Page, setup: unknown, baseURL: string, test: { scrollPart: typeof scrollPart }) => Promise<void>;
  return going(page, setup, baseURL, { scrollPart }).then(
    () =>
      to.note && to.done !== undefined
        ? `It's where note ${to.note} was written, in the moment ${quote(to.words)}${to.done ? `, after the first ${to.done === 1 ? "thing" : `${to.done} things`} it does` : ", before it does anything"}.`
        : `It's at the moment ${quote(to.words)}, by the way the moment got there.`,
    (error) => `It couldn't get all the way to ${quote(to.words)}: ${String(error?.message ?? error).split("\n")[0]}. Go on from there by hand.`,
  );
}
