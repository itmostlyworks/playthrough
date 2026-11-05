// What's new to you on the round, at the top of the page, each once, as a still of where it's seen: the review's index,
// as a pull request lists the files it changed. It's what the scenes' diamonds mark, counted the same way (new since you
// last said something about a scene it's in, or since Before), so the two never disagree: first the agent's answers to
// your notes, each by your note's words and its dot, then each moment something else changed, in Playthrough's words, and
// a scene Before never had. Pointed at, it's as Compare would show it there; pressed, it's gone to, close and beside
// that; once you've been there, it's quieter, as a file marked viewed. One row of them, the rest a press away (on a
// phone, a row that scrolls).
// Gathered by the page they were on, or the sidebar around every page, they were guessed at: Kan's card is a page
// named by the card's title, and on the public board, by the board behind it, so all of #525 was one still.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Reading } from "@playthrough/page";
import { lastLooked, type Place, type Review, type Round, type Scene } from "@playthrough/review";
import { picture, readings } from "./api.ts";
import type { Diamond } from "./changes.ts";
import { fill, type Shown } from "./notes.ts";
import { around, Picture, type Box } from "./Picture.tsx";
import { onPhone } from "./phone.ts";
import { regionsOf } from "./regions.ts";
import { CHIP } from "./Scene.tsx";

// Something new to you, where it's seen first: its scene and the step it's seen at the end of (new steps, the first
// of them), what's there, and how many scenes it's in.
export type Entry = {
  key: string;
  title: string;
  scene: Scene;
  step: number;
  places: Place[];
  scenes: number;
  since: number;
  // An answer to your note; or the diamond it's met at; or steps or a scene Before never had.
  note?: Shown;
  diamond?: string;
  isNew?: "steps" | "scene";
};

// The stills are the shape of a recording on a computer's screen, and this wide.
const SHAPE = 1.6;
const WIDE = 240;
const GAP = 20;

export function entriesOf(review: Review, round: Round, before: Round | undefined, diamonds: Diamond[], notes: Shown[], you: string): Entry[] {
  const scenes = round.scenes.map((scene) => scene.name);
  const sceneOf = (name: string) => round.scenes.find((scene) => scene.name === name)!;
  const stepAt = (scene: Scene, on: { at?: number; until?: number }) =>
    on.until !== undefined ? Math.max(0, scene.steps.findIndex((step) => step.at >= on.at! - 0.01)) : Math.max(0, scene.steps.findIndex((_, i) => (scene.steps[i + 1]?.at ?? scene.length) >= on.at! - 0.05));
  const answered = new Map(notes.map((note) => [note.id, note]));
  const answers: Entry[] = [];
  for (const note of new Set(diamonds.flatMap((diamond) => diamond.changes.flatMap((changed) => (changed.note && answered.has(changed.note) ? [changed.note] : []))))) {
    const made = diamonds.filter((diamond) => diamond.changes.some((changed) => changed.note === note));
    const diamond = made.find((diamond) => diamond.changes.some((changed) => changed.note === note && changed.answers)) ?? made.find((diamond) => diamond.scene === answered.get(note)!.on?.scene) ?? made[0]!;
    const theirs = diamond.changes.filter((changed) => changed.note === note);
    const scene = sceneOf(diamond.scene);
    answers.push({
      key: `note ${note}`,
      title: answered.get(note)!.turns[0]?.words ?? "",
      scene,
      step: stepAt(scene, diamond),
      places: theirs.filter((changed) => !changed.change.gone).map((changed) => changed.on),
      scenes: new Set(made.map((diamond) => diamond.scene)).size,
      since: Math.max(...theirs.map((changed) => changed.since)),
      note: answered.get(note),
    });
  }
  const others: Entry[] = diamonds.flatMap((diamond) => {
    const own = diamond.changes.filter((changed) => !(changed.note && answered.has(changed.note)));
    if (!own.length) return [];
    const shown = own.filter((changed) => !changed.change.gone);
    // Where its diamond is, unless nothing of it is on the screen there (a field pushed down past the window's foot):
    // then the first scene that has it on the screen, which is where it's pictured and gone to.
    const drawn = (on: Place) => on.element?.node !== undefined || !!on.alike?.length || !!on.box;
    const elsewhere = diamond.until === undefined && !shown.some((changed) => drawn(changed.on)) ? shown.flatMap((changed) => changed.change.seen).find((on) => drawn(on) && on.at !== undefined && scenes.includes(on.scene)) : undefined;
    const scene = sceneOf(elsewhere?.scene ?? diamond.scene);
    const step = stepAt(scene, elsewhere ?? diamond);
    const count = diamond.until === undefined ? 0 : scene.steps.filter((one) => one.at >= diamond.at - 0.01 && one.at < diamond.until! - 0.01).length;
    return [{
      key: diamond.id,
      title: diamond.until === undefined ? clause((shown[0] ?? own[0]!).change.words) : `${count > 1 ? `${count} new steps` : "A new step"}: “${scene.steps[step]?.title}”`,
      scene,
      step,
      places: elsewhere ? [elsewhere] : shown.map((changed) => changed.on),
      scenes: new Set(own.flatMap((changed) => changed.change.seen.map((seen) => seen.scene)).filter((name) => scenes.includes(name))).size,
      since: Math.max(...own.map((changed) => changed.since)),
      diamond: elsewhere && elsewhere.scene !== diamond.scene ? undefined : diamond.id,
      isNew: diamond.until === undefined ? undefined : "steps",
    }];
  });
  // A scene Before never had, that you haven't looked at, is new from its first step to its end: there's nothing it
  // could be compared with, so no diamond marks it.
  const wholly: Entry[] = before
    ? round.scenes
        .filter((scene) => scene.steps.length && !before.scenes.some((then) => then.name === scene.name) && !diamonds.some((diamond) => diamond.scene === scene.name) && lastLooked(review, you, scene.name, round.number) === undefined)
        .map((scene) => ({ key: `scene ${scene.name}`, title: scene.name, scene, step: scene.steps.length - 1, places: [], scenes: 1, since: 0, isNew: "scene" as const }))
    : [];
  const order = (entry: Entry) => scenes.indexOf(entry.scene.name) * 1e4 + (entry.scene.steps[entry.step]?.at ?? 0);
  return [...answers.sort((a, b) => order(a) - order(b)), ...[...others, ...wholly].sort((a, b) => order(a) - order(b))];
}

