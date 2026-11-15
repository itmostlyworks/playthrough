// Every change, in the sheet what's waiting opens: what's waiting on you as a calm column of rows, no pictures at rest.
// Each says what the change is, what you asked in your own words, and at its right the one step you can take now.
// Pressed, a row goes straight to the first thing on it you haven't seen. Pointed at, its moments come beside it, each
// with its name, moving nothing, and pressed, one goes straight to that moment. What's with your agents and what's
// done are quieter rows below.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { latestOf, standingOf } from "@playthrough/change";
import type { Listed } from "./api.ts";
import { SAID, SendButton, Taken, take } from "./Send.tsx";
import { ago, toSend } from "./standing.ts";
import { backAgain, firstUnseen, sectionOf, stepOf, type Section, type Step } from "./step.ts";
import { StillPicture } from "./Still.tsx";

// So many done changes show; the rest wait behind one line.
const LATEST = 5;
// How long a row takes to grow into its place or fold away.
const LEAVING = 380;
// Where a change lands: one waiting at the foot of what's waiting; one with your agents or done at the top of its part,
// newest first, or where that part will open if it isn't there yet.
const LANDS: Record<Section, string[]> = { waiting: ["waiting-foot"], agents: ["agents", "waiting-foot"], done: ["done", "agents-foot", "waiting-foot"] };

