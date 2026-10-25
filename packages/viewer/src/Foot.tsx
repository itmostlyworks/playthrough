// The foot is where you act: one step, worked out from where the playhead is, and Send beside it while there's
// something to send. Under it the meter, a piece for each flow, green from the left as each looks good to you.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { justLanded, type Landed } from "./Column.tsx";
import { Key, mac, useHold } from "./Card.tsx";
import type { Standing } from "./notes.ts";

// A button takes the step, as Enter does, or Ctrl+Enter for what can't be undone. Otherwise the foot only says where
// things stand: what's playing, where the flow's question is, what the agent is doing, or that it's done.
export type Step =
  | { kind: "go"; words: string; what?: string; take: () => void; send?: boolean; final?: boolean }
  | { kind: "say"; words: string; what?: string }
  | { kind: "agent"; words: string; what?: string; busy: boolean }
  | { kind: "done"; words: string; just: boolean };

export type Piece = { flow: string; standing: Standing; here: boolean };

type Props = {
  step: Step;
  // With a note or a change open, its row has the way on: the foot keeps its place and Send, and says nothing.
  quiet: boolean;
  // How many of what you've said are notes for the agent, and whether there's anything to send at all.
  notes: number;
  onSend?: () => void;
  // When you last sent, so sending ends where you pressed it.
  sent?: number;
  trouble: string[];
  // Looking back, there's nothing to decide.
  pieces?: Piece[];
  landed?: Landed;
  // The agent is working: its pieces breathe.
  busy: boolean;
  onFlow: (flow: string) => void;
};

