// Moments: the agent says "here" in its browser, and Playthrough keeps the way there, runs it again from a fresh start to
// prove it lands, and hands what it kept back to the person; runs every one again on the next version, and says what's
// different; and brings back what the person says on each.
//
//   playthrough moment "<what's there>" ["<what it's about>"]
//                                       keeps where the browser is, and the way there, if it lands run again
//   playthrough drop "<moment>"         a moment that's no longer wanted: not run again, or handed back
//   playthrough again                   every moment again, on the code as it is now: the same, different, or not reached
//   playthrough reply <note> "<words>"  answers a note
//   playthrough wait                    hands back, and waits for what the person says
//
// What's on disk is what the person's page reads: each moment's way there is a file in the change's scenes folder, and
// what's kept of it, its recording and what it's about, is in the round being worked on, until it's handed back.

import { chromium, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Reading } from "@playthrough/page";
import { allNotes, conversation, list, notesToAnswer, quote, Refused, roundInProgress, toAccountFor, type Change, type Review, type Round, type Scene } from "@playthrough/review";
import { agent } from "./agent.ts";
import { browserFile, type Browser } from "./as.ts";
import { changeHere, momentNamed, momentsOf } from "./change.ts";
import { compareWithEarlier } from "./compare.ts";
import { pictureNotes } from "./noted.ts";
import { readPage, unhovered } from "./read.ts";
import type { Repo } from "./repo.ts";
import { readingsOf, type Failed } from "./reporter.ts";
import { markUnsteady, recorder, runOnce } from "./scenes.ts";
import { setupIn } from "./setup.ts";
import { listening } from "./wait.ts";
import { aboutSaid, ENDED, fileOf, sceneOf, whatDiffers, type About, type Done } from "./way.ts";

// What a moment says is what's there, short enough to sit under a picture of it: who and where, the person sees.
const MOST_WORDS = 10;