export function Changes({ changes, you, onOpen }: { changes: Listed[]; you: string; onOpen: (change: string, moment: number, note?: string) => void }) {
  const [shown, setShown] = useState<Listed[]>();
  const [earlier, setEarlier] = useState(false);
  const before = useRef<Listed[]>(undefined);
  // Each change as it is now, which a held row speaks from while it stays where it was.
  const latest = useRef(new Map<string, Listed>());
  const moved = useRef(new Set<string>());
  const leaving = useRef(new Set<string>());
  const sent = useRef(new Set<string>());
  const landing = useRef(new Set<string>());
  const order = useRef<string[]>([]);
  const own = useRef<HTMLDivElement>(null);
  const pointer = useRef<number>(undefined);
  const holding = useRef(false);
  // Whether the pointer is on the rows: a change you've acted on stays where it is, saying so, until it isn't.
  const onRows = useRef(false);
  const offRows = useRef<(() => void)[]>([]);
  const leaveRows = () => ((onRows.current = false), offRows.current.splice(0).forEach((go) => go()));
  const away = () => new Promise<void>((go) => (onRows.current ? offRows.current.push(go) : go()));
  const [looked, lookAgain] = useState(0);
  // A change moving from one part of the sheet to another moves every row under where it was and where it goes: while
  // the pointer is on or under the highest of those, it waits, and its row says at once where it stands.
  const topOf = (id: string, to?: Section) => {
    const at = (mark: string) => own.current?.querySelector(`[data-mark="${mark}"]`)?.getBoundingClientRect().top;
    const row = own.current?.querySelector(`[data-change="${CSS.escape(id)}"]`)?.getBoundingClientRect().top;
    const lands = to && LANDS[to].map(at).find((top) => top !== undefined);
    return Math.min(row ?? Infinity, lands ?? Infinity);
  };
  useEffect(() => {
    latest.current = new Map(changes.map((one) => [one.change.id, one]));
    const was = before.current;
    if (!was) return void setShown((before.current = changes));
    let held = false;
    const settled = [...changes, ...was.filter((one) => !changes.some((now) => now.change.id === one.change.id))].flatMap((now) => {
      const id = now.change.id;
      const then = was.find((one) => one.change.id === id);
      const gone = !changes.includes(now);
      const [from, to] = [then && sectionOf(then, you), gone ? undefined : sectionOf(now, you)];
      if (from === to) return gone ? [] : [now];
      const yours = sent.current.delete(id);
      if (yours && to) landing.current.add(id);
      const under = pointer.current !== undefined && pointer.current >= topOf(id, to);
      if (leaving.current.has(id) || (!yours && under)) return (held = true), then ? [then] : [];
      if (to) moved.current.add(id);
      return gone ? [] : [now];
    });
    holding.current = held;
    setShown((before.current = settled));
  }, [changes, you, looked]);
  useEffect(() => {
    const look = () => holding.current && lookAgain((n) => n + 1);
    const moving = (event: PointerEvent) => ((pointer.current = event.pointerType === "touch" ? undefined : event.clientY), look());
    const out = () => ((pointer.current = undefined), leaveRows(), look());
    const lifted = (event: PointerEvent) => event.pointerType === "touch" && out();
    addEventListener("pointermove", moving);
    addEventListener("pointerup", lifted);
    document.documentElement.addEventListener("pointerleave", out);
    addEventListener("blur", out);
    addEventListener("scroll", look, { passive: true, capture: true });
    return () => {
      removeEventListener("pointermove", moving);
      removeEventListener("pointerup", lifted);
      document.documentElement.removeEventListener("pointerleave", out);
      removeEventListener("blur", out);
      removeEventListener("scroll", look, { capture: true });
    };
  }, []);
  // When is said again each minute, as the page stays open.
  const [, aMinute] = useState(0);
  useEffect(() => {
    const every = setInterval(() => aMinute((n) => n + 1), 60000);
    return () => clearInterval(every);
  }, []);
  const previews = usePreviews();
  if (!shown) return <div className="h-40" />;

  const now = Date.now();
  const told = (listed: Listed) => latest.current.get(listed.change.id) ?? listed;
  const all = shown.map((listed) => ({ listed, section: sectionOf(listed, you) }));
  const when = (listed: Listed) => {
    const standing = latestOf(listed.change) ? standingOf(listed.change, you) : undefined;
    return standing && "at" in standing ? standing.at : (latestOf(listed.change)?.finished ?? listed.change.started);
  };
  const newest = (a: (typeof all)[number], b: (typeof all)[number]) => when(b.listed).localeCompare(when(a.listed));
  const waiting = all.filter((one) => one.section === "waiting").sort((a, b) => when(a.listed).localeCompare(when(b.listed)));
  order.current = [...order.current.filter((id) => waiting.some(({ listed }) => listed.change.id === id)), ...waiting.map(({ listed }) => listed.change.id).filter((id) => !order.current.includes(id))];
  waiting.sort((a, b) => order.current.indexOf(a.listed.change.id) - order.current.indexOf(b.listed.change.id));
  const withAgents = all.filter((one) => one.section === "agents").sort(newest);
  const done = all.filter((one) => one.section === "done").sort(newest);

  const row = ({ listed, section }: (typeof all)[number]) => (
    <Row
      key={listed.change.id}
      listed={told(listed)}
      section={section}
      you={you}
      now={now}
      arrived={moved.current.has(listed.change.id)}
      landing={landing.current.delete(listed.change.id)}
      previewing={previews.of === undefined ? undefined : previews.of === listed.change.id}
      onFocused={(focused) => (focused ? previews.show(listed.change.id) : previews.hide())}
      onOpen={(moment, note) => onOpen(listed.change.id, moment, note)}
      away={away}
      onLeaving={(going, moved) => {
        if (going) return void leaving.current.add(listed.change.id);
        leaving.current.delete(listed.change.id);
        if (moved) sent.current.add(listed.change.id);
        lookAgain((n) => n + 1);
      }}
    />
  );
  const previewed = previews.of && shown.find((one) => one.change.id === previews.of);
  return (
    <div ref={own}>
      <main
        onPointerEnter={(event) => event.pointerType !== "touch" && (onRows.current = true)}
        onPointerMove={(event) => event.pointerType !== "touch" && (onRows.current = true)}
        onPointerLeave={leaveRows}
        className="px-5 pt-5 pb-4"
      >
        <h1 className="text-[13px] leading-5 font-semibold text-soft">Waiting on you</h1>
        {!waiting.length && (
          <div className="mt-3 animate-arrive text-[15px] leading-[22px]">
            <p className="text-fg">Nothing's waiting on you.</p>
            {!all.length && <p className="text-soft">To see an agent's work here, tell it: “Show me this change with npx playthrough.”</p>}
          </div>
        )}
        <div className="mt-2">{waiting.map(row)}</div>
        <div data-mark="waiting-foot" />
        {withAgents.length > 0 && (
          <section data-mark="agents" className="mt-10">
            <h2 className="text-[13px] leading-5 font-semibold text-soft">With your agents</h2>
            <div className="mt-1.5">{withAgents.map(row)}</div>
            <div data-mark="agents-foot" />
          </section>
        )}
        {done.length > 0 && (
          <section data-mark="done" className="mt-10">
            <h2 className="text-[13px] leading-5 font-semibold text-soft">Done</h2>
            <div className="mt-1.5">{done.slice(0, LATEST).map(row)}</div>
            {done.length > LATEST && (
              <>
                <button onClick={() => setEarlier(!earlier)} aria-expanded={earlier} className={`${QUIET_ROW} hover:bg-hover`}>
                  <span className="text-soft">Earlier · {done.length - LATEST}</span>
                </button>
                <Fold open={earlier}>{done.slice(LATEST).map(row)}</Fold>
              </>
            )}
          </section>
        )}
      </main>
      {previewed && previews.row && latestOf(previewed.change) && (
        <Previews key={previewed.change.id} listed={told(previewed)} row={previews.row} onEdge={previews.edgeAt} onOpen={(moment) => onOpen(previewed.change.id, moment)} />
      )}
    </div>
  );
}

const QUIET_ROW = "-mx-3 flex w-[calc(100%+24px)] items-baseline gap-2 rounded-lg px-3 py-1.5 text-left text-[14px] leading-[22px] transition-colors duration-150 ease-calm";

function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows,opacity] ease-calm ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0"}`} style={{ transitionDuration: `${LEAVING}ms` }} inert={!open}>
      <div className="-mx-3 min-h-0 overflow-hidden px-3">{children}</div>
    </div>
  );
}

