// Where Vantage keeps things in the app's repo: each review in .vantage/, out of git, with the flows written for it,
// and how to start the app in vantage/app.json, which is committed so every review uses it.

import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { Refused, Reviews } from "@vantage/review";
import { folder } from "@vantage/review/folder";

export type App = { start: string; url: string };
export type Repo = ReturnType<typeof repo>;

export function repo(root = process.cwd()) {
  const reviews = join(root, ".vantage");
  return {
    root,
    reviews: new Reviews(folder(reviews)),
    flows: (review: string) => join(reviews, review, "flows"),
    round: (review: string, round: number) => join(reviews, review, "rounds", String(round), "round.json"),
    // As a person at this folder would type it.
    show: (path: string) => relative(process.cwd(), path) || ".",

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