export async function moment(repo: Repo, words: string, named?: string) {
  const id = await changeHere(repo);
  if (!existsSync(browserFile(repo))) throw new Refused(["There's no browser to keep a moment from. Start one, in the background: playthrough as <person>"]);
  const browser: Browser = JSON.parse(readFileSync(browserFile(repo), "utf8"));
  const counted = words.trim().split(/\s+/).length;
  if (counted > MOST_WORDS) throw new Refused([`That's ${counted} words. Say only what's there, in under eight (“Cards now say WEB-1 to WEB-5”): the person already sees who it is and where.`]);
  const people = Object.keys((await setupIn(repo.setup)).people ?? {}).filter((name) => new RegExp(`(^|\\W)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`, "i").test(words));
  if (people.length) throw new Refused([`The person sees who it is beside the moment: leave ${list(people.map(quote))} out of its words, and say only what's there.`]);
  const began = Date.now();

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
  const there = { url: here.url(), reading: await readAt(here), ...(await aboutOn(here, words, named)) };
  await open.close();
  if (named && !there.about)
    throw new Refused([`Nothing on the page is called ${quote(named)}, as a button, a field, a link or a heading is, or says it.${there.near.length ? ` Near it: ${list(there.near.map(quote))}.` : ""} Say it as the page names it, or leave it out.`]);

  // The way there, run from a fresh start as the same person and recorded: tried in a folder of its own, and kept only
  // if it lands, in place of one with the same words.
  const review = await repo.reviews.get(id);
  const file = fileOf(words);
  const trying = join(repo.root, ".playthrough", id, "trying");
  rmSync(trying, { recursive: true, force: true });
  mkdirSync(trying, { recursive: true });
  writeFileSync(join(trying, "package.json"), `{ "type": "module" }\n`);
  const way = { words, person: browser.person, did: browser.did, setup: browser.setup, about: there.about };
  writeFileSync(join(trying, file), sceneOf({ ...way, tried: true }));
  console.log(`Running the way there again, from a fresh start, as ${browser.person}…`);
  const ran = await runOnce({ scenes: trying, only: [words], app: await repo.app(), root: repo.root, recorder, before: false, taken: [], started: review.started });
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
  const { differ, passing, address } = whatDiffers(there, { url: ended, reading: readings.at(-1)! });
  if (differ.length) throw notKept(`it ended somewhere else. What differs from where you are:\n${differ.map((one) => `  ${one}`).join("\n")}`);

  // Run once more, what changes by itself, as a caret blinking or a time the server stamps, is known, and left out
  // whenever it's compared again.
  console.log("Running it once more, to see what changes by itself…");
  const twice = await runOnce({ scenes: trying, only: [words], app: await repo.app(), root: repo.root, recorder, before: false, taken: [], started: review.started });
  if (!twice.recorded.length) throw notKept(`it got there once, but not a second time${twice.failed[0]?.why ? `: ${twice.failed[0].why}` : ""}. Make what it starts from the same each time, in playthrough/setup.ts.`);
  await markUnsteady(Math.max(1, roundInProgress(review)), ran.recorded, twice.recorded);

  mkdirSync(repo.scenes(id), { recursive: true });
  writeFileSync(join(repo.scenes(id), "package.json"), `{ "type": "module" }\n`);
  writeFileSync(join(repo.scenes(id), file), sceneOf(way));
  rmSync(trying, { recursive: true, force: true });
  const acted = lastActedOn(browser.did, readings.at(-1)!);
  const scene: Scene = { ...recorded.scene, ...(there.about && { about: { role: there.about.role, name: there.about.name } }), ...(acted && { acted }) };
  const number = Math.max(1, roundInProgress(review));
  for (const { name, bytes } of recorded.files) await repo.reviews.saveFile(id, number, name, bytes);
  const kept = review.rounds.find((round) => round.number === number);
  const scenes = kept?.scenes.some((one) => one.name === scene.name) ? kept.scenes.map((one) => (one.name === scene.name ? scene : one)) : [...(kept?.scenes ?? []), scene];
  await repo.reviews.saveRound(id, { number, by: agent(kept?.by), scenes, replies: kept?.replies ?? [], accounts: kept?.accounts ?? {} });
  // Marked again after running them all again, it's compared again with what the person saw, with the rest.
  if (review.comparisons.some((comparison) => comparison.round === number)) await compareAll(repo, id, number, scenes);

  console.log(`\nKept ${quote(words)}, in ${((Date.now() - began) / 1000).toFixed(1)}s: run again from a fresh start, it landed where you are.`);
  if (there.about) console.log(`It's about the ${aboutSaid(there.about)}: checked again on the way, it held.`);
  console.log(`Compared: what's read on the page, and the address with the ids each run made set aside (${address}, the same).`);
  if (passing.length) console.log(`Left out, as messages that pass by themselves: ${passing.join("; ")}.`);
  console.log(`The person sees it once you hand back: playthrough wait, in the background.`);
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
      const [text] = saying;
      if (text) return { near, about: { role: "text", name: own(text), disabled: false, ...(saying.length > 1 && { nth: 0 }) } };
      if (!found) return { near };
      const element = found.element as HTMLInputElement;
      const field = "value" in element && ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
      return {
        near,
        about: {
          role: found.role,
          name: found.name,
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
  rmSync(moment.file);
  const last = (await repo.reviews.get(id)).rounds.at(-1);
  if (last && !last.finished) await repo.reviews.saveRound(id, { ...last, scenes: last.scenes.filter((scene) => scene.name !== moment.words) });
  console.log(`Dropped ${quote(moment.words)}: it isn't run again, or handed back.`);
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
  const ran = await runOnce({ scenes: repo.scenes(id), app: await repo.app(), root: repo.root, recorder, before: false, taken: [], started: review.started });
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
  await repo.reviews.saveRound(id, { number, by: agent(kept?.by), scenes, replies: kept?.replies ?? [], accounts: {} });
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
export function howEachWent(scenes: Scene[], failed: Failed[], handedBack: Round, changes: Change[]): string[] {
  const went = scenes.map((scene) => {
    const different = changes.filter((change) => change.seen.some((seen) => seen.scene === scene.name));
    const fresh = !handedBack.scenes.some((one) => one.name === scene.name);
    return `${quote(scene.name)}: ${fresh ? "new" : different.length ? `different: ${different.map((change) => change.words).join("; ")}` : "the same"}.`;
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
  } else {
    // Notes taken by a wait that stopped before they were answered are said again.
    const asking = notesToAnswer(review, last.number + 1);
    if (asking.length) return sayNotes(repo, review, last.number + 1, asking, review.sends.find((send) => review.taken.some((taken) => taken.send === send.id && taken.round === last.number + 1))?.by);
  }
  console.log("Waiting for the person…");
  for (;;) {
    // While it waits, the person's page says an agent is listening.
    const done = await listening(repo, id);
    review = await reviews.wait(id, (review) => review.sends.some((send) => !review.taken.some((taken) => taken.send === send.id))).finally(done);
    const taken = await reviews.take(id);
    review = await reviews.get(id);
    const number = roundInProgress(review);
    const asking = notesToAnswer(review, number);
    if (asking.length) return sayNotes(repo, review, number, asking, taken[0]?.by);
    if (taken.some((send) => send.looksGood.length)) return console.log(`\n${taken[0]!.by} says every moment looks good: the change is done. Nothing more to do.`);
  }
}

async function sayNotes(repo: Repo, review: Review, number: number, asking: string[], by = "The person") {
  const notes = allNotes(review);
  const pictures = await pictureNotes(repo, review, number, asking);
  const handedBack = review.rounds.findLast((round) => round.finished);
  console.log(`\n${by} said:`);
  for (const note of asking) {
    const on = notes.get(note)!.note.on;
    const name = on?.app?.from.scene ?? on?.scene;
    const scene = handedBack?.scenes.find((one) => one.name === name);
    const thing = on?.element ? `, on the ${on.element.role} ${quote(on.element.name)}` : "";
    console.log(`\n  ${note}  on ${name ? `the moment ${quote(name)}` : "the change as a whole"}${scene?.person ? `, as ${scene.person}` : ""}${thing}`);
    for (const turn of conversation(review, note)) console.log(`    ${turn.agent ? "You" : turn.by}: ${turn.words}`);
    if (pictures.get(note)) console.log(`    As they saw it: ${pictures.get(note)}`);
    if (scene?.person) console.log(`    To be there: playthrough as ${scene.person} ${JSON.stringify(scene.name)}`);
    if (on?.app?.did.length)
      console.log(`    They stepped into the app there, then: ${on.app.did.map((did) => `${did.does}${did.what ? ` ${quote(did.what)}` : ""}${typeof did.with === "string" && did.does !== "click" ? ` ${quote(did.with)}` : ""}`).join(", then ")}.`);
  }
  console.log(`\nChange the app. Then: playthrough again, which runs every moment again and says what's different; playthrough reply <note> "<what you did, in a line>" for each; then hand back with playthrough wait, in the background.`);
}