// A change in the sheet. Waiting, its title, what you asked and the app, with the step at its right; with your agents
// or done, one quiet line. The whole row is pressed to go in; Send and Done are buttons of their own over it.
function Row(props: {
  listed: Listed;
  section: Section;
  you: string;
  now: number;
  arrived: boolean;
  landing: boolean;
  // Whether its moments are beside it, or another's are; undefined while none are.
  previewing?: boolean;
  onFocused: (focused: boolean) => void;
  onOpen: (moment: number, note?: string) => void;
  // Once the pointer is off the rows, or at once without one.
  away: () => Promise<void>;
  onLeaving: (going: boolean, moved?: boolean) => void;
}) {
  const { listed, section, you, now, arrived, landing, previewing, onFocused, onOpen, away, onLeaving } = props;
  const { change } = listed;
  const handBack = latestOf(change);
  // Acted on, the row says what it said as you pressed, with Sent or Done, until it goes: the change as it is now
  // would say something else in the same place.
  const [said, setSaid] = useState<{ now: "Sent" | "Done"; step: Step }>();
  const step = said?.step ?? stepOf(listed, you);
  const own = useRef<HTMLDivElement>(null);
  const [grown, setGrown] = useState(!arrived);
  useEffect(() => {
    if (grown) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
    return () => cancelAnimationFrame(frame);
  }, []);
  const [glowing] = useState(landing);
  useEffect(() => {
    if (!landing) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shown = setTimeout(() => own.current?.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" }), still ? 0 : LEAVING);
    return () => clearTimeout(shown);
  }, []);
  const [problems, setProblems] = useState<string[]>();
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [heldWidth, setHeldWidth] = useState<number>();
  const saidNow = said?.now;
  // Sent or Done says so where it was pressed, and the row stays there until the pointer has left the rows, so nothing
  // under it moves; then it folds away and lands where it now belongs.
  const say = async (what: "send" | "done") => {
    if (busy || leaving || said || !handBack) return;
    const pressed = step;
    // Saying Sent or Done, the button keeps the width it had, so the words beside it don't move.
    setHeldWidth(Math.max(0, ...[...(own.current?.querySelectorAll("[data-step-button]") ?? [])].map((at) => at.getBoundingClientRect().width)));
    setBusy(true);
    onLeaving(true);
    const problems = await take(change, you, what);
    setBusy(false);
    if (problems.length) return (onLeaving(false), setProblems(problems));
    setProblems(undefined);
    setSaid({ now: what === "send" ? "Sent" : "Done", step: pressed });
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    await new Promise((done) => setTimeout(done, still ? 900 : SAID));
    await away();
    setLeaving(true);
    setTimeout(() => onLeaving(false, true), still ? 0 : LEAVING);
  };
  // To the first moment with something unseen on it, the moment itself: its answers come with Next answer, so the
  // answer's card isn't over what it's about as you arrive.
  const go = () => onOpen(firstUnseen(listed, you).moment);
  // Waiting, Done is always there, quiet, one per change; a filled Send takes its place while
  // something's unsent. With your agents, Send only while something's unsent.
  // Taken, the button gives way to what it did, said in its place, and the step's words beside it go.
  const button = saidNow ? (
    <Taken>{saidNow}</Taken>
  ) : step.is === "send" || section === "waiting" ? (
    <SendButton className="min-w-[84px] justify-center" filled={step.is === "send"} onClick={() => void say(step.is === "send" ? "send" : "done")} disabled={busy || leaving}>
      {step.is === "send" ? `Send ${toSend(step.notes, step.replies)}` : "Done"}
    </SendButton>
  ) : undefined;
  const words = "words" in step ? step.words : undefined;
  // The step's words and its button, together: on the title's line, or on a phone, where the title needs the width,
  // on a line of their own at the row's foot. The words open the change as the rest of the row does; only the button
  // over them is its own.
  const stepAt = (foot: boolean) => (
    <div className={`pointer-events-none relative h-[22px] flex-none items-center gap-3 ${foot ? "mt-2 hidden justify-end phone:flex" : "flex phone:hidden"}`}>
      {words && (
        <span className={`flex items-center gap-1 text-[13px] whitespace-nowrap text-soft transition-opacity duration-150 ease-calm ${saidNow ? "opacity-0" : ""}`}>
          {words}
          <svg viewBox="0 0 12 12" className="size-3 text-faint" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4.5 2.5L8 6l-3.5 3.5" />
          </svg>
        </span>
      )}
      {button && (
        <span data-step-button className="pointer-events-auto -my-[5px] flex justify-end [&>button]:w-full" style={{ minWidth: heldWidth }}>
          {button}
        </span>
      )}
    </div>
  );
  const not = problems && <span className="text-amber-ink"> · Not sent: {problems[0]}</span>;
  const openable = !!handBack;
  // Pointed at, it's the row its moments are beside; while another's are, the pointer may be on its way to them, and
  // this row doesn't light up under it.
  const pointing = openable ? { "data-row": change.id } : {};
  const lit = previewing ? "bg-hover" : previewing === undefined && openable ? "hover:bg-hover" : "";
  const press = openable && (
    <button
      onClick={go}
      onFocus={(event) => event.currentTarget.matches(":focus-visible") && onFocused(true)}
      onBlur={() => onFocused(false)}
      aria-label={words ? `${change.title}: ${words}` : change.title}
      className="absolute inset-0 rounded-lg focus-visible:outline-offset-0"
    />
  );
  return (
    <div
      ref={own}
      data-change={change.id}
      className={`grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows,opacity] ease-calm ${leaving || !grown ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"}`}
      style={{ transitionDuration: `${LEAVING}ms` }}
    >
      <div className={`min-h-0 ${leaving || !grown ? "overflow-hidden" : ""}`}>
        {section === "waiting" ? (
          <div
            {...pointing}
            className={`relative -mx-3 rounded-lg px-3 py-3 transition-colors duration-150 ease-calm ${glowing ? "animate-glow" : ""} ${lit}`}
          >
            {press}
            <div className="flex items-start gap-4">
            <h2 className="pointer-events-none min-w-0 flex-1 line-clamp-2 text-[15px] leading-[22px] font-semibold text-fg">{change.title}</h2>
            {stepAt(false)}
            </div>
            <div className="pointer-events-none">
              {/* Your own words, in two lines at most: what you asked is what you judge by. */}
              {change.asked && <p className="line-clamp-2 text-[14px] leading-[22px] text-pretty text-soft">{change.asked}</p>}
              <p className="truncate text-[13px] leading-5 text-faint">
                {listed.app} · {backAgain(listed.change, you) ? "back again" : "back"} {ago(handBack!.finished!, now)}
                {not}
              </p>
            </div>
            {stepAt(true)}
          </div>
        ) : (
          <div {...pointing} className={`relative ${QUIET_ROW} flex-wrap items-center ${glowing ? "animate-glow" : ""} ${lit}`}>
            {press}
            <span className="pointer-events-none min-w-0 flex-1 truncate">
              <span className="text-fg">{change.title}</span>
              <span className="text-soft">
                {" · "}
                {listed.app} · {quietWhen(listed, you, now)}
              </span>
              {not}
            </span>
            {button ? (
              <span className="relative -my-[5px]">{button}</span>
            ) : (
              words && <span className={`pointer-events-none flex-none text-[13px] ${step.is === "with" && step.tell ? "text-amber-ink" : "text-soft"}`}>{words}</span>
            )}
            {!button && step.is === "with" && step.tell && <TellYours words={step.tell} />}
          </div>
        )}
      </div>
    </div>
  );
}

// Sent, and nothing is listening for it: what to say to your agent, word for word, on a line of its own under the row's.
export function TellYours({ words }: { words: string }) {
  return (
    <span className="pointer-events-none w-full text-[13px] leading-5 text-soft">
      Tell yours: <span className="text-fg">“{words}”</span>
    </span>
  );
}

// When, on a quiet row, in its own words: when you sent it, said Done, or the agent started.
function quietWhen(listed: Listed, you: string, now: number) {
  if (!latestOf(listed.change)) return `started ${ago(listed.change.started, now)}`;
  const standing = standingOf(listed.change, you);
  if (standing.is === "sent") return `sent ${ago(standing.at, now)}`;
  if (standing.is === "done") return `done ${ago(standing.at, now)}`;
  return ago(latestOf(listed.change)!.finished!, now);
}


type Point = { x: number; y: number };

// Whether a pointer that moved from one point to another is heading for a box past its edge from a to b: it's inside
// the triangle that edge makes with where the pointer was. On its way there it may cross other rows, which mustn't take
// the box's place under it.
function towards(from: Point, to: Point, [a, b]: [Point, Point]): boolean {
  const side = (p: Point, q: Point) => (q.x - p.x) * (to.y - p.y) - (q.y - p.y) * (to.x - p.x);
  const turns = [side(from, a), side(a, b), side(b, from)];
  return !(turns.some((one) => one < 0) && turns.some((one) => one > 0));
}

// A row's moments come beside it a breath after the pointer reaches it, and another row's at once while any are
// showing. Heading for them across other rows keeps them; resting there, or turning away, moves them on.
const BREATH = 70;
const HEADING = 250;

function usePreviews() {
  const [shown, setShown] = useState<{ of: string; row: DOMRect }>();
  const of = useRef<string>(undefined);
  of.current = shown?.of;
  const edge = useRef<[Point, Point]>(undefined);
  const last = useRef<Point>(undefined);
  const breath = useRef<{ for: string; wait: ReturnType<typeof setTimeout> }>(undefined);
  const heading = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rest = () => (clearTimeout(breath.current?.wait), clearTimeout(heading.current), (breath.current = heading.current = undefined));
  const rowOf = (id: string) => document.querySelector(`[data-row="${CSS.escape(id)}"]`)?.getBoundingClientRect();
  const show = (id: string) => {
    rest();
    const row = rowOf(id);
    if (row) setShown({ of: id, row });
  };
  const hide = () => (rest(), setShown(undefined));
  // What's under the pointer: a row by its change, the moments beside one, or neither.
  const under = (at: EventTarget | Element | null) => {
    const element = at instanceof Element ? at : undefined;
    return element?.closest("[data-previews]") ? "previews" : element?.closest<HTMLElement>("[data-row]")?.dataset.row;
  };
  const settle = (over: string | undefined) => {
    if (over === "previews" || (over && over === of.current)) return rest();
    if (!over) return hide();
    if (of.current) return show(over);
    if (breath.current?.for === over) return;
    rest();
    breath.current = { for: over, wait: setTimeout(() => show(over), BREATH) };
  };
  useEffect(() => {
    // Only a pointer that moves: a row that slides under a still one, as another folds away, shows nothing.
    const moved = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const [from, here] = [last.current, { x: event.clientX, y: event.clientY }];
      last.current = here;
      if (from && from.x === here.x && from.y === here.y) return;
      const over = under(event.target);
      if (of.current && over !== "previews" && over !== of.current && from && edge.current && towards(from, here, edge.current)) {
        clearTimeout(heading.current);
        heading.current = setTimeout(() => settle(under(document.elementFromPoint(here.x, here.y))), HEADING);
        return;
      }
      settle(over);
    };
    // Scrolled, the row has gone from under its moments: they go. Their own scrolling is theirs.
    const scrolled = (event: Event) => !(event.target instanceof Element && event.target.closest("[data-previews]")) && hide();
    addEventListener("pointermove", moved);
    addEventListener("scroll", scrolled, { passive: true, capture: true });
    return () => (rest(), removeEventListener("pointermove", moved), removeEventListener("scroll", scrolled, { capture: true }));
  }, []);
  return { of: shown?.of, row: shown?.row, show, hide, edgeAt: (at: [Point, Point]) => void (edge.current = at) };
}