// Playthrough's words for a change, up to their first turn: “Comments tab is new”, not “…, and moved 20 things down”,
// nor what looks different about it, which the still shows.
function clause(words: string): string {
  let quoted = false;
  for (let i = 0; i < words.length; i++) {
    if (words[i] === "“") quoted = true;
    else if (words[i] === "”") quoted = false;
    else if (!quoted && (words.startsWith(", ", i) || words.startsWith(": ", i))) return words.slice(0, i);
  }
  return words;
}

// How it was, as Compare there shows it: for an answer, when the note was last said; else Before.
function thenOf(review: Review, round: Round, entry: Entry, you: string): { round?: Round; named: string } {
  const said = entry.note?.turns.findLast((turn) => !turn.agent && turn.round < round.number);
  if (said) return { round: review.rounds.find((kept) => kept.number === said.round), named: said.by === you ? "When you said it" : "When it was said" };
  return { round: review.rounds.find((kept) => kept.number === 0 && kept.scenes.length), named: "Before" };
}

export function NewToYou(props: { review: Review; round: Round; entries: Entry[]; you: string; seen: (entry: Entry) => boolean; onGo: (entry: Entry) => void }) {
  const { review, round, entries, you } = props;
  // The pictures read where each is seen now, and where it was then.
  const wanted = entries.flatMap((entry) => {
    const then = thenOf(review, round, entry, you).round;
    const was = then?.scenes.find((scene) => scene.name === entry.scene.name);
    return [{ round: round.number, scene: entry.scene }, ...(then && was ? [{ round: then.number, scene: was }] : [])];
  });
  const read = useRead(review, wanted);
  // One row: as many as fit, the last place saying how many more, which opens the rest in place.
  const row = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(entries.length);
  const [all, setAll] = useState(false);
  useLayoutEffect(() => {
    const here = row.current;
    if (!here) return;
    // On a phone, the row scrolls sideways instead.
    const measure = () => setFit(onPhone() ? Infinity : Math.max(2, Math.floor((here.clientWidth + GAP) / (WIDE + GAP))));
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(here);
    return () => watching.disconnect();
  }, [entries.length > 0]);
  if (!entries.length) return null;
  const shown = all || entries.length <= fit ? entries : entries.slice(0, fit - 1);
  const since = entries.some((entry) => entry.since > 0);
  return (
    <section className="mt-9">
      <p className="text-[13px] leading-5 text-soft">{since ? "What's new since you last looked" : "What's different from Before"}</p>
      <div ref={row} className="mt-3 flex flex-wrap gap-x-5 gap-y-6 phone:-mx-4 phone:flex-nowrap phone:overflow-x-auto phone:px-4 phone:pb-1">
        {shown.map((entry) => (
          <Still key={entry.key} review={review} round={round} entry={entry} then={thenOf(review, round, entry, you)} read={read} seen={props.seen(entry)} onGo={props.onGo} />
        ))}
        {shown.length < entries.length && (
          <button className="group flex w-[240px] flex-col text-left phone:hidden" onClick={() => setAll(true)}>
            <span className="grid aspect-[1.6] place-items-center rounded-lg text-[14px] leading-5 text-soft shadow-[0_0_0_1px_var(--edge)] transition-[background-color,color] duration-150 ease-calm group-hover:bg-hover group-hover:text-fg">
              {entries.length - shown.length} more
            </span>
          </button>
        )}
      </div>
    </section>
  );
}

