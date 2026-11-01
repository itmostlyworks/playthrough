// The rounds, in the row under the recordings: one label naming the round you're watching by its number, the way you'd
// say it ("Round 4", "Round 2 → 4" while comparing, "Before"), the same width whichever it says. Clicking it grows it in
// place into a line with a dot for each round, reaching back over the controls beside it so the latest sits by where you
// clicked; pressing on it and moving sideways opens the line under your hand and flips rounds as if you'd taken hold of
// its handle. The recording flips with it, at the same moment. When the agent's next round is in, it says so.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import type { Round } from "@playthrough/review";
import { clamp } from "./moments.ts";
import { roll, type Part } from "./odometer.ts";

// A time of day as everything in the viewer says it, 19:08.
export const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

type Props = {
  rounds: Round[];
  watching: number;
  // Comparing: the round on the other side.
  earlier?: number;
  // A round that came in while you were on another one, until you go to it.
  arrived?: Round;
  // Since when the agent has been working on what was sent.
  working?: string;
  // Said in a line of words, as under the work's name: plain until you point at it, as wide as what it says.
  quiet?: boolean;
  onRound: (round: number) => void;
};

export const roundName = (round: number) => (round === 0 ? "Before" : `Round ${round}`);

// Past the sixth round back, each step is a little shorter and each dot a little smaller, like a phone's page dots, so
// any number of rounds fits; never closer than a quarter step, so the oldest can still be told apart.
const weight = (back: number) => (back <= 6 ? 1 : Math.max(0.25, Math.pow(0.82, back - 6)));

