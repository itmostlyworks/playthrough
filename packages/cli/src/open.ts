// Opens the viewer on this machine: its page, and the reviews in .playthrough/ for it to read and send to, in every copy
// of the app, as git's worktrees are, so one viewer from anywhere in the repo has them all. Each review the viewer shows
// streams to it as it's kept, so a new round or a send from elsewhere arrives without asking.

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { userInfo } from "node:os";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Reading } from "@playthrough/page";
import { Refused, type Did, type Send } from "@playthrough/review";
import { BEAT } from "./flows.ts";
import { copies, repo as copyAt, type Repo } from "./repo.ts";
import { readyIn } from "./following.ts";
import { getReady, keepUp } from "./take-over.ts";
import { video, type Filmed } from "./video.ts";

const PORT = 5790;
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

export async function open(here: Repo, id?: string) {
  const app = everyCopy(here);
  if (id) await (await app.holding(id)).reviews.get(id);
  // One for each app: open already, from this copy or another, it's that one.
  const already = await openAlready(app.folder);
  if (already) return console.log(`Playthrough is already open at http://localhost:${already}/${id ?? ""}`);
  const page = fileURLToPath(new URL("../viewer", import.meta.url));
  if (!(await readFile(join(page, "index.html")).catch(() => undefined)))
    throw new Refused(["The viewer isn't built yet. Build it from core with npm run build."]);
  const you = whoYouAre(here.root);

  const server = createServer((request, response) => {
    answer(app, page, you, request, response).catch((error) => {
      if (response.headersSent) return response.end();
      const problems = error instanceof Refused ? error.problems : [String(error?.message ?? error)];
      json(response, error instanceof Refused ? 400 : 500, { problems });
    });
  });
  const port = await listen(server, PORT);
  console.log(`Playthrough is open at http://localhost:${port}/${id ?? ""}`);
}

// The app in every copy of it, and where each review is kept: an agent working in a worktree keeps its own there.
function everyCopy(here: Repo) {
  const all = () => copies(here.root).map((root) => (root === here.root ? here : copyAt(root)));
  const found = new Map<string, Repo>();
  return {
    all,
    // The same from every copy: the main one's folder, as git lists it first.
    folder: all()[0]?.root ?? here.root,
    // Found once, a review stays where it was found; one in no copy is this one's to say isn't there.
    async holding(id: string): Promise<Repo> {
      if (!found.has(id)) for (const copy of all()) if ((await copy.reviews.list()).includes(id) && !found.has(id)) found.set(id, copy);
      return found.get(id) ?? here;
    },
  };
}

// The port of the viewer already open for this app, if one is: each says which app's it is.
async function openAlready(folder: string): Promise<number | undefined> {
  const ports = Array.from({ length: 21 }, (_, i) => PORT + i);
  const asked = (port: number) =>
    fetch(`http://127.0.0.1:${port}/api/app`, { signal: AbortSignal.timeout(1000) })
      .then((answer) => answer.json())
      .then((said: { folder?: string }) => (said.folder === folder ? port : undefined), () => undefined);
  return (await Promise.all(ports.map(asked))).find((port) => port !== undefined);
}