function Still({ review, round, entry, then, read, seen, onGo }: { review: Review; round: Round; entry: Entry; then: { round?: Round; named: string }; read: Reader; seen: boolean; onGo: (entry: Entry) => void }) {
  const title = entry.scene.steps[entry.step]?.title;
  const now = read(round.number, entry.scene)?.findIndex((reading) => reading.step === title) ?? -1;
  const reading = read(round.number, entry.scene)?.[now];
  // Framed on the first part of the page it's in, as its diamond's pin is, outlined; new steps and a new scene, whole.
  const region = reading && regionsOf(entry.places.flatMap((on) => boxesOf(on, reading)), reading.screen)[0];
  const frame = region && reading ? around(region, reading.screen, SHAPE, 2.5) : undefined;
  const outline = region && frame && reading && {
    left: `${((region.x / reading.screen.width - frame.x) / frame.width) * 100}%`,
    top: `${((region.y / reading.screen.height - frame.y) / frame.height) * 100}%`,
    width: `${(region.width / reading.screen.width / frame.width) * 100}%`,
    height: `${(region.height / reading.screen.height / frame.height) * 100}%`,
  };
  const was = then.round?.scenes.find((scene) => scene.name === entry.scene.name);
  const wasAt = was ? (read(then.round!.number, was)?.findIndex((one) => one.step === title) ?? -1) : -1;
  const where = entry.scenes > 1 ? `In ${entry.scenes} scenes` : `In “${entry.scene.name}”`;
  return (
    <button className={`group flex w-[240px] flex-none flex-col text-left transition-opacity duration-300 ease-calm phone:w-[200px] ${seen ? "opacity-45 hover:opacity-100" : ""}`} onClick={() => onGo(entry)}>
      <span className="relative block aspect-[1.6] overflow-hidden rounded-lg bg-paper shadow-frame transition-shadow duration-150 ease-calm group-hover:shadow-[0_0_0_1px_rgb(20_24_34/0.22)]">
        {now >= 0 && <Picture shot={{ src: picture(review.id, round.number, entry.scene.recording, now), frame }} />}
        {outline && <span className="pointer-events-none absolute -m-1 rounded-md shadow-[0_0_0_1.5px_rgb(43_46_53/0.55)] transition-opacity duration-150 ease-calm group-hover:opacity-0" style={{ ...outline, padding: 4, boxSizing: "content-box" }} />}
        <span className="absolute inset-0 bg-paper opacity-0 transition-opacity duration-200 ease-calm group-hover:opacity-100">
          {was && wasAt >= 0 && !entry.isNew ? (
            <Picture shot={{ src: picture(review.id, then.round!.number, was.recording, wasAt), frame }} />
          ) : (
            <span className="grid size-full place-items-center px-6 text-center text-[13px] text-soft">{entry.isNew === "scene" || !was ? "New: there was nothing like it before" : "Before the work, there was no such step"}</span>
          )}
          <span className={CHIP}>{then.named}</span>
        </span>
      </span>
      <span className="mt-2.5 flex min-w-0 items-start gap-2 text-[14px] leading-5 font-semibold">
        {entry.note ? <i className={`mt-[6.5px] size-[7px] flex-none rounded-full ${fill(entry.note)}`} /> : <i className="mt-[6.5px] size-[7px] flex-none rotate-45 bg-fg" />}
        <span className="line-clamp-2">{entry.title}</span>
      </span>
      <span className="mt-0.5 block truncate pl-[15px] text-[12.5px] leading-[18px] text-soft">{entry.isNew === "scene" ? "A new scene" : where}</span>
    </button>
  );
}

type Reader = (round: number, scene: Scene) => Reading[] | undefined;

function useRead(review: Review, wanted: { round: number; scene: Scene }[]): Reader {
  const [kept, setKept] = useState(() => new Map<string, Reading[]>());
  const key = [...new Set(wanted.map(({ round, scene }) => `${round}/${scene.recording}`))].join("\n");
  useEffect(() => {
    let current = true;
    for (const { round, scene } of wanted)
      readings(review.id, round, scene.recording).then((got) => current && setKept((was) => (was.has(`${round}/${scene.recording}`) ? was : new Map(was).set(`${round}/${scene.recording}`, got))));
    return () => void (current = false);
  }, [review.id, key]);
  return (round, scene) => kept.get(`${round}/${scene.recording}`);
}

// Where a change is on the screen a step was read on: each thing it's on, or the part of the page.
function boxesOf(on: Place, reading: Reading): Box[] {
  const { width, height } = reading.screen;
  return [
    ...[on.element, ...(on.alike ?? [])].flatMap((element) => (element?.node === undefined ? [] : reading.things.filter((thing) => thing.node === element.node).map((thing) => thing.box))),
    ...(on.box ? [{ x: on.box.x * width, y: on.box.y * height, width: on.box.width * width, height: on.box.height * height }] : []),
  ];
}
