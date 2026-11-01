// Each note the agent is asked to answer, pictured as it was last seen: the page its step left at its moment, with what
// it's on outlined in the notes' amber, or a ring on its spot. The agent looks before changing anything, so what “this”
// means is never a guess. A picture that can't be made never holds up the notes.

import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";
import { shownAt } from "@playthrough/page";
import { allNotes, lastSeen, type Review } from "@playthrough/review";
import type { Repo } from "./repo.ts";
import { readingsOn } from "./reporter.ts";

type Area = { x: number; y: number; width: number; height: number };

// Kept in the round that answers them, as the files a person would open: each note's id names its picture.
export async function pictureNotes(repo: Repo, review: Review, round: number, notes: string[]): Promise<Map<string, string>> {
  const shown = new Map<string, string>();
  const browser = await chromium.launch();
  try {
    for (const id of notes) {
      // One in the app is on what was there, not on the recording.
      if (allNotes(review).get(id)?.note.on?.app) continue;
      const found = await whereSeen(repo, review, id, round).catch(() => undefined);
      if (!found) continue;
      const page = await browser.newPage({ viewport: { width: found.width, height: found.height } });
      const picture = Buffer.from((await repo.reviews.file(review.id, found.round, found.picture))!).toString("base64");
      await page.setContent(drawn(picture, found));
      await page.locator("img").evaluate((image: HTMLImageElement) => image.decode());
      const name = `notes/${id}.png`;
      await repo.reviews.saveFile(review.id, round, name, await page.screenshot());
      await page.close();
      shown.set(id, repo.show(join(dirname(repo.round(review.id, round)), "files", name)));
    }
  } catch {
    // whatever was pictured is kept, and the rest go without
  } finally {
    await browser.close();
  }
  return shown;
}

// The picture of the step the note was last seen at, and where on it: what it's on, or its spot or part of the screen.
// One on the whole flow was made at its end, so it's the page the flow left, with nothing marked.
async function whereSeen(repo: Repo, review: Review, id: string, before: number) {
  const seen = lastSeen(review, id, before);
  const on = seen?.on;
  const flow = seen && review.rounds.find((round) => round.number === seen.round)?.flows.find((flow) => flow.name === on!.flow);
  if (!seen || !on || !flow) return undefined;
  const readings = await readingsOn(repo.reviews, review.id, seen.round, flow);
  if (on.at === undefined) {
    const end = readings.at(-1);
    return end && { round: seen.round, picture: end.picture, width: end.screen.width, height: end.screen.height };
  }
  const at = on.at;
  const shown = on.element ? shownAt(readings, on.element, at) : undefined;
  const reading = shown?.reading ?? readings.reduce<(typeof readings)[number] | undefined>((best, next) => (!best || Math.abs(next.at - at) < Math.abs(best.at - at) ? next : best), undefined);
  if (!reading || (on.element && !shown)) return undefined;
  const { width, height } = reading.screen;
  const area: Area | undefined = shown?.thing.box ?? (on.box && { x: on.box.x * width, y: on.box.y * height, width: on.box.width * width, height: on.box.height * height });
  const spot = on.point && { x: on.point.x * width, y: on.point.y * height };
  return { round: seen.round, picture: reading.picture, width, height, area, spot };
}

function drawn(picture: string, { area, spot }: { area?: Area; spot?: { x: number; y: number } }): string {
  const amber = "#d9a23a";
  const mark = area
    ? `<div style="position:absolute;left:${area.x - 6}px;top:${area.y - 6}px;width:${area.width + 12}px;height:${area.height + 12}px;border:3px solid ${amber};border-radius:7px;box-sizing:border-box"></div>`
    : spot
      ? `<div style="position:absolute;left:${spot.x - 14}px;top:${spot.y - 14}px;width:28px;height:28px;border:3px solid ${amber};border-radius:50%;box-sizing:border-box;background:rgba(217,162,58,.18)"></div>`
      : "";
  return `<body style="margin:0"><img src="data:image/png;base64,${picture}" style="display:block">${mark}</body>`;
}
