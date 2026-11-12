// A rough try: the moments page's side of `playthrough open`. What each moment the agent marked is about, as
// `playthrough moment` keeps it, by its words; and the way to each, where stepping in looks for a review's scenes, so
// a moment can be stepped into as a scene is taken over.

import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { Repo } from "./repo.ts";

export type Shown = { words: string; about?: { role: string; name: string } };

// The app by its name, and its people as the list says them: "Sam, a member", from setup.ts's own words for them
// ("…: a member of the workspace, not an admin"), read as text, where it says one is "a" something; else just the name.
export function momentsPage(repo: Repo, id: string) {
  const named = (() => {
    try {
      return String(JSON.parse(readFileSync(join(repo.root, "package.json"), "utf8")).name ?? "").replace(/^@[^/]+\//, "");
    } catch {
      return "";
    }
  })() || basename(repo.root);
  const setup = existsSync(repo.setup) ? readFileSync(repo.setup, "utf8") : "";
  const listed = setup.match(/export const people\s*=\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
  const people = Object.fromEntries(
    [...listed.matchAll(/(\w+)\s*:\s*"([^"]*)"/g)].map(([, name, words]) => {
      const role = words!.split(":")[1]?.split(/[,.]| of /)[0]?.trim();
      return [name!, role && /^an? /.test(role) ? `${name}, ${role}` : name!];
    }),
  );
  return { app: named.charAt(0).toUpperCase() + named.slice(1), people, moments: momentsOf(repo, id) };
}

function momentsOf(repo: Repo, id: string): Shown[] {
  const kept = join(repo.root, ".playthrough", "moments");
  const scenes = repo.scenes(id);
  const each = existsSync(kept) ? readdirSync(kept, { withFileTypes: true }).filter((entry) => entry.isDirectory()) : [];
  mkdirSync(scenes, { recursive: true });
  if (!existsSync(join(scenes, "package.json"))) writeFileSync(join(scenes, "package.json"), `{ "type": "module" }\n`);
  return each.flatMap((entry) => {
    const folder = join(kept, entry.name);
    // One still being kept isn't shown yet.
    let moment: { words: string; about?: { role: string; name: string } };
    try {
      moment = JSON.parse(readFileSync(join(folder, "moment.json"), "utf8"));
    } catch {
      return [];
    }
    const linked = join(scenes, `${entry.name}.ts`);
    if (existsSync(join(folder, "scene.ts")) && !existsSync(linked)) symlinkSync(relative(scenes, join(folder, "scene.ts")), linked);
    return [{ words: moment.words, ...(moment.about && { about: { role: moment.about.role, name: moment.about.name } }) }];
  });
}
