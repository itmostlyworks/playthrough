// npm run states [-- <app folder>]: the real player in a chosen state, on a throwaway copy of an app with a kept change,
// made fresh at every load. One address: a quiet strip of the states over the player, in a frame. Behind it, the copy,
// a real `playthrough open` from this checkout on a home and port of its own, the viewer's dev server, so edits to the
// player show at once, and a pretend agent. Ctrl+C stops it all and throws the copy away.

import { fork } from "node:child_process";
import { realpathSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttp, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Changes, latestOf } from "@playthrough/change";
import { folder } from "@playthrough/change/folder";
import { build, createServer as createVite, type Plugin } from "vite";
import { repo as copyAt } from "../packages/cli/src/repo.ts";
import { pretendAgent } from "./agent.ts";
import { asItWas } from "./as-it-was.ts";
import { copyApp, freshChange } from "./copy.ts";
import { states, type State } from "./list.ts";

const core = fileURLToPath(new URL("..", import.meta.url));
const viewer = join(core, "packages", "viewer");
// The app the states run on: example/, or the folder given.
const app = resolve(process.argv[2] ?? join(core, "example"));
// The strip's port, then the player's, Playthrough's page, the app's and where it's taken over, each the next.
const port = Number(process.env.STATES_PORT) || 5800;
const [playerPort, openPort, appPort, takeOverPort] = [port + 1, port + 2, port + 3, port + 4];

// Where it really is, as the commands see it from inside, so the copy is known once.
const place = join(realpathSync(tmpdir()), `playthrough-states-${port}`);
const home = join(place, "home");
const copy = join(place, basename(app));
const keptFolder = join(place, "kept");

// The kept change: the one with the most versions, read from a copy of its own, as reading it can bring it to this
// Playthrough's format.
await rm(place, { recursive: true, force: true });
const keptIds = await new Changes(folder(join(app, ".playthrough"))).list().catch(() => []);
const counted = await Promise.all(keptIds.map(async (id) => ({ id, versions: (await new Changes(folder(join(app, ".playthrough"))).get(id).catch(() => undefined))?.handBacks.length ?? 0 })));
const id = counted.sort((a, b) => b.versions - a.versions)[0]?.id;
if (!id) {
  console.error(`There's no kept change in ${join(app, ".playthrough")}. Give an app folder with one: npm run states -- <app folder>.`);
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

// Arriving: the copy made fresh as the state says, what the player kept in the browser cleared, then the player.
let agent = new AbortController();
let inTurn = Promise.resolve();
async function arrive(state: State): Promise<{ kept: Record<string, string>; address: string }> {
  agent.abort();
  agent = new AbortController();
  const made = asItWas(kept.change, state, you, new Date());
  await freshChange(kept.folder, join(copy, ".playthrough"), id!, made.change, made.madeFrom, state.sendFails);
  const address = `${basename(copy)}/${id}`;
  if (made.change) void pretendAgent(repo, id!, kept, state, agent.signal);
  return {
    kept: made.unsent.length ? { [`playthrough:moments:${address}`]: JSON.stringify(made.unsent) } : {},
    address: state.opens === "first moment" ? `/moments/${address}/1` : "/",
  };
}

// On the player's own address, so what it keeps in the browser is what's cleared: /states/<name>. Opened by itself,
// it's a state without the strip.
const arriving: Plugin = {
  name: "states",
  configureServer: (server) =>
    void server.middlewares.use((request, response, next) => {
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

const strip = (await readFile(join(core, "states", "strip.html"), "utf8")).replace(
  "/* the states */",
  `const states = ${JSON.stringify(states.map(({ name, title, says }) => ({ name, title, says })))}; const player = "http://localhost:${playerPort}";`,
);
const server = createHttp((request, response) => (request.url === "/" ? page(response, 200, strip) : page(response, 404, "")));
await new Promise<void>((listening) => server.listen(port, "127.0.0.1", listening));
console.log(`The states of “${kept.change.title}”, on a copy of ${app}:\n\n  http://localhost:${port}\n\nEach load starts the state afresh. Ctrl+C stops it all.`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  agent.abort();
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
