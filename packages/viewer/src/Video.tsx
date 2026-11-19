// What you're watching as a video: the page `playthrough open` films when you download one (video.ts). Only the
// recording, as the moment's page plays it, or beside how it was, as Compare shows it; over it what it is, the change's
// title and the moment's name, as the page has them on the recording's top. Each moment opens on its name, standing a
// moment before it plays, and comes in over the one before as going to it does; the last closes on its end softened, with
// Playthrough's mark and playthrough.sh over it. Nothing else Playthrough draws over a recording is in it: no bar, no
// edges, no pins, no outline round what it's about.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { isStill, together, type Change, type HandBack, type Moment as Taken } from "@playthrough/change";
import { readings, useChanges, type AskedVideo, type Listed } from "./api.ts";
import { CHIP, playedTogether } from "./compare.ts";
import { Mark } from "./Mark.tsx";
import { endOf, startOf } from "./Moment.tsx";
import { Clock, cutFor, Player, type Cut } from "./Player.tsx";
import { whoIn } from "./standing.ts";
import { Together } from "./view.ts";

// Drawn `larger` times its size, as Chromium films a page only at the size of its screen.
export type Filmed = Omit<AskedVideo, "dark"> & { change: string; larger: number };

declare global {
  interface Window {
    // Played once everything on it has arrived; done `length` seconds of video later.
    video?: { length: number; play: () => Promise<void> };
  }
}

// In the video's own seconds: a moment's name stands this long before it plays, its end this long after, a still
// (nothing to play) this long between, and the mark this long at the close.
const NAME = 1;
const LAST = 0.8;
const STILL = 1;
const MARK = 1.8;

// The change as it was when the video was asked for: what arrives after changes nothing being filmed.
export function VideoPage({ filmed }: { filmed: Filmed }) {
  const changes = useChanges();
  const [listed, setListed] = useState<Listed>();
  const now = changes?.find((one) => one.change.id === filmed.change);
  if (now && !listed) setListed(now);
  const handBack = listed?.change.handBacks.find((one) => one.number === filmed.handBack);
  return listed && handBack ? <Filming listed={listed} handBack={handBack} filmed={filmed} /> : <div className="h-dvh bg-ground" />;
}

// Each moment's waiting cut short as it plays, and its screen's shape.
type Ready = { cut: Cut; shape: number }[];

