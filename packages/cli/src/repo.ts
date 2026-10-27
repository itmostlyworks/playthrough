// Where Vantage keeps things in the app's repo: each review in .vantage/, out of git, with the flows written for it,
// and how to start the app in vantage/app.json, which is committed so every review uses it. While a flow added later
// records on Before, where the agent's work is set aside is written down in .vantage/ too.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { Refused, Reviews } from "@mostlyworks/vantage-review";
import { folder } from "@mostlyworks/vantage-review/folder";

export type App = { start: string; url: string };
export type Repo = ReturnType<typeof repo>;

export function repo(root = process.cwd()) {
  const reviews = join(root, ".vantage");
  return {
    root,
    reviews: new Reviews(folder(reviews)),
    flows: (review: string) => join(reviews, review, "flows"),
    round: (review: string, round: number) => join(reviews, review, "rounds", String(round), "round.json"),
    setAside: join(reviews, "set-aside.json"),
    // What every flow of the app starts from, committed beside app.json.
    setup: join(root, "vantage", "setup.ts"),
    // The flows of every accepted review, committed with the work, so every later review records them too.
    kept: join(root, "vantage", "flows"),
    // As a person at this folder would type it.
    show: (path: string) => relative(process.cwd(), path) || ".",

    // Git never sees .vantage/, so setting the agent's work aside, or putting the app as it was in place, never moves it.
    async keepOutOfGit() {
      await mkdir(reviews, { recursive: true });
      await writeFile(join(reviews, ".gitignore"), "*\n");
    },

    async app(): Promise<App> {
      const file = join(root, "vantage", "app.json");
      const how = `Say how to start the app in vantage/app.json: { "start": "<the command that serves it>", "url": "<where it's served>" }.`;
      const text = await readFile(file, "utf8").catch(() => undefined);
      if (text === undefined) throw new Refused([`Vantage needs to start the app to record it. ${how}`]);
      let app: Partial<App>;
      try {
        app = JSON.parse(text);
      } catch (error) {
        throw new Refused([`vantage/app.json isn't JSON: ${(error as Error).message}. ${how}`]);
      }
      if (!isText(app.start) || !isText(app.url)) throw new Refused([`vantage/app.json needs both “start” and “url”. ${how}`]);
      return { start: app.start, url: app.url };
    },
  };
}

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
