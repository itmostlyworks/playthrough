// Takes a flow over: runs it to the end of a step on the app as it is now, then hands the page as it was there to a
// person, in their own browser or on their phone, to carry on from. It's the real app under their hands, a fresh copy
// of the moment made the way every flow starts, not a picture of it. Vantage passes everything on to the app, and at
// /take-over gives the browser what the flow's page had: its address, its cookies, and what the app kept in the browser.

import { spawn, type ChildProcess } from "node:child_process";
import { createServer, request as ask, type IncomingMessage, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { list, quote, Refused } from "@mostlyworks/vantage-review";
import { runTo, type Handed } from "./flows.ts";
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
export async function getReady(repo: Repo, id: string, flowName: string, stepName?: string): Promise<{ port: number; moment: string; seconds: string }> {
  const round = await recorded(repo, id);
  const flow = round.flows.find((flow) => flow.name === flowName);
  if (!flow) throw new Refused([`${id} has no flow called ${quote(flowName)}. Its flows: ${list(round.flows.map((flow) => quote(flow.name)))}.`]);
  if (stepName && !flow.steps.some((step) => step.title === stepName))
    throw new Refused([`${quote(flow.name)} has no step called ${quote(stepName)}. Its steps: ${list(flow.steps.map((step) => quote(step.title)))}.`]);

  const app = await repo.app();
  await keepRunning(app, repo.root);
  const began = Date.now();
  const handed = await runTo(repo, id, { flow: flow.name, ...(stepName && { step: stepName }) });
  passing ??= { moments: new Map(), port: passOn(app, (moment) => passing!.moments.get(moment)) };
  const moment = String(passing.moments.size + 1);
  passing.moments.set(moment, handed);
  return { port: await passing.port, moment, seconds: ((Date.now() - began) / 1000).toFixed(1) };
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
async function keepRunning(app: App, root: string) {
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
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => process.exit(0));
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
        const body = html.slice(0, end) + SAYS + html.slice(end);
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
// nothing changing for a moment), so the frame turns into it with nothing on screen changing. Its own pointer is hidden:
// it tells the viewer where it is, and whether it's over words you can type into, and the viewer draws it, the
// recording's pointer become yours, with its name. And as every key there goes to the app, Escape, if the app doesn't
// use it itself, goes back to the viewer.
const SAYS = `<script>(() => {
  if (window.parent === window) return;
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
  const typing = (target) => !!target?.closest?.('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, [contenteditable=""], [contenteditable=true]');
  // Every move, as early as the browser has it: held for a frame, the name trailed the pointer like a smoothed one.
  let x = innerWidth / 2, y = innerHeight / 2;
  const moved = (e) => { x = e.clientX; y = e.clientY; parent.postMessage({ vantage: "pointer", x, y, inside: true, text: typing(e.target) }, "*"); };
  addEventListener("onpointerrawupdate" in window ? "pointerrawupdate" : "pointermove", moved, true);
  document.addEventListener("pointerleave", () => parent.postMessage({ vantage: "pointer", x, y, inside: false }, "*"));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.defaultPrevented) parent.postMessage({ vantage: "escape", x, y }, "*"); });
  const began = performance.now();
  const settle = async () => {
    await document.fonts?.ready;
    const still = document.readyState === "complete" && !asked && performance.now() - stirred > 300 && [...document.images].every((image) => image.complete);
    if (!still && performance.now() - began < 8000) return setTimeout(settle, 80);
    if (scroll) scrollTo(scroll.x, scroll.y);
    requestAnimationFrame(() => requestAnimationFrame(() => parent.postMessage({ vantage: "settled" }, "*")));
  };
  addEventListener("load", () => setTimeout(settle, 50));
})();</script>`;

// Whatever the app says about its own address is said about Vantage's, so the browser stays here, and the app may show
// in the viewer's frame.
function fromTheApp(answer: IncomingMessage, target: URL) {
  const headers = { ...answer.headers };
  delete headers["x-frame-options"];
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
  const { url, cookies, local, session, scroll } = handed;
  const { pathname, search, hash } = new URL(url);
  const setCookies = cookies.map(
    ({ name, value, path, expires, httpOnly }) =>
      `${name}=${value}; Path=${path}; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${expires > 0 ? `; Expires=${new Date(expires * 1000).toUTCString()}` : ""}`,
  );
  const keep = JSON.stringify({ local, session, scroll, to: pathname + search + hash }).replace(/</g, "\\u003c");
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "set-cookie": setCookies });
  response.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Taking over…</title>
<script>
const { local, session, scroll, to } = ${keep};
for (const [key, value] of Object.entries(local)) localStorage.setItem(key, value);
for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value);
sessionStorage.setItem("vantage:scroll", JSON.stringify(scroll));
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
