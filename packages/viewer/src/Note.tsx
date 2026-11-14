// A note on a moment: where it's shown, its strip on the edge, its words, and its card by its thing, written or open.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Turn, Note, Change } from "@playthrough/change";
import { noteFrame, picture, readings as readingsOf, type NoteFrame } from "./api.ts";
import { clamp } from "./clamp.ts";
import { TILE } from "./Edge.tsx";
import { Key } from "./Key.tsx";
import { BAR } from "./MomentBar.tsx";
import { Picture, type Crop } from "./Picture.tsx";
import type { Rect } from "./replay.ts";

// A note and what's been said on it since, by its pin, a turn each, as the page's cards say them: who speaks on a small
// line of its own, you by your dot, the agent by its name, and the words under it as readable as the note's.
export function Turns({ you, turns, unsent }: { you: string; turns: Turn[]; unsent?: string }) {
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

// Where a note was made: the recording it was made on (a taking of the moment, or yours, stepped in), the moment in it,
// and its thing there, by that recording's own numbering, or its spot.
export type Made = { round: number; recording: string; at: number; node?: number; point?: { x: number; y: number } };

// Each note's kept picture, by its id: the frame it was made on. One made at the end of a taking is that taking's own
// picture, there at once; any other, drawn once by `playthrough open` (frames.ts) and kept.
export function useFrames(change: Change, notes: { note: Note; shown?: Made }[]): Record<string, NoteFrame | undefined> {
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
      const taking = change.rounds.find((one) => one.number === made.round)?.scenes.find((one) => one.recording === made.recording);
      const kept = (frame: NoteFrame | undefined) => frame && asked.current.get(note.id) === keyOf(made) && setFrames((all) => ({ ...all, [note.id]: frame }));
      if (taking && Math.abs(made.at - taking.length) < 0.1)
        void readingsOf(change.id, made.round, made.recording).then((read) => {
          const end = read.at(-1);
          if (!end) return;
          const found = made.node !== undefined ? end.things.find((one) => one.node === made.node) : undefined;
          const { width, height } = end.screen;
          const share = (one: { x: number; y: number; width: number; height: number }) => ({ x: one.x / width, y: one.y / height, width: one.width / width, height: one.height / height });
          const box = found ? share(found.box) : made.point && { ...made.point, width: 0, height: 0 };
          // A line of words is laid out across its whole column: its words are as wide as they are, as near as can be
          // told, which is what its strip shows and its pin stands clear of.
          const said = found?.words && /^(text|heading)$/.test(found.role) && share({ ...found.box, width: Math.min(found.box.width, found.words.length * parseFloat(found.look.size) * 0.55) });
          kept({ src: picture(change.id, made.round, made.recording, Math.max(0, taking.steps.length - 1)), screen: end.screen, ...(box && { box }), ...(said && { words: said }) });
        });
      else void noteFrame(change.id, note.id, made).then(kept);
    }
  }, [wanted.map(({ note, shown }) => `${note.id}:${shown && keyOf(shown)}`).join(" ")]);
  return frames;
}

// A note's words, as its picture on the edge says them and its pin does pointed at.
// Under its strip on the edge, two lines; by its pin, three.
export function NoteWords({ words, stands, fresh, short }: { words: string; stands: string; fresh: boolean; short?: boolean }) {
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
export function NotePicture({ frame, sent, focus }: { frame?: NoteFrame; sent: boolean; focus?: NoteFrame["box"] }) {
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
      <Picture shot={{ src: frame.src, crop: part }} />
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

function stripOf(screen: { width: number; height: number }, thing?: { x: number; y: number; width: number; height: number }): Crop {
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

// A note's card by its thing: beside it where there's room, else under or over it, never on it, nor past the recording's edge.
// Under: in the page's flow, as wide as it is, as on a phone.
export function NoteCard({ by, stage, closing, under, children }: { by: Rect; stage: React.RefObject<HTMLDivElement | null>; closing?: boolean; under?: boolean; children: ReactNode }) {
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
  const [wide, high] = [stage.current?.clientWidth ?? 0, stage.current?.clientHeight ?? 0];
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
export function Write({ onSave, onDrop, placeholder = "What's right or wrong here?", rows = 3, start = "", focus = true }: { onSave: (words: string) => void; onDrop: () => void; placeholder?: string; rows?: number; start?: string; focus?: boolean }) {
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