async function answer(app: ReturnType<typeof everyCopy>, page: string, you: string, request: IncomingMessage, response: ServerResponse) {
  const stranger = fromElsewhere(request);
  if (stranger) return json(response, 403, { problems: [stranger] });
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const [api, collection, id, ...rest] = path.split("/").filter(Boolean);
  if (api !== "api") return serve(page, path, response);

  if (request.method === "GET" && collection === "you") return json(response, 200, { name: you });
  if (request.method === "GET" && collection === "app") return json(response, 200, { folder: app.folder });
  if (collection !== "reviews") return json(response, 404, { problems: [`There's nothing at ${path}.`] });

  if (request.method === "GET" && !id) {
    // One that can't be read says why when it's opened, and leaves the rest to be listed; a name in two copies is the
    // first's, as its address opens.
    const read = async (copy: Repo) => Promise.all((await copy.reviews.list()).map((id) => copy.reviews.get(id).catch(() => undefined)));
    const every = (await Promise.all(app.all().map(read))).flat();
    const all = every.filter((review, i) => review && every.findIndex((first) => first?.id === review.id) === i).map((review) => review!);
    return json(response, 200, all.map(({ id, title, rounds, accepted }) => ({ id, title, rounds: rounds.filter((round) => round.finished && round.number > 0).length, accepted: !!accepted })));
  }
  if (!id) return json(response, 404, { problems: [`There's nothing at ${path}.`] });
  const repo = await app.holding(id);
  const reviews = repo.reviews;

  if (request.method === "GET" && rest[0] === "live") return live(repo, id, request, response);
  if (request.method === "GET" && rest[0] === "rounds" && rest[2] === "files" && rest[3]) {
    // Your branches play beside the round's recordings, as if they were its own.
    const name = rest.slice(3).join("/");
    const branch = name.match(/^(assets\/|readings\/)?branches\/(.+)$/);
    const bytes = branch ? await reviews.branch(id, `${branch[1] ?? ""}${branch[2]}`) : await reviews.file(id, Number(rest[1]), name);
    if (!bytes) return json(response, 404, { problems: [`Round ${rest[1]} of ${id} has no file called “${rest.slice(3).join("/")}”.`] });
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "max-age=31536000, immutable" });
    return response.end(bytes);
  }
  if (request.method === "POST" && rest[0] === "video") return saveVideo(repo, id, request, response);
  if (request.method === "POST" && rest[0] === "take-over") return takeOver(repo, id, request, response);
  if (request.method === "POST" && rest[0] === "follow") return followAlong(repo, id, request, response);
  if (request.method === "POST" && rest[0] === "ready-in") return readyInFor(repo, id, request, response);
  if (request.method === "POST" && rest[0] === "branches") return branch(repo, id, request, response);
  if (request.method === "POST" && rest[0] === "sends") {
    await reviews.send(id, await body<Send>(request));
    return json(response, 200, {});
  }
  if (request.method === "POST" && rest[0] === "accept") {
    const { by } = await body<{ by: string }>(request);
    await reviews.accept(id, by);
    return json(response, 200, {});
  }
  return json(response, 404, { problems: [`There's nothing at ${path}.`] });
}

// The review now, then again each time what's kept changes it, until the viewer goes away.
async function live(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse) {
  await repo.reviews.get(id);
  response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
  const gone = new AbortController();
  request.on("close", () => gone.abort());
  let last = "";
  while (!gone.signal.aborted) {
    const review = await repo.reviews.wait(id, (review) => JSON.stringify(review) !== last, gone.signal).catch(() => undefined);
    if (!review) break;
    last = JSON.stringify(review);
    response.write(`data: ${last}\n\n`);
  }
  response.end();
}

// A moment of a flow made ready to take over: the viewer asks while the playhead rests on it, and shows the app there,
// through Playthrough, at the port and moment this answers with.
async function takeOver(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse) {
  const { flow, step, actions, did, ahead } = await body<{ flow: string; step?: string; actions?: number; did?: Did[]; ahead?: boolean }>(request);
  const { port, moment } = await getReady(repo, id, flow, { step, actions, did, ahead });
  json(response, 200, { port, moment });
}

// What a person did in the app, taken over, kept as a recording of its own: the flow as it was recorded up to where they
// took it over, then theirs, going on from there. It plays like any flow, with what the flow's recording kept of the
// app's files, and a note on it is on what they saw. Each time it's kept, it's kept whole, under a new name, as what
// the viewer has fetched once it keeps.
async function branch(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse) {
  const { round, flow: name, at, events, recording } = await body<{ round: number; flow: string; at: number; events: Event[]; recording: string }>(request);
  const flow = (await repo.reviews.get(id)).rounds.find((kept) => kept.number === round)?.flows.find((flow) => flow.name === name);
  const was = flow && (await repo.reviews.file(id, round, flow.recording));
  if (!flow || !was || !events.length) return json(response, 404, { problems: [`Round ${round} of ${id} has no recording of “${name}” to branch off.`] });
  const before: Event[] = JSON.parse(Buffer.from(was).toString("utf8"));
  const start = before[0]!.timestamp;
  const then = start + at * 1000;
  const shift = then + 1 - events[0]!.timestamp;
  const yours = paced(events).map((event) => ({ ...event, timestamp: event.timestamp + shift }));
  const joined = [...before.filter((event) => event.timestamp <= then), ...yours.filter((event) => !readingOf(event))];
  await repo.reviews.saveBranch(id, recording, Buffer.from(JSON.stringify(joined)));
  // As the app read itself while you were in it. Only yours: the page there is recorded afresh, its elements numbered
  // anew, so the flow's readings from before would name the wrong things.
  const readings = yours.filter(readingOf).map((event) => ({ step: "In the app", at: (event.timestamp - start) / 1000, ...readingOf(event)! }));
  await repo.reviews.saveBranch(id, `readings/${recording}`, Buffer.from(JSON.stringify(readings)));
  const kept = await repo.reviews.file(id, round, `assets/${flow.recording}`);
  if (kept) await repo.reviews.saveBranch(id, `assets/${recording}`, kept);
  json(response, 200, { length: (joined.at(-1)!.timestamp - start) / 1000 });
}

