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

export async function takeOver(repo: Repo, id: string, flowName?: string, stepName?: string) {
  const review = await repo.reviews.get(id);
  const round = review.rounds.findLast((round) => round.number > 0) ?? review.rounds.at(-1);
  if (!round) throw new Refused([`${id} has nothing recorded yet, so there's nothing to take over. Record it first: vantage record ${id}`]);
  const usage = `vantage take-over ${id} "<flow>" ["<step>"]`;
  const names = list(round.flows.map((flow) => quote(flow.name)));
  if (!flowName) throw new Refused([`Take over which flow? ${usage}\nIts flows: ${names}.`]);
  const flow = round.flows.find((flow) => flow.name === flowName);
  if (!flow) throw new Refused([`${id} has no flow called ${quote(flowName)}. Its flows: ${names}.`]);
  if (stepName && !flow.steps.some((step) => step.title === stepName))
    throw new Refused([`${quote(flow.name)} has no step called ${quote(stepName)}. Its steps: ${list(flow.steps.map((step) => quote(step.title)))}.`]);

  const app = await repo.app();
  const started = await keepRunning(app, repo.root);
  const began = Date.now();
  console.log(`Running ${quote(flow.name)} to ${stepName ? `the end of ${quote(stepName)}` : "its end"}, on the app as it is now…`);
  let handed: Handed, port: number;
  try {
    handed = await runTo(repo, id, { flow: flow.name, ...(stepName && { step: stepName }) });
    port = await passOn(app, handed);
  } catch (error) {
    started?.kill();
    throw error;
  }
  const seconds = ((Date.now() - began) / 1000).toFixed(1);

  const here = `http://localhost:${port}/take-over`;
  const away = addresses().map((address) => `http://${address}:${port}/take-over`);
  console.log(`
Ready in ${seconds}s. Carry on from there in your browser: ${here}${away.length ? `\nOr on your phone, on the same network: ${list(away)}` : ""}
Each address hands over the same copy, and the app is passed on through Vantage while this runs. Ctrl+C ends it.`);
  const end = () => {
    started?.kill();
    process.exit(0);
  };
  process.once("SIGINT", end);
  process.once("SIGTERM", end);
}

// The app, as vantage/app.json starts it, kept running for as long as the person uses it, or the one already running:
// Playwright would stop one it started itself as soon as the flow was done.
async function keepRunning(app: App, root: string): Promise<ChildProcess | undefined> {
  if (await answers(app.url)) return undefined;
  console.log(`Starting the app: ${app.start}`);
  const child = spawn(app.start, { cwd: root, shell: true, stdio: "ignore", detached: true });
  const kill = () => {
    try {
      process.kill(-child.pid!);
    } catch {}
  };
  for (let waited = 0; waited < 180; waited++) {
    if (await answers(app.url)) return Object.assign(child, { kill });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  kill();
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
function passOn(app: App, handed: Handed): Promise<number> {
  const target = new URL(app.url);
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://vantage").pathname;
    if (path === "/take-over") return handOver(handed, response);
    const forward = ask(
      { host: target.hostname, port: target.port, method: request.method, path: request.url, headers: asIfDirect(request, target) },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, fromTheApp(answer, target));
        answer.pipe(response);
      },
    );
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

// Whatever the app says about its own address is said about Vantage's, so the browser stays here.
function fromTheApp(answer: IncomingMessage, target: URL) {
  const headers = { ...answer.headers };
  if (headers.location?.startsWith(target.origin)) headers.location = headers.location.slice(target.origin.length) || "/";
  if (headers["set-cookie"]) headers["set-cookie"] = headers["set-cookie"].map((cookie) => cookie.replace(/;\s*Domain=[^;]*/i, ""));
  return headers;
}

// The browser gets the flow's cookies and what the app kept in it, then goes to where the flow's page was.
function handOver({ url, cookies, local, session }: Handed, response: ServerResponse) {
  const { pathname, search, hash } = new URL(url);
  const setCookies = cookies.map(
    ({ name, value, path, expires, httpOnly }) =>
      `${name}=${value}; Path=${path}; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${expires > 0 ? `; Expires=${new Date(expires * 1000).toUTCString()}` : ""}`,
  );
  const keep = JSON.stringify({ local, session, to: pathname + search + hash }).replace(/</g, "\\u003c");
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "set-cookie": setCookies });
  response.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Taking over…</title>
<script>
const { local, session, to } = ${keep};
for (const [key, value] of Object.entries(local)) localStorage.setItem(key, value);
for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value);
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
