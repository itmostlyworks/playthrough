// What's waiting on you from every app on this machine, each change by its title with its moments under it, a still
// each in the agent's words; and a moment opened, the app at the point that matters, still and as large as the window
// allows. From there: look (play the few seconds that led here), step in (the real app there, as that person), or say
// something (a note on what you click). Going on to the next moment is the yes. What you said goes to the agent by the
// change's one button on the list: Send, or Done with nothing to say. The list is at /, each moment at
// /moments/<its change's address>/<n>; the recording, the pointer, the pins and stepping in are the page's own.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Glimpse, Reading, Thing } from "@playthrough/page";
import { allNotes, conversation, newId, pausedAt, shownFrom, together, waitingForTheAgent, type Turn, type Did, type Note, type Place, type Review, type Round, type Scene } from "@playthrough/review";
import { fineStill, glimpses, keepBranch, noteFrame, picture, readings as readingsOf, recording, send, useChanges, useYou, type Listed, type NoteFrame } from "./api.ts";
import { Edge, TILE, Tile } from "./Edge.tsx";
import { Key, tick } from "./Card.tsx";
import { around, Picture, union, type Frame } from "./Picture.tsx";
import { workingSince } from "./notes.ts";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Clock, Player, useCut, type Cut, type Mark, type Placed } from "./Player.tsx";
import type { Together } from "./view.ts";
import { Portal, TAG } from "./Portal.tsx";
import { CHIP } from "./Scene.tsx";
import { readyAt, readyIn } from "./live.ts";
import { usePhone } from "./phone.ts";
import { clamp } from "./moments.ts";
import type { Rect, Scrolled } from "./replay.ts";

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
  return <List changes={changes} you={you} onOpen={(review, moment, note) => (keepScroll(), go({ review, moment, note }))} />;
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
// What a note says wherever it's shown, a line on the list, its picture's words or its pin pointed at: your latest
// words, and where it stands. An answer is new if it came back after you last opened the moment it's on, as what you've
// opened is kept with the change (`seen`), so it's the same on every device you look from.
function noteSays(review: Review, you: string, note: Note, sent: boolean, replies: Replied[]) {
  if (!sent) return { words: note.words, stands: "not sent yet", fresh: false };
  const turns = conversation(review, note.id);
  const replied = replies.find((one) => one.note === note.id)?.words;
  const words = replied ?? turns.findLast((turn) => !turn.agent)?.words ?? note.words;
  if (replied) return { words, stands: "reply not sent yet", fresh: false };
  if (!turns.at(-1)?.agent) return { words, stands: "sent", fresh: false };
  const [round, on] = [turns.at(-1)!.round, note.on?.app?.from.scene ?? note.on?.scene];
  const fresh = !seenOf(review, you).some((taking) => Number(taking.slice(0, taking.indexOf(":"))) >= round && taking.slice(taking.indexOf(":") + 1) === on);
  return { words, stands: fresh ? "new answer" : "answered", fresh };
}

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

