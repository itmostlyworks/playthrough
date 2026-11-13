// What's waiting on you from every app on this machine, each change by its title with its moments under it, a still
// each in the agent's words; and a moment opened, the app at the point that matters, still and as large as the window
// allows. From there: look (play the few seconds that led here), step in (the real app there, as that person), or say
// something (a note on what you click). Going on to the next moment is the yes. What you said goes to the agent by the
// change's one button on the list: Send, or Done with nothing to say. The list is at /, each moment at
// /moments/<its change's address>/<n>; the recording, the pointer, the pins and stepping in are the page's own.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Glimpse, Reading, Thing } from "@playthrough/page";
import { allNotes, conversation, newId, pausedAt, together, waitingForTheAgent, type Turn, type Did, type Note, type Place, type Review, type Round, type Scene } from "@playthrough/review";
import { glimpses, keepBranch, picture, readings as readingsOf, recording, send, useChanges, useYou, type Listed } from "./api.ts";
import { Key } from "./Card.tsx";
import { around, Picture, union, type Frame } from "./Picture.tsx";
import { workingSince } from "./notes.ts";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Clock, Player, useCut, type Cut, type Mark, type Placed } from "./Player.tsx";
import type { Together } from "./view.ts";
import { Portal, TAG } from "./Portal.tsx";
import { CHIP } from "./Scene.tsx";
import { readyAt } from "./live.ts";
import { usePhone } from "./phone.ts";
import { clamp } from "./moments.ts";
import type { Scrolled } from "./replay.ts";

// Where you are: the list, or a change's moment, by the change's address and the moment's place in it from 1, and a
// note open by its pin.
type Where = { review?: string; moment?: number; note?: string };
const whereFrom = (path: string, search = ""): Where => {
  const [first, ...parts] = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (first !== "moments" || !parts.length) return {};
  const moment = parts.length > 1 && /^\d+$/.test(parts.at(-1)!) ? Number(parts.pop()) : 1;
  const note = new URLSearchParams(search).get("note") ?? undefined;
  return { review: parts.join("/"), moment: Math.max(1, moment), ...(note && { note }) };
};
const pathOf = ({ review, moment, note }: Where) =>
  review ? `/moments/${review.split("/").map(encodeURIComponent).join("/")}/${moment ?? 1}${note ? `?note=${encodeURIComponent(note)}` : ""}` : "/";

export function MomentsPage() {
  const [where, setWhere] = useState(() => whereFrom(location.pathname, location.search));
  useEffect(() => {
    const back = () => setWhere(whereFrom(location.pathname, location.search));
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, []);
  // Going from one moment to the next replaces the address, so the browser's back is the list, as Back is.
  const go = (to: Where, replace = false) => {
    history[replace ? "replaceState" : "pushState"](null, "", pathOf(to));
    setWhere(to);
  };
  const changes = useChanges();
  const you = useYou();
  // The tab says how many changes wait on you, so it's seen from any other.
  const waiting = changes && you ? changes.filter(({ review }) => latestOf(review) && standingOf(review, you).is === "waiting").length : 0;
  useEffect(() => void (document.title = waiting ? `${waiting} waiting · Playthrough` : "Playthrough"), [waiting]);
  // A change by its own name alone, as addresses were before every app's were listed, is the first with that name.
  const listed = where.review ? changes?.find(({ review }) => review.id === where.review || review.id.endsWith(`/${where.review}`)) : undefined;
  useEffect(() => void (listed && listed.review.id !== where.review && go({ ...where, review: listed.review.id }, true)), [listed?.review.id]);
  if (where.review) {
    if (!changes || !you || (listed && listed.review.id !== where.review)) return <div className="h-dvh bg-ground" />;
    if (!listed) return <div className="grid h-dvh place-items-center bg-ground text-soft">There's no change here.</div>;
    return <Change key={where.review} listed={listed} you={you} moment={where.moment ?? 1} note={where.note} go={go} />;
  }
  return <List changes={changes} you={you} onOpen={(review, moment, note) => go({ review, moment, note })} />;
}

// What this browser keeps for a change, by its address. What it kept by the change's own name alone, before every app's
// changes were listed, comes over to the address once.
function stored(key: (review: string) => string, review: string): string | null {
  const now = localStorage.getItem(key(review));
  const own = review.slice(review.indexOf("/") + 1);
  if (now !== null || own === review) return now;
  const before = localStorage.getItem(key(own));
  if (before !== null) (localStorage.setItem(key(review), before), localStorage.removeItem(key(own)));
  return before;
}

// Your notes on a change not yet sent, kept in this browser until you send them.
const unsentKey = (review: string) => `playthrough:moments:${review}`;
function unsentOf(review: string): Note[] {
  try {
    return JSON.parse(stored(unsentKey, review) ?? "[]");
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
    return JSON.parse(stored(repliesKey, review) ?? "[]");
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
const takingOf = (round: number, scene: string) => `${round}:${scene}`;
// The moments that look different since the taking before, by Playthrough's own comparison, with its words.
function differentSince(review: Review, round: Round): Map<string, string[]> {
  const before = review.rounds.findLast((one) => one.number < round.number && one.number > 0 && one.finished);
  const compared = before && review.comparisons.find((one) => one.round === round.number && one.since === before.number);
  const different = new Map<string, string[]>();
  for (const change of compared?.changes ?? []) for (const seen of change.seen) different.set(seen.scene, [...(different.get(seen.scene) ?? []), change.words]);
  return different;
}

// The moments you've opened, kept with the change for you, so they're seen from every browser, each as it was handed
// back: one handed back again, different, asks for you again. Those this browser kept before they were kept with the
// change are carried over to it once.
const seenKey = (review: string, you: string) => `playthrough:moments-seen:${review}:${you}`;
function seenOf(review: Review, you: string): string[] {
  let here: string[] = [];
  try {
    here = JSON.parse(stored((id) => seenKey(id, you), review.id) ?? "[]");
  } catch {}
  return [...new Set([...(review.seen?.[you] ?? []).map((one) => takingOf(one.round, one.scene)), ...here])];
}
// Once each: the page asks again as it draws until the change comes back with it.
const telling = new Set<string>();
function markSeen(review: Review, you: string, takings: string[]) {
  const kept = new Set((review.seen?.[you] ?? []).map((one) => takingOf(one.round, one.scene)));
  const moments = takings
    .filter((taking) => !kept.has(taking) && !telling.has(`${review.id}:${taking}`))
    .map((taking) => ({ round: Number(taking.slice(0, taking.indexOf(":"))), scene: taking.slice(taking.indexOf(":") + 1) }))
    .filter(({ round, scene }) => review.rounds.some((one) => one.number === round && one.finished && one.scenes.some((kept) => kept.name === scene)));
  if (!moments.length) return;
  for (const one of moments) telling.add(`${review.id}:${takingOf(one.round, one.scene)}`);
  void fetch(`/api/reviews/${encodeURIComponent(review.id)}/seen`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ by: you, moments }) }).then((answer) => {
    if (!answer.ok) return;
    try {
      localStorage.removeItem(seenKey(review.id, you));
    } catch {}
  });
}

