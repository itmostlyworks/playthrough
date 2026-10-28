// Every control in one row under the recordings: play, the time and the timeline, the speed, the size, the rounds, how
// to look at them, on their own or side by side, and taking the flow over to carry on by hand. Nothing in it appears, disappears or changes width as you move.

import type { RefObject } from "react";
import type { Round } from "@mostlyworks/vantage-review";
import { useNow, type Playhead } from "./playhead.ts";
import { Rounds } from "./Rounds.tsx";
import type { Shown } from "./Stage.tsx";
import { Timeline, type Dot, type Mark } from "./Timeline.tsx";

export type Look = "one" | "side";

type Props = {
  // Taken over: waiting while the moment is made ready, or the app showing in the frame.
  live?: "waiting" | "shown";
  onTakeOver: () => void;
  ref?: RefObject<HTMLDivElement | null>;
  playhead: Playhead;
  dots: Dot[];
  onDot: (id: string) => void;
  marks: Mark[];
  onMark: (id: string) => void;
  shown?: Shown;
  zoomed: boolean;
  onSize: () => void;
  rounds: Round[];
  watching: number;
  earlier?: number;
  arrived?: Round;
  working?: string;
  onRound: (round: number) => void;
  onEarlier: (round: number) => void;
  look: Look;
  onLook: (look: Look) => void;
  // With the action bar on the stage, the row keeps only what's about time.
  stage?: boolean;
  // On your branch, where it leaves the flow it's off.
  branch?: number;
};

export function Controls(props: Props) {
  const speed = useNow(props.playhead, (now) => now.speed);
  const first = props.watching === props.rounds[0]?.number;
  // What the size says: how large the recording you're watching shows. Where it already shows at actual size, there's
  // nothing to switch.
  const fits = !props.shown || props.shown.fit >= 0.995;
  const actual = props.zoomed && !fits;
  const percent = `${Math.round(Math.min(1, actual ? props.shown!.k : (props.shown?.fit ?? 1)) * 100)}%`;
  const quiet = "rounded-md px-1.5 py-[3px] whitespace-nowrap text-faint transition-colors duration-150 ease-calm";
  // Opened, the rounds' line covers the controls it reaches over, and they step back.
  const coveredBack = "transition-opacity duration-200 ease-calm group-has-[[data-open=left]]/controls:pointer-events-none group-has-[[data-open=left]]/controls:opacity-0";
  const latest = props.watching === props.rounds.at(-1)?.number;
  const coveredForward = "transition-opacity duration-200 ease-calm group-has-[[data-open=right]]/controls:pointer-events-none group-has-[[data-open=right]]/controls:opacity-0";

  return (
    <div ref={props.ref} className="group/controls flex min-w-0 flex-wrap items-center gap-3 pt-[18px] select-none">
      <Timeline playhead={props.playhead} dots={props.dots} onDot={props.onDot} marks={props.marks} onMark={props.onMark} live={props.live === "shown"} branch={props.branch} />
      <button
        data-speed
        className={`${quiet} ${coveredBack} text-center hover:bg-hover hover:text-fg ${speed < 1 ? "text-amber-ink" : ""}`}
        aria-label={`Speed ${say(speed)}`}
        onClick={() => props.playhead.slower()}
      >
        {say(speed)}
      </button>
      <button
        className={`${quiet} ${coveredBack} -ml-1.5 min-w-[46px] text-left ${fits ? "cursor-default opacity-55" : `hover:bg-hover hover:text-fg ${actual ? "text-fg" : ""}`}`}
        aria-label={fits ? "Shown at actual size" : actual ? "Fit the recording to the frame" : "Show the recording at actual size"}
        onClick={() => !fits && props.onSize()}
      >
        {percent}
      </button>
      {!props.stage && (
      <>
      <span className={`h-4 w-px flex-none bg-line ${coveredBack}`} />
      <Rounds
        rounds={props.rounds}
        watching={props.watching}
        earlier={props.earlier}
        arrived={props.arrived}
        working={props.working}
        onRound={props.onRound}
        onEarlier={props.onEarlier}
      />
      <div data-views role="group" aria-label="Compare" className={`flex gap-0.5 rounded-lg bg-hover p-0.5 ${coveredForward}`}>
        {(["one", "side"] as const).map((look) => {
          const name = look === "one" ? "On its own" : "Side by side";
          const off = first && look !== "one";
          const on = first ? look === "one" : props.look === look;
          return (
            <button
              key={look}
              aria-pressed={on}
              aria-label={name}
              disabled={off}
              className="group/look relative inline-flex items-center rounded-md px-2 py-[3px] text-soft transition-colors duration-150 ease-calm enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default disabled:text-faint aria-pressed:bg-surface aria-pressed:text-fg aria-pressed:shadow-[0_0_0_1px_var(--line)]"
              onClick={() => props.onLook(look)}
            >
              {/* Each view drawn small: one frame, or two. */}
              <svg viewBox="0 0 16 12" aria-hidden className="block h-[1.5em] w-4 fill-none stroke-current stroke-[1.4] group-disabled/look:opacity-55">
                {look === "one" ? (
                  <rect x="1" y="1" width="14" height="10" rx="2" />
                ) : (
                  <>
                    <rect x="1" y="1" width="6" height="10" rx="1.5" />
                    <rect x="9" y="1" width="6" height="10" rx="1.5" />
                  </>
                )}
              </svg>
              {/* Its name just above when you point at it, like every other label in the row; a dimmed one says why. */}
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-[calc(100%+5px)] left-1/2 -translate-x-1/2 translate-y-[2px] rounded-[5px] bg-surface px-[7px] py-px text-[11px] leading-[14px] whitespace-nowrap text-fg opacity-0 shadow-tip transition-[opacity,translate] duration-150 ease-calm group-hover/look:translate-y-0 group-hover/look:opacity-100"
              >
                {off ? "Nothing earlier to compare with" : name}
              </span>
            </button>
          );
        })}
      </div>
      <span className={`h-4 w-px flex-none bg-line ${coveredForward}`} />
      {/* The frame turns into the app itself, at the step the playhead is in, on the app as it is now (live.ts). */}
      <button
        disabled={!latest}
        aria-pressed={!!props.live}
        className={`group/take relative ${quiet} ${coveredForward} enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default disabled:opacity-55 aria-pressed:text-fg ${props.live === "waiting" ? "animate-pulse" : ""}`}
        onClick={props.onTakeOver}
      >
        Take over
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-[calc(100%+5px)] translate-y-[2px] rounded-[5px] bg-surface px-[7px] py-px text-[11px] leading-[14px] whitespace-nowrap text-fg opacity-0 shadow-tip transition-[opacity,translate] duration-150 ease-calm group-hover/take:translate-y-0 group-hover/take:opacity-100"
        >
          {!latest ? "Only the latest round is the app as it is now" : props.live === "shown" ? "Back to the recording · Esc" : props.live === "waiting" ? "Getting it ready…" : "Carry on from here in the app, by hand · T"}
        </span>
      </button>
      </>
      )}
    </div>
  );
}

const say = (speed: number) => (speed === 1 ? "1×" : speed === 0.5 ? "½×" : "¼×");
