// The last stop's sheet, in the recording's place: your side of the change, what isn't already on the page. What you
// asked, in your words, the thing you judge by; the notes Send will send, and only those, so what's on the sheet is
// what the button counts; and what's still to do, if anything. The moments stay on their edge beside it.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { TellYours } from "./Changes.tsx";
import { useMore } from "./Edge.tsx";
import { usePhone } from "./phone.ts";
import { tick } from "./Send.tsx";
import type { Went } from "./StepLeft.tsx";

// A note's card wide and flat, its picture beside its words: two across where the frame holds two at least this wide,
// each at most this wide; else one, a little wider.
const [NARROWEST, WIDEST, ALONE] = [420, 480, 560];
const APART = 16;

export function LastStop(props: {
  asked?: string;
  // A note on the whole change being written, or one open: its card as a moment's is. Open, it's in its own card's
  // place in the list; being written, or open and not in the list, in the place the next card takes.
  open?: { id?: string; card: ReactNode };
  // The notes Send will send, each drawn as its card on the Notes edge is; once sent, what went, till the page goes on.
  notes: { id: string; card: ReactNode }[];
  // Sent, what came of it, said over them in their heading's place.
  went?: Went;
  // What's still to do: the moments not watched, the answers not opened; each pressed goes to the first of them.
  // What to tell a new agent, while what you sent waits with none on it: here, under your side of it, not in the bar.
  tell?: string;
  unwatched: number;
  unopened: number;
  onUnwatched: () => void;
  onUnopened: () => void;
}) {
  const { notes, open } = props;
  const asked = props.asked?.trim();
  const phone = usePhone();
  // Past the frame's foot, the sheet scrolls in its frame, what you asked going up with it, fading where there's more.
  // Its room is measured inside the scrollbar's place, which is kept whether it scrolls or not, so it never shifts.
  const sheet = useRef<HTMLDivElement>(null);
  const more = useMore(sheet);
  const [frame, setFrame] = useState({ wide: 0, high: 0 });
  useLayoutEffect(() => {
    const at = sheet.current;
    if (!at) return;
    const measure = () => setFrame({ wide: at.clientWidth, high: at.clientHeight });
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(at);
    return () => watching.disconnect();
  }, []);
  // What you asked holds one place whatever comes under it, so nothing you do here moves it: at the sheet's top, where
  // a moment's own content would begin. A long ask is cut at about a third of the frame (whole on hover, and to the
  // keyboard). With nothing asked, what there is starts there. At its foot, room for the bar and, over it, its notice,
  // so the last of the sheet scrolls clear of both.
  const [above, below, line, side] = phone ? [16, 40, 23, 16] : [48, 92, 30, 32];
  const askedLines = Math.max(3, Math.floor(((frame.high - above - below) * 0.34) / line));
  // One left edge for all of it: a measure as wide as the cards across, which hangs on the frame's width alone, never on
  // how many notes there are, so a note kept or a box opened takes the next place and nothing else moves.
  const room = frame.wide - 2 * side;
  const across = room >= 2 * NARROWEST + APART ? 2 : 1;
  const card = across === 2 ? Math.min(WIDEST, (room - APART) / 2) : Math.max(0, Math.min(ALONE, room));
  const measure = phone ? undefined : across * card + (across - 1) * APART;
  const todo = [
    props.unwatched > 0 && { words: `${props.unwatched} ${props.unwatched === 1 ? "moment" : "moments"} not watched`, go: props.onUnwatched },
    props.unopened > 0 && { words: `${props.unopened} ${props.unopened === 1 ? "answer" : "answers"} not opened`, go: props.onUnopened },
  ].filter((one) => !!one);
  const quietLine = "text-[12.5px] leading-[17px] text-soft";
  // Open, a card in the list is drawn in its place; else the open card takes the next place, where a kept note lands.
  const inList = !!open?.id && notes.some((one) => one.id === open.id);
  const cards = [...notes.map((one) => (inList && one.id === open!.id ? { id: one.id, card: open!.card, open: true } : { ...one, open: false })), ...(open && !inList ? [{ id: "open", card: open.card, open: true }] : [])];
  const opened = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => opened.current?.scrollIntoView({ block: "nearest" }), [open?.id ?? (open ? "new" : undefined)]);
  // A row of notes as tall as its tallest, so it reads as one row whatever's in it. Measured on the notes alone, before
  // they're drawn: a box opened beside one, or a note open in its place, leaves the others as they were.
  const placed = useRef(new Map<string, HTMLElement>());
  const [rows, setRows] = useState<number[]>([]);
  const laidOut = phone ? "" : `${across}:${cards.map((one) => (one.open ? "" : one.id)).join(",")}`;
  useLayoutEffect(() => {
    if (!laidOut) return setRows([]);
    const measure = () => {
      const tallest: number[] = [];
      cards.forEach((one, i) => {
        const at = !one.open && placed.current.get(one.id);
        if (at) tallest[Math.floor(i / across)] = Math.max(tallest[Math.floor(i / across)] ?? 0, ownHeight(at));
      });
      setRows((was) => (was.length === tallest.length && was.every((one, i) => one === tallest[i]) ? was : tallest));
    };
    measure();
    const watching = new ResizeObserver(measure);
    placed.current.forEach((at) => at.firstElementChild?.firstElementChild && watching.observe(at.firstElementChild.firstElementChild));
    return () => watching.disconnect();
  }, [laidOut]);
  return (
    <div className="absolute inset-0 overflow-hidden rounded-lg bg-surface shadow-frame">
      <div ref={sheet} onScroll={more.look} className="h-full overflow-y-auto overscroll-contain inside:overscroll-auto [scrollbar-width:thin] [scrollbar-gutter:stable_both-edges]" style={more.fade}>
        <div className="mx-auto flex flex-col items-start gap-8 phone:gap-4" style={{ width: measure && measure + 2 * side, padding: `${above}px ${side}px ${below}px` }}>
          {asked && (
            <div className="flex w-full flex-none flex-col items-start" title={asked} tabIndex={0} aria-label={`You asked: ${asked}`}>
              <p className={quietLine}>You asked</p>
              <p
                className="mt-2 max-w-[30em] overflow-hidden text-[21px] leading-[30px] text-pretty text-fg phone:text-[16px] phone:leading-[23px]"
                style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: askedLines }}
              >
                {asked}
              </p>
            </div>
          )}
          {cards.length > 0 && (
            <div className="flex w-full flex-col items-start">
              {(notes.length > 0 || (open && !open.id)) && <NotesSay went={props.went} many={notes.length !== 1} />}
              {/* Across, then down, a row's notes one height: a card kept or a box opened takes the next place, and nothing
                  moves. On a phone, one column the whole width. */}
              <div className="grid w-full items-start" style={{ gridTemplateColumns: phone ? "100%" : `repeat(${across}, ${card}px)`, gap: APART }}>
                {cards.map((one, i) => (
                  // Brought into view clear of the bar across the frame's foot.
                  <div
                    key={one.id}
                    ref={(at) => {
                      if (one.open) opened.current = at;
                      else if (at) placed.current.set(one.id, at);
                      else placed.current.delete(one.id);
                    }}
                    className="flex flex-col [&>*]:flex-1"
                    style={{ scrollMarginBottom: 24, minHeight: one.open ? undefined : rows[Math.floor(i / across)] }}
                  >
                    {one.card}
                  </div>
                ))}
              </div>
            </div>
          )}
          {props.tell && (
            <p className="flex-none">
              <TellYours words={props.tell} />
            </p>
          )}
          {todo.length > 0 && (
            <div className="flex flex-none flex-wrap gap-x-5 gap-y-1">
              {todo.map((one) => (
                <button key={one.words} onClick={one.go} className="rounded-sm text-[13px] leading-5 text-soft underline decoration-line underline-offset-[3px] transition-colors duration-150 ease-calm hover:text-fg hover:decoration-current">
                  {one.words}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// A note's card's own height, however tall its row has made it: to the foot of what's in it, and its padding.
function ownHeight(place: HTMLElement) {
  const card = place.firstElementChild;
  const inside = card?.firstElementChild;
  if (!card || !inside) return 0;
  return inside.getBoundingClientRect().bottom - card.getBoundingClientRect().top + parseFloat(getComputedStyle(card).paddingBottom);
}

// The notes' heading, which is where sending them is said: "Your notes", then, sent, that they went, then that the agent
// is on them. Every line is held in the one place, the one not true unseen, so it turns in place and nothing moves.
function NotesSay({ went, many }: { went?: Went; many: boolean }) {
  const lines: [Went | "yours", ReactNode][] = [
    ["yours", "Your notes"],
    [
      "sent",
      <>
        {tick}Sent to your agent
      </>,
    ],
    [
      "no agent",
      <>
        {tick}Sent.&nbsp;<span className="text-amber-ink">No agent listening.</span>
      </>,
    ],
    [
      "working",
      <>
        <i className="mr-[7px] size-[7px] animate-breathe rounded-full bg-slate" />
        The agent is working on your {many ? "notes" : "note"}
      </>,
    ],
  ];
  const now = went ?? "yours";
  return (
    <p role="status" data-part="notes-heading" className="mb-2 grid justify-items-start text-[12.5px] leading-[17px] text-soft">
      {lines.map(([is, words]) => (
        <span key={is} aria-hidden={is !== now} className={`flex items-center whitespace-nowrap transition-opacity duration-200 ease-calm [grid-area:1/1] ${is === now ? "" : "opacity-0"}`}>
          {words}
        </span>
      ))}
    </p>
  );
}
