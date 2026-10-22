// Opens the viewer on this machine: its page, and the reviews in .vantage/ for it to read and send to. Each review the
// viewer shows streams to it as it's kept, so a new round or a send from elsewhere arrives without asking.

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { userInfo } from "node:os";
import { dirname, extname, join, normalize, sep } from "node:path";
import { Refused, type Send } from "@vantage/review";
import type { Repo } from "./repo.ts";

const PORT = 5790;
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

export async function open(repo: Repo, id?: string) {
  if (id) await repo.reviews.get(id);
  const page = join(dirname(createRequire(import.meta.url).resolve("@vantage/viewer/package.json")), "dist");
  if (!(await readFile(join(page, "index.html")).catch(() => undefined)))
    throw new Refused(["The viewer isn't built yet. Build it from core with npm run build."]);
  const you = whoYouAre(repo.root);

  const server = createServer((request, response) => {
    answer(repo, page, you, request, response).catch((error) => {
      if (response.headersSent) return response.end();
      const problems = error instanceof Refused ? error.problems : [String(error?.message ?? error)];
      json(response, error instanceof Refused ? 400 : 500, { problems });
    });
  });
  const port = await listen(server, PORT);
  console.log(`Vantage is open at http://localhost:${port}/${id ?? ""}`);
}

async function answer(repo: Repo, page: string, you: string, request: IncomingMessage, response: ServerResponse) {
  const reviews = repo.reviews;
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const [api, collection, id, ...rest] = path.split("/").filter(Boolean);
  if (api !== "api") return serve(page, path, response);

  if (request.method === "GET" && collection === "you") return json(response, 200, { name: you });
  if (collection !== "reviews") return json(response, 404, { problems: [`There's nothing at ${path}.`] });

  if (request.method === "GET" && !id) {
    const all = await Promise.all((await reviews.list()).map((id) => reviews.get(id)));
    return json(response, 200, all.map(({ id, title, rounds, accepted }) => ({ id, title, rounds: rounds.filter((round) => round.finished).length, accepted: !!accepted })));
  }
  if (!id) return json(response, 404, { problems: [`There's nothing at ${path}.`] });

  if (request.method === "GET" && rest[0] === "live") return live(repo, id, request, response);
  if (request.method === "GET" && rest[0] === "rounds" && rest[2] === "files" && rest[3]) {
    const bytes = await reviews.file(id, Number(rest[1]), rest.slice(3).join("/"));
    if (!bytes) return json(response, 404, { problems: [`Round ${rest[1]} of ${id} has no file called “${rest.slice(3).join("/")}”.`] });
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "max-age=31536000, immutable" });
    return response.end(bytes);
  }
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

// The usual port, or the next free one when something else has it.
function listen(server: ReturnType<typeof createServer>, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" && port < PORT + 20) resolve(listen(server, port + 1));
      else reject(error);
    });
    server.listen(port, "127.0.0.1", () => resolve(port));
  });
}
