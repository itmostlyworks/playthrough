// Stepping in: runs the moment's moment to where it's stepped into on the app as it is now, then hands the page as it was
// there to the person, in their own browser, to carry on from. It's the real app under their hands, a fresh copy of the
// moment made the way every moment starts, not a picture of it. Playthrough passes everything on to the app, and at
// /step-in gives the browser what the moment's page had: its address, its cookies, and what the app kept in the browser.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, request as ask, type IncomingMessage, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { answerAs, asRecorded, clicked, escapedTwice, pathTo, RIGHT_AFTER } from "@playthrough/page";
import { doneBefore, quote, Refused } from "@playthrough/change";
import { running, using } from "./app.ts";
import { QUIET_DEV_CHROME, recorder, type Handed, type To } from "./run.ts";
import { LONGEST, runTo, writtenOf } from "./following.ts";
import { listen, thisMachine } from "./open.ts";
import { read } from "./read.ts";
import type { App, Repo } from "./repo.ts";
import type { Made } from "./setup.ts";

// Clear of the viewer's, which takes the next free one from 5790 when several are open.
const PORT = 5830;

// Runs the moment to where it's stepped into and passes the app on, then says where: each step in has an address of its
// own, /step-in/<moment>, with the app made for it, so two tabs, or a reload, never share one or take one from the
// other. In the viewer, Step in asks for it where the playhead rests and turns the frame into the app there: nothing is
// run before the first step in on a change, and after it, the one made ahead there is taken (keepReady).
// With it, what setup made for it, so where the person writes a note is said as the same place in the agent's own run.
export async function getReady(repo: Repo, id: string, to: To, waiting?: AbortSignal): Promise<{ port: number; name: string; setup: Record<string, unknown>; checked?: string }> {
  const app = await repo.app();
  const { handed, made, checked, done } = await madeFor(repo, id, to, waiting);
  // One way through for each copy of the app, as each answers at an address of its own.
  if (!passings.has(app.url)) passings.set(app.url, passOn(app));
  const port = await passings.get(app.url)!.catch((error) => {
    passings.delete(app.url);
    void made?.giveBack();
    done();
    throw error;
  });
  // Not counted, so it can't be guessed.
  const name = randomBytes(12).toString("base64url");
  steppedIn.set(name, { repo, id, to, handed, made, done, opened: false, holding: 0 });
  // Never opened, as when the tab closed before the app was there, it's given back a minute on.
  letGoSoon(name, UNOPENED);
  return { port, name, setup: made?.setup ?? {}, ...(checked && { checked }) };
}

// Where the page says it stands, as the run counts it: after so many of what the moment shows, the way there counted
// with them where the moment's file does it inside its step.
export async function placeOf(repo: Repo, id: string, moment: string, after?: number): Promise<To> {
  const handBack = await recorded(repo, id);
  const kept = handBack.moments.find((one) => one.name === moment);
  if (!kept) throw new Refused([`${quote(moment)} isn't among the moments the agent last handed back: they've changed since this page was loaded. Reload it, then step in again.`]);
  return { moment, ...(after !== undefined && { after: doneBefore(kept) + after }) };
}

// The app made for a step in: the one made ahead to the same place, from the moments as they're written now, if there
// is one; else run there. Within one limit from its asking, waiting on the one ahead included, and stopped once nobody's
// waiting for it, which leaves the one ahead where it was: still ahead.
async function madeFor(repo: Repo, id: string, to: To, waiting?: AbortSignal) {
  const until = Date.now() + LONGEST;
  const one = ahead.get(key(repo, id));
  if (one && same(one.to, to)) {
    if (one.written === (await writtenOf(repo, id)).written) {
      const made = await inTime(one.made, until, waiting, []).catch((error) => {
        if (waiting?.aborted) throw error;
      });
      // Not dropped meanwhile, it's this step in's from now on, as one it ran itself; one that failed is run again, so
      // it's said why in words.
      if (made && ahead.get(key(repo, id)) === one) return (clearTimeout(one.untaken), ahead.delete(key(repo, id)), made);
    } else letGoAhead(repo, id, one);
  }
  return make(repo, id, to, until, waiting);
}

// Once someone has stepped in on a change, the app is kept ready where its recording rests, for the next step in there
// to take at once: one place for each change, made the way any step in is, and given back when it's moved on from, or
// not taken within five minutes of last being asked for, so the app's own time unused can start.
export async function keepReady(repo: Repo, id: string, to: To) {
  const { written } = await writtenOf(repo, id);
  const now = ahead.get(key(repo, id));
  if (now && same(now.to, to) && now.written === written) return untakenSoon(repo, id, now);
  if (now) letGoAhead(repo, id, now);
  const stop = new AbortController();
  const one: Ahead = { to, written, made: make(repo, id, to, Date.now() + LONGEST, stop.signal), stop };
  ahead.set(key(repo, id), one);
  // One that fails is dropped: the step in there runs afresh, and says why.
  one.made.catch(() => ahead.get(key(repo, id)) === one && letGoAhead(repo, id, one));
  untakenSoon(repo, id, one);
}
type Ahead = { to: To; written: number; made: ReturnType<typeof make>; stop: AbortController; untaken?: ReturnType<typeof setTimeout> };
const ahead = new Map<string, Ahead>();
const UNTAKEN = 5 * 60_000;
const key = (repo: Repo, id: string) => `${repo.root}\n${id}`;
const same = (one: To, other: To) => one.moment === other.moment && one.after === other.after;

function untakenSoon(repo: Repo, id: string, one: Ahead) {
  clearTimeout(one.untaken);
  one.untaken = setTimeout(() => letGoAhead(repo, id, one), UNTAKEN);
  one.untaken.unref();
}

function letGoAhead(repo: Repo, id: string, one: Ahead) {
  if (ahead.get(key(repo, id)) === one) ahead.delete(key(repo, id));
  clearTimeout(one.untaken);
  one.stop.abort();
  one.made.then(({ made, done }) => (void made?.giveBack(), done()), () => {});
}

