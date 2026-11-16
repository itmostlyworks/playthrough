// Moments: the agent says "here" in its browser, and Playthrough keeps the way there, runs it again from a fresh start to
// prove it lands, and hands what it kept back to the person; runs every one again on the next version, and says what's
// different; and brings back what the person says on each.
//
//   playthrough moment "<what's there>" ["<what it's about>"] [--last N]
//                                       keeps where the browser is, and the way there, if it lands run again: the
//                                       moment is what was done since arriving on this page, or the last N things
//   playthrough drop "<moment>"         a moment that's no longer wanted: not run again, or handed back
//   playthrough again                   every moment again, on the code as it is now: the same, different, or not reached
//   playthrough answer <note> "<words>" answers a note
//   playthrough wait                    hands back, and waits for what the person says
//
// What's on disk is what the person's page reads: each moment's way there is a file in the change's moments folder, and
// what's kept of it, its recording and what it's about, is in the hand-back being worked on, until it's handed back.

import { chromium, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Glimpse, Reading } from "@playthrough/page";
import { allNotes, conversation, list, madeInApp, MOST_SHOWN, notesToAnswer, saidDone, quote, Refused, handBackInProgress, sendsNotTaken, startOf, toAccountFor, type Finding, type Change, type HandBack, type Moment } from "@playthrough/change";
import { agent } from "./agent.ts";
import { browserFile, stopBrowser, type Browser } from "./as.ts";
import { changeHere, meanHere, meantHere, momentNamed, momentsOf } from "./change.ts";
import { compareWithEarlier } from "./compare.ts";
import { everyCopy, machine } from "./machine.ts";
import { pictureNotes } from "./noted.ts";
import { openAlready, PORT } from "./open.ts";
import { readPage, unhovered } from "./read.ts";
import type { Repo } from "./repo.ts";
import { frameOf, glimpsesOf, readingsOf, type Failed } from "./reporter.ts";
import { markUnsteady, recorder, runOnce } from "./run.ts";
import { seenChanging, SQUARE, squaresOf, type Square } from "./seen.ts";
import { setupIn } from "./setup.ts";
import { listening, saidTo, unheard } from "./wait.ts";
import { aboutSaid, ENDED, fileOf, wayFile, TIMED, whatDiffers, type About, type Done } from "./way.ts";

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
  const there = { url: here.url(), reading: await readAt(here), scrolled: await here.evaluate(() => ({ x: scrollX, y: scrollY })), ...(await aboutOn(here, words, named)), open: await openOn(here) };
  await open.close();
  if (named && !there.about)
    throw new Refused([`Nothing on the page is called ${quote(named)}, as a button, a field, a link or a heading is, or holds it, or says it.${there.near.length ? ` Near it: ${list(there.near.map(quote))}.` : ""} Say it as the page names it, or leave it out.`]);

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
  const change = await repo.changes.get(id);
  const file = fileOf(words);
  const trying = join(repo.root, ".playthrough", id, "trying");
  rmSync(trying, { recursive: true, force: true });
  mkdirSync(trying, { recursive: true });
  writeFileSync(join(trying, "package.json"), `{ "type": "module" }\n`);
  const way = { words, person: browser.person, did: done, setup: browser.setup, about: there.about, scrolled: there.scrolled, from };
  writeFileSync(join(trying, file), wayFile({ ...way, tried: true }));
  console.log(`Running the way there again, from a fresh start, as ${browser.person}…`);
  const ran = await runOnce({ moments: trying, only: [words], app: await repo.app(), root: repo.root, recorder, started: change.started });
  const notKept = (why: string) => {
    rmSync(trying, { recursive: true, force: true });
    return new Refused([`Not kept: run again from a fresh start, ${why}`, "Tell the person only about moments that were kept. Fix what's said, or get there another way, and mark it again."]);
  };
  const [recorded] = ran.recorded;
  const [failed] = ran.failed;
  if (!recorded) {
    if (there.about && !failed?.checked && failed?.why?.includes("expect(")) throw notKept(`it got there, but ${aboutSaid(there.about)} wasn't as it is where you are: ${failed.why}`);
    throw notKept(`it ${failed ? stoppedSaid(failed) : "couldn't get there"}.`);
  }
  const readings: Reading[] = JSON.parse(recorded.files.find((one) => one.name === readingsOf(recorded.moment))!.bytes.toString());
  const ended: string = JSON.parse(readFileSync(join(trying, ENDED), "utf8")).url;
  const { differ, timely, address } = whatDiffers(there, { url: ended, reading: readings.at(-1)! });
  if (differ.length)
    throw notKept(
      `it ended ${address !== undefined ? `on ${address} as you are, but not as it is where you are` : "on another page"}. What differs:\n${differ.map((one) => `  ${one}`).join("\n")}${differ.some((one) => one.startsWith("only where you are")) ? "\nIf what's only where you are comes a while after what you did, name it as the moment's thing: the moment waits for it." : ""}`,
    );

  // Run once more, what changes by itself, as a caret blinking or a time the server stamps, is known, and left out
  // whenever it's compared again.
  console.log("Running it once more, to see what changes by itself…");
  const twice = await runOnce({ moments: trying, only: [words], app: await repo.app(), root: repo.root, recorder, started: change.started });
  if (!twice.recorded.length) throw notKept(`it got there once, but not a second time${twice.failed[0]?.why ? `: ${twice.failed[0].why}` : ""}. Make what it starts from the same each time, in playthrough/setup.ts.`);
  await markUnsteady(handBackInProgress(change), ran.recorded, twice.recorded);
  // Its first and last frames, in both runs, for whether it changes anything you can see.
  const framesOf = ({ moment, files }: (typeof ran.recorded)[number]) => {
    const file = (name: string) => files.find((one) => one.name === name)?.bytes;
    const end: Reading | undefined = JSON.parse(file(readingsOf(moment))?.toString() ?? "[]").at(-1);
    const [first, later, last, held] = [file(frameOf(moment, "first")), file(frameOf(moment, "a-beat-later")), end && file(end.picture), file(frameOf(moment, "held"))];
    const after = files.filter((one) => /\/after-\d+\.png$/.test(one.name)).map((one) => one.bytes);
    return first && later && last ? { first, later, after, last, held } : undefined;
  };
  const frames = [framesOf(recorded), framesOf(twice.recorded[0]!)];
  const opening: Glimpse | undefined = JSON.parse(recorded.files.find((one) => one.name === glimpsesOf(recorded.moment))?.bytes.toString() ?? "[]")[0];
  const timed = (opening?.things ?? []).filter((thing) => TIMED.test(thing.name)).flatMap((thing) => squaresOf(thing.box));
  const seen = frames[0] && frames[1] ? await seenChanging([frames[0], frames[1]], timed).catch(() => undefined) : undefined;

  mkdirSync(repo.moments(id), { recursive: true });
  writeFileSync(join(repo.moments(id), "package.json"), `{ "type": "module" }\n`);
  // Marked again with the same words, it's the same moment, in whatever file it was kept before.
  for (const one of momentsOf(repo, id)) if (one.words === words && one.file !== join(repo.moments(id), file)) rmSync(one.file);
  writeFileSync(join(repo.moments(id), file), wayFile(way));
  rmSync(trying, { recursive: true, force: true });
  const acted = lastActedOn(done, readings.at(-1)!);
  const moment: Moment = { ...recorded.moment, ...(there.about && { about: { role: there.about.role, name: there.about.name } }), ...(acted && { acted }) };
  const number = handBackInProgress(change);
  for (const { name, bytes } of recorded.files) await repo.changes.saveFile(id, number, name, bytes);
  const kept = change.handBacks.find((handBack) => handBack.number === number);
  const moments = kept?.moments.some((one) => one.name === moment.name) ? kept.moments.map((one) => (one.name === moment.name ? moment : one)) : [...(kept?.moments ?? []), moment];
  await repo.changes.saveHandBack(id, { number, by: agent(kept?.by), moments, replies: kept?.replies ?? [] });
  writeFileSync(markedFile(repo), JSON.stringify({ began: browser.began, at: done.length }));
  // Marked again after running them all again, it's compared again with what the person saw, with the rest.
  if (change.comparisons.some((comparison) => comparison.handBack === number)) await compareAll(repo, id, number, moments);

  // What the moment shows, read back: the agent reads this, not the moment file.
  const shownAt = (name: string) => repo.show(join(dirname(repo.handBack(id, number)), "files", name));
  const glimpses: Glimpse[] = JSON.parse(recorded.files.find((one) => one.name === glimpsesOf(recorded.moment))?.bytes.toString() ?? "[]");
  const shown = done.slice(from).filter((one) => one.does !== "goto");
  const before = done.slice(0, from).filter((one) => !(one.does === "goto" && one.led));
  const still = !shown.length;
  const length = moment.length - moment.from;
  console.log(`\nKept ${/[“"]/.test(words) ? words : quote(words)}${still ? ", a still: nothing happens in it" : `, ${length.toFixed(1)} s`}${there.about ? `, about the ${aboutSaid(there.about)}` : ""}.`);
  if (!still) console.log(`  shows    ${shown.map(saidOf).join(" → ")}`);
  if (before.length) console.log(`  before   ${before.length > 3 ? "… " : ""}${before.slice(-3).map(saidOf).join(" → ")}   (kept, never shown)`);
  if (!still) console.log(`  first    ${shownAt(frameOf(recorded.moment, "first"))}`);
  console.log(`  ${still ? "picture" : "last   "}  ${shownAt(readings.at(-1)!.picture)}`);
  // Kept where the agent is, it ends as the agent's page is: with what's open there still open, and what it leads to
  // unseen unless it's marked too, as a board made from a dialog no one finished.
  if (there.open) console.log(`  This moment ends with ${there.open.name ? quote(there.open.name) : "a dialog"} still open. If your change shows in what happens next, mark that too.`);
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
export async function aboutOn(page: Page, words: string, named?: string): Promise<{ about?: About; near: string[] }> {
  return page.evaluate(
    ({ words, named }) => {
      const nameOf = (window as any).__playthroughNamed;
      if (!nameOf) return { near: [] };
      const said = (named ?? words).toLowerCase().trim();
      const asWritten = (window as any).__playthroughAsWritten;
      const all = asWritten(() => [...document.querySelectorAll("a, button, input, select, textarea, h1, h2, h3, h4, [role]")].map((element) => ({ element, ...nameOf(element) })).filter((one) => one.role && one.name)) as { element: Element; role: string; name: string }[];
      const lower = (one: { name: string }) => one.name.toLowerCase();
      // A field or a control before a heading of the same name: what can be changed is what's checked.
      const headingLast = (a: { role: string }, b: { role: string }) => Number(a.role === "heading") - Number(b.role === "heading");
      const found = named
        ? (all.filter((one) => lower(one) === said).sort(headingLast)[0] ?? all.filter((one) => lower(one).includes(said)).sort((a, b) => a.name.length - b.name.length || headingLast(a, b))[0])
        : all.filter((one) => /\s/.test(one.name) && said.includes(lower(one))).sort((a, b) => b.name.length - a.name.length || headingLast(a, b))[0];
      const near = [...new Set(all.filter((one) => said.split(/\s+/).some((word) => word.length > 3 && lower(one).includes(word))).map((one) => one.name))].slice(0, 5);
      // Named, and nothing is called that: a field that holds it, as Kan's list names are fields, called by the words in
      // them as a person calls them.
      const isField = (element: Element) => ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
      const holding = named && !found ? all.find((one) => isField(one.element) && (one.element as HTMLInputElement).value.toLowerCase().trim() === said) : undefined;
      // Nor held: words on the page that say it, the innermost, as a field's own words, which the page names nothing.
      const own = (element: Element) => ((element as HTMLElement).innerText ?? "").trim().replace(/\s+/g, " ");
      const saying: Element[] = named && !found && !holding ? asWritten(() => [...document.querySelectorAll("body *")].filter((element) => own(element).toLowerCase() === said && ![...element.children].some((child) => own(child).toLowerCase() === said))) : [];
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
        return { near, about: { role: "text", name: asWritten(() => own(element)), disabled: false, ...(nth !== undefined && { nth }) } };
      }
      const thing = found ?? holding;
      if (!thing) return { near };
      const alike = all.filter((one) => one.role === thing.role && one.name === thing.name).map((one) => one.element);
      // Held, it's the field holding it of those alike, wherever it is.
      const { element: chosen, nth } = found ? which(alike, found.element) : { element: thing.element, ...(alike.length > 1 && { nth: alike.indexOf(thing.element) }) };
      const element = chosen as HTMLInputElement;
      const field = isField(element);
      return {
        near,
        about: {
          role: thing.role,
          name: thing.name,
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

// A dialog left open on the page, as the page marks one (role dialog or alertdialog, or an open <dialog>), the last opened
// where there are several: by its name, or else its heading, as written; or none to give.
export async function openOn(page: Page): Promise<{ name: string } | undefined> {
  return page.evaluate(() => {
    const { __playthroughNamed: named, __playthroughAsWritten: asWritten } = window as any;
    const open = [...document.querySelectorAll("[role=dialog], [role=alertdialog], dialog[open]")].filter((one) => one.checkVisibility({ opacityProperty: true, visibilityProperty: true })).at(-1);
    if (!open || !named) return undefined;
    const heading = open.querySelector("h1, h2, h3, h4, h5, h6, [role=heading]") as HTMLElement | null;
    return { name: asWritten(() => named(open).name || (heading?.innerText ?? "").trim().replace(/\s+/g, " ")) as string };
  });
}

// A moment no longer wanted goes from what's run again and handed back; the person sees it as last handed back until
// the next hand-back.
export async function drop(repo: Repo, words: string) {
  const id = await changeHere(repo);
  const way = momentNamed(repo, id, words);
  const change = await repo.changes.get(id);
  // A moment a note is on is where the person sees what was done about it: dropped, they'd have nowhere to look, unless a
  // moment marked since the note came shows it.
  const on = notesOn(change, way.words);
  if (on.length && !markedSinceNotes(repo, change, on, way.words).length)
    throw new Refused([
      `${on.length > 1 ? `Notes ${list(on)} are` : `Note ${on[0]} is`} on ${quote(way.words)}: the person sees what you did about ${on.length > 1 ? "them" : "it"} in a moment, not only in your answer. Mark one that shows it first, a still where it was if it's gone (playthrough way "<what's there now>"); then drop this one, if what it showed no longer exists.`,
    ]);
  rmSync(way.file);
  const last = change.handBacks.at(-1);
  if (last && !last.finished) await repo.changes.saveHandBack(id, { ...last, moments: last.moments.filter((moment) => moment.name !== way.words) });
  console.log(`Dropped ${quote(way.words)}: it isn't run again, or handed back.`);
}

// The notes waiting for an answer on a moment.
function notesOn(change: Change, moment: string): string[] {
  const notes = allNotes(change);
  return notesToAnswer(change, handBackInProgress(change)).filter((id) => notes.get(id)?.note.on?.moment === moment);
}

// The moments marked since the person's notes reached the agent, other than the one they're on: where what was done about
// them can be seen.
function markedSinceNotes(repo: Repo, change: Change, notes: string[], besides?: string): string[] {
  const sent = change.sends.filter((send) => send.notes.some((note) => notes.includes(note.id)));
  const reached = Math.max(0, ...change.taken.filter((taken) => sent.some((send) => send.id === taken.send)).map((taken) => Date.parse(taken.at)));
  return momentsOf(repo, change.id)
    .filter((way) => way.words !== besides && statSync(way.file).mtimeMs > reached)
    .map((way) => way.words);
}

// Every moment again, on the code as it is now, by its way there: recorded, compared with what was last handed back, and
// said, each as the same, different, or not reached.
export async function again(repo: Repo) {
  const id = await changeHere(repo);
  const change = await repo.changes.get(id);
  const handedBack = change.handBacks.findLast((handBack) => handBack.finished);
  if (!handedBack)
    throw new Refused(["Nothing's been handed back yet, so there's nothing to run them again against: each moment was run again from a fresh start as you marked it. Hand back with playthrough wait, in the background."]);
  const ways = momentsOf(repo, id);
  if (!ways.length) throw new Refused(["There are no moments to run again. Mark one: playthrough as <person>, then playthrough moment \"<what's there>\""]);
  const number = handBackInProgress(change);
  console.log(`Running ${ways.length > 1 ? `the ${ways.length} moments` : "the moment"} again, on the code as it is now…`);
  const ran = await runOnce({ moments: repo.moments(id), app: await repo.app(), root: repo.root, recorder, started: change.started });
  for (const { files } of ran.recorded) for (const { name, bytes } of files) await repo.changes.saveFile(id, number, name, bytes);
  // In the order they were handed back, what each is about as it was marked; one new since, after them.
  const order = (moment: Moment) => handedBack.moments.findIndex((one) => one.name === moment.name) >>> 0;
  const marked = (name: string) => change.handBacks.findLast((handBack) => handBack.moments.some((moment) => moment.name === name))?.moments.find((moment) => moment.name === name);
  const moments = ran.recorded
    .map(({ moment }) => {
      const { about, acted } = marked(moment.name) ?? {};
      return { ...moment, ...(about && { about }), ...(acted && { acted }) };
    })
    .sort((a, b) => order(a) - order(b));
  const kept = change.handBacks.find((handBack) => handBack.number === number);
  await repo.changes.saveHandBack(id, { number, by: agent(kept?.by), moments, replies: kept?.replies ?? [] });
  const comparisons = await compareAll(repo, id, number, moments);
  const since = comparisons.find((comparison) => comparison.since === handedBack.number);

  // What only the pictures show is the person's to look at: the agent can't see more of it than Playthrough did.
  console.log(`\n${howEachWent(moments, ran.failed, handedBack, toAccountFor(since)).join("\n")}`);
  const unanswered = notesToAnswer(change, number).filter((note) => !kept?.replies.some((reply) => reply.note === note && reply.words.trim()));
  console.log(
    `\n${unanswered.length ? `Answer ${unanswered.length > 1 ? "each note" : "the note"}: ${unanswered.map(answering).join("; ")}. Then hand` : "Hand"} back, in the background, so you hear when the person answers: playthrough wait`,
  );
}

// Compared with each time it was handed back before, so what's different is known to whoever last looked, whenever.
async function compareAll(repo: Repo, id: string, number: number, moments: Moment[]) {
  const comparisons = await compareWithEarlier(repo.changes, id, number, moments);
  for (const comparison of comparisons) await repo.changes.saveComparison(id, comparison);
  return comparisons;
}

// Each moment run again, in a line: new since it was last handed back, the same, different and how, as Playthrough
// says it; or where it stopped and why, with how to get it back.
export function howEachWent(moments: Moment[], failed: Failed[], handedBack: HandBack, findings: Finding[]): string[] {
  const went = moments.map((moment) => {
    const different = findings.filter((finding) => finding.seen.some((seen) => seen.moment === moment.name));
    const fresh = !handedBack.moments.some((one) => one.name === moment.name);
    return `${quote(moment.name)}: ${fresh ? "new" : different.length ? `different: ${different.map((finding) => finding.words).join("; ")}` : "the same"}.`;
  });
  const stopped = failed.map((one) => {
    const person = handedBack.moments.find((moment) => moment.name === one.moment)?.person;
    return `${quote(one.moment)}: ${stoppedSaid(one)}. Get there by hand (playthrough as ${person ?? "<person>"} ${JSON.stringify(one.moment)} goes as far as it can) and mark it again with the same words, or leave it out: playthrough drop ${JSON.stringify(one.moment)}`;
  });
  return [...went, ...stopped];
}

// Where a moment run from a fresh start stopped, and why: on its way there, or in what it shows; or it got there, and
// what it's about wasn't as it was.
const stoppedSaid = ({ at, why, checked }: Failed) =>
  checked ? `got there, but ${why}` : `${at ? "got there, but not through what it shows" : "couldn't get there"}${why ? `: ${why}` : ""}`;

// A note answered, in a line, under the agent's name, in what's handed back next.
export async function answer(repo: Repo, note: string, words: string | undefined) {
  const id = await changeHere(repo);
  const change = await repo.changes.get(id);
  const number = handBackInProgress(change);
  const asked = notesToAnswer(change, number);
  if (!asked.includes(note)) throw new Refused([`There's no note ${note} waiting for an answer.${asked.length ? ` The notes that are: ${asked.join(", ")}.` : ""}`]);
  if (!words?.trim()) throw new Refused([`Say it: ${answering(note)}`]);
  const kept = change.handBacks.find((handBack) => handBack.number === number) ?? (await unchangedOn(repo, change, number));
  // Answered on a moment that won't be handed back (dropped, or it couldn't get there), the person would read what you did
  // with nothing to see it in.
  const named = allNotes(change).get(note)?.note.on?.moment;
  if (named && !kept.moments.some((moment) => moment.name === named) && !markedSinceNotes(repo, change, [note]).length)
    throw new Refused([
      `Note ${note} is on ${quote(named)}, which isn't in what you'd hand back: the person would read your answer with nothing to see it in. Mark a moment that shows what you did (playthrough moment "<what's there>"), or get ${quote(named)} there again and mark it with the same words; then answer.`,
    ]);
  await repo.changes.saveHandBack(id, { ...kept, replies: [...kept.replies.filter((one) => one.note !== note), { note, words: words.trim() }] });
  console.log(`Answered ${note}.`);
}

// A note that only asks something is answered with nothing changed: where nothing in the app has changed since the
// moments the person saw were run, those moments are as they are now, and go on into the next hand-back as they are,
// with their files, unrun. Anything changed, they're run again first.
async function unchangedOn(repo: Repo, change: Change, number: number): Promise<HandBack> {
  const seen = change.handBacks.findLast((handBack) => handBack.finished)!;
  const changed = changedSince(repo, change.id, seen);
  if (changed) throw new Refused([`Run playthrough again first: ${changed} has changed since the moments were run, and the answer goes with the moments as they are now.`]);
  cpSync(repo.files(change.id, seen.number), repo.files(change.id, number), { recursive: true, force: false });
  const handBack = { number, by: agent(seen.by), moments: seen.moments, replies: [] };
  await repo.changes.saveHandBack(change.id, handBack);
  return handBack;
}

// What in the app has changed since a hand-back's moments were run, as git lists the app's files (its own, and new ones
// it doesn't ignore; .playthrough/ never): one written since the first of its recordings, or gone. Outside git, what
// changed can't be known, so the app is taken as changed.
export function changedSince(repo: Repo, id: string, handBack: HandBack): string | undefined {
  let ran: number;
  let files: string[];
  try {
    ran = Math.min(...handBack.moments.map((moment) => statSync(join(repo.files(id, handBack.number), moment.recording)).mtimeMs));
    files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: repo.root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 }).split("\0").filter(Boolean);
  } catch {
    return "the app";
  }
  return files.find((file) => !existsSync(join(repo.root, file)) || statSync(join(repo.root, file)).mtimeMs > ran);
}

// Hands back what's been done since the person last spoke, then waits for what they say next, and says it: each note,
// on its moment, with a picture, and how to stand where they stood. Said Done, the change is done, and it ends.
export async function wait(repo: Repo) {
  const changes = repo.changes;
  const meant = await meantHere(repo);
  let change = meant === undefined ? undefined : await changes.get(meant);
  const last = change?.handBacks.at(-1);
  if (change && last?.moments.length && !last.finished) {
    const id = change.id;
    const unanswered = notesToAnswer(change, last.number).filter((note) => !last.replies.some((reply) => reply.note === note && reply.words.trim()));
    if (unanswered.length) throw new Refused([`Answer each note first: ${unanswered.map(answering).join("; ")}`]);
    const missing = momentsOf(repo, id).filter((way) => !last.moments.some((moment) => moment.name === way.words));
    if (missing.length)
      throw new Refused([
        `${list(missing.map((one) => quote(one.words)))} ${missing.length > 1 ? "aren't" : "isn't"} in what you'd hand back. Run playthrough again: it runs every moment on the code as it is now. One it can't get to, get to by hand and mark again, or leave out with playthrough drop "<moment>".`,
      ]);
    // Answered with nothing changed, the moments weren't run again: anything changed since, they would be out of date.
    const unrun = last.number > 1 && !change.comparisons.some((comparison) => comparison.handBack === last.number);
    const changed = unrun && changedSince(repo, id, change.handBacks.findLast((handBack) => handBack.finished)!);
    if (changed) throw new Refused([`${changed} has changed since the moments were run. Run playthrough again, so the person sees them as they are now.`]);
    await changes.finish(id, last.number);
    console.log(`Handed back: the person sees ${last.moments.length > 1 ? `the ${last.moments.length} moments` : "the moment"} as they are now${last.replies.length ? ", and your answers" : ""}.`);
    if (await stopBrowser(repo)) console.log("The browser from playthrough as is stopped: it starts again when you need it.");
    console.log(await addressOf(repo, id));
  } else if (change && last?.finished) {
    // Notes taken by a wait that stopped before they were answered are said again.
    const kept = change;
    const asking = notesToAnswer(kept, last.number + 1);
    if (asking.length) return sayNotes(repo, kept, last.number + 1, asking, kept.sends.find((send) => kept.taken.some((taken) => taken.send === send.id && taken.handBack === last.number + 1))?.by);
  }
  // Notes sent while no agent was listening are the next agent's, whichever change it's on, or with none named: the
  // person was told to ask any agent for them.
  // Notes an agent took and hadn't answered when it ended are the next one's in the same way.
  const [nobodys] = await unheard(repo);
  if (nobodys) {
    const id = nobodys.change.id;
    await changes.take(id);
    change = await changes.get(id);
    if (id !== meant) {
      await meanHere(repo, id);
      console.log(`\nThese notes are on ${quote(change.title)}: what you run here means it now.`);
    }
    const number = handBackInProgress(change);
    return sayNotes(repo, change, number, notesToAnswer(change, number), nobodys.sends[0]!.by);
  }
  const id = await changeHere(repo);
  if (!last?.moments.length) throw new Refused(["There are no moments to hand back yet. Mark one: playthrough as <person>, then playthrough moment \"<what's there>\""]);
  console.log("Waiting for the person…");
  for (;;) {
    // While it waits, the person's page says an agent is listening.
    const heard = await listening(repo, id);
    change = await changes.wait(id, (change) => sendsNotTaken(change).length > 0).finally(heard);
    const taken = await changes.take(id);
    change = await changes.get(id);
    const number = handBackInProgress(change);
    const asking = notesToAnswer(change, number);
    if (asking.length) return sayNotes(repo, change, number, asking, taken[0]?.by);
    const done = saidDone(change);
    if (done) return console.log(`\n${done.by} says every moment looks good: the change is done. Nothing more to do.`);
  }
}

// The change's own page, its first moment, to give them rather than what's next to find it from.
async function addressOf(repo: Repo, id: string): Promise<string> {
  const copy = everyCopy().find((one) => one.root === repo.root)?.name ?? basename(repo.root);
  const port = await openAlready(machine());
  const address = `http://localhost:${port ?? PORT}/moments/${[copy, id].map(encodeURIComponent).join("/")}/1`;
  return port ? `Give the person its own page: ${address}` : `Give the person its own page, open once playthrough open runs: ${address}`;
}

async function sayNotes(repo: Repo, change: Change, number: number, asking: string[], by = "The person") {
  await saidTo(repo, change.id);
  const notes = allNotes(change);
  const pictures = await pictureNotes(repo, change, number, asking);
  const handedBack = change.handBacks.findLast((handBack) => handBack.finished);
  console.log(`\n${by} said:`);
  for (const note of asking) {
    const on = notes.get(note)!.note.on;
    const name = on?.moment;
    const moment = handedBack?.moments.find((one) => one.name === name);
    const thing = on?.element ? `, on the ${on.element.role} ${quote(on.element.name)}` : "";
    console.log(`\n  ${note}  on ${name ? `the moment ${quote(name)}` : "the change as a whole"}${moment?.person ? `, as ${moment.person}` : ""}${thing}`);
    for (const turn of conversation(change, note)) console.log(`    ${turn.agent ? "You" : turn.by}: ${turn.words}`);
    if (pictures.get(note)) console.log(`    As they saw it: ${pictures.get(note)}`);
    if (moment?.person) console.log(`    To be there: playthrough as ${moment.person} ${JSON.stringify(moment.name)}`);
    if (on && madeInApp(on) && on.did.length)
      console.log(`    They stepped into the app there, then: ${on.did.map((did) => `${did.does}${did.what ? ` ${quote(did.what)}` : did.does === "click" ? " the page" : ""}${typeof did.with === "string" && did.does !== "click" ? ` ${quote(did.with)}` : ""}`).join(", then ")}.`);
    // Where they were is often the whole clue, as an address the app made wrong: what was there is gone by the time
    // the agent looks. What their run's setup made is said as setup's, the same place in the agent's own run.
    if (on && madeInApp(on) && on.address)
      console.log(`    The app was at ${on.address} when they wrote it${on.address.includes("${setup.") ? ", setup being what playthrough/setup.ts made for the run, as playthrough as prints it" : ""}.`);
  }
  console.log(
    `\nWhere a note asks for a change, change the app, then run every moment again: playthrough again, which says what's different. Where it only asks something, answer it: nothing has to change. Answer each: ${answering("<note>")}; then hand back with playthrough wait, in the background.`,
  );
}

// How a note is answered: a line saying what was done, or answering what was asked.
export const answering = (note: string) => `playthrough answer ${note} "<what you did, or your answer, in a line>"`;
