// Opens Playthrough on this machine: one page, at one address, listing what's waiting on you from every app it's known in
// and every copy of each, as git's worktrees are. Each change is read from the copy it's kept in, and the list arrives
// again whenever any of them changes, so a change handed over from anywhere shows by itself.

import { asRecorded } from "@playthrough/page";
import { execFileSync } from "node:child_process";
import { rmSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { userInfo } from "node:os";
import { basename, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Reading } from "@playthrough/page";
import { Refused, type Did, type Review, type Seen, type Send } from "@playthrough/review";
import { BEAT } from "./scenes.ts";
import { repo as copyAt, type Repo } from "./repo.ts";
import { readyIn } from "./following.ts";
import { everyCopy, machine } from "./machine.ts";
import { keepNamed, type Assets } from "./assets.ts";
import { frameOf, stillOf, type Framed } from "./frames.ts";
import { getReady, waitedFor } from "./take-over.ts";
import { setupIn } from "./setup.ts";
import { agentWaiting } from "./wait.ts";
import { openFile, stopUnused, UNUSED } from "./app.ts";
import { thisCommand } from "./command.ts";

export const PORT = 5790;
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

export async function open() {
  // One for the machine: open already, it's that one.
  const already = await openAlready(machine());
  if (already) return console.log(`Playthrough is already open at http://localhost:${already}/`);
  const page = fileURLToPath(new URL("../viewer", import.meta.url));
  if (!(await readFile(join(page, "index.html")).catch(() => undefined)))
    throw new Refused(["The viewer isn't built yet. Build it from core with npm run build."]);
  const you = whoYouAre();
  const here = onThisMachine();
  const server = createServer((request, response) => {
    answer(here, page, you, request, response).catch((error) => {
      if (response.headersSent) return response.end();
      const problems = error instanceof Refused ? error.problems : [String(error?.message ?? error)];
      json(response, error instanceof Refused ? 400 : 500, { problems });
    });
  });
  const port = await listen(server, PORT);
  keepsApps();
  console.log(`Playthrough is open at http://localhost:${port}/`);
}

// Open, Playthrough keeps each copy's app once it's running, whoever started it, until nobody has used it for a while:
// stepping in again, or the agent's next command, finds it there. Closed, it lets go of those nobody is using.
function keepsApps() {
  writeFileSync(openFile(), JSON.stringify(thisCommand()));
  const look = (unused: number) => everyCopy().forEach(({ root }) => stopUnused(root, unused));
  setInterval(() => look(UNUSED), 60_000).unref();
  process.once("exit", () => {
    rmSync(openFile(), { force: true });
    look(0);
  });
}

// A change as the page has it: the review, by an address of the machine's (its copy's name, then its own), the app's
// name and its people as the person sees them ("Sam, a member"), and whether an agent is waiting for what's sent.
export type Listed = { review: Review; app: string; people: Record<string, string>; agentWaiting: boolean };

// Every copy on the machine, each read where it's kept, and the list of every change in them, arriving again to whoever
// asks each time it changes.
function onThisMachine() {
  const repos = new Map<string, Repo>();
  const copiesNow = () => everyCopy().map(({ name, root }) => ({ name, repo: repos.get(root) ?? repos.set(root, copyAt(root)).get(root)! }));

  // A change by the parts of its address: its copy's name and its own, then what's asked of it; or, from the page
  // before, its own alone, found in whichever copy has it first.
  async function holding([first, second, ...rest]: string[]): Promise<{ repo: Repo; id: string; address: string; rest: string[] }> {
    const copies = copiesNow();
    const copy = second !== undefined && copies.find((one) => one.name === first);
    if (copy) return { repo: copy.repo, id: second!, address: `${first}/${second}`, rest };
    for (const { repo } of copies) if ((await repo.reviews.list()).includes(first!)) return { repo, id: first!, address: first!, rest: second === undefined ? rest : [second, ...rest] };
    throw new Refused([`There's no change at ${first} on this machine.`]);
  }

  // One that can't be read is left out, and says why when it's opened. Where two copies' changes share the app's name,
  // as two copies of Kan do, each says which copy it's in.
  async function list(): Promise<Listed[]> {
    const each = await Promise.all(
      copiesNow().map(async ({ name, repo }) => {
        const shown = await shownOf(repo);
        const reviews = await Promise.all((await repo.reviews.list()).map((id) => repo.reviews.get(id).catch(() => undefined)));
        return {
          name,
          shown,
          changes: await Promise.all(
            reviews.filter((review) => !!review).map(async (review) => ({ review: { ...review, id: `${name}/${review.id}` }, ...shown, agentWaiting: await agentWaiting(repo, review.id) })),
          ),
        };
      }),
    );
    const listing = each.filter(({ changes }) => changes.length);
    const shared = (app: string) => listing.filter(({ shown }) => shown.app === app).length > 1;
    return listing.flatMap(({ name, shown, changes }) => (shared(shown.app) ? changes.map((change) => ({ ...change, app: `${shown.app} in ${name}` })) : changes));
  }

  // Looked at again soon after anything in a copy's folder changes, and every two seconds, as an agent that's ended
  // says nothing and a copy can be made anywhere; said only when it's different.
  const listening = new Set<(said: string) => void>();
  const watching = new Map<string, FSWatcher>();
  let said = "";
  let looking: Promise<void> | undefined;
  let again = false;
  let soon: ReturnType<typeof setTimeout> | undefined;
  let every: ReturnType<typeof setInterval> | undefined;
  const look = () => {
    if (looking) return void (again = true);
    looking = (async () => {
      do {
        again = false;
        const now = JSON.stringify(await list().catch(() => undefined));
        if (now && now !== said) for (const tell of listening) tell((said = now));
        const roots = new Set(copiesNow().map(({ repo }) => join(repo.root, ".playthrough")));
        for (const [folder, watcher] of watching) if (!roots.has(folder)) (watcher.close(), watching.delete(folder));
        for (const folder of roots)
          if (!watching.has(folder))
            try {
              const watcher = watch(folder, { recursive: true }, () => (clearTimeout(soon), (soon = setTimeout(look, 150))));
              watcher.on("error", () => (watcher.close(), watching.delete(folder)));
              watching.set(folder, watcher);
            } catch {
              // gone already: the next look leaves it out
            }
      } while (again);
    })().finally(() => (looking = undefined));
  };

  return {
    holding,
    list,
    // The list now, then each time it changes, until stopped.
    follow(tell: (said: string) => void): () => void {
      listening.add(tell);
      if (said) tell(said);
      if (!every) (look(), (every = setInterval(look, 2000)));
      return () => {
        listening.delete(tell);
        if (listening.size) return;
        clearInterval(every);
        every = undefined;
        for (const watcher of watching.values()) watcher.close();
        watching.clear();
        said = "";
      };
    },
  };
}
type Machine = ReturnType<typeof onThisMachine>;

// The port of Playthrough already open for this machine, if one is: each says whose it is.
export async function openAlready(home: string): Promise<number | undefined> {
  const ports = Array.from({ length: 21 }, (_, i) => PORT + i);
  const asked = (port: number) =>
    fetch(`http://127.0.0.1:${port}/api/app`, { signal: AbortSignal.timeout(1000) })
      .then((answer) => answer.json())
      .then((said: { machine?: string }) => (said.machine === home ? port : undefined), () => undefined);
  return (await Promise.all(ports.map(asked))).find((port) => port !== undefined);
}

async function answer(here: Machine, page: string, you: string, request: IncomingMessage, response: ServerResponse) {
  const stranger = fromElsewhere(request);
  if (stranger) return json(response, 403, { problems: [stranger] });
  const asked = new URL(request.url ?? "/", "http://localhost");
  const path = decodeURIComponent(asked.pathname);
  const [api, collection, ...parts] = path.split("/").filter(Boolean);
  if (api !== "api") return serve(page, path, response);

  if (request.method === "GET" && collection === "you") return json(response, 200, { name: you });
  if (request.method === "GET" && collection === "app") return json(response, 200, { machine: machine() });
  if (collection !== "reviews") return json(response, 404, { problems: [`There's nothing at ${path}.`] });

  if (request.method === "GET" && !parts.length) {
    if (!asked.searchParams.has("live")) return json(response, 200, await here.list());
    // The list now, then again each time it changes, for as long as the page is open.
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
    const stop = here.follow((said) => response.write(`data: ${said}\n\n`));
    return void request.on("close", stop);
  }
  if (!parts.length) return json(response, 404, { problems: [`There's nothing at ${path}.`] });
  const { repo, id, address, rest } = await here.holding(parts);
  const reviews = repo.reviews;

  if (request.method === "GET" && rest[0] === "rounds" && rest[2] === "files" && rest[3]) {
    // Your branches play beside the round's recordings, as if they were its own.
    const name = rest.slice(3).join("/");
    const branch = name.match(/^(assets\/|readings\/)?branches\/(.+)$/);
    const bytes = branch ? await reviews.branch(id, `${branch[1] ?? ""}${branch[2]}`) : await reviews.file(id, Number(rest[1]), name);
    if (!bytes) return json(response, 404, { problems: [`Round ${rest[1]} of ${id} has no file called “${rest.slice(3).join("/")}”.`] });
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "max-age=31536000, immutable" });
    // An SVG asks for light or dark itself: asked for as recorded (?as=dark,still), it's answered that way.
    const as = asked.searchParams.get("as");
    if (as !== null && extname(path) === ".svg") return response.end(asRecorded(Buffer.from(bytes).toString("utf8"), { dark: as.includes("dark"), still: as.includes("still") }));
    return response.end(bytes);
  }
  if (request.method === "POST" && rest[0] === "seen") {
    const { by, moments } = await body<{ by: string; moments: Seen[] }>(request);
    await reviews.see(id, by, moments);
    return json(response, 200, {});
  }
  if (request.method === "POST" && rest[0] === "take-over") return takeOver(repo, id, request, response);
  if (request.method === "POST" && rest[0] === "ready-in") return readyInFor(repo, id, request, response);
  if (request.method === "POST" && rest[0] === "branches") return branch(repo, id, request, response);
  if (request.method === "POST" && rest[0] === "stills") return json(response, 200, { picture: await stillOf(repo, id, address, await body<Framed>(request), request.socket.localPort!) });
  if (request.method === "POST" && rest[0] === "frames") {
    const { note, ...framed } = await body<Framed & { note: string }>(request);
    return json(response, 200, await frameOf(repo, id, address, note, framed, request.socket.localPort!));
  }
  if (request.method === "POST" && rest[0] === "sends") {
    await reviews.send(id, await body<Send>(request));
    return json(response, 200, {});
  }
  return json(response, 404, { problems: [`There's nothing at ${path}.`] });
}

