// A scene: whose it is and what they do, where it stands, and its recording, with its way through beside it. A step
// gone to plays into its result and rests there; gone back to, it plays again. A note or a change gone to is there at its
// moment, lit. It arrives at the answer waiting on you, else at the first step's result. What's drawn on it, and what the
// bar does, is about the moment it's at: the notes there, outlined, what changed there, a note made there, the app taken
// over there. At rest, a click on it takes it over there; playing, it pauses it. C held is how it was before the work, at
// the same moment, in place; pressed, the two side by side, each close on the step's part of the page. At an answer to
// a note made in the app, how it was is what you did then, played again beside what you did, done again.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import { accountOf, allNotes, lastLooked, type Scene, type Place, type Review, type Round, type Verdict } from "@playthrough/review";
import { picture, readings as readingsOf, recording } from "./api.ts";
import { Bar } from "./Bar.tsx";
import { Compare, HOLD, Said } from "./Card.tsx";
import { answersTo, type Changed, type Diamond } from "./changes.ts";
import { EndMark, endOf } from "./Chosen.tsx";
import { clamp } from "./moments.ts";
import { Conversation, quiet as quietNumber, quietly } from "./Notes.tsx";
import { fill, ink, type Replied, type Shown, type Standing } from "./notes.ts";
import { asWho, personAt } from "./people.ts";
import { onPhone } from "./phone.ts";
import { around, Picture, union, type Box, type Frame } from "./Picture.tsx";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Clock, CLOSEST, Player, useCut, type Mark, type Placed } from "./Player.tsx";
import { Portal, TAG } from "./Portal.tsx";
import { recorded, type Scrolled } from "./replay.ts";
import { Difference, partOf, regionsOf } from "./Difference.tsx";
import { says } from "./Step.tsx";
import { Steps, stepStart, type OnLine, type Saying, type Stop } from "./Steps.tsx";
import type { Acting } from "./Work.tsx";

type SceneViewProps = {
  review: Review;
  round: Round;
  before?: Round;
  scene: Scene;
  changed: Place[];
  readings?: Reading[];
  glimpsed?: Glimpse[];
  notes: Shown[];
  // Any note of yours, wherever it's on: a change here can be made for one on another scene.
  noteOf: (id: string) => Shown | undefined;
  standing?: Standing;
  same: boolean;
  onLooksGood?: (scene: string) => void;
  threads: Threads;
  diamonds: Diamond[];
  quiet: boolean;
  acting: Acting;
  active: boolean;
  // The stop gone along to, by the wheel or the keys; passing, as a turn of the wheel goes on through it, it plays
  // nothing until the wheel's still there.
  go?: { stop: number; passing?: boolean };
  resting: boolean;
  onPointerDown: () => void;
  // A verdict said on it: an answer judged, or Looks good at the end of the way.
  onSaid: () => void;
  // A stop on its way pressed: it comes up to the line, and the page goes to it.
  onPressed: (stop: number) => void;
};

// What changed at a moment, or what of it is in one part of the page: around it, on the screen its step was read on.
type Pictured = Diamond & { around?: Box };

