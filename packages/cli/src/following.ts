// Taking a flow over, ready before it's asked for. While the latest round plays, a run of its flow keeps up with the
// playhead, as far as it has gone and no further, so the moment it comes to rest on is there already. The flows run here,
// in Vantage, each in a window of its own, with its own cookies and storage, in one browser kept open while Vantage runs:
// a window opens in a moment, where a run of its own took a second and half a gigabyte.

import { chromium, request as requests, type Browser } from "@playwright/test";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { list, quote, Refused } from "@mostlyworks/vantage-review";
import { ALONGSIDE, isFlow, type Handed, type To } from "./flows.ts";
import { firstLine } from "./reporter.ts";
import type { Repo } from "./repo.ts";
import type { Body, MakeSetup, Orders } from "./test.ts";

// Runs one flow to where a person takes it over, on the app as it is now: quickly and unrecorded, from what every flow
// starts from, so they carry on from a fresh copy of the moment rather than a picture of it. The run that has followed
// the playhead there is there already; one that went past it, the playhead having gone back, is run again.
export async function runTo(repo: Repo, id: string, to: To): Promise<Handed> {
  const where = !to.step ? "its end" : to.actions ? `action ${to.actions} of ${quote(to.step)}` : `the end of ${quote(to.step)}`;
  const resting = { ...to, rests: true };
  try {
    for (const fresh of [false, true]) {
      const one = await inTurn(repo, id, async () => {
        const one = await followingFor(repo, id, resting, fresh);
        following.delete(key(repo, id));
        asked.set(key(repo, id), one);
        return one;
      });
      try {
        const since = Date.now();
        order(one, resting);
        const { handed, stopped } = await one.ran;
        if (handed) {
          // How long handing over takes once it's there, for a run that got there after it was asked: not one that was
          // there already, waiting, nor one doing what the person did there again first.
          if (one.last.when > since && !to.did?.length) timesOf(repo, id, one).handing.set(momentOf(to.step, to.actions), Date.now() - one.last.when);
          return handed;
        }
        if (stopped) throw new Refused([`${quote(to.flow)} didn't get to ${where}: ${stoppedAt(stopped)}`]);
      } finally {
        one.stop();
        if (asked.get(key(repo, id)) === one) asked.delete(key(repo, id));
      }
    }
    throw new Refused([`${quote(to.flow)} didn't get to ${where}.`]);
  } finally {
    // The next one starts there while the person looks, in case they play on.
    void follow(repo, id, { flow: to.flow, step: to.step, actions: to.actions }).catch(() => {});
  }
}

// While the latest round plays, a run of the flow keeps up with the playhead, as far as it has gone and no further, so
// the moment it comes to rest on is there already.
export const follow = (repo: Repo, id: string, to: To) => inTurn(repo, id, async () => order(await followingFor(repo, id, to), to));

// How long until a moment asked for is ready, in milliseconds: what the runs taken over before took from each of its
// moments to the next, from where this one has got to that one, as it will go, and to hand it over there. Nothing until
// a run taken over has got there once, for flows and a setup written as they are now.
export const readyIn = (repo: Repo, id: string, to: To) =>
  inTurn(repo, id, async () => {
    const one = asked.get(key(repo, id)) ?? following.get(key(repo, id));
    if (!one || one.flow !== to.flow) return undefined;
    const { moments, straight, keeping, handing } = timesOf(repo, id, one);
    const there = moments.indexOf(momentOf(to.step, to.actions));
    const here = moments.indexOf(one.passed.at(-1)!);
    if (there < 0) return undefined;
    // One that's past it, the playhead having gone back, gives way to a new one. One waiting for the playhead goes on
    // once it's asked, from where it is.
    const fresh = here > there;
    let left = (handing.get(momentOf(to.step, to.actions)) ?? 0) - (fresh || one.orders.moved ? 0 : Date.now() - one.last.when);
    for (const moment of moments.slice(fresh ? 0 : here + 1, there + 1)) {
      const [first, second] = stepOf(moment) === (to.step ?? "") ? [keeping, straight] : [straight, keeping];
      const took = first.get(moment) ?? second.get(moment);
      if (took === undefined) return undefined;
      left += took;
    }
    return Math.max(0, Math.round(left));
  });

// A run of one flow, told how far it may go, and how far it has got: the moments it has passed, how long it had worked
// at the last, when, and whether it was told where it rests. One that's over, or for flows or a setup that have changed
// since, or for another flow, is stopped, and a new one takes its place. One asked for is kept apart while it gets there.
type Following = { flow: string; written: number; orders: Orders; ran: ReturnType<Alongside["runAlongside"]>; stop: () => void; over?: boolean; passed: string[]; last: { worked: number; when: number; rests?: boolean } };
const following = new Map<string, Following>();
const asked = new Map<string, Following>();

// How long the runs taken over took to get to each moment of a flow from the one before, working: going straight on, or
// keeping what's done in the step they may be handed over in, which takes longer. And its moments in order, and how long
// each took to hand its page over once it got there. Not a run following the playhead: it keeps everything to do again,
// and its page settles while it waits.
type Took = { moments: string[]; straight: Map<string, number>; keeping: Map<string, number>; handing: Map<string, number> };
const took = new Map<string, Took>();
function timesOf(repo: Repo, id: string, { flow, written }: Following): Took {
  const at = `${key(repo, id)}\n${flow}\n${written}`;
  return took.get(at) ?? took.set(at, { moments: [], straight: new Map(), keeping: new Map(), handing: new Map() }).get(at)!;
}
const momentOf = (step?: string, actions?: number) => `${step ?? ""}\n${actions ?? ""}`;
const stepOf = (moment: string) => moment.split("\n")[0];
const key = (repo: Repo, id: string) => `${repo.root}\n${id}`;

