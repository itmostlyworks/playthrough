// A rough try at moments: what's waiting on you, each change by its title with its moments under it, a line each in the
// agent's words; and a moment opened, the app at the point that matters, still and as large as the window allows. From
// there: look (play the few seconds that led here), step in (the real app there, as that person), or say something (a
// note on what you click). Going on to the next moment is the yes. What you said goes to the agent by the change's one
// button on the list: Send, or Done with nothing to say. Its own address, /moments, beside the page; the recording, the pointer, the pins and
// stepping in are the page's own.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import { allNotes, conversation, newId, pausedAt, waitingForTheAgent, type Turn, type Did, type Note, type Place, type Review, type Round, type Scene } from "@playthrough/review";
import { glimpses, keepBranch, picture, readings as readingsOf, recording, send, useReview, useYou } from "./api.ts";
import { Key } from "./Card.tsx";
import { around, Picture, union, type Frame } from "./Picture.tsx";
import { workingSince } from "./notes.ts";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Clock, Player, useCut, type Mark, type Placed } from "./Player.tsx";
import { Portal, TAG } from "./Portal.tsx";
import { CHIP } from "./Scene.tsx";
import { readyAt } from "./live.ts";
import { clamp } from "./moments.ts";
import type { Scrolled } from "./replay.ts";

// Where you are: the list, or a change's moment, by its place in the list from 1.
type Where = { review?: string; moment?: number };
const whereFrom = (path: string): Where => {
  const [, review, moment] = path.split("/").filter(Boolean).map(decodeURIComponent);
  return review ? { review, moment: Math.max(1, Number(moment) || 1) } : {};
};
const pathOf = ({ review, moment }: Where) => (review ? `/moments/${encodeURIComponent(review)}/${moment ?? 1}` : "/moments");

export function MomentsPage() {
  const [where, setWhere] = useState(() => whereFrom(location.pathname));
  useEffect(() => {
    const back = () => setWhere(whereFrom(location.pathname));
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, []);
  // Going from one moment to the next replaces the address, so the browser's back is the list, as Back is.
  const go = (to: Where, replace = false) => {
    history[replace ? "replaceState" : "pushState"](null, "", pathOf(to));
    setWhere(to);
  };
  useEffect(() => void (document.title = "Moments · Playthrough"), []);
  return where.review ? <Change key={where.review} id={where.review} moment={where.moment ?? 1} go={go} /> : <List onOpen={(review, moment) => go({ review, moment })} />;
}

// Your notes on a change not yet sent, kept in this browser until you send them.
const unsentKey = (review: string) => `playthrough:moments:${review}`;
function unsentOf(review: string): Note[] {
  try {
    return JSON.parse(localStorage.getItem(unsentKey(review)) ?? "[]");
  } catch {
    return [];
  }
}
function keepUnsent(review: string, notes: Note[]) {
  try {
    if (notes.length) localStorage.setItem(unsentKey(review), JSON.stringify(notes));
    else localStorage.removeItem(unsentKey(review));
  } catch {}
}
// Your replies on notes already sent, kept in this browser until you send them, by note.
type Replied = { note: string; words: string };
const repliesKey = (review: string) => `playthrough:moments-replies:${review}`;
function repliesOf(review: string): Replied[] {
  try {
    return JSON.parse(localStorage.getItem(repliesKey(review)) ?? "[]");
  } catch {
    return [];
  }
}
function keepReplies(review: string, replies: Replied[]) {
  try {
    if (replies.length) localStorage.setItem(repliesKey(review), JSON.stringify(replies));
    else localStorage.removeItem(repliesKey(review));
  } catch {}
}
// What Send says it sends: notes and replies, by their count.
const toSend = (notes: number, replies: number) =>
  [notes && `${notes} ${notes === 1 ? "note" : "notes"}`, replies && `${replies} ${replies === 1 ? "reply" : "replies"}`].filter(Boolean).join(" and ");
// Each moment's taking: seen per taking, so one that's different since asks for you again, once.
const takingOf = (round: Round, scene: string) => `${round.number}:${scene}`;
// The moments that look different since the taking before, by Playthrough's own comparison, with its words.
function differentSince(review: Review, round: Round): Map<string, string[]> {
  const before = review.rounds.findLast((one) => one.number < round.number && one.number > 0 && one.finished);
  const compared = before && review.comparisons.find((one) => one.round === round.number && one.since === before.number);
  const different = new Map<string, string[]>();
  for (const change of compared?.changes ?? []) for (const seen of change.seen) different.set(seen.scene, [...(different.get(seen.scene) ?? []), change.words]);
  return different;
}

// The moments you've opened, by change and by you, in this browser: seen, they're quieter on the list.
const seenKey = (review: string, you: string) => `playthrough:moments-seen:${review}:${you}`;
function seenOf(review: string, you: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(seenKey(review, you)) ?? "[]");
  } catch {
    return [];
  }
}
function markSeen(review: string, you: string, scene: string) {
  const seen = seenOf(review, you);
  if (seen.includes(scene)) return;
  try {
    localStorage.setItem(seenKey(review, you), JSON.stringify([...seen, scene]));
  } catch {}
}

// A change has moments when its latest round is finished with some in it.
const latestOf = (review: Review): Round | undefined => review.rounds.findLast((round) => round.number > 0 && !!round.finished && round.scenes.length > 0);
const sentBy = (review: Review, you: string) => review.sends.filter((one) => one.by === you);
// Waiting on you until you've sent something on its latest moments, or said Done; then it's with your agents.
const sentOn = (review: Review, you: string) => {
  const round = latestOf(review);
  return round ? sentBy(review, you).filter((one) => one.round === round.number) : [];
};

// What the moments page knows beside the review: the app's name, its people as the list says them, what each moment is
// about.
export type Shown = { app?: string; people: Record<string, string>; moments: About[] };
function useShown(id: string): Shown {
  const [shown, setShown] = useState<Shown>({ people: {}, moments: [] });
  useEffect(() => {
    let current = true;
    fetch(`/api/reviews/${encodeURIComponent(id)}/moments`)
      .then((answer) => (answer.ok ? answer.json() : []), () => [])
      // A viewer started before it said more than the moments says only those.
      .then((said: Shown | About[]) => current && setShown(Array.isArray(said) ? { people: {}, moments: said } : said));
    return () => void (current = false);
  }, [id]);
  return shown;
}
const whoIn = (shown: Shown, scene: Scene) => (scene.person ? (shown.people[scene.person] ?? scene.person) : "");

// How long ago, as a person says it.
function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const notesSaid = (count: number) => `${count} ${count === 1 ? "note" : "notes"}`;

