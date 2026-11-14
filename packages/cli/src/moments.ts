// Moments: the agent says "here" in its browser, and Playthrough keeps the way there, runs it again from a fresh start to
// prove it lands, and hands what it kept back to the person; runs every one again on the next version, and says what's
// different; and brings back what the person says on each.
//
//   playthrough moment "<what's there>" ["<what it's about>"] [--last N]
//                                       keeps where the browser is, and the way there, if it lands run again: the
//                                       moment is what was done since arriving on this page, or the last N things
//   playthrough drop "<moment>"         a moment that's no longer wanted: not run again, or handed back
//   playthrough again                   every moment again, on the code as it is now: the same, different, or not reached
//   playthrough reply <note> "<words>"  answers a note
//   playthrough wait                    hands back, and waits for what the person says
//
// What's on disk is what the person's page reads: each moment's way there is a file in the change's scenes folder, and
// what's kept of it, its recording and what it's about, is in the round being worked on, until it's handed back.

import { chromium, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Glimpse, Reading } from "@playthrough/page";
import { allNotes, conversation, list, madeInApp, MOST_SHOWN, notesToAnswer, saidDone, quote, Refused, roundInProgress, startOf, toAccountFor, type Finding, type Review, type Round, type Scene } from "@playthrough/review";
import { agent } from "./agent.ts";
import { browserFile, stopBrowser, type Browser } from "./as.ts";
import { changeHere, momentNamed, momentsOf } from "./change.ts";
import { compareWithEarlier } from "./compare.ts";
import { everyCopy, machine } from "./machine.ts";
import { pictureNotes } from "./noted.ts";
import { openAlready, PORT } from "./open.ts";
import { readPage, unhovered } from "./read.ts";
import type { Repo } from "./repo.ts";
import { frameOf, glimpsesOf, readingsOf, type Failed } from "./reporter.ts";
import { markUnsteady, recorder, runOnce } from "./scenes.ts";
import { seenChanging, SQUARE, squaresOf, type Square } from "./seen.ts";
import { setupIn } from "./setup.ts";
import { listening } from "./wait.ts";
import { aboutSaid, ENDED, fileOf, sceneOf, TIMED, whatDiffers, type About, type Done } from "./way.ts";

// What a moment says is what's there, short enough to sit under a picture of it: who and where, the person sees.
const MOST_WORDS = 10;

