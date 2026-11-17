// The last stop's sheet, in the recording's place: your side of the change, what isn't already on the page. What you
// asked, in your words, the thing you judge by; the notes Send will send, and only those, so what's on the sheet is
// what the button counts; and what's still to do, if anything. The moments stay on their edge beside it.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { TellYours } from "./Changes.tsx";
import { useMore } from "./Edge.tsx";
import { usePhone } from "./phone.ts";

// A note's card at a comfortable reading width; past what one column holds, two or three across.
const CARD = 300;
const APART = 16;

export function LastStop(props: {
  asked?: string;
  // A note on the whole change being written, or one open: its card as a moment's is. Open, it's in its own card's
  // place in the list; being written, or open and not in the list, in the place the next card takes.
  open?: { id?: string; card: ReactNode };
  // The notes Send will send, each drawn as its card on the Notes edge is; once sent, what went, till the page goes on.
  notes: { id: string; card: ReactNode }[];
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
  const own = useRef<HTMLDivElement>(null);
  const [high, setHigh] = useState(0);
  useLayoutEffect(() => {
    const frame = own.current;
    if (!frame) return;
    const measure = () => setHigh(frame.clientHeight);
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(frame);
    return () => watching.disconnect();
  }, []);
  // What you asked holds one place whatever comes under it, so nothing you do here moves it: a third of the way down
  // the frame, clear of the bar, so there's room under it. A long ask is cut at about a third of the frame (whole on
  // hover, and to the keyboard). With nothing asked, what there is starts there. At its foot, room for the bar and,
  // over it, its notice, so the last of the sheet scrolls clear of both.
  const [above, below, line] = phone ? [16, 40, 23] : [32, 92, 30];
  const askedLines = Math.max(3, Math.floor(((high - above - below) * 0.34) / line));
  const top = above + (high - above - below) * 0.3;
  const todo = [
    props.unwatched > 0 && { words: `${props.unwatched} ${props.unwatched === 1 ? "moment" : "moments"} not watched`, go: props.onUnwatched },
    props.unopened > 0 && { words: `${props.unopened} ${props.unopened === 1 ? "answer" : "answers"} not opened`, go: props.onUnopened },
  ].filter((one) => !!one);
  const quietLine = "text-[12.5px] leading-[17px] text-soft";
  // Open, a card in the list is drawn in its place; else the open card takes the next place, where a kept note lands.
  const inList = !!open?.id && notes.some((one) => one.id === open.id);
  const cards = [...notes.map((one) => (inList && one.id === open!.id ? { id: one.id, card: open!.card, open: true } : { ...one, open: false })), ...(open && !inList ? [{ id: "open", card: open.card, open: true }] : [])];
  // Past the frame's foot, the sheet scrolls in its frame, what you asked going up with it, fading where there's more.
  const sheet = useRef<HTMLDivElement>(null);
  const more = useMore(sheet);
  const opened = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => opened.current?.scrollIntoView({ block: "nearest" }), [open?.id ?? (open ? "new" : undefined)]);
  return (
    <div ref={own} className="absolute inset-0 overflow-hidden rounded-lg bg-surface shadow-frame">
      <div ref={sheet} onScroll={more.look} className="h-full overflow-y-auto overscroll-contain [scrollbar-width:thin]" style={more.fade}>
        <div className="flex flex-col items-center gap-8 px-8 phone:gap-4 phone:px-4" style={{ paddingTop: top, paddingBottom: below }}>
          {asked && (
            <div className="flex w-full flex-none flex-col items-center text-center" title={asked} tabIndex={0} aria-label={`You asked: ${asked}`}>
              <p className={quietLine}>You asked</p>
              <p
                className="mt-2 max-w-[30em] overflow-hidden text-[21px] leading-[30px] text-balance text-fg phone:text-[16px] phone:leading-[23px]"
                style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: askedLines }}
              >
                {asked}
              </p>
            </div>
          )}
          {cards.length > 0 && (
            <div className="flex w-full flex-col items-center">
              {(notes.length > 0 || (open && !open.id)) && <p className={`${quietLine} mb-2`}>Your notes</p>}
              {/* One column, centred, a card wide: a card kept or a box opened takes the next place down, and nothing moves. */}
              <div className="flex w-full flex-col" style={{ maxWidth: CARD, gap: APART }}>
                {cards.map((one) => (
                  // Brought into view clear of the bar across the frame's foot.
                  <div key={one.id} ref={one.open ? opened : undefined} className="flex flex-col" style={{ scrollMarginBottom: 24 }}>
                    {one.card}
                  </div>
                ))}
              </div>
            </div>
          )}
          {props.tell && (
            <p className="flex-none text-center">
              <TellYours words={props.tell} />
            </p>
          )}
          {todo.length > 0 && (
            <div className="flex flex-none flex-wrap justify-center gap-x-5 gap-y-1">
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
