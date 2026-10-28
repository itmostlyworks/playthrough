// Takes a flow over: runs it to the end of a step on the app as it is now, then hands the page as it was there to a
// person, in their own browser or on their phone, to carry on from. It's the real app under their hands, a fresh copy
// of the moment made the way every flow starts, not a picture of it. Vantage passes everything on to the app, and at
// /take-over gives the browser what the flow's page had: its address, its cookies, and what the app kept in the browser.

import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer, request as ask, type IncomingMessage, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { constants, networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { list, quote, Refused, type Did } from "@mostlyworks/vantage-review";
import { follow, runTo, type Handed } from "./flows.ts";
import { listen } from "./open.ts";
import type { App, Repo } from "./repo.ts";

// Clear of the viewer's, which takes the next free one from 5790 when several are open.
const PORT = 5830;

// From the command line: ready, then passed on until Ctrl+C.
export async function takeOver(repo: Repo, id: string, flowName?: string, stepName?: string) {
  if (!flowName) {
    const round = await recorded(repo, id);
    throw new Refused([`Take over which flow? vantage take-over ${id} "<flow>" ["<step>"]\nIts flows: ${list(round.flows.map((flow) => quote(flow.name)))}.`]);
  }
  console.log(`Running ${quote(flowName)} to ${stepName ? `the end of ${quote(stepName)}` : "its end"}, on the app as it is now…`);
  const { port, moment, seconds } = await getReady(repo, id, flowName, stepName);
  const here = `http://localhost:${port}/take-over/${moment}`;
  const away = addresses().map((address) => `http://${address}:${port}/take-over/${moment}`);
  console.log(`
Ready in ${seconds}s. Carry on from there in your browser: ${here}${away.length ? `\nOr on your phone, on the same network: ${list(away)}` : ""}
Each address hands over the same copy, and the app is passed on through Vantage while this runs. Ctrl+C ends it.`);
}

// Runs the flow to where it's taken over and passes the app on, then says where: each moment made ready has an address
// of its own, /take-over/<moment>, so several can wait at once. In the viewer, the moment the playhead rests on is made
// ready while you look, and Take over turns the frame into the app there.
// With what a person did there, as a note in the app keeps it, it's done again after them, to take over where they were,
// and kept on by whatever they do next.
export async function getReady(repo: Repo, id: string, flowName: string, stepName?: string, actions?: number, did?: Did[]): Promise<{ port: number; moment: string; seconds: string }> {
  const round = await recorded(repo, id);
  const flow = round.flows.find((flow) => flow.name === flowName);
  if (!flow) throw new Refused([`${id} has no flow called ${quote(flowName)}. Its flows: ${list(round.flows.map((flow) => quote(flow.name)))}.`]);
  if (stepName && !flow.steps.some((step) => step.title === stepName))
    throw new Refused([`${quote(flow.name)} has no step called ${quote(stepName)}. Its steps: ${list(flow.steps.map((step) => quote(step.title)))}.`]);

  const app = await repo.app();
  await keepRunning(app, repo.root);
  const began = Date.now();
  const handed = await runTo(repo, id, { flow: flow.name, ...(stepName && { step: stepName, ...(actions && { actions }) }) });
  passing ??= { moments: new Map(), port: passOn(app, (moment) => passing!.moments.get(moment)) };
  const moment = String(passing.moments.size + 1);
  passing.moments.set(moment, did?.length ? { ...handed, did } : handed);
  return { port: await passing.port, moment, seconds: ((Date.now() - began) / 1000).toFixed(1) };
}

// While the latest round plays, its flow is run alongside, as far as the playhead has gone, so the moment it comes to
// rest on is quick to make ready.
export async function keepUp(repo: Repo, id: string, flow: string, step?: string, actions?: number) {
  await keepRunning(await repo.app(), repo.root);
  await follow(repo, id, { flow, ...(step && { step, ...(actions && { actions }) }) });
}

// One way through to the app for as long as Vantage runs, handing over each moment made ready, by its number.
let passing: { moments: Map<string, Handed>; port: Promise<number> } | undefined;

async function recorded(repo: Repo, id: string) {
  const review = await repo.reviews.get(id);
  const round = review.rounds.findLast((round) => round.number > 0) ?? review.rounds.at(-1);
  if (!round) throw new Refused([`${id} has nothing recorded yet, so there's nothing to take over. Record it first: vantage record ${id}`]);
  return round;
}

// The app, as vantage/app.json starts it, kept running for as long as Vantage runs, or the one already running:
// Playwright would stop one it started itself as soon as the flow was done.
let started: ChildProcess | undefined;
let ending = false;
async function keepRunning(app: App, root: string) {
  // Stopped by a signal, Node ends without saying it's exiting, and what it started here runs on, orphaned: the flows
  // kept ready and the app. Told, they go with it.
  if (!ending) {
    ending = true;
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, () => process.exit(128 + constants.signals[signal]));
  }
  if (await answers(app.url)) return;
  console.log(`Starting the app: ${app.start}`);
  started = spawn(app.start, { cwd: root, shell: true, stdio: "ignore", detached: true });
  // The app goes when Vantage does, with everything its command started.
  const stop = () => {
    try {
      process.kill(-started!.pid!);
    } catch {}
  };
  process.once("exit", stop);
  for (let waited = 0; waited < 180; waited++) {
    if (await answers(app.url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  stop();
  throw new Refused([`The app didn't answer at ${app.url} within three minutes of ${quote(app.start)}. Check that vantage/app.json starts it there.`]);
}

const answers = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(2000) }).then(
    () => true,
    () => false,
  );

// Everything that isn't /take-over goes to the app as it is, answers and live connections both, as if the browser
// were talking to it directly, so the app sees nothing unusual: its own address, and its own address as where a
// request came from.
function passOn(app: App, handed: (moment: string) => Handed | undefined): Promise<number> {
  const target = new URL(app.url);
  const server = createServer((request, response) => {
    const [first, moment] = new URL(request.url ?? "/", "http://vantage").pathname.split("/").filter(Boolean);
    if (first === "take-over") return handOver(handed(moment ?? ""), response);
    // A page is asked for whole, so a word can be added to it: the app is told not to squeeze it.
    const page = /text\/html/.test(request.headers.accept ?? "");
    const headers = asIfDirect(request, target);
    if (page) delete headers["accept-encoding"];
    const forward = ask({ host: target.hostname, port: target.port, method: request.method, path: request.url, headers }, (answer) => {
      const told = fromTheApp(answer, target);
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
    const upstream = connect(Number(target.port || 80), target.hostname, () => {
      const headers = Object.entries(asIfDirect(request, target)).flatMap(([name, value]) => [value ?? []].flat().map((one) => `${name}: ${one}`));
      upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${headers.join("\r\n")}\r\n\r\n`);
      upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  return listen(server, PORT, "0.0.0.0");
}

function asIfDirect(request: IncomingMessage, target: URL) {
  const headers = { ...request.headers, host: target.host };
  const from = `http://${request.headers.host}`;
  if (headers.origin) headers.origin = target.origin;
  if (headers.referer?.startsWith(from)) headers.referer = target.origin + headers.referer.slice(from.length);
  return headers;
}

// Taken over in the viewer, the app sits in its frame, and this goes into each of its pages, first. Scrolled where the
// flow's page was, it tells the viewer once it has settled (loaded, its fonts and pictures in, nothing on its way and
// nothing changing for a moment), so the frame turns into it with nothing on screen changing. It tells the viewer where
// the pointer is, and whether it's over words you can type into: the viewer draws the recording's pointer coming to
// yours, hiding the app's own until they meet, and then only your name, beside the app's own. And as every key there
// goes to the app, Escape goes back to the viewer instead.
// rrweb's recorder, as every flow has it, for what you do here to be recorded.
const recorder = join(dirname(createRequire(import.meta.url).resolve("@rrweb/record")), "record.umd.min.cjs");
let RECORDER: string | undefined;

const SAYS = `<script>(() => {
  if (window.parent === window) return;
  // On the recordings' clock, so what the page says about time reads as it did there.
  const ahead = Number(sessionStorage.getItem("vantage:clock")) || 0;
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
  let asked = 0, stirred = performance.now();
  const stir = () => (stirred = performance.now());
  const fetching = window.fetch;
  window.fetch = (...args) => { asked++; stir(); return fetching(...args).finally(() => { asked--; stir(); }); };
  const sending = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) { asked++; stir(); this.addEventListener("loadend", () => { asked--; stir(); }); return sending.apply(this, args); };
  new MutationObserver(stir).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const scroll = JSON.parse(sessionStorage.getItem("vantage:scroll") || "null");
  sessionStorage.removeItem("vantage:scroll");
  const hidden = document.createElement("style");
  hidden.textContent = "html, html * { cursor: none !important; }";
  document.documentElement.appendChild(hidden);
  // Yours across the pages you go to, until you leave.
  const yours = (mine) => { hidden.disabled = mine; if (mine) sessionStorage.setItem("vantage:yours", "1"); else sessionStorage.removeItem("vantage:yours"); };
  yours(!!sessionStorage.getItem("vantage:yours"));
  addEventListener("message", ({ source, data }) => { if (source === parent && data?.vantage === "yours") yours(data.yours); });
  const typing = (target) => !!target?.closest?.('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, [contenteditable=""], [contenteditable=true]');
  // Every move, as it comes: held for a frame, the name trailed the pointer like a smoothed one. Not the earlier raw
  // updates: in a scaled frame, Chrome gives them the page's position rather than the app's.
  let x = innerWidth / 2, y = innerHeight / 2;
  const moved = (e) => { x = e.clientX; y = e.clientY; parent.postMessage({ vantage: "pointer", x, y, inside: true, text: typing(e.target) }, "*"); };
  addEventListener("pointermove", moved, true);
  // A click here is a click elsewhere, to what the viewer has open.
  addEventListener("pointerdown", (e) => e.isTrusted && parent.postMessage({ vantage: "down" }, "*"), true);
  document.addEventListener("pointerleave", () => parent.postMessage({ vantage: "pointer", x, y, inside: false }, "*"));
  // Caught before the app's own listeners, as this runs before its scripts: the app never sees it, so leaving doesn't
  // also close what was open there, and coming back finds it as it was.
  const leave = (e) => { if (e.key !== "Escape") return; e.preventDefault(); e.stopImmediatePropagation(); if (e.type === "keydown") parent.postMessage({ vantage: "escape", x, y }, "*"); };
  addEventListener("keydown", leave, true);
  addEventListener("keyup", leave, true);
  // What a thing is called, and the path back to it, so a note says what it's on, and taking your branch over does what you did again.
  // Something you can press or type into, or else the nearest thing with words of its own: inside a dialog, what's in
  // it, not the dialog.
  const pressable = "a, button, input, select, textarea, label, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [role=option], [role=combobox]";
  const thing = (target) => {
    const pressed = target?.closest?.(pressable);
    if (pressed) return pressed;
    for (let at = target; at && at !== document.body; at = at.parentElement) if (at.nodeType === 1 && words(at)) return at;
    return target;
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
  const did = JSON.parse(sessionStorage.getItem("vantage:did") || "[]");
  const keep = (done) => {
    const last = did.at(-1);
    if (done.does === "fill" && last?.does === "fill" && last.on === done.on) did.pop();
    did.push(done);
    sessionStorage.setItem("vantage:did", JSON.stringify(did));
    parent.postMessage({ vantage: "did", did }, "*");
  };
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
  const ring = document.createElement("div");
  ring.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;border-radius:6px;box-shadow:0 0 0 2px rgba(236,178,72,.95),0 0 0 6px rgba(236,178,72,.18);display:none;transition:all 90ms ease-out";
  document.documentElement.appendChild(ring);
  const ringed = (target) => {
    if (!noting) return void (ring.style.display = "none");
    const box = thing(target).getBoundingClientRect();
    Object.assign(ring.style, { display: "block", left: box.left - 3 + "px", top: box.top - 3 + "px", width: box.width + 6 + "px", height: box.height + 6 + "px" });
  };
  addEventListener("message", ({ source, data }) => {
    if (source !== parent || data?.vantage !== "noting") return;
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
      send();
      const node = window.rrwebRecord?.record?.mirror?.getId(on);
      parent.postMessage({ vantage: "noted", ...(name ? { element: { role: role(on), name, css: path(on), ...(node > 0 && { node }) } } : { point: { x: e.clientX / innerWidth, y: e.clientY / innerHeight } }), did, x: e.clientX, y: e.clientY }, "*");
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
    if (source !== parent || data?.vantage !== "pin") return;
    const pin = pins.get(data.id) ?? document.createElement("div");
    pin.textContent = data.number;
    pin.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;display:none;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:#e0a33a;color:#fff;font:600 11px/18px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff";
    pin.dataset.css = data.css || "";
    pin.dataset.x = data.point?.x ?? "";
    pin.dataset.y = data.point?.y ?? "";
    document.documentElement.appendChild(pin);
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
    if (now !== told) parent.postMessage({ vantage: "pinned", at: (told = now, at) }, "*");
    requestAnimationFrame(place);
  });
  const note = (e) => {
    if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "keydown" && !e.repeat) parent.postMessage({ vantage: "note" }, "*");
  };
  addEventListener("keydown", note, true);
  addEventListener("keyup", note, true);
  const again = JSON.parse(sessionStorage.getItem("vantage:again") || "[]");
  sessionStorage.removeItem("vantage:again");
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const still = () => document.readyState === "complete" && !asked && performance.now() - stirred > 300 && [...document.images].every((image) => image.complete);
  const rested = async () => {
    const since = performance.now();
    await document.fonts?.ready;
    while (!still() && performance.now() - since < 8000) await wait(80);
  };
  // Partway through a step, the actions that only changed what was on the page are done again here, as the flow did them.
  const find = async (path) => {
    for (const until = performance.now() + 3000; performance.now() < until; await wait(80)) {
      const found = document.querySelector(path);
      if (found) return found;
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
    return true;
  };
  // Once it's yours, what you do is recorded, as a flow is, from the page as it was handed over: a note you make here
  // is on your own recording. Each page records itself, from its own first frame.
  let recorded = [];
  const send = () => recorded.length && (parent.postMessage({ vantage: "recorded", events: recorded }, "*"), (recorded = []));
  const record = () =>
    window.rrwebRecord?.record({
      emit: (event) => recorded.push(event) === 1 && setTimeout(send, 100),
      sampling: { mousemove: 20, scroll: 16, input: "all" },
      maskAllInputs: false,
      inlineStylesheet: true,
    });
  const settle = async () => {
    await rested();
    if (scroll) scrollTo(scroll.x, scroll.y);
    // Each waits only for what it acts on to be there; the page rests once they're all done.
    // What's left is kept as each is done, so a click that goes to another page carries on there.
    for (const [i, action] of again.entries()) {
      sessionStorage.setItem("vantage:again", JSON.stringify(again.slice(i + 1)));
      if (!(await doAgain(action))) break;
    }
    sessionStorage.removeItem("vantage:again");
    if (again.length) (stir(), await rested());
    // Once it's drawn, or soon anyway, as a browser may not draw a frame it thinks is hidden.
    let said = false;
    const say = () => said || ((said = true), parent.postMessage({ vantage: "settled" }, "*"));
    requestAnimationFrame(() => requestAnimationFrame(say));
    setTimeout(say, 250);
    record();
  };
  addEventListener("load", () => setTimeout(settle, 50));
})();</script>`;

// Whatever the app says about its own address is said about Vantage's, so the browser stays here, and the app may show
// in the viewer's frame.
function fromTheApp(answer: IncomingMessage, target: URL) {
  const headers = { ...answer.headers };
  delete headers["x-frame-options"];
  // Recorded here, the app's fonts and pictures are asked for again by the recording, from the viewer's page.
  headers["access-control-allow-origin"] = "*";
  const policy = headers["content-security-policy"];
  if (policy) headers["content-security-policy"] = [policy].flat().map((rule) => rule.replace(/frame-ancestors[^;]*;?/i, ""));
  if (headers.location?.startsWith(target.origin)) headers.location = headers.location.slice(target.origin.length) || "/";
  if (headers["set-cookie"]) headers["set-cookie"] = headers["set-cookie"].map((cookie) => cookie.replace(/;\s*Domain=[^;]*/i, ""));
  return headers;
}

// The browser gets the flow's cookies and what the app kept in it, then goes to where the flow's page was.
function handOver(handed: Handed | undefined, response: ServerResponse) {
  if (!handed) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return void response.end("There's no moment ready at this address. Take it over again from the viewer, or with vantage take-over.");
  }
  const { url, cookies, local, session, scroll, clock, did = [] } = handed;
  const again = [...(handed.again ?? []), ...did];
  const { pathname, search, hash } = new URL(url);
  const setCookies = cookies.map(
    ({ name, value, path, expires, httpOnly }) =>
      `${name}=${value}; Path=${path}; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${expires > 0 ? `; Expires=${new Date(expires * 1000).toUTCString()}` : ""}`,
  );
  const keep = JSON.stringify({ local, session, scroll, clock, again, did, to: pathname + search + hash }).replace(/</g, "\\u003c");
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "set-cookie": setCookies });
  response.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Taking over…</title>
<script>
const { local, session, scroll, clock, again, did, to } = ${keep};
for (const [key, value] of Object.entries(local)) localStorage.setItem(key, value);
for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value);
sessionStorage.setItem("vantage:scroll", JSON.stringify(scroll));
sessionStorage.setItem("vantage:clock", String(clock));
sessionStorage.removeItem("vantage:yours");
if (again.length) sessionStorage.setItem("vantage:again", JSON.stringify(again));
sessionStorage.setItem("vantage:did", JSON.stringify(did));
location.replace(to);
</script>`);
}

function notAnswering(response: ServerResponse, app: App) {
  if (response.headersSent) return response.end();
  response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
  response.end(`The app isn't answering at ${app.url}. Start it as vantage/app.json says (${app.start}), then reload.`);
}

// This machine's addresses on its networks, for a phone on the same one.
const addresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((face) => face && face.family === "IPv4" && !face.internal)
    .map((face) => face!.address);