function Filming({ listed, handBack, filmed }: { listed: Listed; handBack: HandBack; filmed: Filmed }) {
  const { change } = listed;
  const [moments] = useState(() => filmed.moments.map((n) => handBack.moments[n - 1]).filter((moment): moment is Taken => !!moment));
  const [then] = useState(() => (filmed.beside ? earlier(change, filmed.beside.handBack, moments[0]!) : undefined));
  const [ready, setReady] = useState<Ready>();
  useEffect(() => {
    const shapeOf = (moment: Taken) => readings(change.id, handBack.number, moment.recording).then((read) => read.at(-1)?.screen ?? { width: 1280, height: 800 });
    void Promise.all(moments.map(async (moment) => ({ cut: await cutFor(change.id, handBack.number, moment), shape: await shapeOf(moment).then(({ width, height }) => width / height) }))).then(setReady);
  }, []);
  const both = useMemo(() => (ready && then ? playedTogether(ready[0]!.cut, together(moments[0]!, then.moment)) : undefined), [ready]);
  // One window for both of Compare's sides, framed on what changed or where you took it; alone, the whole screen, or
  // where you took it.
  const [pageWindow] = useState(() => Object.assign(new Together(flushSync), filmed.window && { moved: true, ...filmed.window }));
  const moves = then || filmed.window ? pageWindow : undefined;
  const [along] = useState(() => new Clock(0));

  // Which moment is shown, which is playing, how many have played to their end, and whether it's closing.
  const [on, setOn] = useState(0);
  const [playing, setPlaying] = useState<number>();
  const [played, setPlayed] = useState(0);
  const [closing, setClosing] = useState(false);
  const stopped = useRef(() => {});

  useEffect(() => {
    if (!ready || (then && !both)) return;
    const wait = (seconds: number) => new Promise((done) => setTimeout(done, seconds * 1000));
    const lengthOf = (moment: Taken, i: number) => {
      const [from, end] = [startOf(moment), endOf(moment)];
      if (both) return both.of(end) - both.of(from);
      return isStill(moment) ? STILL : ready[i]!.cut.cut(end) - ready[i]!.cut.cut(from);
    };
    // Compared, both sides go together along what both did, as Play drives them on the page.
    const playBoth = (from: number, until: number) =>
      new Promise<void>((done) => {
        const since = performance.now();
        const tick = () => {
          const going = Math.min(until, from + (performance.now() - since) / 1000);
          along.set(going);
          if (going >= until) return done();
          requestAnimationFrame(tick);
        };
        tick();
      });
    along.set(both ? both.of(startOf(moments[0]!)) : 0);
    const play = async () => {
      for (const [i, moment] of moments.entries()) {
        setOn(i);
        await wait(NAME);
        if (both) await playBoth(both.of(startOf(moment)), both.of(endOf(moment)));
        else if (isStill(moment)) await wait(STILL);
        else await new Promise<void>((done) => ((stopped.current = done), setPlaying(i)));
        setPlayed(i + 1);
        setPlaying(undefined);
        await wait(LAST);
      }
      setClosing(true);
      await wait(MARK);
    };
    // Ready once the first moment's recording is drawn: each side's, compared.
    let frame = 0;
    const drawn = () => {
      if (document.querySelectorAll("[data-filmed='0'] iframe").length < (then ? 2 : 1)) return void (frame = requestAnimationFrame(drawn));
      window.video = { length: moments.reduce((sum, moment, i) => sum + NAME + lengthOf(moment, i) + LAST, MARK), play };
    };
    drawn();
    return () => cancelAnimationFrame(frame);
  }, [ready, both]);

  if (!ready) return <div className="h-dvh bg-ground" />;
  // The moment before stays under the one coming in, which fades in over it, and the next waits unseen, drawn and ready.
  const shown = moments.map((moment, i) => ({ moment, i })).filter(({ i }) => i >= on - 1 && i <= on + 1);
  const { larger } = filmed;
  return (
    <div className="grid origin-top-left grid-rows-[78px_minmax(0,1fr)] bg-ground p-8" style={{ width: `${100 / larger}vw`, height: `${100 / larger}vh`, transform: `scale(${larger})` }}>
      {/* What this is, as on the recording's top: the change's title, quietly, and under it the moment's name, then as
          whom, in two lines at most, growing up into the room kept for them. */}
      <div className="grid pb-3">
        {shown.map(({ moment, i }) => (
          <div key={i} className={`flex min-w-0 flex-col items-center justify-end self-end transition-opacity duration-[240ms] ease-calm [grid-area:1/1] ${i === on ? "" : "opacity-0"}`}>
            <span className="max-w-full truncate px-1 text-[13px] leading-[22px] text-soft">{change.title}</span>
            <p className="line-clamp-2 text-center text-[15px] leading-[22px] text-balance text-fg">
              {moment.name}
              {whoIn(listed, moment) && <span className="text-soft"> as {whoIn(listed, moment)}</span>}
            </p>
          </div>
        ))}
      </div>
      <div className="grid min-h-0 place-items-center [container-type:size]">
        {shown.map(({ moment, i }) => {
          const [from, end] = [startOf(moment), endOf(moment)];
          const at = i < played ? end : from;
          return (
            <div
              key={i}
              data-filmed={i}
              className={`relative flex flex-row-reverse gap-3 [grid-area:1/1] ${i <= on ? "" : "opacity-0"} ${i < on ? "invisible transition-[visibility] delay-[240ms]" : "transition-opacity duration-[240ms] ease-calm"}`}
              style={{ zIndex: i, aspectRatio: then ? undefined : ready[i]!.shape, ...(then ? { width: "100cqw", height: "100cqh" } : { width: `min(100cqw, calc(100cqh * ${ready[i]!.shape}))` }) }}
            >
              {then && both ? (
                [
                  { label: "Now", handBack: handBack.number, recording: moment.recording, side: 0 },
                  { label: "When you last saw it", handBack: then.handBack, recording: then.moment.recording, side: 1 },
                ].map((side) => (
                  <Framed key={side.label} closing={closing} marked={side.side === 0}>
                    <Player
                      change={change.id}
                      handBack={side.handBack}
                      recording={side.recording}
                      at={both.at(along.at)[side.side]!}
                      following={{ clock: along, at: (going) => both.at(going)[side.side]! }}
                      framedOn={filmed.beside!.framedOn}
                      moves={moves}
                    />
                    <span className={CHIP}>{side.label}</span>
                  </Framed>
                ))
              ) : (
                <Framed closing={closing && i === on} marked>
                  <Player
                    change={change.id}
                    handBack={handBack.number}
                    recording={moment.recording}
                    at={at}
                    playing={playing === i ? { until: end } : undefined}
                    cut={ready[i]!.cut}
                    onStop={() => stopped.current()}
                    moves={moves}
                  />
                </Framed>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// How it was when you last saw it: the same moment on that earlier hand-back.
function earlier(change: Change, number: number, moment: Taken) {
  const kept = change.handBacks.find((one) => one.number === number)?.moments.find((one) => one.name === moment.name);
  return kept && { handBack: number, moment: kept };
}

// A recording in its frame, as the page draws it; closing, softened, with the mark and playthrough.sh over it in the
// light colours it's always over.
function Framed({ closing, marked, children }: { closing: boolean; marked: boolean; children: ReactNode }) {
  return (
    <div className="relative min-w-0 flex-1">
      <div className="absolute inset-0 overflow-hidden rounded-lg bg-paper shadow-frame">
        {children}
        <div className={`absolute inset-0 z-30 bg-[rgba(247,247,245,.45)] backdrop-blur-[6px] transition-opacity duration-500 ease-calm ${closing ? "" : "opacity-0"}`} />
        {/* Drawn only as it closes: the mark's shape is cut by a mask found by its name, and one in a moment gone
            from sight is no shape at all. */}
        {marked && closing && (
          <div className="absolute inset-0 z-30 grid animate-arrive place-items-center" style={{ "--fg": "#2b2e35", "--amber": "#d9a23a", animationDuration: "500ms", animationDelay: "150ms" } as CSSProperties}>
            <span className="grid justify-items-center gap-3">
              <Mark className="size-11" />
              <span className="text-[17px] font-medium tracking-[-0.01em] text-fg">playthrough.sh</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
