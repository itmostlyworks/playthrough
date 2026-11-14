// A change: one piece of work the agent does in this copy of the app, by its title, as a pull request's, and what was
// asked, in the person's words. The agent names it once; every command after that means it, until another is named.
// Each copy (each of git's worktrees) has changes of its own, so an agent in each works on its own without saying which.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { list, quote, Refused } from "@playthrough/change";
import type { Repo } from "./repo.ts";
import { wordsIn } from "./way.ts";

// A title says the change, not how: as a pull request's, short enough to read at a glance on the person's list.
const LONGEST_TITLE = 10;
const HOW = `playthrough change "<a title, as a pull request's>" "<what you were asked, in the person's words>"`;

// The change this copy's commands mean, kept beside its changes. Its own name, so it's never taken for a change's own
// change.json; kept by an older Playthrough as change.json, it's moved once, when it's next read.
const meantIn = (repo: Repo) => join(repo.root, ".playthrough", "working-on.json");
const meantBefore = (repo: Repo) => join(repo.root, ".playthrough", "change.json");

export const idOf = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "") || "change";

// A commit's prefix ("feat: ", "fix(board): ") isn't how a person says a change: the title is read without it.
export const titleOf = (title: string) => title.trim().replace(/^[a-z]+(\([^)]*\))?!?:\s+(.)/, (_, _scope, first: string) => first.toUpperCase());

export async function change(repo: Repo, said: string | undefined, asked: string | undefined) {
  if (!said?.trim() || !asked?.trim()) throw new Refused([`A change needs both: ${HOW}`]);
  const title = titleOf(said);
  const words = title.split(/\s+/).length;
  if (words > LONGEST_TITLE) throw new Refused([`That title is ${words} words. Say the change in under ${LONGEST_TITLE}, as a pull request's title (“Let admins change the card prefix”): what was asked goes after it.`]);
  const id = idOf(title);
  await repo.keepOutOfGit();
  const known = (await repo.changes.list()).includes(id);
  // Beside its changes, Playthrough keeps folders of its own in .playthrough/, and one kept by an older version may be
  // there still: a change is never put in one.
  if (!known && (id === basename(repo.borrowed) || existsSync(join(repo.root, ".playthrough", id))))
    throw new Refused([`A change titled ${quote(title)} would be kept in .playthrough/${id}, a folder Playthrough keeps for itself. Give it another title.`]);
  if (!known) await repo.changes.start(id, title, asked.trim());
  const { title: kept } = await repo.changes.get(id);
  // Two titles can make the same name: the second would carry on the first, and what was asked of it would be lost.
  if (kept !== title) throw new Refused([`${quote(title)} would be the change ${quote(kept)}, which is here already. To carry that one on, name it by its own title; for another change, give this one a title of its own.`]);
  await writeFile(meantIn(repo), `${JSON.stringify({ change: id })}\n`);
  const moments = momentsOf(repo, id).length;
  console.log(
    known
      ? `Back on ${quote(kept)}, with its ${moments} ${moments === 1 ? "moment" : "moments"}: what you run here means it again.`
      : `The change is ${quote(kept)}: what you run here means it, until you name another.`,
  );
}

// The change this copy's commands mean: the one named last here.
export async function changeHere(repo: Repo): Promise<string> {
  if (!existsSync(meantIn(repo)) && existsSync(meantBefore(repo))) await rename(meantBefore(repo), meantIn(repo));
  const kept = existsSync(meantIn(repo)) ? JSON.parse(await readFile(meantIn(repo), "utf8")).change : undefined;
  if (!kept || !(await repo.changes.list()).includes(kept)) throw new Refused([`Say what the change is first, once: ${HOW}`]);
  // Read once, so one kept by an older Playthrough is brought along before its moments' files are.
  await repo.changes.get(kept);
  return kept;
}

// A change's moments are the files of their ways there, each named by its words: what's run again, and handed back.
export function momentsOf(repo: Repo, id: string): { words: string; file: string }[] {
  const folder = repo.moments(id);
  const files = existsSync(folder) ? readdirSync(folder).filter((name) => name.endsWith(".ts")) : [];
  return files.flatMap((name) => {
    const words = wordsIn(readFileSync(join(folder, name), "utf8"));
    return words === undefined ? [] : [{ words, file: join(folder, name) }];
  });
}

// One of them, by its words as the agent said them, whatever their case.
export function momentNamed(repo: Repo, id: string, words: string): { words: string; file: string } {
  const moments = momentsOf(repo, id);
  const found = moments.find((one) => one.words.trim().toLowerCase() === words.trim().toLowerCase());
  if (!found) throw new Refused([`There's no moment ${quote(words)}.${moments.length ? ` The moments: ${list(moments.map((one) => quote(one.words)))}.` : " Mark one first: playthrough moment \"<what's there>\""}`]);
  return found;
}