// A change's moments, small, beside its row, each with its name: to the right where there's room, else under it, or over
// it where there's more room there, never moving it, and as tall as the window lets them be. Each is drawn as it is,
// seen or not: a picture dimmed seemed to show something else. Pressed, one goes straight to its moment. Between row and
// moments, an unseen bridge, so the pointer never crosses a gap that would let them go.
const PREVIEW = { picture: 184, inset: 6, gap: 2, pad: 4, apart: 16, under: 4, margin: 16 };

function Previews({ listed, row, onEdge, onOpen }: { listed: Listed; row: DOMRect; onEdge: (edge: [Point, Point]) => void; onOpen: (moment: number) => void }) {
  const { change } = listed;
  const handBack = latestOf(change)!;
  const count = handBack.moments.length;
  const columns = count === 1 ? 1 : count <= 4 ? 2 : 3;
  const cell = PREVIEW.picture + 2 * PREVIEW.inset;
  const width = columns * cell + (columns - 1) * PREVIEW.gap + 2 * PREVIEW.pad;
  const own = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number; height: number; bridge: { left: number; top: number; width: number; height: number } }>();
  useLayoutEffect(() => {
    const natural = own.current!.scrollHeight;
    const { apart, under, margin } = PREVIEW;
    if (row.right + apart + width <= innerWidth - margin) {
      const height = Math.min(natural, innerHeight - 2 * margin);
      const [left, top] = [row.right + apart, Math.max(margin, Math.min(row.top, innerHeight - margin - height))];
      onEdge([{ x: left, y: top }, { x: left, y: top + height }]);
      return setAt({ left, top, height, bridge: { left: row.right, top: row.top, width: apart, height: row.height } });
    }
    const left = Math.max(margin, Math.min(row.left, innerWidth - margin - width));
    const [below, above] = [innerHeight - margin - row.bottom - under, row.top - under - margin];
    const down = natural <= below || below >= above;
    const height = Math.min(natural, down ? below : above);
    const top = down ? row.bottom + under : row.top - under - height;
    const near = down ? top : top + height;
    onEdge([{ x: left, y: near }, { x: left + width, y: near }]);
    setAt({ left, top, height, bridge: { left: row.left, top: down ? row.bottom : row.top - under, width: row.width, height: under } });
  }, [row]);
  return createPortal(
    <>
      {at && <div data-sheet data-previews className="fixed z-[60]" style={at.bridge} />}
      <div
        ref={own}
        data-sheet
        data-previews
        className={`fixed z-[60] animate-arrive overflow-y-auto overscroll-contain rounded-xl bg-surface shadow-float ${at ? "" : "invisible"}`}
        style={{ left: at?.left ?? 0, top: at?.top ?? 0, width, maxHeight: at?.height, padding: PREVIEW.pad, animationDuration: "150ms" }}
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${columns}, ${cell}px)`, gap: PREVIEW.gap }}>
          {handBack.moments.map((moment, i) => (
            // Out of the keyboard's way: a focused row shows them, and Enter on it goes in.
            <button
              key={moment.name}
              tabIndex={-1}
              onClick={() => onOpen(i + 1)}
              className="group flex flex-col gap-1.5 rounded-lg text-left transition-colors duration-150 ease-calm hover:bg-hover"
              style={{ padding: PREVIEW.inset }}
            >
              <span className="relative block aspect-[1.6] w-full overflow-hidden rounded-md bg-paper shadow-frame">
                <StillPicture change={change} handBack={handBack} moment={moment} about={moment.about ?? moment.acted} />
              </span>
              <span className="line-clamp-2 px-0.5 text-[12px] leading-4 text-soft transition-colors duration-150 ease-calm group-hover:text-fg">{moment.name}</span>
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
