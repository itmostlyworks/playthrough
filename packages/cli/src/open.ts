// Opens Playthrough on this machine: one page, at one address, listing what's waiting on you from every app it's known in
// and every copy of each, as git's worktrees are. Each change is read from the copy it's kept in, and the list arrives
// again whenever any of them changes, so a change handed over from anywhere shows by itself. It stays open behind the
// command that opened it until `playthrough close`.

import { asRecorded } from "@playthrough/page";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { userInfo } from "node:os";
import { basename, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Reading } from "@playthrough/page";
import { problemsWithGuestsName, problemsWithName, Refused, SHARED, type Did, type Change, type Seen, type Send } from "@playthrough/change";
import { BEAT } from "./run.ts";
import { repo as copyAt, type Repo } from "./repo.ts";
import { CantStepIn, cantStepIn, readyIn, unlikeAt } from "./following.ts";
import { everyCopy, machine } from "./machine.ts";
import { keepNamed, type Assets } from "./assets.ts";
import { frameOf, stillOf, type Framed } from "./frames.ts";
import { getReady, keepReady, onTheWayTo, placeOf, waitedFor } from "./step-in.ts";
import { setupIn } from "./setup.ts";
import { agentGone, agentWaiting } from "./wait.ts";
import { endsWithPlaythrough, openFile, stopUnused, UNUSED } from "./app.ts";
import { answers } from "./serving.ts";
import { sayReady, startBehind } from "./behind.ts";
import { passedThroughIn } from "./passed.ts";
import { stillAt, thisCommand, type Command } from "./command.ts";
import { sharing, type Door, type Guest, type Sharing } from "./share.ts";
import { videoOf, type Asked } from "./video.ts";

// The page's usual port, or another, to try Playthrough beside the one in use: PLAYTHROUGH_PORT, as PLAYTHROUGH_HOME is.
export const PORT = Number(process.env.PLAYTHROUGH_PORT) || 5790;
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
  let shares: Sharing | undefined;
  const server = createServer((request, response) => void answered(response, () => answer(here, page, you, shares!, request, response)));
  const port = await listen(server, PORT);
  shares = sharing(doorOf(page, you, port, here));
  keepsApps(port);
  console.log(`Playthrough is open at http://localhost:${port}/`);
}

// The command: the page started behind it (behind.ts), so it outlives the shell that ran it, as an agent's that gave up
// on it took it down (a real run, 0.7.1); open already, it's that one. What it says after is in open.log, beside apps.json.
export async function openBehind() {
  if (process.send) return open().then(sayReady);
  const already = openNow(machine());
  if (already?.port) return console.log(`Playthrough is already open at http://localhost:${already.port}/`);
  if (already) {
    await stop(already);
    console.log("The Playthrough an earlier version left open is closed, for this one.");
  }
  await startBehind(join(machine(), "open.log"), `Playthrough ended before it was open. Look at ${join(machine(), "open.log")} for why.`);
  console.log("It stays open until playthrough close.");
}

// Closed as Ctrl+C closes it: what its step ins made is given back, and the apps it kept that nobody is using stop.
export async function close() {
  const open = openNow(machine());
  if (!open) return console.log("Playthrough isn't open.");
  await stop(open);
  console.log(open.port ? `Playthrough is closed: http://localhost:${open.port}/ no longer answers.` : "Playthrough is closed.");
}