export async function moment(repo: Repo, words: string, named?: string, last?: number) {
  const id = await changeHere(repo);
  if (!existsSync(browserFile(repo))) throw new Refused(["There's no browser to keep a moment from. Start one, in the background: playthrough as <person>"]);
  const browser: Browser = JSON.parse(readFileSync(browserFile(repo), "utf8"));
  const counted = words.trim().split(/\s+/).length;
  if (counted > MOST_WORDS) throw new Refused([`That's ${counted} words. Say only what's there, in under eight (“Cards now say WEB-1 to WEB-5”): the person already sees who it is and where.`]);
  const people = Object.keys((await setupIn(repo.setup)).people ?? {}).filter((name) => new RegExp(`(^|\\W)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`, "i").test(words));
  if (people.length) throw new Refused([`The person sees who it is beside the moment: leave ${list(people.map(quote))} out of its words, and say only what's there.`]);
  const markAgain = `playthrough moment ${JSON.stringify(words)}${named ? ` ${JSON.stringify(named)}` : ""}`;

  // Where the agent is now, as the page is read at a step's end.
  const open = await chromium.connectOverCDP(`http://localhost:${browser.debugging}`).catch(() => {
    throw new Refused([`The browser from playthrough as ${browser.person} isn't running any more. Start it again, in the background.`]);
  });
  const here = open
    .contexts()
    .flatMap((context) => context.pages())
    .filter((page) => page.url().startsWith(browser.url))
    .at(-1);
  if (!here) throw new Refused([`No page in the browser is on the app (${browser.url}).`]);
  const there = { url: here.url(), reading: await readAt(here), scrolled: await here.evaluate(() => ({ x: scrollX, y: scrollY })), ...(await aboutOn(here, words, named)) };
  await open.close();
  if (named && !there.about)
    throw new Refused([`Nothing on the page is called ${quote(named)}, as a button, a field, a link or a heading is, or says it.${there.near.length ? ` Near it: ${list(there.near.map(quote))}.` : ""} Say it as the page names it, or leave it out.`]);

  // Where the moment starts: what was done since arriving on this page, or since the moment before; or the last N things.
  const done = browser.did;
  const since = markedSince(repo, browser);
  const actions = done.flatMap((one, i) => (one.does === "goto" ? [] : [i]));
  if (last !== undefined && last > actions.length)
    throw new Refused([`Only ${actions.length} thing${actions.length === 1 ? " was" : "s were"} done in this browser: ${markAgain} --last ${actions.length} at most.`]);
  const start = last !== undefined ? { at: last ? actions.at(-last)! : done.length } : startOf(onTheWay(done, new URL(there.url).pathname), since);
  if ("unclear" in start && start.unclear) throw new Refused(unclear(done, start.at, start.unclear, markAgain));
  const from = start.at;

  // The way there, run from a fresh start as the same person and recorded: tried in a folder of its own, and kept only
  // if it lands, in place of one with the same words.
  const review = await repo.reviews.get(id);
  const file = fileOf(words);
  const trying = join(repo.root, ".playthrough", id, "trying");
  rmSync(trying, { recursive: true, force: true });
  mkdirSync(trying, { recursive: true });
  writeFileSync(join(trying, "package.json"), `{ "type": "module" }\n`);
  const way = { words, person: browser.person, did: done, setup: browser.setup, about: there.about, scrolled: there.scrolled, from };
  writeFileSync(join(trying, file), sceneOf({ ...way, tried: true }));
  console.log(`Running the way there again, from a fresh start, as ${browser.person}…`);
  const ran = await runOnce({ scenes: trying, only: [words], app: await repo.app(), root: repo.root, recorder, started: review.started });
  const notKept = (why: string) => {
    rmSync(trying, { recursive: true, force: true });
    return new Refused([`Not kept: run again from a fresh start, ${why}`, "Tell the person only about moments that were kept. Fix what's said, or get there another way, and mark it again."]);
  };
  const [recorded] = ran.recorded;
  const [failed] = ran.failed;
  if (!recorded) {
    if (there.about && failed?.why?.includes("expect(")) throw notKept(`it got there, but ${aboutSaid(there.about)} wasn't so: ${failed.why}`);
    throw notKept(`it didn't get there${failed?.why ? `: ${failed.why}` : "."}`);
  }
  const readings: Reading[] = JSON.parse(recorded.files.find((one) => one.name === readingsOf(recorded.scene))!.bytes.toString());
  const ended: string = JSON.parse(readFileSync(join(trying, ENDED), "utf8")).url;
  const { differ, timely } = whatDiffers(there, { url: ended, reading: readings.at(-1)! });
  if (differ.length)
    throw notKept(
      `it ended somewhere else. What differs from where you are:\n${differ.map((one) => `  ${one}`).join("\n")}${differ.some((one) => one.startsWith("only where you are")) ? "\nIf what's only where you are comes a while after what you did, name it as the moment's thing: the moment waits for it." : ""}`,
    );

  // Run once more, what changes by itself, as a caret blinking or a time the server stamps, is known, and left out
  // whenever it's compared again.
  console.log("Running it once more, to see what changes by itself…");
  const twice = await runOnce({ scenes: trying, only: [words], app: await repo.app(), root: repo.root, recorder, started: review.started });
  if (!twice.recorded.length) throw notKept(`it got there once, but not a second time${twice.failed[0]?.why ? `: ${twice.failed[0].why}` : ""}. Make what it starts from the same each time, in playthrough/setup.ts.`);
  await markUnsteady(roundInProgress(review), ran.recorded, twice.recorded);
  // Its first and last frames, in both runs, for whether it changes anything you can see.
  const framesOf = ({ scene, files }: (typeof ran.recorded)[number]) => {
    const file = (name: string) => files.find((one) => one.name === name)?.bytes;
    const end: Reading | undefined = JSON.parse(file(readingsOf(scene))?.toString() ?? "[]").at(-1);
    const [first, later, last, held] = [file(frameOf(scene, "first")), file(frameOf(scene, "a-beat-later")), end && file(end.picture), file(frameOf(scene, "held"))];
    const after = files.filter((one) => /\/after-\d+\.png$/.test(one.name)).map((one) => one.bytes);
    return first && later && last ? { first, later, after, last, held } : undefined;
  };
  const frames = [framesOf(recorded), framesOf(twice.recorded[0]!)];
  const opening: Glimpse | undefined = JSON.parse(recorded.files.find((one) => one.name === glimpsesOf(recorded.scene))?.bytes.toString() ?? "[]")[0];
  const timed = (opening?.things ?? []).filter((thing) => TIMED.test(thing.name)).flatMap((thing) => squaresOf(thing.box));
  const seen = frames[0] && frames[1] ? await seenChanging([frames[0], frames[1]], timed).catch(() => undefined) : undefined;

  mkdirSync(repo.scenes(id), { recursive: true });
  writeFileSync(join(repo.scenes(id), "package.json"), `{ "type": "module" }\n`);
  // Marked again with the same words, it's the same moment, in whatever file it was kept before.
  for (const one of momentsOf(repo, id)) if (one.words === words && one.file !== join(repo.scenes(id), file)) rmSync(one.file);
  writeFileSync(join(repo.scenes(id), file), sceneOf(way));
  rmSync(trying, { recursive: true, force: true });
  const acted = lastActedOn(done, readings.at(-1)!);
  const scene: Scene = { ...recorded.scene, ...(there.about && { about: { role: there.about.role, name: there.about.name } }), ...(acted && { acted }) };
  const number = roundInProgress(review);
  for (const { name, bytes } of recorded.files) await repo.reviews.saveFile(id, number, name, bytes);
  const kept = review.rounds.find((round) => round.number === number);
  const scenes = kept?.scenes.some((one) => one.name === scene.name) ? kept.scenes.map((one) => (one.name === scene.name ? scene : one)) : [...(kept?.scenes ?? []), scene];
  await repo.reviews.saveRound(id, { number, by: agent(kept?.by), scenes, replies: kept?.replies ?? [] });
  writeFileSync(markedFile(repo), JSON.stringify({ began: browser.began, at: done.length }));
  // Marked again after running them all again, it's compared again with what the person saw, with the rest.
  if (review.comparisons.some((comparison) => comparison.round === number)) await compareAll(repo, id, number, scenes);

  // What the moment shows, read back: the agent reads this, not the scene file.
  const shownAt = (name: string) => repo.show(join(dirname(repo.round(id, number)), "files", name));
  const glimpses: Glimpse[] = JSON.parse(recorded.files.find((one) => one.name === glimpsesOf(recorded.scene))?.bytes.toString() ?? "[]");
  const shown = done.slice(from).filter((one) => one.does !== "goto");
  const before = done.slice(0, from).filter((one) => !(one.does === "goto" && one.led));
  const still = !shown.length;
  const length = scene.length - scene.from;
  console.log(`\nKept ${/[“"]/.test(words) ? words : quote(words)}${still ? ", a still: nothing happens in it" : `, ${length.toFixed(1)} s`}${there.about ? `, about the ${aboutSaid(there.about)}` : ""}.`);
  if (!still) console.log(`  shows    ${shown.map(saidOf).join(" → ")}`);
  if (before.length) console.log(`  before   ${before.length > 3 ? "… " : ""}${before.slice(-3).map(saidOf).join(" → ")}   (kept, never shown)`);
  if (!still) console.log(`  first    ${shownAt(frameOf(recorded.scene, "first"))}`);
  console.log(`  ${still ? "picture" : "last   "}  ${shownAt(readings.at(-1)!.picture)}`);
  if (!still && seen && !seen.changed.length) console.log(`  Nothing you can see changed in it. Fine if that's the point; if not, look at its first and last frames.`);
  const moving = seen ? movingNamed(seen.moving, glimpses[0]) : [];
  if (moving.length) {
    console.log(`  Moves by itself, and isn't counted: ${list(moving.map(quote))}. If it's the app still arriving, it plays in the moment too.`);
  }
  if (seen?.unsettled.length) console.log(`  It was still changing when it ended. If what it shows comes late, name that as the moment's thing: the moment waits for it.`);
  if (timely.length) console.log(`  Left out of where it lands, as it changes with time: ${list(timely.map(quote))}.`);
  console.log(`Not what you meant? Mark it again with --last N, the last N things done (0 is a still).`);
}

