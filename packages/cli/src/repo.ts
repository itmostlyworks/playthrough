// Where Playthrough keeps things in the app's repo: each review in .playthrough/, out of git, with the flows written for it,
// and how to start the app in playthrough/app.json, which is committed so every review uses it. While a flow added later
// records on Before, where the agent's work is set aside is written down in .playthrough/ too.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { Refused, Reviews } from "@playthrough/review";
import { folder } from "@playthrough/review/folder";

export type App = { start: string; url: string };
export type Repo = ReturnType<typeof repo>;

export function repo(root = process.cwd()) {
  const reviews = join(root, ".playthrough");
  return {
    root,
    reviews: new Reviews(folder(reviews)),
    flows: (review: string) => join(reviews, review, "flows"),
    // What Playwright wrote of the page each flow failed on, the last time any did, for the agent to look at.
    failed: (review: string) => join(reviews, review, "failed"),
    round: (review: string, round: number) => join(reviews, review, "rounds", String(round), "round.json"),
    setAside: join(reviews, "set-aside.json"),
    // What every flow of the app starts from, committed beside app.json.
    setup: join(root, "playthrough", "setup.ts"),
    // What setup made for each run, until its after gives it back.
    borrowed: join(reviews, "borrowed"),
    // As a person at this folder would type it.
    show: (path: string) => relative(process.cwd(), path) || ".",

    // Git never sees .playthrough/, so setting the agent's work aside, or putting the app as it was in place, never moves it.
    async keepOutOfGit() {
      await mkdir(reviews, { recursive: true });
      await writeFile(join(reviews, ".gitignore"), "*\n");
    },

    async app(): Promise<App> {
      const file = join(root, "playthrough", "app.json");
      const how = `Say how to start the app in playthrough/app.json: { "start": "<the command that serves it>", "url": "<where it's served>" }.`;
      const text = await readFile(file, "utf8").catch(() => undefined);
      if (text === undefined) throw new Refused([`Playthrough needs to start the app to record it. ${how}`]);
      let app: Partial<App>;
      try {
        app = JSON.parse(text);
      } catch (error) {
        throw new Refused([`playthrough/app.json isn't JSON: ${(error as Error).message}. ${how}`]);
      }
      if (!isText(app.start) || !isText(app.url)) throw new Refused([`playthrough/app.json needs both “start” and “url”. ${how}`]);
      return { start: app.start, url: app.url };
    },
  };
}

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