async function stop(open: Open) {
  process.kill(open.by, "SIGINT");
  for (let waited = 0; stillAt(open); waited += 250) {
    if (waited > 15_000) throw new Refused([`Playthrough${open.port ? `, at http://localhost:${open.port}/,` : ""} didn't close within 15 seconds. Stop its process, ${open.by}, then run this again.`]);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// Open, Playthrough keeps each copy's app once it's running, whoever started it, until nobody has used it for a while:
// stepping in again, or the agent's next command, finds it there. Closed, by Ctrl+C or playthrough close too, it lets go
// of those nobody is using.
function keepsApps(port: number) {
  writeFileSync(openFile(), JSON.stringify({ ...thisCommand(), port } satisfies Open));
  const look = (unused: number) => everyCopy().forEach(({ root }) => stopUnused(root, unused));
  setInterval(() => look(UNUSED), 60_000).unref();
  endsWithPlaythrough();
  process.once("exit", () => {
    rmSync(openFile(), { force: true });
    look(0);
  });
}

// Playthrough open for this machine, as its page wrote it down: the process it runs in, and its port. One opened by
// 0.7.1 didn't write its port, so the page can't be sent there: open closes it and opens in its place.
type Open = Command & { port?: number };
function openNow(home: string): Open | undefined {
  try {
    const open: Open = JSON.parse(readFileSync(openFile(home), "utf8"));
    return stillAt(open) ? open : undefined;
  } catch {
    return undefined;
  }
}

// A change as the page has it: the change, by an address of the machine's (its copy's name, then its own), the app's
// name and its people as the person sees them ("Sam, a member"), whether an agent is waiting for what's sent, and
// whether the one it was last said to is known to have ended.
export type Listed = { change: Change; app: string; people: Record<string, string>; agentWaiting: boolean; agentGone: boolean };

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
    for (const { repo } of copies) if ((await repo.changes.list()).includes(first!)) return { repo, id: first!, address: first!, rest: second === undefined ? rest : [second, ...rest] };
    throw new Refused([`There's no change at ${first} on this machine.`]);
  }

  // A shared change, by its whole address and nothing else: its copy by name, and only that change read in it, never
  // another, nor the list of them.
  function only(address: string, rest: string[] = []): { repo: Repo; id: string; address: string; rest: string[] } {
    const [name, id] = address.split("/");
    const copy = copiesNow().find((one) => one.name === name);
    if (!copy || !id) throw new Refused([`There's no change at ${address} on this machine.`]);
    return { repo: copy.repo, id, address, rest };
  }

  // A change as the page has it, by its address.
  const listedAs = async (name: string, repo: Repo, change: Change, shown: Awaited<ReturnType<typeof shownOf>>): Promise<Listed> => ({
    change: { ...change, id: `${name}/${change.id}` },
    ...shown,
    agentWaiting: await agentWaiting(repo, change.id),
    agentGone: await agentGone(repo, change.id),
  });

  // The shared change alone, as listed (gone, none), its app by its own name.
  async function listedOnly(address: string): Promise<Listed[]> {
    const { repo, id } = only(address);
    const change = await repo.changes.get(id).catch(() => undefined);
    return change ? [await listedAs(address.split("/")[0]!, repo, change, await shownOf(repo))] : [];
  }

  // One that can't be read is left out, and says why when it's opened. Where two copies' changes share the app's name,
  // as two copies of Kan do, each says which copy it's in.
  async function list(): Promise<Listed[]> {
    const each = await Promise.all(
      copiesNow().map(async ({ name, repo }) => {
        const shown = await shownOf(repo);
        const changes = await Promise.all((await repo.changes.list()).map((id) => repo.changes.get(id).catch(() => undefined)));
        return { name, shown, changes: await Promise.all(changes.filter((change) => !!change).map((change) => listedAs(name, repo, change, shown))) };
      }),
    );
    const listing = each.filter(({ changes }) => changes.length);
    const shared = (app: string) => listing.filter(({ shown }) => shown.app === app).length > 1;
    return listing.flatMap(({ name, shown, changes }) => (shared(shown.app) ? changes.map((one) => ({ ...one, app: `${shown.app} in ${name}` })) : changes));
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
    only,
    list,
    listedOnly,
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
type Held = Awaited<ReturnType<Machine["holding"]>>;

// The port of Playthrough already open for this machine, if one is.
export async function openAlready(home: string): Promise<number | undefined> {
  return openNow(home)?.port;
}

// What a shared change's door asks of this machine (share.ts): the page, whose it is, the changes, and one change's
// answers, as a guest's, its pictures drawn by the person's own page at `port`.
export function doorOf(page: string, owner: string, port: number, here = onThisMachine()): Door {
  return {
    page,
    owner,
    listed: here.listedOnly,
    answerOn: (address, rest, request, response, guest) => answerOn(here.only(address, rest), request, response, port, guest),
  };
}

// Whatever stopped an answer, said in plain words: what's refused as asked, anything else as Playthrough's own.
export async function answered(response: ServerResponse, answering: () => Promise<unknown>) {
  try {
    await answering();
  } catch (error) {
    if (response.headersSent) return void response.end();
    const problems = error instanceof Refused ? error.problems : [String((error as Error)?.message ?? error)];
    json(response, error instanceof Refused ? 400 : 500, { problems });
  }
}

async function answer(here: Machine, page: string, you: string, shares: Sharing, request: IncomingMessage, response: ServerResponse) {
  const stranger = fromElsewhere(request);
  if (stranger) return json(response, 403, { problems: [stranger] });
  const asked = new URL(request.url ?? "/", "http://localhost");
  const path = decodeURIComponent(asked.pathname);
  const [api, collection, ...parts] = path.split("/").filter(Boolean);
  if (api !== "api") return serve(page, path, response);

  if (request.method === "GET" && collection === "you") return json(response, 200, { name: you });
  if (collection !== "changes") return json(response, 404, { problems: [`There's nothing at ${path}.`] });

  if (request.method === "GET" && !parts.length) {
    if (!asked.searchParams.has("live")) return json(response, 200, await here.list());
    // The list now, then again each time it changes, for as long as the page is open.
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
    const stop = here.follow((said) => response.write(`data: ${said}\n\n`));
    return void request.on("close", stop);
  }
  if (!parts.length) return json(response, 404, { problems: [`There's nothing at ${path}.`] });
  const held = await here.holding(parts);
  // Sharing, and a video of what's shown, are the person's alone: asked for here, on this machine, never through what's
  // shared.
  if (held.rest.length === 1 && held.rest[0] === "share") {
    if (request.method === "GET") return json(response, 200, shares.of(held.address));
    if (request.method === "POST") return json(response, 200, shares.start(held.address));
    if (request.method === "DELETE") return json(response, 200, shares.stop(held.address));
  }
  if (request.method === "POST" && held.rest.length === 1 && held.rest[0] === "video") return video(held, request, response);
  return answerOn(held, request, response, request.socket.localPort!);
}

// What's asked of one change, by the person or by a guest on it, shared (share.ts), who asks only what sharing lets
// them, and whose sends and what they've opened are in a name of their own, never the person's.
async function answerOn(held: Held, request: IncomingMessage, response: ServerResponse, port: number, guest?: Guest) {
  const { repo, id, address, rest } = held;
  if (guest) guests.set(request, guest);
  const changes = repo.changes;
  const path = `/api/changes/${address}/${rest.join("/")}`;
  const asked = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && rest[0] === "hand-backs" && rest[2] === "files" && rest[3]) {
    // Your branches play beside the hand-back's recordings, as if they were its own.
    const name = rest.slice(3).join("/");
    const branch = name.match(/^(assets\/|readings\/)?branches\/(.+)$/);
    const bytes = branch ? await changes.branch(id, `${branch[1] ?? ""}${branch[2]}`) : await changes.file(id, Number(rest[1]), name);
    if (!bytes) return json(response, 404, { problems: [`Hand-back ${rest[1]} of ${id} has no file called “${name}”.`] });
    response.writeHead(200, { "content-type": TYPES[extname(name)] ?? "application/octet-stream", "cache-control": "max-age=31536000, immutable" });
    // An SVG asks for light or dark itself: asked for as recorded (?as=dark,still), it's answered that way.
    const as = asked.searchParams.get("as");
    if (as !== null && extname(name) === ".svg") return response.end(asRecorded(Buffer.from(bytes).toString("utf8"), { dark: as.includes("dark"), still: as.includes("still") }));
    return response.end(bytes);
  }
  if (request.method === "POST" && rest[0] === "seen") {
    const { by, moments } = await body<{ by: string; moments: Seen[] }>(request);
    guest?.speaksAs(by);
    await changes.see(id, by, moments);
    return json(response, 200, {});
  }
  // A guest's name, before it's theirs: what's wrong with it, as a send in it would be told.
  if (request.method === "POST" && rest[0] === "name" && guest) {
    const { by } = await body<{ by: string }>(request);
    guest.speaksAs(by);
    const change = await changes.get(id);
    return json(response, 200, { problems: [...problemsWithName(by), ...problemsWithGuestsName(change, by)] });
  }
  if (request.method === "POST" && rest[0] === "step-in") return stepInto(repo, id, request, response, guest);
  if (request.method === "POST" && rest[0] === "ready-in") return readyInFor(repo, id, request, response);
  if (request.method === "POST" && rest[0] === "keep-ready") return keptReady(repo, id, request, response);
  if (request.method === "POST" && rest[0] === "branches") return branch(repo, id, request, response, guest);
  // Drawn by a browser opening the person's own page, on this machine, whoever asked.
  if (request.method === "POST" && rest[0] === "stills") return json(response, 200, { picture: await stillOf(repo, id, address, await body<Framed>(request), port) });
  if (request.method === "POST" && rest[0] === "frames") {
    const { note, ...framed } = await body<Framed & { note: string }>(request);
    return json(response, 200, await frameOf(repo, id, address, note, framed, port));
  }
  if (request.method === "POST" && rest[0] === "sends") {
    // Whether it's a guest's is this side's to say, never what was sent.
    const { guest: _, ...said } = await body<Send>(request);
    await changes.send(id, guest ? guest.sends(said) : said);
    return json(response, 200, {});
  }
  return json(response, 404, { problems: [`There's nothing at ${path}.`] });
}

// What you're watching as a video, a line at a time while it's made: how long it has left, then the video, or what went
// wrong.
async function video({ repo, id, address }: Held, request: IncomingMessage, response: ServerResponse) {
  const asked = await body<Asked>(request);
  response.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store" });
  const say = (line: { left: number } | { video: string } | { problems: string[] }) => response.write(`${JSON.stringify(line)}\n`);
  try {
    const made = await videoOf(repo, id, address, asked, request.socket.localPort!, (left) => say({ left: Math.round(left * 10) / 10 }));
    say({ video: Buffer.from(made).toString("base64") });
  } catch (error) {
    say({ problems: [`The video couldn't be made: ${(error as Error).message.split("\n")[0]}`] });
  }
  response.end();
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
// as it is now, what they say. A tab closed or reloaded meanwhile stops it. One that can't be, whatever stopped it, says
// why in a line for the person and whole for the agent (following.ts). A guest's is theirs to reach, through what's
// shared, and only theirs.
async function stepInto(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse, guest?: Guest) {
  const { moment, after } = await body<{ moment: string; after?: number }>(request);
  const ready = await placeOf(repo, id, moment, after)
    .then((to) => getReady(repo, id, to, waitedFor(response)))
    .catch(cantStepIn.other);
  if (ready instanceof CantStepIn) return json(response, 400, { problems: ready.problems, plainly: ready.plainly });
  const { port, name, setup, checked } = ready;
  guest?.steppedIn(name, port);
  json(response, 200, { port, name, setup, ...(checked && { checked }) });
}

// Where the recording rests, once someone has stepped in on the change, for the next step in there to be quick. Answered at
// once, and nothing said of it: one that can't be made is the step in's to say why.
async function keptReady(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse) {
  const { moment, after } = await body<{ moment: string; after?: number }>(request);
  json(response, 200, {});
  await placeOf(repo, id, moment, after).then((to) => keepReady(repo, id, to)).catch(() => {});
}

// What a person did in the app, stepped into, kept as a recording of its own: the moment as it was recorded up to where they
// took it over, then theirs, going on from there. It plays like any moment, with what the moment's recording kept of the
// app's files, and a note on it is on what they saw. Each time it's kept, it's kept whole, under a new name, as what
// the viewer has fetched once it keeps.
// A guest's is kept under shared/ and only there, never in place of another: the viewer plays what's there with nothing
// but its own files (`byAGuest`).
async function branch(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse, guest?: Guest) {
  const { handBack, moment: name, at, events, recording } = await body<{ handBack: number; moment: string; at: number; events: Event[]; recording: string }>(request);
  if (!guest !== !recording.startsWith(SHARED) || (guest && (await repo.changes.branch(id, recording))))
    throw new Refused([guest ? `What a guest does in the app is kept as a new recording under ${SHARED}.` : `${SHARED} is where a guest's recordings are kept.`]);
  const moment = (await repo.changes.get(id)).handBacks.find((kept) => kept.number === handBack)?.moments.find((moment) => moment.name === name);
  const was = moment && (await repo.changes.file(id, handBack, moment.recording));
  if (!moment || !was || !events.length) return json(response, 404, { problems: [`Hand-back ${handBack} of ${id} has no recording of “${name}” to branch off.`] });
  const before: Event[] = JSON.parse(Buffer.from(was).toString("utf8"));
  const start = before[0]!.timestamp;
  const then = start + at * 1000;
  const shift = then + 1 - events[0]!.timestamp;
  const yours = paced(events).map((event) => ({ ...event, timestamp: event.timestamp + shift }));
  const joined = [...before.filter((event) => event.timestamp <= then), ...yours.filter((event) => !readingOf(event))];
  await repo.changes.saveBranch(id, recording, Buffer.from(JSON.stringify(passedThroughIn(joined))));
  // As the app read itself while you were in it. Only yours: the page there is recorded afresh, its elements numbered
  // anew, so the moment's readings from before would name the wrong things.
  const readings = yours.filter(readingOf).map((event) => ({ step: "In the app", at: (event.timestamp - start) / 1000, ...readingOf(event)! }));
  await repo.changes.saveBranch(id, `readings/${recording}`, Buffer.from(JSON.stringify(readings)));
  // What the moment's recording kept, and what yours names besides, as fonts of a page the moment never showed.
  const kept = await repo.changes.file(id, handBack, `assets/${moment.recording}`);
  const theirs: Assets = kept ? JSON.parse(Buffer.from(kept).toString("utf8")) : {};
  const app = (await repo.app()).url;
  const all = await keepNamed(JSON.stringify(yours), theirs, app, (file, bytes) => repo.changes.saveBranch(id, file, bytes), onTheWayTo(new URL(app).origin));
  // Read from the hand-back's files, a branch's own are under branches/.
  const named = Object.fromEntries(Object.entries(all).map(([address, file]) => [address, address in theirs ? file : `branches/${file}`]));
  if (Object.keys(named).length) await repo.changes.saveBranch(id, `assets/${recording}`, Buffer.from(JSON.stringify(named)));
  json(response, 200, { length: (joined.at(-1)!.timestamp - start) / 1000 });
}

type Event = { timestamp: number; type?: number; data?: { tag?: string; payload?: Pick<Reading, "screen" | "things"> } };
// Watched later, yours keeps its pace while you act, but a while spent looking, when nothing happened, goes by in a
// moment's pause.
function paced(events: Event[]): Event[] {
  let cut = 0;
  return events.map((event, i) => {
    cut += Math.max(0, event.timestamp - (events[i - 1]?.timestamp ?? event.timestamp) - BEAT);
    return { ...event, timestamp: event.timestamp - cut };
  });
}
const readingOf = (event: Event) => (event.type === 5 && event.data?.tag === "reading" ? event.data.payload : undefined);

// How long until a moment asked for is ready, for the viewer to count down to, if it can be known; or that the app isn't
// running, as after it's gone unused a while, so it starts first, for as long as it takes, which the person is told.
// And what their browser can't be of the one the moment ran in, for them to read before they're in.
async function readyInFor(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse) {
  const { moment, after } = await body<{ moment: string; after?: number }>(request);
  const to = await placeOf(repo, id, moment, after).catch(() => undefined);
  const unlike = to && (await unlikeAt(repo, id, to).catch(() => undefined));
  if (!(await repo.app().then((app) => answers(app.url), () => true))) return json(response, 200, { starting: true, ...(unlike && { unlike }) });
  json(response, 200, { in: to && (await readyIn(repo, id, to)), ...(unlike && { unlike }) });
}

// The viewer is one page: any address that isn't one of its files is the page, which reads the address itself. Served
// from a folder of an address (`home`), as to a guest, its files are asked for from there.
export async function serve(page: string, path: string, response: ServerResponse, home = "/") {
  const file = normalize(join(page, path));
  const bytes = file.startsWith(page + sep) ? await readFile(file).catch(() => undefined) : undefined;
  if (bytes) {
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    return response.end(bytes);
  }
  response.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" });
  response.end((await readFile(join(page, "index.html"), "utf8")).replace(/(src|href)="\//g, `$1="${home}`));
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

// Its shape is checked by the store, at the door, like anything else that's kept. Never more than a person's longest
// time in the app records, read as far as that and no further; a guest's counted against what their link may keep.
const LARGEST = 64 * 1024 * 1024;
const guests = new WeakMap<IncomingMessage, Guest>();
async function body<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > LARGEST) {
      // Not read on: the rest is let go with the connection, which says so to whoever's sending.
      request.socket.destroy();
      throw new Refused([`What was sent is larger than ${LARGEST / 1024 / 1024} MB, more than Playthrough ever takes at once.`]);
    }
    chunks.push(chunk);
  }
  guests.get(request)?.took(size);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Refused(["What was sent isn't JSON."]);
  }
}

export function json(response: ServerResponse, status: number, value: unknown) {
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