export function Rounds(props: Props) {
  const { rounds, watching, earlier } = props;
  const first = rounds[0]?.number ?? 0;
  const last = rounds.at(-1)?.number ?? 0;
  const latest = useRef(props);
  latest.current = props;
  const nav = useRef<HTMLElement>(null);
  const label = useRef<HTMLButtonElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(true);
  const [pointed, setPointed] = useState<number>();
  const x = useRef<Record<number, number>>({});
  const swallow = useRef(false);
  const comparing = earlier !== undefined;
  const say = props.arrived && !open ? "arrived" : props.working && !open ? "working" : "round";
  const many = last > first;

  const parts = (round: number, then?: number): Part[] => {
    if (then === undefined && round === 0) return [{ text: "Before", key: "word", word: true }];
    if (then === 0) return [{ text: "Before", key: "word", word: true }, { text: " → ", key: "to", soft: true }, { text: "Round ", key: "round" }, { text: String(round), key: "number" }];
    // The latest is just its name; an earlier one is said quieter, so the latest needs no "of 9".
    if (then === undefined) return [{ text: "Round", key: "word", word: true, soft: round !== last }, { text: " ", key: "gap", soft: true }, { text: String(round), key: "number", soft: round !== last }];
    return [{ text: "Round", key: "word", word: true }, { text: " ", key: "gap", soft: true }, { text: String(then), key: "then" }, { text: " → ", key: "to", soft: true }, { text: String(round), key: "number" }];
  };
  const saying: Part[] =
    say === "arrived" ? [{ text: roundName(props.arrived!.number), key: "word", word: true }, { text: " is in", key: "end", soft: true }]
    : say === "working" ? [{ text: roundName(last + 1), key: "word", word: true }, { text: " coming", key: "end", soft: true }]
    : parts(watching, earlier);
  const order = say === "arrived" ? 1e6 : say === "working" ? 1e6 - 1 : watching * 1000 + (comparing ? earlier + 1 : 0);
  const was = useRef(order);
  useLayoutEffect(() => {
    roll(label.current!, saying, order < was.current ? -1 : 1);
    was.current = order;
  });

  // One width, the widest it can say in this review, so nothing in the row moves as it changes.
  const measured = useRef("");
  useLayoutEffect(() => {
    if (props.quiet || measured.current === `${first}-${last}`) return;
    measured.current = `${first}-${last}`;
    label.current!.style.minWidth = `${widest(label.current!, rounds, parts)}px`;
  });

  // Where each round sits on the open line: the latest beside the label, older ones reaching away from it.
  const layout = () => {
    const line = track.current;
    if (!line) return;
    const width = line.clientWidth;
    let sum = 0;
    for (let back = 1; back <= last - first; back++) sum += weight(back);
    const step = sum ? width / sum : 0;
    let at = width;
    const placed: Record<number, number> = {};
    for (let back = 0; back <= last - first; back++) {
      if (back) at -= step * weight(back);
      placed[last - back] = left ? at : width - at;
    }
    x.current = placed;
  };

  // Open, it reaches back over speed and size, so nothing else in the row moves and the latest is under your hand. If the
  // row has wrapped with the label first on its line, it reaches forward over the views instead.
  useLayoutEffect(() => {
    const here = nav.current;
    if (!open || !here || !label.current) return;
    const row = here.parentElement!;
    const box = here.getBoundingClientRect();
    const speed = row.querySelector("[data-speed]")?.getBoundingClientRect();
    const views = row.querySelector("[data-views]")?.getBoundingClientRect();
    const back = !!speed && Math.abs(speed.top - box.top) < 8;
    if (back !== left) return setLeft(back);
    const labelWidth = label.current.offsetWidth + 4;
    const reach = (back ? box.right - speed!.left : views && Math.abs(views.top - box.top) < 8 ? views.right - box.left : box.width + 170) - labelWidth - 28;
    let sum = 0;
    for (let k = 1; k <= last - first; k++) sum += weight(k);
    const length = !many ? (here.querySelector<HTMLElement>("[data-none]")?.offsetWidth ?? 0) : clamp(sum * 24, 48, Math.max(48, reach));
    here.style.setProperty("--lw", `${labelWidth}px`);
    here.style.setProperty("--hw", `${labelWidth + 28 + length}px`);
    layout();
  });
  useLayoutEffect(() => {
    nav.current?.style.setProperty("--lw", `${(label.current?.offsetWidth ?? 0) + 4}px`);
    paintLine();
  });

  // With one round, there's no line of rounds to paint.
  const paintLine = () => {
    const line = track.current;
    if (!line || !many) return;
    if (!Object.keys(x.current).length) layout();
    for (const dot of line.querySelectorAll<HTMLElement>("[data-dot]")) {
      const round = Number(dot.dataset.dot);
      dot.style.left = `${x.current[round] ?? 0}px`;
      dot.style.setProperty("--s", (2 + 2 * Math.min(1, weight(last - round) * 1.25)).toFixed(2));
    }
    const ends = [x.current[first] ?? 0, x.current[last] ?? 0];
    Object.assign(line.querySelector<HTMLElement>("[data-rail]")!.style, { left: `${Math.min(...ends)}px`, width: `${Math.abs(ends[1]! - ends[0]!)}px` });
    const now = x.current[latest.current.watching] ?? 0;
    line.querySelector<HTMLElement>("[data-now]")!.style.left = `${now}px`;
    const then = x.current[latest.current.earlier ?? latest.current.watching - 1];
    if (then !== undefined) {
      line.querySelector<HTMLElement>("[data-then]")!.style.left = `${then}px`;
      Object.assign(line.querySelector<HTMLElement>("[data-pair]")!.style, { left: `${Math.min(then, now)}px`, width: `${Math.abs(now - then)}px` });
    }
  };

  // The nearest round to the pointer, since the dots crowd together towards the old end.
  const roundAt = (clientX: number) => {
    const at = clientX - track.current!.getBoundingClientRect().left;
    let best = last;
    for (let round = first; round <= last; round++) if (Math.abs((x.current[round] ?? 0) - at) < Math.abs((x.current[best] ?? 0) - at)) best = round;
    return best;
  };
  // Pointing along the line swells the dots nearest the pointer, like a dock, so even the crowded old end can be picked out.
  const magnify = (clientX?: number) => {
    const line = track.current;
    if (!line) return;
    const at = clientX === undefined ? undefined : clientX - line.getBoundingClientRect().left;
    for (const dot of line.querySelectorAll<HTMLElement>("[data-dot]"))
      dot.style.setProperty("--m", at === undefined ? "1" : (1 + 1.4 * Math.max(0, 1 - Math.abs((x.current[Number(dot.dataset.dot)] ?? 0) - at) / 26)).toFixed(3));
  };
  // The round pointed at is named just above, kept within the open line.
  useLayoutEffect(() => {
    const words = tip.current;
    const here = nav.current;
    if (!words || !here || pointed === undefined || !track.current) return;
    const box = here.getBoundingClientRect();
    const reach = parseFloat(getComputedStyle(here).getPropertyValue("--hw")) || box.width;
    const half = words.offsetWidth / 2;
    const low = left ? box.width - reach : 0;
    const at = track.current.getBoundingClientRect().left - box.left + (x.current[pointed] ?? 0);
    words.style.left = `${clamp(at, low + half, Math.max(low + half, low + reach - half))}px`;
  });

  const drag = (event: PointerEvent, onMove: (clientX: number) => void, onEnd: () => void) => {
    const id = event.pointerId;
    (event.target as Element).setPointerCapture?.(id);
    const move = (moving: globalThis.PointerEvent) => moving.pointerId === id && onMove(moving.clientX);
    const up = (ending: globalThis.PointerEvent) => {
      if (ending.pointerId !== id) return;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      onEnd();
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };

  // Pressing on the label and moving sideways opens the line under your hand and flips through the rounds from the one
  // you're on; letting go folds it again if the press opened it. A press that doesn't move is a click.
  const pressLabel = (event: PointerEvent) => {
    if (say !== "round" || !many || event.button !== 0) return;
    const start = event.clientX;
    const from = watching;
    const wasOpen = open;
    let live = false;
    drag(
      event,
      (clientX) => {
        if (!live && Math.abs(clientX - start) < 4) return;
        if (!live) {
          live = true;
          document.documentElement.classList.add("**:cursor-ew-resize!");
          flushSync(() => setOpen(true));
        }
        const at = track.current!.getBoundingClientRect().left + (x.current[from] ?? 0) + clientX - start;
        magnify(at);
        const round = roundAt(at);
        if (round !== latest.current.watching) latest.current.onRound(round);
        setPointed(round);
      },
      () => {
        if (!live) return;
        document.documentElement.classList.remove("**:cursor-ew-resize!");
        swallow.current = true;
        setTimeout(() => (swallow.current = false));
        setOpen(wasOpen);
        setPointed(undefined);
        magnify();
      },
    );
  };
  const clickLabel = () => {
    if (swallow.current) return;
    if (say === "arrived") return props.onRound(props.arrived!.number);
    setOpen(!open);
    setPointed(undefined);
  };

  // Pressing on the line goes to that round, and dragging flips through them.
  const pressLine = (event: PointerEvent) => {
    if (!many || event.button !== 0) return;
    const go = (clientX: number) => {
      const round = roundAt(clientX);
      if (round !== latest.current.watching) latest.current.onRound(round);
    };
    go(event.clientX);
    drag(event, go, () => {
      if (latest.current.watching === last) {
        setOpen(false);
        setPointed(undefined);
      }
    });
  };

  // A sideways swipe on a trackpad steps a round per 30px, the way the line scrolls, opening it while you swipe and
  // folding it a moment after you stop if the swipe opened it.
  const swipe = useRef({ by: 0, opened: false, fold: 0 });
  useEffect(() => {
    const here = nav.current;
    const wheel = (event: WheelEvent) => {
      const { watching } = latest.current;
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || !many || say !== "round") return;
      event.preventDefault();
      const kept = swipe.current;
      if (!open) {
        flushSync(() => setOpen(true));
        kept.opened = true;
        kept.by = 0;
      }
      kept.by += event.deltaX;
      if (Math.abs(kept.by) >= 30) {
        const newer = Math.sign((x.current[last] ?? 0) - (x.current[first] ?? 0)) * Math.sign(kept.by);
        kept.by = 0;
        const round = clamp(watching + newer, first, last);
        if (round !== watching) latest.current.onRound(round);
      }
      clearTimeout(kept.fold);
      kept.fold = window.setTimeout(() => {
        if (kept.opened) setOpen(false);
        kept.opened = false;
        kept.by = 0;
      }, 900);
    };
    here?.addEventListener("wheel", wheel, { passive: false });
    return () => here?.removeEventListener("wheel", wheel);
  });

  // Escape or a click elsewhere folds it.
  useEffect(() => {
    if (!open) return;
    const away = (event: globalThis.PointerEvent) => !nav.current?.contains(event.target as Node) && setOpen(false);
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setPointed(undefined);
      label.current?.focus();
    };
    addEventListener("pointerdown", away);
    addEventListener("keydown", escape, true);
    return () => {
      removeEventListener("pointerdown", away);
      removeEventListener("keydown", escape, true);
    };
  }, [open]);

  const step = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const round = clamp(watching + (event.key === "ArrowRight" ? 1 : -1), first, last);
    if (round !== watching) props.onRound(round);
  };

  const when = (round: Round) => {
    const at = new Date(round.finished ?? 0);
    return `${at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  };
  const named = pointed === undefined ? undefined : rounds.find((round) => round.number === pointed);
  const tipLook = "pointer-events-none absolute bottom-[calc(100%+3px)] z-7 max-w-[380px] -translate-x-1/2 truncate rounded-[5px] bg-surface px-[7px] py-px text-[11px] leading-[14px] whitespace-nowrap text-soft shadow-tip transition-[opacity,translate] duration-150 ease-calm";
  const hidden = "translate-y-[2px] opacity-0";
  const side = open ? (left ? "left" : "right") : undefined;

  return (
    <nav ref={nav} data-open={side} aria-label="Rounds" className={`group/rounds relative flex h-[calc(1.5em+10px)] items-center gap-3 rounded-lg ${props.quiet ? "" : "bg-hover px-0.5"}`}>
      <button
        ref={label}
        aria-expanded={open}
        aria-label={say === "arrived" ? "The agent's next round is in" : say === "working" ? `The agent started at ${clock(props.working!)}` : "Rounds"}
        data-say={say}
        className={`relative z-6 touch-pan-y rounded-md px-2.5 py-[3px] text-center whitespace-nowrap tabular-nums transition-colors duration-150 ease-calm ${props.quiet ? "text-fg hover:bg-hover aria-expanded:bg-surface aria-expanded:shadow-[0_0_0_1px_var(--line)]" : "text-fg hover:bg-surface hover:shadow-[0_0_0_1px_var(--line)] aria-expanded:bg-surface aria-expanded:shadow-[0_0_0_1px_var(--line)]"} ${say === "round" && many ? "cursor-ew-resize" : ""} data-[say=arrived]:before:mr-1.5 data-[say=arrived]:before:mb-px data-[say=arrived]:before:inline-block data-[say=arrived]:before:size-1.5 data-[say=arrived]:before:rounded-full data-[say=arrived]:before:bg-amber data-[say=arrived]:before:align-middle data-[say=working]:before:mt-[calc(.5lh-3px)] data-[say=working]:before:mr-1.5 data-[say=working]:before:inline-block data-[say=working]:before:size-1.5 data-[say=working]:before:animate-breathe data-[say=working]:before:rounded-full data-[say=working]:before:bg-slate data-[say=working]:before:align-top`}
        onPointerDown={pressLabel}
        onClick={clickLabel}
        onKeyDown={step}
      />
      {/* Open, the label unfolds in place into the line: the row's own grey, made solid so nothing shows through. */}
      <div
        className={`absolute top-0 bottom-0 z-5 w-[var(--hw,100%)] rounded-lg [background:linear-gradient(var(--hover),var(--hover)),var(--ground)] ${left ? "right-0 [clip-path:inset(0_0_0_calc(100%_-_var(--lw,0px))_round_8px)]" : "left-0 [clip-path:inset(0_calc(100%_-_var(--lw,0px))_0_0_round_8px)]"} invisible transition-[clip-path,visibility] duration-[280ms,0s] delay-[0s,280ms] ease-calm group-data-open/rounds:visible group-data-open/rounds:[clip-path:inset(0_0_0_0_round_8px)] group-data-open/rounds:delay-0`}
      >
        <div
          ref={track}
          role="slider"
          tabIndex={open ? 0 : -1}
          aria-label="Rounds"
          aria-valuemin={first}
          aria-valuemax={last}
          aria-valuenow={watching}
          aria-valuetext={roundName(watching) + (comparing ? `, against ${roundName(earlier)}` : "")}
          className={`absolute top-0 bottom-0 touch-none *:absolute *:top-1/2 ${left ? "right-[calc(var(--lw,0px)+12px)] left-4" : "right-4 left-[calc(var(--lw,0px)+12px)]"} ${many ? "cursor-pointer" : "cursor-default"}`}
          onPointerDown={pressLine}
          onPointerMove={(event) => {
            if (!many) return;
            magnify(event.clientX);
            setPointed(roundAt(event.clientX));
          }}
          onPointerLeave={() => {
            magnify();
            setPointed(undefined);
          }}
          onKeyDown={step}
        >
          {many && <div data-rail className="-mt-px h-0.5 rounded-full bg-line" />}
          {many &&
            rounds.map((round) => (
              <i
                key={round.number}
                data-dot={round.number}
                style={{ "--i": last - round.number } as CSSProperties}
                className={`-mt-[calc(var(--s,4)*.5px)] -ml-[calc(var(--s,4)*.5px)] size-[calc(var(--s,4)*1px)] rounded-full opacity-0 transition-[opacity,scale,background-color] duration-[150ms,120ms,150ms] ease-calm group-data-open/rounds:opacity-100 group-data-open/rounds:delay-[calc(var(--i,0)*22ms+60ms),0s,0s] ${pointed === round.number ? "bg-fg [scale:max(var(--m,1),1.75)]" : "bg-faint [scale:var(--m,1)]"}`}
              />
            ))}
          {many && <div data-pair className={`-mt-px h-0.5 bg-fg transition-[left,width,opacity] duration-200 ease-calm ${comparing ? "opacity-100" : "opacity-0"}`} />}
          {many && <i data-then className={`-mt-[4.5px] -ml-[4.5px] size-[9px] rounded-full bg-ground shadow-[inset_0_0_0_2px_var(--fg)] transition-[left,opacity] duration-200 ease-calm ${comparing ? "opacity-100" : "opacity-0"}`} />}
          {many && <i data-now className="-mt-[4.5px] -ml-[4.5px] size-[9px] rounded-full bg-fg shadow-[0_0_0_2px_var(--ground)] transition-[left] duration-200 ease-calm" />}
          {!many && (
            <span data-none className={`${left ? "right-0" : "left-0"} -translate-y-1/2 text-xs whitespace-nowrap text-faint opacity-0 transition-opacity duration-150 ease-calm group-data-open/rounds:opacity-100 group-data-open/rounds:delay-100`}>
              Nothing earlier yet
            </span>
          )}
        </div>
      </div>
      <span ref={tip} aria-hidden className={`${tipLook} ${named && open ? "opacity-100" : hidden}`}>
        {named && <b className="mr-1.5 font-medium text-fg">{named.number === 0 ? "Before" : `${roundName(named.number)} · ${when(named)}`}</b>}
      </span>
      {say !== "round" && (
        <span aria-hidden className={`${tipLook} ${hidden} left-[calc(var(--lw,0px)/2)] group-has-[[data-say]:hover]/rounds:translate-y-0 group-has-[[data-say]:hover]/rounds:opacity-100`}>
          {say === "arrived" ? `${roundName(props.arrived!.number)} came in at ${clock(props.arrived!.finished ?? "")}` : `The agent started at ${clock(props.working!)}`}
        </span>
      )}
    </nav>
  );
}

// The widest the label can say in this review: every round alone and against each one before it, the agent at work, and
// a round coming in.
function widest(label: HTMLElement, rounds: Round[], parts: (round: number, then?: number) => Part[]): number {
  const style = getComputedStyle(label);
  const context = document.createElement("canvas").getContext("2d")!;
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const width = (said: string) => context.measureText(said).width;
  const text = (said: Part[]) => said.map((part) => part.text).join("");
  const last = rounds.at(-1)?.number ?? 0;
  let most = width(`${roundName(last + 1)} coming`) + 12;
  most = Math.max(most, width(`${roundName(last + 1)} is in`) + 12);
  for (const round of rounds) {
    most = Math.max(most, width(text(parts(round.number))));
    for (const then of rounds) if (then.number < round.number) most = Math.max(most, width(text(parts(round.number, then.number))));
  }
  return Math.max(96, Math.ceil(most + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 4));
}
