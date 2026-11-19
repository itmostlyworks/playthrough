// What you're watching as a video: the page `playthrough open` films when you download one (video.ts). The app and
// nothing else, edge to edge, exactly as it looked when it was recorded, as the moment's page plays it (the pointer, its
// clicks and keys); or Compare's two sides, each saying which it is. Each moment comes in over the one before as going to
// it does, its name in a small pill at its bottom left for its first second; the last holds on its end while a pill with
// Playthrough's mark and playthrough.sh comes in at its bottom right.

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { isStill, together, type Change, type HandBack, type Moment as Taken } from "@playthrough/change";
import { readings, useChanges, type AskedVideo, type Listed } from "./api.ts";
import { playedTogether } from "./compare.ts";
import { ARRIVE, END, LAST, NAME, STILL, videoLength } from "./filming.ts";
import { Mark } from "./Mark.tsx";
import { endOf, startOf } from "./Moment.tsx";
import { Clock, cutFor, Player, type Cut } from "./Player.tsx";
import { Together } from "./view.ts";

// Drawn `larger` times its size, as Chromium films a page only at the size of its screen. Always the whole app, light or
// dark as it was recorded, wherever the person had taken the window and whatever their page is.
export type Filmed = Pick<AskedVideo, "handBack" | "moments" | "beside"> & { change: string; larger: number };

// What the video says in its own words, in one shape: on its own surface, so it reads over any app, light or dark.
const PILL = "pointer-events-none absolute z-30 rounded-md bg-surface px-2.5 py-1 text-[13px] leading-5 text-fg shadow-tip";

declare global {
  interface Window {
    // Played once everything on it has arrived; done `length` seconds of video later.
    video?: { length: number; play: () => Promise<void> };
    // Told when what it draws over the app has come to rest, a pill or a moment come or gone, so the filming makes the
    // next frame whole (video.ts).
    settled?: () => void;
  }
}

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
  // One window for both of Compare's sides, framed on what changed, as Compare opens; alone, the whole screen.
  const [bothSides] = useState(() => new Together(flushSync));
  const [along] = useState(() => new Clock(0));

  // Which moment is shown, whose name stands, which is playing, how many have played to their end, and whether it's
  // closing.
  const [on, setOn] = useState(0);
  const [named, setNamed] = useState<number | undefined>(0);
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
        setNamed(i);
        setTimeout(() => setNamed((was) => (was === i ? undefined : was)), NAME * 1000);
        await wait(ARRIVE);
        if (both) await playBoth(both.of(startOf(moment)), both.of(endOf(moment)));
        else if (isStill(moment)) await wait(STILL);
        else await new Promise<void>((done) => ((stopped.current = done), setPlaying(i)));
        setPlayed(i + 1);
        setPlaying(undefined);
        if (i < moments.length - 1) await wait(LAST);
      }
      setClosing(true);
      await wait(END);
    };
    // Ready once the first moment's recording is drawn: each side's, compared.
    let frame = 0;
    const drawn = () => {
      if (document.querySelectorAll("[data-filmed='0'] iframe").length < (then ? 2 : 1)) return void (frame = requestAnimationFrame(drawn));
      window.video = { length: videoLength(moments.map(lengthOf)), play };
    };
    drawn();
    return () => cancelAnimationFrame(frame);
  }, [ready, both]);

  if (!ready) return <div className="h-dvh bg-ground" />;
  // The moment before stays under the one coming in, which fades in over it, and the next waits unseen, drawn and ready.
  // Compared, its two sides are each the shape of the app's screen, a 2px line between them, as video.ts sizes it.
  const shown = moments.map((moment, i) => ({ moment, i })).filter(({ i }) => i >= on - 1 && i <= on + 1);
  const { larger } = filmed;
  // Pills are the same size in every video, as on a laptop's screen filmed 1920 wide, whatever screen the app was on and
  // however many sides there are.
  const pill = { zoom: 1.5 / larger };
  return (
    <div
      className="relative grid origin-top-left place-items-center bg-ground [container-type:size]"
      style={{ width: `${100 / larger}vw`, height: `${100 / larger}vh`, transform: `scale(${larger})` }}
      onTransitionEnd={() => window.settled?.()}
    >
      {shown.map(({ moment, i }) => {
        const [from, end] = [startOf(moment), endOf(moment)];
        const at = i < played ? end : from;
        return (
          <div
            key={i}
            data-filmed={i}
            className={`relative flex flex-row-reverse [grid-area:1/1] ${then ? "gap-0.5 bg-track" : ""} ${i <= on ? "" : "opacity-0"} ${i < on ? "invisible transition-[visibility] delay-[240ms]" : "transition-opacity duration-[240ms] ease-calm"}`}
            style={{ zIndex: i, aspectRatio: then ? undefined : ready[i]!.shape, ...(then ? { width: "100cqw", height: "100cqh" } : { width: `min(100cqw, calc(100cqh * ${ready[i]!.shape}))` }) }}
          >
            {then && both ? (
              [
                { label: "Now", handBack: handBack.number, recording: moment.recording, side: 0 },
                { label: "When you last saw it", handBack: then.handBack, recording: then.moment.recording, side: 1 },
              ].map((side) => (
                <div key={side.label} className="relative min-w-0 flex-1 overflow-hidden bg-paper">
                  <Player
                    change={change.id}
                    handBack={side.handBack}
                    recording={side.recording}
                    at={both.at(along.at)[side.side]!}
                    following={{ clock: along, at: (going) => both.at(going)[side.side]! }}
                    framedOn={filmed.beside!.framedOn}
                    moves={bothSides}
                  />
                  <span className={`${PILL} top-4 left-4`} style={pill}>
                    {side.label}
                  </span>
                </div>
              ))
            ) : (
              <div className="relative min-w-0 flex-1 overflow-hidden bg-paper">
                <Player
                  change={change.id}
                  handBack={handBack.number}
                  recording={moment.recording}
                  at={at}
                  playing={playing === i ? { until: end } : undefined}
                  cut={ready[i]!.cut}
                  onStop={() => stopped.current()}
                />
              </div>
            )}
            {/* The moment's name, in two lines at most. */}
            <p className={`${PILL} bottom-4 left-4 line-clamp-2 max-w-[min(60%,420px)] text-balance transition-opacity duration-300 ease-calm ${named === i ? "" : "opacity-0"}`} style={pill}>
              {moment.name}
            </p>
          </div>
        );
      })}
      {/* Drawn once, over every moment: the mark's shape is cut by a mask found by its name. */}
      <span className={`${PILL} right-4 bottom-4 flex items-center gap-1.5 pl-2 font-medium transition-opacity delay-200 duration-[400ms] ease-calm ${closing ? "" : "opacity-0"}`} style={{ ...pill, zIndex: moments.length + 1 }}>
        <Mark className="size-4" />
        playthrough.sh
      </span>
    </div>
  );
}

// How it was when you last saw it: the same moment on that earlier hand-back.
function earlier(change: Change, number: number, moment: Taken) {
  const kept = change.handBacks.find((one) => one.number === number)?.moments.find((one) => one.name === moment.name);
  return kept && { handBack: number, moment: kept };
}