// Where a change stands for you: waiting on you; with your agents, once you've sent notes on its latest moments; or
// done, once you said Done, which sends that every moment looks good. Nothing about Done is final: a note later sends
// as any other, and the change is with your agents again.
type Standing = { is: "waiting" } | { is: "sent"; at: string; notes: number; replies: number } | { is: "done"; at: string };
function standingOf(review: Review, you: string): Standing {
  if (review.accepted) return { is: "done", at: review.accepted.at };
  const sends = sentOn(review, you);
  const last = sends.at(-1);
  if (!last) return { is: "waiting" };
  const saidNothing = (one: Review["sends"][number]) => !one.notes.length && !one.verdicts.length && !one.replies?.length;
  if (saidNothing(last)) return { is: "done", at: last.sent };
  const since = sends.slice(sends.findLastIndex(saidNothing) + 1);
  return { is: "sent", at: last.sent, notes: since.reduce((sum, one) => sum + one.notes.length, 0), replies: since.reduce((sum, one) => sum + (one.replies?.length ?? 0), 0) };
}

// The quiet lines you've opened, kept while you go to a moment and back.
const openKey = "playthrough:moments-open";
function openedLines(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(openKey) ?? "[]");
  } catch {
    return [];
  }
}
function keepOpened(ids: string[]) {
  try {
    sessionStorage.setItem(openKey, JSON.stringify(ids));
  } catch {}
}
// So many done changes show; the rest wait behind one line.
const LATEST = 5;