export function SceneView(props: SceneViewProps) {
  const { review, round, before, scene, changed, readings, notes, standing, same, onLooksGood, threads, diamonds, quiet, acting, active } = props;
  const end = scene.length - 0.05;
  const stepOf = (at: number) => Math.max(0, scene.steps.findIndex((_, i) => stepEnd(scene, i) >= at - 0.05));
  // A note's moment: where it was made, or made in the app, where the app was taken over.
  const momentOf = (note: { on?: Place }) => (note.on?.app ? note.on.app.from.at : note.on?.at);
  // The note you're writing on it, here or in the app, at its moment, or on the whole scene, at its end: a stop like any
  // other, where its words are written.
  const ours = acting.writing?.note.on?.scene === scene.name ? acting.writing : undefined;
  const writingAt = ours && momentOf(ours.note);
  const writing = writingAt !== undefined ? ours : undefined;
  // On the steps' lines, each note's dot and each change's diamond, where they are.
  // Where a change is on the way: at its moment, a step's result counted as that step's; new steps from where the first
  // of them plays, not the result of the step before them, where they start.
  const changeAt = (diamond: Diamond) => {
    const first = diamond.until === undefined ? -1 : scene.steps.findIndex((step) => step.at >= diamond.at - 0.01);
    return Math.min(first < 0 ? diamond.at : stepStart(scene, first), end);
  };
  // Where what changed is, on the screen a step's reading was made of: each thing it's on, or the part of the page.
  const boxesOf = (changes: Changed[], reading: Reading) =>
    changes.flatMap((changed) => [
      ...[changed.on.element, ...(changed.on.alike ?? [])].flatMap((element) =>
        element?.node === undefined ? [] : reading.things.filter((thing) => thing.node === element.node).map((thing) => ({ ...thing.box, changed })),
      ),
      ...(changed.on.box ? [{ x: changed.on.box.x * reading.screen.width, y: changed.on.box.y * reading.screen.height, width: changed.on.box.width * reading.screen.width, height: changed.on.box.height * reading.screen.height, changed }] : []),
    ]);
  const readingOf = (step: number) => readings?.find((one) => one.step === scene.steps[step]?.title);
  // What changed only off the screen a step was read on can't be seen in its recording, nor pictured: it isn't met here.
  const unseen = (diamond: Diamond) => {
    const reading = readingOf(stepOf(changeAt(diamond)));
    const boxes = reading ? boxesOf(diamond.changes, reading) : [];
    return boxes.length > 0 && !regionsOf(boxes, reading!.screen).length;
  };
  // What changed at a moment is met a part of the page at a time: each region of it is its own row under its step, with
  // what the agent says of what's in it, and its own outline and diamond on the recording. Where nothing of it is found
  // on the page, it's one, in words.
  const pictured: Pictured[] = diamonds.flatMap((diamond) => {
    const reading = diamond.row && diamond.until === undefined ? readingOf(stepOf(changeAt(diamond))) : undefined;
    const own = diamond.changes.filter((changed) => !changed.answers);
    const regions = reading ? regionsOf(boxesOf(own, reading), reading.screen) : [];
    if (!regions.length) return [diamond];
    return regions.map((region, i) => ({ ...diamond, id: i ? `${diamond.id} ${i + 1}` : diamond.id, changes: [...new Set(region.map((box) => box.changed))], around: union(region) }));
  });
  const onLine: OnLine[] = [
    ...notes.flatMap((note) => (momentOf(note) === undefined ? [] : [{ id: note.id, at: Math.min(momentOf(note)!, end), fill: fill(note), words: note.turns[0]?.words ?? "Your note" }])),
    ...(writing ? [{ id: writing.note.id, at: Math.min(writingAt!, end), fill: "bg-amber", words: "Your new note" }] : []),
    ...diamonds.filter((diamond) => diamond.row && diamond.until === undefined && !unseen(diamond)).map((diamond) => ({ id: diamond.id, at: changeAt(diamond), words: diamond.name })),
  ];
  // Steps it takes that it couldn't before, new to you: each says so on its own row, rather than being told as a change.
  const added = new Set(diamonds.filter((diamond) => diamond.until !== undefined).flatMap((diamond) => scene.steps.flatMap((one, i) => (one.at >= diamond.at - 0.1 && one.at < diamond.until! ? [i] : []))));
  // A step's result, where it rests once it has played.
  const results = scene.steps.map((_, i) => stepEnd(scene, i) - 0.05);
  // Its steps with nothing new to you are kept together: seen on a round before, as you said something about it then,
  // nothing changed in them since; else, the work changed nothing in them, as Before shows. Changed is as the round's
  // comparison found it in this scene, wherever the change is told, but for what the agent says isn't real and what
  // was made for a note on it, which is seen with the note's answer. And no note in them is still open: none waits on
  // anyone, nothing of yours is unsent there.
  const since = lastLooked(review, threads.you, scene.name, round.number);
  const comparison = review.comparisons.find((kept) => kept.round === round.number && kept.since === (since ?? review.rounds[0]?.number));
  const changedIn = (step: number) =>
    !comparison ||
    comparison.changes.some((change) => {
      const account = accountOf(review, round.number, change.id);
      if (account && ("notReal" in account || ("note" in account && allNotes(review).get(account.note)?.note.on?.scene === scene.name))) return false;
      return change.seen.some((seen) => seen.scene === scene.name && seen.at !== undefined && stepOf(Math.min(seen.at, end)) <= step && step <= stepOf(Math.min(seen.until ?? seen.at, end)));
    });
  const [unfolded, setUnfolded] = useState<number[]>([]);
  const together = (step: number) =>
    (since !== undefined || !!before?.scenes.some((one) => one.name === scene.name)) &&
    !unfolded.includes(step) &&
    !changedIn(step) &&
    !diamonds.some((diamond) => diamond.row && stepOf(changeAt(diamond)) === step) &&
    !notes.some((note) => momentOf(note) !== undefined && stepOf(Math.min(momentOf(note)!, end)) === step && (note.toJudge || note.unsent || note.state !== "settled")) &&
    !(writingAt !== undefined && stepOf(Math.min(writingAt, end)) === step);
  const run = (step: number) => {
    let [first, last] = [step, step];
    while (first > 0 && together(first - 1)) first--;
    while (last + 1 < scene.steps.length && together(last + 1)) last++;
    return [first, last] as const;
  };
  // The way through it, a stop at a time: each step, and after it what was said in it, in the order it comes, a change
  // before what you said about it; then what was said about all of it, where it ends. Two or more steps in a row with
  // nothing new are one stop, played through.
  const stops: Stop[] = [
    ...scene.steps.flatMap((_, i): Stop[] => {
      const [first, last] = together(i) ? run(i) : [i, i];
      if (last > first) return i === first ? [{ step: last, at: results[last]!, from: first }] : [];
      return [
        { step: i, at: results[i]! },
        ...onLine
          .filter((mark) => mark.fill && stepOf(mark.at) === i)
          .sort((a, b) => a.at - b.at || Number(!!a.fill) - Number(!!b.fill))
          .map((mark) => ({ step: i, at: mark.at, id: mark.id })),
      ];
    }),
    ...notes.filter((note) => momentOf(note) === undefined).map((note) => ({ step: -1, id: note.id })),
    ...(ours && !writing ? [{ step: -1, id: ours.note.id }] : []),
  ];
  // And last, its end, where anything can be said about the whole of it: whether it looks good to you, once nothing in
  // it is still open, or else where what's open stands; and a note on the whole scene, written there.
  const atEnd =
    standing && onLooksGood
      ? {
          mark: endOf(standing),
          // Only while nothing of yours in it is unsent or with the agent: those ask nothing more of it this round.
          looksGood: JUDGED.includes(standing.is) && standing.asks ? { good: standing.is === "good", onPress: () => (onLooksGood(scene.name), standing.is !== "good" && props.onSaid()) } : undefined,
          says: <span className={INK[standing.is]}>{says(standing)}</span>,
          onNote: ours ? undefined : () => acting.onPlace({ scene: scene.name }),
        }
      : undefined;
  const last = stops.length - (atEnd ? 0 : 1);
  const waiting = notes.find((note) => note.toJudge && momentOf(note) !== undefined);
  const [clock] = useState(() => new Clock(waiting ? Math.min(momentOf(waiting)!, end) : results[0]!));
  const [at, setAt] = useState(clock.at);
  const [playing, setPlaying] = useState<{ until: number }>();
  // Dragged along a step's line, it follows the line, and where it's let go, it rests.
  const [scrubbing, setScrubbing] = useState(false);
  const cut = useCut(review.id, round.number, scene);
  // The stop you're on: arriving, the answer waiting on you, else none until you go along. What was said there is open
  // beside its thing, as is what you open on the recording.
  const [stop, setStop] = useState(() => (waiting ? stops.findIndex((one) => one.id === waiting.id) : -1));
  const [picked, setPicked] = useState(waiting?.id);
  // Still on the stop it arrived on, or passed on the way, it's as it was found: nothing plays until you stop there.
  const [still, setStill] = useState(true);
  // Good for you, as nothing's changed since you said so, it arrives folded to its name, and opens when you choose.
  const [folded, setFolded] = useState(quiet);
  const go = (moment: number, id?: string) => (clock.set(moment), setAt(moment), setPlaying(undefined), setPicked(id));
  const playTo = (until: number, from = clock.at) => (clock.set(from), setAt(from), setPicked(undefined), setPlaying({ until }));
  const pause = () => (setAt(clock.at), setPlaying(undefined));
  // Come to rest, played or dragged to, what was said at the stop you're on stays open.
  const stopped = (moment: number) => go(moment, stops[stop]?.id);
  const startOf = (step: number) => stepStart(scene, step, cut);
  // Gone to, a step plays into its result; what was said in one is there at its moment, still; what was said about all
  // of it, where it is. Before the first stop it rests, and past the last, it's how it ends. Passed, a step is at its
  // start, to play from there once it's stopped on.
  const toStop = (k: number, passing = false) => {
    setStop(k);
    setStill(passing);
    const there = stops[k];
    if (!there) return void (k < 0 ? playing && pause() : go(results.at(-1)!));
    if (there.id === undefined && passing) go(startOf(there.from ?? there.step));
    else if (there.id === undefined) playTo(there.at!, startOf(there.from ?? there.step));
    else if (there.at === undefined) setPicked(there.id);
    else go(there.at, there.id);
  };
  useLayoutEffect(() => void (props.go && toStop(props.go.stop, props.go.passing)), [props.go]);
  // Opened, steps kept together are each a stop again, walked from the first.
  const [unfolding, setUnfolding] = useState<number>();
  const unfold = (k: number) => {
    const there = stops[k];
    if (there?.from === undefined) return;
    setUnfolded((was) => [...was, ...scene.steps.map((_, i) => i).filter((i) => i >= there.from! && i <= there.step)]);
    setUnfolding(k);
  };
  useLayoutEffect(() => void (unfolding !== undefined && (toStop(unfolding), setUnfolding(undefined))), [unfolding]);
  // Opened on the recording, or just saved, what was said there is the stop you're on, there and then; closed there, it
  // isn't open.
  const opened = (id?: string) => (id && stops.some((one) => one.id === id) && setStop(stops.findIndex((one) => one.id === id)), setPicked(id));
  // A note begun is the stop you're on, as you write it; let go unsaved, you're back on the stop you were on.
  const [begun, setBegun] = useState<{ id: string; from: number }>();
  if (ours?.note.id !== begun?.id) {
    if (ours) (setBegun({ id: ours.note.id, from: stop }), setStop(stops.findIndex((one) => one.id === ours.note.id)));
    else (setBegun(undefined), begun && !stops.some((one) => one.id === begun.id) && setStop(begun.from));
  }
  // Held at the top, its way stays put beside the recording, but for a way longer than the room beside it: that goes up
  // as far as it must for the stop you're on to be in view over the foot, and no further, its top first where it's
  // taller than the room, so a stop always shows the way the same.
  const column = useRef<HTMLDivElement>(null);
  const way = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const [beside, inner] = [column.current, way.current];
    if (!beside || !inner) return;
    const follow = () => {
      const here = inner.querySelector<HTMLElement>("li[aria-current=step]");
      const top = here ? here.getBoundingClientRect().top - inner.getBoundingClientRect().top : 0;
      const raised = onPhone() ? 0 : Math.min(top, Math.max(0, top + (here?.offsetHeight ?? 0) - (beside.clientHeight - FOOT)));
      inner.style.translate = raised ? `0 ${-raised}px` : "";
      // What's gone up fades out under the top rather than being cut off there.
      beside.style.maskImage = raised ? "linear-gradient(to bottom, transparent, #000 28px)" : "";
    };
    follow();
    const watching = new ResizeObserver(follow);
    watching.observe(inner);
    watching.observe(beside);
    return () => watching.disconnect();
  }, [stop, folded]);
  // Playing, a click on it pauses it. Where it can't be taken over, a click plays on into the stop you're on, and there,
  // plays into it again from its step's start; before any stop, or on what was said about all of it, the step it shows.
  const again = () => {
    if (playing) return pause();
    const there = stops[Math.min(stop, stops.length - 1)];
    if (there?.at === undefined) return toStop(stops.findIndex((one) => one.id === undefined && one.step === stepOf(clock.at)));
    if (clock.at < there.at - 0.01) playTo(there.at);
    else playTo(there.at, startOf(there.step));
  };

  // Before the work, the step of the same name, as far into it as now is into its own.
  const then = before?.scenes.find((one) => one.name === scene.name);
  const step = stepOf(at);
  const thenStep = then?.steps.findIndex((one) => one.title === scene.steps[step]?.title) ?? -1;
  const thenAt = (moment: number) => {
    const now = stepOf(moment);
    const there = then?.steps.findIndex((one) => one.title === scene.steps[now]?.title) ?? -1;
    if (!then || there < 0) return undefined;
    const from = scene.steps[now]!.at;
    const u = clamp((moment - from) / Math.max(stepEnd(scene, now) - from, 0.01), 0, 1);
    return then.steps[there]!.at + u * (stepEnd(then, there) - then.steps[there]!.at);
  };
  const [side, setSide] = useState(false);
  // Before stays while it goes, as it came.
  const [beside, setBeside] = useState(false);
  useEffect(() => {
    if (side) return setBeside(true);
    const gone = setTimeout(() => setBeside(false), 450);
    return () => clearTimeout(gone);
  }, [side]);
  const [peek, setPeek] = useState(false);
  const holding = useRef<number>(undefined);
  const peeked = useRef(false);
  const press = () => {
    if (holding.current === undefined) holding.current = window.setTimeout(() => ((peeked.current = true), setPeek(true)), HOLD);
  };
  const release = () => {
    if (holding.current === undefined) return;
    clearTimeout(holding.current);
    holding.current = undefined;
    if (peeked.current) (peeked.current = false), setPeek(false);
    else setSide(!side);
  };

  // An answer to a note made in the app is seen the way the note was found: what you did there, done again on this
  // round's work as the agent recorded it, from where you took it over to where the answer shows, or to the end of the
  // step of it the agent says it's seen in, where the page is the answer and nothing is outlined. Before it is what you
  // did then, as you kept it, from where you took it over to where you noted it, as far into it as what's done again is:
  // click for click, where both made as many. Side by side, both are on what was done there: the things clicked and
  // typed in, in the shape of half the picture.
  const [traced, setTraced] = useState<{ id: string; now: number[]; then: number[]; frame?: Frame }>();
  const redone = (() => {
    const id = stops[stop]?.id;
    const on = notes.find((note) => note.id === id)?.on;
    if (!id || !on?.app?.steps || on.at === undefined) return undefined;
    const watched = on.app.steps.findIndex((step) => step.title === round.replies.find((reply) => reply.note === id)?.watch);
    const until = watched < 0 ? on.at : (on.app.steps[watched + 1]?.at ?? on.app.length) - 0.05;
    const from = on.app.from.at;
    const kept = review.sends.flatMap((send) => send.notes).find((sent) => sent.id === id)?.on;
    if (!kept?.app || kept.at === undefined) return { id, on, app: on.app, until, outlined: watched < 0 };
    const [since, to] = [kept.app.from.at, kept.at];
    const [now, then] = traced?.id === id ? [traced.now.filter((at) => at > from && at < until), traced.then.filter((at) => at > since && at < to)] : [[], []];
    const [here, there] = now.length === then.length ? [[from, ...now, until], [since, ...then, to]] : [[from, until], [since, to]];
    return { id, on, app: on.app, until, outlined: watched < 0, then: { recording: kept.app.recording, at: (moment: number) => along(moment, here, there) } };
  })();
  useEffect(() => {
    if (!redone?.then) return;
    let current = true;
    const { id, app, until, then } = redone;
    Promise.all([recording(review.id, round.number, app.recording), recording(review.id, round.number, then.recording), readingsOf(review.id, round.number, app.recording)]).then(
      ([now, before, read]) => {
        const done = recorded(now);
        const things = done.acted.filter(([at]) => at > app.from.at && at <= until).flatMap(([, node]) => read.flatMap((reading) => reading.things.filter((thing) => thing.node === node)).at(-1)?.box ?? []);
        const screen = read.at(-1)?.screen;
        if (current) setTraced({ id, now: done.clicks, then: recorded(before).clicks, frame: things.length && screen ? around(union(things), screen, HALF, CLOSEST) : undefined });
      },
    );
    return () => void (current = false);
  }, [redone?.id]);
  const [redoing, setRedoing] = useState(false);
  // It plays on a clock of its own, which Before follows; and each time Compare comes on, it plays again from where you
  // took it over, as what's compared there is what happens.
  const redoneClock = useRef<Clock>(undefined);
  const [replays, setReplays] = useState(0);
  useEffect(() => void (redone?.then && (side || peek) && setReplays((times) => times + 1)), [side || peek]);

  // Taken over here: the app, unseen until it's yours, and the frame's edge warm from Take over until you're back.
  const live = acting.live?.scene === scene.name ? acting.live : undefined;
  const taken = !!live?.shown;
  if (taken && side) setSide(false);
  // Compare, on the bar and beside what changed or was answered: how it was before the work, at the same moment; at an
  // answer to a note made in the app, what you did then.
  const comparable = !!then || !!redone?.then;
  const comparing = comparable ? { on: side || peek, off: taken, onPress: press, onRelease: release } : undefined;
  const noting = active && acting.noting;
  // C is the scene's you're on; in the app, it's the app's, and noting, it rests until you've chosen what it's on.
  // Gone to another, it stops.
  useEffect(() => {
    if (!active || taken || noting) return;
    const typing = (event: KeyboardEvent) => (event.target as Element).closest?.("input, textarea, [contenteditable]");
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event)) return;
      if (event.key.toLowerCase() === "c" && comparable) press();
    };
    const up = (event: KeyboardEvent) => event.key.toLowerCase() === "c" && release();
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => (removeEventListener("keydown", down), removeEventListener("keyup", up));
  });
  useEffect(() => void (!active && playing && pause()), [active]);
  // Noting, it stops where it is: a note is made on the moment it's at; in the app, on what you click there.
  useEffect(() => void (noting && playing && pause()), [noting]);
  // At rest on the scene you're on, that's where Take over takes it over; at such an answer, it's taken over the
  // way it was found, what you did done again in the app.
  const restsAt = Math.round(at * 100) / 100;
  const resting = active && !playing && !scrubbing && !taken;
  useEffect(() => void (resting && acting.onRest(scene.name, restsAt, redone?.id)), [resting, restsAt, redone?.id]);
  // And there, it's a click from being the app: pointing at it says so beside your pointer, as who it's done as. A
  // click on another scene's makes it the one you're on.
  const person = personAt(scene, restsAt);
  const stepIn = resting && !live?.shown && !noting && !acting.writing && acting.latest ? acting.onTakeOver : undefined;
  const noteHere = noting && !taken && !acting.writing;
  // It says so once you point, not each time the way comes to rest under a pointer left there.
  const [aiming, setAiming] = useState(false);
  const pointed = useRef<{ x: number; y: number }>(undefined);
  useEffect(() => setAiming(false), [stop, !!playing]);
  const pill = useRef<HTMLSpanElement>(null);
  const armed = useRef(false);

  // What's drawn is what's at this moment: in its step, the notes made there up to now, and what changed there.
  const shown = (moment: number) => stepOf(moment) === step && moment <= at + 0.05;
  const here = notes.filter((note) => momentOf(note) !== undefined && shown(momentOf(note)!));
  const changedHere = pictured.filter((diamond) => diamond.row && shown(Math.min(diamond.at, end)));
  // One made in the app is on its thing as it was written, found by its name: the app's nodes aren't this recording's.
  const written = (note: Shown) => review.sends.flatMap((send) => send.notes).find((kept) => kept.id === note.id)?.on ?? note.on;
  // A change is on its thing and on each thing changed alike with it, where they are.
  const marksOn = (id: string, on: Place): Mark[] => [
    { id, node: on.element?.node, name: on.element?.name, point: on.point, box: on.box },
    ...(on.alike ?? []).map((element, i) => ({ id: `${id} ${i}`, node: element.node, name: element.name })),
  ];
  // The note or change pointed at under its step is lit on the recording, else the one you chose. What the agent changed
  // for a note is the note's, outlined with it wherever it's there at this moment.
  const [lit, setLit] = useState<string>();
  const chosen = lit ?? picked;
  const answered = here.some((note) => note.id === chosen) ? answersTo(diamonds, chosen!) : [];
  const answeredMarks = answered.flatMap(({ on }, i) => marksOn(`${chosen} answer ${i}`, on));
  // What changed is outlined as the part of the page its picture shows, where its step was read; else each thing.
  const changedMarks = (diamond: Pictured): Mark[] => {
    const screen = readingOf(stepOf(changeAt(diamond)))?.screen;
    if (!diamond.around || !screen) return diamond.changes.flatMap(({ on }, i) => marksOn(`${diamond.id} ${i}`, on));
    const { x, y, width, height } = diamond.around;
    return [{ id: `${diamond.id} part`, box: { x: (x - 4) / screen.width, y: (y - 4) / screen.height, width: (width + 8) / screen.width, height: (height + 8) / screen.height } }];
  };
  const marks: Mark[] = [
    ...here.map((note) =>
      note.on?.app ? { id: note.id, name: written(note)?.element?.name ?? note.on.element?.name } : { id: note.id, node: note.on?.element?.node, name: note.on?.element?.name, point: note.on?.point },
    ),
    ...answeredMarks,
    ...changedHere.flatMap(changedMarks),
    ...(writing ? [writing.note.on?.app ? { id: writing.note.id, name: writing.note.on.element?.name } : { id: writing.note.id, node: writing.note.on?.element?.node, point: writing.note.on?.point }] : []),
  ];
  const pins: Pin[] = [
    ...here.map((note) => ({ id: note.id, on: [note.id, ...(note.id === chosen ? answeredMarks.map((mark) => mark.id) : [])], ink: ink(note), number: note.number, fill: fill(note) })),
    ...changedHere.map((diamond) => ({ id: diamond.id, on: changedMarks(diamond).map((mark) => mark.id), ink: RECORDED_INK, diamond: true as const })),
    ...(writing ? [{ id: writing.note.id, on: [writing.note.id], ink: "var(--amber)", number: writing.number, fill: "bg-amber" }] : []),
  ];
  const [placed, setPlaced] = useState<{ view: string; at: Placed }>();
  const [saved, setSaved] = useState(acting.opened);
  if (acting.opened !== saved) (setSaved(acting.opened), acting.opened && notes.some((note) => note.id === acting.opened) && opened(acting.opened));
  // Only a note being written has its card on the recording, where it was dropped; what's said is under its step.
  const open = writing ? writing.note.id : !side && pins.some((pin) => pin.id === chosen) ? chosen : undefined;
  const [replying, setReplying] = useState<string>();
  // At an answer waiting on you, Enter says it looks good and R replies, as its buttons say; at the way's end,
  // Enter says the scene looks good. It's heard first, on the way in, so the page's own Enter never has it too.
  const answering = notes.find((note) => note.id === stops[stop]?.id && note.toJudge && !threads.readOnly && replying !== note.id);
  const ending = stop === stops.length && atEnd?.looksGood && !atEnd.looksGood.good ? atEnd.looksGood : undefined;
  useEffect(() => {
    if (!active || !(answering || ending) || taken || noting || acting.writing) return;
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || (event.target as Element).closest?.("button, input, textarea, [contenteditable], [role=slider]")) return;
      if (event.key === "Enter" && ending) (event.preventDefault(), event.stopImmediatePropagation(), ending.onPress());
      else if (event.key === "Enter" && answering) (event.preventDefault(), event.stopImmediatePropagation(), threads.onJudge(answering, { note: answering.id, verdict: "looks good" }), props.onSaid());
      else if (event.key.toLowerCase() === "r" && answering) (event.preventDefault(), event.stopImmediatePropagation(), setReplying(answering.id));
    };
    addEventListener("keydown", down, true);
    return () => removeEventListener("keydown", down, true);
  });

  // What was said at a stop: a note of yours, its thread, or the one you're writing. Its sign on the rail is the note's
  // number.
  const said = (id: string): Saying => {
    if (id === ours?.note.id)
      return {
        sign: <span className="size-4 rounded-full bg-amber text-center text-[9px] leading-4 font-semibold text-white">{ours.number}</span>,
        line: "Your new note",
        whole: <div className="grid gap-2.5 pt-1 pb-1.5 text-[13px]">{ours.words}</div>,
      };
    const note = notes.find((note) => note.id === id)!;
    return {
      sign: <span className={`size-4 rounded-full text-center text-[9px] leading-4 font-semibold text-white ${fill(note)}`}>{note.number}</span>,
      line: note.turns[0]?.words,
      whole: (
        <div className="-my-2 -ml-4">
          <Conversation
            note={note}
            you={threads.you}
            readOnly={threads.readOnly}
            replying={replying === note.id}
            unfinished={threads.unfinished[note.id]}
            away={false}
            onReplying={(on) => setReplying(on ? note.id : undefined)}
            onUnfinished={(words) => threads.onUnfinished(note.id, words)}
            onJudge={(said) => (threads.onJudge(note, said), said && "verdict" in said && said.verdict === "looks good" && props.onSaid())}
            onEdit={(words) => threads.onEdit(note.id, words)}
            onShow={() => {}}
            compare={comparing}
          />
        </div>
      ),
    };
  };

  // What changed new to you in a step is met under its line, where its diamond is, not as a stop of its own: a part of
  // the page at a time, as it was over as it is, with what the agent says of what's in it, or that it was made for a
  // note of yours. Gone to, the recording is at its moment, close on it. Where nothing of it is found on the page, it's
  // in words, with Compare beside it. Steps new to you start with what the agent says of them, on the first.
  const toChange = (diamond: Diamond) => go(changeAt(diamond), diamond.id);
  const linesOf = (diamond: Diamond) => [...new Map(diamond.changes.filter((changed) => !changed.answers && changed.line).map((changed) => [changed.line, changed])).values()];
  const changesIn = (step: number) => {
    const reading = readingOf(step);
    const now = reading && picture(review.id, round.number, scene.recording, readings!.indexOf(reading));
    const here = pictured.filter((diamond) => diamond.row && diamond.until === undefined && stepOf(changeAt(diamond)) === step && !unseen(diamond));
    const fresh = diamonds.filter((diamond) => diamond.until !== undefined && scene.steps.findIndex((one) => one.at >= diamond.at - 0.1) === step).flatMap(linesOf);
    // The agent's name once, over all it says in the step.
    const by = [...fresh, ...here.flatMap(linesOf)][0]?.by;
    if (!here.length && !fresh.length) return undefined;
    return (
      <div className="grid gap-1.5 pt-2.5 pr-2">
        {by && <span className="text-[11.5px] leading-4 text-faint">{by}</span>}
        {fresh.map((changed) => (
          <p key={changed.line} className="text-[12.5px] leading-[18px] text-soft">
            {changed.line}
          </p>
        ))}
        {here.length > 0 && (
          <ul className="grid gap-3">
            {here.map((diamond) => {
              const told = linesOf(diamond);
              const madeFor = diamond.changes.map((changed) => !changed.answers && changed.note && props.noteOf(changed.note)).find(Boolean) || undefined;
              const on = picked === diamond.id;
              const words = madeFor ? (
                <>
                  Changed for your note
                  <span className={`ml-1 inline-block size-3.5 rounded-full text-center text-[8.5px] leading-3.5 font-semibold ${quietNumber}`} style={{ "--c": ink(madeFor) } as CSSProperties}>
                    {madeFor.number}
                  </span>
                </>
              ) : told.length ? (
                told.map((changed, i) => (
                  <span key={changed.line} className={i ? "block pt-1" : undefined}>
                    {changed.line}
                  </span>
                ))
              ) : diamond.around ? undefined : (
                diamond.name
              );
              return (
                <li key={diamond.id} className="flex min-w-0 items-start gap-2" onPointerEnter={() => setLit(diamond.id)} onPointerLeave={() => setLit(undefined)}>
                  <button
                    className={`flex min-w-0 flex-1 items-start gap-2 py-0.5 text-left text-[12.5px] leading-[18px] transition-colors duration-150 ease-calm hover:text-fg ${on ? "text-fg" : "text-soft"}`}
                    onClick={() => toChange(diamond)}
                  >
                    <i className={`mt-[5.5px] size-[7px] flex-none rotate-45 ${on ? "bg-fg" : "bg-soft"}`} />
                    <span className="grid min-w-0 flex-1 gap-2">
                      {words && <span className="min-w-0">{words}</span>}
                      {diamond.around && reading && <Difference part={partOf(diamond.around, reading.screen)} now={now!} before={thenPicture(diamond.changes[0]?.since, step)} />}
                    </span>
                  </button>
                  {on && comparing && !diamond.around && <Compare {...comparing} bar={quietly} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };
  // The picture the same step ended on in the round it's new since, where it had the step.
  const thenPicture = (since: number | undefined, step: number) => {
    const was = review.rounds.find((kept) => kept.number === since)?.scenes.find((one) => one.name === scene.name);
    const there = was?.steps.findIndex((one) => one.title === scene.steps[step]?.title) ?? -1;
    return was && there >= 0 ? picture(review.id, since!, was.recording, there) : undefined;
  };

  const frames = useFrames(review, round, scene, readings, (step) => changed.filter((on) => on.at !== undefined && stepOf(on.at) === step));
  // At rest on a note or a change, the recording is close on what it's on, and on a step, it's the whole page as it
  // plays; and taken over, the whole page the app comes in as. Side by side, Now is close on it in its half, and Before
  // shows the same part of the page; else each is on the step's part of the page.
  const there = stops[stop];
  // Passed on the way, or gone to while the recording's still coming into its place, a note or a change is only its
  // moment: it closes in, and its pins come, once the recording's settled and it's stopped on, as a step plays.
  const passing = !!props.go?.passing;
  // What the recording rests close on: the note at the stop you're on, or the change gone to under its step.
  const change = pictured.find((diamond) => diamond.id === picked && diamond.row);
  const focus = there?.id !== undefined && there.at !== undefined ? { id: there.id, at: there.at } : change && { id: change.id, at: changeAt(change) };
  const onIt = !!focus && !playing && !scrubbing && !passing && Math.abs(at - focus.at) < 0.02;
  const closeOn = !live?.shown && onIt ? pins.find((pin) => pin.id === focus!.id)?.on : undefined;
  const [closed, setClosed] = useState<Frame>();
  // A phone's recording is the phone's shape, as tall as any scene's picture: side by side, a second phone comes in beside
  // it, each the whole screen.
  const tall = readings?.[0]?.screen;
  const phone = tall && tall.height > tall.width ? tall.width / tall.height : undefined;
  // As tall as the window has room for, as a scene's picture is at most, and narrow enough for two side by side.
  const high = phone && `min(100dvh - 150px, (100cqw - 16px) / ${2 * phone})`;
  const frame = side && !phone ? ((redone && traced?.id === redone.id && traced.frame) || frames[step]) : undefined;
  const view = `${at} ${side} ${closeOn?.join(" ") ?? ""} ${redone ? "redone" : ""}`;
  // The pins are drawn where the recording, come to rest, found their things in the view it shows; on its way to another
  // view, none are, rather than in the corner that's for things it didn't find.
  const placedHere = !passing && placed?.view === view ? placed.at : undefined;
  // The app is the page the recording was made of, at its size, scrolled where the recording rests.
  const screen = readings?.find((one) => one.step === scene.steps[step]?.title)?.screen ?? { width: 1280, height: 800 };
  const scrolled = useRef<() => Scrolled>(undefined);
  // How it was, at the same moment: following this one as it plays.
  const beforeAt = thenAt(at);
  const was = (frame?: Frame) =>
    redone?.then ? (
      <Player
        review={review.id}
        round={round.number}
        recording={redone.then.recording}
        at={redone.then.at(redoneClock.current?.at ?? redone.until)}
        following={redoing && redoneClock.current ? { clock: redoneClock.current, at: redone.then.at } : undefined}
        frame={frame}
      />
    ) : then && beforeAt !== undefined ? (
      <>
        <Still src={picture(review.id, 0, then.recording, thenStep)} frame={frame} />
        <Player review={review.id} round={0} recording={then.recording} at={beforeAt} following={playing || scrubbing ? { clock, at: (moment) => thenAt(moment) ?? beforeAt } : undefined} frame={frame} />
      </>
    ) : (
      <span className="absolute inset-0 grid place-content-center bg-ground px-6 text-center text-[13px] leading-5 text-soft">{then ? "Before the work, there was no such step" : "New: there was nothing like it before"}</span>
    );

  if (folded)
    return (
      <section data-folded="" className="grid self-start">
        <button className="-mx-2.5 flex items-center gap-3 justify-self-start rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ease-calm hover:bg-surface" onClick={() => setFolded(false)} aria-expanded={false}>
          <EndMark end="good" just={false} className="size-3.5 flex-none" />
          <h3 className="min-w-0 text-[14px] leading-5 font-medium text-balance">
            {scene.name}
            {asWho(scene) && <span className="font-normal text-soft"> {asWho(scene)}</span>}
            <span className="sr-only">, looks good</span>
          </h3>
        </button>
      </section>
    );
  return (
    <section
      data-scene={scene.name}
      data-stops={last + 1}
      data-stop={stop}
      inert={props.resting}
      // As tall as the window, and a stop's stretch of scrolling more for each stop, gone through while it's held.
      style={{ "--stops": last + 1 } as CSSProperties}
      className={`relative h-[calc(var(--room)-var(--pin)+var(--stops)*var(--step))] transition-opacity duration-500 ease-calm phone:h-auto ${props.resting ? "opacity-30" : ""}`}
      onPointerDown={props.onPointerDown}
    >
      {/* Its name, recording and way are held at the window's top while you go through it, and leave it together. */}
      <div className="sticky top-(--pin) grid h-[calc(var(--room)-var(--pin))] grid-cols-[minmax(0,1fr)_340px] gap-8 phone:static phone:h-auto phone:grid-cols-1">
        <div className="@container self-start">
        {/* A phone's sits against its way, as narrow as it is. */}
        <div className={phone ? "ml-auto transition-[width] duration-450 ease-calm" : undefined} style={phone ? { width: side ? `calc(${2 * phone} * ${high} + 16px)` : `calc(${phone} * ${high})` } : undefined}>
        {/* Over a phone, as wide as the one phone, so it never rewraps, moving the picture, as Compare brings a second. */}
        <h3 className="mb-3 min-w-0 px-0.5 text-[15px] leading-[21px] font-semibold text-balance" style={phone ? { width: `calc(${phone} * ${high})` } : undefined}>
          {scene.name}
          {asWho(scene) && <span className="font-normal text-soft"> {asWho(scene)}</span>}
        </h3>
        <div className="relative">
          {/* A click pauses it, or plays the step again; noting, it notes what's under it; taken over, it's the app's. */}
          <button
            data-picture={scene.name}
            className={`relative block w-full ${phone ? "" : "aspect-[1.6]"}`}
            style={phone ? { height: high } : undefined}
            aria-label={stepIn ? `Take over${person ? ` as ${person}` : ""}` : `${playing ? "Pause" : "Play"} “${scene.steps[step]?.title}”`}
            onPointerDown={() => (armed.current = active)}
            onPointerMove={(event) => {
              if (event.pointerType !== "mouse") return;
              const box = event.currentTarget.getBoundingClientRect();
              pill.current?.style.setProperty("translate", `${event.clientX - box.left}px ${event.clientY - box.top}px`);
              // The page scrolled under a pointer that stayed put tells it moved, from where it was: that isn't pointing.
              const was = pointed.current;
              pointed.current = { x: event.clientX, y: event.clientY };
              if (was && Math.hypot(event.clientX - was.x, event.clientY - was.y) > 2) setAiming(true);
            }}
            onPointerLeave={() => setAiming(false)}
            onClick={() => armed.current && !taken && (stepIn ? (setAiming(false), stepIn()) : again())}
          >
            {/* Side by side, Now narrows to its half of the picture as its view glides close on the step's part of the page,
                and Before comes in beside it: nothing around them moves. */}
            <span className={`${FRAMED} left-0 z-1 transition-[width] duration-450 ease-calm ${side ? HALVES : "w-full"}`}>
              <Still src={picture(review.id, round.number, scene.recording, step)} frame={frame} />
              <Player
                review={review.id}
                round={round.number}
                recording={scene.recording}
                at={at}
                playing={playing}
                cut={cut}
                clock={clock}
                onStop={stopped}
                following={scrubbing ? { clock, at: (moment) => moment } : undefined}
                frame={frame}
                marks={marks}
                closeOn={redone || !closeOn ? undefined : { on: closeOn, shape: phone ?? (side ? HALF : WHOLE) }}
                onClosed={setClosed}
                onMarks={redone ? undefined : (placed) => setPlaced({ view, at: placed })}
                things={noting && !taken && !writing ? props.glimpsed : undefined}
                onPlace={noting && !taken && !writing ? (on) => acting.onPlace({ scene: scene.name, at: restsAt, ...on }) : undefined}
                scrolled={scrolled}
              />
              {redone && (
                <Redone
                  key={redone.id}
                  review={review.id}
                  round={round.number}
                  scene={scene}
                  app={redone.app}
                  until={redone.until}
                  frame={frame}
                  marks={redone.outlined ? [{ id: redone.id, node: redone.on.element?.node, name: redone.on.element?.name }] : []}
                  closeOn={redone.outlined && !side && !live?.shown && !redoing ? [redone.id] : undefined}
                  shape={phone ?? WHOLE}
                  onMarks={(placed) => setPlaced({ view, at: placed })}
                  onPlaying={setRedoing}
                  still={still}
                  clock={redoneClock}
                  replays={replays}
                />
              )}
              <span className={`${CHIP} transition-opacity duration-450 ease-calm ${side ? "" : "opacity-0"}`}>Now</span>
            </span>
            {beside && (
              <span className={`${FRAMED} right-0 ${HALVES} transition-opacity duration-450 ease-calm starting:opacity-0 ${side ? "" : "opacity-0"}`}>
                {was(side && closeOn && !redone && closed ? closed : frame)}
                <span className={CHIP}>Before</span>
              </span>
            )}
            {peek && (
              <span className="absolute inset-0 z-2 animate-arrive overflow-hidden rounded-lg">
                {was()}
                <span className={CHIP}>Before</span>
              </span>
            )}
          </button>
          <Portal live={live} person={person} screen={screen} scrolled={() => scrolled.current?.()} />
          {/* Beside your pointer, what a click on the recording does: note what's under it, or take it over. */}
          <span ref={pill} aria-hidden className={`pointer-events-none absolute top-0 left-0 z-30 transition-opacity duration-150 ease-calm ${(stepIn || noteHere) && aiming ? "" : "opacity-0"}`}>
            <span className={TAG}>{noteHere ? "Note on this" : person ? `Take over as ${person}` : "Take over"}</span>
          </span>
          {active && (
            <div className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2 translate-y-1/2">
              <div className="animate-arrive">
                <Bar
                  live={taken ? (live.inApp ? "shown" : "waiting") : undefined}
                  latest={acting.latest}
                  compare={comparing}
                  noting={noting}
                  onNote={taken && !live.inApp ? undefined : acting.onNote}
                  onTakeOver={acting.onTakeOver}
                  onBack={acting.onBack}
                  scene={scene.name}
                />
              </div>
            </div>
          )}
          {!taken && !peek && (
            <div className={`pointer-events-none absolute inset-y-0 left-0 z-1 transition-[width] duration-450 ease-calm ${side ? `${HALVES} overflow-hidden rounded-lg` : "w-full"}`}>
              <Pinned
                pins={!placedHere ? [] : redone ? pins.filter((pin) => pin.id === redone.id && redone.outlined) : pins}
                placed={placedHere ?? {}}
                open={open}
                faded={!!playing || scrubbing || (!!redone && redoing) || !placedHere}
                onOpen={(id) => (writing && id !== writing.note.id ? acting.onClose() : opened(id))}
              />
            </div>
          )}
        </div>
        </div>
        </div>
        {/* Its way beside the recording, from where it stands and what the agent said first to its end, held still with it:
            what moves as you go is where you are on it. A little wider than the way, so the surface the stop you're on
            sits on, which reaches past it, fades with it. */}
        <div ref={column} className="-mx-3 min-h-0 overflow-y-clip px-3 phone:overflow-visible">
          <div ref={way} className="transition-[translate] duration-300 ease-calm">
            <div className="grid content-start gap-5 pb-5">
              {/* Where it stands, and what its recording shows when it's not the scene's own: never over the recording. */}
              <span className="flex min-h-[21px] flex-wrap items-baseline gap-x-1.5 gap-y-0.5 px-0.5 text-xs leading-[21px]">
                {redone && <span className="text-soft">Showing what you did, done again</span>}
                {redone && standing && SAYS.includes(standing.is) && <span className="text-faint">·</span>}
                {standing && SAYS.includes(standing.is) && <span className={INK[standing.is]}>{says(standing)}</span>}
                {standing && SAYS.includes(standing.is) && same && <span className="text-faint">·</span>}
                {same && <span className="text-faint">Unchanged</span>}
                {standing?.is === "good" && <span className="text-green">Looks good</span>}
              </span>
              {scene.line && (
                <div inert={taken} className={`px-0.5 text-[13px] transition-opacity duration-300 ease-calm ${taken ? "opacity-35" : ""}`}>
                  <Said who={round.by}>{scene.line}</Said>
                </div>
              )}
            </div>
            <Steps
              scene={scene}
              clock={clock}
              at={at}
              cut={cut}
              stops={stops}
              on={Math.min(stop, last)}
              marks={onLine}
              changesIn={changesIn}
              added={(step) => added.has(step)}
              onChange={(id) => {
                const diamond = diamonds.find((diamond) => diamond.id === id);
                if (diamond) toChange(diamond);
              }}
              said={said}
              end={atEnd}
              since={since}
              onUnfold={unfold}
              resting={taken}
              onStop={props.onPressed}
              onPoint={setLit}
              onScrub={(on) => (on && ((setPlaying(undefined), setPicked(undefined))), setScrubbing(on))}
              onGo={stopped}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// What changed is outlined in the recording's own dark ink, as the frame drew it.
const RECORDED_INK = "#2b2e35";
// A recording's picture; side by side, each round's half, with room between them; and what each is, at its top left.
const FRAMED = "absolute inset-y-0 overflow-hidden rounded-lg bg-paper shadow-frame";
const HALVES = "w-[calc(50%-8px)]";
const CHIP = "pointer-events-none absolute top-2.5 left-2.5 z-3 rounded-md bg-ground px-2 py-0.5 text-xs leading-4 text-soft shadow-tip";

// What you did in the app, done again on this round's work as the agent recorded it, over the scene's recording: it
// plays once from where you took the scene over to where the answer shows, and rests there.
function Redone(props: {
  review: string;
  round: number;
  scene: Scene;
  app: NonNullable<Place["app"]>;
  until: number;
  frame?: Frame;
  marks: Mark[];
  closeOn?: string[];
  // The picture's shape, its width over its height, which it's close in: a phone's, or any scene's.
  shape: number;
  onMarks: (placed: Placed) => void;
  onPlaying: (playing: boolean) => void;
  // Arrived on or passed, it rests where it ends, still, as arriving is calm; stopped on, it plays.
  still: boolean;
  // Its clock, for what's beside it to follow; and how many times Compare has come on, each a time to play it again.
  clock: RefObject<Clock | undefined>;
  replays: number;
}) {
  const { app } = props;
  const [fork] = useState<Scene>(() => ({ ...props.scene, recording: app.recording, length: app.length, steps: app.steps ?? [] }));
  const cut = useCut(props.review, props.round, fork);
  const [from] = useState(() => (props.still ? props.until : app.from.at));
  const [clock] = useState(() => new Clock(from));
  props.clock.current = clock;
  const [at, setAt] = useState(from);
  const [playing, setPlaying] = useState<{ until: number }>();
  // It plays once it knows its waits, to cut them short as a step's are, from where you took it over.
  const played = useRef(false);
  useEffect(() => void (cut && !props.still && !played.current && ((played.current = true), clock.set(app.from.at), setAt(app.from.at), setPlaying({ until: props.until }))), [cut, props.still]);
  const [replayed] = useState(props.replays);
  useEffect(() => void (props.replays > replayed && (clock.set(app.from.at), setAt(app.from.at), setPlaying({ until: props.until }))), [props.replays]);
  useEffect(() => props.onPlaying(!!playing), [playing]);
  useEffect(() => () => props.onPlaying(false), []);
  return (
    <span className="absolute inset-0 z-2 animate-arrive">
      <Player
        review={props.review}
        round={props.round}
        recording={fork.recording}
        at={at}
        playing={playing}
        cut={cut}
        clock={clock}
        onStop={(moment) => (setAt(moment), setPlaying(undefined))}
        frame={props.frame}
        marks={props.marks}
        closeOn={playing || !props.closeOn ? undefined : { on: props.closeOn, shape: props.shape }}
        onMarks={props.onMarks}
      />
    </span>
  );
}

// A picture that gives way to the next softly, the one before staying under it until the next has come.
function Still({ src, frame }: { src: string; frame?: Frame }) {
  const [under, setUnder] = useState(src);
  const [over, setOver] = useState(src);
  if (src !== over) (setUnder(over), setOver(src));
  return (
    <>
      <Picture key={`under ${under}`} shot={{ src: under, frame }} />
      <span key={`over ${over}`} className="absolute inset-0 animate-arrive">
        <Picture shot={{ src: over, frame }} />
      </span>
    </>
  );
}

// What a thread on the page can do: judge an answer, say what's still not right, change a note not sent yet.
export type Threads = {
  you: string;
  readOnly: boolean;
  unfinished: Record<string, string>;
  onUnfinished: (id: string, words: string | undefined) => void;
  onJudge: (note: Shown, said: Verdict | Replied | undefined) => void;
  onEdit: (id: string, words: string | undefined) => void;
};

// A step's end: the next one's start, or the scene's end. Its page is read there.
const stepEnd = (scene: Scene, step: number) => scene.steps[step + 1]?.at ?? scene.length;

// A moment of one stretch, as far into the other as it is into its own, between the moments paired in both.
function along(moment: number, here: number[], there: number[]): number {
  const i = clamp(here.findLastIndex((at) => at <= moment), 0, here.length - 2);
  const u = clamp((moment - here[i]!) / Math.max(here[i + 1]! - here[i]!, 0.01), 0, 1);
  return there[i]! + u * (there[i + 1]! - there[i]!);
}

// A scene's steps side by side, each in the shape of half the picture: all the same part of the page, its whole
// height, and across it, where the scene works. A half shows no more of the page than its height without leaving room
// empty, and closer, a step's view cuts off what's around what it acted on, which is what the step is about; one place
// for all its steps, nothing moves between them. Where the scene works is what changed in each step, the first thing
// found, or where nothing did, what the step acted on, the last thing clicked or typed in that's still there and is a
// thing rather than a stretch of the page clicked away on; and where the hand went to get there, in the step's last few
// seconds; each with the row, panel or bar it's in. A step that goes to another page is where it went, not where it works.
function useFrames(review: Review, round: Round, scene: Scene, readings: Reading[] | undefined, changedIn: (step: number) => Place[]): (Frame | undefined)[] {
  const [frames, setFrames] = useState<(Frame | undefined)[]>([]);
  useEffect(() => {
    let current = true;
    if (readings)
      recording(review.id, round.number, scene.recording).then((events) => {
        const { acted, pointer, loads } = recorded(events);
        const found = scene.steps.map((step) => readings.find((one) => one.step === step.title));
        const works = scene.steps.flatMap((step, i) => {
          const reading = found[i];
          const end = stepEnd(scene, i);
          if (!reading || i === 0 || loads.some((load) => load > step.at && load <= end)) return [];
          const { width, height } = reading.screen;
          const hand = pointer.filter(([moment]) => moment >= Math.max(step.at, end - 3) && moment <= end).map(([, x, y]) => ({ x, y, width: 0, height: 0 }));
          const worked = acted
            .filter(([moment]) => moment >= step.at && moment <= end)
            .toReversed()
            .map(([, node]) => reading.things.find((thing) => thing.node === node))
            .find((thing) => thing && thing.box.width * thing.box.height < (width * height) / 8)?.box;
          const what = changedIn(i).map((on) => boxIn(reading, on)).find(Boolean) ?? worked;
          return [...(what ? [what] : []), ...hand].flatMap((box) => [box, panelOf(reading, box) ?? box]);
        });
        const screen = found.find(Boolean)?.screen;
        const frame = screen && around(works.length ? union(works) : { x: screen.width / 2, y: 0, width: 0, height: screen.height }, screen, HALF, 1);
        if (current) setFrames(found.map((reading) => reading && frame));
      });
    return () => void (current = false);
  }, [review.id, round.number, scene.recording, !!readings]);
  return frames;
}

// The row, panel or bar something on a page is in, the innermost one there's room for across half the picture.
function panelOf(reading: Reading, box: Box): Box | undefined {
  const { width: across, height: down } = reading.screen;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  return [...reading.things.filter((thing) => thing.role === "box" || thing.role === "dialog"), ...(reading.items ?? [])]
    .map((one) => one.box)
    .filter((one) => one.width > box.width && one.width <= Math.min(down, across / HALF) * HALF && x >= one.x && x <= one.x + one.width && y >= one.y && y <= one.y + one.height)
    .sort((a, b) => a.width * a.height - b.width * b.height)[0];
}

// Where something that changed is on a page: the things there by its role and name, or its part of the page.
function boxIn(reading: Reading, on: Place): Box | undefined {
  const { width: across, height: down } = reading.screen;
  const named = (role: string, name: string) => on.element?.role === role && on.element.name === name;
  const boxes = [
    ...reading.things.filter((thing) => named(thing.role, thing.name)).map((thing) => thing.box),
    ...(reading.items ?? []).filter((item) => named(item.role, item.words)).map((item) => item.box),
    ...(on.box ? [{ x: on.box.x * across, y: on.box.y * down, width: on.box.width * across, height: on.box.height * down }] : []),
  ];
  return boxes.length ? union(boxes) : undefined;
}

// A scene's picture is this wide for its height; side by side, each round has half of it, as tall as the whole.
const WHOLE = 1.6;
const HALF = 0.8;

// How much of the window's foot the one step to take floats over, in pixels, which a way that goes up keeps clear of.
const FOOT = 72;

// What a scene's standing says in words beside its Looks good, and when it can be judged at all.
const SAYS: Standing["is"][] = ["not saved", "needs you", "to send", "with the agent", "looked good"];
const JUDGED: Standing["is"][] = ["good", "is it good", "needs you", "looked good"];

const INK: Record<Standing["is"], string> = {
  good: "text-green",
  "looked good": "text-amber-ink",
  "to watch": "text-faint",
  "not saved": "text-amber-ink",
  "needs you": "text-amber-ink",
  "is it good": "text-amber-ink",
  "to send": "text-amber-ink",
  "with the agent": "text-slate",
};
