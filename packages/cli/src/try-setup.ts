// The first time flows run in an app, and whenever playthrough/app.json or playthrough/setup.ts changes, the setup is
// tried by itself: the app started, and what a flow starts from made, signed in as each of the app's people and given
// back, twice, as every run will. An app that won't start, or a setup that works once and not again, says so here, in a
// line, rather than as every flow failing. Nothing's recorded until the agent has seen where each of the app's people
// starts, in a picture, and run the command again. What it found is for the person too, whose app it is: what a run
// leaves behind, and how long each flow waits for it.

import { chromium, request as requests, type Browser } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { quote, Refused } from "@playthrough/review";
import { keepRunning } from "./app.ts";
import { firstLine } from "./reporter.ts";
import type { Repo } from "./repo.ts";
import { changes, giveBackLeft, make, setupIn, watching, type Made, type Setup } from "./setup.ts";

// Longer than this before a flow's first step, and the person feels it.
const SLOW = 2000;

// Again, the command to run once the agent has looked.
export async function trySetup(repo: Repo, again: string) {
  const app = await repo.app();
  const written = await writtenNow(repo);
  const last = join(repo.tried, "tried.json");
  if ((await readFile(last, "utf8").then((text) => JSON.parse(text).written, () => undefined)) === written) return;

  console.log("Trying the app's setup by itself first, twice, as every flow will start…");
  // The browser first: without it, there's no starting the app for.
  const browser = await chromium.launch().catch((error) => {
    // Named by its version: an app with a Playwright of its own would install that one's Chromium.
    const { version } = createRequire(import.meta.url)("@playwright/test/package.json");
    if (/Executable doesn't exist/.test(String(error?.message)))
      throw new Refused([`Playwright has no Chromium to run the flows in yet. Install the one Playthrough's Playwright runs (npx playwright@${version} install chromium), then run this again.`]);
    throw error;
  });
  let startedIn: number | undefined;
  let setup: Setup;
  const tried: Tried[] = [];
  try {
    startedIn = await keepRunning(app, repo.root);
    setup = await setupIn(repo.setup, (await stat(repo.setup).catch(() => undefined))?.mtimeMs);
    await giveBackLeft(setup, repo.borrowed);
    await rm(repo.tried, { recursive: true, force: true });
    await mkdir(repo.tried, { recursive: true });
    const people = Object.keys(setup.people ?? {});
    for (const person of people.length ? people : [undefined]) tried.push(await tryAs(repo, browser, setup, app.url, person));
  } finally {
    await browser.close();
  }

  const width = Math.max("The app".length, ...tried.map(({ who }) => who.length)) + 3;
  const line = (label: string, said: string) => `  ${label.padEnd(width)}${said}`;
  console.log(`\n${line("The app", startedIn === undefined ? `running already at ${app.url}` : `started with ${quote(app.start)}, answering at ${app.url} in ${seconds(startedIn)}`)}`);
  for (const { who, did, took, at, refused, picture } of tried)
    console.log(line(who, `${did}${did === "nothing made" ? "" : ` in ${seconds(took)}`}, then at ${at}${refused ? `, which the app answered with ${refused}` : ""}: ${repo.show(picture)}`));

  // What a run leaves behind is said only where setup was seen to make something: a setup that only opens a page, or one
  // the app needs none of, as one that keeps everything in the browser, leaves nothing. What flows leave without one,
  // recording Before says, as it sees them send it (start.ts).
  const missing: string[] = [];
  if (!setup.after && tried.some(({ made }) => made))
    missing.push("playthrough/setup.ts has no after, so what each run makes stays in the app: one for each flow recorded, two for a new one, and one each time the person pauses a recording, as it's made ready to take over.");
  else if (tried.some(({ givenBack }) => !givenBack)) missing.push("playthrough/setup.ts's after couldn't give back what it made, for the reason above.");
  const slowest = Math.max(...tried.map(({ took }) => took));
  if (slowest > SLOW) missing.push(`Each flow waits up to ${seconds(slowest)} for its setup before its first step, and so does each moment taken over.`);

  console.log(`
Look at ${tried.length > 1 ? "each picture: it's where their flows start" : "the picture: it's where every flow starts"}. One that shows a sign-in page, or anything a flow shouldn't start from, is for playthrough/setup.ts.`);
  if (missing.length)
    console.log(`
${missing.map((said) => `- ${said}`).join("\n")}

Tell the person now, in a few lines, how flows get into their app, and for each of these, what it costs them and the step that would fix it: something the app has already, or something only they can give, like a test account. Ask before you change their app for it, as with a route only for tests, and don't wait for their answer.`);
  else console.log(`\nTell the person in a line or two how flows get into their app.`);
  await writeFile(last, JSON.stringify({ written }));
  throw new Refused([`\nNothing's recorded yet. Once ${tried.length > 1 ? "each picture shows" : "the picture shows"} where a flow should start, run ${again} again.`]);
}

// One of the app's people, or anyone where it names nobody: what was made for them, how long it took, where their page
// was then, as the second run left it, and the error the app answered that page with, if it did; whether setup made
// anything for them, sending the app what changes it or returning what it made, and whether what was made was given back
// each time.
type Tried = { who: string; did: string; took: number; at: string; refused?: string; picture: string; made: boolean; givenBack: boolean };

async function tryAs(repo: Repo, browser: Browser, setup: Setup, baseURL: string, person?: string): Promise<Tried> {
  const who = person ? person.charAt(0).toUpperCase() + person.slice(1) : "Every flow";
  const did = setup.make && person && setup.signIn ? "made and signed in" : setup.make ? "made" : person && setup.signIn ? "signed in" : "nothing made";
  const tried: Tried = { who, did, took: 0, at: "", picture: join(repo.tried, `${(person ?? "every flow").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "person"}.png`), made: false, givenBack: true };
  for (const time of ["first", "second"] as const) {
    const context = await browser.newContext({ baseURL, locale: "en-US", timezoneId: "UTC", viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const request = await requests.newContext({ baseURL });
    let made: Made | undefined;
    let answered: { status: () => number; statusText: () => string } | undefined;
    page.on("response", (response) => void (response.request().isNavigationRequest() && response.frame() === page.mainFrame() && (answered = response)));
    try {
      const began = Date.now();
      const sent = (sent: { method: () => string }) => void (changes(sent.method()) && (tried.made = true));
      page.on("request", sent);
      try {
        made = await make(setup, repo.borrowed, { page, request: watching(request, () => (tried.made = true)), baseURL, person });
        page.off("request", sent);
        if (Object.keys(made.setup).length) tried.made = true;
        if (person) await setup.signIn?.({ page, person, setup: made.setup });
      } catch (error) {
        const why = firstLine(String((error as Error)?.message ?? error));
        const as = person ? ` for ${quote(person)}` : "";
        throw new Refused([
          time === "first"
            ? `playthrough/setup.ts couldn't make what a flow starts from${as}: ${why}. Fix it and run this again.`
            : `playthrough/setup.ts made what a flow starts from${as} once, but not a second time: ${why}. Each run makes its own, so make it new each time, as with a name or an email of its own, and run this again.`,
        ]);
      }
      tried.took = Math.max(tried.took, Date.now() - began);
      if (page.url() === "about:blank") await page.goto("/");
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      const url = new URL(page.url());
      tried.at = url.origin === new URL(baseURL).origin ? `${url.pathname}${url.search}` : url.href;
      tried.refused = answered && answered.status() >= 400 ? `${answered.status()} ${answered.statusText()}`.trim() : undefined;
      if (time === "second") await page.screenshot({ path: tried.picture });
    } finally {
      await context.close();
      await request.dispose();
      if (made && setup.after && !(await made.giveBack())) tried.givenBack = false;
    }
  }
  return tried;
}

const seconds = (ms: number) => (ms < 100 ? "under 0.1 s" : `${(ms / 1000).toFixed(1)} s`);

// What's tried: how the app starts and what every flow starts from, as they're written now.
async function writtenNow(repo: Repo) {
  const text = (path: string) => readFile(path, "utf8").catch(() => "");
  return createHash("sha256")
    .update(await text(repo.appFile))
    .update("\0")
    .update(await text(repo.setup))
    .digest("hex");
}
