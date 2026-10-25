// A round compared with each round before it, flow by flow and step by step: the page each step left, read and pictured,
// against the same step's in the earlier round, steps matched by their titles. Steps a flow takes that it didn't before are
// New steps, one stretch of the flow; a step it doesn't take any more is gone, and so is a flow. The same change in
// several flows, or at several steps, is one change, seen in each flow where it first shows there.

import { chromium, type Page } from "@playwright/test";
import { list, quote, Refused, type Change, type Comparison, type Flow, type Place, type Reviews, type Step } from "@vantage/review";
import { changesAt, idOf } from "./changes.ts";
import { picturesAt } from "./pictures.ts";
import type { Reading } from "@vantage/page";
import { readingsOf } from "./reporter.ts";

// A round as recorded: its flows, and what was read at the end of each of their steps, with its picture.
export type Recorded = { number: number; flows: Flow[]; readings: (flow: Flow) => Promise<Reading[]>; picture: (name: string) => Promise<Buffer> };

// The round being worked on, compared with each round before it, from what's kept of each.
export async function compareWithEarlier(reviews: Reviews, id: string, number: number, flows: Flow[]): Promise<Comparison[]> {
  const review = await reviews.get(id);
  const earlier = review.rounds.filter((round) => round.number < number);
  if (!earlier.length) return [];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const now = kept(reviews, id, number, flows);
    const comparisons: Comparison[] = [];
    for (const round of earlier) comparisons.push(await compare(page, kept(reviews, id, round.number, round.flows), now));
    return comparisons;
  } finally {
    await browser.close();
  }
}

function kept(reviews: Reviews, id: string, number: number, flows: Flow[]): Recorded {
  const file = async (name: string) => {
    const bytes = await reviews.file(id, number, name);
    if (!bytes)
      throw new Refused([`${number === 0 ? "Before" : `Round ${number}`} has no ${name}, so it can't be compared: it was recorded before Vantage read each step. Start the review again.`]);
    return Buffer.from(bytes);
  };
  return { number, flows, readings: async (flow) => JSON.parse((await file(readingsOf(flow))).toString()), picture: file };
}

export async function compare(page: Page, earlier: Recorded, round: Recorded): Promise<Comparison> {
  const changes = new Map<string, Change>();
  const see = ({ id, words, place }: Sighting) => {
    const change = changes.get(id);
    if (!change) changes.set(id, { id, words, seen: [place] });
    else if (!change.seen.some((seen) => seen.flow === place.flow)) change.seen.push(place);
  };
  for (const flow of round.flows) {
    // A flow the earlier round didn't have has nothing to be compared with there: it's new to whoever looked then.
    const before = earlier.flows.find((kept) => kept.name === flow.name);
    if (before) for (const sighting of await compareFlow(page, earlier, before, round, flow)) see(sighting);
  }
  // A flow the agent took away is a change too: what it showed isn't shown any more.
  for (const gone of earlier.flows.filter((flow) => !round.flows.some((kept) => kept.name === flow.name)))
    see({ id: idOf(`flow:${gone.name}`, "gone"), words: `${quote(gone.name)} isn't a flow any more`, place: { flow: gone.name } });
  return { round: round.number, since: earlier.number, changes: [...changes.values()] };
}

// A change where it's seen in one flow.
type Sighting = { id: string; words: string; place: Place };

async function compareFlow(page: Page, earlier: Recorded, before: Flow, round: Recorded, flow: Flow): Promise<Sighting[]> {
  const pairs = pairSteps(before.steps, flow.steps);
  const sightings: Sighting[] = [...newSteps(flow, pairs), ...goneSteps(before, flow, pairs)];

  // Each step both take: the page it left, against the earlier one's.
  const then = await earlier.readings(before);
  for (const reading of await round.readings(flow)) {
    const step = pairs.get(flow.steps.findIndex((step) => step.title === reading.step));
    const was = step === undefined ? undefined : then.find((kept) => kept.step === before.steps[step]!.title);
    if (!was) continue;
    const pictures = { then: await earlier.picture(was.picture), now: await round.picture(reading.picture) };
    for (const found of [...changesAt(was, reading), ...(await picturesAt(page, was, reading, pictures))]) {
      const on = found.element ? { element: found.element } : found.box ? { box: found.box } : {};
      sightings.push({ id: found.id, words: found.words, place: { flow: flow.name, at: reading.at, ...on } });
    }
  }
  return sightings.sort((a, b) => (a.place.at ?? 0) - (b.place.at ?? 0));
}

// Each step of the newer flow with the earlier flow's step of the same title, in order: the first of that title after the
// last one matched. By their places in each flow's steps.
function pairSteps(then: Step[], now: Step[]): Map<number, number> {
  const pairs = new Map<number, number>();
  let after = -1;
  now.forEach((step, i) => {
    const j = then.findIndex((kept, k) => k > after && kept.title === step.title);
    if (j < 0) return;
    pairs.set(i, j);
    after = j;
  });
  return pairs;
}

// Steps next to each other that only the newer flow takes are one stretch of New steps, to the next step it shares or its
// end: what it does that the app couldn't, or the earlier round didn't. On a Before that stopped short, everything from
// the step it couldn't take.
function newSteps(flow: Flow, pairs: Map<number, number>): Sighting[] {
  return runs(flow.steps.length, (i) => !pairs.has(i)).map(([first, last]) => {
    const titles = flow.steps.slice(first, last + 1).map((step) => step.title);
    const at = flow.steps[first]!.at;
    const until = flow.steps[last + 1]?.at ?? flow.length;
    return {
      id: idOf(`steps in ${flow.name}: ${titles.join(" · ")}`, "new steps"),
      words: `New steps: ${list(titles.map(quote))}`,
      place: { flow: flow.name, at, ...(until > at && { until }) },
    };
  });
}

// Steps next to each other that only the earlier flow took are gone, where they were: at the next step both take.
function goneSteps(before: Flow, flow: Flow, pairs: Map<number, number>): Sighting[] {
  const kept = new Set(pairs.values());
  return runs(before.steps.length, (j) => !kept.has(j)).map(([first, last]) => {
    const titles = before.steps.slice(first, last + 1).map((step) => step.title);
    const next = [...pairs].find(([, j]) => j > last)?.[0];
    const at = next === undefined ? flow.length : flow.steps[next]!.at;
    return {
      id: idOf(`steps in ${flow.name}: ${titles.join(" · ")}`, "gone"),
      words: `${list(titles.map(quote))} ${titles.length > 1 ? "aren't steps" : "isn't a step"} here any more`,
      place: { flow: flow.name, at },
    };
  });
}

// The first and last of each run of places, in order, that are in it.
function runs(count: number, isIn: (i: number) => boolean): [number, number][] {
  const found: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    if (!isIn(i)) continue;
    const last = found.at(-1);
    if (last && last[1] === i - 1) last[1] = i;
    else found.push([i, i]);
  }
  return found;
}