// What the agent did, as the rule for where a moment starts reads it: what took it to another page went, by the address
// each thing was done at, a page loaded after it that it led to, or where the browser is now. A page gone to directly
// is arriving of its own.
function onTheWay(done: Done[], here: string) {
  return done.map((one, i) => {
    if (one.does === "goto") return { does: one.does, went: !one.led || done[i - 1]?.does === "goto" || i === 0 };
    const next = done[i + 1];
    const went = !!one.address && (next ? (next.does === "goto" ? !!next.led : !!next.address && next.address !== one.address) : here !== one.address);
    return { does: one.does, ...(one.role && { role: one.role }), went };
  });
}

// The moment before, marked in this browser since it started: what's done after it is this one's.
const markedFile = (repo: Repo) => join(repo.root, ".playthrough", "browser-marked.json");
function markedSince(repo: Repo, browser: Browser): number {
  try {
    const marked = JSON.parse(readFileSync(markedFile(repo), "utf8"));
    return marked.began === browser.began ? Math.min(marked.at, browser.did.length) : 0;
  } catch {
    return 0;
  }
}

// Where it can't be told where a moment starts: the things done, counting back, for the agent to say how many it shows.
function unclear(done: Done[], at: number, why: "long" | "brought", again: string): string[] {
  const actions = done.filter((one) => one.does !== "goto");
  const counted = actions.slice(-Math.max(MOST_SHOWN + 2, done.slice(at).filter((one) => one.does !== "goto").length + 1)).toReversed();
  return [
    why === "long"
      ? `Not kept: it would show ${done.slice(at).filter((one) => one.does !== "goto").length} things done since you arrived on this page, and a moment is one thing happening. The last things done, counting back:`
      : `Not kept: a button brought you to this page, and nothing's been done here since. Is the moment pressing it (1), or what's here, a still (0)? The last things done, counting back:`,
    ...counted.map((one, i) => `  ${String(i + 1).padStart(2)}  ${saidOf(one)}`),
    `Mark it again with how many of them it shows: ${again} --last N`,
  ];
}

