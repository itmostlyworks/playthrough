// Each note the agent is asked to answer, pictured as it was made: the page its moment left at its time, or for one
// made in the app, the frame the person's page drew of it, with what it's on outlined in the notes' amber, or a ring on
// its spot. The agent looks before changing anything, so what “this” means is never a guess. A picture that can't be
// made never holds up the notes.

import { dirname, join } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { allNotes, madeInApp, SHARED, type InApp, type OnMoment, type Change } from "@playthrough/change";
import { inSight } from "@playthrough/page";
import { framesOf, writtenOn, type MomentFrame } from "./followed.ts";
import type { Frame } from "./frames.ts";
import type { Repo } from "./repo.ts";
import { frameOf, glimpsesOn, readingsOn } from "./reporter.ts";

type Area = { x: number; y: number; width: number; height: number };

// Kept in the hand-back that answers them, as the files a person would open: each note's id names its picture.
export async function pictureNotes(repo: Repo, change: Change, handBack: number, notes: string[]): Promise<Map<string, string>> {
  const shown = new Map<string, string>();
  // Opened for the first note there's a picture of, if it opens at all.
  let browser: Browser | undefined;
  try {
    for (const id of notes) {
      const on = allNotes(change).get(id)?.note.on;
      const found = on && (await (madeInApp(on) ? whereMade(repo, change, id, on) : whereSeen(repo, change, on)).catch(() => undefined));
      const picture = found?.picture;
      if (!found || !picture) continue;
      browser ??= await chromium.launch();
      const page = await browser.newPage({ viewport: { width: found.width, height: found.height } });
      try {
        await page.setContent(drawn(Buffer.from(picture).toString("base64"), found));
        await page.locator("img").evaluate((image: HTMLImageElement) => image.decode());
        const name = `notes/${id}.png`;
        await repo.changes.saveFile(change.id, handBack, name, await page.screenshot());
        shown.set(id, repo.show(join(dirname(repo.handBack(change.id, handBack)), "files", name)));
      } catch {
        // this one goes without, and the rest are still pictured
      } finally {
        await page.close();
      }
    }
  } catch {
    // whatever was pictured is kept, and the rest go without
  } finally {
    await browser?.close();
  }
  return shown;
}

// The picture of the frame the note was made on, on the hand-back it's on, and where on it: what it's on, or its spot
// or part of the screen. Made partway through, it's the frame pictured after the things done by then, as a picker open
// there may be closed by the moment's end. One on the whole moment was made at its end, so it's the page the moment
// left, with nothing marked.
async function whereSeen(repo: Repo, change: Change, on: OnMoment) {
  const moment = change.handBacks.find((handBack) => handBack.number === on.handBack)?.moments.find((moment) => moment.name === on.moment);
  if (!moment) return undefined;
  const frames = framesOf(moment, await readingsOn(repo.changes, change.id, on.handBack, moment), await glimpsesOn(repo.changes, change.id, on.handBack, moment));
  const file = (frame: MomentFrame) => repo.changes.file(change.id, on.handBack, frame.name ? frameOf(moment, frame.name) : frame.read.picture);
  if (on.at === undefined) {
    const end = frames.at(-1);
    return end && { picture: await file(end), width: end.read.screen.width, height: end.read.screen.height };
  }
  const at = on.at;
  const shown = on.element ? writtenOn(frames, on) : undefined;
  const frame = shown?.frame ?? frames.reduce<MomentFrame | undefined>((best, next) => (!best || Math.abs(next.read.at - at) < Math.abs(best.read.at - at) ? next : best), undefined);
  if (!frame || (on.element && !shown)) return undefined;
  const reading = frame.read;
  const { width, height } = reading.screen;
  // Scrolled out of sight inside a part of the page, or off the screen, it's not in the picture: nothing is outlined.
  const area: Area | undefined = shown ? (inSight(shown.thing, reading.screen) ? shown.thing.box : undefined) : on.box && { x: on.box.x * width, y: on.box.y * height, width: on.box.width * width, height: on.box.height * height };
  const spot = on.point && { x: on.point.x * width, y: on.point.y * height };
  return { picture: await file(frame), width, height, area, spot };
}

// One made in the app is on what was there, which no recording of the moment shows: the frame the person's page drew of
// it, as it shows the note, kept with what they did. Not drawn yet, it goes without.
// A guest's own page drew theirs apart, under shared/ (frames.ts): the person's page's drawing of it, where there is one,
// first.
async function whereMade(repo: Repo, change: Change, id: string, on: InApp) {
  const guests = allNotes(change).get(id)?.guest;
  const kept = (await repo.changes.branch(change.id, `frames/${id}.json`)) ?? (guests ? await repo.changes.branch(change.id, `frames/${SHARED}${id}.json`) : undefined);
  if (!kept) return undefined;
  const frame: Frame = JSON.parse(Buffer.from(kept).toString("utf8"));
  const { width, height } = frame.screen;
  const share = frame.box ?? on.box;
  const area: Area | undefined = share && { x: share.x * width, y: share.y * height, width: share.width * width, height: share.height * height };
  const spot = on.point && { x: on.point.x * width, y: on.point.y * height };
  return { picture: await repo.changes.branch(change.id, frame.picture.replace(/^branches\//, "")), width, height, area, spot };
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
