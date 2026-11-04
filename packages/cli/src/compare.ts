// A round compared with each round before it, scene by scene and step by step: the page each step left, read and pictured,
// against the same step's in the earlier round, steps matched by their titles. Steps a scene takes that it didn't before are
// New steps, one stretch of the scene; a step it doesn't take any more is gone, and so is a scene. The same change in
// several scenes, or at several steps, is one change, seen in each scene where it first shows there.

import { chromium, type Page } from "@playwright/test";
import { list, quote, Refused, type Change, type Comparison, type Scene, type Place, type Reviews, type Step } from "@playthrough/review";
import { changesAt, idOf } from "./changes.ts";
import { HERE, picturesAt } from "./pictures.ts";
import type { Glimpse, Reading } from "@playthrough/page";
import { glimpsesOf, readingsOf } from "./reporter.ts";

// A round as recorded: its scenes, what was read at the end of each of their steps, with its picture, and what was glimpsed
// after each action, in a round recorded since Playthrough glimpsed.
export type Recorded = { number: number; scenes: Scene[]; readings: (scene: Scene) => Promise<Reading[]>; glimpses?: (scene: Scene) => Promise<Glimpse[]>; picture: (name: string) => Promise<Buffer> };

// The round being worked on, compared with each round before it, from what's kept of each.
export async function compareWithEarlier(reviews: Reviews, id: string, number: number, scenes: Scene[]): Promise<Comparison[]> {
  const review = await reviews.get(id);
  const earlier = review.rounds.filter((round) => round.number < number);
  if (!earlier.length) return [];
  const unsteady = unsteadyIn([...earlier.flatMap((round) => round.scenes), ...scenes]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const now = kept(reviews, id, number, scenes);
    const comparisons: Comparison[] = [];
    for (const round of earlier) comparisons.push(await compare(page, kept(reviews, id, round.number, round.scenes), now, unsteady));
    return comparisons;
  } finally {
    await browser.close();
  }
}

// The same scenes recorded twice on the same app: whatever differs between the two changes by itself, like a time the
// server stamps, so it's left out of every comparison from then on, in every scene: each change as the ids of what it
// stands for, so the email that changes in a row of the members table is left out, and not the table.
export async function changesByThemselves(first: Recorded, second: Recorded): Promise<(Change & { pieces: string[] })[]> {
  const browser = await chromium.launch();
  try {
    const { changes, pieces } = await comparing(await browser.newPage(), first, second);
    return changes.map((change) => ({ ...change, pieces: [...pieces.get(change.id)!] }));
  } finally {
    await browser.close();
  }
}

function kept(reviews: Reviews, id: string, number: number, scenes: Scene[]): Recorded {
  const file = async (name: string) => {
    const bytes = await reviews.file(id, number, name);
    if (!bytes)
      throw new Refused([`${number === 0 ? "Before" : `Round ${number}`} has no ${name}, so it can't be compared: it was recorded before Playthrough read each step. Start the review again.`]);
    return Buffer.from(bytes);
  };
  const glimpses = async (scene: Scene) => {
    const bytes = await reviews.file(id, number, glimpsesOf(scene));
    return bytes ? JSON.parse(Buffer.from(bytes).toString()) : [];
  };
  return { number, scenes, readings: async (scene) => JSON.parse((await file(readingsOf(scene))).toString()), glimpses, picture: file };
}

export async function compare(page: Page, earlier: Recorded, round: Recorded, unsteady: Unsteady = () => new Set()): Promise<Comparison> {
  const { pieces: _, ...comparison } = await comparing(page, earlier, round, unsteady);
  return comparison;
}

// And what each change stands for, by its id.
// What changes by itself in a scene, by its name.
type Unsteady = (scene: string) => Set<string>;

// What changes by itself in one scene, like a time the server stamps, changes by itself in every scene it's seen in; a part
// of a picture known only by where it is, only in its own scene.
export function unsteadyIn(scenes: Scene[]): Unsteady {
  const everywhere = scenes.flatMap((scene) => (scene.unsteady ?? []).filter((piece) => !piece.startsWith(HERE)));
  const here = (name: string) => scenes.filter((scene) => scene.name === name).flatMap((scene) => (scene.unsteady ?? []).filter((piece) => piece.startsWith(HERE)).map((piece) => piece.slice(HERE.length)));
  return (name) => new Set([...everywhere, ...here(name)]);
}

async function comparing(page: Page, earlier: Recorded, round: Recorded, unsteady: Unsteady = () => new Set()): Promise<Comparison & { pieces: Map<string, Set<string>> }> {
  const changes = new Map<string, Change>();
  const pieces = new Map<string, Set<string>>();
  const see = ({ id, words, place, of = [id], reworded, gone, pictureOnly }: Sighting) => {
    if (unsteady(place.scene).has(id)) return;
    const change = changes.get(id);
    for (const piece of of) (pieces.get(id) ?? pieces.set(id, new Set()).get(id)!).add(piece);
    if (!change) changes.set(id, { id, words, seen: [place], ...(reworded && { reworded }), ...(gone && { gone }), ...(pictureOnly && { pictureOnly }) });
    else {
      if (!change.seen.some((seen) => seen.scene === place.scene)) change.seen.push(place);
      // Read anywhere, it's a change Playthrough can name.
      if (!pictureOnly) delete change.pictureOnly;
    }
  };
  for (const scene of round.scenes) {
    // A scene the earlier round didn't have has nothing to be compared with there: it's new to whoever looked then.
    const before = earlier.scenes.find((kept) => kept.name === scene.name);
    if (before) for (const sighting of await compareScene(page, earlier, before, round, scene, unsteady(scene.name))) see(sighting);
  }
  // A scene the agent took away is a change too: what it showed isn't shown any more.
  for (const gone of earlier.scenes.filter((scene) => !round.scenes.some((kept) => kept.name === scene.name)))
    see({ id: idOf(`scene:${gone.name}`, "gone"), words: `${quote(gone.name)} isn't a scene any more`, place: { scene: gone.name } });
  return { round: round.number, since: earlier.number, changes: [...changes.values()], pieces };
}