type Event = { timestamp: number; type?: number; data?: { tag?: string; payload?: Pick<Reading, "screen" | "things"> } };
// Watched later, yours keeps its pace while you act, but a while spent looking, when nothing happened, goes by in a
// flow's pause.
function paced(events: Event[]): Event[] {
  let cut = 0;
  return events.map((event, i) => {
    cut += Math.max(0, event.timestamp - (events[i - 1]?.timestamp ?? event.timestamp) - BEAT);
    return { ...event, timestamp: event.timestamp - cut };
  });
}
const readingOf = (event: Event) => (event.type === 5 && event.data?.tag === "reading" ? event.data.payload : undefined);

// A flow as a video, alone or beside the round Compare shows, at the size of the largest screen it's recorded on.
async function saveVideo(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse) {
  const filmed = await body<Filmed>(request);
  const rounds = (await repo.reviews.get(id)).rounds.filter((round) => round.number === filmed.round || round.number === filmed.beside);
  const screens: { width: number; height: number }[] = [];
  for (const round of rounds) {
    const flow = round.flows.find((flow) => flow.name === filmed.flow);
    const kept = flow && (await repo.reviews.file(id, round.number, flow.recording));
    if (kept) for (const event of JSON.parse(Buffer.from(kept).toString("utf8")) as { type: number; data: { width?: number; height?: number } }[]) if (event.type === 4) screens.push(event.data as { width: number; height: number });
  }
  if (!screens.length) return json(response, 404, { problems: [`Round ${filmed.round} of ${id} has no recording of “${filmed.flow}”.`] });
  const shape = { width: Math.max(...screens.map((screen) => screen.width)), height: Math.max(...screens.map((screen) => screen.height)) };
  // A line at a time while it's made: how long it has left, then the video, or what went wrong.
  response.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store" });
  const say = (line: { left: number } | { video: string } | { problems: string[] }) => response.write(`${JSON.stringify(line)}\n`);
  try {
    say({ video: Buffer.from(await video(request.socket.localPort!, id, filmed, shape, (left) => say({ left: Math.round(left * 10) / 10 }))).toString("base64") });
  } catch (error) {
    say({ problems: [`The video couldn't be made: ${(error as Error).message.split("\n")[0]}`] });
  }
  response.end();
}

// How long until a moment asked for is ready, for the viewer to count down to, if it can be known.
async function readyInFor(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse) {
  const { flow, step, actions } = await body<{ flow: string; step?: string; actions?: number }>(request);
  json(response, 200, { in: await readyIn(repo, id, { flow, step, actions }) });
}

// Where the playhead has got to while the latest round plays, for the flow run alongside it.
async function followAlong(repo: Repo, id: string, request: IncomingMessage, response: ServerResponse) {
  const { flow, step, actions } = await body<{ flow: string; step?: string; actions?: number }>(request);
  await keepUp(repo, id, flow, step, actions);
  json(response, 200, {});
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

// Locally, whoever runs the viewer is the one sending: by the name git knows them by, or their name on this machine.
function whoYouAre(root: string): string {
  try {
    return execFileSync("git", ["config", "user.name"], { cwd: root, encoding: "utf8" }).trim() || userInfo().username;
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
