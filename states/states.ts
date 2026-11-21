// npm run states [-- <app folder> [change]]: the real player in a chosen state, on a throwaway copy of an app with a kept change,
// made fresh at every load. One address: a quiet strip of the states over the player, in a frame. Behind it, the copy,
// a real `playthrough open` from this checkout on a home and port of its own, the viewer's dev server, so edits to the
// player show at once, and a pretend agent. Ctrl+C stops it all and throws the copy away.

import { fork } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttp, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Changes, latestOf } from "@playthrough/change";
import { folder } from "@playthrough/change/folder";
import { build, createServer as createVite, type Plugin } from "vite";
import type { Listed } from "../packages/cli/src/open.ts";
import { repo as copyAt } from "../packages/cli/src/repo.ts";
import { pretendAgent } from "./agent.ts";
import { asItWas } from "./as-it-was.ts";
import { copyApp, freshChange } from "./copy.ts";
import { states, type State } from "./list.ts";

const core = fileURLToPath(new URL("..", import.meta.url));
const viewer = join(core, "packages", "viewer");
// The app the states run on, example/ or the folder given, and the kept change in it, the one named or else the one with
// the most versions.
const app = resolve(process.argv[2] ?? join(core, "example"));
const named = process.argv[3];
// The strip's port, then the player's, Playthrough's page, the app's and where it's taken over, each the next.
const port = Number(process.env.STATES_PORT) || 5800;
const [playerPort, openPort, appPort, takeOverPort] = [port + 1, port + 2, port + 3, port + 4];

// Where it really is, as the commands see it from inside, so the copy is known once.
const place = join(realpathSync(tmpdir()), `playthrough-states-${port}`);
const home = join(place, "home");
const copy = join(place, basename(app));
const keptFolder = join(place, "kept");

// The kept change is read from a copy of its own, as reading it can bring it to this Playthrough's format.
await rm(place, { recursive: true, force: true });
const keptIds: string[] = await new Changes(folder(join(app, ".playthrough"))).list().catch(() => []);
const counted = await Promise.all(keptIds.map(async (id) => ({ id, versions: (await new Changes(folder(join(app, ".playthrough"))).get(id).catch(() => undefined))?.handBacks.length ?? 0 })));
const id = named ?? counted.sort((a, b) => b.versions - a.versions)[0]?.id;
if (!id || !keptIds.includes(id)) {
  const which = keptIds.length ? ` The changes kept there: ${keptIds.join(", ")}.` : "";
  console.error(`${id ? `There's no change “${id}” kept in ${app}.` : `There's no kept change in ${join(app, ".playthrough")}. Give an app folder with one: npm run states -- <app folder>.`}${which}`);
  process.exit(1);
}
await cp(join(app, ".playthrough", id), join(keptFolder, id), { recursive: true });
const kept = { change: await new Changes(folder(keptFolder)).get(id), folder: join(keptFolder, id) };
if (!latestOf(kept.change)) {
  console.error(`The change “${id}” in ${app} has no version handed back yet.`);
  process.exit(1);
}

await copyApp(app, copy, appPort);
await mkdir(home, { recursive: true });
await writeFile(join(home, "apps.json"), JSON.stringify([copy]));
const repo = copyAt(copy);

// Playthrough's page serves what's built; the player itself comes from the dev server.
if (!(await readFile(join(core, "packages", "cli", "viewer", "index.html")).catch(() => undefined))) {
  console.log("Building the viewer once, for Playthrough's page…");
  await build({ root: viewer, configFile: join(viewer, "vite.config.ts"), logLevel: "warn" });
}
const open = fork(join(core, "packages", "cli", "src", "playthrough.ts"), ["open"], {
  env: { ...process.env, PLAYTHROUGH_HOME: home, PLAYTHROUGH_PORT: String(openPort), PLAYTHROUGH_TAKE_OVER_PORT: String(takeOverPort) },
  cwd: copy,
  stdio: ["ignore", "ignore", "inherit", "ipc"],
});
await new Promise((ready, failed) => (open.once("message", ready), open.once("exit", () => failed(new Error("Playthrough's page ended before it was open.")))));
const opened: number = JSON.parse(await readFile(join(home, "open.json"), "utf8")).port;
if (opened !== openPort) console.error(`Playthrough's page is on ${opened}: ${openPort} was taken.`);
const you: string = (await (await fetch(`http://localhost:${opened}/api/you`)).json()).name;

// Arriving: the copy made fresh as the state says, what the player kept in the browser cleared, then the player. The
// state's own change, and any it has beside it, each made from the kept one as its state makes it, under an id and a
// title of their own, each with an agent of its own.
let stopAgents = new AbortController();
let agents: ReturnType<typeof pretendAgent>[] = [];
let sending = true;
let inTurn = Promise.resolve();
async function arrive(state: State): Promise<{ kept: Record<string, string>; address: string }> {
  stopAgents.abort();
  stopAgents = new AbortController();
  const now = new Date();
  const made = [state, ...(state.beside ?? []).map((name) => states.find((one) => one.name === name)!)].map((one, i) => {
    const { change, unsent, madeFrom } = asItWas(kept.change, one, you, now);
    return { id: i ? `${id}-${i + 1}` : id!, state: one, unsent, madeFrom, change: change && { ...change, title: i ? `${change.title} (${i + 1})` : change.title } };
  });
  const changes = join(copy, ".playthrough");
  for (const name of await readdir(changes)) if (existsSync(join(changes, name, "change.json")) && !made.some((one) => one.id === name)) await freshChange(kept.folder, changes, name, undefined);
  for (const one of made) await freshChange(kept.folder, changes, one.id, one.change, one.madeFrom);
  agents = made.filter((one) => one.change).map((one) => pretendAgent(repo, one.id, kept, one.state, stopAgents.signal));
  sending = !state.sendFails;
  await seenByPlaythrough();
  const address = (one: string) => `${basename(copy)}/${one}`;
  return {
    kept: Object.fromEntries(made.filter((one) => one.unsent.length).map((one) => [`playthrough:moments:${address(one.id)}`, JSON.stringify(one.unsent)])),
    address: state.opens === "first moment" ? `/moments/${address(id!)}/1` : "/",
  };
}

