// The copy a state runs on: the app, and in its .playthrough/ the change as the state starts it, made beside the one
// there and put in its place in one move, so the page never reads half of one.

import { chmod, copyFile, cp, mkdir, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { FORMAT, type Change, type Comparison, type HandBack } from "@playthrough/change";
import { KEPT_HERE } from "../packages/cli/src/repo.ts";
import type { MadeFrom } from "./as-it-was.ts";

// The app as it is, but for what Playthrough keeps beside it and git's own; its packages, which can be large, linked.
export async function copyApp(app: string, into: string, port: number) {
  await cp(app, into, { recursive: true, filter: (from) => !/(^|\/)(\.playthrough|\.git|node_modules)$/.test(from.slice(app.length)) });
  for (const name of await readdir(app)) if (name === "node_modules") await symlink(join(app, name), join(into, name));
  const kept = join(into, ".playthrough");
  await mkdir(kept, { recursive: true });
  await writeFile(join(kept, ".gitignore"), "*\n");
  await writeFile(join(kept, "README.md"), KEPT_HERE);
  // Where the app is given a port, the one set aside for it.
  await writeFile(join(kept, "port.json"), `${JSON.stringify({ port })}\n`);
}

// The change in the copy's .playthrough/ made fresh: as `change` says, its files the kept ones; none at all without one.
// `sendFails` leaves its sends' folder unwritable.
export async function freshChange(kept: string, into: string, id: string, change: Change | undefined, madeFrom: MadeFrom[], sendFails = false) {
  const [folder, making, gone] = [join(into, id), join(into, `.${id}.making`), join(into, `.${id}.gone`)];
  await rm(making, { recursive: true, force: true });
  if (change) {
    await json(join(making, "change.json"), { format: FORMAT, id, title: change.title, ...(change.asked && { asked: change.asked }), started: change.started });
    for (const handBack of change.handBacks) await keepHandBack(kept, making, handBack, change.comparisons);
    for (const made of madeFrom) await copyRecording(join(making, "hand-backs", String(made.handBack), "files"), made);
    for (const send of change.sends) await json(join(making, "sends", `${send.id}.json`), send);
    await mkdir(join(making, "sends"), { recursive: true });
    if (change.taken.length) await json(join(making, "taken.json"), change.taken);
    if (change.seen && Object.keys(change.seen).length) await json(join(making, "seen.json"), change.seen);
    for (const part of ["moments", "branches"]) await cp(join(kept, part), join(making, part), { recursive: true }).catch(missing);
    if (sendFails) await chmod(join(making, "sends"), 0o555);
  }
  // A folder left unwritable by the state before is made writable again, so it can go.
  await chmod(join(folder, "sends"), 0o755).catch(missing);
  await rename(folder, gone).catch(missing);
  if (change) await rename(making, folder);
  await rm(gone, { recursive: true, force: true });
}

// A version handed back, as `handBack` says, with the kept one's recordings and pictures and what it was compared with;
// its own file last, as the agent's is, so it's never read finished without them.
export async function keepHandBack(kept: string, change: string, handBack: HandBack, comparisons: Comparison[]) {
  const folder = join(change, "hand-backs", String(handBack.number));
  await cp(join(kept, "hand-backs", String(handBack.number), "files"), join(folder, "files"), { recursive: true }).catch(missing);
  for (const comparison of comparisons.filter((one) => one.handBack === handBack.number)) await json(join(folder, "since", `${comparison.since}.json`), comparison);
  await json(join(folder, "hand-back.json"), handBack);
}

// Every file of a recording (it, its readings, pictures and what it kept of the app's files) again, by the new name.
async function copyRecording(files: string, { recording, from }: MadeFrom) {
  const [stem, was] = [recording.replace(/\.json$/, ""), from.replace(/\.json$/, "")];
  for (const entry of await readdir(files, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = relative(files, join(entry.parentPath, entry.name));
    const renamed = path
      .split(sep)
      .map((part) => (part === was ? stem : part.startsWith(`${was}.`) ? stem + part.slice(was.length) : part))
      .join(sep);
    if (renamed === path) continue;
    await mkdir(dirname(join(files, renamed)), { recursive: true });
    await copyFile(join(files, path), join(files, renamed));
  }
}

async function json(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

const missing = (error: NodeJS.ErrnoException) => {
  if (error.code !== "ENOENT") throw error;
};