export function Foot(props: Props) {
  const { step } = props;
  const [, again] = useState(0);
  const since = props.sent === undefined ? Infinity : performance.now() - props.sent;
  useEffect(() => {
    if (since > 4000) return;
    const later = setTimeout(() => again((n) => n + 1), Math.max(0, (since < 2400 ? 2400 : 4000) - since));
    return () => clearTimeout(later);
  });
  const buttons = useRef<HTMLDivElement>(null);
  const held = useHold(props.quiet ? "" : step.kind === "go" ? `${step.words} ${step.what}` : "", buttons);

  const stack = (ring: string) =>
    props.notes > 0 && (
      <span className="flex items-center" aria-hidden>
        {Array.from({ length: Math.min(3, props.notes) }, (_, i) => (
          <span key={i} className={`relative size-2.5 rounded-full bg-[color-mix(in_srgb,var(--slate)_50%,var(--line))] ${ring} ${i ? "-ml-[3px]" : ""}`} style={{ zIndex: 3 - i }} />
        ))}
      </span>
    );
  const words = (words: string, what?: string, quiet?: boolean) => (
    <>
      <span className="flex-none">{words}</span>
      {what && <span className="flex-none text-faint">·</span>}
      {what && <b className={`min-w-0 truncate ${quiet ? "font-medium text-fg" : "font-medium"}`}>{what}</b>}
    </>
  );

  let shown;
  if (props.quiet) shown = <span className="min-w-0 flex-1" />;
  else if (step.kind === "go")
    shown = (
      <button
        className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-hover px-3 text-xs leading-4 text-fg shadow-[inset_0_0_0_1px_var(--line)] transition-colors duration-150 ease-calm"
        aria-keyshortcuts={step.final ? "Control+Enter" : "Enter"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={step.take}
      >
        {step.send && stack("shadow-[0_0_0_1.5px_var(--ground)]")}
        {words(step.words, step.what)}
        <Key className="ml-auto">{step.final ? `${mac ? "⌘" : "Ctrl"} ↵` : "↵"}</Key>
      </button>
    );
  else if (step.kind === "agent" && since < 2400) shown = <Sent words="Sent to the agent" className="flex-1" />;
  else if (step.kind === "agent")
    shown = (
      <p key={step.words} className="flex h-8 min-w-0 flex-1 animate-arrive items-center gap-1.5 text-xs font-medium whitespace-nowrap text-fg" role="status">
        <i className={`mr-0.5 size-1.5 flex-none rounded-full bg-slate ${step.busy ? "animate-breathe" : "opacity-45"}`} aria-hidden />
        <span className="flex-none">{step.words}</span>
        {step.what && <span className="flex-none font-normal text-faint">·</span>}
        {step.what && <span className="min-w-0 truncate font-normal text-soft">{step.what}</span>}
      </p>
    );
  else if (step.kind === "done") shown = <Sent words={step.words} done just={step.just} className="flex-1" />;
  else shown = <p className="flex h-8 min-w-0 flex-1 items-center gap-1.5 truncate text-xs leading-4 text-soft">{words(step.words, step.what, true)}</p>;

  return (
    <div className="flex-none px-[18px] pt-3">
      {props.trouble.length > 0 && <p className="mb-2 text-xs leading-[18px] text-amber-ink">{props.trouble.join(" ")}</p>}
      <div ref={buttons} className={`flex min-h-8 items-center gap-2 transition-opacity duration-150 ease-calm ${held ? "pointer-events-none opacity-45" : ""}`}>
        {shown}
        {props.onSend && !(step.kind === "go" && step.send) ? (
          <button
            className="flex h-8 flex-none items-center gap-2 rounded-lg bg-fg pr-3.5 pl-3 text-[12.5px] font-semibold text-ground transition-opacity duration-150 ease-calm hover:opacity-88"
            aria-label={props.notes ? `Send ${props.notes} ${props.notes === 1 ? "note" : "notes"} to the agent` : "Send what you said"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={props.onSend}
          >
            {stack("shadow-[0_0_0_1.5px_var(--fg)]")}
            Send
          </button>
        ) : (
          (step.kind === "go" || step.kind === "say") && since < 4000 && <Sent words="Sent" />
        )}
      </div>
      {props.pieces ? <Meter {...props} pieces={props.pieces} /> : <p className="pt-3.5 text-xs leading-4 text-faint">Looking back. Nothing to decide here.</p>}
    </div>
  );
}

// Said where you pressed it: sent, in the agent's slate, or accepted, in the good green, its tick growing in.
function Sent({ words, done, just = true, className = "" }: { words: string; done?: boolean; just?: boolean; className?: string }) {
  return (
    <span className={`flex h-8 flex-none animate-arrive items-center gap-1.5 px-0.5 text-[12.5px] font-semibold ${done ? "text-green" : "text-slate"} ${className}`} role="status">
      <svg viewBox="0 0 12 12" className={`size-[13px] ${just ? "animate-tick" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M2.8 6.2l2.2 2.2 4.2-4.6" />
      </svg>
      {words}
    </span>
  );
}

const RANK: Record<Standing["is"], number> = { good: 0, "with the agent": 1, "to send": 2, "not saved": 3, "needs you": 3, "is it good": 3, "looked good": 3, "to watch": 3 };

// Hairlines under the step, a piece for each flow: the good ones green from the left, the newest at the end, then the
// agent's, then the ones that still need you; the flow you're in darker. Pointing at a piece names its flow, and a click
// plays it. The last one good closes the gaps into one line.
function Meter({ pieces, landed, busy, onFlow }: Props & { pieces: Piece[] }) {
  const meter = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ words: string; x: number; side: "left" | "middle" | "right" }>();
  const sorted = pieces
    .map((piece, i) => ({ ...piece, i, just: piece.standing.is === "good" && justLanded(landed, piece.flow) }))
    .sort((a, b) => RANK[a.standing.is] - RANK[b.standing.is] || Number(a.just) - Number(b.just) || a.i - b.i);
  const all = pieces.every((piece) => piece.standing.is === "good");

  // The tick that just landed travels from its flow's end into its piece, which fills as it arrives.
  useLayoutEffect(() => {
    if (!landed || performance.now() - landed.at > 150) return;
    const name = CSS.escape(landed.flow);
    const from = document.querySelector(`[data-map] [data-end] [data-tick="${name}"]`) ?? document.querySelector(`[data-map] [data-tick="${name}"]`);
    const to = meter.current?.querySelector<HTMLElement>(`[data-piece="${name}"]`);
    if (from && to) fly(from, to);
  }, [landed]);

  return (
    <div ref={meter} className="relative pt-3.5">
      <div className={`flex h-0.5 transition-[gap] duration-450 ease-calm [--track:color-mix(in_srgb,var(--soft)_22%,var(--line))] ${all ? "gap-0 delay-900" : "gap-0.5"}`}>
        {sorted.map((piece) => {
          const { is } = piece.standing;
          const colour = piece.here
            ? is === "good"
              ? "[--piece:color-mix(in_srgb,var(--fg)_30%,var(--green))]"
              : is === "with the agent" || is === "to send"
                ? "[--piece:color-mix(in_srgb,var(--fg)_30%,var(--slate))]"
                : "[--piece:var(--soft)]"
            : is === "good"
              ? "[--piece:var(--green)]"
              : is === "with the agent"
                ? "[--piece:var(--slate)]"
                : is === "to send"
                  ? "[--piece:color-mix(in_srgb,var(--slate)_45%,var(--track))]"
                  : "[--piece:var(--track)]";
          return (
            <i
              key={piece.flow}
              data-piece={piece.flow}
              className={`relative min-w-0 flex-1 cursor-pointer transition-[background-color,scale] duration-300 ease-calm before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] hover:scale-y-200 ${colour} ${piece.just ? "animate-fill bg-(--track) bg-[linear-gradient(var(--piece),var(--piece))] bg-[length:100%_100%] bg-left bg-no-repeat" : "bg-(--piece)"} ${busy && is === "with the agent" ? "animate-busy" : ""}`}
              style={busy && is === "with the agent" ? { animationDelay: `${piece.i * 0.2}s` } : undefined}
              onPointerEnter={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                const room = meter.current!.getBoundingClientRect();
                const x = (box.left + box.right) / 2 - room.left;
                setTip({ words: `${piece.flow} · ${says(piece.standing)}`, x, side: x < room.width / 3 ? "left" : x > (room.width * 2) / 3 ? "right" : "middle" });
              }}
              onPointerLeave={() => setTip(undefined)}
              onClick={() => onFlow(piece.flow)}
            />
          );
        })}
      </div>
      {tip && (
        <span
          className={`pointer-events-none absolute bottom-3 max-w-full truncate rounded-[5px] bg-surface px-[7px] py-px text-[11px] leading-[14px] whitespace-nowrap text-fg shadow-tip ${tip.side === "left" ? "left-0" : tip.side === "right" ? "right-0" : "-translate-x-1/2"}`}
          style={tip.side === "middle" ? { left: tip.x } : undefined}
        >
          {tip.words}
        </span>
      )}
    </div>
  );
}

const says = (standing: Standing) => {
  const notes = `${standing.count} ${standing.count === 1 ? "note" : "notes"}`;
  return {
    good: "Looks good",
    "not saved": "Your note isn’t saved",
    "needs you": `${standing.count} waiting for your answer`,
    "to send": `${notes} to send`,
    "with the agent": "With the agent",
    "is it good": "Is it good?",
    "looked good": "Looked good earlier, changed since",
    "to watch": "Not watched yet",
  }[standing.is];
};

// The flow's green tick lifts off where it is, arcs down over the column and flattens into its piece.
function fly(from: Element, to: HTMLElement) {
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (a.bottom < 0 || a.top > innerHeight || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const dx = b.left - a.left;
  const dy = b.top + 1 - (a.top + 9);
  const duration = Math.round(Math.min(700, 380 + Math.hypot(dx, dy) * 0.3));
  const flight = document.createElement("div");
  flight.className = "pointer-events-none fixed z-60 size-[18px]";
  Object.assign(flight.style, { left: `${a.left}px`, top: `${a.top}px` });
  flight.innerHTML = `<i class="block size-[18px]"><b class="grid size-[18px] place-items-center rounded-full bg-green text-ground"><svg viewBox="0 0 12 12" class="size-[11px]" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.8 6.2l2.2 2.2 4.2-4.6"/></svg></b></i>`;
  document.body.append(flight);
  const across = flight.firstElementChild as HTMLElement;
  const box = across.firstElementChild as HTMLElement;
  const options = { duration, fill: "forwards" } as const;
  flight.animate([{ transform: "none" }, { transform: `translateX(${dx}px)` }], { ...options, easing: "cubic-bezier(.45,0,.55,1)" });
  across.animate(
    [
      { transform: "none", easing: "cubic-bezier(.2,.7,.4,1)" },
      { transform: "translateY(-12px)", offset: 0.2, easing: "cubic-bezier(.55,0,.85,.4)" },
      { transform: `translateY(${dy}px)` },
    ],
    options,
  );
  box.animate([{ transform: "scale(1)" }, { transform: "scale(.75)", offset: 0.7 }, { transform: "scale(.7,.12)", opacity: 1, offset: 0.94 }, { transform: "scale(.7,.12)", opacity: 0 }], {
    ...options,
    easing: "ease-in",
  });
  box.firstElementChild!.animate([{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0, offset: 0.72 }, { opacity: 0 }], options);
  to.style.animationDelay = `${duration - 60}ms`;
  setTimeout(() => flight.remove(), duration + 40);
}
