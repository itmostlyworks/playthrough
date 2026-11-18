// A note on a moment: where it's shown, its strip on the edge, its words, and its card by its thing, written or open.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { Turn, Note, Change } from "@playthrough/change";
import { noteFrame, picture, readings as readingsOf, type NoteFrame } from "./api.ts";
import { clamp } from "./clamp.ts";
import { TILE } from "./Edge.tsx";
import { mayTakeKeys } from "./inside.ts";
import { Key } from "./Key.tsx";
import { BAR } from "./MomentBar.tsx";
import { Picture, type Box, type Crop } from "./Picture.tsx";
import type { Rect } from "./replay.ts";

// A note and what's been said on it since, by its pin, a turn each, as the page's cards say them: who speaks on a small
// line of its own, you by your dot, the agent by its name, and the words under it as readable as the note's. What the
// note was on when it was written, where that's to be shown, comes with it, over its words.
export function Turns({ you, turns, unsent, was }: { you: string; turns: Turn[]; unsent?: string; was?: ReactNode }) {
  const all = [
    ...turns.map((turn) => ({ mine: !turn.agent && turn.by === you, by: turn.agent || turn.by !== you ? turn.by : "You", words: turn.words, sent: true })),
    ...(unsent ? [{ mine: true, by: "You", words: unsent, sent: false }] : []),
  ];
  return (
    <div className="grid gap-2">
      {all.map((turn, i) => (
        <div key={i} className="grid gap-px">
          <span className="flex items-center gap-1.5 text-[11.5px] leading-4 text-soft">
            {turn.mine && <i className={`size-1.5 rounded-full ${turn.sent ? "bg-slate" : "bg-amber"}`} />}
            {turn.by}
            {!turn.sent && <span>· not sent</span>}
          </span>
          {i === 0 && was}
          <p className="text-[13px] leading-5 whitespace-pre-wrap text-fg">{turn.words}</p>
        </div>
      ))}
    </div>
  );
}

// A note's thing as it was when the note was written, small and quiet in its card: the thing with a little air, drawn
// as large as the recording beside it draws things (`drawn`, the recording's scale), so the two read as the same thing,
// but never taller than a line or two of words, nor wider than the card. Its room is known before its picture comes,
// so the card holds still.
const [AIR, TALL, WIDE] = [8, 64, 256];
export function NoteWas({ src, screen, box, drawn }: { src: string; screen: { width: number; height: number }; box: Box; drawn: number }) {
  // The air is the card's, so it's the same on screen however the recording is drawn.
  const air = AIR / drawn;
  const [x, y] = [Math.max(0, box.x - air), Math.max(0, box.y - air)];
  const [width, height] = [Math.min(screen.width, box.x + box.width + air) - x, Math.min(screen.height, box.y + box.height + air) - y];
  const scale = Math.min(drawn, TALL / height, WIDE / width);
  return (
    <span data-part="note-was" className="relative my-1 block overflow-hidden rounded-[5px] bg-paper shadow-[0_0_0_1px_var(--edge)]" style={{ width: width * scale, maxWidth: "100%", aspectRatio: `${width} / ${height}` }}>
      <Picture shot={{ src, crop: { x: x / screen.width, y: y / screen.height, width: width / screen.width, height: height / screen.height } }} />
    </span>
  );
}

// Where a note was made: the recording it was made on (a taking of the moment, or yours, stepped in), the moment in it,
// and its thing there, by that recording's own numbering, or its spot.
export type Made = { handBack: number; recording: string; at: number; node?: number; point?: { x: number; y: number } };

