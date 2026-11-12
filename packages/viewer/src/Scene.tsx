// A scene: whose it is and what they do, where it stands, and its recording, with its way through beside it. Each step
// is a place: gone to, the recording plays into its result. A note or a change gone to is on the recording at its
// moment, lit; an answer to a note made in the app, what you did there done again, as the agent recorded it. Watching
// does nothing to the app: wherever it rests, the app is a press away, Take over, as who the scene is done as, made ready
// only then, and Escape lays the recording back over it. It arrives at the answer waiting on you, else at the first
// step's result. What's drawn on it, and what the bar does, is about the moment it's at: the notes there, outlined, what
// changed there, a note made there, the app. C held is how it was before the work, at the same moment, in place;
// pressed, the two side by side, each close on the step's part of the page. At an answer to a note made in the app, how
// it was is what you did then, played again beside what you did, done again.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import { inStep, type Scene, type Place, type Review, type Round, type Verdict } from "@playthrough/review";
import { picture, readings as readingsOf, recording } from "./api.ts";
import { Bar } from "./Bar.tsx";
import { HOLD, Said } from "./Card.tsx";
import { answersTo, type Diamond } from "./changes.ts";
import { endOf } from "./Chosen.tsx";
import { clamp } from "./moments.ts";
import { Conversation } from "./Notes.tsx";
import { fill, ink, type Replied, type Shown, type Standing } from "./notes.ts";
import { asWho, personAt } from "./people.ts";
import { around, Picture, union, type Box, type Frame } from "./Picture.tsx";
import { onPhone } from "./phone.ts";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Clock, CLOSEST, Player, useCut, type Mark, type Placed } from "./Player.tsx";
import { Portal, TAG } from "./Portal.tsx";
import { regionsOf } from "./regions.ts";
import { recorded, type Scrolled } from "./replay.ts";
import { says } from "./Step.tsx";
import { Steps, stepStart, type OnLine, type Saying, type Stop } from "./Steps.tsx";
import { GLIDE } from "./view.ts";
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
  madeInApp: (id: string) => boolean;
  standing?: Standing;
  onLooksGood?: (scene: string) => void;
  threads: Threads;
  diamonds: Diamond[];
  acting: Acting;
  active: boolean;
  // A stop gone to from elsewhere on the page: by the keys or the wheel, or a note's, by its id; held, the page scrolls
  // to keep it where the way is gone through.
  go?: { stop?: number; note?: string; held?: boolean };
  // In its way's column, the scenes before it and after it, a line each, and the review's end; and its own line, open,
  // over its way.
  above?: ReactNode;
  heading?: ReactNode;
  below?: ReactNode;
  // A verdict said on it: an answer judged, or Looks good at the end of the way.
  onSaid: () => void;
};

