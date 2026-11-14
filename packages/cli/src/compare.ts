// A hand-back compared with each hand-back before it, moment by moment: each page a moment left, read and pictured,
// against the same moment's in the earlier hand-back. A moment it doesn't hand back any more is gone. The same finding in
// several moments, or at several times, is one finding, seen in each moment where it first shows there.

import { chromium, type Page } from "@playwright/test";
import { quote, Refused, type Finding, type Comparison, type Moment, type Place, type Changes } from "@playthrough/change";
import { findingsAt, idOf } from "./findings.ts";
import { HERE, picturesAt } from "./pictures.ts";
import type { Glimpse, Reading } from "@playthrough/page";
import { glimpsesOf, readingsOf } from "./reporter.ts";

// A hand-back as recorded: its moments, what was read of each where its file read it, with its picture, and what was
// glimpsed after each thing done, in a hand-back recorded since Playthrough glimpsed.
export type Recorded = { number: number; moments: Moment[]; readings: (moment: Moment) => Promise<Reading[]>; glimpses?: (moment: Moment) => Promise<Glimpse[]>; picture: (name: string) => Promise<Buffer> };

// The hand-back being worked on, compared with each hand-back before it, from what's kept of each.
export async function compareWithEarlier(changes: Changes, id: string, number: number, moments: Moment[]): Promise<Comparison[]> {
  const change = await changes.get(id);
  const earlier = change.handBacks.filter((handBack) => handBack.number < number);
  if (!earlier.length) return [];
  const unsteady = unsteadyIn([...earlier.flatMap((handBack) => handBack.moments), ...moments]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const now = kept(changes, id, number, moments);
    const comparisons: Comparison[] = [];
    for (const handBack of earlier) comparisons.push(await compare(page, kept(changes, id, handBack.number, handBack.moments), now, unsteady));
    return comparisons;
  } finally {
    await browser.close();
  }
}

// The same moments recorded twice on the same app: whatever differs between the two changes by itself, like a time the
// server stamps, so it's left out of every comparison from then on, in every moment: each change as the ids of what it
// stands for, so the email that changes in a row of the members table is left out, and not the table.
export async function findingsByThemselves(first: Recorded, second: Recorded): Promise<(Finding & { pieces: string[] })[]> {
  const browser = await chromium.launch();
  try {
    const { findings, pieces } = await comparing(await browser.newPage(), first, second);
    return findings.map((finding) => ({ ...finding, pieces: [...pieces.get(finding.id)!] }));
  } finally {
    await browser.close();
  }
}

function kept(changes: Changes, id: string, number: number, moments: Moment[]): Recorded {
  const file = async (name: string) => {
    const bytes = await changes.file(id, number, name);
    if (!bytes)
      throw new Refused([`Hand-back ${number} has no ${name}, so it can't be compared: it was recorded before Playthrough read each step. Mark its moments again.`]);
    return Buffer.from(bytes);
  };
  const glimpses = async (moment: Moment) => {
    const bytes = await changes.file(id, number, glimpsesOf(moment));
    return bytes ? JSON.parse(Buffer.from(bytes).toString()) : [];
  };
  return { number, moments, readings: async (moment) => JSON.parse((await file(readingsOf(moment))).toString()), glimpses, picture: file };
}

export async function compare(page: Page, earlier: Recorded, handBack: Recorded, unsteady: Unsteady = () => new Set()): Promise<Comparison> {
  const { pieces: _, ...comparison } = await comparing(page, earlier, handBack, unsteady);
  return comparison;
}

// And what each change stands for, by its id.
// What changes by itself in a moment, by its name.
type Unsteady = (moment: string) => Set<string>;

// What changes by itself in one moment, like a time the server stamps, changes by itself in every moment it's seen in; a part
// of a picture known only by where it is, only in its own moment.
export function unsteadyIn(moments: Moment[]): Unsteady {
  const everywhere = moments.flatMap((moment) => (moment.unsteady ?? []).filter((piece) => !piece.startsWith(HERE)));
  const here = (name: string) => moments.filter((moment) => moment.name === name).flatMap((moment) => (moment.unsteady ?? []).filter((piece) => piece.startsWith(HERE)).map((piece) => piece.slice(HERE.length)));
  return (name) => new Set([...everywhere, ...here(name)]);
}