// A change has moments when its latest round is finished with some in it.
const latestOf = (review: Review): Round | undefined => review.rounds.findLast((round) => round.number > 0 && !!round.finished && round.scenes.length > 0);
const sentBy = (review: Review, you: string) => review.sends.filter((one) => one.by === you);
// Waiting on you until you've sent something on its latest moments, or said Done; then it's with your agents.
const sentOn = (review: Review, you: string) => {
  const round = latestOf(review);
  return round ? sentBy(review, you).filter((one) => one.round === round.number) : [];
};

// Who a moment is done as, as the list says them ("Sam, a member").
const whoIn = (listed: Listed, scene: Scene) => (scene.person ? (listed.people[scene.person] ?? scene.person) : "");

// How long ago, as a person says it.
function ago(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

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

// What's waiting on you, from every app on this machine: each change by its title, its moments as stills you can judge
// at a glance, the longest waiting first. Under them, those with your agents and those done, a quiet line each that
// opens to the same stills. A change moves by its one button: Send, with what you said, or Done, with nothing to say.
// The list keeps itself as it is on disk, but calmly: one you sent folds away before it goes, and one handed over, or
// handed back, joins what's waiting at its foot only while nothing it would move is under your pointer. Held, only the
// move waits: its line says at once where it stands now.
function List({ changes, you, onOpen }: { changes?: Listed[]; you?: string; onOpen: (review: string, moment: number, note?: string) => void }) {
  const [opened, setOpened] = useState(openedLines);
  const [earlier, setEarlier] = useState(false);
  const [shown, setShown] = useState<Listed[]>();
  const before = useRef<Listed[]>(undefined);
  // Each change as it is on disk, which a held one's line speaks from while it stays where it was.
  const latest = useRef(new Map<string, Listed>());
  // Those that have moved since the list was first shown: each grows into its place.
  const moved = useRef(new Set<string>());
  // Those folding away after your Send or Done, which stay where they were until they're gone, and then go where they
  // go wherever the pointer is: you moved them.
  const leaving = useRef(new Set<string>());
  const sent = useRef(new Set<string>());
  // What's waiting, in the order it came: the longest waiting first, and one that comes later at the foot.
  const order = useRef<string[]>([]);
  const foot = useRef<HTMLDivElement>(null);
  const pointer = useRef<number>(undefined);
  const holding = useRef(false);
  const [looked, lookAgain] = useState(0);
  const sectionOf = (listed?: Listed) => (listed && you && latestOf(listed.review) ? standingOf(listed.review, you).is : undefined);
  useEffect(() => {
    if (!changes || !you) return;
    latest.current = new Map(changes.map((one) => [one.review.id, one]));
    const was = before.current;
    if (!was) return void setShown((before.current = changes));
    const top = foot.current?.getBoundingClientRect().top;
    const underPointer = pointer.current !== undefined && top !== undefined && pointer.current >= top;
    let held = false;
    const settled = [...changes, ...was.filter((one) => !changes.some((now) => now.review.id === one.review.id))].flatMap((now) => {
      const then = was.find((one) => one.review.id === now.review.id);
      const gone = !changes.includes(now);
      const [from, to] = [sectionOf(then), gone ? undefined : sectionOf(now)];
      if (from === to) return gone ? [] : [now];
      const yours = sent.current.delete(now.review.id);
      if (leaving.current.has(now.review.id) || (!yours && (from === "waiting" || to === "waiting") && underPointer)) return (held = true), then ? [then] : [];
      if (to) moved.current.add(now.review.id);
      return gone ? [] : [now];
    });
    holding.current = held;
    setShown((before.current = settled));
  }, [changes, you, looked]);
  // Held, it's looked at again as the pointer moves, leaves or the list scrolls.
  useEffect(() => {
    const look = () => holding.current && lookAgain((n) => n + 1);
    const moving = (event: PointerEvent) => ((pointer.current = event.pointerType === "touch" ? undefined : event.clientY), look());
    const out = () => ((pointer.current = undefined), look());
    const lifted = (event: PointerEvent) => event.pointerType === "touch" && out();
    addEventListener("pointermove", moving);
    addEventListener("pointerup", lifted);
    document.documentElement.addEventListener("pointerleave", out);
    addEventListener("blur", out);
    addEventListener("scroll", look, { passive: true });
    return () => {
      removeEventListener("pointermove", moving);
      removeEventListener("pointerup", lifted);
      document.documentElement.removeEventListener("pointerleave", out);
      removeEventListener("blur", out);
      removeEventListener("scroll", look);
    };
  }, []);
  // How long each has waited is said again each minute, as the page stays open.
  const [, aMinute] = useState(0);
  useEffect(() => {
    const every = setInterval(() => aMinute((n) => n + 1), 60000);
    return () => clearInterval(every);
  }, []);
  const now = Date.now();
  if (!shown || !you) return <div className="min-h-dvh bg-ground" />;
  const all = shown.filter(({ review }) => latestOf(review)).map((listed) => ({ listed, standing: standingOf(listed.review, you) }));
  const newest = (a: (typeof all)[number], b: (typeof all)[number]) => ("at" in b.standing ? b.standing.at : "").localeCompare("at" in a.standing ? a.standing.at : "");
  const longest = (a: (typeof all)[number], b: (typeof all)[number]) => latestOf(a.listed.review)!.finished!.localeCompare(latestOf(b.listed.review)!.finished!);
  const waiting = all.filter((one) => one.standing.is === "waiting").sort(longest);
  order.current = [...order.current.filter((id) => waiting.some(({ listed }) => listed.review.id === id)), ...waiting.map(({ listed }) => listed.review.id).filter((id) => !order.current.includes(id))];
  waiting.sort((a, b) => order.current.indexOf(a.listed.review.id) - order.current.indexOf(b.listed.review.id));
  const withAgents = all.filter((one) => one.standing.is === "sent").sort(newest);
  const done = all.filter((one) => one.standing.is === "done").sort(newest);
  // Ctrl+Enter sends the first change with something to send, as a page's send sends its one review.
  const keyed = [...waiting, ...withAgents, ...done].find(({ listed }) => unsentOf(listed.review.id).length)?.listed.review.id;
  const toggle = (id: string) => {
    const next = opened.includes(id) ? opened.filter((one) => one !== id) : [...opened, id];
    setOpened(next);
    keepOpened(next);
  };
  const change = ({ listed, standing }: (typeof all)[number]) => (
    <ChangeInList
      key={listed.review.id}
      listed={listed}
      standing={standing}
      told={latest.current.get(listed.review.id) ?? listed}
      you={you}
      now={now}
      open={standing.is === "waiting" || opened.includes(listed.review.id)}
      arrived={moved.current.has(listed.review.id)}
      keyed={keyed === listed.review.id}
      onToggle={() => toggle(listed.review.id)}
      onOpen={(moment, note) => onOpen(listed.review.id, moment, note)}
      onLeaving={(going, moved) => {
        if (going) return void leaving.current.add(listed.review.id);
        leaving.current.delete(listed.review.id);
        if (moved) sent.current.add(listed.review.id);
        lookAgain((n) => n + 1);
      }}
    />
  );
  return (
    <div className="min-h-dvh bg-ground">
      <main className="mx-auto max-w-[1040px] px-8 pt-12 pb-24 phone:px-4 phone:pt-6">
        <h1 className="text-[13px] leading-5 font-semibold text-soft">Waiting on you</h1>
        {!waiting.length && (
          <div className="mt-4 animate-arrive text-[15px] leading-[22px]">
            <p className="text-fg">Nothing's waiting on you.</p>
            {/* Never anything here: how the first one comes. */}
            {!all.length && <p className="text-soft">To see an agent's work here, tell it: “Show me this change with npx playthrough.”</p>}
          </div>
        )}
        {waiting.map(change)}
        <div ref={foot} />
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

// A change on the list, as it stands: waiting, its title and its stills, with Done or Send; with your agents or done, a
// quiet line that opens to the same stills, muted, with Send once you've said something on it. Arriving, it grows into
// its place, and leaving, it folds away, so what's around it glides rather than jumps.
function ChangeInList(props: {
  listed: Listed;
  standing: Standing;
  // The change as it is now, which may have moved on while it's held where it was: what its line says.
  told: Listed;
  you: string;
  now: number;
  open: boolean;
  arrived: boolean;
  keyed: boolean;
  onToggle: () => void;
  onOpen: (moment: number, note?: string) => void;
  // Going as you send or say Done; then gone, or staying where it is, as the send wasn't kept.
  onLeaving: (going: boolean, moved?: boolean) => void;
}) {
  const { listed, standing, told, you, now, open, arrived, keyed, onToggle, onOpen, onLeaving } = props;
  const stands = told === listed ? standing : standingOf(told.review, you);
  const { review } = listed;
  const round = latestOf(review)!;
  const [grown, setGrown] = useState(!arrived);
  useEffect(() => {
    if (grown) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
    return () => cancelAnimationFrame(frame);
  }, []);
  const [notes] = useState(() => unsentOf(review.id));
  const [replies] = useState(() => repliesOf(review.id));
  const [seen] = useState(() => seenOf(review, you));
  // What this browser kept before it was kept with the change goes to it.
  useEffect(() => markSeen(review, you, seen), []);
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
    onLeaving(true);
    const said = await send(review.id, { id: newId(), round: round.number, by: you, sent: new Date().toISOString(), verdicts: [], ...what });
    setBusy(false);
    if (said.length) return (onLeaving(false), setProblems(said));
    keepUnsent(review.id, []);
    keepReplies(review.id, []);
    setLeaving(true);
    setTimeout(() => onLeaving(false, true), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : LEAVING);
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
      className={`grid transition-[grid-template-rows,opacity,margin] ease-calm ${leaving || !grown ? "mt-0 grid-rows-[0fr] opacity-0" : `grid-rows-[1fr] ${waiting ? "mt-12 first-of-type:mt-6" : ""}`}`}
      style={{ transitionDuration: `${LEAVING}ms` }}
    >
      <div className={`min-h-0 ${leaving || !grown ? "overflow-hidden" : ""}`}>
        {waiting ? (
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] leading-[22px] font-semibold text-fg">{review.title}</h2>
              <p className="text-[13px] leading-5 text-soft">
                {listed.app} · {ago(round.finished!, now)}
                {stands.is !== "waiting" && <> · <StandsNow listed={told} standing={stands} now={now} /></>}
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
                  <StandsNow listed={told} standing={stands} now={now} />
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
              const quiet = !waiting || seen.includes(takingOf(round.number, scene.name)) || (seenBefore && !different.has(scene.name));
              const talk = [...allNotes(review)].filter(([, kept]) => (kept.note.on?.app?.from.scene ?? kept.note.on?.scene) === scene.name);
              return (
                <li key={scene.name}>
                  <button onClick={() => onOpen(i + 1)} className="group block w-full text-left">
                    <Still review={review} round={round} scene={scene} about={scene.about ?? scene.acted} seen={quiet} />
                    <span className={`mt-2.5 block text-[13px] leading-5 ${quiet ? "text-faint" : "text-soft"}`}>{whoIn(listed, scene)}</span>
                    <span className={`block text-[14px] leading-5 ${quiet ? "text-soft" : "text-fg"}`}>{scene.name}</span>
                    {/* Said once: where someone spoke on it, the reply says what changed. */}
                    {waiting && !quiet && seenBefore && different.has(scene.name) && !talk.length && !notes.some((note) => note.on?.scene === scene.name) && (
                      <span className="mt-0.5 block text-[13px] leading-5 text-amber-ink">Different since you saw it</span>
                    )}
                  </button>
                  {(() => {
                    // A line a note: your latest words, and where it stands. Its conversation is by its pin.
                    const unsentHere = notes.filter((note) => note.on?.scene === scene.name);
                    const seenHere = seen.includes(takingOf(round.number, scene.name));
                    const lines = [
                      ...talk.map(([id]) => {
                        const turns = conversation(review, id);
                        const replied = replies.find((one) => one.note === id)?.words;
                        const last = turns.at(-1);
                        const yours = replied ?? turns.findLast((turn) => !turn.agent)?.words ?? "";
                        const stands = replied ? "not sent yet" : last?.agent ? "answered" : "sent";
                        return { id, words: yours, stands, fresh: stands === "answered" && !seenHere };
                      }),
                      ...unsentHere.map((note) => ({ id: note.id, words: note.words, stands: "not sent yet", fresh: false })),
                    ];
                    return lines.length > 0 && (
                      <div className="mt-3 grid">
                        {lines.map((line) => (
                          <NoteLine key={line.id} {...line} onOpen={() => onOpen(i + 1, line.id)} />
                        ))}
                      </div>
                    );
                  })()}
                </li>
              );
            })}
          </ol>
        </Fold>
      </div>
    </div>
  );
}

// A note and what's been said on it since, by its pin, a turn each, as the page's cards say them: who speaks on a small
// line of its own, you by your dot, the agent by its name, and the words under it as readable as the note's.
function Turns({ you, turns, unsent }: { you: string; turns: Turn[]; unsent?: string }) {
  const all = [
    ...turns.map((turn) => ({ mine: !turn.agent && turn.by === you, by: turn.agent || turn.by !== you ? turn.by : "You", words: turn.words, sent: true })),
    ...(unsent ? [{ mine: true, by: "You", words: unsent, sent: false }] : []),
  ];
  return (
    <div className="grid gap-2">
      {all.map((turn, i) => (
        <div key={i} className="grid gap-px">
          <span className="flex items-center gap-1.5 text-[11.5px] leading-4 text-faint">
            {turn.mine && <i className={`size-1.5 rounded-full ${turn.sent ? "bg-slate" : "bg-amber"}`} />}
            {turn.by}
            {!turn.sent && <span>· not sent yet</span>}
          </span>
          <p className="text-[13px] leading-5 whitespace-pre-wrap text-fg">{turn.words}</p>
        </div>
      ))}
    </div>
  );
}

// A note on the list: its dot, your latest words on one line, fading only where they're cut, and where it stands at
// the line's end, always in the same place. Answered since you last looked, it's in full colour.
function NoteLine({ words, stands, fresh, onOpen }: { words: string; stands: string; fresh: boolean; onOpen: () => void }) {
  const box = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const line = box.current;
    if (!line) return;
    const measure = () => setCut(line.scrollWidth > line.clientWidth + 1);
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(line);
    return () => watching.disconnect();
  }, [words]);
  const fade = cut ? { maskImage: "linear-gradient(to right, #000 calc(100% - 28px), transparent)", WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 28px), transparent)" } : undefined;
  return (
    <button onClick={onOpen} className="-mx-1.5 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] leading-5 transition-colors duration-150 ease-calm hover:bg-hover">
      <i className={`size-1.5 flex-none rounded-full ${stands === "not sent yet" ? "bg-amber" : "bg-slate"}`} />
      <span ref={box} className={`min-w-0 flex-1 overflow-hidden whitespace-nowrap ${fresh || stands === "not sent yet" ? "text-fg" : "text-soft"}`} style={fade}>
        {words}
      </span>
      <span className={`w-[76px] flex-none text-right text-xs ${fresh ? "text-fg" : "text-faint"}`}>{stands}</span>
    </button>
  );
}