// A change where it's seen in one scene, what it stands for, and whether only the pictures show it there.
type Sighting = { id: string; words: string; place: Place; of?: string[]; reworded?: string; gone?: true; pictureOnly?: true; offScreen?: true };

async function compareScene(page: Page, earlier: Recorded, before: Scene, round: Recorded, scene: Scene, unsteady: Set<string>): Promise<Sighting[]> {
  const pairs = pairSteps(before.steps, scene.steps);
  const sightings: Sighting[] = [...newSteps(scene, pairs), ...goneSteps(before, scene, pairs)];

  // Each step both take: the page it left, against the earlier one's, and what each round glimpsed in it and just after.
  const then = await earlier.readings(before);
  const glimpsed = { then: (await earlier.glimpses?.(before)) ?? [], now: (await round.glimpses?.(scene)) ?? [] };
  for (const reading of await round.readings(scene)) {
    const step = pairs.get(scene.steps.findIndex((step) => step.title === reading.step));
    const was = step === undefined ? undefined : then.find((kept) => kept.step === before.steps[step]!.title);
    if (!was) continue;
    const pictures = { then: await earlier.picture(was.picture), now: await round.picture(reading.picture) };
    const shown = { then: around(glimpsed.then, before, was.step), now: around(glimpsed.now, scene, reading.step) };
    const pictured = await picturesAt(page, was, reading, pictures);
    // Top to bottom, as the screen reads, whether read or pictured.
    for (const found of [...changesAt(was, reading, unsteady, shown), ...pictured].sort((a, b) => (a.top ?? 0) - (b.top ?? 0))) {
      const on = found.element ? { element: found.element, ...(found.alike && { alike: found.alike }) } : found.box ? { box: found.box } : {};
      sightings.push({ id: found.id, words: found.words, place: { scene: scene.name, at: reading.at, ...on }, of: found.pieces, ...(found.reworded && { reworded: found.reworded }), ...(found.gone && { gone: true as const }), ...(pictured.includes(found) && { pictureOnly: true as const }), ...(found.offScreen && { offScreen: true as const }) });
    }
  }
  // A change is seen where the person watching meets it: the first moment it's on the screen, not the first the page has
  // it, so a page that's read top to bottom shows its changes a screen at a time. One the scene never brings into view
  // keeps the first moment it's there.
  return sightings.sort((a, b) => Number(!!a.offScreen) - Number(!!b.offScreen) || (a.place.at ?? 0) - (b.place.at ?? 0));
}

// What was glimpsed in a step and just after it, where a message its actions announced may land.
function around(glimpses: Glimpse[], scene: Scene, step: string): Glimpse[] {
  const next = scene.steps[scene.steps.findIndex((kept) => kept.title === step) + 1]?.title;
  return [...glimpses.filter((glimpse) => glimpse.step === step), ...glimpses.filter((glimpse) => glimpse.step === next).slice(0, 1)];
}

// Each step of the newer scene with the earlier scene's step of the same title, in order: the first of that title after the
// last one matched. By their places in each scene's steps.
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

// Steps next to each other that only the newer scene takes are one stretch of New steps, to the next step it shares or its
// end: what it does that the app couldn't, or the earlier round didn't. On a Before that stopped short, everything from
// the step it couldn't take.
function newSteps(scene: Scene, pairs: Map<number, number>): Sighting[] {
  return runs(scene.steps.length, (i) => !pairs.has(i)).map(([first, last]) => {
    const titles = scene.steps.slice(first, last + 1).map((step) => step.title);
    const at = scene.steps[first]!.at;
    const until = scene.steps[last + 1]?.at ?? scene.length;
    return {
      id: idOf(`steps in ${scene.name}: ${titles.join(" · ")}`, "new steps"),
      // Named as far as a line can: past two, by the first and how many.
      words: titles.length > 2 ? `${titles.length} new steps, from ${quote(titles[0]!)}` : `New steps: ${list(titles.map(quote))}`,
      place: { scene: scene.name, at, ...(until > at && { until }) },
    };
  });
}

// Steps next to each other that only the earlier scene took are gone, where they were: at the next step both take.
function goneSteps(before: Scene, scene: Scene, pairs: Map<number, number>): Sighting[] {
  const kept = new Set(pairs.values());
  return runs(before.steps.length, (j) => !kept.has(j)).map(([first, last]) => {
    const titles = before.steps.slice(first, last + 1).map((step) => step.title);
    const next = [...pairs].find(([, j]) => j > last)?.[0];
    const at = next === undefined ? scene.length : scene.steps[next]!.at;
    return {
      id: idOf(`steps in ${scene.name}: ${titles.join(" · ")}`, "gone"),
      words: `${list(titles.map(quote))} ${titles.length > 1 ? "aren't steps" : "isn't a step"} here any more`,
      place: { scene: scene.name, at },
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
