// The last stop's sheet, in the recording's place: your side of the change, what isn't already on the page. What you
// asked, in your words, the thing you judge by; the notes Send will send, and only those, so what's on the sheet is
// what the button counts; and what's still to do, if anything. The moments stay on their edge beside it.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePhone } from "./phone.ts";

// A note's card at a comfortable reading width; past what one column holds, two or three across.
const CARD = 300;
const APART = 16;

export function LastStop(props: {
  asked?: string;
  // The notes Send will send, each drawn as its card on the Notes edge is; once sent, what went, till the page goes on.
  notes: { id: string; card: ReactNode }[];
  // What's still to do: the moments not watched, the answers not opened; each pressed goes to the first of them.
  unwatched: number;
  unopened: number;
  onUnwatched: () => void;
  onUnopened: () => void;
}) {
  const { notes } = props;
  const asked = props.asked?.trim();
  const phone = usePhone();
  // Columns by the frame's width: one card alone, else as many across as sit at a reading width, at most three.
  const own = useRef<HTMLDivElement>(null);
  const [{ wide, high }, setRoom] = useState({ wide: 0, high: 0 });
  useLayoutEffect(() => {
    const frame = own.current;
    if (!frame) return;
    const measure = () => setRoom({ wide: frame.clientWidth, high: frame.clientHeight });
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(frame);
    return () => watching.disconnect();
  }, []);
  const columns = Math.max(1, Math.min(notes.length, phone ? 1 : 3, Math.floor((wide - 64 + APART) / (CARD + APART))));
  const todo = [
    props.unwatched > 0 && { words: `${props.unwatched} ${props.unwatched === 1 ? "moment" : "moments"} not watched`, go: props.onUnwatched },
    props.unopened > 0 && { words: `${props.unopened} ${props.unopened === 1 ? "answer" : "answers"} not opened`, go: props.onUnopened },
  ].filter((one) => !!one);
  // With notes to send, they're the sheet's main thing and what you asked steps back, to the moment line's size and
  // three lines; with none, what you asked is the sheet, large, whole while the frame has the height for it. Cut
  // either way, it's whole on hover, and to the keyboard.
  const quietLine = "text-[12.5px] leading-[17px] text-soft";
  const sending = notes.length > 0;
  const askedLines = sending ? 3 : Math.max(3, Math.floor((high - 140 - (todo.length ? 40 : 0)) / (phone ? 23 : 30)));
  // The notes, past what fits, scroll in their own part, fading at whichever edge has more beyond it.
  const list = useRef<HTMLDivElement>(null);
  const [beyond, setBeyond] = useState({ above: false, below: false });
  const look = () => {
    const shown = list.current;
    if (!shown) return;
    const [above, below] = [shown.scrollTop > 1, shown.scrollTop + shown.clientHeight < shown.scrollHeight - 1];
    setBeyond((now) => (now.above === above && now.below === below ? now : { above, below }));
  };
  useLayoutEffect(look);
  const fade = `linear-gradient(to bottom, ${beyond.above ? "transparent" : "#000"}, #000 ${beyond.above ? 40 : 0}px, #000 calc(100% - ${beyond.below ? 40 : 0}px), ${beyond.below ? "transparent" : "#000"})`;
  return (
    <div ref={own} className="absolute inset-0 overflow-hidden rounded-lg bg-surface shadow-frame">
      {/* One block, centred in the frame's height while it fits, else from the top; clear of the bar across its foot. */}
      <div className="flex h-full flex-col items-center gap-8 px-8 pt-8 pb-14 phone:gap-4 phone:px-4 phone:pt-4 phone:pb-10" style={{ justifyContent: "safe center" }}>
        {asked && (
          <div className="flex w-full flex-none flex-col items-center text-center" title={asked} tabIndex={0} aria-label={`You asked: ${asked}`}>
            <p className={quietLine}>You asked</p>
            <p
              className={`overflow-hidden text-balance text-fg ${sending ? "mt-1 max-w-[44em] text-[15px] leading-[22px]" : "mt-2 max-w-[30em] text-[21px] leading-[30px] phone:text-[16px] phone:leading-[23px]"}`}
              style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: askedLines }}
            >
              {asked}
            </p>
          </div>
        )}
        {sending && (
          <div className="flex min-h-0 w-full flex-col items-center">
            <p className={`${quietLine} mb-2 flex-none`}>Your notes</p>
            <div ref={list} onScroll={look} className="min-h-0 w-full overflow-y-auto overscroll-contain px-1 py-1 [scrollbar-width:thin]" style={{ maskImage: fade, WebkitMaskImage: fade }}>
              <div className="mx-auto grid items-start" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, ${CARD}px))`, gap: APART, justifyContent: "center" }}>
                {notes.map((one) => (
                  <div key={one.id}>{one.card}</div>
                ))}
              </div>
            </div>
          </div>
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
  );
}
