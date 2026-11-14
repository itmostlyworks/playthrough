

// The list: what's waiting on you from every app on this machine, each change by its title with its moments under it,
// a still each in the agent's words, and one button that moves it on: Send, with what you said, or Done.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { allNotes, latestOf, standingOf, waitingForTheAgent, type Standing } from "@playthrough/change";
import type { Listed } from "./api.ts";
import { unsentOf, useUnsent, scrolledBack, openedLines, keepOpened } from "./kept.ts";
import { Key } from "./Key.tsx";
import { SendButton, tick, FILLED_KEY, SAID, useSend, type Saying } from "./Send.tsx";
import { toSend, noteSays, takingOf, differentSince, seenOf, markSeen, workingSince, whoIn, ago } from "./standing.ts";
import { Still } from "./Still.tsx";

// So many done changes show; the rest wait behind one line.
const LATEST = 5;

// What's waiting on you, from every app on this machine: each change by its title, its moments as stills you can judge
// at a glance, the longest waiting first. Under them, those with your agents and those done, a quiet line each that
// opens to the same stills. A change moves by its one button: Send, with what you said, or Done, with nothing to say.
// The list keeps itself as it is on disk, but calmly: one you sent folds away before it goes, and one handed over, or
// handed back, joins what's waiting at its foot only while nothing it would move is under your pointer. Held, only the
// move waits: its line says at once where it stands now.
export function List({ changes, you, onOpen }: { changes?: Listed[]; you?: string; onOpen: (change: string, moment: number, note?: string) => void }) {
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
  const sectionOf = (listed?: Listed) => (listed && you && latestOf(listed.change) ? standingOf(listed.change, you).is : undefined);
  useEffect(() => {
    if (!changes || !you) return;
    latest.current = new Map(changes.map((one) => [one.change.id, one]));
    const was = before.current;
    if (!was) return void setShown((before.current = changes));
    const top = foot.current?.getBoundingClientRect().top;
    const underPointer = pointer.current !== undefined && top !== undefined && pointer.current >= top;
    let held = false;
    const settled = [...changes, ...was.filter((one) => !changes.some((now) => now.change.id === one.change.id))].flatMap((now) => {
      const then = was.find((one) => one.change.id === now.change.id);
      const gone = !changes.includes(now);
      const [from, to] = [sectionOf(then), gone ? undefined : sectionOf(now)];
      if (from === to) return gone ? [] : [now];
      const yours = sent.current.delete(now.change.id);
      if (yours && to) landing.current.add(now.change.id);
      if (leaving.current.has(now.change.id) || (!yours && (from === "waiting" || to === "waiting") && underPointer)) return (held = true), then ? [then] : [];
      if (to) moved.current.add(now.change.id);
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
  const all = shown.filter(({ change }) => latestOf(change)).map((listed) => ({ listed, standing: standingOf(listed.change, you) }));
  const newest = (a: (typeof all)[number], b: (typeof all)[number]) => ("at" in b.standing ? b.standing.at : "").localeCompare("at" in a.standing ? a.standing.at : "");
  const longest = (a: (typeof all)[number], b: (typeof all)[number]) => latestOf(a.listed.change)!.finished!.localeCompare(latestOf(b.listed.change)!.finished!);
  const waiting = all.filter((one) => one.standing.is === "waiting").sort(longest);
  order.current = [...order.current.filter((id) => waiting.some(({ listed }) => listed.change.id === id)), ...waiting.map(({ listed }) => listed.change.id).filter((id) => !order.current.includes(id))];
  waiting.sort((a, b) => order.current.indexOf(a.listed.change.id) - order.current.indexOf(b.listed.change.id));
  const withAgents = all.filter((one) => one.standing.is === "sent").sort(newest);
  const done = all.filter((one) => one.standing.is === "done").sort(newest);
  // Ctrl+Enter sends the first change with something to send, as a page's send sends its one change.
  const keyed = [...waiting, ...withAgents, ...done].find(({ listed }) => unsentOf(listed.change.id, latestOf(listed.change)?.number ?? 1).notes.length)?.listed.change.id;
  const toggle = (id: string) => {
    const next = opened.includes(id) ? opened.filter((one) => one !== id) : [...opened, id];
    setOpened(next);
    keepOpened(next);
  };
  const row = ({ listed, standing }: (typeof all)[number]) => (
    <ChangeInList
      key={listed.change.id}
      listed={listed}
      standing={standing}
      told={latest.current.get(listed.change.id) ?? listed}
      you={you}
      now={now}
      open={standing.is === "waiting" || opened.includes(listed.change.id)}
      arrived={moved.current.has(listed.change.id)}
      landing={landing.current.delete(listed.change.id)}
      keyed={keyed === listed.change.id}
      onToggle={() => toggle(listed.change.id)}
      onOpen={(moment, note) => onOpen(listed.change.id, moment, note)}
      onLeaving={(going, moved) => {
        if (going) return void leaving.current.add(listed.change.id);
        leaving.current.delete(listed.change.id);
        if (moved) sent.current.add(listed.change.id);
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
        {waiting.map(row)}
        <div ref={foot} />
        {withAgents.length > 0 && (
          <section className="mt-14">
            <h2 className="text-[13px] leading-5 font-semibold text-soft">With your agents</h2>
            <div className="mt-2">{withAgents.map(row)}</div>
          </section>
        )}
        {done.length > 0 && (
          <section className="mt-12">
            <h2 className="text-[13px] leading-5 font-semibold text-soft">Done</h2>
            <div className="mt-2">{done.slice(0, LATEST).map(row)}</div>
            {done.length > LATEST && (
              <>
                <button onClick={() => setEarlier(!earlier)} aria-expanded={earlier} className={LINE_ROW}>
                  <Chevron open={earlier} />
                  <span className="text-soft">Earlier · {done.length - LATEST}</span>
                </button>
                <Fold open={earlier}>{done.slice(LATEST).map(row)}</Fold>
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
  const stands = told === listed ? standing : standingOf(told.change, you);
  const { change } = listed;
  const handBack = latestOf(change)!;
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
  const unsent = useUnsent(change.id, handBack.number);
  const [seen] = useState(() => seenOf(change, you));
  // What this browser kept before it was kept with the change goes to it.
  useEffect(() => markSeen(change, you, []), []);
  const different = differentSince(change, handBack);
  const { sending, went, send } = useSend(change.id, handBack.number, you);
  // Sent, it says what went until it's gone.
  const { notes, replies } = sending === "sent" && went ? went : unsent;
  const said = notes.length + replies.length;
  const problems = Array.isArray(sending) ? sending : undefined;
  // Sent or done, it folds away where it was and arrives as its line where it goes.
  const [leaving, setLeaving] = useState(false);
  const waiting = standing.is === "waiting";
  const say = async (saying: Saying) => {
    if (sending === "sending" || leaving) return;
    onLeaving(true);
    if (!(await send(saying))) return onLeaving(false);
    await new Promise((done) => setTimeout(done, matchMedia("(prefers-reduced-motion: reduce)").matches ? 900 : SAID));
    setLeaving(true);
    setTimeout(() => onLeaving(false, true), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : LEAVING);
  };
  const sendNow = () => (said ? say({ notes, replies }) : Promise.resolve());
  // Done says every moment looks good to you, and that you've nothing more to say: the agent hears it as it hears a
  // send, and the change can still take a note later.
  const doneNow = () => say({ notes: [], replies: [], done: true });
  // Ctrl+Enter sends, as on the page; never a plain Enter, and never Done.
  const keys = useRef(sendNow);
  keys.current = () => (keyed ? sendNow() : Promise.resolve());
  useEffect(() => {
    const down = (event: KeyboardEvent) => event.key === "Enter" && (event.ctrlKey || event.metaKey) && (event.preventDefault(), void keys.current());
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, []);
  const sentNow = sending === "sent";
  const button = (said || waiting) && (
    <SendButton className="self-start" filled={!!said && !sentNow} onClick={said ? sendNow : doneNow} disabled={sending === "sending" || leaving || sentNow}>
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
              <h2 className="text-[15px] leading-[22px] font-semibold text-fg">{change.title}</h2>
              <p className="text-[13px] leading-5 text-soft">
                {listed.app} · {ago(handBack.finished!, now)}
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
                <span className="text-fg">{change.title}</span>
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
            {handBack.moments.map((moment, i) => {
              // Seen in this taking, or the same as one seen before, it's quieter; different since, it asks again.
              const seenBefore = seen.some((one) => one === moment.name || one.endsWith(`:${moment.name}`));
              const quiet = !waiting || seen.includes(takingOf(handBack.number, moment.name)) || (seenBefore && !different.has(moment.name));
              const talk = [...allNotes(change)].filter(([, kept]) => kept.note.on?.moment === moment.name);
              return (
                <li key={moment.name}>
                  <button onClick={() => onOpen(i + 1)} className="group block w-full text-left focus-visible:outline-none">
                    <Still change={change} handBack={handBack} moment={moment} about={moment.about ?? moment.acted} seen={quiet} />
                    <span className={`mt-2.5 block text-[13px] leading-5 ${quiet ? "text-faint" : "text-soft"}`}>{whoIn(listed, moment)}</span>
                    <span className={`block text-[14px] leading-5 ${quiet ? "text-soft" : "text-fg"}`}>{moment.name}</span>
                    {/* Said once: where someone spoke on it, the reply says what changed. */}
                    {waiting && !quiet && seenBefore && different.has(moment.name) && !talk.length && !notes.some((note) => note.on?.moment === moment.name) && (
                      <span className="mt-0.5 block text-[13px] leading-5 text-amber-ink">Different since you saw it</span>
                    )}
                  </button>
                  {(() => {
                    // A line a note: your latest words, and where it stands. Its conversation is by its pin.
                    const unsentHere = notes.filter((note) => note.on?.moment === moment.name);
                    const lines = [
                      ...talk.map(([id, kept]) => ({ id, ...noteSays(change, you, kept.note, true, replies) })),
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

// What you sent and when, and what the agent is doing with it, in the page's words.
// Where a change stands, said on its line.
function StandsNow({ listed, standing, now }: { listed: Listed; standing: Standing; now: number }) {
  if (standing.is === "waiting") return <>back {ago(latestOf(listed.change)?.finished ?? new Date(now).toISOString(), now)}, waiting on you</>;
  if (standing.is === "done") return <>Done {ago(standing.at, now)}</>;
  return <Sent listed={listed} now={now} standing={standing} />;
}

function Sent({ listed, now, standing }: { listed: Listed; now: number; standing: Extract<Standing, { is: "sent" }> }) {
  const { change, agentWaiting } = listed;
  const working = workingSince(change, latestOf(change)!);
  const agent = working ? "the agent is working" : waitingForTheAgent(change).length ? (agentWaiting ? "waiting for the agent" : "no agent is waiting, tell your agent") : undefined;
  return (
    <>
      {standing.notes + standing.replies ? `${toSend(standing.notes, standing.replies)} sent ${ago(standing.at, now)}` : `sent ${ago(standing.at, now)}`}
      {agent && ` · ${agent}`}
    </>
  );
}

const LEAVING = 380;