// A thing done, as a person would say it: “type “BS-WEB” in Card prefix”, “click Update”.
function saidOf(one: Done): string {
  const on = one.name ?? one.text ?? one.what ?? "";
  const into = on ? ` in ${on}` : one.role ? ` in a ${one.role} with no name` : "";
  if (one.does === "goto") return `go to ${one.with}`;
  if (one.does === "fill" || one.does === "type") return `type ${quote(one.with ?? "")}${into}`;
  if (one.does === "selectOption") return `choose ${quote(one.with ?? "")}${into}`;
  if (one.does === "press") return `press ${one.with}${into}`;
  return `${one.button === "right" ? "right-click" : "click"} ${on || (one.role ? `a ${one.role} with no name` : "the page")}`;
}

// What moves by itself, said by the smallest things named there in the moment's first frame, a few at most.
function movingNamed(moving: Square[], first: Glimpse | undefined): string[] {
  const touches = ({ box }: Glimpse["things"][number]) => moving.some(({ x, y }) => box.x < (x + 1) * SQUARE && box.x + box.width > x * SQUARE && box.y < (y + 1) * SQUARE && box.y + box.height > y * SQUARE);
  const named = (first?.things ?? []).filter((thing) => thing.name && !TIMED.test(thing.name) && touches(thing)).sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height);
  return [...new Set(named.map((thing) => thing.name))].slice(0, 3);
}

// The last thing done something to on the way that's still on the page at its end, as the page's reading has it (a
// table's cell is read as its words): where a moment names nothing, its still closes in there, as that's where the
// person's eye would be.
function lastActedOn(did: Done[], end: Reading): { role: string; name: string } | undefined {
  for (const { role, name } of did.toReversed()) {
    const named = name ? end.things.filter((thing) => thing.name === name) : [];
    const thing = named.find((one) => one.role === role) ?? named[0];
    if (thing) return { role: thing.role, name: thing.name };
  }
}