async function followingFor(repo: Repo, id: string, to: To, fresh = false): Promise<Following> {
  const { files, written } = await writtenOf(repo, id);
  const one = following.get(key(repo, id));
  if (one && !one.over && !fresh && one.written === written && one.flow === to.flow) return one;
  one?.stop();
  const made = await start(repo, id, to, files, written);
  following.set(key(repo, id), made);
  return made;
}

async function start(repo: Repo, id: string, to: To, files: string[], written: number): Promise<Following> {
  const app = await repo.app();
  const { started } = await repo.reviews.get(id);
  const { runAlongside } = await alongside();
  const { flows, makeSetup } = await loadedOf(repo, id, files, written);
  const body = flows.get(to.flow);
  if (!body) throw new Refused([`${id} has no flow called ${quote(to.flow)} any more. Its flows: ${list([...flows.keys()].map(quote))}.`]);
  // As every flow is recorded: in one language and time zone, at 1280×800, where an action that can't happen fails in
  // seconds. A page may take as long as it takes to load, as the playhead may take to get there.
  const context = await (await browser()).newContext({ baseURL: app.url, viewport: { width: 1280, height: 800 }, locale: "en-US", timezoneId: "UTC" });
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(0);
  const request = await requests.newContext({ baseURL: app.url });
  const close = () => void Promise.all([context.close(), request.dispose()]).catch(() => {});
  const orders: Orders = { to };
  const page = await context.newPage();
  const one = { flow: to.flow, written, orders, stop: () => ((orders.stopped = true), orders.moved?.(), close()), passed: [] as string[], last: { worked: 0, when: Date.now(), rests: to.rests } } as Following;
  const times = timesOf(repo, id, one);
  const arrived = (step: string | undefined, actions: number | undefined, worked: number) => {
    const moment = momentOf(step, actions);
    const { to } = orders;
    // Told where it rests since the moment before, it went as a run taken over goes.
    if (to.rests && one.last.rests) (to.step !== step ? times.straight : times.keeping).set(moment, worked - one.last.worked);
    one.passed.push(moment);
    if (one.passed.length > times.moments.length) times.moments = [...one.passed];
    one.last = { worked, when: Date.now(), rests: to.rests };
  };
  one.ran = runAlongside(page, { request, baseURL: app.url, started, makeSetup, arrived }, body, orders).catch((error) => ({ stopped: { why: firstLine(String(error?.message ?? error)) } }));
  void one.ran.finally(() => ((one.over = true), close()));
  return one;
}

function order({ orders, last }: Following, to: To) {
  // A run waiting has done nothing since its last moment: from there, it goes as it's told now.
  if (orders.moved) last.rests = to.rests;
  orders.to = to;
  orders.moved?.();
}

// What every flow imports, loaded here once Vantage has said it's taking flows over, not running them as tests.
type Alongside = typeof import("./test.ts");
let loading: Promise<Alongside> | undefined;
const alongside = () => (loading ??= (((globalThis as Record<symbol, unknown>)[ALONGSIDE] = true), import("./test.ts")));

// One browser for every run, opened the first time one starts, and again if it closes.
let opened: Promise<Browser> | undefined;
function browser(): Promise<Browser> {
  opened ??= chromium.launch().then(
    (browser) => (browser.on("disconnected", () => (opened = undefined)), browser),
    (error) => ((opened = undefined), Promise.reject(error)),
  );
  return opened;
}

// The review's flows and the app's setup as they're written now, loaded once each time they're written again.
async function writtenOf(repo: Repo, id: string) {
  const files = (await readdir(repo.flows(id))).filter(isFlow).map((name) => join(repo.flows(id), name));
  const written = Math.max(...(await Promise.all([...files, repo.setup].map((file) => stat(file).then((it) => it.mtimeMs, () => 0)))));
  return { files, written };
}

const loaded = new Map<string, { written: number; flows: Promise<{ flows: Map<string, Body>; makeSetup?: MakeSetup }> }>();
function loadedOf(repo: Repo, id: string, files: string[], written: number) {
  const kept = loaded.get(key(repo, id));
  if (kept?.written === written) return kept.flows;
  const flows = alongside().then(({ flowsIn, setupIn }) => Promise.all([flowsIn(files, written), setupIn(repo.setup, written)])).then(
    ([flows, makeSetup]) => ({ flows, makeSetup }),
    (error) => {
      loaded.delete(key(repo, id));
      throw new Refused([`The flows of ${id} couldn't be loaded: ${firstLine(String(error?.message ?? error))}`]);
    },
  );
  loaded.set(key(repo, id), { written, flows });
  return flows;
}

// Where a flow taken over stopped, and why, in Playwright's words: read in the viewer too, where there's no terminal
// above it to point to.
const stoppedAt = ({ at, why }: { at?: string; why?: string }) => `it stopped${at ? ` at ${quote(at)}` : ""}${why ? `, where Playwright says “${why}”` : ""}.`;

// One at a time for each review, as the playhead moves faster than a run starts.
const turns = new Map<string, Promise<unknown>>();
function inTurn<T>(repo: Repo, id: string, then: () => Promise<T>): Promise<T> {
  const done = (turns.get(key(repo, id)) ?? Promise.resolve()).then(then);
  turns.set(key(repo, id), done.catch(() => {}));
  return done;
}