// The copy's app running, used while the moment runs there, and then for as long as what it made is the person's.
async function make(repo: Repo, id: string, to: To, until: number, waiting?: AbortSignal) {
  const done = using(repo.root);
  try {
    const app = await repo.app();
    await inTime(running(app, repo.root), until, waiting, [
      `The app hadn't answered at ${app.url} within ${LONGEST / 1000} seconds of being asked for: it may still be starting. Step in again in a moment; if it's as slow again, look at .playthrough/app.log for why.`,
    ]);
    const made = await runTo(repo, id, to, until, waiting);
    return { ...made, done: using(repo.root) };
  } finally {
    done();
  }
}

// What's started goes on by itself (the app keeps starting for whoever asks next); only the waiting for it ends.
function inTime<T>(started: Promise<T>, until: number, waiting: AbortSignal | undefined, late: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const limit = setTimeout(() => reject(new Refused(late)), until - Date.now());
    const away = () => reject(new Refused(["Nobody's waiting for it any more."]));
    waiting?.addEventListener("abort", away, { once: true });
    if (waiting?.aborted) away();
    started.then(resolve, reject).finally(() => (clearTimeout(limit), waiting?.removeEventListener("abort", away)));
  });
}

// Each step in, by its address: where it's to, what its run handed over and what it made, whether its page has been
// opened, and how many of its pages hold it now. What it made is the app the person has: given back once no page holds
// it for a while, as when its tab is closed, reloaded, or stepped in elsewhere, and never while one does, as one
// waiting under the recording after Back. Its address is kept, so opened again it's made afresh, never missing.
type SteppedIn = { repo: Repo; id: string; to: To; handed?: Handed; made?: Made; done?: () => void; opened: boolean; holding: number; letGo?: ReturnType<typeof setTimeout>; opening?: Promise<void> };
const steppedIn = new Map<string, SteppedIn>();
// Long enough for a page of the app to load the next, which holds it again.
const LEFT = 15_000;
const UNOPENED = 60_000;

function letGoSoon(name: string, after: number) {
  const one = steppedIn.get(name);
  if (!one) return;
  clearTimeout(one.letGo);
  one.letGo = setTimeout(() => {
    if (one.holding) return;
    void one.made?.giveBack();
    one.done?.();
    Object.assign(one, { handed: undefined, made: undefined, done: undefined });
  }, after);
  one.letGo.unref();
}

// A page of the app holds its step in for as long as it's open (SAYS).
function held(name: string, request: IncomingMessage, response: ServerResponse) {
  const one = steppedIn.get(name);
  response.writeHead(one?.handed ? 200 : 404, { "content-type": "text/event-stream", "cache-control": "no-store" });
  if (!one?.handed) return void response.end();
  response.write(":\n\n");
  one.holding++;
  clearTimeout(one.letGo);
  request.on("close", () => --one.holding || letGoSoon(name, LEFT));
}

// Opened again, as stepping in again on the same moment reloads its address, it's the app afresh: what the person did
// there before isn't where they step in now; and so it is once what was made has been given back. One opening at a
// time, stopped once nobody's waiting for it.
async function opening(name: string, waiting: AbortSignal): Promise<Handed | undefined> {
  const one = steppedIn.get(name);
  if (!one) return undefined;
  clearTimeout(one.letGo);
  const opened = (one.opening ?? Promise.resolve()).then(async () => {
    if (one.opened || !one.handed) {
      const { handed, made, done } = await madeFor(one.repo, one.id, one.to, waiting);
      void one.made?.giveBack();
      one.done?.();
      Object.assign(one, { handed, made, done });
    }
    one.opened = true;
  });
  one.opening = opened.catch(() => {});
  try {
    await opened;
    return one.handed;
  } finally {
    letGoSoon(name, LEFT);
  }
}

// One way through to the app for as long as Playthrough runs, handing over each step in, by its address.
const passings = new Map<string, Promise<number>>();

async function recorded(repo: Repo, id: string) {
  const change = await repo.changes.get(id);
  const handBack = change.handBacks.at(-1);
  if (!handBack) throw new Refused([`${id} has no moments yet, so there's nothing to step into.`]);
  return handBack;
}

