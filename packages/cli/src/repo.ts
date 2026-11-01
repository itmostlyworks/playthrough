// Where Playthrough keeps things in the app's repo: each review in .playthrough/, out of git, with the flows written for it,
// and how to start the app in playthrough/app.json, which is committed so every review uses it. While a flow added later
// records on Before, where the agent's work is set aside is written down in .playthrough/ too.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { Refused, Reviews } from "@playthrough/review";
import { folder } from "@playthrough/review/folder";

// And whether its flows run one at a time: on an app with a page that shows what every run made, as a blog's index lists
// every post, flows run side by side would see each other's.
export type App = { start: string; url: string; oneAtATime?: boolean };
export type Repo = ReturnType<typeof repo>;

export function repo(root = home(process.cwd())) {
  const reviews = join(root, ".playthrough");
  const appFile = join(root, "playthrough", "app.json");
  return {
    root,
    reviews: new Reviews(folder(reviews)),
    flows: (review: string) => join(reviews, review, "flows"),
    // What Playwright wrote of the page each flow failed on, the last time any did, for the agent to look at.
    failed: (review: string) => join(reviews, review, "failed"),
    round: (review: string, round: number) => join(reviews, review, "rounds", String(round), "round.json"),
    // The file each flow is written in, as it was when the flow last ran on Before.
    ranOnBefore: (review: string) => join(reviews, review, "ran-on-before.json"),
    setAside: join(reviews, "set-aside.json"),
    // How to start the app, committed.
    appFile,
    // What every flow of the app starts from, committed beside app.json.
    setup: join(root, "playthrough", "setup.ts"),
    // What setup made for each run, until its after gives it back.
    borrowed: join(reviews, "borrowed"),
    // The app's setup as it was last tried, and where each of its people started there.
    tried: join(reviews, "tried"),
    // As a person at this folder would type it.
    show: (path: string) => relative(process.cwd(), path) || ".",

    // Git never sees .playthrough/, so setting the agent's work aside, or putting the app as it was in place, never moves it.
    async keepOutOfGit() {
      await mkdir(reviews, { recursive: true });
      await writeFile(join(reviews, ".gitignore"), "*\n");
    },

    async app(): Promise<App> {
      const how = `Say how to start the app in playthrough/app.json: { "start": "<the command that serves it>", "url": "<where it's served>" }.`;
      const text = await readFile(appFile, "utf8").catch(() => undefined);
      if (text === undefined) throw new Refused([`Playthrough needs to start the app to record it. ${how}`]);
      let app: Partial<App>;
      try {
        app = JSON.parse(text);
      } catch (error) {
        throw new Refused([`playthrough/app.json isn't JSON: ${(error as Error).message}. ${how}`]);
      }
      if (!app || typeof app !== "object" || !isText(app.start) || !isText(app.url)) throw new Refused([`playthrough/app.json needs both “start” and “url”. ${how}`]);
      // Otherwise it's started, and waited for, for three minutes, at an address nothing can answer at.
      if (!/^https?:$/.test(URL.parse(app.url)?.protocol ?? ""))
        throw new Refused([`playthrough/app.json's “url” is a whole address, as a browser takes it, like http://localhost:3000, not “${app.url}”.`]);
      if (app.oneAtATime !== undefined && typeof app.oneAtATime !== "boolean") throw new Refused([`playthrough/app.json's “oneAtATime” is true or false: true runs each flow by itself.`]);
      return { start: app.start, url: app.url, ...(app.oneAtATime && { oneAtATime: true }) };
    },
  };
}

// The app's folder: the nearest one up from here that Playthrough is in, as far as the top of the git repo, so a command
// run from inside the app finds its reviews. Where it isn't yet, it's here.
function home(here: string): string {
  for (let folder = here; ; folder = dirname(folder)) {
    if (existsSync(join(folder, ".playthrough")) || existsSync(join(folder, "playthrough", "app.json"))) return folder;
    if (existsSync(join(folder, ".git")) || dirname(folder) === folder) return here;
  }
}

const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