// The page as a step's end reads it, with nothing pointed at, and the picture left out.
async function readAt(page: Page): Promise<Reading> {
  await page.waitForLoadState().catch(() => {});
  await page.waitForTimeout(500);
  return { step: "here", at: 0, picture: "", ...(await unhovered(page, () => readPage(page))) };
}

// What the moment is about: the thing named, by its whole name, or else the smallest that holds those words, as a card
// holds its title; or, named nothing, the thing whose name its words say, the longest, a field before a heading, of two
// words or more: one word, as a person's name, says too little. And where nothing's found, what's near what was said.
async function aboutOn(page: Page, words: string, named?: string): Promise<{ about?: About; near: string[] }> {
  return page.evaluate(
    ({ words, named }) => {
      const nameOf = (window as any).__playthroughNamed;
      if (!nameOf) return { near: [] };
      const said = (named ?? words).toLowerCase().trim();
      const hovering = (window as any).__playthroughHovering;
      hovering(false);
      const all = [...document.querySelectorAll("a, button, input, select, textarea, h1, h2, h3, h4, [role]")].map((element) => ({ element, ...nameOf(element) })).filter((one) => one.role && one.name);
      hovering(true);
      const lower = (one: { name: string }) => one.name.toLowerCase();
      // A field or a control before a heading of the same name: what can be changed is what's checked.
      const headingLast = (a: { role: string }, b: { role: string }) => Number(a.role === "heading") - Number(b.role === "heading");
      const found = named
        ? (all.filter((one) => lower(one) === said).sort(headingLast)[0] ?? all.filter((one) => lower(one).includes(said)).sort((a, b) => a.name.length - b.name.length || headingLast(a, b))[0])
        : all.filter((one) => /\s/.test(one.name) && said.includes(lower(one))).sort((a, b) => b.name.length - a.name.length || headingLast(a, b))[0];
      const near = [...new Set(all.filter((one) => said.split(/\s+/).some((word) => word.length > 3 && lower(one).includes(word))).map((one) => one.name))].slice(0, 5);
      // Named, and no button, field or heading is called that: words on the page that say it, the innermost, as a
      // field's own words, which the page names nothing.
      const own = (element: Element) => ((element as HTMLElement).innerText ?? "").trim().replace(/\s+/g, " ");
      const saying = named && !found ? [...document.querySelectorAll("body *")].filter((element) => own(element).toLowerCase() === said && ![...element.children].some((child) => own(child).toLowerCase() === said)) : [];
      // Of several the same, as a Docs link in the header and another in the footer, the one in view, by which of them
      // it is.
      const inView = (element: Element) => {
        const box = element.getBoundingClientRect();
        return box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
      };
      const which = (alike: Element[], first: Element) => {
        const element = alike.find(inView) ?? first;
        return { element, ...(alike.length > 1 && { nth: alike.indexOf(element) }) };
      };
      if (saying.length) {
        const { element, nth } = which(saying, saying[0]!);
        return { near, about: { role: "text", name: own(element), disabled: false, ...(nth !== undefined && { nth }) } };
      }
      if (!found) return { near };
      const { element: chosen, nth } = which(
        all.filter((one) => one.role === found.role && one.name === found.name).map((one) => one.element),
        found.element,
      );
      const element = chosen as HTMLInputElement;
      const field = "value" in element && ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
      return {
        near,
        about: {
          role: found.role,
          name: found.name,
          ...(nth !== undefined && { nth }),
          ...(field && { value: element.value }),
          disabled: element.matches(":disabled") || element.getAttribute("aria-disabled") === "true" || element.readOnly === true,
          ...(["checkbox", "radio"].includes(element.type) && { checked: element.checked }),
        },
      };
    },
    { words, named },
  );
}