async function comparing(page: Page, earlier: Recorded, handBack: Recorded, unsteady: Unsteady = () => new Set()): Promise<Comparison & { pieces: Map<string, Set<string>> }> {
  const findings = new Map<string, Finding>();
  const pieces = new Map<string, Set<string>>();
  const see = ({ id, words, place, of = [id], reworded, gone, pictureOnly }: Sighting) => {
    if (unsteady(place.moment).has(id)) return;
    const finding = findings.get(id);
    for (const piece of of) (pieces.get(id) ?? pieces.set(id, new Set()).get(id)!).add(piece);
    if (!finding) findings.set(id, { id, words, seen: [place], ...(reworded && { reworded }), ...(gone && { gone }), ...(pictureOnly && { pictureOnly }) });
    else {
      if (!finding.seen.some((seen) => seen.moment === place.moment)) finding.seen.push(place);
      // Read anywhere, it's a finding Playthrough can name.
      if (!pictureOnly) delete finding.pictureOnly;
    }
  };
  for (const moment of handBack.moments) {
    // A moment the earlier hand-back didn't have has nothing to be compared with there: it's new to whoever looked then.
    const before = earlier.moments.find((kept) => kept.name === moment.name);
    if (before) for (const sighting of await compareMoment(page, earlier, before, handBack, moment, unsteady(moment.name))) see(sighting);
  }
  // A moment the agent took away is a finding too: what it showed isn't shown any more.
  for (const gone of earlier.moments.filter((moment) => !handBack.moments.some((kept) => kept.name === moment.name)))
    see({ id: idOf(`moment:${gone.name}`, "gone"), words: `${quote(gone.name)} isn't a moment any more`, place: { moment: gone.name } });
  return { handBack: handBack.number, since: earlier.number, findings: [...findings.values()], pieces };
}

// A finding where it's seen in one moment, what it stands for, and whether only the pictures show it there.
type Sighting = { id: string; words: string; place: Place; of?: string[]; reworded?: string; gone?: true; pictureOnly?: true; offScreen?: true };

async function compareMoment(page: Page, earlier: Recorded, before: Moment, handBack: Recorded, moment: Moment, unsteady: Set<string>): Promise<Sighting[]> {
  const sightings: Sighting[] = [];
  // Each page the moment left, read where its file read it, against the earlier one's read there, and what each hand-back
  // glimpsed on the way.
  const then = await earlier.readings(before);
  const glimpsed = { then: (await earlier.glimpses?.(before)) ?? [], now: (await handBack.glimpses?.(moment)) ?? [] };
  for (const reading of await handBack.readings(moment)) {
    const was = then.find((kept) => kept.step === reading.step);
    if (!was) continue;
    const pictures = { then: await earlier.picture(was.picture), now: await handBack.picture(reading.picture) };
    const shown = { then: glimpsed.then.filter((glimpse) => glimpse.step === was.step), now: glimpsed.now.filter((glimpse) => glimpse.step === reading.step) };
    const pictured = await picturesAt(page, was, reading, pictures);
    // Top to bottom, as the screen reads, whether read or pictured.
    for (const found of [...findingsAt(was, reading, unsteady, shown), ...pictured].sort((a, b) => (a.top ?? 0) - (b.top ?? 0))) {
      const on = found.element ? { element: found.element, ...(found.alike && { alike: found.alike }) } : found.box ? { box: found.box } : {};
      sightings.push({ id: found.id, words: found.words, place: { moment: moment.name, at: reading.at, ...on }, of: found.pieces, ...(found.reworded && { reworded: found.reworded }), ...(found.gone && { gone: true as const }), ...(pictured.includes(found) && { pictureOnly: true as const }), ...(found.offScreen && { offScreen: true as const }) });
    }
  }
  // A finding is seen where the person watching meets it: the first time it's on the screen, not the first the page has
  // it, so a page that's read top to bottom shows its findings a screen at a time. One the moment never brings into view
  // keeps the first time it's there.
  return sightings.sort((a, b) => Number(!!a.offScreen) - Number(!!b.offScreen) || (a.place.at ?? 0) - (b.place.at ?? 0));
}
