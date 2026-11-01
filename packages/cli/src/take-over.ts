// Takes a flow over: runs it to the end of a step on the app as it is now, then hands the page as it was there to a
// person, in their own browser or on their phone, to carry on from. It's the real app under their hands, a fresh copy
// of the moment made the way every flow starts, not a picture of it. Playthrough passes everything on to the app, and at
// /take-over gives the browser what the flow's page had: its address, its cookies, and what the app kept in the browser.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer, request as ask, type IncomingMessage, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { list, quote, Refused, type Did } from "@playthrough/review";
import { keepRunning } from "./app.ts";
import type { Handed } from "./flows.ts";
import { follow, reachesOutside, runTo } from "./following.ts";
import { listen, thisMachine } from "./open.ts";
import { read } from "./read.ts";
import type { App, Repo } from "./repo.ts";
import type { Made } from "./setup.ts";

// Clear of the viewer's, which takes the next free one from 5790 when several are open.
const PORT = 5830;

// From the command line: ready, then passed on until Ctrl+C.
export async function takeOver(repo: Repo, id: string, flowName?: string, stepName?: string) {
  if (!flowName) {
    const round = await recorded(repo, id);
    throw new Refused([`Take over which flow? playthrough take-over ${id} "<flow>" ["<step>"]\nIts flows: ${list(round.flows.map((flow) => quote(flow.name)))}.`]);
  }
  console.log(`Running ${quote(flowName)} to ${stepName ? `the end of ${quote(stepName)}` : "its end"}, on the app as it is now…`);
  const { port, moment, seconds } = await getReady(repo, id, flowName, { step: stepName, network: true });
  const here = `http://localhost:${port}/take-over/${moment}`;
  const away = addresses().map((address) => `http://${address}:${port}/take-over/${moment}`);
  console.log(`
Ready in ${seconds}s. Carry on from there in your browser: ${here}${away.length ? `\nOr on your phone, on the same network: ${list(away)}` : ""}
Each address hands over the same copy, and the app is passed on through Playthrough while this runs. Ctrl+C ends it.`);
}

// Runs the flow to where it's taken over and passes the app on, then says where: each moment made ready has an address
// of its own, /take-over/<moment>, so several can wait at once. In the viewer, the moment the playhead rests on is made
// ready while you look, and Take over turns the frame into the app there.
// With what a person did there, as a note in the app keeps it, it's done again after them, to take over where they were,
// and kept on by whatever they do next. Made ready ahead, as the playhead rests, before anyone has asked: not for a flow
// that reaches outside the app, which each time would do that again. From the command line, the app is passed on to
// this machine's networks too, for a phone on one of them; from the viewer, to this machine alone.
export async function getReady(
  repo: Repo,
  id: string,
  flowName: string,
  { step: stepName, actions, did, ahead, network }: { step?: string; actions?: number; did?: Did[]; ahead?: boolean; network?: boolean } = {},
): Promise<{ port: number; moment: string; seconds: string }> {
  const round = await recorded(repo, id);
  const flow = round.flows.find((flow) => flow.name === flowName);
  if (!flow) throw new Refused([`${id} has no flow called ${quote(flowName)}. Its flows: ${list(round.flows.map((flow) => quote(flow.name)))}.`]);
  if (stepName && !flow.steps.some((step) => step.title === stepName))
    throw new Refused([`${quote(flow.name)} has no step called ${quote(stepName)}. Its steps: ${list(flow.steps.map((step) => quote(step.title)))}.`]);

  const outside = ahead && (await reachesOutside(repo, id, flow.name));
  if (outside) throw new Refused([`${quote(flow.name)} reaches outside the app (${outside}), so it's run only when it's taken over.`]);

  const app = await repo.app();
  await keepRunning(app, repo.root);
  const began = Date.now();
  const { handed, made } = await runTo(repo, id, { flow: flow.name, ...(stepName && { step: stepName, ...(actions && { actions }) }), ...(did?.length && { did }) });
  passing ??= { moments: new Map(), port: passOn(app, (moment) => passing!.moments.get(moment), network) };
  // Not counted, as on a network a moment's address is the way in to the app: it can't be guessed.
  const moment = randomBytes(12).toString("base64url");
  passing.moments.set(moment, did?.length ? { ...handed, did } : handed);
  // One app made ready for each review at a time: the one before, taken over or only made ready, is given back, and its
  // address goes with it, so pausing again and again leaves one, not one for each pause.
  const before = ready.get(`${repo.root}\n${id}`);
  ready.set(`${repo.root}\n${id}`, { moment, made });
  if (before) {
    passing.moments.delete(before.moment);
    void before.made?.giveBack();
  }
  return { port: await passing.port, moment, seconds: ((Date.now() - began) / 1000).toFixed(1) };
}
const ready = new Map<string, { moment: string; made?: Made }>();

