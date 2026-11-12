// A rough try: the moments page's side of `playthrough open`. What each moment the agent marked is about, as
// `playthrough moment` keeps it, by its words; and the way to each, where stepping in looks for a review's scenes, so
// a moment can be stepped into as a scene is taken over.

import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Repo } from "./repo.ts";

export type Shown = { words: string; about?: { role: string; name: string } };

export function momentsOf(repo: Repo, id: string): Shown[] {
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