// Everything that isn't /step-in goes to the app as it is, answers and live connections both, as if the browser
// were talking to it directly, so the app sees nothing unusual: its own address, and its own address as where a
// request came from. Only to this machine.
function passOn(app: App): Promise<number> {
  const target = new URL(app.url);
  const server = createServer((request, response) => {
    if (!named(request)) return turnAway(response);
    const [first, second, name] = new URL(request.url ?? "/", "http://playthrough").pathname.split("/").filter(Boolean);
    if (first === "step-in")
      return void opening(second ?? "", waitedFor(response)).then(
        (handed) => (handed ? handOver(second ?? "", handed, response) : said(response, 404, GONE)),
        (error) => said(response, 500, error instanceof Refused ? error.problems.join(" ") : String((error as Error)?.message ?? error)),
      );
    if (first === ".playthrough" && second === "held") return held(name ?? "", request, response);
    // A page is asked for whole, so a word can be added to it: the app is told not to squeeze it.
    const page = /text\/html/.test(request.headers.accept ?? "");
    const headers = asIfDirect(request, target);
    if (page) delete headers["accept-encoding"];
    const forward = ask({ host: target.hostname, port: target.port, method: request.method, path: request.url, headers }, (answer) => {
      const told = fromTheApp(answer, target, request);
      if (!page || !/text\/html/.test(String(answer.headers["content-type"])) || answer.headers["content-encoding"]) {
        response.writeHead(answer.statusCode ?? 502, told);
        return void answer.pipe(response);
      }
      const chunks: Buffer[] = [];
      answer.on("data", (chunk) => chunks.push(chunk));
      answer.on("end", () => {
        const html = Buffer.concat(chunks).toString("utf8");
        const at = html.search(/<head[^>]*>/i);
        const end = at < 0 ? 0 : at + html.slice(at).indexOf(">") + 1;
        const body = html.slice(0, end) + SAYS + (RECORDER ??= `<script>${readFileSync(recorder, "utf8")}</script>`) + html.slice(end);
        delete told["content-length"];
        response.writeHead(answer.statusCode ?? 502, told);
        response.end(body);
      });
    });
    forward.on("error", () => notAnswering(response, app, page));
    request.pipe(forward);
  });
  server.on("upgrade", (request, socket, head) => {
    if (!named(request)) return void socket.destroy();
    const upstream = connect(Number(target.port || 80), target.hostname, () => {
      const headers = Object.entries(asIfDirect(request, target)).flatMap(([name, value]) => [value ?? []].flat().map((one) => `${name}: ${one}`));
      upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${headers.join("\r\n")}\r\n\r\n`);
      upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  return listen(server, PORT);
}

// Asked for by this machine's name: a site that has made its name lead here (DNS rebinding) still asks by its own.
const named = (request: IncomingMessage) => thisMachine(request.headers.host);

function turnAway(response: ServerResponse) {
  response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
  response.end("Playthrough passes the app on to this machine alone, by its name: open it at localhost.");
}

function asIfDirect(request: IncomingMessage, target: URL) {
  const headers = { ...request.headers, host: target.host };
  const from = `http://${request.headers.host}`;
  if (headers.origin) headers.origin = target.origin;
  if (headers.referer?.startsWith(from)) headers.referer = target.origin + headers.referer.slice(from.length);
  return headers;
}

// Taken over in the viewer, the app sits in its frame, and this goes into each of its pages, first. Scrolled where the
// moment's page was, it tells the viewer once it has settled (loaded, its fonts and pictures in, nothing on its way and
// nothing changing for a moment), so the frame turns into it with nothing on screen changing. It tells the viewer where
// the pointer is, and whether it's over words you can type into: the viewer draws the recording's pointer coming to
// yours, hiding the app's own until they meet, and then only your name, beside the app's own. And as every key there
// goes to the app, Escape twice goes back to the viewer instead.
// rrweb's recorder, as every moment has it, for what you do here to be recorded.
let RECORDER: string | undefined;

export const SAYS = `<script>(() => {
  if (window.parent === window) return;
  ${QUIET_DEV_CHROME}
  // This page holds its step in, as long as it's open: closed, reloaded or gone to another, what was made for it is given
  // back once no page holds it.
  const holding = sessionStorage.getItem("playthrough:stepped-in");
  if (holding) new EventSource("/.playthrough/held/" + encodeURIComponent(holding));
  // On the recordings' clock, so what the page says about time reads as it did there.
  const ahead = Number(sessionStorage.getItem("playthrough:clock")) || 0;
  if (ahead) {
    const Real = Date;
    function Shifted(...given) {
      if (!new.target) return new Real(Real.now() + ahead).toString();
      return given.length ? new Real(...given) : new Real(Real.now() + ahead);
    }
    Shifted.prototype = Real.prototype;
    Object.assign(Shifted, { now: () => Real.now() + ahead, parse: Real.parse, UTC: Real.UTC });
    window.Date = Shifted;
  }
  // In the browser the moment was recorded in, whatever yours says: light or dark, still or moving, in its languages.
  const browser = JSON.parse(sessionStorage.getItem("playthrough:browser") || "null");
  if (browser) {
    ${asRecorded.toString()}
    (${answerAs.toString()})(window, browser);
    const languages = browser.languages;
    Object.defineProperty(navigator, "language", { get: () => languages[0] });
    Object.defineProperty(navigator, "languages", { get: () => languages });
    // What the page asks for first, then the recorded languages, where the browser would fall back on its own: [] and
    // "default" mean the browser's.
    const spoken = (locales) => [...(locales == null ? [] : [locales].flat()), ...languages];
    for (const name of ["DateTimeFormat", "NumberFormat", "Collator", "PluralRules", "RelativeTimeFormat", "ListFormat", "DisplayNames", "Segmenter", "DurationFormat"]) {
      const Real = Intl[name];
      if (!Real) continue;
      const Spoken = function (locales, options) { return new.target ? Reflect.construct(Real, [spoken(locales), options], new.target) : Real(spoken(locales), options); };
      Object.assign(Spoken, { prototype: Real.prototype, supportedLocalesOf: Real.supportedLocalesOf });
      Intl[name] = Spoken;
    }
    const speak = (kind, name, at) => {
      const real = kind.prototype[name];
      kind.prototype[name] = function (...given) { given[at] = spoken(given[at]); return real.apply(this, given); };
    };
    for (const name of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]) speak(Date, name, 0);
    speak(Number, "toLocaleString", 0);
    speak(BigInt, "toLocaleString", 0);
    speak(String, "localeCompare", 1);
  }
  let asked = 0, stirred = performance.now();
  const stir = () => (stirred = performance.now());
  const fetching = window.fetch;
  window.fetch = (...args) => { asked++; stir(); return fetching(...args).finally(() => { asked--; stir(); }); };
  const sending = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) { asked++; stir(); this.addEventListener("loadend", () => { asked--; stir(); }); return sending.apply(this, args); };
  new MutationObserver(stir).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const scroll = JSON.parse(sessionStorage.getItem("playthrough:scroll") || "null");
  sessionStorage.removeItem("playthrough:scroll");
  const hidden = document.createElement("style");
  hidden.textContent = "html, html * { cursor: none !important; }";
  document.documentElement.appendChild(hidden);
  // Made ready unseen in the viewer, the page waits as the moment left it, the text cursor where it was: the keyboard goes
  // back to the change until the page is yours, and the app isn't told it left, or a field that saves as it's left, as
  // Kan's checklist item does, would save what was half typed. Leaving, it goes to nothing on the page. Once the page is
  // yours and the keyboard comes in, it's back in that field, the text cursor where it was.
  let left;
  const unheard = (e) => {
    if (window === parent || e.relatedTarget || sessionStorage.getItem("playthrough:yours")) return;
    e.stopImmediatePropagation();
    if (typing(e.target)) left = { field: e.target, at: getSelection().rangeCount ? getSelection().getRangeAt(0).cloneRange() : undefined };
  };
  addEventListener("blur", unheard, true);
  addEventListener("focusout", unheard, true);
  // The keyboard can come in a moment before the page is yours, or after: whichever is last puts it back.
  const back = () => {
    if (!left || !sessionStorage.getItem("playthrough:yours") || !document.hasFocus()) return;
    const { field, at } = left;
    left = undefined;
    if (!field.isConnected) return;
    field.focus({ preventScroll: true });
    if (at && field.isContentEditable) getSelection().removeAllRanges(), getSelection().addRange(at);
  };
  addEventListener("focus", (e) => e.target === window && back());
  // Yours across the pages you go to, until you leave.
  const yours = (mine) => { hidden.disabled = mine; if (mine) sessionStorage.setItem("playthrough:yours", "1"); else sessionStorage.removeItem("playthrough:yours"); };
  yours(!!sessionStorage.getItem("playthrough:yours"));
  addEventListener("message", ({ source, data }) => { if (source === parent && data?.playthrough === "yours") (yours(data.yours), back()); });
  // Taken over, the page is scrolled where the recording was at that moment: made ready at a step's end, it was where
  // the step left it, a screen or more from a moment partway through a page being read. And so is each part of it that
  // scrolls on its own, as Kan's card does inside the page, found by the path back to it.
  addEventListener("message", ({ source, data }) => {
    if (source !== parent || data?.playthrough !== "scroll") return;
    scrollTo({ left: data.x, top: data.y, behavior: "instant" });
    for (const part of data.parts ?? []) document.querySelector(part.path)?.scrollTo({ left: part.x, top: part.y, behavior: "instant" });
  });
  const typing = (target) => !!target?.closest?.('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, [contenteditable=""], [contenteditable=true]');
  // Every move, as it comes: held for a frame, the name trailed the pointer like a smoothed one. Not the earlier raw
  // updates: in a scaled frame, Chrome gives them the page's position rather than the app's.
  let x = innerWidth / 2, y = innerHeight / 2;
  const moved = (e) => { x = e.clientX; y = e.clientY; parent.postMessage({ playthrough: "pointer", x, y, inside: true, text: typing(e.target) }, "*"); };
  addEventListener("pointermove", moved, true);
  // The app stays on its own address: a link out of it, where nothing could be noted, opens in a tab of your own.
  addEventListener("click", (e) => {
    const link = e.defaultPrevented || e.button !== 0 ? undefined : e.target?.closest?.("a[href]");
    if (!link || !/^https?:$/.test(link.protocol) || link.origin === location.origin) return;
    e.preventDefault();
    window.open(link.href, "_blank", "noopener");
  });
  // A click here is a click elsewhere, to what the viewer has open.
  addEventListener("pointerdown", (e) => e.isTrusted && parent.postMessage({ playthrough: "down" }, "*"), true);
  document.addEventListener("pointerleave", () => parent.postMessage({ playthrough: "pointer", x, y, inside: false }, "*"));
  // Escape is the app's, every single press, whatever the app does with it. Pressed twice, the second right after the
  // first, it's Back, and the app never hears that second one, held or let go: coming back finds the app as the first
  // left it. With Note on, it's Playthrough's: it turns Note off. A key held down is one press. The first of two is
  // told, for Back to show that one more takes you back.
  const twice = (${escapedTwice.toString()})(${RIGHT_AFTER});
  let taken = false;
  const escape = (e) => {
    if (e.key !== "Escape" || !e.isTrusted) return;
    const ours = e.type === "keydown" && !e.repeat ? noting || twice(performance.now()) : taken;
    if (e.type === "keydown" && !e.repeat) taken = ours;
    if (e.type === "keydown" && !e.repeat && !ours) parent.postMessage({ playthrough: "escaped once" }, "*");
    if (!ours) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "keydown" && !e.repeat) parent.postMessage({ playthrough: "escape", x, y }, "*");
  };
  addEventListener("keydown", escape, true);
  addEventListener("keyup", escape, true);
  // A moment on a phone is a finger's: there, a mouse drag is a swipe. What's under it follows the pointer, and let go, it
  // glides on as a fling does, to the column it snaps to if it snaps, as Kan's board does; a wheel or a trackpad only
  // jumped it a column at a time ("It just jumps from one column to the next"). Pressed and held first, it's the app's
  // own drag, as a long press is on a phone, as a card is dragged on Kan's board; a click is still a click.
  if (browser?.touch) {
    let press;
    const scrolls = (element, axis) => {
      const look = getComputedStyle(element);
      return /auto|scroll/.test(axis === "x" ? look.overflowX : look.overflowY) && (axis === "x" ? element.scrollWidth > element.clientWidth : element.scrollHeight > element.clientHeight);
    };
    const scrollerOf = (element, axis) => {
      for (; element && element !== document.body && element !== document.documentElement; element = element.parentElement) if (scrolls(element, axis)) return element;
      return document.scrollingElement;
    };
    const at = (scroller, axis) => (axis === "x" ? scroller.scrollLeft : scroller.scrollTop);
    // Where it rests at each thing in it that snaps, as the browser would put it: not those in a part of it that scrolls
    // on its own, which snap to that.
    const snaps = (scroller, axis) => {
      const look = getComputedStyle(scroller);
      const box = scroller.getBoundingClientRect();
      const [start, size, room, padStart, padEnd] = axis === "x" ? ["left", "width", scroller.clientWidth, look.scrollPaddingLeft, look.scrollPaddingRight] : ["top", "height", scroller.clientHeight, look.scrollPaddingTop, look.scrollPaddingBottom];
      const origin = (scroller === document.scrollingElement ? 0 : box[start]) - at(scroller, axis);
      const own = (element) => {
        for (let up = element.parentElement; up && up !== scroller; up = up.parentElement) if (scrolls(up, "x") || scrolls(up, "y")) return false;
        return true;
      };
      return [...scroller.querySelectorAll("*")].flatMap((element) => {
        const align = getComputedStyle(element).scrollSnapAlign.split(" ");
        const how = axis === "x" ? align.at(-1) : align[0];
        if (how === "none" || !own(element)) return [];
        const rect = element.getBoundingClientRect();
        const from = rect[start] - origin;
        return [how === "start" ? from - (parseFloat(padStart) || 0) : how === "end" ? from + rect[size] - room + (parseFloat(padEnd) || 0) : from + rect[size] / 2 - room / 2];
      });
    };
    const swallow = (e) => (e.stopImmediatePropagation(), e.preventDefault());
    addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button === 0 && !typing(e.target)) press = { x: e.clientX, y: e.clientY, since: performance.now(), on: e.target, went: [] };
    }, true);
    const drag = (e) => {
      if (!press || press.held || (e.pointerType && e.pointerType !== "mouse")) return;
      const [dx, dy] = [e.clientX - press.x, e.clientY - press.y];
      if (!press.scroller) {
        if (Math.hypot(dx, dy) < 6) return;
        if (performance.now() - press.since > 400) return void (press.held = true);
        press.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        press.scroller = scrollerOf(press.on, press.axis);
        press.snapped = press.scroller.style.scrollSnapType;
        press.snaps = getComputedStyle(press.scroller).scrollSnapType !== "none";
        press.scroller.style.scrollSnapType = "none";
        press.from = at(press.scroller, press.axis);
        document.documentElement.style.userSelect = "none";
        getSelection()?.removeAllRanges();
      }
      swallow(e);
      const by = press.axis === "x" ? dx : dy;
      press.scroller.scrollTo({ [press.axis === "x" ? "left" : "top"]: press.from - by, behavior: "instant" });
      press.went.push([performance.now(), by]);
    };
    addEventListener("pointermove", drag, true);
    addEventListener("mousemove", drag, true);
    const letGo = (e) => {
      const was = press;
      if (e.type === "pointerup" || !was?.scroller) press = undefined;
      if (!was?.scroller) return;
      swallow(e);
      if (e.type !== "pointerup") return;
      // What the swipe let go of isn't clicked.
      const unclicked = (click) => swallow(click);
      addEventListener("click", unclicked, true);
      setTimeout(() => removeEventListener("click", unclicked, true));
      document.documentElement.style.userSelect = "";
      const { scroller, axis, snapped, snaps: snapping, went } = was;
      // How fast it was going over the last tenth of a second, and on as far as a fling goes at that speed.
      const now = performance.now();
      const recent = went.filter(([when]) => now - when < 100);
      const [first, last] = [recent[0], recent.at(-1)];
      const speed = first && last && last[0] > first[0] ? (last[1] - first[1]) / (last[0] - first[0]) : 0;
      const here = at(scroller, axis);
      const flung = here - speed * 250;
      const points = snapping ? snaps(scroller, axis) : [];
      const to = points.length ? points.reduce((best, point) => (Math.abs(point - flung) < Math.abs(best - flung) ? point : best)) : flung;
      scroller.scrollTo({ [axis === "x" ? "left" : "top"]: to, behavior: "smooth" });
      const settle = () => (scroller.style.scrollSnapType = snapped);
      scroller.addEventListener("scrollend", settle, { once: true });
      setTimeout(settle, 900);
    };
    addEventListener("pointerup", letGo, true);
    addEventListener("mouseup", letGo, true);
  }
  // What a thing is called, and the path back to it, so a note says what it's on, and taking your branch over does what you did again.
  // What's clicked, as in the agent's browser (clicked.ts): inside a dialog, what's in it, not the dialog; Kan's list's
  // count is noted for itself; and on nothing that says anything, where it was.
  const clicked = ${clicked};
  const thing = (target) => clicked(target) ?? target;
  // The words you saw on it, as you'd name it; its label only when it shows none, as an icon's, and an empty box what it
  // says it's for, as an editor draws it ("Add comment…").
  const words = (element) => (element.innerText?.trim() || element.getAttribute?.("aria-label") || element.value || element.placeholder || element.querySelector?.("[data-placeholder]")?.getAttribute("data-placeholder") || "").trim().replace(/\\s+/g, " ").slice(0, 80);
  const roles = { A: "link", BUTTON: "button", SELECT: "combobox", TEXTAREA: "textbox", H1: "heading", H2: "heading", H3: "heading", H4: "heading", LI: "listitem", TD: "cell", TH: "columnheader", LABEL: "text", P: "text" };
  const role = (element) => element.getAttribute("role") || (element.tagName === "INPUT" ? (["checkbox", "radio"].includes(element.type) ? element.type : "textbox") : roles[element.tagName]) || "text";
  const path = ${pathTo};
  // What you do here is kept, across the pages you go to, for a note to keep. Only what you did: what's done again for
  // you isn't trusted by the browser, so it isn't kept.
  const did = JSON.parse(sessionStorage.getItem("playthrough:did") || "[]");
  const keep = (done) => {
    const last = did.at(-1);
    if (done.does === "fill" && last?.does === "fill" && last.on === done.on) did.pop();
    did.push(done);
    sessionStorage.setItem("playthrough:did", JSON.stringify(did));
    parent.postMessage({ playthrough: "did", did }, "*");
    readSoon();
  };
  // What's on the page, read as a moment's page is after each step, once what you did has settled: a note on your
  // recording is on a thing there, as on any moment's.
  const read = ${read};
  let recording = false, reading;
  const readNow = () => recording && window.rrwebRecord.record.addCustomEvent("reading", read());
  const readSoon = () => (clearTimeout(reading), (reading = setTimeout(() => rested().then(readNow), 300)));
  addEventListener("click", (e) => {
    if (!e.isTrusted || swallowing) return;
    const on = clicked(e.target);
    if (!on?.matches("input:not([type=checkbox]):not([type=radio]), textarea, select")) keep({ does: "click", on: path(on ?? e.target), what: on ? words(on) : "" });
  }, true);
  addEventListener("input", (e) => {
    const on = e.target;
    if (!e.isTrusted || !on.matches?.("input, textarea, select, [contenteditable]")) return;
    if (on.tagName === "SELECT") keep({ does: "selectOption", on: path(on), with: on.value, what: words(on) });
    else if (!["checkbox", "radio"].includes(on.type)) keep({ does: "fill", on: path(on), with: on.isContentEditable ? on.innerText : on.value, what: on.getAttribute("aria-label") || on.placeholder || "" });
  }, true);
  addEventListener("keydown", (e) => {
    if (e.isTrusted && e.key === "Enter" && e.target.matches?.("input")) keep({ does: "press", on: path(e.target), with: "Enter", what: words(e.target) });
  }, true);
  // With Note on, the next thing you click is noted, and the app never sees the click. N turns it on, unless you're typing.
  let noting = false, swallowing = false;
  // Playthrough's own marks, out of the recording's sight, as the app never drew them.
  const holder = document.createElement("playthrough-marks");
  const marks = holder.attachShadow({ mode: "closed" });
  document.documentElement.appendChild(holder);
  const ring = document.createElement("div");
  ring.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;border-radius:6px;box-shadow:0 0 0 2px rgba(236,178,72,.95),0 0 0 6px rgba(236,178,72,.18);display:none;transition:all 90ms ease-out";
  marks.appendChild(ring);
  const ringed = (target) => {
    if (!noting) return void (ring.style.display = "none");
    const box = thing(target).getBoundingClientRect();
    Object.assign(ring.style, { display: "block", left: box.left - 3 + "px", top: box.top - 3 + "px", width: box.width + 6 + "px", height: box.height + 6 + "px" });
  };
  addEventListener("message", ({ source, data }) => {
    if (source !== parent || data?.playthrough !== "noting") return;
    noting = data.on;
    ringed(document.elementFromPoint(x, y));
  });
  addEventListener("pointermove", (e) => noting && ringed(e.target), true);
  const swallow = (e) => {
    if (!e.isTrusted || !(noting || swallowing)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "pointerdown") {
      const on = thing(e.target);
      // Noted before the recording's pointer has come to yours, the recording starts here, so the note has one to be on.
      record(true);
      readNow();
      send();
      const node = window.rrwebRecord?.record?.mirror?.getId(on);
      // Named as the page is read for every moment, so a later hand-back's moment finds it by the same name: a reminder's
      // message box is "Message" there, where its own words named it here. What the page's reading doesn't count as a
      // thing, as the part of a panel around what's in it, is the spot, never the words of everything in it.
      const known = node > 0 && recording ? read().things.find((thing) => thing.node === node) : undefined;
      const [kind, name] = known ? [known.role, known.name] : recording ? [] : [role(on), words(on)];
      noted = on;
      parent.postMessage({ playthrough: "noted", ...(name ? { element: { role: kind, name, css: path(on), ...(node > 0 && { node }) } } : { point: { x: e.clientX / innerWidth, y: e.clientY / innerHeight } }), did, x: e.clientX, y: e.clientY, ...(name && { box: (({ left, top, width, height }) => ({ x: left, y: top, width, height }))(on.getBoundingClientRect()) }), address: location.pathname + location.search + location.hash }, "*");
      noting = false;
      swallowing = true;
      ringed();
    }
    if (e.type === "click") swallowing = false;
  };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) addEventListener(type, swallow, true);
  // A note's pin, on what it's on, and where it is, for its card to sit by. It's on the thing itself, as it was noted:
  // drawn again by the app, the same role and name, it's still that thing; gone, the pin goes until it's back, and never
  // moves onto whatever sits where it was, as the next card does once one is deleted. A note on a spot stays there.
  let noted;
  const pins = new Map();
  addEventListener("message", ({ source, data }) => {
    if (source !== parent || data?.playthrough !== "pin") return;
    const pin = pins.get(data.id) ?? { mark: document.createElement("div") };
    pin.mark.textContent = data.number;
    pin.mark.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;display:none;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:#e0a33a;color:#fff;font:600 11px/18px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff";
    Object.assign(pin, data.thing ? { named: data.thing, on: noted } : { point: data.point });
    marks.appendChild(pin.mark);
    pins.set(data.id, pin);
  });
  // As the page changes, each pin's thing is looked for again by the page's own reading, a few times a second at most.
  let pageChanged = false, looked = 0;
  new MutationObserver(() => (pageChanged = true)).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
  const lookAgain = () => {
    const mirror = window.rrwebRecord?.record?.mirror;
    if (!recording || !mirror) return;
    const things = read().things;
    const same = (one, named) => one.role === named.role && one.name === named.name;
    for (const pin of pins.values()) {
      if (!pin.named) continue;
      const node = pin.on?.isConnected ? mirror.getId(pin.on) : undefined;
      if (things.some((one) => one.node === node && same(one, pin.named))) continue;
      // Of several, as a card and the part of its list its words come first in, the smallest, as on a recording.
      const again = things.filter((one) => one.node > 0 && same(one, pin.named)).sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0];
      pin.on = again ? mirror.getNode(again.node) : undefined;
    }
  };
  let told = "";
  requestAnimationFrame(function place() {
    if (pageChanged && pins.size && performance.now() - looked > 250) (pageChanged = false, (looked = performance.now()), lookAgain());
    const at = {};
    for (const [id, { mark: pin, on, point }] of pins) {
      const box = on?.isConnected ? on.getBoundingClientRect() : undefined;
      const spot = box?.width ? { x: box.right, y: box.top } : point ? { x: point.x * innerWidth, y: point.y * innerHeight } : undefined;
      pin.style.display = spot ? "block" : "none";
      if (!spot) continue;
      Object.assign(pin.style, { left: spot.x + "px", top: spot.y + "px" });
      at[id] = spot;
    }
    const now = JSON.stringify(at);
    if (now !== told) parent.postMessage({ playthrough: "pinned", at: (told = now, at) }, "*");
    requestAnimationFrame(place);
  });
  const note = (e) => {
    if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "keydown" && !e.repeat) parent.postMessage({ playthrough: "note" }, "*");
  };
  addEventListener("keydown", note, true);
  addEventListener("keyup", note, true);
  const again = JSON.parse(sessionStorage.getItem("playthrough:again") || "[]");
  sessionStorage.removeItem("playthrough:again");
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const still = () => document.readyState === "complete" && !asked && performance.now() - stirred > 300 && [...document.images].every((image) => image.complete);
  const rested = async () => {
    const since = performance.now();
    await document.fonts?.ready;
    while (!still() && performance.now() - since < 8000) await wait(80);
  };
  // Partway through a step, the actions that only changed what was on the page are done again here, as the moment did them.
  // Each waits for what it acts on while the page is changing, as it does after the one before; on a still page, what
  // isn't there isn't coming, as a menu that was open only on the moment's page.
  const find = async (path) => {
    for (const until = performance.now() + 3000; performance.now() < until; await wait(80)) {
      const found = document.querySelector(path);
      if (found || still()) return found;
    }
  };
  const buttons = { left: [0, 1], middle: [1, 4], right: [2, 2] };
  const press = (element, button, ...types) => {
    const box = element.getBoundingClientRect();
    const [which, held] = buttons[button];
    const at = { bubbles: true, cancelable: true, composed: true, view: window, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, button: which, pointerId: 1, pointerType: "mouse", isPrimary: true };
    // The button is held from its down until its up, as the page reads it in buttons.
    for (const type of types) element.dispatchEvent(new (type.startsWith("pointer") ? PointerEvent : MouseEvent)(type, { ...at, buttons: /down$|contextmenu/.test(type) ? held : 0 }));
  };
  // With the button it was done with, as a browser sends it: a right click opens what the page shows for it, as a card's
  // menu, and is never a click, which would open the card. Focused without scrolling to it: made ready unseen in the
  // viewer, it would scroll the viewer's page to its frame.
  const click = (element, button = "left") => {
    press(element, button, "pointerover", "pointerenter", "mouseover", "pointermove", "mousemove", "pointerdown", "mousedown", ...(button === "right" ? ["contextmenu"] : []));
    element.focus?.({ preventScroll: true });
    press(element, button, "pointerup", "mouseup", button === "left" ? "click" : "auxclick");
  };
  const changed = (element) => ["input", "change"].forEach((type) => element.dispatchEvent(new Event(type, { bubbles: true })));
  // Filled, what's there is replaced; typed, it's added where the text cursor is.
  const type = (element, words, adding) => {
    element.focus({ preventScroll: true });
    if (adding) return void document.execCommand("insertText", false, words);
    if (element.isContentEditable) return void (document.execCommand("selectAll"), document.execCommand("insertText", false, words));
    const value = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    value ? value.call(element, words) : (element.value = words);
    changed(element);
  };
  // A key pressed for you is heard by the page alone: the browser does nothing with it. So unless the page takes it, it
  // does what the key does where you type, Home taking the text cursor to the start of the line, Backspace deleting.
  const moves = { Home: ["backward", "lineboundary"], End: ["forward", "lineboundary"], ArrowLeft: ["backward", "character"], ArrowRight: ["forward", "character"], ArrowUp: ["backward", "line"], ArrowDown: ["forward", "line"] };
  const key = (element, given) => {
    const keys = String(given).split(/\\+(?=.)/);
    const name = keys.pop();
    const held = { shiftKey: keys.includes("Shift"), ctrlKey: keys.some((one) => one.startsWith("Control")), altKey: keys.includes("Alt"), metaKey: keys.includes("Meta") };
    const heard = (type) => element.dispatchEvent(new KeyboardEvent(type, { key: name, ...held, bubbles: true, cancelable: true }));
    const letter = name.length === 1 || name === "Enter";
    if (heard("keydown") && (!letter || heard("keypress")) && typing(element)) {
      if (held.ctrlKey || held.metaKey || held.altKey) name.toLowerCase() === "a" && document.execCommand("selectAll");
      else if (moves[name]) getSelection().modify(held.shiftKey ? "extend" : "move", ...moves[name]);
      else if (name === "Backspace" || name === "Delete") document.execCommand(name === "Delete" ? "forwardDelete" : "delete");
      else if (name === "Enter" && element.tagName === "INPUT") element.form?.requestSubmit();
      else if (name === "Enter" && element.isContentEditable) document.execCommand(held.shiftKey ? "insertLineBreak" : "insertParagraph");
      else if (letter) document.execCommand("insertText", false, name === "Enter" ? "\\n" : name);
    }
    heard("keyup");
  };
  const doAgain = async ({ does, on, with: given, button }) => {
    const element = await find(on);
    if (!element) return false;
    if (does === "click" || does === "tap") click(element, button);
    else if (does === "dblclick") (click(element), click(element), press(element, "left", "dblclick"));
    else if (does === "fill") type(element, given);
    else if (does === "type") type(element, given, true);
    else if (does === "press") key(element, given);
    else if (does === "hover") press(element, "left", "pointerover", "pointerenter", "mouseover", "pointermove", "mousemove");
    else if (does === "selectOption") (element.value = [given].flat()[0], changed(element));
    else if (element.checked !== (does === "check" || (does === "setChecked" && given))) click(element);
    stir();
    return true;
  };
  // Once it's yours, what you do is recorded, as a moment is, from the page as it was handed over: a note you make here
  // is on your own recording. Each page records itself, from its own first frame, or made ready unseen, from when you
  // step into it, where your recording starts.
  let recorded = [];
  const send = () => recorded.length && (parent.postMessage({ playthrough: "recorded", events: recorded }, "*"), (recorded = []));
  const record = (noted = false) =>
    !recording &&
    (noted || !!sessionStorage.getItem("playthrough:yours")) &&
    window.rrwebRecord?.record({
      emit: (event) => recorded.push(event) === 1 && setTimeout(send, 100),
      sampling: { mousemove: 20, scroll: 16, input: "all" },
      maskAllInputs: false,
      inlineStylesheet: true,
    }) && ((recording = true), said(), readNow());
  // Light or dark, still or moving, as the moment was recorded, for your recording to be played back as it was too.
  const said = () => window.rrwebRecord.record.addCustomEvent("browser", { dark: matchMedia("(prefers-color-scheme: dark)").matches, still: matchMedia("(prefers-reduced-motion: reduce)").matches });
  addEventListener("message", ({ source, data }) => source === parent && data?.playthrough === "yours" && record());
  const settle = async () => {
    await rested();
    if (scroll) scrollTo(scroll.x, scroll.y);
    // Each waits only for what it acts on to be there; the page rests once they're all done.
    // What's left is kept as each is done, so a click that goes to another page carries on there.
    for (const [i, action] of again.entries()) {
      sessionStorage.setItem("playthrough:again", JSON.stringify(again.slice(i + 1)));
      if (!(await doAgain(action))) break;
    }
    sessionStorage.removeItem("playthrough:again");
    if (again.length) (stir(), await rested());
    // Once it's drawn, or soon anyway, as a browser may not draw a frame it thinks is hidden.
    let said = false;
    const say = () => said || ((said = true), parent.postMessage({ playthrough: "settled" }, "*"));
    requestAnimationFrame(() => requestAnimationFrame(say));
    setTimeout(say, 250);
    record();
  };
  // Once it's loaded; or, where it never says so, as a page waiting on something that never comes, ten seconds on.
  let settling;
  const settleOnce = () => (settling ??= settle());
  addEventListener("load", () => setTimeout(settleOnce, 50));
  setTimeout(settleOnce, 10000);
})();</script>`;

// Whatever the app says about its own address is said about Playthrough's, so the browser stays here, and the app may show
// in the viewer's frame.
function fromTheApp(answer: IncomingMessage, target: URL, request: IncomingMessage) {
  const headers = { ...answer.headers };
  delete headers["x-frame-options"];
  // Recorded here, the app's fonts and pictures are asked for again by the recording, from the viewer's page: that page,
  // on this machine, may read them, and no other site.
  const origin = request.headers.origin;
  if (origin && URL.canParse(origin) && thisMachine(new URL(origin).host)) headers["access-control-allow-origin"] = origin;
  headers.vary = [headers.vary, "Origin"].filter(Boolean).join(", ");
  const policy = headers["content-security-policy"];
  if (policy) headers["content-security-policy"] = [policy].flat().map((rule) => rule.replace(/frame-ancestors[^;]*;?/i, ""));
  if (headers.location?.startsWith(target.origin)) headers.location = headers.location.slice(target.origin.length) || "/";
  if (headers["set-cookie"]) headers["set-cookie"] = headers["set-cookie"].map((cookie) => cookie.replace(/;\s*Domain=[^;]*/i, ""));
  return headers;
}

// The browser gets the moment's cookies and what the app kept in it, then goes to where the moment's page was.
function handOver(name: string, handed: Handed, response: ServerResponse) {
  const { url, cookies, local, session, scroll, clock, browser, again = [] } = handed;
  const { pathname, search, hash } = new URL(url);
  const setCookies = cookies.map(
    ({ name, value, path, expires, httpOnly }) =>
      `${name}=${value}; Path=${path}; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${expires > 0 ? `; Expires=${new Date(expires * 1000).toUTCString()}` : ""}`,
  );
  const keep = JSON.stringify({ name, local, session, scroll, clock, browser, again, to: pathname + search + hash }).replace(/</g, "\\u003c");
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "set-cookie": setCookies });
  response.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Stepping in…</title>
<script>
const { name, local, session, scroll, clock, browser, again, to } = ${keep};
for (const [key, value] of Object.entries(local)) localStorage.setItem(key, value);
for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value);
sessionStorage.setItem("playthrough:scroll", JSON.stringify(scroll));
sessionStorage.setItem("playthrough:clock", String(clock));
sessionStorage.setItem("playthrough:browser", JSON.stringify(browser));
sessionStorage.removeItem("playthrough:yours");
if (again.length) sessionStorage.setItem("playthrough:again", JSON.stringify(again));
sessionStorage.removeItem("playthrough:did");
sessionStorage.setItem("playthrough:stepped-in", name);
location.replace(to);
</script>`);
}

// Until the one asking stops waiting, as a tab closed or reloaded does.
export function waitedFor(response: ServerResponse): AbortSignal {
  const waiting = new AbortController();
  response.on("close", () => response.writableFinished || waiting.abort());
  return waiting.signal;
}

const GONE = "Playthrough was started again since this moment was stepped into, so the app made for it is gone. Press Esc, then step in again.";

function notAnswering(response: ServerResponse, app: App, page: boolean) {
  if (response.headersSent) return response.end();
  const words = `The app isn't answering at ${app.url}: it may have stopped. Press Esc, then step in again, which starts it.`;
  if (page) return said(response, 502, words);
  response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
  response.end(words);
}

// What happened, in the frame where the app would be, as a page of the app is shown: it says it has settled, so the
// frame turns into it rather than wait for ever, and Escape goes back.
function said(response: ServerResponse, status: number, words: string) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Not there</title>
<body style="margin:0;display:grid;place-items:center;height:100vh;font:15px/1.5 system-ui,sans-serif;color:#1e2330;background:#faf8f4">
<p style="max-width:32em;padding:0 24px">${words.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>
<script>
addEventListener("load", () => parent.postMessage({ playthrough: "settled" }, "*"));
addEventListener("keydown", (e) => e.key === "Escape" && parent.postMessage({ playthrough: "escape", x: innerWidth / 2, y: innerHeight / 2 }, "*"));
</script>`);
}