// Playthrough's page tells a player that comes the list it last told anyone, until it has looked again; one arriving
// straight after the copy is made afresh would be told the state before. So the player comes only once Playthrough
// says the changes as they are now, or after a few seconds whatever it says.
async function seenByPlaythrough() {
  const changes = `http://localhost:${opened}/api/changes`;
  const now = async () => JSON.stringify(((await (await fetch(changes)).json()) as Listed[]).map((one) => one.change));
  const fresh = await now();
  const told = await fetch(`${changes}?live`, { signal: AbortSignal.timeout(3000) }).catch(() => undefined);
  try {
    let said = "";
    for await (const bytes of told?.body ?? []) {
      said += new TextDecoder().decode(bytes);
      const lines = said.split("\n\n");
      said = lines.pop()!;
      if (lines.some((line) => JSON.stringify((JSON.parse(line.replace(/^data: /, "")) as Listed[]).map((one) => one.change)) === fresh)) return;
    }
  } catch {
    // waited long enough
  } finally {
    told?.body?.cancel().catch(() => {});
  }
}

// On the player's own address, so what it keeps in the browser is what's cleared: /states/<name>. Opened by itself,
// it's a state without the strip. Where the state says sending fails, a send never reaches Playthrough, as when it has
// stopped.
const arriving: Plugin = {
  name: "states",
  configureServer: (server) =>
    void server.middlewares.use((request, response, next) => {
      if (!sending && request.method === "POST" && /^\/api\/changes\/.+\/sends$/.test(request.url ?? "")) return void request.socket.destroy();
      const name = request.url?.match(/^\/states\/([\w-]+)$/)?.[1];
      if (!name) return next();
      const state = states.find((one) => one.name === name);
      if (!state) return page(response, 404, `<p>There's no state “${name}”. The states: ${states.map((one) => one.name).join(", ")}.</p>`);
      inTurn = inTurn.then(() =>
        arrive(state).then(
          ({ kept, address }) =>
            page(response, 200, `<script>try { localStorage.clear(); sessionStorage.clear(); for (const [key, value] of Object.entries(${JSON.stringify(kept)})) localStorage.setItem(key, value) } catch {} location.replace(${JSON.stringify(address)})</script>`),
          (error) => page(response, 500, `<p>The state couldn't be made: ${String(error.message).replace(/</g, "&lt;")}</p>`),
        ),
      );
    }),
};
const player = await createVite({
  root: viewer,
  configFile: join(viewer, "vite.config.ts"),
  plugins: [arriving],
  server: { port: playerPort, strictPort: true, proxy: { "/api": { target: `http://localhost:${opened}` } } },
  logLevel: "warn",
  clearScreen: false,
});
await player.listen();

// Read at each load, as the player is, so a change to it shows on the next.
const strip = async () => (await readFile(join(core, "states", "strip.html"), "utf8")).replace(
  "/* the states */",
  `const states = ${JSON.stringify(states.map(({ name, title, says, group }) => ({ name, title, says, group })))}; const player = "http://localhost:${playerPort}";`,
);
// The strip, and Hand back now: asked whether there's a version left to, and pressed.
const versions = kept.change.handBacks.filter((one) => one.finished).length;
const server = createHttp(async (request, response) => {
  if (request.url === "/") return page(response, 200, await strip());
  if (request.url !== "/hand-back") return page(response, 404, "");
  const agent = agents[0];
  if (request.method === "POST") await agent?.handBackNow().catch((error) => console.error(`Hand back now didn't: ${error.message}`));
  const left = !!agent && (await agent.left().catch(() => false));
  response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(left ? { left } : { left, why: agent ? `Every kept version is handed back: the kept change has ${versions === 1 ? "one" : versions}.` : "There's no change here to hand back." }));
});
await new Promise<void>((listening) => server.listen(port, "127.0.0.1", listening));
console.log(`The states of “${kept.change.title}” (${id}, ${versions === 1 ? "one version" : `${versions} versions`}${named ? "" : counted.length > 1 ? `; the one with the most of the ${counted.length} kept, or name another after the folder` : ""}), on a copy of ${app}:\n\n  http://localhost:${port}\n\nEach load starts the state afresh. Ctrl+C stops it all.`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  stopAgents.abort();
  server.close();
  await player.close();
  if (open.exitCode === null) {
    open.kill("SIGINT");
    await new Promise((ended) => open.once("exit", ended));
  }
  await rm(place, { recursive: true, force: true });
  process.exit();
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, stop);

function page(response: ServerResponse, status: number, html: string) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(html);
}