// Where the list was scrolled as you went to a moment, for coming back to it there.
const scrollKey = "playthrough:moments-scroll";
const keepScroll = () => {
  try {
    sessionStorage.setItem(scrollKey, String(scrollY));
  } catch {}
};
function scrolledBack() {
  try {
    const kept = Number(sessionStorage.getItem(scrollKey) ?? 0);
    sessionStorage.removeItem(scrollKey);
    return kept;
  } catch {
    return 0;
  }
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
  // Those you sent, landing where they go: each is brought into view there, and glows as it lands.
  const landing = useRef(new Set<string>());
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
      if (yours && to) landing.current.add(now.review.id);
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
  // Come back from a moment, it's where you left it.
  const placedBack = useRef(false);
  useLayoutEffect(() => {
    if (placedBack.current || !shown || !you) return;
    placedBack.current = true;
    const kept = scrolledBack();
    if (kept) scrollTo(0, kept);
  }, [shown, you]);
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
      landing={landing.current.delete(listed.review.id)}
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
  // Sent from here, it's arriving where it goes.
  landing?: boolean;
  keyed: boolean;
  onToggle: () => void;
  onOpen: (moment: number, note?: string) => void;
  // Going as you send or say Done; then gone, or staying where it is, as the send wasn't kept.
  onLeaving: (going: boolean, moved?: boolean) => void;
}) {
  const { listed, standing, told, you, now, open, arrived, landing, keyed, onToggle, onOpen, onLeaving } = props;
  const stands = told === listed ? standing : standingOf(told.review, you);
  const { review } = listed;
  const round = latestOf(review)!;
  const [grown, setGrown] = useState(!arrived);
  const own = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (grown) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
    return () => cancelAnimationFrame(frame);
  }, []);
  // Landed where you sent it, it's brought into view and glows a moment, so you see where it went.
  const [glowing] = useState(!!landing);
  useEffect(() => {
    if (!landing) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shown = setTimeout(() => own.current?.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" }), still ? 0 : LEAVING);
    return () => clearTimeout(shown);
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
  // Sent, it says so where you pressed, and only then goes.
  const [sentNow, setSentNow] = useState(false);
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
    setSentNow(true);
    await new Promise((done) => setTimeout(done, matchMedia("(prefers-reduced-motion: reduce)").matches ? 900 : SAID));
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
    <SendButton className="self-start" filled={!!said && !sentNow} onClick={said ? sendNow : doneNow} disabled={busy || leaving || sentNow}>
      {sentNow ? <>{tick}{said ? "Sent" : "Done"}</> : said ? <>Send {toSend(notes.length, replies.length)} <Key className={FILLED_KEY}>Ctrl ↵</Key></> : "Done"}
    </SendButton>
  );
  const not = problems && <span className="text-amber-ink"> · Not sent: {problems[0]}</span>;
  return (
    <div
      ref={own}
      className={`grid transition-[grid-template-rows,opacity,margin] ease-calm ${glowing ? "[&>div]:animate-glow [&>div]:rounded-lg" : ""} ${leaving || !grown ? "mt-0 grid-rows-[0fr] opacity-0" : `grid-rows-[1fr] ${waiting ? "mt-12 first-of-type:mt-6" : ""}`}`}
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
                  <button onClick={() => onOpen(i + 1)} className="group block w-full text-left focus-visible:outline-none">
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
                    const lines = [
                      ...talk.map(([id, kept]) => ({ id, ...noteSays(review, you, kept.note, true, replies) })),
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
      <span className={`w-[100px] flex-none text-right text-xs ${fresh ? "font-medium text-fg" : "text-faint"}`}>{stands}</span>
    </button>
  );
}

// Send, the one filled button there is, while something is unsent; else plain, as Done is. Arriving, as the first note
// is kept, it comes in with the note landing on the edge, so it's seen.
function SendButton({ filled, arrives, className = "", children, ...rest }: { filled: boolean; arrives?: boolean; className?: string; children: ReactNode; onClick: () => void; disabled: boolean }) {
  const own = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!arrives || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    own.current?.animate([{ opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1.04, offset: 0.6 }, { opacity: 1, scale: 1 }], { duration: 520, delay: 120, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards" });
  }, []);
  return (
    <button
      ref={own}
      onMouseDown={(event) => event.preventDefault()}
      {...rest}
      className={`flex h-8 flex-none items-center gap-2 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow,opacity] duration-200 ease-calm ${filled ? "bg-fg text-ground shadow-[0_1px_2px_var(--drop)] enabled:hover:bg-[color-mix(in_srgb,var(--fg)_86%,var(--ground))]" : "bg-surface text-fg shadow-[0_0_0_1px_var(--edge),0_1px_2px_var(--drop)] enabled:hover:bg-hover"} ${className}`}
    >
      {children}
    </button>
  );
}
// A key's cap on the filled button, in its words' colour.
const FILLED_KEY = "text-[inherit]! opacity-70 shadow-[0_0_0_1px_color-mix(in_srgb,currentColor_45%,transparent)]!";

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
// How long what you sent says so where you pressed, before it goes where it goes.
const SAID = 1400;
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
  const shown = reading && aboutBox(reading, about);
  return shown && around(shown, reading.screen, shape, 3);
}
// What a moment is about with its nearest words, as a field's label and the line under it, on its page: the part of
// it to keep in view.
function aboutBox(reading: Reading | undefined, about: { role: string; name: string } | undefined) {
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
  return union([thing.box, ...near.map(wordsOf)]);
}

// A moment's still: the app at its point, closed in on what it's about, or where it names nothing, on the last thing
// done on the way that's still there; the whole screen where there's neither. What runs off an edge the page goes on
// past fades there rather than being cut. Seen, it's quieter.
const FADE = 20;
function Still({ review, round, scene, about, seen }: { review: Review; round: Round; scene: Scene; about?: { role: string; name: string }; seen: boolean }) {
  return (
    // Under the pointer it's ringed and gives a little as it's pressed, as a picture on a moment's edge does.
    <span
      className={`relative block aspect-[1.6] overflow-hidden rounded-lg bg-paper shadow-frame transition-[filter,opacity,box-shadow,scale] duration-200 ease-calm group-hover:opacity-100 group-hover:shadow-[0_0_0_2px_var(--ground),0_0_0_3.5px_var(--faint)] group-hover:grayscale-0 group-focus-visible:shadow-[0_0_0_2px_var(--ground),0_0_0_4px_var(--amber)] group-active:scale-[0.98] group-active:duration-75 ${seen ? "opacity-60 grayscale" : ""}`}
    >
      <StillPicture review={review} round={round} scene={scene} about={about} />
    </span>
  );
}

// The still's picture alone, for whatever holds it: the list, or a moment's edge.
function StillPicture({ review, round, scene, about }: { review: Review; round: Round; scene: Scene; about?: { role: string; name: string } }) {
  const [frame, setFrame] = useState<Frame>();
  // Closed in, the picture kept as it was recorded is shown larger than it was taken on a screen of twice the dots: there,
  // it's drawn twice as fine, and the kept one shows until that's in.
  const [sharp, setSharp] = useState<string>();
  useEffect(() => {
    let current = true;
    readingsOf(review.id, round.number, scene.recording).then((read) => current && setFrame(closeOn(read.at(-1), about, STILL)));
    if (devicePixelRatio > 1)
      void fineStill(review.id, round.number, scene.recording, scene.length).then((src) => {
        if (!src || !current) return;
        const loaded = new Image();
        loaded.onload = () => current && setSharp(src);
        loaded.src = src;
      });
    return () => void (current = false);
  }, [scene.recording, about?.name]);
  return (
    <span className="absolute inset-0" style={frame && fadeOf(frame)}>
      <Picture shot={{ src: sharp ?? picture(review.id, round.number, scene.recording, Math.max(0, scene.steps.length - 1)), frame }} />
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

// Stepping in: since when, and when it should be there, if that can be known.
type Live = { scene: string; from: number; address?: string; shown: boolean; settled?: boolean; problems?: string[]; at?: { x: number; y: number }; since: number; due?: number };
// Where it was asked for: the spot, and the thing there where the app said where it is, in the recording's pixels.
type Writing = { note: Note; spot: { x: number; y: number }; box?: Rect };

// A moment where nothing is done from there on is a still: its picture, with nothing to play.
const isStill = (scene: Scene) => !scene.steps.some((step) => (step.actions ?? []).some((action) => action >= shownFrom(scene)));

// Where a note was made: the recording it was made on (a taking of the moment, or yours, stepped in), the moment in it,
// and its thing there, by that recording's own numbering, or its spot.
type Made = { round: number; recording: string; at: number; node?: number; point?: { x: number; y: number } };

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
  // A note to open as the moment opens, pressed on the list.
  opening?: string;
  onMoment: (n: number) => void;
  onLeave: () => void;
}) {
  const { review, round, n, about, who, notes, setNotes, replies, setReplies, you, onMoment, onLeave } = props;
  // Send, here as on the list: everything unsent on the change goes. Sent, it says so where you pressed, and what was
  // sent is drawn as sent at once, as the change comes back with it.
  const [sending, setSending] = useState<"sending" | "sent" | string[]>();
  const [justSent, setJustSent] = useState<Note[]>([]);
  const sent = [...props.sent, ...justSent.filter((note) => !props.sent.some((one) => one.id === note.id))];
  const unsent = notes.length + replies.length;
  const sendNow = async () => {
    if (!unsent || sending === "sending") return;
    setSending("sending");
    const [goingNotes, goingReplies] = [notes, replies];
    const problems = await send(review.id, { id: newId(), round: round.number, by: you, sent: new Date().toISOString(), verdicts: [], notes: goingNotes, ...(goingReplies.length && { replies: goingReplies }), looksGood: [] });
    if (problems.length) return setSending(problems);
    setJustSent((now) => [...now, ...goingNotes]);
    setNotes(() => []);
    setReplies(() => []);
    setSending("sent");
  };
  useEffect(() => {
    if (sending !== "sent") return;
    const done = setTimeout(() => setSending(undefined), SAID + 1000);
    return () => clearTimeout(done);
  }, [sending]);
  const scene = round.scenes[n - 1]!;
  const count = round.scenes.length;
  const end = Math.max(0, scene.length - 0.05);
  const from = Math.min(shownFrom(scene), end);
  const still = isStill(scene);
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
  // The recording's shape, kept from one moment to the next until the next's is known, so the recording never changes
  // size as you go from one to another.
  const [screen, setScreen] = useState({ width: 1280, height: 800 });
  const shape = readings?.at(-1)?.screen;
  useEffect(() => void (shape && (shape.width !== screen.width || shape.height !== screen.height) && setScreen(shape)), [shape?.width, shape?.height]);
  // On a phone, the whole screen is too small to read: it's closed in on what the moment is about, as its still is.
  const phone = usePhone();
  const closeTo = about ?? scene.acted;
  const closer = useMemo(() => (phone ? closeOn(readings?.at(-1), closeTo, screen.width / screen.height) : undefined), [phone, readings, closeTo?.role, closeTo?.name]);
  const cut = useCut(review.id, round.number, scene);
  const [clockOf] = useState(() => new Clock(end));
  const [playing, setPlaying] = useState<{ until: number }>();
  // Where it rests: its end, as it opens, or wherever it was paused. Another moment opens at its own end.
  const [rest, setRest] = useState<{ scene: string; at: number; along?: number }>({ scene: scene.name, at: end });
  const at = rest.scene === scene.name ? rest.at : end;
  // Compare: this moment as it was when you last looked at it, before this hand-back, beside how it is now, played
  // together. Offered only where there's such a look; where nothing differs since, the bar says so instead. Any moment
  // of the change with a look keeps the bar four wide for every one, so it never changes width going from one to the next.
  const [looked] = useState(() => seenOf(review, you));
  const lastLook = (one: Scene) => {
    const earlier = review.rounds.findLast((kept) => kept.number > 0 && kept.number < round.number && kept.finished && looked.includes(takingOf(kept.number, one.name)) && kept.scenes.some((taken) => taken.name === one.name));
    const kept = earlier?.scenes.find((taken) => taken.name === one.name);
    return earlier && kept ? { round: earlier, scene: kept } : undefined;
  };
  const anyLook = round.scenes.some((one) => lastLook(one));
  const looking = lastLook(scene);
  const compared = looking && review.comparisons.find((one) => one.round === round.number && one.since === looking.round.number);
  const unchanged = !!compared && !compared.changes.some((change) => change.seen.some((seen) => seen.scene === scene.name));
  const then = unchanged ? undefined : looking;
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
  const atPoint = !playing && at >= end - 0.02;
  // How far through what's shown it is, waiting cut short, as Play's line counts it.
  const shareOf = (moment: number) => (cut ? clamp((cut.cut(moment) - cut.cut(from)) / Math.max(0.01, cut.cut(end) - cut.cut(from))) : 1);
  const [noting, setNoting] = useState(false);
  const [writing, setWriting] = useState<Writing>();
  const [open, setOpen] = useState<string>();
  const [placed, setPlaced] = useState<Placed>({});
  const [live, setLive] = useState<Live>();
  // A note's pin on the recording and its picture on the edge are one thing: pointing at either lights both. A pin
  // pointed at says its note right there, as its picture does, after a breath, so passing over one says nothing.
  const [pointed, setPointed] = useState<string>();
  const [saying, setSaying] = useState<string>();
  const sayingAfter = useRef(0);
  const pointPin = (id?: string) => {
    setPointed(id);
    clearTimeout(sayingAfter.current);
    if (!id) return setSaying(undefined);
    sayingAfter.current = window.setTimeout(() => setSaying(id), 120);
  };
  // Opened or closed, it stops where it's got to.
  const compare = () => {
    if (!then || live?.shown) return;
    if (playing) (setPlaying(undefined), restAt(clockOf.at, comparing ? bothOf.at : undefined));
    setOpen(undefined);
    setNoting(false);
    leading.together.centre = undefined;
    setComparing((now) => !now);
  };
  // Played compared, both sides go together, each as far as the other along what both did.
  useEffect(() => {
    if (!comparing || !playing || !both) return;
    const [start, until, since] = [clockOf.at === at ? along : both.of(clockOf.at), both.of(playing.until), performance.now()];
    let frameId = 0;
    const tick = () => {
      const going = Math.min(until, start + (performance.now() - since) / 1000);
      bothOf.set(going);
      clockOf.set(both.at(going)[0]);
      if (going >= until) return (setPlaying(undefined), restAt(playing.until, until));
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [comparing, playing, both]);
  const scrolled = useRef<(() => Scrolled) | undefined>(undefined);
  const frame = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const pill = useRef<HTMLSpanElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
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
    setComparing(false);
    clockOf.set(end);
  }, [n]);

  // Going to another moment, the one you were on stays under the new one until it has come in over it.
  const [behind, setBehind] = useState<string>();
  const was = useRef(scene);
  if (was.current !== scene) {
    if (was.current.recording !== scene.recording && !phone && !matchMedia("(prefers-reduced-motion: reduce)").matches) setBehind(picture(review.id, round.number, was.current.recording, Math.max(0, was.current.steps.length - 1)));
    was.current = scene;
  }

  const inApp = !!live?.shown && !!live.settled && !!live.address;
  const stepping = !!live?.shown && !inApp;
  const person = scene.person;

  const play = () => {
    if (live?.shown || writing || still) return;
    setOpen(undefined);
    setNoting(false);
    if (!cut) return;
    // Paused, it stays where it is; played, it carries on from there, or from where what's shown starts.
    if (playing) return (setPlaying(undefined), restAt(clockOf.at, comparing ? bothOf.at : undefined));
    clockOf.set(atPoint || at < from ? from : at);
    setPlaying({ until: end });
  };
  const stepIn = () => {
    if (live?.shown) return back();
    // Pressed while it plays, it's where the recording has got to that's stepped into, and it stops there: `at` is
    // only where it last rested.
    const where = playing ? clockOf.at : at;
    const paused = pausedAt(scene, where);
    // A note open on a frame of its own shows somewhere the app can't be taken to: stepping in from it would swap the
    // picture for the moment's and open the app there. Closed, Step in answers again.
    if (!paused || writing || elsewhere) return;
    setComparing(false);
    if (playing) (setPlaying(undefined), restAt(where));
    setOpen(undefined);
    setNoting(false);
    session.current = { id: newId(), events: [], did: [], kept: 0 };
    const since = Date.now();
    setLive({ scene: scene.name, from: where, shown: true, since });
    readyIn(review.id, scene.name, paused).then((left) => left && setLive((now) => (now?.since === since ? { ...now, due: since + left } : now)));
    readyAt(review.id, scene.name, paused).then((answer) =>
      setLive((now) => (now?.scene !== scene.name || now.from !== where ? now : typeof answer === "string" ? { ...now, address: answer } : { ...now, problems: answer, shown: false })),
    );
  };
  const back = (at?: { x: number; y: number }) => {
    setNoting(false);
    setLive((now) => now && { ...now, shown: false, at });
    window.focus();
  };
  const note = () => {
    if (writing || stepping || open) return;
    // Stopped where it has got to, not back where it last rested.
    if (playing) (setPlaying(undefined), restAt(clockOf.at));
    setNoting((now) => !now);
  };
  const next = (by: number) => {
    if (writing || live?.shown) return;
    const to = n + by;
    if (to < 1) return;
    if (to > count) return onLeave();
    onMoment(to);
  };
  const toMoment = (to: number) => !writing && !live?.shown && to !== n && onMoment(to);

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
      const scale = (x: number, y: number) => ({ x: box.left - shown.left + (x * box.width) / iframe.offsetWidth, y: box.top - shown.top + (y * box.height) / iframe.offsetHeight });
      const thing = data.box && { ...scale(data.box.x, data.box.y), right: scale(data.box.x + data.box.width, data.box.y + data.box.height) };
      setWriting({ note: { id: newId(), on, words: "" }, spot, ...(thing && { box: { left: thing.x, top: thing.y, width: thing.right.x - thing.x, height: thing.right.y - thing.y } }) });
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
    if (live?.shown) madeThere.current.add(kept.id);
    if (kept.on?.app && inApp) pinInApp(kept, mine.length + 1);
  };

  // What you said on this moment, sent and then unsent, in the order said: the edge's pictures, and the pins.
  const mine = notes.filter((one) => one.on?.scene === scene.name);
  const theirs = sent.filter((one) => one.on?.scene === scene.name);
  const said = [...theirs.map((note) => ({ note, sent: true })), ...mine.map((note) => ({ note, sent: false }))];
  // Made in the app while you're there, a note joins the edge once you're back.
  const madeThere = useRef(new Set<string>());
  const onEdge = said.filter(({ note }) => !(live?.shown && madeThere.current.has(note.id)));
  // What was new as you came to this moment stays new here until you open it: coming counts as seeing it, for the list
  // and for next time.
  const newAsYouCame = useRef(new Map<string, Set<string>>());
  if (!newAsYouCame.current.has(scene.name)) newAsYouCame.current.set(scene.name, new Set(said.filter(({ note, sent }) => noteSays(review, you, note, sent, replies).fresh).map(({ note }) => note.id)));
  const [openedHere, setOpenedHere] = useState<string[]>([]);
  useEffect(() => void (open && !openedHere.includes(open) && setOpenedHere((now) => [...now, open])), [open]);
  const says = (note: Note, sent: boolean) => {
    const said = noteSays(review, you, note, sent, replies);
    const fresh = sent && said.stands !== "sent" && said.stands !== "reply not sent yet" && !!newAsYouCame.current.get(scene.name)?.has(note.id) && !openedHere.includes(note.id);
    return { ...said, fresh, stands: said.stands === "new answer" || said.stands === "answered" ? (fresh ? "new answer" : "answered") : said.stands };
  };
  const made = allNotes(review);
  const madeIn = (note: Note) => made.get(note.id)?.round ?? round.number;
  const madeAt = (note: Note): Made | undefined => {
    const on = note.on;
    const thing = on?.element?.node !== undefined ? { node: on.element.node } : on?.point && { point: on.point };
    if (on?.app) return { round: madeIn(note), recording: on.app.recording, at: Math.min(on.app.length, on.at ?? on.app.length), ...thing };
    const taking = review.rounds.find((one) => one.number === madeIn(note))?.scenes.find((one) => one.name === on?.scene);
    return taking && { round: madeIn(note), recording: taking.recording, at: on?.at ?? taking.length, ...thing };
  };
  // A thing on the moment's page by its role and name, as it was read at its end.
  const nodeOf = (named?: { role: string; name: string }) => named && readings?.at(-1)?.things.find((thing) => thing.role === named.role && thing.name === named.name)?.node;
  // A note is shown on its thing as it is now wherever that thing is in the moment's picture now, found as its pin is;
  // only otherwise on the frame it was made on. Its picture on the edge and the note open both go by this.
  const nowOn = (note: Note) => {
    const node = note.on?.app || madeIn(note) < round.number ? nodeOf(note.on?.element) : note.on?.element?.node;
    return node !== undefined && readings?.at(-1)?.things.some((thing) => thing.node === node) ? node : undefined;
  };
  const shownAt = (note: Note): Made | undefined => {
    const node = nowOn(note);
    return node !== undefined ? { round: round.number, recording: scene.recording, at: scene.length, node } : madeAt(note);
  };
  const isNow = (shown?: Made) => !!shown && shown.round === round.number && shown.recording === scene.recording && Math.abs(shown.at - scene.length) < 0.1;
  const frames = useFrames(review, readings ? onEdge.map(({ note }) => ({ note, shown: shownAt(note) })) : []);
  // A note's pin is on the recording whenever its thing is in the picture: made on this taking, that very thing; made in
  // the app or on an earlier taking, the same thing drawn here, by its role and name. One on a spot is on this taking's
  // picture only where it was made.
  const markOf = (note: Note): Mark => {
    const on = note.on;
    const node = on?.app || madeIn(note) < round.number ? nodeOf(on?.element) : on?.element?.node;
    if (node !== undefined) return { id: note.id, node };
    if (!on?.app && madeIn(note) === round.number && on?.point && Math.abs((on.at ?? end) - at) < 0.06) return { id: note.id, point: on.point };
    return { id: note.id };
  };
  const aboutNode = nodeOf(about);
  // Compared, at the point, what the moment is about (else the last thing done) is in view whole, as on the older page.
  const closeNode = nodeOf(closeTo);
  // with its nearest words, as the line under a field, which is often what changed.
  const held = useMemo(() => {
    const end = readings?.at(-1);
    const box = end && aboutBox(end, closeTo);
    return box && { x: box.x / end.screen.width, y: box.y / end.screen.height, width: box.width / end.screen.width, height: box.height / end.screen.height };
  }, [readings, closeTo?.role, closeTo?.name]);
  const holdsAt = atPoint && held ? { id: ABOUT, box: held } : undefined;
  const pinned = [...onEdge, ...(writing ? [{ note: writing.note, sent: false }] : [])];
  const marks: Mark[] = [...(aboutNode !== undefined ? [{ id: ABOUT, node: aboutNode }] : []), ...pinned.map(({ note }) => markOf(note))];
  const pinFor = ({ note, sent }: { note: Note; sent: boolean }): Pin => ({ id: note.id, on: [note.id], ink: sent ? "var(--slate)" : "var(--amber)", fill: sent ? "bg-slate" : "bg-amber" });

  // A note open shows the frame it was made on, wherever that was, its pin on its thing and what's been said on it,
  // and nothing more. It fades in over the moment, and out again where it was.
  const opened = live?.shown ? undefined : onEdge.find(({ note }) => note.id === open);
  const openMade = opened && shownAt(opened.note);
  // Its thing is in the moment's picture now: the moment, at its end, is where it's shown.
  const openNow = isNow(openMade);
  // Open on a frame of its own, not on the moment as it is now.
  const elsewhere = !!opened && !openNow;
  // Shown as it was before the agent last handed the moment back, the bar says so where Play would be.
  const asItWas = !!opened && !openNow && !!openMade && openMade.round < round.number;
  const openNote = (id: string) => {
    if (writing || live?.shown) return;
    setNoting(false);
    setComparing(false);
    if (playing) (setPlaying(undefined), restAt(clockOf.at));
    setOpen((now) => (now === id ? undefined : id));
  };
  // Next goes through this moment's answers that were new as you came to it, one by one, before it goes on.
  const nextAnswer = !live?.shown && !writing ? onEdge.find(({ note, sent }) => note.id !== open && says(note, sent).fresh) : undefined;
  const onward = () => (nextAnswer ? openNote(nextAnswer.note.id) : next(1));
  const [layers, setLayers] = useState<{ note: Note; sent: boolean; made: Made }[]>([]);
  // Where the recording has the open note's thing on its own frame, once it has said, and for which note.
  const [openPlaced, setOpenPlaced] = useState<{ note: string; at: Placed }>();
  const shut = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (opened && openNow && at < end - 0.02) restAt(end);
    if (opened && openMade && !openNow) {
      setLayers((now) => [...now.filter((one) => one.note.id !== opened.note.id).slice(-1), { ...opened, made: openMade }]);
      // The one under it goes once the new one has come in over it.
      const settled = setTimeout(() => setLayers((now) => now.slice(-1)), FADING);
      return () => clearTimeout(settled);
    }
    if (!layers.length) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fading = calm ? undefined : shut.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADING, easing: "ease", fill: "forwards" });
    let current = true;
    void (fading?.finished ?? Promise.resolve()).then(() => current && (setLayers([]), setOpenPlaced(undefined)), () => {});
    return () => void ((current = false), fading?.cancel());
  }, [opened?.note.id, openNow]);
  const shownOpen = layers.at(-1);
  // On its picture, its thing is where the picture says, as the picture's drawn in the recording's room.
  const [, resized] = useState(0);
  useEffect(() => {
    if (!layers.length) return;
    const again = () => resized((n) => n + 1);
    addEventListener("resize", again);
    return () => removeEventListener("resize", again);
  }, [layers.length > 0]);
  const pictured = shownOpen && frames[shownOpen.note.id];
  const onPicture = ((): Placed | undefined => {
    const shown = frame.current;
    if (!shownOpen || !pictured?.box || !shown) return undefined;
    const { screen, box } = pictured;
    const k = Math.min(shown.clientWidth / screen.width, shown.clientHeight / screen.height);
    const [left, top] = [(shown.clientWidth - screen.width * k) / 2, (shown.clientHeight - screen.height * k) / 2];
    return { [shownOpen.note.id]: { left: left + box.x * screen.width * k, top: top + box.y * screen.height * k, width: box.width * screen.width * k, height: box.height * screen.height * k } };
  })();
  const told = shownOpen && openPlaced?.note === shownOpen.note.id ? openPlaced.at : undefined;
  const openAt = pictured ? (onPicture ?? {}) : (told ?? {});
  // What the bar must never cover: an open note's thing while it's open; else, from the first frame shown to the last,
  // what the moment is about and the last thing done in it, where the page has them at its end, known from its reading
  // before anything is drawn. The bar is one place: over one of them, it drops just below the recording's edge for that
  // moment, still in the middle, and that's all.
  const openThing = opened && (openNow ? placed[opened.note.id] : openAt[opened.note.id]);
  const kept = (() => {
    const shown = frame.current;
    const end = readings?.at(-1);
    if (!shown || !end || closer) return [];
    const k = Math.min(shown.clientWidth / end.screen.width, shown.clientHeight / end.screen.height);
    return [about, scene.acted].flatMap((named) => {
      const thing = named && end.things.find((one) => one.role === named.role && one.name === named.name);
      return thing ? [{ left: thing.box.x * k, top: thing.box.y * k, width: thing.box.width * k, height: thing.box.height * k }] : [];
    });
  })();
  // Until this moment's reading has come, the bar stays where it was; on the page's first moment, it waits unseen.
  const lastClear = useRef<{ x: number; y: number }>(undefined);
  const clear = !readings && !openThing ? lastClear.current : (lastClear.current = (() => {
    const [wide, high, barWide] = [frame.current?.clientWidth ?? 0, frame.current?.clientHeight ?? 0, toolbar.current?.offsetWidth ?? 0];
    const [left, right] = [(wide - barWide) / 2, (wide + barWide) / 2];
    const under = (openThing ? [openThing] : live?.shown || comparing ? [] : kept).filter((one) => one.top + one.height > high - BAR / 2 - 12);
    const covers = under.some((one) => one.left < right + 12 && one.left + one.width > left - 12);
    return { x: 0, y: covers ? BAR / 2 : 0 };
  })());
  // The note whose card shows: open on the moment as it is now, or on the frame it was made on, until that has faded.
  const carded = opened && openNow ? opened : shownOpen && (opened ? shownOpen.note.id === opened.note.id && shownOpen : !phone && shownOpen);
  // Its card comes in by its thing, so it waits until where that is has been said: on the moment as it is now, by the
  // recording; on its own frame, by its kept picture, or the recording there until that's drawn. It never stands
  // somewhere else first and moves. Only a note that turns out to be on nothing stands in the corner.
  const corner = spotAt({ x: 24, y: 24 });
  const cardBy = !carded ? undefined : phone ? corner : openNow ? placed[carded.note.id] : pictured || told ? (openAt[carded.note.id] ?? corner) : undefined;
  // What it's about is outlined only at the point: midway, it may not be there yet.
  const aboutAt = atPoint && !live?.shown && !opened ? placed[ABOUT] : undefined;

  // Pressing away from what's open, anywhere but its card and its picture on the edge, closes it.
  const pressAway = (event: React.PointerEvent) => opened && !(event.target as Element).closest("[data-note-card], [data-tile]") && !frame.current?.contains(event.target as Node) && setOpen(undefined);

  // The keys: Space plays, T steps in and back, N notes, C compares, ↑ and ↓ go a moment back and on, ← and → open this
  // moment's notes one after another, Escape lets go.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    const typing = event.target instanceof HTMLElement && event.target.closest("textarea, input, [contenteditable]");
    // A picture on an edge with the keyboard on it is pressed with Enter or Space, as any button is.
    if (event.target instanceof HTMLElement && event.target.closest("[data-tile]") && /^( |enter)$/i.test(event.key)) return;
    // Ctrl+Enter sends, as on the list.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !writing) return (event.preventDefault(), void sendNow());
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
    if ((key === "arrowleft" || key === "arrowright") && onEdge.length && !writing) {
      const i = onEdge.findIndex(({ note }) => note.id === open);
      const to = key === "arrowright" ? (i < 0 ? 0 : Math.min(onEdge.length - 1, i + 1)) : i < 0 ? onEdge.length - 1 : Math.max(0, i - 1);
      event.preventDefault();
      return void (onEdge[to]!.note.id !== open && openNote(onEdge[to]!.note.id));
    }
    const did = { " ": play, t: stepIn, n: note, c: compare, arrowdown: onward, j: onward, arrowup: () => next(-1), k: () => next(-1) }[key];
    if (!did || event.repeat) return;
    event.preventDefault();
    did();
  };
  useEffect(() => {
    const down = (event: KeyboardEvent) => keys.current(event);
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, []);

  // A note's picture is new on the edge when it wasn't there the last time this moment was drawn: it arrives.
  const known = useRef<{ n: number; ids: Set<string> }>(undefined);
  const before = known.current?.n === n ? known.current.ids : undefined;
  useEffect(() => void (known.current = { n, ids: new Set(onEdge.map(({ note }) => note.id)) }));
  const newest = before && onEdge.findLast(({ note }) => !before.has(note.id))?.note.id;
  const [lastArrived, setLastArrived] = useState<string>();
  useEffect(() => void (newest && setLastArrived(newest)), [newest]);

  // A click on the moment plays and pauses it, as Space does; with a note open, it closes it; noting, it's on what's
  // under the pointer, said beside it.
  const aimingNote = noting && !live?.shown && !writing;
  const movePill = (event: React.PointerEvent) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    pointer.current = { x: event.clientX - box.left, y: event.clientY - box.top };
    if (pill.current) pill.current.style.transform = `translate(${pointer.current.x - 3}px, ${pointer.current.y - 2}px)`;
  };

  const momentTiles = (forward: boolean) =>
    round.scenes.map((other, i) => {
      // Its notes' dots, as its edge has them: one made in the app joins once you're back.
      const talk = other === scene ? onEdge.map(({ note }) => note) : [...sent, ...notes].filter((one) => one.on?.scene === other.name);
      return (
        <Tile
          key={other.name}
          id={other.name}
          label={other.name}
          forward={forward}
          strong={i + 1 === n}
          quiet
          picture={
            <>
              <StillPicture review={review} round={round} scene={other} about={other.about ?? other.acted} />
              {talk.length > 0 && (
                <span className="absolute top-1.5 right-1.5 flex gap-[3px]">
                  {talk.slice(0, 5).map((one) => (
                    <i key={one.id} className={`size-[7px] rounded-full shadow-[0_0_0_1.5px_#fff] ${notes.includes(one) ? "bg-amber" : "bg-slate"}`} />
                  ))}
                </span>
              )}
            </>
          }
          words={
            <>
              {/* Who by their name alone: who they are is said over the recording once you're there. */}
              <span className="line-clamp-2 text-[12.5px] leading-[17px] text-fg">
                {other.person && <span className="text-soft">{other.person} · </span>}
                {other.name}
              </span>
            </>
          }
          onPress={() => toMoment(i + 1)}
        />
      );
    });
  // What the moment is about on its end's picture, as shares of the screen: where a note's strip closes in when the
  // note is on something too large to show, that holds it.
  const aboutHere = (() => {
    const end = readings?.at(-1);
    const thing = end && closeTo && end.things.find((one) => one.role === closeTo.role && one.name === closeTo.name)?.box;
    return thing && { x: thing.x / end.screen.width, y: thing.y / end.screen.height, width: thing.width / end.screen.width, height: thing.height / end.screen.height };
  })();
  const noteTiles = (forward: boolean) =>
    onEdge.map(({ note, sent: isSent }) => {
      const { words, stands, fresh } = says(note, isSent);
      return (
        <Tile
          key={note.id}
          id={note.id}
          label={note.words}
          forward={forward}
          strong={open === note.id}
          lit={pointed === note.id}
          arriving={before && !before.has(note.id) ? "right" : undefined}
          strip
          picture={<NotePicture frame={frames[note.id]} sent={isSent} focus={isNow(shownAt(note)) ? aboutHere : undefined} />}
          words={<NoteWords words={words} stands={stands} fresh={fresh} short />}
          onPress={() => openNote(note.id)}
          onPoint={(now) => setPointed(now ? note.id : undefined)}
        />
      );
    });

  // What's said by a pin: the note being written, or the one open. On a phone, under the bar, where there's room.
  const cards = (
    <>
          {writing && <NoteCard by={(!writing.note.on?.app && placed[writing.note.id]) || writing.box || spotAt(writing.spot)} frame={frame} under={phone}><Write onSave={save} onDrop={() => setWriting(undefined)} /></NoteCard>}
          {/* Closing, it fades where it stood; under the bar on a phone, it goes at once, so it never holds its room. */}
          {!writing && carded && cardBy && (
            <NoteCard key={carded.note.id} by={cardBy} frame={frame} closing={!opened} under={phone}>
              <div className="min-h-0 flex-1 overflow-y-auto px-1">
                {carded.sent ? <Turns you={you} turns={conversation(review, carded.note.id)} /> : <Turns you={you} turns={[]} unsent={carded.note.words} />}
              </div>
              {carded.sent && (
                <div className="mt-2 border-t border-line pt-2">
                  <Write
                    key={carded.note.id}
                    placeholder="Reply"
                    rows={2}
                    focus={false}
                    start={replies.find((one) => one.note === carded.note.id)?.words ?? ""}
                    onSave={(words) => (setReplies((all) => [...all.filter((one) => one.note !== carded.note.id), { note: carded.note.id, words }]), setOpen(undefined))}
                    onDrop={() => setOpen(undefined)}
                  />
                </div>
              )}
              {!carded.sent && (
                <div className="mt-2 flex items-center gap-2 px-1 text-xs text-soft">
                  <span>Sent with Send, at the top</span>
                  <button className="ml-auto rounded-md px-1.5 py-0.5 hover:bg-hover hover:text-fg" onClick={() => (setNotes((all) => all.filter((one) => one.id !== carded.note.id)), setOpen(undefined))}>
                    Remove
                  </button>
                </div>
              )}
            </NoteCard>
          )}
    </>
  );

  const momentsEdge = (
    <Edge side="left" label="Moments" frame={frame} quiet={!!live?.shown} phone={phone} showing={scene.name}>
      {momentTiles}
    </Edge>
  );

  return (
    // Clipped, never scrolled: a caret put in a note's box can't move the page under you.
    <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] overflow-clip bg-ground phone:grid-rows-[auto_auto_auto_minmax(0,1fr)]" onPointerDown={pressAway}>
      <header className="flex h-12 min-w-0 items-center gap-3 px-6 phone:px-4">
        <button onClick={onLeave} className="-ml-2 flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg">
          <svg viewBox="0 0 12 12" className="size-3 flex-none" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7.5 2.5L4 6l3.5 3.5" />
          </svg>
          <span className="truncate">{review.title}</span>
        </button>
        {(unsent > 0 || sending) && (
          <SendButton className="ml-auto" filled={unsent > 0 && sending !== "sent"} arrives onClick={() => void sendNow()} disabled={sending === "sending" || sending === "sent"}>
            {sending === "sent" ? <>{tick}Sent</> : sending === "sending" ? "Sending…" : <>Send {toSend(notes.length, replies.length)} <Key className={FILLED_KEY}>Ctrl ↵</Key></>}
          </SendButton>
        )}
        {Array.isArray(sending) && <span className="text-[13px] text-amber-ink">Not sent: {sending[0]}</span>}
        <button onClick={onward} disabled={!!live?.shown || !!writing} className={`-mr-2 flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm enabled:hover:bg-hover enabled:hover:text-fg disabled:opacity-50 ${unsent > 0 || sending ? "" : "ml-auto"}`}>
          {nextAnswer ? "Next answer" : n < count ? "Next" : "To the list"}
          <Key>↓</Key>
        </button>
      </header>
      {/* Who and where, in the agent's words: room for two lines, three on a phone, so nothing under it moves. */}
      <p className="line-clamp-2 h-[44px] px-6 text-[15px] leading-[22px] text-fg phone:line-clamp-3 phone:h-[66px] phone:px-4" title={scene.name}>
        {who && <span className="text-soft">{who} · </span>}
        {scene.name}
      </p>
      {/* The recording, as large as the room beside the edges lets it be: the same size from one moment to the next. */}
      <div className="relative mt-2 grid min-h-0 place-items-center [container-type:size] phone:[container-type:inline-size]">
        <div
          ref={frame}
          className="relative overflow-visible rounded-lg"
          style={{
            aspectRatio: `${screen.width} / ${screen.height}`,
            width: phone ? "calc(100cqw - 32px)" : `min(calc(100cqw - 2 * ${SIDE}), calc((100cqh - ${UNDER}px) * ${screen.width / screen.height}))`,
            marginBottom: UNDER,
          }}
          onPointerMove={(event) => (movePill(event), setAiming(!(event.target as Element).closest("[role=toolbar]")))}
          onPointerLeave={() => setAiming(false)}
        >
          <div
            className="absolute inset-0 overflow-hidden rounded-lg bg-paper shadow-frame"
            onClick={(event) => !noting && !(event.target as Element).closest("button") && (opened ? setOpen(undefined) : play())}
          >
            {behind && <img src={behind} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain" />}
            <div key={scene.recording} className="absolute inset-0 animate-arrive" onAnimationEnd={(event) => event.target === event.currentTarget && setBehind(undefined)}>
              {(!phone || readings) && <Picture shot={{ src: picture(review.id, round.number, scene.recording, Math.max(0, scene.steps.length - 1)), frame: closer }} />}
              <Player
                review={review.id}
                round={round.number}
                recording={scene.recording}
                frame={closer}
                at={at}
                playing={comparing ? undefined : playing}
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
            </div>
            {aboutAt && (
              <div
                className="pointer-events-none absolute animate-arrive rounded-[4px] outline-[1.5px] outline-offset-4 outline-slate outline-solid"
                style={{ left: aboutAt.left, top: aboutAt.top, width: aboutAt.width, height: aboutAt.height }}
              />
            )}
            {comparing && then && both && (
              // Now leads, so it's drawn first, on the right. Both end above the bar, so nothing they hold in view, what
              // the moment is about above all, is ever under it.
              <div className="absolute inset-0 z-[5] flex animate-arrive flex-row-reverse gap-3 bg-ground" style={{ paddingBottom: BAR / 2 + 8 }}>
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
                        following={playing ? { clock: bothOf, at: (along) => both.at(along)[side.side]! } : undefined}
                        actualSize={side.actualSize}
                      />
                      <span className={CHIP}>{side.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {layers.length > 0 && (
              // The frame the open note was made on, over the moment: its kept picture, the same one its edge shows, or the
              // recording there until that's drawn, with no pointer and nothing played.
              <div ref={shut} className={`absolute inset-0 z-[5] [&_[data-hand]]:hidden ${opened ? "" : "pointer-events-none"}`}>
                {layers.map(({ note, made }) => (
                  <div key={note.id} className="absolute inset-0 animate-arrive overflow-hidden bg-paper">
                    {frames[note.id] ? (
                      <img src={frames[note.id]!.src} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain" />
                    ) : (
                      <Player
                        review={review.id}
                        round={made.round}
                        recording={made.recording}
                        at={made.at}
                        marks={[{ id: note.id, ...(made.node !== undefined ? { node: made.node } : made.point && { point: made.point }) }]}
                        onMarks={note.id === shownOpen?.note.id ? (at) => setOpenPlaced({ note: note.id, at }) : undefined}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className={`pointer-events-none absolute inset-0 ${layers.length ? "z-[6]" : ""}`}>
              {shownOpen && !openNow ? (
                <Pinned pins={[pinFor(shownOpen)]} placed={openAt} open={shownOpen.note.id} faded={!opened} onOpen={() => setOpen(undefined)} />
              ) : (
                <Pinned pins={(opened && openNow ? [opened] : pinned).map(pinFor)} placed={placed} open={writing?.note.id ?? (openNow ? opened?.note.id : undefined)} faded={!!playing || !!live?.shown} lit={pointed} onPoint={pointPin} onOpen={(id) => id && openNote(id)} quiet />
              )}
            </div>
          </div>
          <Portal live={live && { ...live, inApp }} person={person} screen={screen} scrolled={() => scrolled.current?.()} waiting="Stepping in…" named={false} />
          {(() => {
            const one = saying && !opened && !writing && !playing && !live?.shown ? onEdge.find(({ note }) => note.id === saying) : undefined;
            const thing = one && placed[one.note.id];
            if (!one || !thing) return null;
            const said = says(one.note, one.sent);
            // Beside its pin, which stands just outside the thing's top right corner, on whichever side has room.
            const [x, y, wide] = [thing.left + thing.width + (thing.width || thing.height ? 14 : 0), thing.top - (thing.width || thing.height ? 14 : 0), frame.current?.clientWidth ?? 0];
            const left = x + 16 + 220 <= wide ? x + 16 : Math.max(8, x - 16 - 220);
            return (
              <div aria-hidden className="pointer-events-none absolute z-30 w-[220px] animate-arrive rounded-lg bg-surface px-2 pt-1.5 pb-[7px] shadow-float" style={{ left, top: Math.max(8, y - 10) }}>
                <NoteWords {...said} />
              </div>
            );
          })()}
          <span ref={pill} aria-hidden className={`pointer-events-none absolute top-0 left-0 z-30 transition-opacity duration-150 ease-calm ${aimingNote && aiming ? "" : "opacity-0"}`}>
            <span className={TAG}>Note on this</span>
          </span>
          {!phone && cards}
          {/* What you can do here, across the recording's bottom edge, as on the older page. */}
          <div
            role="toolbar"
            aria-label="This moment"
            onClick={(event) => (event.target as Element).closest("button")?.blur()}
            className={`absolute top-full left-1/2 z-20 flex gap-0.5 rounded-xl transition-[translate,opacity] duration-300 ease-calm bg-surface p-1 text-[13px] select-none ${inApp ? "shadow-[0_0_0_1.5px_rgba(236,178,72,0.95),0_6px_20px_rgba(20,24,34,0.12)]" : "shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]"}`}
            ref={toolbar}
            style={{ height: BAR, translate: `calc(-50% + ${clear?.x ?? 0}px) calc(-50% + ${clear?.y ?? 0}px)`, opacity: clear ? 1 : 0 }}
          >
            {/* Noting, the bar says what to do and how to leave, over what it holds, at its width. */}
            {noting && (
              <div className="absolute inset-1 z-1 flex animate-arrive items-center justify-between gap-2 rounded-lg bg-surface pl-2.5">
                <span className="truncate text-soft">Point at what it's about</span>
                <button className={ITEM} onClick={() => setNoting(false)}>
                  Cancel <Key>Esc</Key>
                </button>
              </div>
            )}
            <div className="contents" inert={noting}>
            {inApp ? (
              // In the app, who you are there, beside Back.
              <span className={`${ITEM} w-[96px] cursor-default px-1! phone:w-[64px]`}>
                <span className="truncate rounded-full bg-[#EDB654] px-[7px] text-[11.5px] leading-[19px] text-[#3B2A07]">{person ? `You, as ${person}` : "You"}</span>
              </span>
            ) : asItWas ? (
              // What's shown is from before the agent last handed it back.
              <span className={`${ITEM} w-[96px] cursor-default text-faint! phone:w-[64px]`}>As it was</span>
            ) : still ? (
              // Nothing to play: where Play would be, it says what this moment is.
              <span className={`${ITEM} w-[96px] cursor-default text-faint! phone:w-[64px]`}>A still</span>
            ) : (
              <button className={`${ITEM} relative w-[96px] phone:w-[64px]`} disabled={!!live?.shown || !cut} onClick={play}>
                <span className="w-9 text-left">{playing ? "Pause" : "Play"}</span> <Key className="min-w-9">Space</Key>
                <Progress clock={clockOf} share={shareOf(at)} shareOf={shareOf} moving={!!playing} shown={!atPoint && !live?.shown} />
              </button>
            )}
            <button className={`${ITEM} relative w-[116px] phone:w-[104px]`} disabled={!!writing || elsewhere} aria-pressed={stepping} onClick={stepIn}>
              {inApp ? "Back" : stepping ? "Stepping in…" : "Step in"} {!stepping && <Key>{inApp ? "Esc" : "T"}</Key>}
              {stepping && live && <Getting since={live.since} due={live.due} />}
            </button>
            <button className={`${ITEM}`} disabled={stepping || !!writing || comparing || !!opened} aria-pressed={noting} onClick={note}>
              Note <Key>N</Key>
            </button>
            {anyLook &&
              (then ? (
                <button className={`${ITEM} w-[104px] phone:w-auto`} disabled={!!live?.shown || !!writing} aria-pressed={comparing} onClick={compare}>
                  Compare <Key>C</Key>
                </button>
              ) : (
                // Nothing to compare: what it is, in Compare's place.
                <span className={`${ITEM} w-[104px] cursor-default text-faint! phone:w-auto`}>{looking ? "Unchanged" : "New"}</span>
              ))}
            </div>
          </div>
        </div>
        {live?.problems && <p className="absolute bottom-0 left-1/2 max-w-[90%] -translate-x-1/2 translate-y-full rounded-md bg-surface px-3 py-1.5 text-xs text-amber-ink shadow-tip">{live.problems.join(" ")}</p>}
      </div>
      {/* Beside the recording, or under it on a phone: the change's moments, and this one's notes. */}
      <div className={phone ? "grid min-h-0 grid-cols-[minmax(0,1fr)] content-start gap-6 overflow-y-auto px-4 pt-6 pb-8" : "contents"}>
        {phone && cards}
        {/* Tab reaches them as they read, left to right; on a phone, the notes come first, nearest what they're on. */}
        {!phone && momentsEdge}
        {(!phone || onEdge.length > 0) && (
          <Edge side="right" label="Notes" frame={frame} quiet={!!live?.shown} phone={phone} showing={open ?? lastArrived} arrived={lastArrived}>
            {noteTiles}
          </Edge>
        )}
        {phone && momentsEdge}
      </div>
    </div>
  );
}

// Each note's kept picture, by its id: the frame it was made on. One made at the end of a taking is that taking's own
// picture, there at once; any other, drawn once by `playthrough open` (frames.ts) and kept.
function useFrames(review: Review, notes: { note: Note; shown?: Made }[]): Record<string, NoteFrame | undefined> {
  const [frames, setFrames] = useState<Record<string, NoteFrame | undefined>>({});
  // Each by where it's shown: a note shown as it is now, once the agent hands the moment back without its thing, is
  // shown where it was made, and asked for again.
  const asked = useRef(new Map<string, string>());
  const keyOf = (shown: Made) => `${shown.round} ${shown.recording} ${shown.at} ${shown.node ?? ""}`;
  const wanted = notes.filter(({ note, shown }) => shown && asked.current.get(note.id) !== keyOf(shown));
  useEffect(() => {
    for (const { note, shown: made } of wanted) {
      if (!made) continue;
      asked.current.set(note.id, keyOf(made));
      const taking = review.rounds.find((one) => one.number === made.round)?.scenes.find((one) => one.recording === made.recording);
      const kept = (frame: NoteFrame | undefined) => frame && asked.current.get(note.id) === keyOf(made) && setFrames((all) => ({ ...all, [note.id]: frame }));
      if (taking && Math.abs(made.at - taking.length) < 0.1)
        void readingsOf(review.id, made.round, made.recording).then((read) => {
          const end = read.at(-1);
          if (!end) return;
          const found = made.node !== undefined ? end.things.find((one) => one.node === made.node) : undefined;
          const { width, height } = end.screen;
          const share = (one: { x: number; y: number; width: number; height: number }) => ({ x: one.x / width, y: one.y / height, width: one.width / width, height: one.height / height });
          const box = found ? share(found.box) : made.point && { ...made.point, width: 0, height: 0 };
          // A line of words is laid out across its whole column: its words are as wide as they are, as near as can be
          // told, which is what its strip shows and its pin stands clear of.
          const said = found?.words && /^(text|heading)$/.test(found.role) && share({ ...found.box, width: Math.min(found.box.width, found.words.length * parseFloat(found.look.size) * 0.55) });
          kept({ src: picture(review.id, made.round, made.recording, Math.max(0, taking.steps.length - 1)), screen: end.screen, ...(box && { box }), ...(said && { words: said }) });
        });
      else void noteFrame(review.id, note.id, made).then(kept);
    }
  }, [wanted.map(({ note, shown }) => `${note.id}:${shown && keyOf(shown)}`).join(" ")]);
  return frames;
}

// A note's words, as its picture on the edge says them and its pin does pointed at.
// Under its strip on the edge, two lines; by its pin, three.
function NoteWords({ words, stands, fresh, short }: { words: string; stands: string; fresh: boolean; short?: boolean }) {
  return (
    <>
      <span className={`${short ? "line-clamp-2" : "line-clamp-3"} text-[12.5px] leading-[17px] text-fg`}>{words}</span>
      <span className={`block text-[11.5px] leading-4 ${fresh ? "font-medium text-fg" : stands === "answered" ? "text-soft" : "text-faint"}`}>{stands}</span>
    </>
  );
}

// A note's strip on the edge: its frame, cut for the strip's own shape around the thing it's on, so that thing is what
// you see, with its pin where it sits on the recording. The thing whole where it can be, a little of what's around it,
// never drawn larger than it was recorded nor much smaller, where its words stop being read; toward the
// recording, as the screen's edge fades the other side at rest.
function NotePicture({ frame, sent, focus }: { frame?: NoteFrame; sent: boolean; focus?: NoteFrame["box"] }) {
  if (!frame) return null;
  const { screen } = frame;
  const box = frame.words ?? frame.box;
  const px = (one?: NoteFrame["box"]) => one && { x: one.x * screen.width, y: one.y * screen.height, width: one.width * screen.width, height: one.height * screen.height };
  const [thing, about] = [px(box), px(focus)];
  // On something too large to show whole at a size that reads, a note is most likely about what its moment is about,
  // where that's inside it: the strip closes in on that, as on any small thing. A note keeps what it's on, not where
  // in it you pointed.
  const inside = !!thing && !!about && about.x >= thing.x && about.y >= thing.y && about.x + about.width <= thing.x + thing.width && about.y + about.height <= thing.y + thing.height;
  const part = stripOf(screen, thing && about && inside && tooLarge(thing) ? about : thing);
  // Its pin, as on the recording: just outside the top right corner of what's shown of its thing, or on its spot; never
  // on the thing. Where there's no room above it in the strip, beside it at its middle; always whole in the strip.
  const spot = !box || (!box.width && !box.height);
  const shownRight = box && (Math.min(box.x + box.width, part.x + part.width) - part.x) / part.width;
  const roomAbove = !!box && (box.y - part.y) / part.height >= 0.25;
  // A spot's pin, too, stands just off it, up and to the right, so what was pointed at stays seen.
  const pin = box && (roomAbove ? { x: shownRight!, y: (box.y - part.y) / part.height, dx: spot ? 10 : 6, dy: spot ? -15 : -6 } : { x: shownRight!, y: (box.y + box.height / 2 - part.y) / part.height, dx: spot ? 12 : 10, dy: 0 });
  return (
    <span className="absolute inset-0 animate-arrive">
      <Picture shot={{ src: frame.src, frame: part }} />
      {pin && (
        <i
          className={`absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_2px_#fff,0_1px_3px_rgb(0_0_0/0.25)] ${sent ? "bg-slate" : "bg-amber"}`}
          style={{ left: `clamp(7px, calc(${clamp(pin.x) * 100}% + ${pin.dx}px), calc(100% - 7px))`, top: `clamp(7px, calc(${clamp(pin.y) * 100}% + ${pin.dy}px), calc(100% - 7px))` }}
        />
      )}
    </span>
  );
}

// The part of a note's frame its strip shows, in shares of the screen, this wide for its height:
// - a small thing (a switch, a button) at the size it was recorded, with what's beside it, as its label;
// - a wide line (a heading, a field), from its start, at most a little smaller than it was recorded, so it reads;
// - something far larger than the strip (a pane, a list), its top left, at that readable size, not all of it shrunk;
// - a spot with no thing, around the spot at the size it was recorded;
// - all of it inside the screen, so a thing at the screen's edge sits at the strip's.
const STRIP = 3.8;
// Too large to show whole in a strip at a size that reads.
const tooLarge = (thing: { width: number; height: number }) => thing.width + 40 > TILE * 1.6 || (thing.height + 16) * STRIP > TILE * 1.6;
function stripOf(screen: { width: number; height: number }, thing?: { x: number; y: number; width: number; height: number }): Frame {
  const [round, widest, around] = [TILE, TILE * 1.6, 20];
  const spot = !thing || (!thing.width && !thing.height);
  let width = spot ? round * 1.5 : Math.min(widest, Math.max(round, thing.width + 2 * around, (thing.height + 16) * STRIP));
  width = Math.min(width, screen.width, screen.height * STRIP);
  const height = width / STRIP;
  const [middle, centre] = thing ? [thing.x + thing.width / 2, thing.y + thing.height / 2] : [screen.width / 2, screen.height / 2];
  // Toward the recording: its middle two fifths in, kept whole where it fits.
  const x = spot || thing.width + 2 * around <= width ? Math.min(Math.max(middle - width * 0.4, (thing?.x ?? middle) + (thing?.width ?? 0) + 8 - width), (thing?.x ?? middle) - 8) : thing.x - around;
  const y = spot || thing.height + 16 <= height ? centre - height / 2 : thing.y - 8;
  return {
    x: clamp(x, 0, screen.width - width) / screen.width,
    y: clamp(y, 0, screen.height - height) / screen.height,
    width: width / screen.width,
    height: height / screen.height,
  };
}

// How far through what's shown playing is: a slim line inside Play, there once the moment has left its end, filling
// as it plays, and gone again once it rests there.
function Progress({ clock, share, shareOf, moving, shown }: { clock: Clock; share: number; shareOf: (moment: number) => number; moving: boolean; shown: boolean }) {
  const fill = useRef<HTMLSpanElement>(null);
  const told = useRef(shareOf);
  told.current = shareOf;
  useEffect(() => {
    const show = (to: number) => fill.current && (fill.current.style.transform = `scaleX(${to.toFixed(4)})`);
    if (!moving) return void show(share);
    show(told.current(clock.at));
    return clock.follow((moment) => show(told.current(moment)));
  }, [moving, share]);
  return (
    // Along the button's own bottom edge, end to end, its corners taking the line's ends.
    <span aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden rounded-lg transition-opacity duration-300 ease-calm ${shown ? "" : "opacity-0"}`}>
      <span className={`absolute inset-x-0 bottom-0 h-0.5 ${UNPLAYED}`}>
        <span ref={fill} className="block h-full origin-left bg-soft" />
      </span>
    </span>
  );
}

// How far the app is on its way, a slim line inside Step in as Play's is inside Play: by how long it took the last
// time, where that's known, else easing on towards its end; never quite there until it is, and never still.
function Getting({ since, due }: { since: number; due?: number }) {
  const fill = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frameId = 0;
    const tick = () => {
      const gone = Date.now() - since;
      const known = due && due > since ? due - since : undefined;
      const share = known ? (gone < known ? 0.9 * (gone / known) : 0.9 + 0.08 * (1 - Math.exp(-(gone - known) / 4000))) : 0.96 * (1 - Math.exp(-gone / 7000));
      if (fill.current) fill.current.style.transform = `scaleX(${share.toFixed(4)})`;
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [since, due]);
  return (
    // As Play's: along the button's bottom edge, end to end.
    <span aria-hidden className="pointer-events-none absolute inset-0 animate-arrive overflow-hidden rounded-lg">
      <span className={`absolute inset-x-0 bottom-0 h-0.5 ${UNPLAYED}`}>
        <span ref={fill} className="block h-full origin-left bg-amber" />
      </span>
    </span>
  );
}

// The part of Play's line not yet played: there to be seen, a step quieter than what has.
const UNPLAYED = "bg-[color-mix(in_srgb,var(--soft)_32%,transparent)]";

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
const ABOUT = "about";
const BAR = 40;
// Under the recording, room for the lower half of the bar that hangs across its edge, and a little more.
const UNDER = BAR / 2 + 20;
// Beside the recording, room for each edge's pictures at rest.
const SIDE = "clamp(104px, 10vw, 160px)";

// A spot, as a thing with no size.
const spotAt = ({ x, y }: { x: number; y: number }): Rect => ({ left: x, top: y, width: 0, height: 0 });

// A note's card by its thing: beside it where there's room, else under or over it, never on it, nor past the frame.
// Under: in the page's flow, as wide as it is, as on a phone.
function NoteCard({ by, frame, closing, under, children }: { by: Rect; frame: React.RefObject<HTMLDivElement | null>; closing?: boolean; under?: boolean; children: ReactNode }) {
  const own = useRef<HTMLDivElement>(null);
  // Its own height, as it grows with its words, so it's always placed whole.
  const [tall, setTall] = useState(140);
  useLayoutEffect(() => {
    const card = own.current;
    if (!card || under) return;
    const measure = () => setTall(card.offsetHeight);
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(card);
    return () => watching.disconnect();
  }, [under]);
  const [wide, high] = [frame.current?.clientWidth ?? 0, frame.current?.clientHeight ?? 0];
  const width = Math.min(280, wide - 16);
  const [right, bottom] = [by.left + by.width, by.top + by.height];
  // Its pin stands just outside the thing's top right corner: beside it on the right means past the pin too. It stays
  // clear of the bar across the recording's foot.
  const [pastPin, gap, edge, foot] = [32, 14, 8, high - BAR / 2 - 8];
  const within = (top: number) => Math.min(Math.max(edge, top), foot - tall);
  const fits = (top: number) => top >= edge && top + tall <= foot;
  const place =
    by.width && right + pastPin + width <= wide - edge
      ? { left: right + pastPin, top: within(by.top - 12) }
      : by.width && by.left - gap - width >= edge
        ? { left: by.left - gap - width, top: within(by.top - 12) }
        : // Too wide to stand beside, or a spot on a line: under it, else over it; a thing taller than there's room
          // around, inside it near its top.
          {
            left: Math.min(Math.max(edge, by.left - (by.width ? 0 : 24)), wide - width - edge),
            top: fits(bottom + gap) ? bottom + gap : fits(by.top - gap - tall) ? by.top - gap - tall : within(by.top + 12),
          };
  return (
    <div
      ref={own}
      data-note-card
      className={`${under ? "relative" : "absolute z-40"} flex animate-arrive flex-col rounded-xl bg-surface p-2 shadow-float transition-opacity duration-300 ease-calm ${closing ? "pointer-events-none opacity-0" : ""}`}
      style={under ? undefined : { ...place, width, maxHeight: foot - edge }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

// Writing a note: Enter keeps it, Shift+Enter is a new line, Escape lets it go.
// A reply waits to be clicked into, so the keys stay the page's while a note is open (← → go on through the notes).
function Write({ onSave, onDrop, placeholder = "What's right or wrong here?", rows = 3, start = "", focus = true }: { onSave: (words: string) => void; onDrop: () => void; placeholder?: string; rows?: number; start?: string; focus?: boolean }) {
  const [words, setWords] = useState(start);
  return (
    <div>
      <textarea
        ref={(area) => void (focus && area && !area.dataset.focused && ((area.dataset.focused = "1"), area.focus({ preventScroll: true })))}
        rows={rows}
        value={words}
        placeholder={placeholder}
        className="block max-h-[min(40vh,240px)] min-h-[60px] w-full resize-none rounded-lg bg-transparent px-1 py-0.5 text-[13px] leading-5 text-fg outline-none [field-sizing:content] placeholder:text-faint"
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