// A moment no longer wanted goes from what's run again and handed back; the person sees it as last handed back until
// the next hand-back.
export async function drop(repo: Repo, words: string) {
  const id = await changeHere(repo);
  const moment = momentNamed(repo, id, words);
  const review = await repo.reviews.get(id);
  // A moment a note is on is where the person sees what was done about it: dropped, they'd have nowhere to look, unless a
  // moment marked since the note came shows it.
  const on = notesOn(review, moment.words);
  if (on.length && !markedSinceNotes(repo, review, on, moment.words).length)
    throw new Refused([
      `${on.length > 1 ? `Notes ${list(on)} are` : `Note ${on[0]} is`} on ${quote(moment.words)}: the person sees what you did about ${on.length > 1 ? "them" : "it"} in a moment, not only in your answer. Mark one that shows it first, a still where it was if it's gone (playthrough moment "<what's there now>"); then drop this one, if what it showed no longer exists.`,
    ]);
  rmSync(moment.file);
  const last = review.rounds.at(-1);
  if (last && !last.finished) await repo.reviews.saveRound(id, { ...last, scenes: last.scenes.filter((scene) => scene.name !== moment.words) });
  console.log(`Dropped ${quote(moment.words)}: it isn't run again, or handed back.`);
}

// The notes waiting for an answer on a moment.
function notesOn(review: Review, moment: string): string[] {
  const notes = allNotes(review);
  return notesToAnswer(review, roundInProgress(review)).filter((id) => notes.get(id)?.note.on?.scene === moment);
}

// The moments marked since the person's notes reached the agent, other than the one they're on: where what was done about
// them can be seen.
function markedSinceNotes(repo: Repo, review: Review, notes: string[], besides?: string): string[] {
  const sent = review.sends.filter((send) => send.notes.some((note) => notes.includes(note.id)));
  const reached = Math.max(0, ...review.taken.filter((taken) => sent.some((send) => send.id === taken.send)).map((taken) => Date.parse(taken.at)));
  return momentsOf(repo, review.id)
    .filter((moment) => moment.words !== besides && statSync(moment.file).mtimeMs > reached)
    .map((moment) => moment.words);
}

// Every moment again, on the code as it is now, by its way there: recorded, compared with what was last handed back, and
// said, each as the same, different, or not reached.
export async function again(repo: Repo) {
  const id = await changeHere(repo);
  const review = await repo.reviews.get(id);
  const handedBack = review.rounds.findLast((round) => round.finished);
  if (!handedBack)
    throw new Refused(["Nothing's been handed back yet, so there's nothing to run them again against: each moment was run again from a fresh start as you marked it. Hand back with playthrough wait, in the background."]);
  const moments = momentsOf(repo, id);
  if (!moments.length) throw new Refused(["There are no moments to run again. Mark one: playthrough as <person>, then playthrough moment \"<what's there>\""]);
  const number = roundInProgress(review);
  console.log(`Running ${moments.length > 1 ? `the ${moments.length} moments` : "the moment"} again, on the code as it is now…`);
  const ran = await runOnce({ scenes: repo.scenes(id), app: await repo.app(), root: repo.root, recorder, started: review.started });
  for (const { files } of ran.recorded) for (const { name, bytes } of files) await repo.reviews.saveFile(id, number, name, bytes);
  // In the order they were handed back, what each is about as it was marked; one new since, after them.
  const order = (scene: Scene) => handedBack.scenes.findIndex((one) => one.name === scene.name) >>> 0;
  const marked = (name: string) => review.rounds.findLast((round) => round.scenes.some((scene) => scene.name === name))?.scenes.find((scene) => scene.name === name);
  const scenes = ran.recorded
    .map(({ scene }) => {
      const { about, acted } = marked(scene.name) ?? {};
      return { ...scene, ...(about && { about }), ...(acted && { acted }) };
    })
    .sort((a, b) => order(a) - order(b));
  const kept = review.rounds.find((round) => round.number === number);
  await repo.reviews.saveRound(id, { number, by: agent(kept?.by), scenes, replies: kept?.replies ?? [] });
  const comparisons = await compareAll(repo, id, number, scenes);
  const since = comparisons.find((comparison) => comparison.since === handedBack.number);

  // What only the pictures show is the person's to look at: the agent can't see more of it than Playthrough did.
  console.log(`\n${howEachWent(scenes, ran.failed, handedBack, toAccountFor(since)).join("\n")}`);
  const unanswered = notesToAnswer(review, number).filter((note) => !kept?.replies.some((reply) => reply.note === note && reply.words.trim()));
  console.log(
    `\n${unanswered.length ? `Answer ${unanswered.length > 1 ? "each note" : "the note"}: ${unanswered.map((note) => `playthrough reply ${note} "<what you did, in a line>"`).join("; ")}. Then hand` : "Hand"} back, in the background, so you hear when the person answers: playthrough wait`,
  );
}