// What you sent and when, and what the agent is doing with it, in the page's words.
// Where a change stands, said on its line.
function StandsNow({ listed, standing, now }: { listed: Listed; standing: Standing; now: number }) {
  if (standing.is === "waiting") return <>back {ago(latestOf(listed.review)?.finished ?? new Date(now).toISOString(), now)}, waiting on you</>;
  if (standing.is === "done") return <>Done {ago(standing.at, now)}</>;
  return <Sent listed={listed} now={now} standing={standing} />;
}

function Sent({ listed, now, standing }: { listed: Listed; now: number; standing: Extract<Standing, { is: "sent" }> }) {
  const { review, agentWaiting } = listed;
  const working = workingSince(review, latestOf(review)!);
  const agent = working ? "the agent is working" : waitingForTheAgent(review).length ? (agentWaiting ? "waiting for the agent" : "no agent is waiting, tell your agent") : undefined;
  return (
    <>
      {standing.notes + standing.replies ? `${toSend(standing.notes, standing.replies)} sent ${ago(standing.at, now)}` : `sent ${ago(standing.at, now)}`}
      {agent && ` · ${agent}`}
    </>
  );
}

const LEAVING = 380;
// How long what you did takes to fade out, back to the moment.
const FADING = 300;

// Each edge of a part of the page that isn't the page's own edge fades out.
function fadeOf(frame: Frame): React.CSSProperties {
  const [left, right, top, bottom] = [frame.x > 0.001, frame.x + frame.width < 0.999, frame.y > 0.001, frame.y + frame.height < 0.999].map((cut) => (cut ? FADE : 0));
  const mask = `linear-gradient(to right, transparent, #000 ${left}px, #000 calc(100% - ${right}px), transparent), linear-gradient(to bottom, transparent, #000 ${top}px, #000 calc(100% - ${bottom}px), transparent)`;
  return { maskImage: mask, WebkitMaskImage: mask, maskComposite: "intersect", WebkitMaskComposite: "source-in" };
}

