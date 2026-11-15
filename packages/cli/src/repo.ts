// Where Playthrough keeps things in the app's repo: each change in .playthrough/, out of git, with its moments' ways there,
// and how to start the app in playthrough/app.json, which is committed so every change uses it. Each of git's worktrees
// is a copy of the app with changes of its own, beside the work they're about.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { Refused, Changes } from "@playthrough/change";
import { folder } from "@playthrough/change/folder";

// And whether its moments run one at a time: on an app with a page that shows what every run made, as a blog's index lists
// every post, moments run side by side would see each other's. Where app.json lets Playthrough give the app a port, the
// port it gave this copy, and start and url say it.
export type App = { start: string; url: string; oneAtATime?: boolean; port?: number };
export type Repo = ReturnType<typeof repo>;

export function repo(root = home(process.cwd())) {
  const changes = join(root, ".playthrough");
  const appFile = join(root, "playthrough", "app.json");
  return {
    root,
    changes: new Changes(folder(changes)),
    moments: (change: string) => join(changes, change, "moments"),
    handBack: (change: string, handBack: number) => join(changes, change, "hand-backs", String(handBack), "hand-back.json"),
    // A file for each agent waiting for what's sent, named by its process.
    waiting: (change: string) => join(changes, change, "waiting"),
    // How to start the app, committed.
    appFile,
    // What every moment of the app starts from, committed beside app.json.
    setup: join(root, "playthrough", "setup.ts"),
    // What setup made for each run, until its after gives it back.
    borrowed: join(changes, "borrowed"),
    // As a person at this folder would type it.
    show: (path: string) => relative(process.cwd(), path) || ".",

    // Git never sees .playthrough/: what's kept there is Playthrough's, never the app's. An agent told to pick up the
    // person's notes "in Playthrough" looks here, and on 15 Nov one read a note's file and did it with nobody told: the
    // folder says how to get them.
    async keepOutOfGit() {
      await mkdir(changes, { recursive: true });
      await writeFile(join(changes, ".gitignore"), "*\n");
      await writeFile(join(changes, "README.md"), KEPT_HERE);
    },

    async app(): Promise<App> {
      const how = `Say how to start the app in playthrough/app.json: ${PORTED}, or with the address it always has where it can't be given a port.`;
      const text = await readFile(appFile, "utf8").catch(() => undefined);
      if (text === undefined) throw new Refused([`Playthrough needs to start the app. ${how}`]);
      let app: Partial<App>;
      try {
        app = JSON.parse(text);
      } catch (error) {
        throw new Refused([`playthrough/app.json isn't JSON: ${(error as Error).message}. ${how}`]);
      }
      if (!app || typeof app !== "object" || !isText(app.start) || !isText(app.url)) throw new Refused([`playthrough/app.json needs both “start” and “url”. ${how}`]);
      const saying = [app.start, app.url].filter((said) => said.includes("{port}")).length;
      if (saying === 1) throw new Refused([`playthrough/app.json says {port} in only one of “start” and “url”. Say it in both, so the app is started on the port Playthrough gives it and found there: ${PORTED}.`]);
      // One port for each copy, so every command run there finds the app at the same address.
      const port = saying ? await portFor(root) : undefined;
      const given = (said: string) => (port === undefined ? said : said.replaceAll("{port}", String(port)));
      const url = given(app.url);
      // Otherwise it's started, and waited for, for three minutes, at an address nothing can answer at.
      if (!/^https?:$/.test(URL.parse(url)?.protocol ?? ""))
        throw new Refused([`playthrough/app.json's “url” is a whole address, as a browser takes it, like http://localhost:{port}, not “${app.url}”.`]);
      if (app.oneAtATime !== undefined && typeof app.oneAtATime !== "boolean") throw new Refused([`playthrough/app.json's “oneAtATime” is true or false: true runs each moment by itself.`]);
      return { start: given(app.start), url, ...(app.oneAtATime && { oneAtATime: true }), ...(port !== undefined && { port }) };
    },
  };
}

// The app's folder: the nearest one up from here that Playthrough is in, as far as the top of the git repo, so a command
// run from inside the app finds its changes. Where it isn't yet, it's here.
function home(here: string): string {
  for (let folder = here; ; folder = dirname(folder)) {
    if (existsSync(join(folder, ".playthrough")) || existsSync(join(folder, "playthrough", "app.json"))) return folder;
    if (existsSync(join(folder, ".git")) || dirname(folder) === folder) return here;
  }
}

// How app.json gives the app a port, so every copy of it runs on its own: in a worktree beside your own, or several at once.
export const PORTED = `{ "start": "npm run dev -- --port {port}", "url": "http://localhost:{port}" }`;

export const KEPT_HERE = `# Playthrough's own

The person's changes, moments and notes, kept for their page. Don't read or change these files: run npx playthrough,
which says what's waiting, and playthrough wait gets the person's notes.
`;

const ports = new Map<string, Promise<number>>();
const portFor = (root: string) => ports.get(root) ?? ports.set(root, keptPort(root)).get(root)!;

// A copy's port, kept in its .playthrough folder: the browser playthrough as keeps open runs the app there, and a moment
// marked meanwhile runs its way there on that same app, as a dev server like Next's won't start twice in one folder.
async function keptPort(root: string): Promise<number> {
  const file = join(root, ".playthrough", "port.json");
  const kept: unknown = await readFile(file, "utf8").then((text) => JSON.parse(text).port, () => undefined);
  if (Number.isInteger(kept) && (kept as number) > 0) return kept as number;
  const port = await free();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(join(dirname(file), ".gitignore"), "*\n");
  await writeFile(file, `${JSON.stringify({ port })}\n`);
  return port;
}

// One nothing is using now, as the machine hands them out.
const free = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });

// The app's folder in each of the repo's worktrees that has it, as git lists them, the main one first; outside git, just
// this one. An agent working in a worktree keeps its changes there, and from any copy the person finds them all.
export function copies(root: string): string[] {
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const inside = relative(git("rev-parse", "--show-toplevel"), root);
    const worktrees = git("worktree", "list", "--porcelain").split("\n").filter((line) => line.startsWith("worktree ")).map((line) => line.slice("worktree ".length));
    return worktrees.map((worktree) => resolve(worktree, inside)).filter((folder) => existsSync(folder));
  } catch {
    return [resolve(root)];
  }
}

// A worktree beside the main one, where whatever answers at the app's address can be another copy of it, or yours.
export const inWorktree = (root: string) => copies(root)[0] !== resolve(root);

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