export function SceneView(props: SceneViewProps) {
  const { review, round, before, scene, changed, readings, notes, standing, onLooksGood, threads, diamonds, acting, active } = props;
  const end = scene.length - 0.05;
  const stepOf = (at: number) => Math.max(0, scene.steps.findIndex((_, i) => stepEnd(scene, i) >= at - 0.05));
  // A note's moment: where it was made, or made in the app, where the app was taken over.
  const momentOf = (note: { on?: Place }) => (note.on?.app ? note.on.app.from.at : note.on?.at);
  // A note is a stop on the way while it's open for you: its answer waits on you, or what you said on it isn't sent.
  // The rest ask nothing of you, settled or with the agent, and are a line each in their step: as stops, a way three
  // rounds on was as many settled notes as steps, each gone through.
  const asks = (note: Shown) => note.state === "needs you" || note.unsent;
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
  const boxesOf = (changes: Diamond["changes"], reading: Reading) =>
    changes.flatMap(({ on }) => [
      ...[on.element, ...(on.alike ?? [])].flatMap((element) => (element?.node === undefined ? [] : reading.things.filter((thing) => thing.node === element.node).map((thing) => thing.box))),
      ...(on.box ? [{ x: on.box.x * reading.screen.width, y: on.box.y * reading.screen.height, width: on.box.width * reading.screen.width, height: on.box.height * reading.screen.height }] : []),
    ]);
  const readingOf = (step: number) => readings?.find((one) => one.step === scene.steps[step]?.title);
  // What changed only off the screen a step was read on can't be seen in its recording: it isn't met here.
  const unseen = (diamond: Diamond) => {
    const reading = readingOf(stepOf(changeAt(diamond)));
    const boxes = reading ? boxesOf(diamond.changes, reading) : [];
    return boxes.length > 0 && !regionsOf(boxes, reading!.screen).length;
  };
  const onLine: OnLine[] = [
    ...notes.flatMap((note) => (momentOf(note) === undefined ? [] : [{ id: note.id, at: Math.min(momentOf(note)!, end), fill: fill(note), words: note.turns[0]?.words ?? "Your note" }])),
    ...(writing ? [{ id: writing.note.id, at: Math.min(writingAt!, end), fill: "bg-amber", words: "Your new note" }] : []),
    ...diamonds.filter((diamond) => diamond.row && diamond.until === undefined && !unseen(diamond)).map((diamond) => ({ id: diamond.id, at: changeAt(diamond), words: diamond.name })),
  ];
  // A step's result, where it rests once it has played.
  const results = scene.steps.map((_, i) => stepEnd(scene, i) - 0.05);
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
  // The way through it is every step, each a place to be, with the notes open for you in it at their moments, in the
  // order they come; then those about all of it, and its end. Where only a step with something new to you was a stop,
  // the steps between were the scene's story, played through on the way: here each is somewhere you'd be, and try it.
  const aboutAll = [...notes.filter((note) => momentOf(note) === undefined && asks(note)).map((note) => ({ step: -1, id: note.id })), ...(ours && !writing ? [{ step: -1, id: ours.note.id }] : [])];
  const saidIn = (step: number) =>
    onLine
      .filter((mark) => mark.fill && (mark.id === writing?.note.id || notes.some((note) => note.id === mark.id && asks(note))) && stepOf(mark.at) === step)
      .sort((a, b) => a.at - b.at)
      .map((mark) => ({ step, at: mark.at, id: mark.id }));
  const cut = useCut(review.id, round.number, scene);
  const stops: Stop[] = [...scene.steps.flatMap((_, i) => [{ step: i, at: results[i]! }, ...saidIn(i)]), ...aboutAll];
  const last = stops.length - (atEnd ? 0 : 1);
  // Arriving, it's on the answer waiting on you; else at its first step's result, the first place to be.
  const waiting = notes.find((note) => note.state === "needs you" && momentOf(note) !== undefined);
  const [clock] = useState(() => new Clock(waiting ? Math.min(momentOf(waiting)!, end) : results[0]!));
  const [at, setAt] = useState(clock.at);
  const [playing, setPlaying] = useState<{ until: number }>();
  // Dragged along a step's line, it follows the line, and where it's let go, it rests.
  const [scrubbing, setScrubbing] = useState(false);
  // The stop you're on: arriving, that answer, else the first step. What was said there is open beside its thing, as is
  // what you open on the recording.
  const [stop, setStop] = useState(() => (waiting ? stops.findIndex((one) => one.id === waiting.id) : 0));
  const [picked, setPicked] = useState(waiting?.id);
  // Still on the stop it arrived on, or passed on the way, it's as it was found: nothing plays until you stop there.
  const [still, setStill] = useState(true);
  const go = (moment: number, id?: string) => (clock.set(moment), setAt(moment), setPlaying(undefined), setPicked(id));
  const playTo = (until: number, from = clock.at) => (clock.set(from), setAt(from), setPicked(undefined), setPlaying({ until }));
  const pause = () => (setAt(clock.at), setPlaying(undefined));
  // Come to rest, played or dragged to, what was said at the stop you're on stays open.
  const stopped = (moment: number) => go(moment, stops[stop]?.id);
  const startOf = (step: number) => stepStart(scene, step, cut);
  // Gone to, a step plays into its result from its start; what was said in one is there at its moment; what was said
  // about all of it, where it is; its end, at the last step's result.
  const toStop = (to: number) => {
    const k = Math.min(to, stops.length);
    setStop(k);
    setStill(false);
    const there = stops[k];
    if (!there && k < 0) return void (playing && pause());
    if (!there) return void go(results.at(-1)!);
    if (there.id === undefined) return void playTo(there.at!, startOf(there.step));
    if (there.at === undefined) setPicked(there.id);
    else go(there.at, there.id);
  };
  const [holds, setHolds] = useState(0);
  useLayoutEffect(() => {
    const k = props.go?.note ? stops.findIndex((one) => one.id === props.go!.note) : props.go?.stop;
    if (k !== undefined && k >= 0) toStop(k);
    if (props.go?.held) setHolds((times) => times + 1);
  }, [props.go]);
  // Gone to by the keys or the wheel, the stop you're on is held a third of the way down the window, or on a phone just
  // under the app, and the page scrolls the way by under it, a stop at a time; pressed, it stays where you pressed it.
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const room = section.current?.closest<HTMLElement>("[data-room]");
    const row = section.current?.querySelector<HTMLElement>("li[aria-current=step]");
    if (!holds || !room || !row || !stage.current) return;
    const top = room.getBoundingClientRect().top;
    const line = onPhone() ? stage.current.getBoundingClientRect().bottom - top + 12 : room.clientHeight / 3;
    glide(room, room.scrollTop + row.getBoundingClientRect().top - top - line);
  }, [holds]);
  // Opened on the recording, or just saved, what was said there is the stop you're on, there and then; closed there, it
  // isn't open.
  const opened = (id?: string) => (id && stops.some((one) => one.id === id) && setStop(stops.findIndex((one) => one.id === id)), setPicked(id));
  // A note begun is the stop you're on, as you write it; let go unsaved, you're back on the stop you were on.
  const [begun, setBegun] = useState<{ id: string; from: number }>();
  if (ours?.note.id !== begun?.id) {
    if (ours) (setBegun({ id: ours.note.id, from: stop }), setStop(stops.findIndex((one) => one.id === ours.note.id)));
    else (setBegun(undefined), begun && !stops.some((one) => one.id === begun.id) && setStop(begun.from));
  }
  // Playing, a click on it pauses it. Where it can't be taken over, a click plays on into the stop you're on, and there,
  // plays into it again from its step's start; before any stop, or on what was said about all of it, the step it shows.
  const again = () => {
    if (playing) return pause();
    const there = stops[Math.min(stop, stops.length - 1)];
    if (there?.at === undefined) return toStop(stops.findIndex((one) => one.id === undefined && one.step === stepOf(clock.at)));
    if (clock.at < there.at - 0.01) playTo(there.at);
    else playTo(there.at, startOf(there.step));
  };

  // Compared, the step of the same name, as far into it as now is into its own: before the work, or beside an answer,
  // when it was said; and what that side is called.
  const [against, setAgainst] = useState(0);
  const [named, setNamed] = useState("Before");
  const sceneOn = (number: number) => (number ? review.rounds.find((kept) => kept.number === number) : before)?.scenes.find((one) => one.name === scene.name);
  const then = sceneOn(against);
  const step = stepOf(at);
  const thenStep = then?.steps.findIndex((one) => one.title === scene.steps[step]?.title) ?? -1;
  // In the step of the same name, at the same action, as every Compare pairs the two: by what both did there.
  const thenAt = (moment: number) => (then?.steps.some((one) => one.title === scene.steps[stepOf(moment)]?.title) ? inStep(moment, scene, then) : undefined);
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
  const press = (number: number, called: string) => {
    setAgainst(number);
    setNamed(called);
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
  // Compare is how it was, for what you're on, and it's on the bar alone: before the work, at the same moment, as a pull
  // request's diff is against where it branched; at an answer, the note's own then, the recording as it was when it was
  // last said (written, sent back, or judged), as before the work often had nothing of what it's on; at an answer to a
  // note made in the app, what you did then. What's new since you last looked is marked, never compared with: a third
  // side, Last time, counted from a different round in each scene and for each person, none of them seen. Beside each
  // answer and each change in the way, it was a second and a third Compare, each comparing with something else.
  const atNote = notes.find((note) => note.id === stops[stop]?.id);
  const lastSaid = atNote?.turns.findLast((turn) => !turn.agent && turn.round < round.number);
  const thenOf = lastSaid ? { number: lastSaid.round, named: lastSaid.by === threads.you ? "When you said it" : "When it was said" } : { number: 0, named: "Before" };
  const comparing = sceneOn(thenOf.number) || redone?.then ? { on: side || peek, off: taken, onPress: () => press(thenOf.number, thenOf.named), onRelease: release } : undefined;
  // Side by side, going on to what has another then turns to it.
  if ((side || peek) && (against !== thenOf.number || named !== thenOf.named)) (setAgainst(thenOf.number), setNamed(thenOf.named));
  const noting = active && acting.noting;
  // C is the scene's you're on; in the app, it's the app's, and noting, it rests until you've chosen what it's on.
  // Gone to another, it stops.
  useEffect(() => {
    if (!active || taken || noting) return;
    const typing = (event: KeyboardEvent) => (event.target as Element).closest?.("input, textarea, [contenteditable]");
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event)) return;
      if (event.key.toLowerCase() === "c") comparing?.onPress();
    };
    const up = (event: KeyboardEvent) => event.key.toLowerCase() === "c" && release();
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => (removeEventListener("keydown", down), removeEventListener("keyup", up));
  });
  useEffect(() => void (!active && playing && pause()), [active]);
  // Noting, it stops where it is: a note is made on the moment it's at; in the app, on what you click there.
  useEffect(() => void (noting && playing && pause()), [noting]);
  // At rest on the scene you're on, that's where Take over takes it over; at a note made in the app, it's taken over
  // the way it was found, what you did done again in the app.
  const restsAt = Math.round(at * 100) / 100;
  const resting = active && !playing && !scrubbing && !taken;
  const atStop = stops[stop]?.id;
  const appNote = atStop !== undefined && props.madeInApp(atStop) ? atStop : undefined;
  useEffect(() => void (resting && acting.onRest(scene.name, restsAt, appNote)), [resting, restsAt, appNote]);
  // And there, it's a click from being the app: pointing at it says so beside your pointer, as who it's done as.
  const person = personAt(scene, restsAt);
  const stepIn = resting && !live?.shown && !noting && !acting.writing ? acting.onTakeOver : undefined;
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
  const changedHere = diamonds.filter((diamond) => diamond.row && shown(Math.min(diamond.at, end)));
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
  // What changed at a moment is outlined a part of the page at a time, where its step was read; else each thing.
  const changedMarks = (diamond: Diamond): Mark[] => {
    const reading = readingOf(stepOf(changeAt(diamond)));
    const regions = reading ? regionsOf(boxesOf(diamond.changes, reading), reading.screen) : [];
    if (!regions.length) return diamond.changes.flatMap(({ on }, i) => marksOn(`${diamond.id} ${i}`, on));
    const { width, height } = reading!.screen;
    return regions.map((box, i) => ({ id: `${diamond.id} ${i}`, box: { x: (box.x - 4) / width, y: (box.y - 4) / height, width: (box.width + 8) / width, height: (box.height + 8) / height } }));
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
    ...here.map((note) => ({ id: note.id, on: [note.id, ...(note.id === chosen ? answeredMarks.map((mark) => mark.id) : [])], ink: ink(note), fill: fill(note) })),
    ...changedHere.map((diamond) => ({ id: diamond.id, on: changedMarks(diamond).map((mark) => mark.id), ink: RECORDED_INK, diamond: true as const })),
    ...(writing ? [{ id: writing.note.id, on: [writing.note.id], ink: "var(--amber)", fill: "bg-amber" }] : []),
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

  // What was said at a stop: a note open for you, its thread, or the one you're writing. Its sign on the rail is a dot in
  // its colour: the rail's numbers are the steps', and a note's number beside them read as one more step.
  const [reading, setReading] = useState<string[]>([]);
  const thread = (note: Shown, onFold?: () => void) => (
    <Conversation
      onFold={onFold}
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
    />
  );
  // Folded, a note's line is its first words and where it stands, in the words the line under the title counts it by.
  const lineOf = (words: ReactNode, stands: string) => (
    <p className="flex min-w-0 items-baseline gap-2 pr-2 text-[13px] leading-5">
      <span className="min-w-0 flex-1 truncate">{words}</span>
      <span className="flex-none text-[12px] text-amber-ink">{stands}</span>
    </p>
  );
  const said = (id: string): Saying => {
    if (id === ours?.note.id)
      return {
        sign: <span className="size-2 rounded-full bg-amber" />,
        line: lineOf("Your new note", ""),
        whole: <div className="grid gap-2.5 pt-1 pb-1.5 text-[13px]">{ours.words}</div>,
      };
    const note = notes.find((note) => note.id === id)!;
    // At an answer to a note made in the app, what the frame shows is what you did, done again, said where you are,
    // never over it.
    const whole = (
      <>
        {redone?.id === id && <p className="pb-2 text-xs leading-4 text-soft">Showing what you did, done again</p>}
        <div className="-my-2 -ml-4">{thread(note)}</div>
      </>
    );
    return { sign: <span className={`size-2 rounded-full ${fill(note)}`} />, line: lineOf(note.turns[0]?.words, note.unsent ? "To send" : "To check"), whole };
  };
  // A note that asks nothing of you is a line in its step, as a resolved conversation is: its first words and where it
  // stands, opening when pressed and folding again from its thread.
  const told = (note: Shown) =>
    reading.includes(note.id) ? (
      <div key={note.id} data-note={note.id} className="-mx-4 -mb-1">
        {thread(note, () => setReading(reading.filter((one) => one !== note.id)))}
      </div>
    ) : (
      <button
        key={note.id}
        data-note={note.id}
        className="flex w-full min-w-0 items-center gap-2 pr-2 text-left text-[12.5px] leading-[18px] text-soft hover:text-fg"
        aria-expanded={false}
        onClick={() => setReading([...reading, note.id])}
      >
        <i className={`size-1.5 flex-none rounded-full ${fill(note)}`} />
        <span className="min-w-0 flex-1 truncate">{note.turns[0]?.words}</span>
        <span className={`flex-none text-[12px] ${note.state === "settled" ? "text-green" : "text-slate"}`}>{note.state === "settled" ? "Settled" : note.state === "with the agent" ? "With the agent" : `Waiting for ${note.waitingFor.join(" and ")}`}</span>
      </button>
    );
  const quietIn = (step?: number) => {
    const these = notes.filter((note) => !asks(note) && (step === undefined ? momentOf(note) === undefined : momentOf(note) !== undefined && stepOf(Math.min(momentOf(note)!, end)) === step));
    return these.length ? <div className="grid gap-1.5 pt-1">{these.map(told)}</div> : undefined;
  };

  // What changed new to you in a step is met under its line, where its diamond is, not as a stop of its own: what the
  // agent says of it, its name once over all it says in the step, or that it was made for a note of yours. Gone to, the
  // recording is at its moment, close on it, a part of the page at a time outlined, and the bar's Compare shows how it
  // was. Steps new to you start with what the agent says of them, on the first.
  const toChange = (diamond: Diamond) => go(changeAt(diamond), diamond.id);
  // Steps new to you are one stretch, marked once above its first with how many, so where it ends is plain. Why, in the
  // agent's words, is under the first one's line, where every step's why is: between the steps on its own, it read as
  // neither the step's nor the scene's.
  const runFrom = (step: number) => diamonds.find((diamond) => diamond.until !== undefined && scene.steps.findIndex((one) => one.at >= diamond.at - 0.1) === step);
  const newFrom = (step: number) => {
    const run = runFrom(step);
    if (!run) return undefined;
    const count = scene.steps.filter((one) => one.at >= run.at - 0.1 && one.at < run.until!).length;
    return (
      <li className="flex items-center gap-2.5 pt-1 pb-2.5 pl-8 pr-2 text-[12px] leading-4 font-medium text-soft">
        {count > 1 ? `${count} new steps` : "New step"}
        <i className="h-px flex-1 bg-track" />
      </li>
    );
  };
  const linesOf = (diamond: Diamond) => [...new Map(diamond.changes.filter((changed) => !changed.answers && changed.line).map((changed) => [changed.line, changed])).values()];
  const changesIn = (step: number) => {
    const here = diamonds.filter((diamond) => diamond.row && diamond.until === undefined && stepOf(changeAt(diamond)) === step && !unseen(diamond));
    // Made for a note in another scene, it's told by what the agent said it did for it.
    const answerTo = (diamond: Diamond) => {
      const note = diamond.changes.map((changed) => !changed.answers && changed.note && props.noteOf(changed.note)).find(Boolean) || undefined;
      return note && { note, turn: note.turns.findLast((turn) => turn.agent && turn.round <= round.number && turn.words.trim()) };
    };
    const run = runFrom(step);
    const fresh = run ? linesOf(run) : [];
    const by = [...fresh, ...here.flatMap(linesOf)][0]?.by ?? here.map((diamond) => answerTo(diamond)?.turn?.by).find(Boolean);
    if (!here.length && !fresh.length) return undefined;
    return (
      <div className="grid gap-1.5 pt-1 pr-2">
        {by && <span className="text-[11.5px] leading-4 text-faint">{by}</span>}
        {fresh.map((changed) => (
          <p key={changed.line} className="text-[12.5px] leading-[18px] text-soft">
            {changed.line}
          </p>
        ))}
        {here.length > 0 && (
          <ul className="grid gap-2.5">
            {here.map((diamond) => {
              const told = linesOf(diamond);
              const answered = answerTo(diamond);
              const madeFor = answered?.note;
              const words = (answered?.turn?.words ?? "Changed for your note").trim();
              const on = picked === diamond.id;
              return (
                <li key={diamond.id} className="flex min-w-0 items-start gap-2" onPointerEnter={() => setLit(diamond.id)} onPointerLeave={() => setLit(undefined)}>
                  <button
                    className={`flex min-w-0 flex-1 items-start gap-2 py-0.5 text-left text-[12.5px] leading-[18px] transition-colors duration-150 ease-calm hover:text-fg ${on ? "text-fg" : "text-soft"}`}
                    onClick={() => toChange(diamond)}
                  >
                    <i className={`mt-[5.5px] size-[7px] flex-none rotate-45 ${on ? "bg-fg" : "bg-soft"}`} />
                    <span className="min-w-0 flex-1">
                      {madeFor ? (
                        // The note's dot goes with its last word, never onto a line of its own, its words there when pointed at.
                        <>
                          {words.slice(0, words.lastIndexOf(" ") + 1)}
                          <span className="whitespace-nowrap">
                            {words.slice(words.lastIndexOf(" ") + 1)}
                            <i title={madeFor.turns[0]?.words} className={`ml-1.5 inline-block size-1.5 -translate-y-px rounded-full ${fill(madeFor)}`} />
                          </span>
                        </>
                      ) : told.length ? (
                        told.map((changed, i) => (
                          <span key={changed.line} className={i ? "block pt-1" : undefined}>
                            {changed.line}
                          </span>
                        ))
                      ) : (
                        "Changed here"
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  const frames = useFrames(review, round, scene, readings, (step) => changed.filter((on) => on.at !== undefined && stepOf(on.at) === step));
  // At rest on a note or a change, the recording is close on what it's on, and on a step, it's the whole page as it
  // plays; and taken over, the whole page the app comes in as. Side by side, Now is close on it in its half, and Before
  // shows the same part of the page; else each is on the step's part of the page.
  const there = stops[stop];
  // What the recording rests close on: the note at the stop you're on, or the change gone to under its step.
  const change = diamonds.find((diamond) => diamond.id === picked && diamond.row);
  const focus = there?.id !== undefined && there.at !== undefined ? { id: there.id, at: there.at } : change && { id: change.id, at: changeAt(change) };
  const onIt = !!focus && !playing && !scrubbing && Math.abs(at - focus.at) < 0.02;
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
  const placedHere = placed?.view === view ? placed.at : undefined;
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
        <Still src={picture(review.id, against, then.recording, thenStep)} frame={frame} />
        <Player review={review.id} round={against} recording={then.recording} at={beforeAt} following={playing || scrubbing ? { clock, at: (moment) => thenAt(moment) ?? beforeAt } : undefined} frame={frame} />
      </>
    ) : (
      <span className="absolute inset-0 grid place-content-center bg-ground px-6 text-center text-[13px] leading-5 text-soft">{against ? `${named}, there was no such step` : then ? "Before the work, there was no such step" : "New: there was nothing like it before"}</span>
    );

  return (
    <section ref={section} data-scene={scene.name} data-stops={last + 1} data-stop={stop}>
      {/* The app, or its recording, held at the window's top while its way and the other scenes beside it go by; on a
          phone, they go by under it. */}
      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-8 phone:grid-cols-1 phone:gap-5">
        <div ref={stage} className="@container sticky top-6 z-10 phone:top-0 phone:-mx-4 phone:bg-ground phone:px-4 phone:pt-2 phone:pb-7">
        {/* A phone's sits against its way, as narrow as it is. */}
        <div className={phone ? "ml-auto transition-[width] duration-450 ease-calm" : undefined} style={phone ? { width: side ? `calc(${2 * phone} * ${high} + 16px)` : `calc(${phone} * ${high})` } : undefined}>
        {/* Its name is over its way; on a phone, where its way comes after it, it's over the app. */}
        <h3 className="mb-3 hidden min-w-0 px-0.5 text-[15px] leading-[21px] font-semibold text-balance phone:block">
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
                <span className={CHIP}>{named}</span>
              </span>
            )}
            {peek && (
              <span className="absolute inset-0 z-2 animate-arrive overflow-hidden rounded-lg">
                {was()}
                <span className={CHIP}>{named}</span>
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
        {/* Its way beside the recording, the scenes before it over it and the rest after it: its line, open, what the agent
            said of it, and its steps. While the app is yours, they rest, but for its name and what was said where you
            took it over. */}
        <div className="min-w-0">
          <div inert={taken} className={`transition-opacity duration-300 ease-calm ${taken ? "opacity-35" : ""}`}>
            {props.above}
          </div>
          {/* The scene you're in, set apart from the others' lines: its line open, and its way, in an edge of its own. */}
          <div data-way="" className="-mx-5 rounded-2xl px-5 pt-1.5 pb-2 shadow-[0_0_0_1px_var(--edge)] phone:-mx-3 phone:px-3">
          <div className="pb-3">
            {props.heading}
            {scene.line && (
              <div inert={taken} className={`pt-1 pr-0.5 pl-8 text-[13px] transition-opacity duration-300 ease-calm ${taken ? "opacity-35" : ""}`}>
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
            newFrom={newFrom}
            onChange={(id) => {
              const diamond = diamonds.find((diamond) => diamond.id === id);
              if (diamond) toChange(diamond);
            }}
            said={said}
            end={atEnd}
            quietIn={quietIn}
            resting={taken}
            onStop={toStop}
            onPoint={setLit}
            onScrub={(on) => (on && ((setPlaying(undefined), setPicked(undefined))), setScrubbing(on))}
            onGo={stopped}
          />
          </div>
          <div inert={taken} className={`transition-opacity duration-300 ease-calm ${taken ? "opacity-35" : ""}`}>
            {props.below}
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
export const CHIP = "pointer-events-none absolute top-2.5 left-2.5 z-3 rounded-md bg-ground px-2 py-0.5 text-xs leading-4 text-soft shadow-tip";

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

// When a scene can be judged at all.
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

// The page glides where it's sent, a frame at a time from wherever it is, so a turn of the wheel after another carries
// on from where the last one left it.
const gliding = new WeakMap<HTMLElement, number>();
export function glide(room: HTMLElement, to: number) {
  cancelAnimationFrame(gliding.get(room) ?? 0);
  const [from, end] = [room.scrollTop, clamp(to, 0, room.scrollHeight - room.clientHeight)];
  if (Math.abs(end - from) < 1) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return void (room.scrollTop = end);
  const since = performance.now();
  const frame = (now: number) => {
    const u = Math.min(1, (now - since) / GLIDE);
    room.scrollTop = from + (end - from) * (1 - (1 - u) ** 3);
    if (u < 1) gliding.set(room, requestAnimationFrame(frame));
  };
  gliding.set(room, requestAnimationFrame(frame));
}