// The part of a moment's page that shows what it's about, this wide for its height: closed in on it with enough around
// it to know where you are, its nearest words with it, as a field's label and the line under it. Nothing, where it
// names nothing on the page.
const STILL = 1.6;
function closeOn(reading: Reading | undefined, about: { role: string; name: string } | undefined, shape: number): Frame | undefined {
  // Of several the same, the one in view, as the moment was kept with.
  const alike = about ? (reading?.things ?? []).filter((one) => one.role === about.role && one.name === about.name) : [];
  const inView = (box: { x: number; y: number; width: number; height: number }) => box.y + box.height > 0 && box.y < reading!.screen.height && box.x + box.width > 0 && box.x < reading!.screen.width;
  const thing = alike.find((one) => inView(one.box)) ?? alike[0];
  if (!reading || !thing) return undefined;
  const gap = (a: number, aSize: number, b: number, bSize: number) => Math.max(0, Math.max(a, b) - Math.min(a + aSize, b + bSize));
  // What holds it, as a list whose header its menu sits in, isn't near it: it's around it.
  const holds = (one: Thing) =>
    one !== thing && one.box.x <= thing.box.x && one.box.y <= thing.box.y && one.box.x + one.box.width >= thing.box.x + thing.box.width && one.box.y + one.box.height >= thing.box.y + thing.box.height;
  const near = reading.things.filter(
    (one) =>
      one.role !== "box" &&
      one.holder === thing.holder &&
      !holds(one) &&
      gap(one.box.y, one.box.height, thing.box.y, thing.box.height) <= 40 &&
      gap(one.box.x, one.box.width, thing.box.x, thing.box.width) <= 24,
  );
  // A line of words is laid out across its whole column: it's as wide as its words, as near as can be told.
  const wordsOf = (one: (typeof near)[number]) =>
    one.words && /^(text|heading)$/.test(one.role) ? { ...one.box, width: Math.min(one.box.width, one.words.length * parseFloat(one.look.size) * 0.55) } : one.box;
  return around(union([thing.box, ...near.map(wordsOf)]), reading.screen, shape, 3);
}

