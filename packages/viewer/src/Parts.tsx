// What's different from Before, a part of the app at a time: where the round's changes are, each part once however many
// scenes pass it, as a still of it now and, pointed at, as it was. A part is a page, named by its heading, or what's
// around every page, the sidebar or the top bar. A page Before never reached is new, and everything seen on it is that
// page: there's nothing it could be compared with.

import { useEffect, useState } from "react";
import type { Reading, Thing } from "@playthrough/page";
import { accountOf, type Change, type Place, type Review, type Round, type Scene } from "@playthrough/review";
import { picture, readings } from "./api.ts";
import { around, Picture, union, type Box, type Frame } from "./Picture.tsx";
import { CHIP } from "./Scene.tsx";

type Seen = { scene: Scene; step: number; reading: number; boxes: Box[]; screen: Reading["screen"] };
type Part = { name: string; isNew: boolean; changes: Change[]; seen: Seen[] };

// The stills are the shape of a recording on a computer's screen.
const SHAPE = 1.6;

export function Parts(props: { review: Review; round: Round; before: Round; changes: Change[]; onGo: (scene: string, step: number) => void }) {
  const { review, round, before } = props;
  const [read, setRead] = useState<{ now: Map<string, Reading[]>; then: Map<string, Reading[]> }>();
  useEffect(() => {
    let current = true;
    const all = (kept: Round) => Promise.all(kept.scenes.map(async (scene) => [scene.name, await readings(review.id, kept.number, scene.recording)] as const)).then((read) => new Map(read));
    Promise.all([all(round), all(before)]).then(([now, then]) => current && setRead({ now, then }));
    return () => void (current = false);
  }, [review.id, round, before]);
  if (!read) return null;
  const parts = partsOf(review, round, props.changes, read.now, read.then);
  if (!parts.length) return null;
  return (
    <section className="mt-9 phone:px-4">
      <p className="text-[13px] leading-5 text-soft">What's different from Before</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-6">
        {parts.map((part) => (
          <Still key={part.name} part={part} review={review} round={round} before={before} read={read.now} thenRead={read.then} onGo={props.onGo} />
        ))}
      </div>
    </section>
  );
}

function Still({ part, review, round, before, read, thenRead, onGo }: { part: Part; review: Review; round: Round; before: Round; read: Map<string, Reading[]>; thenRead: Map<string, Reading[]>; onGo: (scene: string, step: number) => void }) {
  // Seen on a computer's screen where it can be, so every still is the same shape; a new page where most is on it.
  const shaped = (seen: Seen) => Math.abs(seen.screen.width / seen.screen.height - SHAPE) < 0.05;
  const fullest = (seen: Seen) => (part.isNew ? (read.get(seen.scene.name)?.[seen.reading]?.things.length ?? 0) : 0);
  const seen = part.seen.toSorted((a, b) => Number(shaped(b)) - Number(shaped(a)) || fullest(b) - fullest(a))[0]!;
  const box = seen.boxes.length ? union(seen.boxes) : undefined;
  // A new page is framed on what's on it, the sidebar, the top bar and what's only there to be heard left out.
  const page = part.isNew ? read.get(seen.scene.name)?.[seen.reading] : undefined;
  const onPage = page?.things.filter((thing) => thing.role !== "box" && thing.box.width > 2 && thing.box.height > 2 && !aroundEvery(page, thing.box)).map((thing) => thing.box) ?? [];
  const frame: Frame | undefined = box ? around(box, seen.screen, SHAPE, 2.5) : onPage.length ? around(union(onPage), seen.screen, SHAPE) : undefined;
  const title = seen.scene.steps[seen.step]?.title;
  const then = before.scenes.find((scene) => scene.name === seen.scene.name);
  const thenReading = thenRead.get(seen.scene.name)?.findIndex((reading) => reading.step === title) ?? -1;
  const was = !part.isNew && then && thenReading >= 0 ? picture(review.id, before.number, then.recording, thenReading) : undefined;
  const outline = box && frame && {
    left: `${((box.x / seen.screen.width - frame.x) / frame.width) * 100}%`,
    top: `${((box.y / seen.screen.height - frame.y) / frame.height) * 100}%`,
    width: `${(box.width / seen.screen.width / frame.width) * 100}%`,
    height: `${(box.height / seen.screen.height / frame.height) * 100}%`,
  };
  const what = part.isNew ? "A new page" : part.changes.length > 1 ? `${part.changes[0]!.words}, and ${part.changes.length - 1} more` : part.changes[0]!.words;
  return (
    <button className="group flex w-[240px] flex-col text-left phone:w-[200px]" onClick={() => onGo(seen.scene.name, seen.step)}>
      <span className="relative block aspect-[1.6] overflow-hidden rounded-lg bg-paper shadow-frame transition-shadow duration-150 ease-calm group-hover:shadow-[0_0_0_1px_rgb(20_24_34/0.22)]">
        <Picture shot={{ src: picture(review.id, round.number, seen.scene.recording, seen.reading), frame }} />
        {outline && (
          <span className="pointer-events-none absolute -m-1 rounded-md shadow-[0_0_0_1.5px_rgb(43_46_53/0.55)] transition-opacity duration-150 ease-calm group-hover:opacity-0" style={{ ...outline, padding: 4, boxSizing: "content-box" }} />
        )}
        <span className="absolute inset-0 bg-paper opacity-0 transition-opacity duration-200 ease-calm group-hover:opacity-100">
          {was ? <Picture shot={{ src: was, frame }} /> : <span className="grid size-full place-items-center px-6 text-center text-[13px] text-soft">{part.isNew ? `Before, there was no ${part.name}` : "Before, the scene didn't get here"}</span>}
          <span className={CHIP}>Before</span>
        </span>
      </span>
      <span className="mt-2.5 flex items-center gap-2 text-[14px] leading-5 font-semibold">
        <i className="size-[7px] flex-none rotate-45 bg-fg" />
        {part.name}
      </span>
      <span className="mt-0.5 line-clamp-2 block pl-[15px] text-[13px] leading-5 text-soft">{what}</span>
    </button>
  );
}

