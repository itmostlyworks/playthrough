// A flow as a video: what Playthrough films when you save one. Only the recording, or it beside the round Compare shows,
// as the viewer plays it: opening on the flow's name, and closing on its last frame softened, with Playthrough's mark
// where the name was. The command films it, at a speed it chooses, through what this page offers it.

import { useEffect, useRef, useState } from "react";
import type { Flow, Review, Round } from "@playthrough/review";
import { useReview } from "./api.ts";
import { HALO, Stage } from "./Stage.tsx";
import { POSTER } from "./moments.ts";
import { Playhead, type Speed } from "./playhead.ts";
import { useReadings } from "./things.ts";

// Drawn `larger` times its size, as Chromium films a page only at the size of its screen.
export type Filmed = { round: number; flow: string; beside?: number; speed: Speed; larger: number };

declare global {
  interface Window {
    // Played once everything on it has arrived; done once its mark has stood a while.
    video?: { play: () => Promise<void> };
  }
}

// In the video's own seconds: the name stands this long before it plays, the last frame this long before it softens,
// and the mark this long after.
const NAME = 1;
const LAST = 0.8;
const MARK = 1.8;

export function Video({ id, filmed }: { id: string; filmed: Filmed }) {
  const review = useReview(id);
  if (!review || Array.isArray(review)) return null;
  const round = review.rounds.find((round) => round.number === filmed.round);
  const flow = round?.flows.find((flow) => flow.name === filmed.flow);
  const beside = review.rounds.find((round) => round.number === filmed.beside);
  return round && flow ? <Filming review={review} round={round} flow={flow} beside={beside} speed={filmed.speed} larger={filmed.larger} /> : null;
}

function Filming({ review, round, flow, beside, speed, larger }: { review: Review; round: Round; flow: Flow; beside?: Round; speed: Speed; larger: number }) {
  const read = useReadings(review, beside ? [beside, round] : [round]);
  const [playhead] = useState(() => new Playhead([flow], { flow: flow.name, at: POSTER }));
  // Where the mark stands at the end: over the round's own frame, side by side too, where its name stood.
  const [ending, setEnding] = useState<Pick<CSSStyleDeclaration, "left" | "top" | "width" | "height">>();
  const over = useRef<HTMLDivElement>(null);
  // Real time, from the video's: filmed slower, everything takes longer.
  const real = (seconds: number) => (seconds * 1000) / speed;

  useEffect(() => {
    while (playhead.now.speed !== speed) playhead.slower();
    const wait = (seconds: number) => new Promise((done) => setTimeout(done, real(seconds)));
    window.video = {
      play: async () => {
        await wait(NAME);
        playhead.play();
        await new Promise<void>((done) => {
          const off = playhead.subscribe(() => !playhead.now.playing && (off(), done()));
        });
        await wait(LAST);
        // Each frame softens under the veil its name has at the start, laid where the stage put it.
        for (const frame of document.querySelectorAll<HTMLElement>("[data-frame]:not([hidden])")) {
          const { left, top, width, height } = frame.style;
          const veil = document.createElement("div");
          veil.className = "absolute rounded-lg bg-[rgba(247,247,245,.45)] opacity-0 backdrop-blur-[6px] transition-opacity ease-calm";
          Object.assign(veil.style, { left, top, width, height, transitionDuration: `${real(0.5)}ms` });
          over.current!.prepend(veil);
          void veil.offsetWidth;
          veil.style.opacity = "1";
          if (frame.dataset.frame === String(round.number)) setEnding({ left, top, width, height });
        }
        await wait(MARK);
      },
    };
  }, [playhead, speed]);

  return (
    <div className="relative grid origin-top-left grid-rows-[minmax(0,1fr)] bg-ground p-8" style={{ width: `${100 / larger}vw`, height: `${100 / larger}vh`, transform: `scale(${larger})` }}>
      <Stage
        review={review}
        playhead={playhead}
        round={round}
        earlier={beside}
        peeking={false}
        zoomed={false}
        onShown={() => {}}
        onBareOff={() => {}}
        marks={new Map()}
        writing={false}
        onMark={() => {}}
        read={read}
        onGone={() => {}}
      />
      <div ref={over} className="pointer-events-none absolute inset-8 z-30">
        <div className={`absolute grid place-items-center transition-opacity ease-calm ${ending ? "opacity-100" : "opacity-0"}`} style={{ ...ending, transitionDuration: `${real(0.5)}ms`, transitionDelay: `${real(0.15)}ms` }}>
          <span className={`grid justify-items-center gap-3 ${HALO}`}>
            <Mark />
            <span className="font-ui text-[17px] font-medium tracking-[-0.01em] text-[#222222]">playthrough.sh</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// The logo in its light colours, as it's over the recorded app's softened page in either theme.
function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-11" aria-label="Playthrough">
      <mask id="around-the-note">
        <rect width="32" height="32" fill="#fff" />
        <circle cx="16" cy="16" r="7" fill="#000" />
      </mask>
      <g mask="url(#around-the-note)" fill="#2b2e35">
        <rect x="2" y="6" width="12" height="20" rx="3" opacity="0.35" />
        <rect x="18" y="6" width="12" height="20" rx="3" />
      </g>
      <circle cx="16" cy="16" r="5" fill="#d9a23a" />
    </svg>
  );
}