// How the person sees the app and its people: the app by its package's name, and each person by their name and who they
// are, as setup.ts says it ("Sam, a member").
async function shownOf(repo: Repo): Promise<{ app: string; people: Record<string, string> }> {
  const named = await readFile(join(repo.root, "package.json"), "utf8").then((text) => String(JSON.parse(text).name ?? ""), () => "");
  const app = named.replace(/^@[^/]+\//, "") || basename(repo.root);
  const { people } = await setupIn(repo.setup).catch(() => ({ people: undefined }));
  return { app: app.charAt(0).toUpperCase() + app.slice(1), people: Object.fromEntries(Object.entries(people ?? {}).map(([name, who]) => [name, `${name}, ${who}`])) };
}


// A moment stepped into: the viewer asks as Step in is pressed where the playhead rests, and shows the app there, through
// Playthrough, at the port and moment this answers with; and where the moment's checks at its end don't hold on the app
// as it is now, what they say. A tab closed or reloaded meanwhile stops it.
async function takeOver(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse) {
  const { scene, step, actions } = await body<{ scene: string; step?: string; actions?: number }>(request);
  const { port, moment, checked } = await getReady(repo, id, scene, { step, actions, waiting: waitedFor(response) });
  json(response, 200, { port, moment, ...(checked && { checked }) });
}

// What a person did in the app, taken over, kept as a recording of its own: the scene as it was recorded up to where they
// took it over, then theirs, going on from there. It plays like any scene, with what the scene's recording kept of the
// app's files, and a note on it is on what they saw. Each time it's kept, it's kept whole, under a new name, as what
// the viewer has fetched once it keeps.
async function branch(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse) {
  const { round, scene: name, at, events, recording } = await body<{ round: number; scene: string; at: number; events: Event[]; recording: string }>(request);
  const scene = (await repo.reviews.get(id)).rounds.find((kept) => kept.number === round)?.scenes.find((scene) => scene.name === name);
  const was = scene && (await repo.reviews.file(id, round, scene.recording));
  if (!scene || !was || !events.length) return json(response, 404, { problems: [`Round ${round} of ${id} has no recording of “${name}” to branch off.`] });
  const before: Event[] = JSON.parse(Buffer.from(was).toString("utf8"));
  const start = before[0]!.timestamp;
  const then = start + at * 1000;
  const shift = then + 1 - events[0]!.timestamp;
  const yours = paced(events).map((event) => ({ ...event, timestamp: event.timestamp + shift }));
  const joined = [...before.filter((event) => event.timestamp <= then), ...yours.filter((event) => !readingOf(event))];
  await repo.reviews.saveBranch(id, recording, Buffer.from(JSON.stringify(joined)));
  // As the app read itself while you were in it. Only yours: the page there is recorded afresh, its elements numbered
  // anew, so the scene's readings from before would name the wrong things.
  const readings = yours.filter(readingOf).map((event) => ({ step: "In the app", at: (event.timestamp - start) / 1000, ...readingOf(event)! }));
  await repo.reviews.saveBranch(id, `readings/${recording}`, Buffer.from(JSON.stringify(readings)));
  // What the moment's recording kept, and what yours names besides, as fonts of a page the moment never showed.
  const kept = await repo.reviews.file(id, round, `assets/${scene.recording}`);
  const theirs: Assets = kept ? JSON.parse(Buffer.from(kept).toString("utf8")) : {};
  const all = await keepNamed(JSON.stringify(yours), theirs, (await repo.app()).url, (file, bytes) => repo.reviews.saveBranch(id, file, bytes));
  // Read from the round's files, a branch's own are under branches/.
  const named = Object.fromEntries(Object.entries(all).map(([address, file]) => [address, address in theirs ? file : `branches/${file}`]));
  if (Object.keys(named).length) await repo.reviews.saveBranch(id, `assets/${recording}`, Buffer.from(JSON.stringify(named)));
  json(response, 200, { length: (joined.at(-1)!.timestamp - start) / 1000 });
}

type Event = { timestamp: number; type?: number; data?: { tag?: string; payload?: Pick<Reading, "screen" | "things"> } };
// Watched later, yours keeps its pace while you act, but a while spent looking, when nothing happened, goes by in a
// scene's pause.
function paced(events: Event[]): Event[] {
  let cut = 0;
  return events.map((event, i) => {
    cut += Math.max(0, event.timestamp - (events[i - 1]?.timestamp ?? event.timestamp) - BEAT);
    return { ...event, timestamp: event.timestamp - cut };
  });
}
const readingOf = (event: Event) => (event.type === 5 && event.data?.tag === "reading" ? event.data.payload : undefined);

// How long until a moment asked for is ready, for the viewer to count down to, if it can be known.
async function readyInFor(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse) {
  const { scene, step, actions } = await body<{ scene: string; step?: string; actions?: number }>(request);
  json(response, 200, { in: await readyIn(repo, id, { scene, step, actions }) });
}

// The viewer is one page: any address that isn't one of its files is the page, which reads the address itself.
async function serve(page: string, path: string, response: ServerResponse) {
  const file = normalize(join(page, path));
  const bytes = file.startsWith(page + sep) ? await readFile(file).catch(() => undefined) : undefined;
  if (bytes) {
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    return response.end(bytes);
  }
  response.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
  response.end(await readFile(join(page, "index.html")));
}

// What's sent here reaches the agent in the person's name, so only the viewer, on this machine, may ask: by this
// machine's own name, which a site that has made its name lead here (DNS rebinding) doesn't use, and, sending, from the
// viewer's own address, as any site's page can send here.
function fromElsewhere(request: IncomingMessage): string | undefined {
  const { host, origin } = request.headers;
  if (!thisMachine(host)) return `Playthrough answers only at localhost, not at “${host}”. Open http://localhost:${request.socket.localPort}/.`;
  if (origin !== undefined && origin !== `http://${host}`) return `Only Playthrough's own page can ask this, not ${origin}.`;
}

// This machine, by the names it's reached by here.
export const thisMachine = (host: string | undefined) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host ?? "");

// Its shape is checked by the store, at the door, like anything else that's kept.
async function body<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Refused(["What was sent isn't JSON."]);
  }
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": TYPES[".json"], "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

// Locally, whoever runs Playthrough is the one sending: by the name git knows them by, or their name on this machine.
function whoYouAre(): string {
  try {
    return execFileSync("git", ["config", "--global", "user.name"], { encoding: "utf8" }).trim() || userInfo().username;
  } catch {
    return userInfo().username;
  }
}

// The usual port, or the next free one when something else has it. Only this machine reaches it, unless it's for a phone.
export function listen(server: ReturnType<typeof createServer>, usual: number, host = "127.0.0.1", port = usual): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" && port < usual + 20) resolve(listen(server, usual, host, port + 1));
      else reject(error);
    });
    server.listen(port, host, () => resolve(port));
  });
}
