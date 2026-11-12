// Every app on this machine Playthrough is used in, so one page lists what's waiting on you from all of them: each
// command run in an app makes it known, in a file of the machine's own, and one gone from disk drops out by itself.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { copies } from "./repo.ts";

// The machine's own folder, or another, to try Playthrough without touching what it keeps: PLAYTHROUGH_HOME.
export const machine = () => resolve(process.env.PLAYTHROUGH_HOME || join(homedir(), ".playthrough"));
const appsFile = () => join(machine(), "apps.json");

// The apps known here, as the folders they were used from, each still on disk.
export function knownApps(): string[] {
  try {
    const apps: unknown = JSON.parse(readFileSync(appsFile(), "utf8"));
    return Array.isArray(apps) ? apps.filter((app): app is string => typeof app === "string" && existsSync(app)) : [];
  } catch {
    return [];
  }
}

// An app is known once Playthrough has a folder in it; known already, nothing is written.
export function know(root: string) {
  if (!existsSync(join(root, "playthrough", "app.json")) && !existsSync(join(root, ".playthrough"))) return;
  const apps = knownApps();
  if (apps.includes(root)) return;
  mkdirSync(machine(), { recursive: true });
  const writing = `${appsFile()}.${process.pid}.writing`;
  writeFileSync(writing, `${JSON.stringify([...apps, root], null, 2)}\n`);
  renameSync(writing, appsFile());
}

// Every copy of every app known, each by a name of its own for addresses: its folder's, and where two share one, the
// later with a number, as the machine came to know them.
export function everyCopy(): { name: string; root: string }[] {
  const roots = [...new Set(knownApps().flatMap(copies))].filter((root) => existsSync(join(root, ".playthrough")));
  const taken = new Map<string, number>();
  return roots.map((root) => {
    const named = basename(root);
    const nth = (taken.get(named) ?? 0) + 1;
    taken.set(named, nth);
    return { name: nth > 1 ? `${named}-${nth}` : named, root };
  });
}