// Compared with each time it was handed back before, so what's different is known to whoever last looked, whenever.
async function compareAll(repo: Repo, id: string, number: number, scenes: Scene[]) {
  const comparisons = await compareWithEarlier(repo.reviews, id, number, scenes);
  for (const comparison of comparisons) await repo.reviews.saveComparison(id, comparison);
  return comparisons;
}

// Each moment run again, in a line: new since it was last handed back, the same, different and how, as Playthrough
// says it; or where its way stopped, with how to get it back.
export function howEachWent(scenes: Scene[], failed: Failed[], handedBack: Round, findings: Finding[]): string[] {
  const went = scenes.map((scene) => {
    const different = findings.filter((finding) => finding.seen.some((seen) => seen.scene === scene.name));
    const fresh = !handedBack.scenes.some((one) => one.name === scene.name);
    return `${quote(scene.name)}: ${fresh ? "new" : different.length ? `different: ${different.map((finding) => finding.words).join("; ")}` : "the same"}.`;
  });
  const stopped = failed.map((one) => {
    const person = handedBack.scenes.find((scene) => scene.name === one.scene)?.person;
    return `${quote(one.scene)}: couldn't get there${one.why ? `, where the way stopped: ${quote(one.why.split("\n")[0]!)}` : ""}. Get there by hand (playthrough as ${person ?? "<person>"} ${JSON.stringify(one.scene)} goes as far as it can) and mark it again with the same words, or leave it out: playthrough drop ${JSON.stringify(one.scene)}`;
  });
  return [...went, ...stopped];
}

// A note answered, in a line, under the agent's name, in what's handed back next.
export async function reply(repo: Repo, note: string, words: string | undefined) {
  const id = await changeHere(repo);
  const review = await repo.reviews.get(id);
  const number = roundInProgress(review);
  const asked = notesToAnswer(review, number);
  if (!asked.includes(note)) throw new Refused([`There's no note ${note} waiting for an answer.${asked.length ? ` The notes that are: ${asked.join(", ")}.` : ""}`]);
  if (!words?.trim()) throw new Refused([`Say it: playthrough reply ${note} "<what you did, in a line>"`]);
  const kept = review.rounds.find((round) => round.number === number);
  if (!kept) throw new Refused(["Run playthrough again first: the answer goes with the moments as they are now."]);
  // Answered on a moment that won't be handed back (dropped, or it couldn't get there), the person would read what you did
  // with nothing to see it in.
  const moment = allNotes(review).get(note)?.note.on?.scene;
  if (moment && !kept.scenes.some((scene) => scene.name === moment) && !markedSinceNotes(repo, review, [note]).length)
    throw new Refused([
      `Note ${note} is on ${quote(moment)}, which isn't in what you'd hand back: the person would read your answer with nothing to see it in. Mark a moment that shows what you did (playthrough moment "<what's there>"), or get ${quote(moment)} there again and mark it with the same words; then answer.`,
    ]);
  await repo.reviews.saveRound(id, { ...kept, replies: [...kept.replies.filter((one) => one.note !== note), { note, words: words.trim() }] });
  console.log(`Answered ${note}.`);
}