// Each place a change is seen goes to the part of the app it's in, a part in the order the scenes first pass it.
function partsOf(review: Review, round: Round, changes: Change[], now: Map<string, Reading[]>, then: Map<string, Reading[]>): Part[] {
  const pagesBefore = new Set([...then.values()].flat().map(pageOf).filter(Boolean));
  const parts = new Map<string, Part>();
  for (const change of changes) {
    const account = accountOf(review, round.number, change.id);
    if (change.gone || (account && "notReal" in account)) continue;
    for (const on of change.seen) {
      const scene = round.scenes.find((scene) => scene.name === on.scene);
      if (!scene || on.at === undefined) continue;
      // New steps are where the first of them plays; anything else, at the step it was seen at the end of.
      const step = on.until === undefined ? Math.max(0, scene.steps.findIndex((_, i) => (scene.steps[i + 1]?.at ?? scene.length) >= on.at! - 0.05)) : Math.max(0, scene.steps.findIndex((step) => step.at >= on.at! - 0.01));
      const read = now.get(scene.name) ?? [];
      const index = read.findIndex((reading) => reading.step === scene.steps[step]?.title);
      const reading = read[index];
      const page = reading && pageOf(reading);
      if (!reading || !page) continue;
      const isNew = !pagesBefore.has(page);
      const boxes = isNew || on.until !== undefined ? [] : boxesOf(on, reading);
      const name = (boxes.length && aroundEvery(reading, union(boxes))) || page;
      const part = parts.get(name) ?? { name, isNew, changes: [], seen: [] };
      if (!part.changes.includes(change)) part.changes.push(change);
      part.seen.push({ scene, step, reading: index, boxes, screen: reading.screen });
      parts.set(name, part);
    }
  }
  return [...parts.values()];
}

// A page is known by its heading: the largest one that isn't in what's around every page.
function pageOf(reading: Reading): string | undefined {
  const headings = reading.things.filter((thing) => thing.role === "heading" && !aroundEvery(reading, thing.box) && (thing.words || thing.name));
  const largest = headings.toSorted((a, b) => parseFloat(b.look.size) - parseFloat(a.look.size) || a.box.y - b.box.y)[0];
  return largest && (largest.words || largest.name);
}

// What's around every page that a part of the page is in: a panel down the left, or one across the top.
function aroundEvery(reading: Reading, box: Box): string | undefined {
  const { width, height } = reading.screen;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  const holds = (thing: Thing) => thing.role === "box" && x >= thing.box.x && x <= thing.box.x + thing.box.width && y >= thing.box.y && y <= thing.box.y + thing.box.height;
  const panels = reading.things.filter(holds);
  if (panels.some(({ box }) => box.x <= width * 0.05 && box.height >= height * 0.6 && box.width <= width * 0.35)) return "The sidebar";
  if (panels.some(({ box }) => box.y <= height * 0.05 && box.width >= width * 0.6 && box.height <= height * 0.15)) return "The top bar";
}

// Where a change is on the screen a step was read on: each thing it's on, or the part of the page.
function boxesOf(on: Place, reading: Reading): Box[] {
  const { width, height } = reading.screen;
  return [
    ...[on.element, ...(on.alike ?? [])].flatMap((element) => (element?.node === undefined ? [] : reading.things.filter((thing) => thing.node === element.node).map((thing) => thing.box))),
    ...(on.box ? [{ x: on.box.x * width, y: on.box.y * height, width: on.box.width * width, height: on.box.height * height }] : []),
  ];
}