// A moment's still: the app at its point, closed in on what it's about, or where it names nothing, on the last thing
// done on the way that's still there; the whole screen where there's neither. What runs off an edge the page goes on
// past fades there rather than being cut. Seen, it's quieter.
const FADE = 20;
function Still({ review, round, scene, about, seen }: { review: Review; round: Round; scene: Scene; about?: { role: string; name: string }; seen: boolean }) {
  const [frame, setFrame] = useState<Frame>();
  useEffect(() => {
    let current = true;
    readingsOf(review.id, round.number, scene.recording).then((read) => current && setFrame(closeOn(read.at(-1), about, STILL)));
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

// A change's moments, one at a time. What the agent hands back while you're on one waits until you go to another, so
// nothing changes under you.
function Change({ listed, you, moment, note, go }: { listed: Listed; you: string; moment: number; note?: string; go: (to: Where, replace?: boolean) => void }) {
  const { review } = listed;
  const id = review.id;
  // Back on the list, the change you were in is open, wherever it stands.
  useEffect(() => void (openedLines().includes(id) || keepOpened([...openedLines(), id])), [id]);
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
  const latest = latestOf(review);
  const at = useRef<{ moment: number; round?: number }>(undefined);
  if (at.current?.moment !== moment) at.current = { moment, round: latest?.number };
  const round = review.rounds.find((one) => one.number === at.current!.round);
  if (!round) return <div className="grid h-dvh place-items-center bg-ground text-soft">Nothing is waiting on you here.</div>;
  const n = Math.min(moment, round.scenes.length);
  const scene = round.scenes[n - 1]!;
  markSeen(review, you, [...seenOf(review, you), takingOf(round.number, scene.name)]);
  const sent = sentBy(review, you).flatMap((one) => one.notes);
  return (
    <MomentView
      key={`${round.number}`}
      review={review}
      round={round}
      n={n}
      about={scene.about}
      who={whoIn(listed, scene)}
      notes={notes}
      sent={sent}
      setNotes={setNotes}
      replies={replies}
      setReplies={setReplies}
      you={you}
      opening={note}
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
  you: string;
  // A note to open by its pin as the moment opens, pressed on the list.
  opening?: string;
  onMoment: (n: number) => void;
  onLeave: () => void;
}) {
  const { review, round, n, about, who, notes, sent, setNotes, replies, setReplies, you, onMoment, onLeave } = props;
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
  // On a phone, the whole screen is too small to read: it's closed in on what the moment is about, as its still is.
  const phone = usePhone();
  const closeTo = about ?? scene.acted;
  const closer = useMemo(() => (phone ? closeOn(readings?.at(-1), closeTo, screen.width / screen.height) : undefined), [phone, readings, closeTo?.role, closeTo?.name]);
  const cut = useCut(review.id, round.number, scene);
  const [clockOf] = useState(() => new Clock(end));
  const [playing, setPlaying] = useState<{ until: number }>();
  // Where it rests: the point, as it opens, or wherever it was paused or let go. Another moment opens at its own point.
  const [rest, setRest] = useState<{ scene: string; at: number; along?: number }>({ scene: scene.name, at: end });
  const at = rest.scene === scene.name ? rest.at : end;
  // Compare: this moment as it was when it was last handed back, beside how it is now, played together.
  const then = (() => {
    const earlier = review.rounds.findLast((one) => one.number > 0 && one.number < round.number && one.finished && one.scenes.some((kept) => kept.name === scene.name));
    const kept = earlier?.scenes.find((one) => one.name === scene.name);
    return earlier && kept ? { round: earlier, scene: kept } : undefined;
  })();
  const [comparing, setComparing] = useState(false);
  const both = useMemo(() => then && cut && playedTogether(cut, together(scene, then.scene)), [cut, then?.scene.recording, scene.recording]);
  const [bothOf] = useState(() => new Clock(0));
  // Each side at actual size, a window onto the same part of the page, following now's pointer, as the older page's are.
  const [{ leading, beside }] = useState(() => {
    const samePart: Together = {};
    return { leading: { together: samePart, leads: true }, beside: { together: samePart, leads: false } };
  });
  // How far along both it rests: where now first is, or where it was let go, as now held while the other went on.
  const along = (both && (rest.scene === scene.name ? rest.along : undefined)) ?? both?.of(at) ?? 0;
  const restAt = (moment: number, along?: number) => (clockOf.set(moment), setRest({ scene: scene.name, at: moment, along }));
  const [scrubbing, setScrubbing] = useState(false);
  const atPoint = !playing && !scrubbing && at >= end - 0.02;
  // The few seconds Play shows, waiting cut short, as the line along the recording counts them.
  const start = cut ? cut.real(Math.max(0, cut.length - LEADING)) : 0;
  const shareOf = (moment: number) => (cut ? clamp((cut.cut(moment) - cut.cut(start)) / Math.max(0.01, cut.cut(end) - cut.cut(start))) : 1);
  const momentOf = (share: number) => (cut ? Math.min(end, cut.real(cut.cut(start) + share * (cut.cut(end) - cut.cut(start)))) : end);
  const [noting, setNoting] = useState(false);
  // Opened or closed, it stops where it's got to.
  const compare = () => {
    if (!then || live?.shown || yours) return;
    if (playing) (setPlaying(undefined), restAt(clockOf.at, comparing ? bothOf.at : undefined));
    setOpen(undefined);
    setNoting(false);
    leading.together.centre = undefined;
    setComparing((now) => !now);
  };
  // Played compared, both sides go together, each as far as the other along what both did; the line is now's.
  useEffect(() => {
    if (!comparing || !playing || !both) return;
    const [from, until, since] = [clockOf.at === at ? along : both.of(clockOf.at), both.of(playing.until), performance.now()];
    let frameId = 0;
    const tick = () => {
      const going = Math.min(until, from + (performance.now() - since) / 1000);
      bothOf.set(going);
      clockOf.set(both.at(going)[0]);
      if (going >= until) return (setPlaying(undefined), restAt(playing.until, until));
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [comparing, playing, both]);
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

  // Going to another moment, everything about this one is let go of; arriving from a note's line, it's open.
  const arriving = useRef(props.opening);
  useEffect(() => {
    setPlaying(undefined);
    setNoting(false);
    setWriting(undefined);
    setOpen(arriving.current);
    arriving.current = undefined;
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
    if (live?.shown || writing) return;
    if (yours) return playYours();
    setOpen(undefined);
    setNoting(false);
    if (!cut) return;
    // Paused, it stays where it is; played, it carries on from there, or from the start of the few seconds at the point.
    if (playing) return (setPlaying(undefined), restAt(clockOf.at, comparing ? bothOf.at : undefined));
    clockOf.set(atPoint || at < start ? start : at);
    setPlaying({ until: end });
  };
  const stepIn = () => {
    if (live?.shown) return back();
    const paused = pausedAt(scene, at);
    if (!paused || writing || yours) return;
    setComparing(false);
    setPlaying(undefined);
    setOpen(undefined);
    setNoting(false);
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
    if (writing || stepping || yours) return;
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
    document.querySelector<HTMLIFrameElement>("[data-live] iframe")?.contentWindow?.postMessage({ playthrough: "pin", id: note.id, number, thing: note.on?.element && { role: note.on.element.role, name: note.on.element.name }, point: note.on?.point }, "*");
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
      else if (comparing) compare();
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

  // What you said on this moment, unsent and sent, each a pin on what it's on; and the thing the moment is about.
  const mine = notes.filter((one) => one.on?.scene === scene.name);
  const theirs = sent.filter((one) => one.on?.scene === scene.name);
  const said = [...theirs.map((note) => ({ note, sent: true })), ...mine.map((note) => ({ note, sent: false }))];
  // Where each note's thing was, as the page was read where the note was made, in the app or on an earlier taking: its
  // part of the screen, where it's pinned when the thing isn't here any more.
  const made = allNotes(review);
  const madeIn = (note: Note) => made.get(note.id)?.round ?? round.number;
  const madeOn = (note: Note) => note.on?.app?.recording ?? (madeIn(note) < round.number ? review.rounds.find((one) => one.number === madeIn(note))?.scenes.find((one) => one.name === scene.name)?.recording : undefined);
  const [spots, setSpots] = useState<Record<string, Frame>>({});
  const elsewhere = said.flatMap(({ note }) => (madeOn(note) && note.on?.element?.node !== undefined && !spots[note.id] ? [note] : []));
  useEffect(() => {
    for (const note of elsewhere)
      readingsOf(review.id, madeIn(note), madeOn(note)!).then((read) => {
        const kept = read.findLast((reading) => reading.things.some((thing) => thing.node === note.on!.element!.node));
        const box = kept?.things.find((thing) => thing.node === note.on!.element!.node)?.box;
        if (kept && box) setSpots((all) => ({ ...all, [note.id]: { x: box.x / kept.screen.width, y: box.y / kept.screen.height, width: box.width / kept.screen.width, height: box.height / kept.screen.height } }));
      });
  }, [elsewhere.map((note) => note.id).join(" ")]);
  // A note is at its moment: made in the app, where the app was stepped into. Its pin shows only while it rests there.
  // One made on an earlier taking is about the point, wherever it was on that recording.
  const noteAt = (note: Note) => ((made.get(note.id)?.round ?? round.number) < round.number ? end : note.on?.app ? note.on.app.from.at : (note.on?.at ?? end));
  const restingAt = (note: Note) => !playing && !scrubbing && Math.abs(noteAt(note) - at) < 0.06;
  // A note made in the app after doing something there is about what you saw then. Opened, the frame is your own
  // recording at its end, the pin on its thing, and the line plays how you got there, from where you stepped in. One made
  // as you stepped in, before doing anything, is on the moment as any note is; and while you're in the app, it's the app.
  const yoursOpen = live?.shown ? undefined : said.find(({ note }) => note.id === open && !!note.on?.app?.did.length);
  const yours = useMemo(() => {
    const app = yoursOpen?.note.on?.app;
    if (!yoursOpen || !app) return undefined;
    const { note } = yoursOpen;
    return { note, round: madeIn(note), scene: { ...scene, recording: app.recording, length: app.length, steps: [] }, from: app.from.at, end: Math.min(app.length, note.on?.at ?? app.length) };
  }, [yoursOpen?.note.id]);
  const yoursCut = useCut(review.id, yours?.round ?? round.number, yours?.scene ?? scene);
  const [yoursClock] = useState(() => new Clock(0));
  const [yoursAt, setYoursAt] = useState(0);
  const [yoursPlaying, setYoursPlaying] = useState<{ until: number }>();
  const [yoursScrubbing, setYoursScrubbing] = useState(false);
  // Opened, it's at its end, where you noted, from its first frame.
  useLayoutEffect(() => {
    setYoursPlaying(undefined);
    setYoursScrubbing(false);
    if (yours) (yoursClock.set(yours.end), setYoursAt(yours.end));
  }, [yours]);
  const yoursAtEnd = !!yours && !yoursPlaying && !yoursScrubbing && yoursAt >= yours.end - 0.06;
  const yoursCutOk = yours && yoursCut;
  const yoursShareOf = (moment: number) => (yours && yoursCutOk ? clamp((yoursCutOk.cut(moment) - yoursCutOk.cut(yours.from)) / Math.max(0.01, yoursCutOk.cut(yours.end) - yoursCutOk.cut(yours.from))) : 1);
  const yoursMomentOf = (share: number) => (yours && yoursCutOk ? Math.min(yours.end, yoursCutOk.real(yoursCutOk.cut(yours.from) + share * (yoursCutOk.cut(yours.end) - yoursCutOk.cut(yours.from)))) : (yours?.end ?? 0));
  const playYours = () => {
    if (!yours || !yoursCut) return;
    if (yoursPlaying) return (setYoursPlaying(undefined), setYoursAt(yoursClock.at));
    yoursClock.set(yoursAtEnd || yoursAt < yours.from ? yours.from : yoursAt);
    setYoursPlaying({ until: yours.end });
  };
  const scrubYours = (share: number, phase: "down" | "move" | "up") => {
    if (!yours) return;
    if (phase === "down") (setYoursPlaying(undefined), setYoursScrubbing(true));
    if (phase !== "up") return yoursClock.set(yoursMomentOf(share));
    const to = share >= 0.995 ? yours.end : yoursMomentOf(share);
    yoursClock.set(to);
    setYoursAt(to);
    setYoursScrubbing(false);
  };
  // On what you did, its pin is where it was on the moment, so it doesn't move as the picture changes under it: pinned
  // where its thing was, it stays there; on a thing the moment shows too, it's on that thing in your recording.
  const yoursMark = (note: Note): Mark => {
    const onMoment = markOf(note);
    const node = note.on?.element?.node;
    return onMoment.node === undefined || node === undefined ? onMoment : { id: note.id, node };
  };
  // Shown until it has faded out, once the note is closed.
  const [yoursShown, setYoursShown] = useState(yours);
  if (yours && yours !== yoursShown) setYoursShown(yours);
  useEffect(() => {
    if (yours || !yoursShown) return;
    const gone = setTimeout(() => setYoursShown(undefined), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : FADING);
    return () => clearTimeout(gone);
  }, [yours]);
  // A note's dot on the line opens it, where it is: on the moment where it rests, or what you did, for one of those.
  const openFromLine = (id: string) => {
    const one = said.find(({ note }) => note.id === id);
    if (!one || writing || live?.shown) return;
    setNoting(false);
    if (!one.note.on?.app?.did.length) (setPlaying(undefined), restAt(noteAt(one.note)));
    setOpen(id);
  };
  const shownNotes = yours
    ? yoursAtEnd ? [yoursOpen!] : []
    : [...said.filter(({ note }) => restingAt(note)), ...(writing ? [{ note: writing.note, sent: false }] : [])];
  // A thing on the moment's page by its role and name, as it was read there: what it's about, or what a note made in
  // the app is on, as the app numbers its things anew.
  const nodeOf = (named?: { role: string; name: string }) => named && readings?.at(-1)?.things.find((thing) => thing.role === named.role && thing.name === named.name)?.node;
  const markOf = (note: Note): Mark => {
    const on = note.on;
    const element = on?.element;
    // A note is on the thing it was made on: made on this taking, that very thing; made in the app, or on an earlier
    // taking, the same thing drawn here, found by its role and name. Not here, as what was done in the app changed the
    // page, or the next taking took it away, it's where it was when the note was made, never on whatever here says the
    // same words.
    const node = on?.app || madeIn(note) < round.number ? nodeOf(element) : element?.node;
    // Pinned there, a dot at its corner, with nothing outlined: what's there now isn't what the note is on.
    const spot = spots[note.id];
    const where = spot ? { x: spot.x + spot.width, y: spot.y } : on?.point;
    if (madeOn(note) && node === undefined) return { id: note.id, ...(where && { point: where }) };
    return { id: note.id, ...(node !== undefined && { node }), ...(where && { point: where }) };
  };
  const aboutNode = nodeOf(about);
  // Compared, at the point, what the moment is about (else the last thing done) is in view whole, as on the older page.
  const closeNode = nodeOf(closeTo);
  const holdsAt = atPoint && closeNode !== undefined ? { id: ABOUT, node: closeNode } : undefined;
  const marks: Mark[] = [...(aboutNode !== undefined ? [{ id: ABOUT, node: aboutNode }] : []), ...shownNotes.map(({ note }) => markOf(note))];
  const pins: Pin[] = shownNotes.map(({ note, sent }) => ({ id: note.id, on: [note.id], ink: sent ? "var(--slate)" : "var(--amber)", fill: sent ? "bg-slate" : "bg-amber" }));
  // What it's about is outlined only at the point: midway, it may not be there yet.
  const aboutAt = atPoint && !live?.shown && !yours ? placed[ABOUT] : undefined;
  const openNote = shownNotes.find(({ note }) => note.id === open);

  // A click on the moment plays and pauses it, as Space does; noting, it's on what's under the pointer, said beside it.
  const aimingNote = noting && !scrubbing && !live?.shown && !writing;
  const movePill = (event: React.PointerEvent) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    pointer.current = { x: event.clientX - box.left, y: event.clientY - box.top };
    if (pill.current) pill.current.style.transform = `translate(${pointer.current.x - 3}px, ${pointer.current.y - 2}px)`;
  };

  return (
    <div
      className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden bg-ground px-6 phone:px-4"
      onPointerDown={(event) => yours && !frame.current?.contains(event.target as Node) && setOpen(undefined)}
    >
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
          style={{ aspectRatio: `${screen.width} / ${screen.height}`, width: `min(100cqw, calc((100cqh - ${UNDER}px) * ${screen.width / screen.height}))`, marginBottom: UNDER }}
          onPointerMove={(event) => (movePill(event), setAiming(!(event.target as Element).closest("[data-line], [role=toolbar]")))}
          onPointerLeave={() => setAiming(false)}
        >
          <div key={scene.recording} className="absolute inset-0 animate-arrive overflow-hidden rounded-lg bg-paper shadow-frame" onClick={(event) => !noting && !(event.target as Element).closest("button") && play()}>
            {(!phone || readings) && <Picture shot={{ src: picture(review.id, round.number, scene.recording, Math.max(0, scene.steps.length - 1)), frame: closer }} />}
            <Player
              review={review.id}
              round={round.number}
              recording={scene.recording}
              frame={closer}
              at={at}
              playing={comparing ? undefined : playing}
              following={scrubbing ? { clock: clockOf, at: (moment) => moment } : undefined}
              cut={cut}
              clock={clockOf}
              onStop={() => (setPlaying(undefined), restAt(end))}
              marks={yours ? [] : marks}
              onMarks={yours ? undefined : setPlaced}
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
            {comparing && then && both && (
              // Now leads, so it's drawn first, on the right.
              <div className="absolute inset-0 z-[5] flex animate-arrive flex-row-reverse gap-3 bg-ground">
                {[
                  { label: "Now", round: round.number, recording: scene.recording, side: 0, actualSize: { ...leading, holds: holdsAt } },
                  { label: "When you last saw it", round: then.round.number, recording: then.scene.recording, side: 1, actualSize: { ...beside, holds: holdsAt } },
                ].map((side) => (
                  <div key={side.label} className="relative min-w-0 flex-1">
                    <div className="absolute inset-0 overflow-hidden rounded-lg bg-paper shadow-frame">
                      <Player
                        review={review.id}
                        round={side.round}
                        recording={side.recording}
                        at={both.at(along)[side.side]!}
                        following={playing || scrubbing ? { clock: bothOf, at: (along) => both.at(along)[side.side]! } : undefined}
                        actualSize={side.actualSize}
                      />
                      <span className={CHIP}>{side.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {yoursShown && (
              // What you saw when you made the note, over the moment, edged in your amber, fading in and out in place.
              <div
                className={`absolute inset-0 z-[5] bg-ground transition-opacity ease-calm ${yours ? "animate-arrive" : "pointer-events-none opacity-0"}`}
                style={{ transitionDuration: `${FADING}ms` }}
              >
                <div className="absolute inset-0 overflow-hidden rounded-lg bg-paper">
                  <Player
                    review={review.id}
                    round={yoursShown.round}
                    recording={yoursShown.scene.recording}
                    at={yoursAt}
                    playing={yours ? yoursPlaying : undefined}
                    following={yoursScrubbing ? { clock: yoursClock, at: (moment) => moment } : undefined}
                    cut={yours ? yoursCut : undefined}
                    clock={yoursClock}
                    onStop={() => (setYoursPlaying(undefined), setYoursAt(yoursShown.end))}
                    marks={yours ? [yoursMark(yours.note)] : []}
                    onMarks={yours ? setPlaced : undefined}
                  />
                  <div className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_0_0_1.5px_rgba(236,178,72,0.95)]" />
                  <span className={CHIP}>What you did after stepping in</span>
                </div>
              </div>
            )}
            {/* Over what you did too, where its pin is on its thing. */}
            <div className={`pointer-events-none absolute inset-0 ${yoursShown ? "z-[6]" : ""}`}>
              <Pinned pins={pins} placed={placed} open={open ?? writing?.note.id} faded={!!playing || scrubbing || !!live?.shown || !!yoursPlaying || yoursScrubbing} onOpen={(id) => (setNoting(false), setOpen(id))} />
            </div>
          </div>
          <Progress
            key={yours ? "yours" : "moment"}
            clock={yours ? yoursClock : clockOf}
            share={yours ? yoursShareOf(yoursAt) : shareOf(at)}
            shareOf={yours ? yoursShareOf : shareOf}
            moving={yours ? !!yoursPlaying || yoursScrubbing : !!playing || scrubbing}
            playing={yours ? !!yoursPlaying : !!playing}
            yours={!!yours}
            dots={yours ? [] : said.map(({ note, sent }) => ({ id: note.id, share: shareOf(noteAt(note)), fill: sent ? "bg-slate" : "bg-amber" }))}
            onDot={openFromLine}
            onScrub={
              yours
                ? yoursCut && scrubYours
                : live?.shown || writing || !cut
                ? undefined
                : (share, phase) => {
                    if (phase === "down") (setPlaying(undefined), setOpen(undefined), setNoting(false), setScrubbing(true));
                    if (phase !== "up") return (clockOf.set(momentOf(share)), both && bothOf.set(both.of(momentOf(share))));
                    setScrubbing(false);
                    restAt(share >= 0.995 ? end : momentOf(share));
                  }
            }
          />
          <Portal live={live && { ...live, inApp }} person={person} screen={screen} scrolled={() => scrolled.current?.()} waiting="Stepping in…" />
          <span ref={pill} aria-hidden className={`pointer-events-none absolute top-0 left-0 z-30 transition-opacity duration-150 ease-calm ${aimingNote && aiming ? "" : "opacity-0"}`}>
            <span className={TAG}>Note on this</span>
          </span>
          {writing && <NoteCard at={(!writing.note.on?.app && pinOf(placed[writing.note.id])) || writing.spot} frame={frame}><Write onSave={save} onDrop={() => setWriting(undefined)} /></NoteCard>}
          {!writing && openNote && (
            <NoteCard at={pinOf(placed[openNote.note.id]) ?? { x: 24, y: 24 }} frame={frame}>
              <div className="min-h-0 flex-1 overflow-y-auto px-1">
                {openNote.sent ? (
                  <Turns you={you} turns={conversation(review, openNote.note.id)} />
                ) : (
                  <Turns you={you} turns={[]} unsent={openNote.note.words} />
                )}
              </div>
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
          {/* What you can do here, across the recording's bottom edge, as on the older page, with the line under it. */}
          <div
            role="toolbar"
            aria-label="This moment"
            onClick={(event) => (event.target as Element).closest("button")?.blur()}
            className={`absolute top-full left-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 gap-0.5 rounded-xl bg-surface p-1 text-[13px] select-none ${inApp ? "shadow-[0_0_0_1.5px_rgba(236,178,72,0.95),0_6px_20px_rgba(20,24,34,0.12)]" : "shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]"}`}
            style={{ height: BAR }}
          >
          <button className={`${ITEM} w-[96px] phone:w-[64px]`} disabled={!!live?.shown || !(yours ? yoursCut : cut)} onClick={play}>
            <span className="w-9 text-left">{(yours ? yoursPlaying : playing) ? "Pause" : "Play"}</span> <Key className="min-w-9">Space</Key>
          </button>
          <button className={`${ITEM} w-[116px] phone:w-[104px]`} disabled={!!writing || !!yours} aria-pressed={stepping} onClick={stepIn}>
            {inApp ? "Back" : stepping ? "Stepping in…" : "Step in"} {!stepping && <Key>{inApp ? "Esc" : "T"}</Key>}
          </button>
          <button className={`${ITEM}`} disabled={stepping || !!writing || comparing || !!yours} aria-pressed={noting} onClick={note}>
            Note <Key>N</Key>
          </button>
          {then && (
            <button className={`${ITEM}`} disabled={!!live?.shown || !!writing || !!yours} aria-pressed={comparing} onClick={compare}>
              Compare <Key>C</Key>
            </button>
          )}
          </div>
        </div>
        {live?.problems && <p className="absolute bottom-0 left-1/2 max-w-[90%] -translate-x-1/2 translate-y-full rounded-md bg-surface px-3 py-1.5 text-xs text-amber-ink shadow-tip">{live.problems.join(" ")}</p>}
      </div>
      <div className="h-10" />
    </div>
  );
}

// Two recordings of a moment played together, from the moments both pass together: now with its waiting cut short, as
// it plays alone, and where only the other moves, as long as that takes there. Along it, where each is; and where now's
// moment first is along it.
type Played = { at: (along: number) => [number, number]; of: (moment: number) => number };
function playedTogether(cut: Cut, [now, then]: [number[], number[]]): Played {
  const spans = now.slice(1).map((to, i) => (to > now[i]! ? cut.cut(to) - cut.cut(now[i]!) : then[i + 1]! - then[i]!));
  const starts = spans.map((_, i) => spans.slice(0, i).reduce((sum, span) => sum + span, 0));
  return {
    at(along) {
      const i = Math.max(0, starts.findLastIndex((start) => start <= along));
      const into = Math.min(Math.max(0, along - starts[i]!), spans[i] ?? 0);
      if (now[i + 1] === undefined) return [now[i]!, then[i]!];
      if (now[i + 1] === now[i]) return [now[i]!, then[i]! + into];
      const moment = cut.real(cut.cut(now[i]!) + into);
      return [moment, then[i]! + ((then[i + 1]! - then[i]!) * (moment - now[i]!)) / (now[i + 1]! - now[i]!)];
    },
    of(moment) {
      const i = now.findIndex((to, k) => k > 0 && to >= moment && to > now[k - 1]!) - 1;
      if (i < 0) return moment <= 0 ? 0 : starts.at(-1)! + spans.at(-1)!;
      return starts[i]! + cut.cut(Math.max(moment, now[i]!)) - cut.cut(now[i]!);
    },
  };
}

// On a phone, the keys go, so the bar fits with all four.
const ITEM =
  "phone:[&_kbd]:hidden inline-flex items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 whitespace-nowrap text-fg transition-colors duration-150 ease-calm enabled:hover:bg-hover disabled:cursor-default disabled:opacity-50 aria-pressed:bg-hover [&_kbd]:text-[color-mix(in_srgb,var(--faint)_55%,var(--soft))]";
// How many seconds of a moment Play shows, waiting cut short.
const LEADING = 7;
const ABOUT = "about";
// The line along the recording takes this much room, pointer and all, under the bar, whose lower half hangs below the
// recording's edge.
const LINE = 14;
const BAR = 40;
const UNDER = BAR / 2 + 6 + LINE;

// How far through the few seconds Play shows it is, under the bar, as wide as the recording: always there, full at the point,
// filling as it plays. Pressed or dragged, the recording follows; let go at its end, it's at the point.
function Progress(props: {
  clock: Clock;
  share: number;
  shareOf: (moment: number) => number;
  moving: boolean;
  playing: boolean;
  // Your own recording, from where you stepped in to your note, in your amber.
  yours: boolean;
  dots: { id: string; share: number; fill: string }[];
  onDot: (id: string) => void;
  onScrub?: (share: number, phase: "down" | "move" | "up") => void;
}) {
  const { clock, share, shareOf, moving, playing, yours, dots, onDot, onScrub } = props;
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
      className={`group absolute inset-x-0 touch-none ${onScrub ? "cursor-pointer" : ""}`}
      style={{ top: `calc(100% + ${UNDER - LINE}px)`, height: LINE }}
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
      <div
        className={`absolute inset-x-0 top-[6px] rounded-full transition-[height,top] duration-150 ease-calm ${yours ? "bg-[color-mix(in_srgb,var(--amber)_28%,transparent)]" : "bg-line"} ${held ? "top-[5px] h-1" : "h-0.5"} ${onScrub ? "group-hover:top-[5px] group-hover:h-1" : ""}`}
      >
        <div ref={fill} className={`h-full rounded-full transition-colors duration-150 ease-calm ${yours ? "bg-amber" : `${held ? "bg-fg" : playing ? "bg-soft" : "bg-faint"} ${onScrub ? "group-hover:bg-fg" : ""}`}`} />
        {dots.map((dot) => (
          <i
            key={dot.id}
            className="absolute top-1/2 grid size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center"
            style={{ left: `${dot.share * 100}%` }}
            onPointerDown={(event) => (event.stopPropagation(), onDot(dot.id))}
          >
            <i className={`size-1.5 rounded-full ${dot.fill}`} />
          </i>
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
  // In the frame's lower half, it grows upward from the pin, so it never runs off under the bar.
  const high = frame.current?.clientHeight ?? 0;
  const place = at.y > high / 2 ? { bottom: Math.max(8, high - at.y - 12) } : { top: Math.max(8, at.y - 12) };
  return (
    <div className="absolute z-40 flex max-h-[min(70vh,calc(100%-16px))] animate-arrive flex-col rounded-xl bg-surface p-2 shadow-float" style={{ left, ...place, width }} onClick={(event) => event.stopPropagation()}>
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
        ref={(area) => void (area && !area.dataset.focused && ((area.dataset.focused = "1"), area.focus({ preventScroll: true })))}
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