// Hands back what's been done since the person last spoke, then waits for what they say next, and says it: each note,
// on its moment, with a picture, and how to stand where they stood. Said Done, the change is done, and it ends.
export async function wait(repo: Repo) {
  const id = await changeHere(repo);
  const reviews = repo.reviews;
  let review = await reviews.get(id);
  const last = review.rounds.at(-1);
  if (!last?.scenes.length) throw new Refused(["There are no moments to hand back yet. Mark one: playthrough as <person>, then playthrough moment \"<what's there>\""]);
  if (!last.finished) {
    const unanswered = notesToAnswer(review, last.number).filter((note) => !last.replies.some((reply) => reply.note === note && reply.words.trim()));
    if (unanswered.length) throw new Refused([`Answer each note first: ${unanswered.map((note) => `playthrough reply ${note} "<what you did, in a line>"`).join("; ")}`]);
    const missing = momentsOf(repo, id).filter((moment) => !last.scenes.some((scene) => scene.name === moment.words));
    if (missing.length)
      throw new Refused([
        `${list(missing.map((one) => quote(one.words)))} ${missing.length > 1 ? "aren't" : "isn't"} in what you'd hand back. Run playthrough again: it runs every moment on the code as it is now. One it can't get to, get to by hand and mark again, or leave out with playthrough drop "<moment>".`,
      ]);
    await reviews.finish(id, last.number);
    console.log(`Handed back: the person sees ${last.scenes.length > 1 ? `the ${last.scenes.length} moments` : "the moment"} as they are now${last.replies.length ? ", and your answers" : ""}.`);
    if (await stopBrowser(repo)) console.log("The browser from playthrough as is stopped: it starts again when you need it.");
    console.log(await addressOf(repo, id));
  } else {
    // Notes taken by a wait that stopped before they were answered are said again.
    const asking = notesToAnswer(review, last.number + 1);
    if (asking.length) return sayNotes(repo, review, last.number + 1, asking, review.sends.find((send) => review.taken.some((taken) => taken.send === send.id && taken.round === last.number + 1))?.by);
  }
  console.log("Waiting for the person…");
  for (;;) {
    // While it waits, the person's page says an agent is listening.
    const heard = await listening(repo, id);
    review = await reviews.wait(id, (review) => review.sends.some((send) => !review.taken.some((taken) => taken.send === send.id))).finally(heard);
    const taken = await reviews.take(id);
    review = await reviews.get(id);
    const number = roundInProgress(review);
    const asking = notesToAnswer(review, number);
    if (asking.length) return sayNotes(repo, review, number, asking, taken[0]?.by);
    const done = saidDone(review);
    if (done) return console.log(`\n${done.by} says every moment looks good: the change is done. Nothing more to do.`);
  }
}

// The change's own page on the person's list, its first moment, to give them rather than the list to find it in.
async function addressOf(repo: Repo, id: string): Promise<string> {
  const copy = everyCopy().find((one) => one.root === repo.root)?.name ?? basename(repo.root);
  const port = await openAlready(machine());
  const address = `http://localhost:${port ?? PORT}/moments/${[copy, id].map(encodeURIComponent).join("/")}/1`;
  return port ? `Give the person its own page: ${address}` : `Give the person its own page, open once playthrough open runs: ${address}`;
}

async function sayNotes(repo: Repo, review: Review, number: number, asking: string[], by = "The person") {
  const notes = allNotes(review);
  const pictures = await pictureNotes(repo, review, number, asking);
  const handedBack = review.rounds.findLast((round) => round.finished);
  console.log(`\n${by} said:`);
  for (const note of asking) {
    const on = notes.get(note)!.note.on;
    const name = on?.scene;
    const scene = handedBack?.scenes.find((one) => one.name === name);
    const thing = on?.element ? `, on the ${on.element.role} ${quote(on.element.name)}` : "";
    console.log(`\n  ${note}  on ${name ? `the moment ${quote(name)}` : "the change as a whole"}${scene?.person ? `, as ${scene.person}` : ""}${thing}`);
    for (const turn of conversation(review, note)) console.log(`    ${turn.agent ? "You" : turn.by}: ${turn.words}`);
    if (pictures.get(note)) console.log(`    As they saw it: ${pictures.get(note)}`);
    if (scene?.person) console.log(`    To be there: playthrough as ${scene.person} ${JSON.stringify(scene.name)}`);
    if (on && madeInApp(on) && on.did.length)
      console.log(`    They stepped into the app there, then: ${on.did.map((did) => `${did.does}${did.what ? ` ${quote(did.what)}` : ""}${typeof did.with === "string" && did.does !== "click" ? ` ${quote(did.with)}` : ""}`).join(", then ")}.`);
  }
  console.log(`\nChange the app. Then: playthrough again, which runs every moment again and says what's different; playthrough reply <note> "<what you did, in a line>" for each; then hand back with playthrough wait, in the background.`);
}