// What's waiting on you: each change by its title, its moments as stills you can judge at a glance. Under them, those
// with your agents and those done, a quiet line each that opens to the same stills. A change moves by its one button:
// Send, with what you said, or Done, with nothing to say.
function List({ onOpen }: { onOpen: (review: string, moment: number) => void }) {
  const you = useYou();
  const [reviews, setReviews] = useState<Review[]>();
  const [opened, setOpened] = useState(openedLines);
  const [earlier, setEarlier] = useState(false);
  // What moved this visit arrives where it goes, gently.
  const [moved, setMoved] = useState<string[]>([]);
  const load = () => fetch("/api/reviews").then((answer) => answer.json() as Promise<Review[]>).then(setReviews);
  useEffect(() => void load(), []);
  const now = Date.now();
  if (!reviews || !you) return <div className="min-h-dvh bg-ground" />;
  const all = reviews.filter((review) => latestOf(review)).map((review) => ({ review, standing: standingOf(review, you) }));
  const newest = (a: (typeof all)[number], b: (typeof all)[number]) => ("at" in b.standing ? b.standing.at : "").localeCompare("at" in a.standing ? a.standing.at : "");
  const waiting = all.filter((one) => one.standing.is === "waiting");
  const withAgents = all.filter((one) => one.standing.is === "sent").sort(newest);
  const done = all.filter((one) => one.standing.is === "done").sort(newest);
  // Ctrl+Enter sends the first change with something to send, as a page's send sends its one review.
  const keyed = [...waiting, ...withAgents, ...done].find(({ review }) => unsentOf(review.id).length)?.review.id;
  const toggle = (id: string) => {
    const next = opened.includes(id) ? opened.filter((one) => one !== id) : [...opened, id];
    setOpened(next);
    keepOpened(next);
  };
  const change = ({ review, standing }: (typeof all)[number]) => (
    <ChangeInList
      key={review.id}
      review={review}
      standing={standing}
      you={you}
      now={now}
      open={standing.is === "waiting" || opened.includes(review.id)}
      arrived={moved.includes(review.id)}
      keyed={keyed === review.id}
      onToggle={() => toggle(review.id)}
      onOpen={(moment) => onOpen(review.id, moment)}
      onMoved={() => (setMoved((ids) => [...ids, review.id]), void load())}
    />
  );
  return (
    <div className="min-h-dvh bg-ground">
      <main className="mx-auto max-w-[1040px] px-8 pt-12 pb-24 phone:px-4 phone:pt-6">
        <h1 className="text-[13px] leading-5 font-semibold text-soft">Waiting on you</h1>
        {!waiting.length && <p className="mt-4 animate-arrive text-[15px] leading-[22px] text-fg">Nothing's waiting on you.</p>}
        {waiting.map(change)}
        {withAgents.length > 0 && (
          <section className="mt-14">
            <h2 className="text-[13px] leading-5 font-semibold text-soft">With your agents</h2>
            <div className="mt-2">{withAgents.map(change)}</div>
          </section>
        )}
        {done.length > 0 && (
          <section className="mt-12">
            <h2 className="text-[13px] leading-5 font-semibold text-soft">Done</h2>
            <div className="mt-2">{done.slice(0, LATEST).map(change)}</div>
            {done.length > LATEST && (
              <>
                <button onClick={() => setEarlier(!earlier)} aria-expanded={earlier} className={LINE_ROW}>
                  <Chevron open={earlier} />
                  <span className="text-soft">Earlier · {done.length - LATEST}</span>
                </button>
                <Fold open={earlier}>{done.slice(LATEST).map(change)}</Fold>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

const LINE_ROW = "-mx-2 flex w-[calc(100%+16px)] items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-[14px] leading-[22px] transition-colors duration-150 ease-calm hover:bg-hover";

// Opening and closing in place: what's under it moves, nothing above it.
function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] ease-calm ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0"}`} style={{ transitionDuration: `${LEAVING}ms` }} inert={!open}>
      <div className="-mx-2 min-h-0 overflow-hidden px-2">{children}</div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`size-3 flex-none translate-y-[1px] self-center text-faint transition-transform duration-200 ease-calm ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 2.5L8 6l-3.5 3.5" />
    </svg>
  );
}

// A change on the list, as it stands: waiting, its title and its stills, with Done or Send; with your agents or done, a quiet line
// that opens to the same stills, muted, with Send once you've said something on it.
function ChangeInList(props: {
  review: Review;
  standing: Standing;
  you: string;
  now: number;
  open: boolean;
  arrived: boolean;
  keyed: boolean;
  onToggle: () => void;
  onOpen: (moment: number) => void;
  onMoved: () => void;
}) {
  const { review, standing, you, now, open, arrived, keyed, onToggle, onOpen, onMoved } = props;
  const round = latestOf(review)!;
  const shown = useShown(review.id);
  const [notes] = useState(() => unsentOf(review.id));
  const [replies] = useState(() => repliesOf(review.id));
  const [seen] = useState(() => seenOf(review.id, you));
  const different = differentSince(review, round);
  const said = notes.length + replies.length;
  const [problems, setProblems] = useState<string[]>();
  const [busy, setBusy] = useState(false);
  // Sent or done, it folds away where it was and arrives as its line where it goes.
  const [leaving, setLeaving] = useState(false);
  const waiting = standing.is === "waiting";
  const say = async (what: { notes: Note[]; replies?: Replied[]; looksGood: string[] }) => {
    if (busy || leaving) return;
    setBusy(true);
    const said = await send(review.id, { id: newId(), round: round.number, by: you, sent: new Date().toISOString(), verdicts: [], ...what });
    setBusy(false);
    if (said.length) return setProblems(said);
    keepUnsent(review.id, []);
    keepReplies(review.id, []);
    setLeaving(true);
    setTimeout(onMoved, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : LEAVING);
  };
  const sendNow = () => (said ? say({ notes, ...(replies.length && { replies }), looksGood: [] }) : Promise.resolve());
  // Done says every moment looks good to you, and that you've nothing more to say: the agent hears it as it hears a
  // send, and the change can still take a note later.
  const doneNow = () => say({ notes: [], looksGood: round.scenes.map((scene) => scene.name) });
  // Ctrl+Enter sends, as on the page; never a plain Enter, and never Done.
  const keys = useRef(sendNow);
  keys.current = () => (keyed ? sendNow() : Promise.resolve());
  useEffect(() => {
    const down = (event: KeyboardEvent) => event.key === "Enter" && (event.ctrlKey || event.metaKey) && (event.preventDefault(), void keys.current());
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, []);
  const button = (said || waiting) && (
    <button
      onMouseDown={(event) => event.preventDefault()}
      onClick={said ? sendNow : doneNow}
      disabled={busy || leaving}
      className="flex h-8 flex-none items-center gap-2 self-start rounded-lg bg-surface px-3 text-[13px] font-medium whitespace-nowrap text-fg shadow-[0_0_0_1px_var(--edge),0_1px_2px_var(--drop)] transition-[background-color,opacity] duration-150 ease-calm enabled:hover:bg-hover"
    >
      {said ? <>Send {toSend(notes.length, replies.length)} <Key>Ctrl ↵</Key></> : "Done"}
    </button>
  );
  const not = problems && <span className="text-amber-ink"> · Not sent: {problems[0]}</span>;
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity,margin] ease-calm ${leaving ? "mt-0 grid-rows-[0fr] opacity-0" : `grid-rows-[1fr] ${waiting ? "mt-12 first-of-type:mt-6" : ""}`} ${arrived ? "animate-arrive" : ""}`}
      style={{ transitionDuration: `${LEAVING}ms` }}
    >
      <div className={`min-h-0 ${leaving ? "overflow-hidden" : ""}`}>
        {waiting ? (
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] leading-[22px] font-semibold text-fg">{review.title}</h2>
              <p className="text-[13px] leading-5 text-soft">
                {[shown.app, ago(round.finished!, now)].filter(Boolean).join(" · ")}
                {not}
              </p>
            </div>
            {button}
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button onClick={onToggle} aria-expanded={open} className={`${LINE_ROW} min-w-0 flex-1`}>
              <Chevron open={open} />
              <span className="min-w-0">
                <span className="text-fg">{review.title}</span>
                <span className="text-soft">
                  {" · "}
                  {standing.is === "done" ? `Done ${ago(standing.at, now)}` : <Sent review={review} you={you} now={now} standing={standing} />}
                </span>
                {not}
              </span>
            </button>
            {button}
          </div>
        )}
        <Fold open={open}>
          <ol className={`grid grid-cols-3 gap-x-5 gap-y-6 phone:grid-cols-1 [@media(min-width:821px)_and_(max-width:1000px)]:grid-cols-2 ${waiting ? "mt-4" : "mt-3 mb-6"}`}>
            {round.scenes.map((scene, i) => {
              // Seen in this taking, or the same as one seen before, it's quieter; different since, it asks again.
              const seenBefore = seen.some((one) => one === scene.name || one.endsWith(`:${scene.name}`));
              const quiet = !waiting || seen.includes(takingOf(round, scene.name)) || (seenBefore && !different.has(scene.name));
              const talk = [...allNotes(review)].filter(([, kept]) => (kept.note.on?.app?.from.scene ?? kept.note.on?.scene) === scene.name);
              return (
                <li key={scene.name}>
                  <button onClick={() => onOpen(i + 1)} className="group block w-full text-left">
                    <Still review={review} round={round} scene={scene} about={shown.moments.find((one) => one.words === scene.name)?.about} seen={quiet} />
                    <span className={`mt-2.5 block text-[13px] leading-5 ${quiet ? "text-faint" : "text-soft"}`}>{whoIn(shown, scene)}</span>
                    <span className={`block text-[14px] leading-5 ${quiet ? "text-soft" : "text-fg"}`}>{scene.name}</span>
                    {waiting && !quiet && seenBefore && different.has(scene.name) && <span className="mt-0.5 block text-[13px] leading-5 text-amber-ink">Different since you saw it</span>}
                  </button>
                  {talk.map(([id]) => (
                    <Talk key={id} turns={conversation(review, id)} replied={replies.find((one) => one.note === id)?.words} />
                  ))}
                  {notes
                    .filter((note) => note.on?.scene === scene.name)
                    .map((note) => (
                      <p key={note.id} className="mt-1.5 flex items-baseline gap-2 text-[13px] leading-5 text-soft">
                        <i className="size-1.5 flex-none translate-y-[-1px] rounded-full bg-amber" />
                        <span className="line-clamp-2 min-w-0">{note.words}</span>
                      </p>
                    ))}
                </li>
              );
            })}
          </ol>
        </Fold>
      </div>
    </div>
  );
}

// A note and what's been said on it since, a line each: yours with its dot, the agent's under its name.
function Talk({ turns, replied }: { turns: Turn[]; replied?: string }) {
  const lines = [...turns.map((turn) => ({ by: turn.agent ? turn.by : undefined, words: turn.words })), ...(replied ? [{ by: undefined, words: replied, unsent: true }] : [])];
  return (
    <div className="mt-1.5">
      {lines.map((line, i) =>
        line.by ? (
          <p key={i} className="mt-1 ml-3.5 text-[13px] leading-5 text-soft">
            <span className="text-faint">{line.by}: </span>
            <span className="line-clamp-2 inline">{line.words}</span>
          </p>
        ) : (
          <p key={i} className="mt-1 flex items-baseline gap-2 text-[13px] leading-5 text-soft">
            <i className={`size-1.5 flex-none translate-y-[-1px] rounded-full ${"unsent" in line ? "bg-amber" : "bg-slate"}`} />
            <span className="line-clamp-2 min-w-0">{line.words}</span>
          </p>
        ),
      )}
    </div>
  );
}

// What you sent and when, and what the agent is doing with it, in the page's words.
function Sent({ review, you, now, standing }: { review: Review; you: string; now: number; standing: Extract<Standing, { is: "sent" }> }) {
  const { review: live, agentWaiting } = useReview(review.id);
  const kept = live && !Array.isArray(live) ? live : review;
  const working = workingSince(kept, latestOf(kept)!);
  const agent = working ? "the agent is working" : waitingForTheAgent(kept).length ? (agentWaiting === false ? "no agent is waiting, tell your agent" : "waiting for the agent") : undefined;
  void you;
  return (
    <>
      {standing.notes + standing.replies ? `${toSend(standing.notes, standing.replies)} sent ${ago(standing.at, now)}` : `sent ${ago(standing.at, now)}`}
      {agent && ` · ${agent}`}
    </>
  );
}

const LEAVING = 380;

// Each edge of a part of the page that isn't the page's own edge fades out.
function fadeOf(frame: Frame): React.CSSProperties {
  const [left, right, top, bottom] = [frame.x > 0.001, frame.x + frame.width < 0.999, frame.y > 0.001, frame.y + frame.height < 0.999].map((cut) => (cut ? FADE : 0));
  const mask = `linear-gradient(to right, transparent, #000 ${left}px, #000 calc(100% - ${right}px), transparent), linear-gradient(to bottom, transparent, #000 ${top}px, #000 calc(100% - ${bottom}px), transparent)`;
  return { maskImage: mask, WebkitMaskImage: mask, maskComposite: "intersect", WebkitMaskComposite: "source-in" };
}

// A moment's still: the app at its point, closed in on what it's about with enough around it to know where you are; the
// whole screen where it names nothing. Its nearest words come with it, as a field's label and the line under it, where
// they fit; what runs off an edge the page goes on past fades there rather than being cut. Seen, it's quieter.
const STILL = 1.6;
const FADE = 20;
function Still({ review, round, scene, about, seen }: { review: Review; round: Round; scene: Scene; about?: { role: string; name: string }; seen: boolean }) {
  const [frame, setFrame] = useState<Frame>();
  useEffect(() => {
    let current = true;
    readingsOf(review.id, round.number, scene.recording).then((read) => {
      const last = read.at(-1);
      const thing = about && last?.things.find((one) => one.role === about.role && one.name === about.name);
      if (!current || !last || !thing) return;
      const gap = (a: number, aSize: number, b: number, bSize: number) => Math.max(0, Math.max(a, b) - Math.min(a + aSize, b + bSize));
      const near = last.things.filter(
        (one) => one.role !== "box" && one.holder === thing.holder && gap(one.box.y, one.box.height, thing.box.y, thing.box.height) <= 40 && gap(one.box.x, one.box.width, thing.box.x, thing.box.width) <= 24,
      );
      // A line of words is laid out across its whole column: it's as wide as its words, as near as can be told.
      const wordsOf = (one: (typeof near)[number]) =>
        one.words && /^(text|heading)$/.test(one.role) ? { ...one.box, width: Math.min(one.box.width, one.words.length * parseFloat(one.look.size) * 0.55) } : one.box;
      setFrame(around(union([thing.box, ...near.map(wordsOf)]), last.screen, STILL, 3));
    });
    return () => void (current = false);
  }, [scene.recording, about?.name]);
  return (
    <span className={`relative block aspect-[1.6] overflow-hidden rounded-lg bg-paper shadow-frame transition-[filter,opacity] duration-200 ease-calm group-hover:opacity-100 group-hover:grayscale-0 ${seen ? "opacity-60 grayscale" : ""}`}>
      <span className="absolute inset-0" style={frame && fadeOf(frame)}>
        <Picture shot={{ src: picture(review.id, round.number, scene.recording, Math.max(0, scene.steps.length - 1)), frame }} />
      </span>
    </span>
  );
}

// Each moment's thing it's about, as `playthrough moment` keeps it, by its words.
type About = { words: string; about?: { role: string; name: string } };

function Change({ id, moment, go }: { id: string; moment: number; go: (to: Where, replace?: boolean) => void }) {
  const { review } = useReview(id);
  const you = useYou();
  // Back on the list, the change you were in is open, wherever it stands.
  useEffect(() => void (openedLines().includes(id) || keepOpened([...openedLines(), id])), [id]);
  const shown = useShown(id);
  const [notes, setNotesNow] = useState(() => unsentOf(id));
  const setNotes = (change: (notes: Note[]) => Note[]) =>
    setNotesNow((now) => {
      const next = change(now);
      keepUnsent(id, next);
      return next;
    });
  const [replies, setRepliesNow] = useState(() => repliesOf(id));
  const setReplies = (change: (replies: Replied[]) => Replied[]) =>
    setRepliesNow((now) => {
      const next = change(now);
      keepReplies(id, next);
      return next;
    });
  if (!review || Array.isArray(review) || !you) return <div className="h-dvh bg-ground" />;
  const round = latestOf(review);
  if (!round) return <div className="grid h-dvh place-items-center bg-ground text-soft">Nothing is waiting on you here.</div>;
  const n = Math.min(moment, round.scenes.length);
  const scene = round.scenes[n - 1]!;
  markSeen(id, you, takingOf(round, scene.name));
  const sent = sentBy(review, you).flatMap((one) => one.notes);
  return (
    <MomentView
      key={`${round.number}`}
      review={review}
      round={round}
      n={n}
      about={shown.moments.find((one) => one.words === scene.name)?.about}
      who={whoIn(shown, scene)}
      notes={notes}
      sent={sent}
      setNotes={setNotes}
      replies={replies}
      setReplies={setReplies}
      onMoment={(to) => go({ review: id, moment: to }, true)}
      onLeave={() => go({})}
    />
  );
}

type Live = { scene: string; from: number; address?: string; shown: boolean; settled?: boolean; problems?: string[]; at?: { x: number; y: number } };
type Writing = { note: Note; spot: { x: number; y: number } };

function MomentView(props: {
  review: Review;
  round: Round;
  n: number;
  about?: { role: string; name: string };
  who: string;
  notes: Note[];
  sent: Note[];
  setNotes: (change: (notes: Note[]) => Note[]) => void;
  replies: Replied[];
  setReplies: (change: (replies: Replied[]) => Replied[]) => void;
  onMoment: (n: number) => void;
  onLeave: () => void;
}) {
  const { review, round, n, about, who, notes, sent, setNotes, replies, setReplies, onMoment, onLeave } = props;
  const scene = round.scenes[n - 1]!;
  const count = round.scenes.length;
  const end = Math.max(0, scene.length - 0.05);
  const [readings, setReadings] = useState<Reading[]>();
  const [glimpsed, setGlimpsed] = useState<Glimpse[]>();
  useEffect(() => {
    let current = true;
    setReadings(undefined);
    setGlimpsed(undefined);
    readingsOf(review.id, round.number, scene.recording).then((read) => current && setReadings(read));
    glimpses(review.id, round.number, scene.recording).then((read) => current && setGlimpsed(read));
    return () => void (current = false);
  }, [scene.recording]);
  // The others are fetched as this one opens, so going on to the next is as quick as the first.
  useEffect(() => {
    for (const other of round.scenes) {
      void recording(review.id, round.number, other.recording).catch(() => {});
      new Image().src = picture(review.id, round.number, other.recording, Math.max(0, other.steps.length - 1));
    }
  }, [round]);
  const screen = readings?.at(-1)?.screen ?? { width: 1280, height: 800 };
  const cut = useCut(review.id, round.number, scene);
  const [clockOf] = useState(() => new Clock(end));
  const [playing, setPlaying] = useState<{ until: number }>();
  // Where it rests: the point, as it opens, or wherever it was paused or let go. Another moment opens at its own point.
  const [rest, setRest] = useState({ scene: scene.name, at: end });
  const at = rest.scene === scene.name ? rest.at : end;
  const restAt = (moment: number) => (clockOf.set(moment), setRest({ scene: scene.name, at: moment }));
  const [scrubbing, setScrubbing] = useState(false);
  const atPoint = !playing && !scrubbing && at >= end - 0.02;
  // The few seconds Play shows, waiting cut short, as the line along the recording counts them.
  const start = cut ? cut.real(Math.max(0, cut.length - LEADING)) : 0;
  const shareOf = (moment: number) => (cut ? clamp((cut.cut(moment) - cut.cut(start)) / Math.max(0.01, cut.cut(end) - cut.cut(start))) : 1);
  const momentOf = (share: number) => (cut ? Math.min(end, cut.real(cut.cut(start) + share * (cut.cut(end) - cut.cut(start)))) : end);
  const [noting, setNoting] = useState(false);
  // Compare: this moment as it was when it was last handed back, beside how it is now.
  const then = (() => {
    const earlier = review.rounds.findLast((one) => one.number > 0 && one.number < round.number && one.finished && one.scenes.some((kept) => kept.name === scene.name));
    const kept = earlier?.scenes.find((one) => one.name === scene.name);
    return earlier && kept ? { round: earlier, scene: kept } : undefined;
  })();
  const [comparing, setComparing] = useState(false);
  const compare = () => then && !live?.shown && (setPlaying(undefined), setOpen(undefined), setNoting(false), setComparing((now) => !now));
  const [writing, setWriting] = useState<Writing>();
  const [open, setOpen] = useState<string>();
  const [placed, setPlaced] = useState<Placed>({});
  const [live, setLive] = useState<Live>();
  const scrolled = useRef<(() => Scrolled) | undefined>(undefined);
  const frame = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const pill = useRef<HTMLSpanElement>(null);
  const [aiming, setAiming] = useState(false);
  // What you did in the app, recorded from when it was handed to you, for a note made there to be on.
  const session = useRef<{ id: string; events: { timestamp: number }[]; did: Did[]; kept: number }>({ id: newId(), events: [], did: [], kept: 0 });

  // Going to another moment, everything about this one is let go of.
  useEffect(() => {
    setPlaying(undefined);
    setNoting(false);
    setWriting(undefined);
    setOpen(undefined);
    setPlaced({});
    setLive(undefined);
    setScrubbing(false);
    setComparing(false);
    clockOf.set(end);
  }, [n]);

  const inApp = !!live?.shown && !!live.settled && !!live.address;
  const stepping = !!live?.shown && !inApp;
  const person = scene.person;

  const play = () => {
    if (live?.shown || writing || comparing) return;
    setOpen(undefined);
    setNoting(false);
    if (!cut) return;
    // Paused, it stays where it is; played, it carries on from there, or from the start of the few seconds at the point.
    if (playing) return (setPlaying(undefined), restAt(clockOf.at));
    clockOf.set(atPoint || at < start ? start : at);
    setPlaying({ until: end });
  };
  const stepIn = () => {
    if (live?.shown) return back();
    const paused = pausedAt(scene, at);
    if (!paused || writing) return;
    setComparing(false);
    setPlaying(undefined);
    setOpen(undefined);
    setNoting(false);
    if (live?.address && live.scene === scene.name && live.from === at) return setLive({ ...live, shown: true, at: undefined });
    session.current = { id: newId(), events: [], did: [], kept: 0 };
    setLive({ scene: scene.name, from: at, shown: true });
    readyAt(review.id, scene.name, paused).then((answer) =>
      setLive((now) => (now?.scene !== scene.name || now.from !== at ? now : typeof answer === "string" ? { ...now, address: answer } : { ...now, problems: answer, shown: false })),
    );
  };
  const back = (at?: { x: number; y: number }) => {
    setNoting(false);
    setLive((now) => now && { ...now, shown: false, at });
    window.focus();
  };
  const note = () => {
    if (writing || stepping) return;
    setPlaying(undefined);
    setOpen(undefined);
    setNoting((now) => !now);
  };
  const next = (by: number) => {
    if (writing || live?.shown) return;
    const to = n + by;
    if (to < 1) return;
    if (to > count) return onLeave();
    onMoment(to);
  };

  // In the app, noting goes there: it rings what's under the pointer and tells what's clicked.
  useEffect(() => {
    document.querySelector<HTMLIFrameElement>("[data-live] iframe")?.contentWindow?.postMessage({ playthrough: "noting", on: noting && inApp }, "*");
  }, [noting, inApp]);
  const heard = useRef<(data: any) => void>(() => {});
  heard.current = async (data) => {
    if (data.playthrough === "settled") setLive((now) => now && { ...now, settled: true });
    if (data.playthrough === "escape") noting ? setNoting(false) : back({ x: data.x, y: data.y });
    if (data.playthrough === "note") note();
    if (data.playthrough === "recorded") session.current.events.push(...data.events);
    if (data.playthrough === "did") session.current.did = data.did;
    if (data.playthrough === "noted") {
      setNoting(false);
      const iframe = document.querySelector<HTMLIFrameElement>("[data-live] iframe");
      const shown = frame.current?.getBoundingClientRect();
      const box = iframe?.getBoundingClientRect();
      const kept = session.current;
      if (!iframe || !box || !shown || !kept.events.length) return;
      kept.did = data.did;
      const from = { scene: scene.name, at: Math.round((live?.from ?? end) * 100) / 100 };
      const file = `${kept.id}-${++kept.kept}.json`;
      const now = { type: 5, data: { tag: "now", payload: {} }, timestamp: kept.events.at(-1)!.timestamp };
      const length = await keepBranch(review.id, round.number, from, [...kept.events, now], file);
      if (typeof length !== "number") return setLive((live) => live && { ...live, problems: length });
      const spot = { x: box.left - shown.left + (data.x * box.width) / iframe.offsetWidth, y: box.top - shown.top + (data.y * box.height) / iframe.offsetHeight };
      const on: Place = { scene: scene.name, at: Math.floor(length * 100) / 100, ...(data.element ? { element: data.element } : data.point && { point: data.point }), app: { from, did: data.did, recording: `branches/${file}`, length } };
      setWriting({ note: { id: newId(), on, words: "" }, spot });
    }
  };
  useEffect(() => {
    const told = ({ data, source }: MessageEvent) => {
      const app = document.querySelector<HTMLIFrameElement>("[data-live] iframe")?.contentWindow;
      if (data?.playthrough && source === app) heard.current(data);
    };
    addEventListener("message", told);
    return () => removeEventListener("message", told);
  }, []);

  // Saved, a note made in the app shows there as a pin on what it's on.
  const pinInApp = (note: Note, number: number) =>
    document.querySelector<HTMLIFrameElement>("[data-live] iframe")?.contentWindow?.postMessage({ playthrough: "pin", id: note.id, number, css: note.on?.element?.css, point: note.on?.point }, "*");
  const save = (words: string) => {
    if (!writing) return;
    const kept = { ...writing.note, words };
    setNotes((all) => [...all, kept]);
    setWriting(undefined);
    if (kept.on?.app && inApp) pinInApp(kept, mine.length + 1);
  };

  // The keys: Space plays, T steps in and back, N notes, ↓ and ↑ go a moment on and back, Escape lets go.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    const typing = event.target instanceof HTMLElement && event.target.closest("textarea, input, [contenteditable]");
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (open) setOpen(undefined);
      else if (comparing) setComparing(false);
      else if (noting) setNoting(false);
      else if (live?.shown) back();
      return;
    }
    if (live?.shown && !/^(t|n)$/.test(key)) return;
    const did = { " ": play, t: stepIn, n: note, c: compare, arrowdown: () => next(1), arrowright: () => next(1), j: () => next(1), arrowup: () => next(-1), arrowleft: () => next(-1), k: () => next(-1) }[key];
    if (!did || event.repeat) return;
    event.preventDefault();
    did();
  };
  useEffect(() => {
    const down = (event: KeyboardEvent) => keys.current(event);
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, []);
  // The wheel goes a moment at a time: one turn, a notch or a swipe, is one moment, and the next waits for it to end.
  const wheel = useRef({ sum: 0, quiet: 0, spent: false });
  const onWheel = (event: React.WheelEvent) => {
    if (writing || live?.shown) return;
    const it = wheel.current;
    clearTimeout(it.quiet);
    it.quiet = window.setTimeout(() => (wheel.current = { sum: 0, quiet: 0, spent: false }), 220);
    if (it.spent) return;
    it.sum += event.deltaY;
    if (Math.abs(it.sum) < 30) return;
    it.spent = true;
    next(it.sum > 0 ? 1 : -1);
  };

  // What you said on this moment, unsent and sent, each a pin on what it's on; and the thing the moment is about.
  const mine = notes.filter((one) => one.on?.scene === scene.name);
  const theirs = sent.filter((one) => one.on?.scene === scene.name);
  const said = [...theirs.map((note) => ({ note, sent: true })), ...mine.map((note) => ({ note, sent: false }))];
  // A note is at its moment: made in the app, where the app was stepped into. Its pin shows only while it rests there.
  // One made on an earlier taking is about the point, wherever it was on that recording.
  const made = allNotes(review);
  const noteAt = (note: Note) => ((made.get(note.id)?.round ?? round.number) < round.number ? end : note.on?.app ? note.on.app.from.at : (note.on?.at ?? end));
  const restingAt = (note: Note) => !playing && !scrubbing && Math.abs(noteAt(note) - at) < 0.06;
  const shownNotes = [...said.filter(({ note }) => restingAt(note)), ...(writing ? [{ note: writing.note, sent: false }] : [])];
  // A thing on the moment's page by its role and name, as it was read there: what it's about, or what a note made in
  // the app is on, as the app numbers its things anew.
  const nodeOf = (named?: { role: string; name: string }) => named && readings?.at(-1)?.things.find((thing) => thing.role === named.role && thing.name === named.name)?.node;
  const markOf = (note: Note): Mark => {
    const on = note.on;
    const element = on?.element;
    // Made in the app, or on an earlier taking of the moment, its thing is found here by its role and name.
    const node = on?.app || !mine.includes(note) ? nodeOf(element) : element?.node;
    return { id: note.id, ...(element && { name: element.name, ...(node !== undefined && { node }) }), ...(on?.point && { point: on.point }) };
  };
  const aboutNode = nodeOf(about);
  const marks: Mark[] = [...(aboutNode !== undefined ? [{ id: ABOUT, node: aboutNode }] : []), ...shownNotes.map(({ note }) => markOf(note))];
  const pins: Pin[] = shownNotes.map(({ note, sent }) => ({ id: note.id, on: [note.id], ink: sent ? "var(--slate)" : "var(--amber)", fill: sent ? "bg-slate" : "bg-amber" }));
  // What it's about is outlined only at the point: midway, it may not be there yet.
  const aboutAt = atPoint && !live?.shown ? placed[ABOUT] : undefined;
  const openNote = shownNotes.find(({ note }) => note.id === open);

  // Beside your pointer, what a click on the moment does: note what's under it, or step in.
  const onFrame = !playing && !scrubbing && !live?.shown && !writing && !open && !comparing;
  const movePill = (event: React.PointerEvent) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    pointer.current = { x: event.clientX - box.left, y: event.clientY - box.top };
    if (pill.current) pill.current.style.transform = `translate(${pointer.current.x - 3}px, ${pointer.current.y - 2}px)`;
  };

  return (
    <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden bg-ground px-6 phone:px-4" onWheel={onWheel}>
      <header className="flex h-12 min-w-0 items-center gap-3">
        <button onClick={onLeave} className="-ml-2 flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg">
          <svg viewBox="0 0 12 12" className="size-3 flex-none" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7.5 2.5L4 6l3.5 3.5" />
          </svg>
          <span className="truncate">{review.title}</span>
        </button>
        <button onClick={() => next(1)} disabled={!!live?.shown || !!writing} className="-mr-2 ml-auto flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm enabled:hover:bg-hover enabled:hover:text-fg disabled:opacity-50">
          {n < count ? "Next" : "To the list"}
          <Key>↓</Key>
        </button>
      </header>
      {/* Who and where, in the agent's words: room for two lines, three on a phone, so nothing under it moves. */}
      <p className="line-clamp-2 h-[44px] text-[15px] leading-[22px] text-fg phone:line-clamp-3 phone:h-[66px]" title={scene.name}>
        {who && <span className="text-soft">{who} · </span>}
        {scene.name}
      </p>
      <div className="relative mt-2 grid min-h-0 place-items-center [container-type:size]">
        <div
          ref={frame}
          className="relative overflow-visible rounded-lg"
          style={{ aspectRatio: `${screen.width} / ${screen.height}`, width: `min(100cqw, calc((100cqh - ${LINE}px) * ${screen.width / screen.height}))`, marginBottom: LINE }}
          onPointerMove={(event) => (movePill(event), setAiming(!(event.target as Element).closest("[data-line]")))}
          onPointerLeave={() => setAiming(false)}
        >
          <div key={scene.recording} className="absolute inset-0 animate-arrive overflow-hidden rounded-lg bg-paper shadow-frame" onClick={(event) => onFrame && !noting && !(event.target as Element).closest("button") && stepIn()}>
            <Picture shot={{ src: picture(review.id, round.number, scene.recording, Math.max(0, scene.steps.length - 1)) }} />
            <Player
              review={review.id}
              round={round.number}
              recording={scene.recording}
              at={at}
              playing={playing}
              following={scrubbing ? { clock: clockOf, at: (moment) => moment } : undefined}
              cut={cut}
              clock={clockOf}
              onStop={() => (setPlaying(undefined), restAt(end))}
              marks={marks}
              onMarks={setPlaced}
              things={noting && !live?.shown && !writing ? glimpsed : undefined}
              onPlace={
                noting && !live?.shown && !writing
                  ? (on) => {
                      setNoting(false);
                      setWriting({ note: { id: newId(), on: { scene: scene.name, at, ...on }, words: "" }, spot: { ...pointer.current } });
                    }
                  : undefined
              }
              scrolled={scrolled}
            />
            {aboutAt && (
              <div
                className="pointer-events-none absolute animate-arrive rounded-[4px] outline-[1.5px] outline-offset-4 outline-slate outline-solid"
                style={{ left: aboutAt.left, top: aboutAt.top, width: aboutAt.width, height: aboutAt.height }}
              />
            )}
            {comparing && then && (
              <div className="absolute inset-0 z-[5] flex animate-arrive gap-3 bg-ground">
                {[
                  { label: "When you last saw it", round: then.round.number, recording: then.scene.recording, at: Math.max(0, then.scene.length - 0.05) },
                  { label: "Now", round: round.number, recording: scene.recording, at: end },
                ].map((side) => (
                  <div key={side.label} className="flex flex-1 items-center">
                    <div className="relative w-full overflow-hidden rounded-lg bg-paper shadow-frame" style={{ aspectRatio: `${screen.width} / ${screen.height}` }}>
                      <Player review={review.id} round={side.round} recording={side.recording} at={side.at} />
                      <span className={CHIP}>{side.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Pinned pins={pins} placed={placed} open={open ?? writing?.note.id} faded={!!playing || scrubbing || !!live?.shown} onOpen={(id) => (setNoting(false), setOpen(id))} />
          </div>
          <Progress
            clock={clockOf}
            share={shareOf(at)}
            shareOf={shareOf}
            moving={!!playing || scrubbing}
            playing={!!playing}
            dots={said.map(({ note, sent }) => ({ id: note.id, share: shareOf(noteAt(note)), fill: sent ? "bg-slate" : "bg-amber" }))}
            onScrub={
              live?.shown || writing || !cut
                ? undefined
                : (share, phase) => {
                    if (phase === "down") (setPlaying(undefined), setOpen(undefined), setNoting(false), setScrubbing(true));
                    if (phase !== "up") return clockOf.set(momentOf(share));
                    setScrubbing(false);
                    restAt(share >= 0.995 ? end : momentOf(share));
                  }
            }
          />
          <Portal live={live && { ...live, inApp }} person={person} screen={screen} scrolled={() => scrolled.current?.()} waiting="Stepping in…" />
          <span ref={pill} aria-hidden className={`pointer-events-none absolute top-0 left-0 z-30 transition-opacity duration-150 ease-calm ${onFrame && aiming ? "" : "opacity-0"}`}>
            <span className={TAG}>{noting ? "Note on this" : person ? `Step in as ${person}` : "Step in"}</span>
          </span>
          {writing && <NoteCard at={(!writing.note.on?.app && pinOf(placed[writing.note.id])) || writing.spot} frame={frame}><Write onSave={save} onDrop={() => setWriting(undefined)} /></NoteCard>}
          {!writing && openNote && (
            <NoteCard at={pinOf(placed[openNote.note.id]) ?? { x: 24, y: 24 }} frame={frame}>
              {openNote.sent ? (
                <div className="px-1">
                  {conversation(review, openNote.note.id).map((turn, i) => (
                    <p key={i} className={`text-[13px] leading-5 whitespace-pre-wrap ${i ? "mt-2" : ""} ${turn.agent ? "text-soft" : "text-fg"}`}>
                      {turn.agent && <span className="block text-xs text-faint">{turn.by}</span>}
                      {turn.words}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="px-1 text-[13px] leading-5 whitespace-pre-wrap text-fg">{openNote.note.words}</p>
              )}
              {openNote.sent && (
                <div className="mt-2 border-t border-line pt-2">
                  <Write
                    key={openNote.note.id}
                    placeholder="Reply"
                    rows={2}
                    start={replies.find((one) => one.note === openNote.note.id)?.words ?? ""}
                    onSave={(words) => (setReplies((all) => [...all.filter((one) => one.note !== openNote.note.id), { note: openNote.note.id, words }]), setOpen(undefined))}
                    onDrop={() => setOpen(undefined)}
                  />
                </div>
              )}
              <div className="mt-2 flex items-center gap-2 px-1 text-xs text-soft">
                <span>{openNote.sent ? "" : "Sent with Send on the list"}</span>
                {!openNote.sent && (
                  <button className="ml-auto rounded-md px-1.5 py-0.5 hover:bg-hover hover:text-fg" onClick={() => (setNotes((all) => all.filter((one) => one.id !== openNote.note.id)), setOpen(undefined))}>
                    Remove
                  </button>
                )}
              </div>
            </NoteCard>
          )}
        </div>
        {live?.problems && <p className="absolute bottom-0 left-1/2 max-w-[90%] -translate-x-1/2 translate-y-full rounded-md bg-surface px-3 py-1.5 text-xs text-amber-ink shadow-tip">{live.problems.join(" ")}</p>}
      </div>
      <div className="flex h-16 items-center justify-center">
        <div role="toolbar" aria-label="This moment" onClick={(event) => (event.target as Element).closest("button")?.blur()} className={`flex gap-0.5 rounded-xl bg-surface p-1 text-[13px] select-none ${inApp ? "shadow-[0_0_0_1.5px_rgba(236,178,72,0.95),0_6px_20px_rgba(20,24,34,0.12)]" : "shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]"}`}>
          <button className={`${ITEM} w-[96px]`} disabled={!!live?.shown || !cut || comparing} onClick={play}>
            <span className="w-9 text-left">{playing ? "Pause" : "Play"}</span> <Key className="min-w-9">Space</Key>
          </button>
          <button className={`${ITEM} w-[116px]`} disabled={!!writing} aria-pressed={stepping} onClick={stepIn}>
            {inApp ? "Back" : stepping ? "Stepping in…" : "Step in"} {!stepping && <Key>{inApp ? "Esc" : "T"}</Key>}
          </button>
          <button className={`${ITEM}`} disabled={stepping || !!writing || comparing} aria-pressed={noting} onClick={note}>
            Note <Key>N</Key>
          </button>
          {then && (
            <button className={`${ITEM}`} disabled={!!live?.shown || !!writing} aria-pressed={comparing} onClick={compare}>
              Compare <Key>C</Key>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const ITEM =
  "inline-flex items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 whitespace-nowrap text-fg transition-colors duration-150 ease-calm enabled:hover:bg-hover disabled:cursor-default disabled:opacity-50 aria-pressed:bg-hover [&_kbd]:text-[color-mix(in_srgb,var(--faint)_55%,var(--soft))]";
// How many seconds of a moment Play shows, waiting cut short.
const LEADING = 7;
const ABOUT = "about";
// The room under the recording the line along it takes, pointer and all.
const LINE = 14;

// How far through the few seconds Play shows it is, along the recording's bottom edge: always there, full at the point,
// filling as it plays. Pressed or dragged, the recording follows; let go at its end, it's at the point.
function Progress(props: {
  clock: Clock;
  share: number;
  shareOf: (moment: number) => number;
  moving: boolean;
  playing: boolean;
  dots: { id: string; share: number; fill: string }[];
  onScrub?: (share: number, phase: "down" | "move" | "up") => void;
}) {
  const { clock, share, shareOf, moving, playing, dots, onScrub } = props;
  const fill = useRef<HTMLDivElement>(null);
  const told = useRef(shareOf);
  told.current = shareOf;
  useEffect(() => {
    const show = (to: number) => fill.current && (fill.current.style.width = `${(to * 100).toFixed(3)}%`);
    if (!moving) return void show(share);
    show(told.current(clock.at));
    return clock.follow((moment) => show(told.current(moment)));
  }, [moving, share]);
  const along = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return clamp((event.clientX - box.left) / box.width);
  };
  const [held, setHeld] = useState(false);
  return (
    <div
      data-line
      className={`group absolute inset-x-0 top-full touch-none ${onScrub ? "cursor-pointer" : ""}`}
      style={{ height: LINE }}
      onPointerDown={(event) => {
        if (!onScrub || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setHeld(true);
        onScrub(along(event), "down");
      }}
      onPointerMove={(event) => held && onScrub?.(along(event), "move")}
      onPointerUp={(event) => held && (setHeld(false), onScrub?.(along(event), "up"))}
      onPointerCancel={(event) => held && (setHeld(false), onScrub?.(along(event), "up"))}
    >
      <div className={`absolute inset-x-0 top-[6px] rounded-full bg-line transition-[height,top] duration-150 ease-calm ${held ? "top-[5px] h-1" : "h-0.5"} ${onScrub ? "group-hover:top-[5px] group-hover:h-1" : ""}`}>
        <div ref={fill} className={`h-full rounded-full transition-colors duration-150 ease-calm ${held ? "bg-fg" : playing ? "bg-soft" : "bg-faint"} ${onScrub ? "group-hover:bg-fg" : ""}`} />
        {dots.map((dot) => (
          <i key={dot.id} className={`absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${dot.fill}`} style={{ left: `${dot.share * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

// Where a note's pin is on what it's on, as Pinned puts it: just outside its top right corner.
const pinOf = (thing: Placed[string]) => thing && { x: thing.left + thing.width + 14, y: thing.top - 14 };

// A card by a spot on the moment: beside it where there's room, never past the frame's sides.
function NoteCard({ at, frame, children }: { at: { x: number; y: number }; frame: React.RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const wide = frame.current?.clientWidth ?? 0;
  const width = Math.min(280, wide - 16);
  const left = at.x + 18 + width <= wide ? at.x + 18 : Math.max(8, at.x - 18 - width);
  return (
    <div className="absolute z-40 animate-arrive rounded-xl bg-surface p-2 shadow-float" style={{ left, top: Math.max(8, at.y - 12), width }} onClick={(event) => event.stopPropagation()}>
      {children}
    </div>
  );
}

// Writing a note: Enter keeps it, Shift+Enter is a new line, Escape lets it go.
function Write({ onSave, onDrop, placeholder = "What's right or wrong here?", rows = 3, start = "" }: { onSave: (words: string) => void; onDrop: () => void; placeholder?: string; rows?: number; start?: string }) {
  const [words, setWords] = useState(start);
  return (
    <div>
      <textarea
        autoFocus
        rows={rows}
        value={words}
        placeholder={placeholder}
        className="block w-full resize-none rounded-lg bg-transparent px-1 py-0.5 text-[13px] leading-5 text-fg outline-none placeholder:text-faint"
        onChange={(event) => setWords(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") return (event.stopPropagation(), onDrop());
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (words.trim()) onSave(words.trim());
          }
        }}
      />
      <div className="mt-1 flex items-center justify-end gap-1 text-xs">
        <button className="rounded-md px-2 py-1 text-soft hover:bg-hover hover:text-fg" onClick={onDrop}>
          Cancel
        </button>
        <button className="rounded-md px-2 py-1 font-medium text-fg enabled:hover:bg-hover disabled:opacity-50" disabled={!words.trim()} onClick={() => onSave(words.trim())}>
          Keep <Key>↵</Key>
        </button>
      </div>
    </div>
  );
}
