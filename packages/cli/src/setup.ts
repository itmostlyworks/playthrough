// What every flow of the app starts from, made by playthrough/setup.ts before each flow, if the app has one: its default
// export is given the page, Playwright's request and who the flow is done as, and what it returns is each flow's
// “setup”. Each run makes its own, so no two start from what another left, and gives it back once it's over: setup's
// `after`, if it has one, is given what was made, and takes it away, so the app, shared or not, isn't left with a world
// for every run. The app's people, if it names them, are who a flow can be done as: `signIn` makes a page theirs, the
// flow's own and any it's handed to on the way.

import { request as requests, type APIRequestContext, type Page } from "@playwright/test";
import { list, quote } from "@playthrough/review";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { firstLine } from "./reporter.ts";

type Make = (given: { page: Page; request: APIRequestContext; baseURL?: string; person?: string }) => unknown;
// Given a request of its own, not the run's, so it's the same whether it's the run's end or a later command's: what
// setup returned is all it knows of what was made.
type After = (given: { request: APIRequestContext; baseURL: string; setup: Record<string, any> }) => unknown;
type SignIn = (given: { page: Page; person: string; setup: Record<string, any> }) => unknown;
// Each of the app's people, by name, in the team's words: for the agent to read, never shown.
export type People = Record<string, string>;
export type Setup = { make?: Make; after?: After; signIn?: SignIn; people?: People };

// Loaded again in Playthrough once it's written again, by when.
export async function setupIn(file: string, written?: number): Promise<Setup> {
  if (!existsSync(file)) return {};
  const href = pathToFileURL(file).href;
  asModule(href);
  // In an app whose package.json doesn't say it's a module, Playwright loads the file as CommonJS, its exports one level down.
  type Module = { default?: Make; after?: After; signIn?: SignIn; people?: People };
  const module: Omit<Module, "default"> & { default?: Make | Module } = await import(`${href}${written ? `?${written}` : ""}`);
  const inner = typeof module.default === "object" ? module.default : undefined;
  return {
    make: typeof module.default === "function" ? module.default : inner?.default,
    after: module.after ?? inner?.after,
    signIn: module.signIn ?? inner?.signIn,
    people: module.people ?? inner?.people,
  };
}

// A setup is a module whatever the app's package.json says, as flows are: written with import and export, as they're
// shown, one in an app that says it's CommonJS would otherwise fail to load.
const setups = new Set<string>();
function asModule(href: string) {
  if (!setups.size) registerHooks({ load: (url, context, next) => next(url, setups.has(url.split("?")[0]!) ? { ...context, format: "module-typescript" } : context) });
  setups.add(href);
}

// Who a flow that names no one is done as: the first the app names.
export const firstOf = ({ people }: Setup) => Object.keys(people ?? {})[0];

// Someone the app names, or anyone at all where it names nobody; one it doesn't name stops the flow before anything is made.
export function personIn({ people }: Setup, person: string) {
  if (people && !(person in people))
    throw new Error(`playthrough/setup.ts names no one called ${quote(person)}. Its people: ${list(Object.keys(people).map(quote))}. Add them there, or do the flow as one of them.`);
}

// Made for one run, and written down in .playthrough/borrowed/ until it's given back, by the process it's made for, named
// in the file's name. Should that process end first, stopped or crashed, the next command gives it back.
// Giving it back says whether it was.
export type Made = { setup: Record<string, any>; giveBack: () => Promise<boolean> };
export async function make({ make, after }: Setup, borrowed: string, given: Parameters<Make>[0] & { baseURL: string }): Promise<Made> {
  const setup = ((await make?.(given)) ?? {}) as Record<string, any>;
  if (!after) return { setup, giveBack: async () => false };
  await mkdir(borrowed, { recursive: true });
  const file = join(borrowed, `${process.pid}-${randomUUID()}.json`);
  await writeFile(file, JSON.stringify({ baseURL: given.baseURL, setup }));
  return { setup, giveBack: () => giveBack(after, file, given.baseURL, setup) };
}

// What a process that has ended made and didn't give back. Each is first taken as this process's own, by its name, so
// two commands at once never both give one back; one that can't be given back now is tried again once this one ends.
export const giveBackLeft = (setup: Setup, borrowed: string) => giveBackOf(setup, borrowed, (pid) => !alive(pid));
// Everything this process made, as it ends: the app handed over, and the runs still going.
export const giveBackOwn = (setup: Setup, borrowed: string) => giveBackOf(setup, borrowed, (pid) => pid === process.pid);

async function giveBackOf({ after }: Setup, borrowed: string, whose: (pid: number) => boolean) {
  if (!after) return;
  const left = (await readdir(borrowed).catch(() => [])).filter((name) => whose(Number(name.split("-")[0])));
  for (const name of left) {
    const file = join(borrowed, `${process.pid}-${name.slice(name.indexOf("-") + 1)}`);
    if (!(await rename(join(borrowed, name), file).then(() => true, () => false))) continue;
    const { baseURL, setup } = JSON.parse(await readFile(file, "utf8"));
    await giveBack(after, file, baseURL, setup);
  }
}

// Once each: a run that ends as Playthrough does would otherwise be given back twice.
const giving = new Set<string>();
async function giveBack(after: After, file: string, baseURL: string, setup: Record<string, any>) {
  if (giving.has(file) || !existsSync(file)) return true;
  giving.add(file);
  const request = await requests.newContext({ baseURL });
  try {
    await after({ request, baseURL, setup });
    await rm(file, { force: true });
    return true;
  } catch (error) {
    console.log(`playthrough/setup.ts's after couldn't give back what a run made: ${firstLine(String((error as Error)?.message ?? error))}. It's tried again by the next command.`);
    return false;
  } finally {
    giving.delete(file);
    await request.dispose();
  }
}

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