// While the latest round plays, its flow is run alongside, as far as the playhead has gone, so the moment it comes to
// rest on is quick to make ready.
export async function keepUp(repo: Repo, id: string, flow: string, step?: string, actions?: number) {
  await keepRunning(await repo.app(), repo.root);
  await follow(repo, id, { flow, ...(step && { step, ...(actions && { actions }) }) });
}

// One way through to the app for as long as Playthrough runs, handing over each moment made ready, by its address.
let passing: { moments: Map<string, Handed>; port: Promise<number> } | undefined;

async function recorded(repo: Repo, id: string) {
  const review = await repo.reviews.get(id);
  const round = review.rounds.findLast((round) => round.number > 0) ?? review.rounds.at(-1);
  if (!round) throw new Refused([`${id} has nothing recorded yet, so there's nothing to take over. Record it first: playthrough record ${id}`]);
  return round;
}

// Everything that isn't /take-over goes to the app as it is, answers and live connections both, as if the browser
// were talking to it directly, so the app sees nothing unusual: its own address, and its own address as where a
// request came from. Only to this machine, and on a network, to whoever opened a moment's address there.
function passOn(app: App, handed: (moment: string) => Handed | undefined, network?: boolean): Promise<number> {
  const target = new URL(app.url);
  const server = createServer((request, response) => {
    if (!named(request)) return turnAway(response);
    const [first, moment] = new URL(request.url ?? "/", "http://playthrough").pathname.split("/").filter(Boolean);
    if (first === "take-over") return handOver(handed(moment ?? ""), response, !fromThisMachine(request));
    if (!passed(request)) return turnAway(response);
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
    forward.on("error", () => notAnswering(response, app));
    request.pipe(forward);
  });
  server.on("upgrade", (request, socket, head) => {
    if (!named(request) || !passed(request)) return void socket.destroy();
    const upstream = connect(Number(target.port || 80), target.hostname, () => {
      const headers = Object.entries(asIfDirect(request, target)).flatMap(([name, value]) => [value ?? []].flat().map((one) => `${name}: ${one}`));
      upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${headers.join("\r\n")}\r\n\r\n`);
      upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  return listen(server, PORT, network ? "0.0.0.0" : "127.0.0.1");
}

// Asked for by this machine's name or one of its addresses: a site that has made its name lead here (DNS rebinding)
// still asks by its own.
const named = (request: IncomingMessage) => thisMachine(request.headers.host) || addresses().includes(request.headers.host?.replace(/:\d+$/, "") ?? "");

// One pass for as long as Playthrough runs, handed with a moment's page to whoever opened its address from elsewhere on
// the network, and kept from the app: the rest of the network has no business with it.
const PASS = `playthrough-pass=${randomBytes(16).toString("base64url")}`;
const fromThisMachine = (request: IncomingMessage) => /^(127\.|::1$|::ffff:127\.)/.test(request.socket.remoteAddress ?? "");
const passed = (request: IncomingMessage) => fromThisMachine(request) || !!request.headers.cookie?.split(/;\s*/).includes(PASS);

function turnAway(response: ServerResponse) {
  response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
  response.end("Playthrough passes the app on to this machine, and to whoever opened the address of a moment taken over. Open that address first.");
}

function asIfDirect(request: IncomingMessage, target: URL) {
  const headers = { ...request.headers, host: target.host };
  const from = `http://${request.headers.host}`;
  if (headers.origin) headers.origin = target.origin;
  if (headers.referer?.startsWith(from)) headers.referer = target.origin + headers.referer.slice(from.length);
  const cookie = headers.cookie?.split(/;\s*/).filter((one) => one !== PASS).join("; ");
  if (cookie) headers.cookie = cookie;
  else delete headers.cookie;
  return headers;
}

// Taken over in the viewer, the app sits in its frame, and this goes into each of its pages, first. Scrolled where the
// flow's page was, it tells the viewer once it has settled (loaded, its fonts and pictures in, nothing on its way and
// nothing changing for a moment), so the frame turns into it with nothing on screen changing. It tells the viewer where
// the pointer is, and whether it's over words you can type into: the viewer draws the recording's pointer coming to
// yours, hiding the app's own until they meet, and then only your name, beside the app's own. And as every key there
// goes to the app, Escape goes back to the viewer too, when the app does nothing with it.
// rrweb's recorder, as every flow has it, for what you do here to be recorded.
const recorder = join(dirname(createRequire(import.meta.url).resolve("@rrweb/record")), "record.umd.min.cjs");
let RECORDER: string | undefined;

const SAYS = `<script>(() => {
  if (window.parent === window) return;
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
  // In the browser the flow was recorded in, whatever yours says: light or dark, still or moving, in its languages. A
  // page asks in its scripts and its styles, and each asking is answered before the app hears it.
  const browser = JSON.parse(sessionStorage.getItem("playthrough:browser") || "null");
  if (browser) {
    const recorded = { "prefers-color-scheme": browser.dark ? "dark" : "light", "prefers-reduced-motion": browser.still ? "reduce" : "no-preference" };
    const as = (query) =>
      String(query).replace(/\\(\\s*(prefers-color-scheme|prefers-reduced-motion)\\s*(?::\\s*([a-z-]+)\\s*)?\\)/gi, (_, feature, value) => {
        feature = feature.toLowerCase();
        const holds = value ? value.toLowerCase() === recorded[feature] : feature === "prefers-color-scheme" || browser.still;
        return holds ? "(min-width: 0px)" : "(max-width: 0px)";
      });
    const matching = window.matchMedia;
    window.matchMedia = (query) => matching.call(window, as(query));
    for (const name of ["insertRule", "replace", "replaceSync"]) {
      const real = CSSStyleSheet.prototype[name];
      if (real) CSSStyleSheet.prototype[name] = function (text, ...rest) { return real.call(this, as(text), ...rest); };
    }
    // light-dark(), system colours, form controls and scrollbars follow the page's colour-scheme, not a media query.
    const scheme = browser.dark ? "dark" : "light";
    const inScheme = (value) => (/\\blight\\b/.test(value) && /\\bdark\\b/.test(value) ? scheme : value);
    const rewrite = (rules) => {
      for (const rule of rules) {
        if (rule.media && as(rule.media.mediaText) !== rule.media.mediaText) rule.media.mediaText = as(rule.media.mediaText);
        if (rule.style?.colorScheme && inScheme(rule.style.colorScheme) !== rule.style.colorScheme) rule.style.colorScheme = inScheme(rule.style.colorScheme);
        if (rule.styleSheet) restyle(rule.styleSheet);
        if (rule.cssRules) rewrite(rule.cssRules);
      }
    };
    const restyle = (sheet) => { try { rewrite(sheet.cssRules); } catch {} };
    const restyleAll = () => {
      for (const sheet of document.styleSheets) restyle(sheet);
      for (const sheet of document.adoptedStyleSheets ?? []) restyle(sheet);
      for (const element of document.querySelectorAll("[media]")) {
        const media = element.getAttribute("media");
        if (as(media) !== media) element.setAttribute("media", as(media));
      }
      for (const meta of document.querySelectorAll('meta[name="color-scheme"]')) {
        const content = meta.getAttribute("content") ?? "";
        if (inScheme(content) !== content) meta.setAttribute("content", inScheme(content));
      }
    };
    const styling = (node) => /^(style|link|source|meta)$/i.test(node?.nodeName);
    const bringsStyle = (node) => styling(node) || !!node.querySelector?.("style, link, source, meta");
    new MutationObserver((changes) => changes.some((change) => styling(change.target) || styling(change.target.parentNode) || [...change.addedNodes].some(bringsStyle)) && restyleAll())
      .observe(document, { subtree: true, childList: true, characterData: true, attributeFilter: ["media", "content"] });
    document.addEventListener("load", (event) => styling(event.target) && restyleAll(), true);
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
  // Yours across the pages you go to, until you leave.
  const yours = (mine) => { hidden.disabled = mine; if (mine) sessionStorage.setItem("playthrough:yours", "1"); else sessionStorage.removeItem("playthrough:yours"); };
  yours(!!sessionStorage.getItem("playthrough:yours"));
  addEventListener("message", ({ source, data }) => { if (source === parent && data?.playthrough === "yours") yours(data.yours); });
  const typing = (target) => !!target?.closest?.('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, [contenteditable=""], [contenteditable=true]');
  // Every move, as it comes: held for a frame, the name trailed the pointer like a smoothed one. Not the earlier raw
  // updates: in a scaled frame, Chrome gives them the page's position rather than the app's.
  let x = innerWidth / 2, y = innerHeight / 2;
  const moved = (e) => { x = e.clientX; y = e.clientY; parent.postMessage({ playthrough: "pointer", x, y, inside: true, text: typing(e.target) }, "*"); };
  addEventListener("pointermove", moved, true);
  // A click here is a click elsewhere, to what the viewer has open.
  addEventListener("pointerdown", (e) => e.isTrusted && parent.postMessage({ playthrough: "down" }, "*"), true);
  document.addEventListener("pointerleave", () => parent.postMessage({ playthrough: "pointer", x, y, inside: false }, "*"));
  // Escape is the app's first, as N is while you type: if the app does something with it, closing a menu, a list or a
  // dialog, or moving focus, that's all it does. Then it leaves the field you're typing in, whatever the app made of it,
  // and only once you're in none does it go back to the viewer: coming back finds the app as it was.
  const popups = () => [...document.querySelectorAll('[aria-haspopup][aria-expanded="true"], [aria-modal="true"], [role=menu], [role=listbox], [role=dialog], dialog[open]')].filter((element) => element.checkVisibility()).length;
  const leave = (e) => {
    if (e.key !== "Escape" || e.type !== "keydown" || e.repeat) return;
    const [open, focused] = [popups(), document.activeElement];
    setTimeout(() => {
      if (popups() < open || document.activeElement !== focused) return;
      if (typing(focused)) return focused.blur();
      if (!e.defaultPrevented) parent.postMessage({ playthrough: "escape", x, y }, "*");
    }, 150);
  };
  addEventListener("keydown", leave, true);
  // What a thing is called, and the path back to it, so a note says what it's on, and taking your branch over does what you did again.
  // Something you can press or type into, or else the nearest thing with words of its own: inside a dialog, what's in
  // it, not the dialog. Something you press that holds others isn't one control but what holds them, as on a recording:
  // Kan's list is one you drag, with its name field, its + and its cards in it, and its count is noted for itself.
  const pressable = "a, button, input, select, textarea, label, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [role=option], [role=combobox]";
  const thing = (target) => {
    const pressed = target?.closest?.(pressable);
    if (pressed && !pressed.querySelector(pressable)) return pressed;
    for (let at = target; at && at !== (pressed ?? document.body); at = at.parentElement) if (at.nodeType === 1 && words(at)) return at;
    return pressed ?? target;
  };
  const words = (element) => (element.getAttribute?.("aria-label") || element.innerText || element.value || element.placeholder || "").trim().replace(/\\s+/g, " ").slice(0, 80);
  const roles = { A: "link", BUTTON: "button", SELECT: "combobox", TEXTAREA: "textbox", H1: "heading", H2: "heading", H3: "heading", H4: "heading", LI: "listitem", TD: "cell", TH: "columnheader", LABEL: "text", P: "text" };
  const role = (element) => element.getAttribute("role") || (element.tagName === "INPUT" ? (["checkbox", "radio"].includes(element.type) ? element.type : "textbox") : roles[element.tagName]) || "text";
  const path = (element) => {
    const parts = [];
    for (; element && element.nodeType === 1 && element !== document.documentElement; element = element.parentElement) {
      // Not the ids an app makes up as it draws, or numbers, which differ next time.
      if (element.id && !/[:«»\\d]/.test(element.id)) { parts.unshift("#" + CSS.escape(element.id)); break; }
      let nth = 1;
      for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) if (sibling.tagName === element.tagName) nth++;
      parts.unshift(element.tagName.toLowerCase() + ":nth-of-type(" + nth + ")");
    }
    return parts.join(" > ");
  };
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
  // What's on the page, read as a flow's page is after each step, once what you did has settled: a note on your
  // recording is on a thing there, as on any flow's.
  const read = ${read};
  let recording = false, reading;
  const readNow = () => recording && window.rrwebRecord.record.addCustomEvent("reading", read());
  const readSoon = () => (clearTimeout(reading), (reading = setTimeout(() => rested().then(readNow), 300)));
  addEventListener("click", (e) => {
    if (!e.isTrusted || swallowing) return;
    const on = thing(e.target);
    if (!on.matches?.("input:not([type=checkbox]):not([type=radio]), textarea, select")) keep({ does: "click", on: path(on), what: words(on) });
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
      const name = words(on);
      readNow();
      send();
      const node = window.rrwebRecord?.record?.mirror?.getId(on);
      parent.postMessage({ playthrough: "noted", ...(name ? { element: { role: role(on), name, css: path(on), ...(node > 0 && { node }) } } : { point: { x: e.clientX / innerWidth, y: e.clientY / innerHeight } }), did, x: e.clientX, y: e.clientY }, "*");
      noting = false;
      swallowing = true;
      ringed();
    }
    if (e.type === "click") swallowing = false;
  };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) addEventListener(type, swallow, true);
  // A note's pin, on what it's on, and where it is, for its card to sit by.
  const pins = new Map();
  addEventListener("message", ({ source, data }) => {
    if (source !== parent || data?.playthrough !== "pin") return;
    const pin = pins.get(data.id) ?? document.createElement("div");
    pin.textContent = data.number;
    pin.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;display:none;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:#e0a33a;color:#fff;font:600 11px/18px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff";
    pin.dataset.css = data.css || "";
    pin.dataset.x = data.point?.x ?? "";
    pin.dataset.y = data.point?.y ?? "";
    marks.appendChild(pin);
    pins.set(data.id, pin);
  });
  let told = "";
  requestAnimationFrame(function place() {
    const at = {};
    for (const [id, pin] of pins) {
      const on = pin.dataset.css && document.querySelector(pin.dataset.css);
      const box = on?.getBoundingClientRect();
      const spot = box?.width ? { x: box.right, y: box.top } : pin.dataset.x !== "" && !pin.dataset.css ? { x: pin.dataset.x * innerWidth, y: pin.dataset.y * innerHeight } : undefined;
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
  // Partway through a step, the actions that only changed what was on the page are done again here, as the flow did them.
  // Each waits for what it acts on while the page is changing, as it does after the one before; on a still page, what
  // isn't there isn't coming, as a menu that was open only on the flow's page.
  const find = async (path) => {
    for (const until = performance.now() + 3000; performance.now() < until; await wait(80)) {
      const found = document.querySelector(path);
      if (found || still()) return found;
    }
  };
  const press = (element, ...types) => {
    const box = element.getBoundingClientRect();
    const at = { bubbles: true, cancelable: true, composed: true, view: window, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true };
    for (const type of types) element.dispatchEvent(new (type.startsWith("pointer") ? PointerEvent : MouseEvent)(type, at));
  };
  const click = (element) => {
    press(element, "pointerover", "pointerenter", "mouseover", "pointermove", "mousemove", "pointerdown", "mousedown");
    element.focus?.();
    press(element, "pointerup", "mouseup", "click");
  };
  const changed = (element) => ["input", "change"].forEach((type) => element.dispatchEvent(new Event(type, { bubbles: true })));
  // Filled, what's there is replaced; typed, it's added where the caret is.
  const type = (element, words, adding) => {
    element.focus();
    if (element.isContentEditable) return void (adding || document.execCommand("selectAll"), document.execCommand("insertText", false, words));
    const value = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    value ? value.call(element, words) : (element.value = words);
    changed(element);
  };
  const doAgain = async ({ does, on, with: given }) => {
    const element = await find(on);
    if (!element) return false;
    if (does === "click" || does === "tap") click(element);
    else if (does === "dblclick") (click(element), click(element), press(element, "dblclick"));
    else if (does === "fill") type(element, given);
    else if (does === "type") type(element, (element.isContentEditable ? "" : element.value ?? "") + given, true);
    else if (does === "press") for (const type of ["keydown", "keypress", "keyup"]) element.dispatchEvent(new KeyboardEvent(type, { key: given, bubbles: true, cancelable: true }));
    else if (does === "hover") press(element, "pointerover", "pointerenter", "mouseover", "pointermove", "mousemove");
    else if (does === "selectOption") (element.value = [given].flat()[0], changed(element));
    else if (element.checked !== (does === "check" || (does === "setChecked" && given))) click(element);
    stir();
    return true;
  };
  // Once it's yours, what you do is recorded, as a flow is, from the page as it was handed over: a note you make here
  // is on your own recording. Each page records itself, from its own first frame, or made ready unseen, from when you
  // take it over, where your recording starts.
  let recorded = [];
  const send = () => recorded.length && (parent.postMessage({ playthrough: "recorded", events: recorded }, "*"), (recorded = []));
  const record = () =>
    !recording &&
    !!sessionStorage.getItem("playthrough:yours") &&
    window.rrwebRecord?.record({
      emit: (event) => recorded.push(event) === 1 && setTimeout(send, 100),
      sampling: { mousemove: 20, scroll: 16, input: "all" },
      maskAllInputs: false,
      inlineStylesheet: true,
    }) && ((recording = true), readNow());
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
  addEventListener("load", () => setTimeout(settle, 50));
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

// The browser gets the flow's cookies and what the app kept in it, then goes to where the flow's page was. From
// elsewhere on the network, it gets the pass too.
function handOver(handed: Handed | undefined, response: ServerResponse, elsewhere: boolean) {
  if (!handed) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return void response.end("There's no moment ready at this address. Take it over again from the viewer, or with playthrough take-over.");
  }
  const { url, cookies, local, session, scroll, clock, browser, did = [] } = handed;
  // What the person did there was done before it was handed over: it's kept for what they do next to carry on from.
  const again = handed.again ?? [];
  const { pathname, search, hash } = new URL(url);
  const setCookies = cookies.map(
    ({ name, value, path, expires, httpOnly }) =>
      `${name}=${value}; Path=${path}; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${expires > 0 ? `; Expires=${new Date(expires * 1000).toUTCString()}` : ""}`,
  );
  if (elsewhere) setCookies.push(`${PASS}; Path=/; SameSite=Lax; HttpOnly`);
  const keep = JSON.stringify({ local, session, scroll, clock, browser, again, did, to: pathname + search + hash }).replace(/</g, "\\u003c");
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "set-cookie": setCookies });
  response.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Taking over…</title>
<script>
const { local, session, scroll, clock, browser, again, did, to } = ${keep};
for (const [key, value] of Object.entries(local)) localStorage.setItem(key, value);
for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value);
sessionStorage.setItem("playthrough:scroll", JSON.stringify(scroll));
sessionStorage.setItem("playthrough:clock", String(clock));
sessionStorage.setItem("playthrough:browser", JSON.stringify(browser));
sessionStorage.removeItem("playthrough:yours");
if (again.length) sessionStorage.setItem("playthrough:again", JSON.stringify(again));
sessionStorage.setItem("playthrough:did", JSON.stringify(did));
location.replace(to);
</script>`);
}

function notAnswering(response: ServerResponse, app: App) {
  if (response.headersSent) return response.end();
  response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
  response.end(`The app isn't answering at ${app.url}. Start it as playthrough/app.json says (${app.start}), then reload.`);
}

// This machine's addresses on its networks, for a phone on the same one.
const addresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((face) => face && face.family === "IPv4" && !face.internal)
    .map((face) => face!.address);
