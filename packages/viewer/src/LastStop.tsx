// The last stop's sheet, in the recording's place: your side of the change, what isn't already on the page. What you
// asked, in your words, the thing you judge by; the notes Send will send, and only those, so what's on the sheet is
// what the button counts; and what's still to do, if anything. The moments stay on their edge beside it.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { isGuest } from "./api.ts";
import { TellYours } from "./Changes.tsx";
import { useMore } from "./Edge.tsx";
import { usePhone } from "./phone.ts";
import { tick } from "./Send.tsx";
import { APART, notesAcross } from "./sheet.ts";
import type { Went } from "./StepLeft.tsx";

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
    // Resized, laid out anew before that frame is drawn, so the cards never show a frame at their old width.
    const watching = new ResizeObserver(() => flushSync(measure));
    watching.observe(at);
    return () => watching.disconnect();
  }, []);
  // What you asked holds one place whatever comes under it, so nothing you do here moves it: at the sheet's top, where
  // a moment's own content would begin. A long ask is cut at about a third of the frame (whole on hover, and to the
  // keyboard). With nothing asked, what there is starts there. At its foot, room for the bar and, over it, its notice,
  // so the last of the sheet scrolls clear of both.
  const [above, below, line, side] = phone ? [16, 40, 23, 16] : [48, 92, 30, 32];
  const askedLines = Math.max(3, Math.floor(((frame.high - above - below) * 0.34) / line));
  // One left edge for all of it: a measure as wide as the cards across, centred in the frame. On a phone, one column
  // the whole width.
  const { across, card, measure } = phone ? { across: 1, card: undefined, measure: undefined } : notesAcross(frame.wide - 2 * side);
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
  // A row of notes as tall as its tallest, so it reads as one row whatever's in it. Grid rows can't do it alone: a box
  // opened, or a note open in its place, is a row's too, and would stretch the notes beside it. So each note's own
  // height is measured while it's closed and kept while it's open: what's beside it stays as it was, and what's open is
  // as tall as its row at least.
  const closed = useRef(new Map<string, HTMLElement>());
  const [heights, setHeights] = useState<Record<string, number>>({});
  const shut = phone ? "" : cards.flatMap((one) => (one.open ? [] : [one.id])).join(",");
  useLayoutEffect(() => {
    if (!shut) return;
    const measure = () => {
      const now = Object.fromEntries([...closed.current].map(([id, at]) => [id, ownHeight(at)]));
      setHeights((was) => (Object.entries(now).every(([id, high]) => was[id] === high) ? was : { ...was, ...now }));
    };
    measure();
    // As text wraps anew, on a resize or once a font has come, before that frame is drawn.
    const watching = new ResizeObserver(() => flushSync(measure));
    closed.current.forEach((at) => watching.observe(at.firstElementChild!.firstElementChild!));
    return () => watching.disconnect();
  }, [shut]);
  const rowOf = (i: number) => {
    const first = i - (i % across);
    return phone ? undefined : Math.max(0, ...cards.slice(first, first + across).map((one) => heights[one.id] ?? 0));
  };
  return (
    <div className="absolute inset-0 overflow-hidden rounded-lg bg-surface shadow-frame">
      <div ref={sheet} onScroll={more.look} className="h-full overflow-y-auto overscroll-contain inside:overscroll-auto [scrollbar-width:thin] [scrollbar-gutter:stable_both-edges]" style={more.fade}>
        <div className="mx-auto flex flex-col items-start gap-8 phone:gap-4" style={{ width: measure && measure + 2 * side, padding: `${above}px ${side}px ${below}px` }}>
          {/* A guest didn't ask it: the person who shared the change did. */}
          {asked && (
            <div className="flex w-full flex-none flex-col items-start" title={asked} tabIndex={0} aria-label={`${ASKED()}: ${asked}`}>
              <p className={quietLine}>{ASKED()}</p>
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
                      else if (at) closed.current.set(one.id, at);
                      else closed.current.delete(one.id);
                    }}
                    className="flex flex-col [&>*]:flex-1"
                    style={{ scrollMarginBottom: 24, minHeight: rowOf(i) }}
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

// A note's card's own height, however tall its row has made it: what's in it, and its padding (laid out, so a card
// pressed, shrinking a little under the pointer, doesn't count as smaller).
function ownHeight(place: Element) {
  const card = place.firstElementChild!;
  const { paddingTop, paddingBottom } = getComputedStyle(card);
  return (card.firstElementChild as HTMLElement).offsetHeight + parseFloat(paddingTop) + parseFloat(paddingBottom);
}

const ASKED = () => (isGuest() ? "What was asked" : "You asked");

// The notes' heading, which is where sending them is said: "Your notes", then, sent, that they went, then that the agent
// is on them. Every line is held in the one place, the one not true unseen, so it turns in place and nothing moves.
function NotesSay({ went, many }: { went?: Went; many: boolean }) {
  const lines: [Went | "yours", ReactNode][] = [
    ["yours", "Your notes"],
    [
      "sent",
      <>
        {tick}Sent to {isGuest() ? "the" : "your"} agent
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