// Each note's kept picture, by its id: the frame it was made on. One made at the end of a taking is that taking's own
// picture, there at once; any other, drawn once by `playthrough open` (frames.ts) and kept.
export function useFrames(change: Change, notes: { note: Note; shown?: Made }[]): Record<string, NoteFrame | undefined> {
  const [frames, setFrames] = useState<Record<string, NoteFrame | undefined>>({});
  // Each by where it's shown: a note shown as it is now, once the agent hands the moment back without its thing, is
  // shown where it was made, and asked for again.
  const asked = useRef(new Map<string, string>());
  const keyOf = (shown: Made) => `${shown.handBack} ${shown.recording} ${shown.at} ${shown.node ?? ""}`;
  const wanted = notes.filter(({ note, shown }) => shown && asked.current.get(note.id) !== keyOf(shown));
  useEffect(() => {
    for (const { note, shown: made } of wanted) {
      if (!made) continue;
      asked.current.set(note.id, keyOf(made));
      const taking = change.handBacks.find((one) => one.number === made.handBack)?.moments.find((one) => one.recording === made.recording);
      const kept = (frame: NoteFrame | undefined) => frame && asked.current.get(note.id) === keyOf(made) && setFrames((all) => ({ ...all, [note.id]: frame }));
      if (taking && Math.abs(made.at - taking.length) < 0.1)
        void readingsOf(change.id, made.handBack, made.recording).then((read) => {
          const end = read.at(-1);
          if (!end) return;
          const found = made.node !== undefined ? end.things.find((one) => one.node === made.node) : undefined;
          const { width, height } = end.screen;
          const share = (one: { x: number; y: number; width: number; height: number }) => ({ x: one.x / width, y: one.y / height, width: one.width / width, height: one.height / height });
          const box = found ? share(found.box) : made.point && { ...made.point, width: 0, height: 0 };
          // A line of words is laid out across its whole column: its words are as wide as they are, as near as can be
          // told, which is what its strip shows and its pin stands clear of.
          const said = found?.words && /^(text|heading)$/.test(found.role) && share({ ...found.box, width: Math.min(found.box.width, found.words.length * parseFloat(found.look.size) * 0.55) });
          kept({ src: picture(change.id, made.handBack, made.recording, 0), screen: end.screen, ...(box && { box }), ...(said && { words: said }) });
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
      <span className={`block text-[11.5px] leading-4 ${fresh ? "font-medium text-fg" : "text-soft"}`}>{stands}</span>
    </>
  );
}

// A note's strip on the edge: its frame, cut for the strip's own shape around the thing it's on, so that thing is what
// you see. The thing whole where it can be, a little of what's around it, never drawn larger than it was recorded nor
// much smaller, where its words stop being read; toward the recording, as the screen's edge fades the other side at
// rest. Its dot isn't on it: that leads the note's words.
export function NotePicture({ frame, focus }: { frame?: NoteFrame; focus?: NoteFrame["box"] }) {
  // As wide as it's drawn, so a strip drawn wider than its part shows more of the page round it rather than magnify it.
  const own = useRef<HTMLSpanElement>(null);
  const [drawn, setDrawn] = useState(0);
  useLayoutEffect(() => {
    const strip = own.current;
    if (!strip) return;
    const measure = () => setDrawn(strip.clientWidth);
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(strip);
    return () => watching.disconnect();
  }, [!frame]);
  if (!frame) return null;
  const { screen } = frame;
  const box = frame.words ?? frame.box;
  const px = (one?: NoteFrame["box"]) => one && { x: one.x * screen.width, y: one.y * screen.height, width: one.width * screen.width, height: one.height * screen.height };
  const [thing, about] = [px(box), px(focus)];
  // On something too large to show whole at a size that reads, a note is most likely about what its moment is about,
  // where that's inside it: the strip closes in on that, as on any small thing. A note keeps what it's on, not where
  // in it you pointed.
  const inside = !!thing && !!about && about.x >= thing.x && about.y >= thing.y && about.x + about.width <= thing.x + thing.width && about.y + about.height <= thing.y + thing.height;
  const part = stripOf(screen, thing && about && inside && tooLarge(thing) ? about : thing, drawn);
  return (
    <span ref={own} className="absolute inset-0 animate-arrive">
      <Picture shot={{ src: frame.src, crop: part }} />
    </span>
  );
}

// The part of a note's frame its strip shows, in shares of the screen, this wide for its height:
// - a small thing (a switch, a button) at the size it was recorded, with what's beside it, as its label;
// - a wide line (a heading, a field), from its start, at most a little smaller than it was recorded, so it reads;
// - something far larger than the strip (a pane, a list), its top left, at that readable size, not all of it shrunk;
// - a spot with no thing, around the spot at the size it was recorded;
// - all of it inside the screen, so a thing at the screen's edge sits at the strip's;
// - and at the same size wherever it's drawn: a strip wider than the edge's (a card at the last stop) shows as much more
//   of the page round the same middle, never the same part larger.
const STRIP = 3.8;
// The strip on the edge: a picture's width there, less the strip's inset.
const ON_THE_EDGE = TILE - 2 * 8;

// Too large to show whole in a strip at a size that reads.
const tooLarge = (thing: { width: number; height: number }) => thing.width + 40 > TILE * 1.6 || (thing.height + 16) * STRIP > TILE * 1.6;

function stripOf(screen: { width: number; height: number }, thing: { x: number; y: number; width: number; height: number } | undefined, drawn: number): Crop {
  const [narrowest, widest, around] = [TILE, TILE * 1.6, 20];
  const spot = !thing || (!thing.width && !thing.height);
  let width = spot ? narrowest * 1.5 : Math.min(widest, Math.max(narrowest, thing.width + 2 * around, (thing.height + 16) * STRIP));
  width = Math.min(width, screen.width, screen.height * STRIP);
  let height = width / STRIP;
  const [middle, centre] = thing ? [thing.x + thing.width / 2, thing.y + thing.height / 2] : [screen.width / 2, screen.height / 2];
  // Toward the recording: its middle two fifths in, kept whole where it fits.
  let x = spot || thing.width + 2 * around <= width ? Math.min(Math.max(middle - width * 0.4, (thing?.x ?? middle) + (thing?.width ?? 0) + 8 - width), (thing?.x ?? middle) - 8) : thing.x - around;
  let y = spot || thing.height + 16 <= height ? centre - height / 2 : thing.y - 8;
  const wider = Math.min((width * drawn) / ON_THE_EDGE, screen.width, screen.height * STRIP);
  if (wider > width) {
    [x, y] = [x + width / 2 - wider / 2, y + height / 2 - wider / STRIP / 2];
    [width, height] = [wider, wider / STRIP];
  }
  return {
    x: clamp(x, 0, screen.width - width) / screen.width,
    y: clamp(y, 0, screen.height - height) / screen.height,
    width: width / screen.width,
    height: height / screen.height,
  };
}

// A note's card by its thing: beside it where there's room, else under or over it, never on it, nor past the recording's edge.
// Under: in the page's flow, as wide as it is, as on a phone.
// Easing, it goes to where it's placed next over that time and curve, as its thing's outline does.
export function NoteCard({ by, stage, closing, under, easing, children }: { by: Rect; stage: React.RefObject<HTMLDivElement | null>; closing?: boolean; under?: boolean; easing?: string; children: ReactNode }) {
  const own = useRef<HTMLDivElement>(null);
  // Its own height, as it grows with its words, so it's always placed whole; and the height it came in at, which it's
  // placed by, growing from there upward, so its foot holds still: Save, and the line being typed, stay under the hand.
  const [tall, setTall] = useState(140);
  const first = useRef(0);
  useLayoutEffect(() => {
    const card = own.current;
    if (!card || under) return;
    first.current = card.offsetHeight;
    setTall(card.offsetHeight);
    // Placed again in the same frame it grew in, so it's never seen grown the wrong way first.
    const measure = () => flushSync(() => setTall(card.offsetHeight));
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
  const came = first.current || tall;
  const within = (top: number, height: number) => Math.min(Math.max(edge, top), foot - height);
  const fits = (top: number) => top >= edge && top + came <= foot;
  const [left, top, upward]: [number, number, boolean] =
    by.width && right + pastPin + width <= wide - edge
      ? [right + pastPin, within(by.top - 12, came), true]
      : by.width && by.left - gap - width >= edge
        ? [by.left - gap - width, within(by.top - 12, came), true]
        : // Too wide to stand beside, or a spot on a line: under it, growing down so it stays off it, else over it; a
          // thing taller than there's room around, inside it near its top.
          [
            Math.min(Math.max(edge, by.left - (by.width ? 0 : 24)), wide - width - edge),
            fits(bottom + gap) ? bottom + gap : fits(by.top - gap - came) ? by.top - gap - came : within(by.top + 12, came),
            !fits(bottom + gap),
          ];
  // Grown, where there's no room above, against the recording's top, it grows down instead, as at its foot it grows up.
  const place = { left, top: within(upward ? top - (tall - came) : top, tall) };
  return (
    <div
      ref={own}
      data-note-card
      data-part="note-card"
      className={`${under ? "relative" : "absolute z-40"} flex animate-arrive flex-col rounded-xl bg-surface p-2 shadow-float transition-opacity duration-300 ease-calm ${closing ? "pointer-events-none opacity-0" : ""}`}
      style={under ? undefined : { ...place, width, maxHeight: foot - edge, ...(easing && { transition: `left ${easing}, top ${easing}` }) }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

// Writing a note: Enter saves it, with Ctrl or ⌘ too, Shift+Enter is a new line, Escape lets it go.
// A reply waits to be clicked into, so the keys stay the page's while a note is open (← → go on through the notes).
// Enter and Escape stop here: the page hears a key after the save has closed the field, and Ctrl+Enter there sends.
export function Write({ onSave, onDrop, placeholder = "What's right or wrong here?", rows = 3, start = "", focus = true }: { onSave: (words: string) => void; onDrop: () => void; placeholder?: string; rows?: number; start?: string; focus?: boolean }) {
  const [words, setWords] = useState(start);
  return (
    <div>
      <textarea
        ref={(area) => void (focus && area && !area.dataset.focused && mayTakeKeys() && ((area.dataset.focused = "1"), area.focus({ preventScroll: true })))}
        rows={rows}
        value={words}
        placeholder={placeholder}
        className="block max-h-[min(40vh,240px)] min-h-[60px] w-full resize-none rounded-lg bg-transparent px-1 py-0.5 text-[13px] leading-5 text-fg outline-none [field-sizing:content] placeholder:text-faint"
        onChange={(event) => setWords(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") return (event.stopPropagation(), onDrop());
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            if (words.trim()) onSave(words.trim());
          }
        }}
      />
      <div className="mt-1 flex items-center justify-end gap-1 text-xs">
        <button className="rounded-md px-2 py-1 text-soft hover:bg-hover hover:text-fg" onClick={onDrop}>
          Cancel
        </button>
        <button className="rounded-md px-2 py-1 font-medium text-fg enabled:hover:bg-hover disabled:opacity-50" disabled={!words.trim()} onClick={() => onSave(words.trim())}>
          Save <Key>↵</Key>
        </button>
      </div>
    </div>
  );
}
