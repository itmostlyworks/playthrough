// The last stop's sheet, in the recording's place: the whole change at a glance before you say Done or Send. At its
// top what you asked, in your words; then every moment as the picture of how it ends, its name and whom it's done as,
// and under it what you said on it; what you haven't watched said so. Only your words and the pictures: nothing the
// agent wrote.

import { useLayoutEffect, useRef, useState } from "react";
import type { Change, HandBack, Note } from "@playthrough/change";
import { usePhone } from "./phone.ts";
import { StillPicture } from "./Still.tsx";

// Past this many notes on a moment, the rest are counted.
const SHOWN = 3;
// The pictures' widths: as large as the frame lets them be, up to the largest, and never under the smallest that
// still reads; past that, the sheet scrolls.
const LARGEST = 240;
const SMALLEST = 130;
// The sheet's room: its sides, its top, its foot (clear of the bar across it), and between pictures.
const SIDES = 24;
const TOP = 24;
const FOOT = 40;
const APART = { x: 20, y: 24 };
// A line of a note's words or a name, and an average letter, at their size.
const LINE = 17;
const LETTER = 6.4;

type Said = { note: Note; sent: boolean };

export function LastStop(props: {
  change: Change;
  handBack: HandBack;
  // What you said on the change, sent and unsent.
  said: Said[];
  // A note's words as yours, and whether its answer is new and not yet opened.
  says: (note: Note, sent: boolean) => { words: string; fresh: boolean };
  // The moments you haven't watched, by their place from 1.
  unwatched: number[];
  onMoment: (n: number) => void;
}) {
  const { change, handBack, said, says } = props;
  const moments = handBack.moments;
  const phone = usePhone();
  const on = (name: string) => said.filter(({ note }) => note.on?.moment === name);
  const elsewhere = said.filter(({ note }) => !moments.some((one) => one.name === note.on?.moment));
  const asked = change.asked?.trim();

  // The frame's size and what you asked's height, as drawn, so the pictures can take the room that's left.
  const own = useRef<HTMLDivElement>(null);
  const askedBox = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ width: 0, height: 0, asked: 0, askedLines: 0 });
  useLayoutEffect(() => {
    const frame = own.current;
    if (!frame) return;
    const measure = () => {
      const words = askedBox.current?.querySelector("[data-words]") as HTMLElement | null;
      setRoom({ width: frame.clientWidth, height: frame.clientHeight, asked: askedBox.current?.offsetHeight ?? 0, askedLines: words ? Math.round(words.scrollHeight / 22) : 0 });
    };
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(frame);
    return () => watching.disconnect();
  }, [asked]);

  // How tall a moment stands at a width, its notes at so many lines each.
  const tall = (index: number, width: number, lines: number) => {
    const moment = moments[index]!;
    const perLine = Math.max(1, Math.floor((width - 14) / LETTER));
    const name = Math.min(2, Math.ceil(((moment.name.length + (moment.person ? moment.person.length + 4 : 0)) * LETTER) / width));
    const notes = on(moment.name);
    const noted = notes.slice(0, SHOWN).reduce((sum, one) => {
      const { words, fresh } = says(one.note, one.sent);
      return sum + 6 + Math.min(lines, Math.ceil(words.length / perLine)) * LINE + (fresh ? 16 : 0);
    }, 0);
    return width / 1.6 + 8 + name * LINE + (props.unwatched.includes(index + 1) ? 16 : 0) + (notes.length ? 8 + noted + (notes.length > SHOWN ? 22 : 0) : 0);
  };
  // The layout giving the largest pictures that all fit the frame, counting what you asked above and the notes under
  // them; three lines a note where there's height for it, else two. None fitting, the smallest that reads, scrolling.
  const layout = (() => {
    const across = room.width - 2 * SIDES;
    const high = room.height - TOP - FOOT - (asked ? room.asked + APART.y : 0) - (elsewhere.length ? 24 + elsewhere.length * (2 * LINE + 6) : 0);
    let best: { columns: number; width: number; lines: number } | undefined;
    for (let columns = 1; columns <= (phone ? Math.min(2, moments.length) : moments.length); columns++) {
      const width = Math.min(LARGEST, Math.floor((across - (columns - 1) * APART.x) / columns));
      if (width < SMALLEST && columns > 1) break;
      for (const lines of [3, 2]) {
        let height = -APART.y;
        for (let start = 0; start < moments.length; start += columns) height += APART.y + Math.max(...moments.slice(start, start + columns).map((_, i) => tall(start + i, width, lines)));
        if (height <= high && (!best || width > best.width || (width === best.width && lines > best.lines))) best = { columns, width, lines };
      }
    }
    const fallback = Math.max(1, Math.min(moments.length, Math.floor((across + APART.x) / (SMALLEST + APART.x))));
    return best ?? { columns: fallback, width: Math.max(SMALLEST, Math.floor((across - (fallback - 1) * APART.x) / fallback)), lines: 2 };
  })();

  const note = ({ note, sent }: Said) => {
    const { words, fresh } = says(note, sent);
    return (
      <li key={note.id} className="flex gap-[7px]">
        {/* A dot means a note, in its colours everywhere. */}
        <i className={`mt-[5px] size-[7px] flex-none rounded-full shadow-[0_0_0_1.5px_#fff] ${sent ? "bg-slate" : "bg-amber"}`} />
        <span className="min-w-0">
          <span className={`${layout.lines === 3 ? "line-clamp-3" : "line-clamp-2"} text-[12.5px] leading-[17px] text-fg`}>{words}</span>
          {fresh && <span className="block text-[11.5px] leading-4 font-medium text-fg">answer not opened</span>}
        </span>
      </li>
    );
  };
  return (
    <div ref={own} className="absolute inset-0 overflow-y-auto rounded-lg bg-surface shadow-frame [scrollbar-width:thin]">
      {/* The whole of it centred in the frame's height, clear of the bar across its foot. */}
      <div className="flex min-h-full flex-col justify-center" style={{ padding: `${TOP}px ${SIDES}px ${FOOT}px` }}>
        {asked && (
          // What you asked, the thing you judge by, whole: as a block over the pictures, read from its left past two
          // lines. Past six, the rest on hover.
          <div ref={askedBox} className="mx-auto mb-6 w-full max-w-[60ch]" title={room.askedLines > 6 ? asked : undefined}>
            <p className={`text-[12.5px] leading-[17px] text-soft ${room.askedLines > 2 ? "" : "text-center"}`}>You asked</p>
            <p data-words className={`mt-1 line-clamp-6 text-[15px] leading-[22px] text-pretty text-fg ${room.askedLines > 2 ? "" : "text-center"}`}>
              {asked}
            </p>
          </div>
        )}
        <div className="flex flex-wrap justify-center" style={{ gap: `${APART.y}px ${APART.x}px`, opacity: room.width ? 1 : 0 }}>
          {moments.map((moment, i) => {
            const notes = on(moment.name);
            return (
              <div key={moment.name} className="min-w-0 flex-none" style={{ width: layout.width }}>
                <button onClick={() => props.onMoment(i + 1)} className="group/stop block w-full text-left focus-visible:outline-none" aria-label={moment.name}>
                  <span className="relative block aspect-[1.6] overflow-hidden rounded-lg bg-paper shadow-[0_0_0_1px_var(--edge),0_1px_3px_var(--edge)] transition-shadow duration-200 ease-calm group-hover/stop:shadow-[0_0_0_2px_var(--surface),0_0_0_3.5px_var(--faint)] group-focus-visible/stop:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--amber)]">
                    <StillPicture change={change} handBack={handBack} moment={moment} about={moment.about ?? moment.acted} />
                  </span>
                  {/* What happens, then as whom, as on its card on the edge. */}
                  <span className="mt-2 line-clamp-2 text-[12.5px] leading-[17px] text-fg">
                    {moment.name}
                    {moment.person && <span className="text-soft"> as {moment.person}</span>}
                  </span>
                  {props.unwatched.includes(i + 1) && <span className="block text-[11.5px] leading-4 text-soft">not watched</span>}
                </button>
                {notes.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {notes.slice(0, SHOWN).map(note)}
                    {notes.length > SHOWN && <li className="pl-[14px] text-[11.5px] leading-4 text-soft">+{notes.length - SHOWN} more</li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        {elsewhere.length > 0 && <ul className="mx-auto mt-6 flex w-full max-w-[60ch] flex-col gap-1.5 border-t border-line pt-4">{elsewhere.map(note)}</ul>}
      </div>
    </div>
  );
}
