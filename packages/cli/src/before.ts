// The app as it was before the change, for the agent: a kept moment is run there once more, and where it ends the same
// as it does now, the moment doesn't show what was changed. On 16 Nov's testing that fact made agents look again where
// advice didn't, and put back what they had taken away; "different" was read as proof the moment worked, so only the
// same is said. Anything less than sure says nothing: a false "the same" would send an agent to undo good work.
//
// The code as it was is where this branch left origin's default one, exported beside the change's files with what git
// ignores brought over from the working folder, and started as playthrough/app.json says, on a port of its own. It's
// the agent's alone: the person never sees it, and nothing runs for it until a moment is kept.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { link, mkdir, readdir, readlink, symlink } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { chromium } from "@playwright/test";
import { running, runningIn, stopUnused, using } from "./app.ts";
import { compare, unsteadyIn, type Recorded } from "./compare.ts";
import { repo, type Repo } from "./repo.ts";
import { glimpsesOf, readingsOf } from "./reporter.ts";
import { recorder, runOnce, type Ran } from "./run.ts";
import { fileOf, wayFile } from "./way.ts";

const THE_SAME = "The same as before your change: this moment doesn't show what you changed.";

// A moment waits this long at most for the app as it was to answer, its export and start included; past it, it says
// nothing, and the app goes on starting for the next one.
export const READY = 60_000;

// The kept moment's way, run on the app as it was, ending as it ends now: the line to say, or nothing.
export async function sameAsBefore(here: Repo, id: string, way: Parameters<typeof wayFile>[0], now: Ran["recorded"][number], started: string): Promise<string | undefined> {
  const until = Date.now() + READY;
  const base = codeBefore(here.root);
  if (!base) return;
  const folder = join(here.root, ".playthrough", id, "before");
  let done = () => {};
  try {
    const root = await exported(here.root, base);
    const app = await repo(root).app();
    // Without a port of its own, it would answer where the app as it is now does.
    if (app.port === undefined) return;
    done = using(root);
    process.once("exit", done);
    await running(app, root, { waiting: AbortSignal.timeout(Math.max(0, until - Date.now())), quietly: true });
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "package.json"), `{ "type": "module" }\n`);
    writeFileSync(join(folder, fileOf(way.words)), wayFile(way));
    const [then] = (await runOnce({ moments: folder, only: [way.words], app, root: here.root, recorder, started }, { quietly: true })).recorded;
    if (!then) return;
    const browser = await chromium.launch();
    try {
      const { findings } = await compare(await browser.newPage(), asRecorded(0, then), asRecorded(1, now), unsteadyIn([now.moment]));
      return findings.length ? undefined : THE_SAME;
    } finally {
      await browser.close();
    }
  } catch {
    return;
  } finally {
    rmSync(folder, { recursive: true, force: true });
    done();
  }
}

const asRecorded = (number: number, { moment, files }: Ran["recorded"][number]): Recorded => {
  const file = async (name: string) => files.find((one) => one.name === name)!.bytes;
  return {
    number,
    moments: [moment],
    readings: async (one) => JSON.parse((await file(readingsOf(one))).toString()),
    glimpses: async (one) => JSON.parse(files.find((kept) => kept.name === glimpsesOf(one))?.bytes.toString() ?? "[]"),
    picture: file,
  };
};

// The code as it was: where this branch left origin's default one, as git's merge-base finds it, so work committed
// before Playthrough first ran is still the change's. Nothing without an origin that names its default branch, or
// where the code now is that code: there'd be nothing to tell apart.
export function codeBefore(root: string): string | undefined {
  try {
    const base = git(root, "merge-base", "HEAD", "origin/HEAD");
    const same = spawnSync("git", ["diff", "--quiet", base], { cwd: root, stdio: "ignore" }).status === 0;
    const added = git(root, "ls-files", "--others", "--exclude-standard", ":/");
    return same && !added ? undefined : base;
  } catch {
    return undefined;
  }
}

// The app's folder in the code as it was: git's own export of it, made once for each base, in this copy's .playthrough
// folder, out of git's worktrees and the person's sight. What git ignores comes over from the working folder: each file
// copied, as .env is, and each node_modules linked file by file, its links kept as they read, so a package of the app's
// own resolves to its code as it was; any other ignored folder is what the app builds, and it builds it again. Another
// base's export is removed once its app isn't running.
export async function exported(root: string, base: string): Promise<string> {
  const top = git(root, "rev-parse", "--show-toplevel");
  const inside = relative(top, root);
  const exports = join(root, ".playthrough", "before");
  const folder = join(exports, base);
  for (const other of existsSync(exports) ? readdirSync(exports) : [])
    if (other !== base && !runningIn(join(exports, other, inside))) rmSync(join(exports, other), { recursive: true, force: true });
  if (!existsSync(folder)) await exportTo(folder, top, base);
  // Started as Playthrough starts the app now, whatever the code then said.
  mkdirSync(join(folder, inside, "playthrough"), { recursive: true });
  cpSync(repo(root).appFile, join(folder, inside, "playthrough", "app.json"));
  return join(folder, inside);
}

async function exportTo(folder: string, top: string, base: string) {
  // Made aside and put in place whole, so one half-made is never taken for done.
  const making = `${folder}.${process.pid}`;
  rmSync(making, { recursive: true, force: true });
  mkdirSync(making, { recursive: true });
  execFileSync("tar", ["-x", "-C", making], { input: execFileSync("git", ["archive", base], { cwd: top, maxBuffer: 1 << 30 }), maxBuffer: 1 << 30 });
  const ignored = git(top, "ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory").split("\0").filter(Boolean);
  for (const path of ignored) {
    if (path.split("/").includes(".playthrough")) continue;
    if (!path.endsWith("/")) cpSync(join(top, path), join(making, path));
    else if (basename(path) === "node_modules") await linked(join(top, path), join(making, path));
  }
  try {
    renameSync(making, folder);
  } catch {
    rmSync(making, { recursive: true, force: true });
  }
}

async function linked(from: string, to: string) {
  await mkdir(to, { recursive: true });
  await Promise.all(
    (await readdir(from, { withFileTypes: true })).map(async (entry) => {
      const [one, other] = [join(from, entry.name), join(to, entry.name)];
      if (entry.isSymbolicLink()) await symlink(await readlink(one), other);
      else if (entry.isDirectory()) await linked(one, other);
      else await link(one, other);
    }),
  );
}

// Each export's app in this copy, for whoever stops apps nobody uses.
export function exportsOf(root: string): string[] {
  const exports = join(root, ".playthrough", "before");
  if (!existsSync(exports)) return [];
  try {
    const inside = relative(git(root, "rev-parse", "--show-toplevel"), root);
    return readdirSync(exports).map((base) => join(exports, base, inside));
  } catch {
    return [];
  }
}

// Handed back, the app as it was stops, unless a moment is being kept there now.
export const stopBefore = (root: string) => exportsOf(root).forEach((app) => stopUnused(app, 0));

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 }).trim();
