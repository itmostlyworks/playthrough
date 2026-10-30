// A review on one page: the recording is where you look, with what you can do to its moment on a bar across its bottom
// edge and what's open beside its spot; the timeline under it is the map of what's been said, and the foot is where you
// act. The view changes only when you change it: a new round says it's in, and waits for you.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { elementOf } from "@mostlyworks/vantage-page";
import { inStep, lastLooked, newId, readyToAccept, time, waitingForTheAgent, type Did, type Element as Thing, type Flow, type Note, type Point, type Place, type Review, type Round, type Send, type Verdict } from "@mostlyworks/vantage-review";
import { accept, keepBranch, recording, send, useReview, useYou } from "./api.ts";
import { Bar } from "./Bar.tsx";
import { Beside, clickedAt } from "./Beside.tsx";
import { HOLD } from "./Card.tsx";
import { answersTo, diamondAt, diamondsOn, grownFrom, type Changed, type Diamond } from "./changes.ts";
import { Chosen, rowsIn, settles, type Landed, type Props as ChosenProps } from "./Chosen.tsx";
import { Controls, type Look } from "./Controls.tsx";
import type { ForkLine } from "./Timeline.tsx";
import { useDraft, useWatched } from "./draft.ts";
import { grow, takeOff, type Taking } from "./flight.ts";
import { Foot, type Step } from "./Foot.tsx";
import { Grid } from "./Grid.tsx";
import { follow, pausedAt, readyAt, readyIn, samePaused, takenOver, type Live, type Paused } from "./live.ts";
import { along, CARD, clamp, FLOW_IN, momentAt, POSTER, type Moment } from "./moments.ts";
import { asIfSent, fill, ink, lookGood, notesOn, nothing, said, seen, sendOf, settledBefore, standings, takeBack, type Shown } from "./notes.ts";
import { NoteRow, number as numberLook, Writing, type Comparing } from "./Notes.tsx";
import { Playhead, useNow, type Forked } from "./playhead.ts";
import { changesIn, recorded } from "./replay.ts";
import { roundName } from "./Rounds.tsx";
import { Stage, type Bare, type Mark, type Placed, type Shown as Size } from "./Stage.tsx";
import { placeFrom, placeName as nameOf, placeOn, useReadings, watchedIn, type Read } from "./things.ts";
import { Wire } from "./Wire.tsx";

// What's open beside the recording: a note, a change you chose, or a new note being written, by its id.
type Open = { note: string } | { change: string } | { writing: string };
// A click noted in the app: what it's on there, what was done there before it, and where, in the app's page.
type NotedInApp = { element?: Thing; point?: Point; did: Did[]; x: number; y: number };

// Leaving every flow at once for one, the recording waits under its name until the pictures have landed, and this long
// after: one thing moves at a time.
const SETTLE = 400;
// Playing, the bar comes back while the pointer moves over the recording, and fades again this long after it stops.
const STIRRED = 1500;

export function ReviewPage({ id }: { id: string }) {
  const kept = useReview(id);
  const you = useYou();
  const title = Array.isArray(kept) ? undefined : kept?.title;
  useEffect(() => void (document.title = title ? `${title} · Vantage` : "Vantage"), [title]);
  if (Array.isArray(kept)) return <Page><p className="m-auto text-soft">{kept[0]}</p></Page>;
  if (!kept || !you) return <Page />;
  return <Reviewing review={seen(kept)} you={you} />;
}

export function Page({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden px-5 phone:px-4">
      <header className="flex min-h-[46px] min-w-0 items-center gap-2 py-2.5 text-soft">
        <a href="/" className="font-semibold text-fg">Vantage</a>
        {title && <span className="text-faint">/</span>}
        {title && <span className="truncate">{title}</span>}
      </header>
      {children}
    </div>
  );
}

// A round that arrives while you're on another one says it's in; it's yours to go to. Going to the newest round, you've
// seen it's there, and the older ones are for looking back.
function Reviewing({ review, you }: { review: Review; you: string }) {
  const latest = review.rounds.at(-1);
  const [viewing, setViewing] = useState(latest?.number);
  const [newest, setNewest] = useState(latest?.number);
  if (viewing === undefined && latest) {
    setViewing(latest.number);
    setNewest(latest.number);
  }
  const round = review.rounds.find((round) => round.number === viewing);
  if (!round || !latest) return <Page title={review.title}><p className="m-auto text-soft">Nothing’s been recorded yet. The first round shows here once the agent finishes it.</p></Page>;
  const choose = (number: number) => {
    setViewing(number);
    if (number === latest.number) setNewest(number);
  };
  return <OnRound review={review} round={round} latest={latest} arrived={latest.number !== newest} you={you} onRound={choose} />;
}

type OnRoundProps = { review: Review; round: Round; latest: Round; arrived: boolean; you: string; onRound: (round: number) => void };

function OnRound({ review: kept, round, latest, arrived, you, onRound }: OnRoundProps) {
  // What you've just sent shows as sent until the review comes back with it.
  const [posted, setPosted] = useState<Send>();
  const review = posted && !kept.sends.some((send) => send.id === posted.id) ? { ...kept, sends: [...kept.sends, posted] } : kept;
  const [draft, change] = useDraft(review.id, round.number);
  // A note made in the app before forks were part of their flow named a flow of its own.
  useEffect(() => {
    const own = (note: Note) => (note.on?.app && note.on.flow !== note.on.app.from.flow ? { ...note, on: { ...note.on, flow: note.on.app.from.flow } } : note);
    if ([...draft.notes, ...draft.unsaved].some((note) => own(note) !== note)) change((draft) => ({ ...draft, notes: draft.notes.map(own), unsaved: draft.unsaved.map(own) }));
  }, [draft, change]);
  // The round as it plays: each flow with your forks off it, where you took it over, carried on by hand and said
  // something there, from the notes you made in the app on it.
  const madeHere = [...review.sends.filter((send) => send.round === round.number).flatMap((send) => send.notes), ...draft.notes, ...draft.unsaved];
  const forks = JSON.stringify([...forksIn(madeHere), ...walkedIn(round)]);
  const forkList: Fork[] = useMemo(() => JSON.parse(forks), [forks]);
  const played = useMemo(() => forked(round, forkList), [round, forkList]);
  const [watched, see] = useWatched(review.id, round.number);
  const [open, setOpen] = useState<Open>();
  // The note whose Not quite is being written.
  const [asking, setAsking] = useState<string>();
  if (asking && !(open && "note" in open && open.note === asking)) setAsking(undefined);
  const [fresh, setFresh] = useState<string>();
  const [met, setMet] = useState<string[]>([]);
  // Looking at another round starts with nothing open.
  const [on, setOn] = useState(round.number);
  // Every flow at once: where you arrive on a round with more than one flow, and come back to. A round that's new to you
  // starts there too. One that arrives while you're on another leaves you where you are.
  const many = round.flows.length > 1;
  const [grid, setGrid] = useState(many);
  const onGrid = grid && many;
  const been = useRef([round.number]);
  if (on !== round.number) {
    setOn(round.number);
    setOpen(undefined);
    setGrid(many && !been.current.includes(round.number));
    been.current.push(round.number);
  }

  // You arrive at the start, as on a video before you press play. Going to another round keeps your place: the same flow
  // at the matching moment, or its start if that round never recorded the flow.
  const [playhead] = useState(() => new Playhead(played.flows, { flow: round.flows[0]?.name ?? "", at: POSTER }));
  useEffect(() => () => playhead.destroy(), [playhead]);
  const onRoundNow = useRef(round.number);
  useLayoutEffect(() => {
    if (onRoundNow.current === round.number) return playhead.keep(played.flows);
    onRoundNow.current = round.number;
    const from = playhead.flow;
    const to = played.flows.find((flow) => flow.name === from.name);
    playhead.pause();
    playhead.watch(played.flows, to ? { flow: to.name, at: inStep(playhead.now.moment.at, from, to) } : { flow: round.flows[0]?.name ?? "", at: -CARD });
  }, [round, played, playhead]);
  // On a fork, you're still watching its flow.
  const inPlay = useNow(playhead, (now) => now.moment.flow);
  const onFork = forkList.find((fork) => fork.name === inPlay);
  const watching = onFork?.from.flow ?? inPlay;
  const flow = round.flows.find((flow) => flow.name === watching) ?? round.flows[0];
  // Where the playhead is, as the foot's step needs it: playing, at a flow's start, partway, or at its end. A fork's end
  // isn't the flow's.
  const where = useNow(playhead, ({ moment, playing }) => {
    const length = playhead.flows.find((flow) => flow.name === moment.flow)?.length ?? 0;
    const forking = forkList.some((fork) => fork.name === moment.flow);
    return playing ? "playing" : moment.at >= length - 0.06 && !forking ? "end" : moment.at <= 0 ? "start" : "partway";
  });

  // Taking over: the moment the playhead rests on, on the latest round, is made ready after a beat of stillness and
  // loaded unseen, so Take over turns the frame into the app at once. Playing again, or going to another round, lays the
  // recording back over it; a round arriving doesn't.
  const [live, setLive] = useState<Live>();
  // How quickly the app has loaded and settled in the frame, from when its address came: on top of how long the moment
  // takes to be made ready, part of how long taking over takes. The quickest so far, as one slow load, a page the app
  // builds for the first time, isn't every load.
  const loading = useRef<{ since?: number; took?: number }>({});
  useEffect(() => void (live?.address && !live.settled && (loading.current.since = Date.now())), [live?.address]);
  // Not on a fork: taking one over carries it on from its end.
  const resting = useNow(playhead, ({ moment, playing }) => {
    const on = round.flows.find((flow) => flow.name === moment.flow);
    const paused = !playing && round === latest && !onGrid && on && moment.at >= 0 ? pausedAt(on, moment.at) : undefined;
    return paused && JSON.stringify({ flow: on!.name, paused });
  });
  useEffect(() => {
    // Taken over already, it's asked for as it's taken.
    if (!resting || live?.shown) return;
    const { flow, paused }: { flow: string; paused: Paused } = JSON.parse(resting);
    // Once it's ready, the app loads unseen in the frame, so Take over only has to show it.
    const soon = setTimeout(
      () => void readyAt(review.id, flow, paused).then((answer) => typeof answer === "string" && setLive((now) => (now?.shown ? now : { flow, paused, address: answer, shown: false }))),
      200,
    );
    return () => clearTimeout(soon);
  }, [resting, review.id]);
  const passing = useNow(playhead, ({ moment, playing }) => {
    const on = round.flows.find((flow) => flow.name === moment.flow);
    const paused = playing && round === latest && !onGrid && on && moment.at >= 0 ? pausedAt(on, moment.at) : undefined;
    return paused && JSON.stringify({ flow: on!.name, paused });
  });
  useEffect(() => {
    if (!passing) return;
    const { flow, paused }: { flow: string; paused: Paused } = JSON.parse(passing);
    follow(review.id, flow, paused);
  }, [passing, review.id]);
  const playingNow = useNow(playhead, (now) => now.playing);
  // Playing is watching: the bar over the recording fades as a video's controls do, and comes back while the pointer moves
  // over it, or rests on the bar.
  const [stirred, setStirred] = useState(false);
  const settle = useRef<number>(undefined);
  const stir = (lasting = STIRRED) => {
    setStirred(true);
    clearTimeout(settle.current);
    if (lasting !== Infinity) settle.current = window.setTimeout(() => setStirred(false), lasting);
  };
  const backToRecording = (at?: { x: number; y: number }) => {
    setLive((now) => now && { ...now, shown: false, at });
    window.focus();
  };
  if (live?.shown && (playingNow || on !== round.number)) setLive({ ...live, shown: false });
  // The note whose answer you're trying in the app, taken over where you made it.
  const trying = useRef<string>(undefined);
  // Letting go, what you did is kept only as far as you said something about it: you land at your last note on the
  // fork, or with nothing said, back where you took the flow over, with nothing left behind.
  const letGo = (at?: { x: number; y: number }) => {
    const kept = live?.shown && yours.current.address === live.address && forkList.find((fork) => fork.session === yours.current.id);
    if (kept) playhead.go({ flow: kept.name, at: kept.length });
    trying.current = undefined;
    backToRecording(at);
  };
  const letGoNow = useRef(letGo);
  letGoNow.current = letGo;
  // On a fork, taking over carries it on from its end: the flow taken over where you took it, your steps done again.
  // With the answer to a note made in the app open, it's taken over where you made the note, as Take over where you
  // were in its card does.
  const takeOver = () => {
    if (live?.shown) return letGo();
    if (openNote && whereYouWere.get(openNote.id)?.at !== undefined && openNote.on?.flow === watching) return tryWhereYouWere(openNote);
    trying.current = undefined;
    const base = onFork && round.flows.find((flow) => flow.name === onFork.from.flow);
    if (onFork && base) {
      starting.current = { from: onFork.from, carry: yours.current.id === onFork.session ? yours.current : undefined };
      return takeOverAt(base, onFork.from.at, onFork.did);
    }
    starting.current = { from: { flow: playhead.flow.name, at: Math.round(Math.max(0, playhead.now.moment.at) * 100) / 100 } };
    takeOverAt(playhead.flow, playhead.now.moment.at);
  };
  // A note made in the app on an earlier round is checked the way it was found, by trying it: this round's flow taken
  // over where you took it over then, what you did there done again, and in the app the note's pin on what it's on, its
  // card beside it.
  const tryWhereYouWere = (note: Shown) => {
    const was = whereYouWere.get(note.id);
    const flow = round.flows.find((flow) => flow.name === note.on?.flow);
    if (!flow || was?.at === undefined || round !== latest) return;
    trying.current = note.id;
    setOpen({ note: note.id });
    starting.current = { from: { flow: flow.name, at: was.at } };
    takeOverAt(flow, was.at, was.did);
  };
  const takeOverAt = (on: Flow, at: number, did?: Did[]) => {
    const paused = pausedAt(on, at);
    if (round !== latest || at < 0 || !paused) return;
    playhead.pause();
    // The app is now, alone: how it was goes.
    setPeek(false);
    chooseLook("one");
    if (!did && live && live.flow === on.name && samePaused(live.paused, paused) && live.address) {
      takenOver(review.id, on.name, paused);
      const { since, took } = loading.current;
      return setLive({ ...live, shown: true, at: undefined, due: !live.settled && since && took ? since + took : undefined });
    }
    // The one being made ready since you paused, if it is, and how long it will be, if the last run says.
    setLive({ flow: on.name, paused, shown: true });
    const same = (now: Live | undefined): now is Live => now?.flow === on.name && samePaused(now.paused, paused);
    readyAt(review.id, on.name, paused, did).then((answer) => {
      takenOver(review.id, on.name, paused);
      setLive((now) => (same(now) ? (typeof answer === "string" ? { ...now, address: answer } : { ...now, problems: answer, shown: false }) : now));
    });
    if (!did)
      void readyIn(review.id, on.name, paused).then(
        (left) => left !== undefined && setLive((now) => (same(now) && now.shown && !now.address ? { ...now, due: Date.now() + left + (loading.current.took ?? 0) } : now)),
      );
  };
  // The app's pages say when they've settled, and send Escape back here, as keys there never reach the viewer.
  useEffect(() => {
    const told = ({ data, source }: MessageEvent) => {
      // Only from the moment that's waiting: one just left can still be settling.
      const waiting = document.querySelector<HTMLIFrameElement>("[data-live] iframe")?.contentWindow;
      if (data?.vantage === "settled" && source === waiting) {
        // Once for each moment: it says so again on every page it loads while it's yours.
        if (loading.current.since) loading.current = { took: Math.min(Date.now() - loading.current.since, loading.current.took ?? Infinity) };
        setLive((now) => now && { ...now, settled: true });
      }
      if (data?.vantage === "recorded" && source === waiting) recordedInApp.current(data.events);
      if (data?.vantage === "did" && source === waiting) yours.current.did = data.did;
      if (data?.vantage === "pinned") pinnedInApp(data.at);
      if (data?.vantage === "escape") {
        if (notingNow.current) setNoting(false);
        else letGoNow.current({ x: data.x, y: data.y });
      }
      if (data?.vantage === "note") setNoting((now) => !now);
      if (data?.vantage === "noted") notedInApp.current(data);
    };
    addEventListener("message", told);
    return () => removeEventListener("message", told);
  }, []);

  // A flow is watched once it's played to its end from no later than its middle, going up a fork and back on the way.
  const seeing = useRef(see);
  seeing.current = see;
  useEffect(() => {
    let from: Moment | undefined;
    let last = playhead.now.moment;
    const flowOf = (name: string) => (playhead.flows.find((flow) => flow.name === name) as Forked | undefined)?.fork ?? name;
    return playhead.subscribe(() => {
      const { moment, playing } = playhead.now;
      const length = playhead.flow.length;
      if (from && (flowOf(moment.flow) !== flowOf(from.flow) || (moment.flow === last.flow && Math.abs(moment.at - last.at) > 0.5))) from = undefined;
      if (playing && !from) from = moment;
      if (from && moment.at >= length - 0.06 && !(playhead.flow as Forked).fork) {
        const name = moment.flow;
        if (from.at <= length / 2) seeing.current((flows) => (flows.includes(name) ? flows : [...flows, name]));
        from = undefined;
      }
      last = moment;
    });
  }, [playhead]);

  // The view is yours: it changes only when you change it. Compare pressed puts how it was beside how it is now
  // ("side"), until it's pressed again.
  const [look, setLook] = useState<Look>("one");
  const [actual, setActual] = useState(false);
  // Side by side starts at actual size each time you go to it; the size then fits both to the whole page.
  const [sideFit, setSideFit] = useState(false);
  // The note whose old fork is side by side with its walk.
  const besideFork = useRef<string>(undefined);
  const [size, setSize] = useState<Size>();
  const [bare, setBare] = useState<Bare>();
  const first = review.rounds[0]!.number;
  const chooseLook = (chosen: Look) => {
    if (chosen === look) return;
    setLook(chosen);
    if (chosen === "side") setSideFit(false);
  };
  const toRound = (number: number) => {
    onRound(number);
  };
  const noted = notesOn(review, round.number, you, draft);
  // Only an answer is a difference to judge: a note nobody has answered has nothing to compare.
  const answered = (note: Shown) => note.on?.at !== undefined && note.turns.some((turn) => turn.agent);
  // An answer is judged against what its note asked about: the round it was written on, or the round it was last sent
  // back on, whoever wrote it.
  const noteOpen = open && "note" in open ? noted.find((note) => note.id === open.note) : undefined;
  const askedIn = noteOpen && answered(noteOpen) ? noteOpen.turns.filter((turn) => !turn.agent && turn.round < round.number).map((turn) => turn.round) : [];
  const askedFrom = askedIn.length ? Math.max(...askedIn) : undefined;
  const looked = flow ? lastLooked(review, you, flow.name, round.number) : undefined;
  // Compare is this moment as it was: on the round an open answer's note asked about, or else the round you last looked
  // at this flow on, or Before. Held, it's a still look in place while you hold it; pressed and let go, the two go side
  // by side, playing together, until it's pressed again, or Escape.
  const compared = round.number > first ? (askedFrom ?? looked ?? first) : undefined;
  const [peek, setPeek] = useState(false);
  const pressed = useRef<number>(undefined);
  const pressCompare = () => {
    if (pressed.current === undefined) pressed.current = window.setTimeout(() => setPeek(true), HOLD);
  };
  const releaseCompare = () => {
    if (pressed.current === undefined) return;
    clearTimeout(pressed.current);
    pressed.current = undefined;
    if (peek) return setPeek(false);
    chooseLook(look === "side" ? "one" : "side");
  };
  const [listed, setListed] = useState(false);
  const [litNote, setLitNote] = useState<string>();
  // Watching, a click on the recording does nothing: only with Note on does it note what's under it, once.
  const [noting, setNoting] = useState(false);
  const notingNow = useRef(noting);
  notingNow.current = noting;
  const notedInApp = useRef<(noted: NotedInApp) => void>(() => {});
  // While you're in the app, what you do there is recorded, from when it was handed to you: a fork off the flow, on the
  // timeline as soon as you're there. Carried on from a fork, it goes on from where that one ended.
  const yours = useRef<Session>({ id: "", events: [], did: [], kept: 0, shift: 0, from: { flow: "", at: 0 } });
  const starting = useRef<{ from: Fork["from"]; carry?: Session }>(undefined);
  const [growing, setGrowing] = useState<Growing>();
  const recordedInApp = useRef<(events: { timestamp: number }[]) => void>(() => {});
  recordedInApp.current = (events) => {
    if (!live || !events.length) return;
    if (yours.current.address !== live.address) {
      const { from, carry } = starting.current ?? { from: { flow: live.flow, at: 0 } };
      const last = carry?.events.at(-1);
      yours.current = carry && last
        ? { ...carry, address: live.address, shift: last.timestamp + 400 - events[0]!.timestamp }
        : { address: live.address, id: newId(), events: [], did: [], kept: 0, shift: 0, from };
    }
    const session = yours.current;
    session.events.push(...events.map((event) => ({ ...event, timestamp: event.timestamp + session.shift })));
    session.heard = Date.now();
    const address = live.address ?? "";
    setGrowing((now) => (now?.address === address ? now : { address, name: `fork:${session.id}`, at: session.from.at, length: session.from.at }));
  };
  // Kept as a recording, what you did plays as the flow up to where you took it over, then you. What you said earlier on
  // the same fork goes on with the longer one.
  const keepFork = async (session: Session): Promise<Fork | undefined> => {
    const kept = `${session.id}-${++session.kept}.json`;
    // It ends now, not at the last thing the page did: still time is time you spent there too.
    const now = { type: 5, data: { tag: "now", payload: {} }, timestamp: session.events.at(-1)!.timestamp + Date.now() - (session.heard ?? Date.now()) };
    const length = await keepBranch(review.id, round.number, session.from, [...session.events, now], kept);
    if (!length) return undefined;
    const recording = `branches/${kept}`;
    const longer = (note: Note) => (note.on?.app && sessionOf(note.on.app.recording) === session.id ? { ...note, on: { ...note.on, app: { ...note.on.app, recording, length } } } : note);
    change((draft) => ({ ...draft, notes: draft.notes.map(longer), unsaved: draft.unsaved.map(longer) }));
    return { name: `fork:${session.id}`, session: session.id, from: session.from, did: session.did, recording, length };
  };
  // Where each note's pin is in the app, on the page: its card sits by it.
  const appPins = useRef(new Map<string, { x: number; y: number }>());
  const pinnedInApp = (at: Record<string, { x: number; y: number }>) => {
    const frame = document.querySelector<HTMLIFrameElement>("[data-live] iframe");
    const box = frame?.getBoundingClientRect();
    if (!frame || !box) return;
    const k = box.width / frame.offsetWidth;
    appPins.current = new Map(Object.entries(at).map(([id, spot]) => [id, { x: box.left + spot.x * k, y: box.top + spot.y * k }]));
  };
  // In the app, Note goes there too: the app rings what's under the pointer and keeps the click it notes.
  const inApp = !!live?.shown && !!live.settled && !!live.address;
  // Taken over: waiting while the moment is made ready, or the app showing in the frame.
  const liveNow: "waiting" | "shown" | undefined = live?.shown ? (inApp ? "shown" : "waiting") : undefined;
  useEffect(() => {
    document.querySelector<HTMLIFrameElement>("[data-live] iframe")?.contentWindow?.postMessage({ vantage: "noting", on: noting && inApp }, "*");
  }, [noting, inApp]);
  const playingOn = useNow(playhead, (now) => now.playing);
  useEffect(() => void (playingOn && setNoting(false)), [playingOn]);
  const working = review.accepted ? undefined : review.taken.find((taken) => taken.round > latest.number)?.at;

  // Left and Right step to the next moment the page changes, or a second where nothing does; with Shift, a tenth.
  const [changes, setChanges] = useState<{ flow: string; at: number[]; clicks: number[]; acted: [number, number][]; moved: Map<string, number[]> }>();
  useEffect(() => {
    if (!flow) return;
    let current = true;
    recording(review.id, round.number, flow.recording).then((events) => {
      const { changes, clicks, acted } = recorded(events);
      // When what each answer that moves is on changed: watching it starts at what set it moving.
      const moved = new Map(round.replies.flatMap((reply) => (reply.watch && reply.on?.flow === flow.name && reply.on.element?.node !== undefined ? [[reply.note, changesIn(events, reply.on.element.node)] as const] : [])));
      if (current) setChanges({ flow: flow.name, at: changes, clicks, acted, moved });
    });
    return () => void (current = false);
  }, [review.id, round.number, flow]);
  // The forks off the flow you're watching.
  const forksHere = forkList.filter((fork) => fork.from.flow === watching).map((fork): ForkLine => ({ name: fork.name, at: fork.from.at, length: fork.length }));
  const nudge = (direction: 1 | -1, fine: boolean) => {
    const flows = playhead.flows;
    const now = along(flows, playhead.now.moment);
    const starts = flows.map((flow) => along(flows, { flow: flow.name, at: 0 }));
    const here = changes?.flow === flow?.name ? (changes?.at ?? []).map((at) => along(flows, { flow: flow!.name, at: Math.min(at, flow!.length - 0.02) })) : [];
    const moments = [...starts, ...here].sort((a, b) => a - b);
    const next = direction > 0 ? moments.find((at) => at > now + 0.02) : moments.findLast((at) => at < now - 0.02);
    playhead.go(momentAt(flows, fine ? now + direction * 0.1 : next !== undefined && Math.abs(next - now) < 1 ? next : now + direction));
  };

  // Before is how the app was: it's there to look back on, and notes go on the rounds after it.
  const readOnly = !!review.accepted || round.number === 0 || (round !== latest && !arrived);
  const readOn = [round.number, ...(compared === undefined ? [] : [compared]), ...noted.map((note) => note.written)];
  const read = useReadings(review, review.rounds.filter((kept) => readOn.includes(kept.number)).map((kept) => (kept.number === round.number ? played : kept)));
  // Each note sits where its thing is on this round: its moment here, on what it's on here, once that's found. One on
  // something this round doesn't have is lost here. One made in the app on an earlier round sits where you took its
  // flow over, which this round's recording shows, as nothing recorded what you did after; where this round's flow
  // doesn't go that far, it's on the whole flow.
  // Walked again for this round, it's on the walk, where your steps got to; one whose steps stop short of it says so.
  const walkedTo = (note: Shown) => (note.on?.app && note.written !== round.number ? round.replies.find((reply) => reply.note === note.id && reply.on?.app)?.on : undefined);
  // Where they stop short, the step of yours that couldn't be done, in words.
  const stopsShort = new Map(
    noted.flatMap((note) => {
      const done = walkedTo(note)?.app?.did.length ?? Infinity;
      const step = note.on?.app?.did[done];
      return step ? [[note.id, couldntDo(step)] as const] : [];
    }),
  );
  const whereYouWere = new Map(
    noted.flatMap((note) => (note.on?.app && note.written !== round.number && !walkedTo(note) ? [[note.id, { ...takenOverIn(review, note.on, note.written, round, read), did: note.on.app.did }] as const] : [])),
  );
  const notes = noted.map((note) => {
    const walked = walkedTo(note);
    if (walked) return { ...note, on: walked };
    const was = whereYouWere.get(note.id);
    if (was) return { ...note, on: { flow: note.on!.app!.from.flow, ...(was.at !== undefined && { at: was.at, ...(was.element && { element: was.element }) }) } };
    return note.on && !note.on.app ? { ...note, on: placeOn(review, note.id, note.on, note.written, round, read) ?? note.on } : note;
  });
  const lost = noted.filter((note, i) => note.on?.element && !note.on.app && notes[i]!.on !== note.on && !notes[i]!.on?.element).map((note) => note.id);
  // The notes whose things have left the page you're watching.
  const [gone, setGone] = useState<string[]>([]);
  const settled = settledBefore(review, round.number, you);
  const inGeneral = notes.filter((note) => !note.on || !round.flows.some((flow) => flow.name === note.on?.flow));
  const playingNotes = flow ? notes.filter((note) => note.on?.flow === flow.name && note.on.at !== undefined) : [];

  // Where each flow stands for you on the round you judge, and, once the work is accepted, on the last.
  const judging = !readOnly || (!!review.accepted && round === latest);
  const standing = useMemo(() => (judging ? standings(review, round.number, you, draft, watched) : undefined), [judging, review, round.number, you, draft, watched]);
  // A flow that still needs you: not good, and not only waiting on what you've said for the agent.
  const needs = (name: string) => !["good", "to send", "with the agent", undefined].includes(standing?.get(name)?.is);

  // A flow asks whether it's good at its end, once you've watched it, and stays where you answered it; it goes once you
  // move on.
  const [asked, setAsked] = useState<string>();
  if (asked && (where !== "end" || watching !== asked)) setAsked(undefined);
  const question = !open && flow && where === "end" && standing?.get(flow.name)?.asks && (asked === flow.name || standing.get(flow.name)?.is === "is it good") ? flow.name : undefined;
  // What you said about the whole flow sits over its last frame, with its question; one of them open, it opens there.
  const general = flow && where === "end" ? notes.filter((note) => note.on?.flow === flow.name && note.on.at === undefined) : [];
  const generalOpen = !!open && "note" in open && general.some((note) => note.id === open.note);
  const overEnd = (!open || generalOpen) && (!!question || general.length > 0);
  // The flow that just turned good, its tick travelling to the meter.
  const [landed, setLanded] = useState<Landed>();

  const go = (name: string, at = FLOW_IN) => {
    playhead.pause();
    playhead.go({ flow: name, at });
  };

  // What's new to you on this round: a diamond at each moment something changed, on the timeline.
  const diamonds = diamondsOn(review, round.number, you);
  const clicks = changes?.flow === flow?.name ? (changes?.clicks ?? []) : [];
  const onNow = useNow(playhead, (now) => diamondAt(diamonds, now.moment, clicks)?.id);
  const chosen = open && "change" in open ? diamonds.find((diamond) => diamond.id === open.change) : undefined;
  // Your notes on what changed, each grown out of its change; and the change whose note is open or being written.
  const grown = new Map(
    [...notes.filter((note) => note.yours), ...draft.unsaved].flatMap((note) => {
      const diamond = grownFrom(diamonds, note.on);
      return diamond ? [[note.id, diamond] as const] : [];
    }),
  );
  const grownOpen = open && !("change" in open) ? grown.get("note" in open ? open.note : open.writing) : undefined;
  // The change whose card is open, chosen or with your note on it open: one card, the change, the agent, you, Compare,
  // which compares as the change does.
  const changeOpen = chosen ?? grownOpen;
  const lit = chosen?.id ?? onNow;
  // Pointing at one of several changes in a change's card draws only that one.
  const [pointedChange, setPointedChange] = useState<string>();
  useEffect(() => setPointedChange(undefined), [changeOpen?.id]);
  // Paused on a change, with nothing else open, it's outlined where it is on the page; chosen, more firmly. What the agent
  // changed for the open note is the note's, drawn with it.
  const outlined = changeOpen?.flow === watching ? changeOpen : !open ? diamonds.find((diamond) => diamond.id === onNow) : undefined;

  // Opened, a note or a change goes to its moment, or plays it when it's a stretch; in a change's card its time goes there
  // again, and a click on the rest of its header closes it, never playing or pausing anything else.
  const running = useRef<string>(undefined);
  const play = (id: string, from: Moment, until: number) => {
    running.current = id;
    playhead.run(from, until);
  };
  // A change is a difference from an earlier round, seen on one frame: it opens there, still. New steps play through.
  const choose = (diamond: Diamond) => {
    setOpen({ change: diamond.id });
    if (diamond.until === undefined) go(diamond.flow, diamond.at);
    else play(diamond.id, { flow: diamond.flow, at: diamond.at }, diamond.until);
  };
  // A flow plays from its start, unless you're partway through it.
  const playFlow = (chosen: Flow) => {
    const { moment } = playhead.now;
    if (moment.flow !== chosen.name || moment.at >= chosen.length - 0.06) playhead.go({ flow: chosen.name, at: FLOW_IN });
    playhead.play();
  };
  const show = (note: Shown) => {
    setOpen({ note: note.id });
    setMet((met) => (met.includes(note.id) ? met : [...met, note.id]));
    if (note.on) go(playedOn(note.on), note.on.at);
  };
  // Where an answer that moves is watched, once the recording says when what it's on changed.
  const watchedOf = (note: Shown) => watchedIn(round, note.id, changes?.flow === flow?.name ? changes?.moved.get(note.id) : undefined);
  // The time a note covers on the timeline is the time it plays: its moment, its stretch, or the step it's watched in.
  const span = (note: Shown) => {
    const watched = watchedOf(note);
    return watched && note.on && playedOn(note.on) === watched.flow ? { at: watched.at, until: watched.until } : { at: note.on?.at ?? 0, until: note.on?.until };
  };
  // Chosen, a note opens on the frame it was written on, still: that frame is what it's about. One on a stretch plays the
  // stretch, to the frame it was written on (its end): past it, the page may have moved its thing away. One whose answer
  // moves plays the step it's watched in. One on a whole flow plays the flow, going on if it's already playing.
  const pick = (note: Shown) => {
    const on = note.on;
    const its = on && played.flows.find((flow) => flow.name === playedOn(on));
    const watched = watchedOf(note);
    if (watched && its?.name === watched.flow) {
      setOpen({ note: note.id });
      setMet((met) => (met.includes(note.id) ? met : [...met, note.id]));
      return play(note.id, { flow: watched.flow, at: watched.at }, watched.until);
    }
    if (!on || !its || on.at === undefined || on.until === undefined) {
      show(note);
      const { moment, playing } = playhead.now;
      if (its && on?.at === undefined && !(playing && moment.flow === its.name)) playFlow(its);
      return;
    }
    setOpen({ note: note.id });
    setMet((met) => (met.includes(note.id) ? met : [...met, note.id]));
    play(note.id, { flow: its.name, at: on.at }, Math.min(its.length, on.until));
  };

  // The agent's line about a flow is on its title card: the first time you come to the flow, playing waits there, the
  // card up, until you play on. Once its recording has started, it's read.
  const [readLines, setReadLines] = useState<string[]>([]);
  const pastCard = useNow(playhead, (now) => (now.moment.at >= 0 ? now.moment.flow : undefined));
  if (pastCard && !readLines.includes(pastCard)) setReadLines([...readLines, pastCard]);
  // Playing stops at each answer that waits for you, the first time it gets there, and opens it as a click on it would.
  // One on a fork walked again is on the way: playing goes up the fork where you took the flow over, and stops at the
  // fork's end, as it does at a flow's.
  const walkedForks = forkList.filter((fork) => fork.walked);
  const waitsOn = (fork: Fork) => playingNotes.some((note) => note.on && playedOn(note.on) === fork.name && note.state === "needs you" && !note.unsent && !met.includes(note.id));
  const onto = (flow: string, at: number) => () => {
    playhead.go({ flow, at });
    playhead.play();
  };
  useEffect(() =>
    playhead.stopAt([
      ...walkedForks.filter(waitsOn).map((fork) => ({ id: fork.name, flow: fork.from.flow, at: fork.from.at, reached: onto(fork.name, fork.from.at) })),
      ...round.flows.filter((flow) => flow.line && !readLines.includes(flow.name)).map((flow) => ({ id: `card:${flow.name}`, flow: flow.name, at: POSTER, reached: () => {} })),
      ...playingNotes.flatMap((note) =>
        note.on && note.state === "needs you" && !note.unsent && !met.includes(note.id) ? [{ id: note.id, flow: playedOn(note.on), at: span(note).at, reached: () => (watchedIn(round, note.id) ? pick(note) : show(note)) }] : [],
      ),
    ]),
  );
  // A new note starts unsaved, where it will sit. With words in it, it's never thrown away by going elsewhere: it's kept,
  // not saved, until you save it or Cancel takes it back. With none, it goes.
  const write = (on: Place) => {
    if (readOnly) return;
    const id = newId();
    change((draft) => ({ ...draft, unsaved: [...draft.unsaved, { id, on, words: "" }] }));
    setOpen({ writing: id });
  };
  const writingId = open && "writing" in open ? open.writing : undefined;
  // Noted in the app: a new note on what you clicked there, by it, keeping what you did there since taking over.
  notedInApp.current = async ({ element, point, did, x, y }) => {
    setNoting(false);
    const frame = document.querySelector<HTMLIFrameElement>("[data-live] iframe");
    const box = frame?.getBoundingClientRect();
    if (frame && box) clickedAt(box.left + (x * box.width) / frame.offsetWidth, box.top + (y * box.height) / frame.offsetHeight);
    const session = yours.current;
    if (!live || readOnly || session.address !== live.address || !session.events.length) return;
    session.did = did;
    const fork = await keepFork(session);
    if (!fork) return;
    const app = { from: fork.from, did, recording: fork.recording, length: fork.length };
    write({ flow: fork.from.flow, at: Math.floor(fork.length * 100) / 100, ...(element ? { element } : point && { point }), app });
  };
  // A note in the app shows there as a pin on what it's on.
  const pinInApp = (id: string, on: Place) =>
    document
      .querySelector<HTMLIFrameElement>("[data-live] iframe")
      ?.contentWindow?.postMessage({ vantage: "pin", id, number: notes.find((note) => note.id === id)?.number ?? notes.length + 1, css: on.element?.css, point: on.point }, "*");
  // Taken over where you were, once your steps are done again and the app shows, the note made in the app that's open, or
  // that you're trying, is pinned there, on what it's on.
  useEffect(() => {
    const id = trying.current ?? openNote?.id;
    const note = inApp ? noted.find((note) => note.id === id && note.on?.app) : undefined;
    if (note?.on) pinInApp(note.id, note.on);
  }, [inApp]);
  useEffect(() => {
    if (draft.unsaved.some((note) => !note.words.trim() && note.id !== writingId))
      change((draft) => ({ ...draft, unsaved: draft.unsaved.filter((note) => note.words.trim() || note.id === writingId) }));
  });
  const glow = (id: string) => {
    setFresh(id);
    setTimeout(() => setFresh((fresh) => (fresh === id ? undefined : fresh)), 1200);
  };

  // Saved, a new note stays open with your words in it, and Play on its way on. A note on a flow you said looks good
  // takes that back.
  const saveNote = (note: Note, words: string) => {
    change((draft) => ({
      ...(note.on ? takeBack(draft, note.on.flow, notes) : draft),
      notes: [...draft.notes, { id: note.id, ...(note.on && { on: note.on }), words }],
      unsaved: draft.unsaved.filter((kept) => kept.id !== note.id),
    }));
    setOpen({ note: note.id });
    glow(note.id);
    if (note.on?.app && inApp) pinInApp(note.id, note.on);
  };
  const keepWords = (id: string, words: string) => change((draft) => ({ ...draft, unsaved: draft.unsaved.map((note) => (note.id === id ? { ...note, words } : note)) }));
  const dropUnsaved = (id: string) => {
    change((draft) => ({ ...draft, unsaved: draft.unsaved.filter((note) => note.id !== id) }));
    setOpen(undefined);
  };
  // Removing a note you haven't sent takes it away at once.
  const editNote = (id: string, words: string | undefined) => {
    change((draft) => ({ ...draft, notes: draft.notes.flatMap((note) => (note.id !== id ? [note] : words ? [{ ...note, words }] : [])) }));
    if (!words) setOpen(undefined);
  };
  // Judging an answer yourself takes it from its flow's Looks good; Not quite takes back the flow's Looks good.
  const judge = (note: Shown, verdict: Verdict | undefined) =>
    change((draft) => {
      const kept = verdict?.verdict === "not quite" && note.on ? takeBack(draft, note.on.flow, notes) : draft;
      return {
        ...kept,
        verdicts: [...kept.verdicts.filter((kept) => kept.note !== note.id), ...(verdict ? [verdict] : [])],
        withTheFlow: kept.withTheFlow.filter((id) => id !== note.id),
      };
    });
  // A flow's Looks good is a checkbox: pressed again before it's sent, it's taken back. Its question stays where you
  // answered it, and its tick travels to the meter. It settles only answers you've seen: one you haven't is shown first.
  const unseen = (name: string) => notes.filter((note) => note.on?.flow === name && note.state === "needs you" && !note.unsent && !met.includes(note.id));
  const lookingGood = (name: string) => {
    if (draft.looksGood.includes(name)) return change((draft) => takeBack(draft, name, notes));
    if (standing?.get(name)?.is === "good") return;
    // One at a moment plays to it; one on the whole flow is already here, over the flow's end.
    const notSeen = unseen(name)[0];
    if (notSeen?.on?.at !== undefined) return pick(notSeen);
    if (notSeen) return (setOpen({ note: notSeen.id }), setMet((met) => [...met, notSeen.id]));
    change((draft) => lookGood(draft, name, notes));
    setAsked(name);
    setLanded({ flow: name, at: performance.now() });
  };
  // Watching a flow is from its start.
  const watchFrom = (name: string) => {
    setOpen(undefined);
    playhead.go({ flow: name, at: FLOW_IN });
    playhead.play();
  };

  // Leaving every flow at once for a flow, its picture grows into the frame, and the flow plays once it's there. Coming
  // back, it waits at its start, and what you were reading is let go, unless you're writing it.
  const gridRoom = useRef<HTMLDivElement>(null);
  // Taking over is doing: from Take over until you're back, what drives the recording rests, the row under the recording
  // with it, as there's nothing there for it to act on. It still says where you are. In the app it steps back too, so
  // the frame is all there is, and comes forward as the portal closes.
  const doing = !!live?.shown;
  const underneath = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = underneath.current;
    if (!row) return;
    row.inert = doing;
    row.style.transition = "opacity 520ms cubic-bezier(0.22, 0.8, 0.24, 1)";
    row.style.opacity = inApp ? "0.32" : "";
  }, [inApp, doing]);
  const flying = useRef<{ taking: Taking; playing: boolean }>(undefined);
  const settling = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(settling.current), []);
  const leave = (name: string | undefined, playing: boolean) => {
    flying.current = { taking: takeOff(gridRoom.current!), playing };
    setGrid(false);
    if (name) go(name);
  };
  const toGrid = () => {
    playhead.pause();
    playhead.go({ flow: round.flows[0]!.name, at: POSTER });
    if (open && !("writing" in open)) setOpen(undefined);
    setGrid(true);
  };
  useLayoutEffect(() => {
    const flight = flying.current;
    flying.current = undefined;
    if (!flight) return;
    // Only the picture of the flow that plays grows into the frame.
    const frame = document.querySelector<HTMLElement>(`[data-frame="${round.number}"]`);
    const last = frame ? grow(flight.taking.filter((taken) => taken.flow === playhead.flow.name), frame) : 0;
    if (!flight.playing) return;
    const from = playhead.now.moment;
    clearTimeout(settling.current);
    settling.current = window.setTimeout(() => {
      const { moment, playing } = playhead.now;
      if (!playing && moment.flow === from.flow && moment.at === from.at) playhead.play();
    }, last + SETTLE);
  });

  // Up and Down go through the flows and, in each, its notes and changes by their time, the recording going with them.
  const order = [
    ...round.flows.flatMap((flow) => [{ flow }, ...rowsIn(flow.name, notes, diamonds, settles(standing?.get(flow.name), flow.name === watching))]),
    ...inGeneral.map((note) => ({ note, at: Infinity })),
  ];
  const through = (direction: 1 | -1) => {
    const here = order.findIndex((row) =>
      "note" in row ? open && "note" in open && open.note === row.note.id : "diamond" in row ? chosen === row.diamond : !open && row.flow.name === watching,
    );
    const next = order[here < 0 ? 0 : clamp(here + direction, 0, order.length - 1)];
    if (!next || (here >= 0 && order[here] === next)) return;
    if ("note" in next) pick(next.note);
    else if ("diamond" in next) choose(next.diamond);
    else {
      setOpen(undefined);
      go(next.flow.name);
    }
  };

  // The note you're writing is a card beside what it's on, in a card's own margins, as an open note's is: numbered after
  // the rest, counting the ones you haven't saved, and named for where it is, over its box.
  const nextNumber = Math.max(0, ...notes.map((note) => note.number)) + 1;
  const writing = draft.unsaved.find((note) => note.id === writingId);
  const placeName = (on: Place | undefined) => nameOf(on && { ...on, flow: playedOn(on) }, read, round.number);
  const writingCard = (note: Note) => (
    <div key={note.id} data-open className="grid gap-2.5 px-4 py-2">
      <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-x-2">
        <span data-mark className={`${numberLook} relative z-1 mt-px bg-amber text-white`}>
          {nextNumber + draft.unsaved.indexOf(note)}
        </span>
        <span className="truncate">{placeName(note.on)}</span>
        <span className="min-w-[78px] text-right text-xs leading-5 text-amber-ink tabular-nums">{note.on?.at === undefined ? "" : time(note.on.at)}</span>
      </div>
      <Writing
        words={note.words}
        placeholder={note.on && note.on.at === undefined ? "What isn’t good about it?" : "What do you think?"}
        question={note.on?.app ? "Your new note, on what’s in the app" : "Your new note"}
        onWords={(words) => keepWords(note.id, words)}
        onSave={(words) => saveNote(note, words)}
        onCancel={() => dropUnsaved(note.id)}
      />
    </div>
  );
  // What isn't right about a change is a note on what it's on, at its moment, or over new steps: one note, opened again
  // once it's there.
  const noteOn = (diamond: Diamond) => {
    const already = [...grown].find(([, on]) => on === diamond)?.[0];
    const note = notes.find((note) => note.id === already);
    if (note) return pick(note);
    if (already) return setOpen({ writing: already });
    const on = diamond.changes.find((changed) => !changed.answers)?.on;
    go(diamond.flow, diamond.at);
    write({ flow: diamond.flow, at: diamond.at, ...(diamond.until !== undefined ? { until: diamond.until } : on?.element ? { element: on.element } : on?.box && { box: on.box }) });
  };
  // Playing on from an open card lets it go, as moving on from it does. At the flow's end there's nothing left to play,
  // and the flow asks whether it's good before the next one starts.
  const playOn = () => {
    setOpen(undefined);
    if (where !== "end") playhead.play();
  };
  // What the agent changed for a note is gone to as its diamond is, the note staying open.
  const toAnswer = (changed: Changed) => {
    const diamond = diamonds.find((diamond) => diamond.changes.includes(changed));
    if (!diamond) return;
    go(diamond.flow, diamond.at);
  };
  const row = (note: Shown, grownHere?: boolean) => {
    const isOpen = !!open && "note" in open && open.note === note.id;
    // A note's card is away once you've gone on into another flow, or what it's on has left the page: it asks nothing
    // there. Not while its own moment plays, on the way to it.
    const away =
      (!!note.on && round.flows.some((flow) => flow.name === note.on!.flow) && note.on.flow !== watching) ||
      ((gone.includes(note.id) || lost.includes(note.id)) && !(where === "playing" && running.current === note.id));
    // Made in the app on an earlier round, it's tried where you were rather than compared, on the round that's the app
    // as it is now; in the app, a Looks good stays where you said it, as there's nothing to play on to.
    const was = whereYouWere.get(note.id);
    const takeable = round === latest && !readOnly;
    // Walked again, it's checked by watching, as any answer is; where your steps stop short of it, the card says what
    // couldn't be done, and offers nothing to do about it: there's nowhere to carry on to (T still takes it over).
    const tryHere = stopsShort.has(note.id)
      ? { round: round.number, stopped: stopsShort.get(note.id) }
      : was && (was.at === undefined || takeable) ? { round: round.number, live: trying.current === note.id ? liveNow : undefined, ...(was.at !== undefined && { onTakeOver: () => tryWhereYouWere(note) }) } : undefined;
    return (
      <NoteRow
        key={note.id}
        note={note}
        playhead={playhead}
        you={you}
        readOnly={readOnly}
        open={isOpen}
        fresh={fresh === note.id}
        answers={answersTo(diamonds, note.id)}
        compare={isOpen && !was && !stopsShort.has(note.id) && (answered(note) || grownHere) ? comparingIt : undefined}
        whereYouWere={tryHere}
        asking={asking === note.id}
        away={away}
        grown={grownHere}
        onOpen={() => pick(note)}
        onClose={() => setOpen(undefined)}
        onAsking={(on) => setAsking(on ? note.id : undefined)}
        onJudge={(verdict) => judge(note, verdict)}
        onEdit={(words) => editNote(note.id, words)}
        onAnswer={toAnswer}
        onPlayOn={inApp && trying.current === note.id ? () => {} : playOn}
        onShow={() => show(note)}
      />
    );
  };

  // Holding H shows the recording bare; pressed twice, it stays bare until H again.
  const bareKeys = useRef({ down: 0, up: 0, kept: false });
  const bareKey = (down: boolean) => {
    const keys = bareKeys.current;
    const now = performance.now();
    if (down) {
      if (keys.kept) {
        keys.kept = false;
        keys.down = -1;
        return setBare(undefined);
      }
      keys.kept = now - keys.up < 350;
      keys.down = now;
      return setBare(keys.kept ? "kept" : "held");
    }
    if (keys.down === -1) return void (keys.down = 0);
    if (keys.kept) return;
    setBare(undefined);
    keys.up = now - keys.down < 300 ? now : 0;
  };

  // The open card answers Enter and X, as its buttons say: Looks good and Not quite on an answer not yet judged, Play on and a note on
  // a change. C compares, held for a look and tapped for side by side, as the pointer does on Compare.
  const openNote = open && "note" in open ? notes.find((note) => note.id === open.note) : undefined;
  const asks = !!openNote && !readOnly && openNote.toJudge && !draft.verdicts.some((verdict) => verdict.note === openNote.id) && openNote.on?.flow === watching;
  // In the app where you were, with the note you're trying open: it stays by its pin there while you try it.
  const tryingHere = inApp && !!openNote && trying.current === openNote.id;
  const comparedRound = compared === undefined ? undefined : review.rounds.find((kept) => kept.number === compared);
  // A fork walked again is compared with the fork it was walked from, at its notes: the fork whose note is open, or
  // the one you're watching, open note or not. Side by side, it stays beside it once you've left it, until you go back
  // to one.
  const walkHere =
    (openNote && walkedTo(openNote) ? walkedForks.find((fork) => fork.notes?.some((note) => note.id === openNote.id)) : undefined) ??
    (onFork?.walked ? onFork : undefined) ??
    (look === "side" ? walkedForks.find((fork) => fork.name === besideFork.current) : undefined);
  besideFork.current = look === "side" ? walkHere?.name : undefined;
  const walkedFrom = (walkHere?.notes ?? []).flatMap(({ id }) => {
    const on = noted.find((note) => note.id === id)?.on;
    return on?.app && on.at !== undefined ? [{ id, at: on.at, app: on.app }] : [];
  });
  // Kept longer as you went on, the fork's longest recording.
  const source = walkedFrom.toSorted((a, b) => b.app.length - a.app.length)[0]?.app;
  // Past your last note, your fork plays on at its own pace and ends where the walk does: what you did after it was
  // writing the note, and kept in step with the walk's short end, it raced.
  const walk = walkHere && played.flows.find((flow) => flow.name === walkHere.name);
  const lastNote = walk?.steps.findLast((step) => step.title.startsWith("Note "));
  const after = walk && lastNote ? walk.length - lastNote.at : undefined;
  const lastAt = Math.max(...walkedFrom.map((from) => from.at));
  const heldOver = comparedRound && source
    ? forked(comparedRound, [
        {
          name: forkName(source.recording),
          session: sessionOf(source.recording),
          ...source,
          length: after === undefined ? source.length : Math.min(source.length, lastAt + after),
          notes: walkedFrom.map(({ id, at }) => ({ id, at })),
        },
      ])
    : comparedRound;
  // Compare is there only where the round it compares with has what you're watching: a fork you made on this round, or
  // a flow new in it, has nothing to show beside it.
  const comparingIt: Comparing | undefined = heldOver?.flows.some((flow) => flow.name === inPlay) ? { on: peek || look === "side", off: !!live?.shown, onPress: pressCompare, onRelease: releaseCompare } : undefined;
  // Side by side, the round it compares with is on the left, or above.
  const comparing = look === "side" && !!heldOver;
  const earlier = comparing ? heldOver : undefined;
  const zoomed = comparing ? !sideFit : actual;
  // Holding Compare or How it was, that round shows over the recording, in place.
  // It waits unseen over the recording while it's paused, so Compare shows it at once; playing, only while it's on.
  const peeking = peek && !!comparedRound;

  // Sending carries everything you've said on the round at once; what you haven't saved stays. Accepting sends what's
  // left first.
  const [trouble, setTrouble] = useState<string[]>([]);
  const [sent, setSent] = useState<number>();
  const [acceptedHere, setAcceptedHere] = useState(false);
  const sending = useRef(false);
  const sendNow = async () => {
    if (!said(draft) || sending.current) return false;
    sending.current = true;
    const sends: Send = { id: newId(), round: round.number, by: you, sent: new Date().toISOString(), ...sendOf(draft) };
    const problems = await send(review.id, sends);
    sending.current = false;
    setTrouble(problems);
    if (problems.length) return false;
    setPosted(sends);
    change((draft) => ({ ...nothing, unsaved: draft.unsaved }));
    setSent(performance.now());
    return true;
  };
  const acceptNow = async () => {
    if (said(draft) && !(await sendNow())) return;
    const problems = await accept(review.id, you);
    setTrouble(problems);
    if (problems.length) return;
    setAcceptedHere(true);
    // Done, it goes back to every flow, where their ticks land in turn.
    if (many) setTimeout(toGrid, 900);
  };

  // The foot's one step, from where the playhead is: play on through the flow you're in; at its end, its question, or
  // finishing a note you started there, or watching it from the start; then on to what needs you next. With nothing left
  // that needs you, Send what asks the agent something; else Accept, which sends what's left with it; else what the
  // agent is doing.
  const asksTheAgent = draft.notes.length + draft.verdicts.filter((verdict) => verdict.verdict === "not quite").length;
  const onward = (from: number): Step => {
    const below = round.flows.slice(from + 1).find((flow) => needs(flow.name));
    const general = draft.unsaved.find((note) => !note.on) ?? inGeneral.find((note) => note.state === "needs you");
    const next = below ?? (general ? undefined : round.flows.slice(0, Math.max(0, from)).find((flow) => needs(flow.name)));
    if (next) return { kind: "go", words: "Next", what: next.name, flow: next.name, take: () => watchFrom(next.name) };
    if (general && "turns" in general) return { kind: "go", words: "Next to check", what: general.turns[0]?.words, take: () => pick(general) };
    if (general) return { kind: "go", words: "Finish your note", what: placeName(general.on), take: () => setOpen({ writing: general.id }) };
    if (asksTheAgent) return { kind: "go", words: "Send", what: `${asksTheAgent} ${asksTheAgent === 1 ? "note" : "notes"} to the agent`, take: sendNow, send: true };
    if (readyToAccept(asIfSent(review, round.number, you, draft), you)) return { kind: "go", words: "All good", what: "Accept the work", take: acceptNow, final: true };
    if (said(draft)) return { kind: "go", words: "Send", what: "what you said", take: sendNow, send: true };
    if (waitingForTheAgent(review).length)
      return working
        ? { kind: "agent", words: "The agent is working", what: `since ${new Date(working).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, busy: true }
        : { kind: "agent", words: "Sent, waiting for the agent", busy: false };
    return { kind: "say", words: "All good" };
  };
  const footStep = (): Step => {
    if (review.accepted || acceptedHere)
      return { kind: "done", words: !review.accepted || review.accepted.by === you ? "Accepted" : `Accepted by ${review.accepted.by}`, just: acceptedHere };
    if (round !== latest && arrived) return { kind: "go", words: `${roundName(latest.number)} is in`, what: "See it", take: () => toRound(latest.number) };
    if (round !== latest) return { kind: "go", words: "Back to now", what: roundName(latest.number), take: () => toRound(latest.number) };
    if (round.number === 0) return { kind: "agent", words: "The agent is working", what: "on round 1", busy: true };
    if (!flow) return onward(-1);
    if (where === "playing") return { kind: "say", words: "Playing", what: flow.name };
    if (where !== "end") return { kind: "go", words: where === "start" ? "Play" : "Play on", what: flow.name, take: () => playhead.play() };
    if (question) return standing?.get(question)?.is === "good" ? onward(round.flows.indexOf(flow)) : { kind: "say", words: "End of", what: flow.name };
    if (needs(flow.name)) {
      const started = draft.unsaved.find((note) => note.on?.flow === flow.name);
      if (started) return { kind: "go", words: "Finish your note", what: placeName(started.on), take: () => setOpen({ writing: started.id }) };
      return { kind: "go", words: "Watch it", what: "from the start", take: () => watchFrom(flow.name) };
    }
    return onward(round.flows.indexOf(flow));
  };
  const step = footStep();

  // Over every flow, the foot's step from the top: to the first flow that needs you, from its start, as Start checking,
  // or Carry on checking once you've begun; else what the foot would offer, sending and accepting where you are. A round
  // that arrived while you were here is offered as the foot offers it.
  const begun = watched.length > 0 || said(draft) > 0 || draft.unsaved.length > 0;
  const gridStep = ((): Step | undefined => {
    if (review.accepted || acceptedHere || readOnly) return undefined;
    if (round !== latest) return step;
    const next = onward(-1);
    if (next.kind === "agent") return next;
    if (next.kind !== "go") return undefined;
    if (next.flow) return { ...next, words: begun ? "Carry on checking" : "Start checking", what: undefined, take: () => leave(next.flow, true) };
    if (next.send || next.final) return next;
    return {
      ...next,
      take: () => {
        leave(undefined, false);
        next.take();
      },
    };
  })();
  const acting = onGrid ? gridStep : step;
  // Accepted, how it got there: after how many rounds, with how many notes settled.
  const settledNotes = [...settled, ...notes].filter((note) => note.state === "settled").length;
  const acceptedAfter = `Accepted after ${latest.number} ${latest.number === 1 ? "round" : "rounds"}${settledNotes ? ` · ${settledNotes} ${settledNotes === 1 ? "note" : "notes"} settled` : ""}`;

  useEffect(() => {
    const writingHere = (event: KeyboardEvent) => event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
    const down = (event: KeyboardEvent) => {
      // What can't be undone takes Ctrl+Enter, never a plain Enter in passing, and never while the app is yours.
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !writingHere(event) && !live?.shown && acting?.kind === "go" && acting.final) {
        event.preventDefault();
        return acting.take();
      }
      if (writingHere(event) || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      // Taking over, the keys that drive the recording rest with it: only noting and going back answer.
      if (live?.shown && !/^(n|t|escape)$/i.test(event.key)) return;
      // Over every flow, Space plays what the frame shows, the flow you point at or the one the step goes to, and Enter
      // takes the step; a row is chosen as a button is.
      if (onGrid) {
        if (event.key === " ") {
          event.preventDefault();
          leave(gridRoom.current?.querySelector<HTMLElement>("[data-picture]")?.dataset.picture ?? playhead.flow.name, true);
        } else if (event.key === "Enter" && !(event.target as Element).closest?.("button") && gridStep?.kind === "go" && !gridStep.final) {
          event.preventDefault();
          gridStep.take();
        }
        return;
      }
      // Space plays and pauses wherever you are, also on a button you just clicked: it never presses it.
      if (event.key === " ") {
        event.preventDefault();
        playhead.toggle();
      } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        if ((event.target as Element).closest?.("[role=slider][aria-label=Rounds]")) return;
        event.preventDefault();
        nudge(event.key === "ArrowRight" ? 1 : -1, event.shiftKey);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        through(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key.toLowerCase() === "h") {
        if (!event.repeat) bareKey(true);
      } else if (event.key === "Enter" && !(event.target as Element).closest?.("button, [role=button], [role=slider]")) {
        if (asks) {
          event.preventDefault();
          judge(openNote, { note: openNote.id, verdict: "looks good" });
          playOn();
        } else if (openNote || chosen) {
          event.preventDefault();
          playOn();
        } else if (question && standing?.get(question)?.is !== "good") {
          event.preventDefault();
          lookingGood(question);
        } else if (!open && step.kind === "go" && !step.final) {
          event.preventDefault();
          step.take();
        }
      } else if (event.key.toLowerCase() === "x" && !event.repeat) {
        // The box it opens takes the next key, not this one.
        event.preventDefault();
        if (asks) setAsking(openNote.id);
        else if (chosen && !readOnly) noteOn(chosen);
        else if (question) write({ flow: question });
      } else if (event.key.toLowerCase() === "c" && !event.repeat && comparingIt && !live?.shown) {
        pressCompare();
      } else if (event.key.toLowerCase() === "n" && !event.repeat && !readOnly) {
        event.preventDefault();
        playhead.pause();
        setNoting(!noting);
      } else if (event.key === "Escape" && noting) {
        setNoting(false);
      } else if (event.key.toLowerCase() === "t" && !event.repeat) {
        event.preventDefault();
        takeOver();
      } else if (event.key === "Escape" && live?.shown) {
        letGo();
      } else if (event.key === "Escape" && (peek || comparing)) {
        setPeek(false);
        chooseLook("one");
      } else if (event.key === "Escape") {
        // Escape goes back a step you can see: from a note or a change to the recording, from a flow to every flow, and
        // looking back to now.
        if (open) setOpen(undefined);
        else if (many) toGrid();
        else if (round !== latest) toRound(latest.number);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === " " && !writingHere(event)) event.preventDefault();
      if (event.key.toLowerCase() === "h") bareKey(false);
      if (event.key.toLowerCase() === "c") releaseCompare();
    };
    const away = () => bareKeys.current.kept || setBare(undefined);
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", away);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", away);
    };
  });

  // What's drawn on the recordings: on the round you're watching, the notes in its flow on their things, the open one
  // whenever its thing is there and the rest around their moments, the note being written, and what changed where
  // you're stopped; on the round beside it, what's chosen, where it is there.
  // A change carries the colour of the note grown out of it.
  const grownInk = (diamond: Diamond) => {
    const id = [...grown].find(([, on]) => on === diamond)?.[0];
    const note = notes.find((note) => note.id === id);
    return id === undefined ? undefined : note ? ink(note) : "var(--amber)";
  };
  const markOn = (on: Place | undefined): Mark["on"] | undefined =>
    on?.element?.node !== undefined ? { node: on.element.node } : on?.point ? { point: on.point } : on?.box ? { box: on.box } : undefined;
  // A change in each place it's seen: things changed alike are one change, in several places.
  const marksOn = (on: Place | undefined): Mark["on"][] => [markOn(on), ...(on?.alike ?? []).map((element) => element.node !== undefined && { node: element.node })].filter((mark) => !!mark);
  // The open note's answer, outlined in every place in the note's colour, on the round you're watching and the one beside it.
  const answerMarks = (on: (changed: Changed) => Place | undefined): Mark[] =>
    openNote
      ? answersTo(diamonds, openNote.id)
          .filter((changed) => changed.on.flow === watching)
          .flatMap((changed) => marksOn(on(changed)).map((at): Mark => ({ id: changed.change.id, kind: "change", on: at, ink: ink(openNote), chosen: false })))
      : [];
  const drawn = (diamond: Diamond) => {
    const pointed = diamond.changes.filter((changed) => changed.change.id === pointedChange);
    return pointed.length ? pointed : diamond.changes;
  };
  // New steps aren't on one thing: they're outlined on what they click or type into, as the recording shows it.
  const actedOn = (diamond: Diamond): Mark["on"][] =>
    diamond.until === undefined || changes?.flow !== diamond.flow
      ? []
      : [...new Set(changes.acted.filter(([at]) => at >= diamond.at && at <= diamond.until!).map(([, node]) => node))].map((node) => ({ node }));
  const changed = (outlined ? drawn(outlined) : []).flatMap((changed) => (markOn(changed.on) ? marksOn(changed.on) : actedOn(outlined!)));
  const marks = new Map<number, Mark[]>([
    [
      round.number,
      [
        ...playingNotes.flatMap((note): Mark[] => {
          const on = !grown.has(note.id) && playedOn(note.on!) === inPlay && markOn(note.on);
          const chosen = openNote?.id === note.id;
          return on ? [{ id: note.id, kind: "note", on, pin: { number: note.number, fill: fill(note) }, ink: ink(note), chosen, shows: chosen ? undefined : span(note) }] : [];
        }),
        ...(writing?.on && playedOn(writing.on) === inPlay && writing.on.element?.node !== undefined && !grown.has(writing.id) ? [{ id: writing.id, kind: "writing" as const, on: { node: writing.on.element.node }, chosen: true }] : []),
        ...changed.map((on, i): Mark => ({ id: outlined!.id, kind: "change", on, pin: i === 0 ? "diamond" : undefined, dot: grownInk(outlined!), chosen: outlined === chosen || outlined === grownOpen })),
        ...answerMarks((changed) => changed.on),
      ],
    ],
  ]);
  const other = earlier ?? comparedRound;
  if (other) {
    const own = openNote && noted.find((note) => note.id === openNote.id);
    const there = own?.on && markOn(placeOn(review, own.id, own.on, own.written, other, read));
    marks.set(other.number, [
      ...(there ? [{ id: own.id, kind: "note" as const, on: there, ink: ink(own), chosen: true }] : []),
      ...(chosen?.flow === watching ? drawn(chosen).flatMap((changed) => marksOn(placeFrom(review, changed.on, round.number, other, read)).map((on): Mark => ({ id: chosen.id, kind: "change", on, chosen: true }))) : []),
      ...answerMarks((changed) => placeFrom(review, changed.on, round.number, other, read)),
    ]);
  }

  // What's chosen, beside the recording: a change's card, or a flow's question over its last frame.
  const chosenProps: ChosenProps = {
    round: round,
    playhead: playhead,
    notes: notes,
    diamonds: diamonds,
    chosen: chosen?.id,
    standing: (name) => standing?.get(name),
    saidGood: draft.looksGood,
    unseen: unseen,
    asked: question,
    landed: landed,
    note: row,
    grown: new Map([...grown].map(([id, diamond]) => [id, diamond.id])),
    compare: changeOpen?.flow === watching ? comparingIt : undefined,
    onDiamond: choose,
    onClose: () => setOpen(undefined),
    onPoint: setPointedChange,
    onPlayOn: playOn,
    onNoteOn: noteOn,
    onNote: pick,
    onGood: lookingGood,
    onNotQuite: (name) => write({ flow: name }),
    onAgain: (flow) => watchFrom(flow.name),
  };
  return (
    <Page title={review.title}>
      {/* In the app, the recording's pins are under it: a card there sits by the app's own pin, with nothing drawn to it. */}
      <Wire id={grownOpen?.id ?? openNote?.id ?? chosen?.id} colour={openNote ? ink(openNote) : grownOpen ? "var(--amber)" : "var(--soft)"} hidden={!!bare || peeking || inApp} faded={playingNow} />
      <main className="relative grid min-h-0 grid-cols-[minmax(0,1fr)] phone:flex phone:flex-col">
        <section inert={onGrid} className={`grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] pb-4 phone:flex-none phone:grid-rows-[auto_auto] phone:pr-0 phone:pb-3 ${onGrid ? "invisible" : ""}`}>
          <div className="relative grid min-h-0 grid-rows-[minmax(0,1fr)] pb-6" onPointerMove={() => playingNow && stir()}>
          <Stage
            review={review}
            playhead={playhead}
            round={played}
            earlier={earlier}
            about={walkHere && source ? { earlier: "what you did", now: "your steps again" } : undefined}
            then={!comparing && (peeking || !playingNow) ? heldOver : undefined}
            peeking={peeking}
            zoomed={zoomed}
            bare={bare}
            onShown={setSize}
            onBareOff={() => {
              bareKeys.current.kept = false;
              setBare(undefined);
            }}
            marks={marks}
            placing={writing?.on?.point}
            writing={!!writing}
            onPlace={
              readOnly || !noting
                ? undefined
                : (on: Placed) => {
                    setNoting(false);
                    // On a fork, it's on your recording, as one made in the app is.
                    const app = onFork && { from: onFork.from, did: onFork.did, recording: onFork.recording, length: onFork.length };
                    if (flow) write({ flow: flow.name, at: Math.round(Math.max(0, playhead.now.moment.at) * 100) / 100, ...on, ...(app && { app }) });
                  }
            }
            onMark={(id) => {
              const note = notes.find((note) => note.id === id);
              const diamond = diamonds.find((diamond) => diamond.id === id);
              if (note) pick(note);
              else if (diamond) choose(diamond);
            }}
            read={read}
            onGone={setGone}
            onAllFlows={many ? () => toGrid() : undefined}
            live={live}
          />
          <div
            className={`absolute bottom-6 left-1/2 z-20 -translate-x-1/2 translate-y-1/2 transition-opacity duration-250 ease-calm ${playingNow && !stirred ? "pointer-events-none opacity-0" : ""}`}
            onPointerEnter={() => stir(Infinity)}
            onPointerLeave={() => stir()}
          >
            <Bar
              live={liveNow}
              latest={round === latest}
              compare={liveNow === "shown" ? undefined : comparingIt}
              noting={noting}
              onNote={() => {
                playhead.pause();
                setNoting(!noting);
              }}
              onTakeOver={takeOver}
              onBack={() => letGo()}
              flow={watching ?? ""}
              notes={notes
                .filter((note) => note.on?.flow === watching && note.on.at !== undefined && note.turns[0]?.words)
                .sort((a, b) => a.on!.at! - b.on!.at!)
                .map((note) => ({ id: note.id, ink: ink(note), words: note.turns[0]!.words, at: time(note.on!.at!), app: !!note.on!.app || whereYouWere.has(note.id) }))}
              whole={notes.filter((note) => note.on?.flow === watching && note.on.at === undefined && note.turns[0]?.words).length}
              listed={listed}
              onList={(listed) => (setListed(listed), listed || setLitNote(undefined))}
              onLight={setLitNote}
              onSaid={(id) => {
                setListed(false);
                setLitNote(undefined);
                const note = notes.find((note) => note.id === id);
                // From the app, a note goes back to the recording, at it.
                if (live?.shown) letGo();
                if (note) pick(note);
              }}
            />
          </div>
          </div>
          {live?.problems && (
            <div role="alert" className="fixed right-4 bottom-4 z-30 max-w-[28rem] rounded-lg bg-surface px-3 py-2 text-sm whitespace-pre-wrap shadow-tip">
              {live.problems.join("\n")}
              <button className="ml-3 text-soft hover:text-fg" onClick={() => setLive(undefined)}>
                Close
              </button>
            </div>
          )}
          <div ref={underneath} className="flex items-end gap-5 phone:flex-col phone:items-stretch phone:gap-0">
          <div className="min-w-0 flex-1">
          <Controls
            stage
            forks={forksHere}
            lit={litNote}
            growing={inApp ? growing : undefined}
            live={liveNow}
            onTakeOver={takeOver}
            playhead={playhead}
            dots={playingNotes.filter((note) => !grown.has(note.id)).map((note) => ({ id: note.id, ...span(note), ink: ink(note), number: note.number, words: note.turns[0]?.words ?? "", ...(note.on?.app && { fork: playedOn(note.on) }) }))}
            onDot={(id) => {
              const note = notes.find((note) => note.id === id);
              if (note) pick(note);
            }}
            // What was changed for a note is in the note's answer, not marked again: its dot is the one mark for both.
            marks={diamonds
              .filter((diamond) => diamond.flow === watching && diamond.row)
              .map((diamond) => {
                const answered = notes.find((note) => grown.get(note.id) === diamond);
                return {
                  ...diamond,
                  note: answered && { number: answered.number, ink: ink(answered) },
                  lit: diamond.id === lit || (!!answered && answered === openNote),
                };
              })}
            onMark={(id) => {
              const diamond = diamonds.find((diamond) => diamond.id === id);
              if (diamond) choose(diamond);
            }}
            shown={size}
            zoomed={zoomed}
            onSize={() => (comparing ? setSideFit(!sideFit) : setActual(!actual))}
            rounds={review.rounds}
            watching={round.number}
            earlier={earlier?.number}
            arrived={arrived ? latest : undefined}
            working={working}
            onRound={toRound}
            onEarlier={() => {}}
            look={look}
            onLook={chooseLook}
          />
          </div>
          <div className="w-[300px] flex-none phone:w-auto">
            <Foot
              step={step}
              quiet={!!open}
              notes={asksTheAgent}
              onSend={!readOnly && asksTheAgent ? sendNow : undefined}
              sent={sent}
              trouble={trouble}
              pieces={judging && standing ? round.flows.flatMap((flow) => (standing.has(flow.name) ? [{ flow: flow.name, standing: standing.get(flow.name)!, here: flow.name === watching }] : [])) : undefined}
              landed={landed}
              busy={!!working}
              onFlow={watchFrom}
            />
          </div>
          </div>
        </section>

        <Beside
          id={openNote?.id ?? writingId ?? chosen?.id}
          still={playingNow}
          // Taking over is doing: a card about the recording rests with it; one about the app answers there, a note made in
          // the app or the one you're trying.
          resting={(writing ? writing.on?.app : openNote && (openNote.on?.app || trying.current === openNote.id)) ? undefined : liveNow}
          over={!writingId && !chosen && (overEnd || (!!openNote && whereYouWere.has(openNote.id) && !openNote.on?.element && !tryingHere))}
          pinned={openNote && inApp && (openNote.on?.app || tryingHere) ? () => appPins.current.get(openNote.id) : undefined}
          onAway={(openNote && !tryingHere) || chosen ? () => setOpen(undefined) : undefined}
        >
          {listed || onGrid ? undefined : openNote && !generalOpen ? row(openNote) : writing ? writingCard(writing) : chosen || overEnd ? <Chosen {...chosenProps} /> : undefined}
        </Beside>
        {many && (
          <Grid
            room={gridRoom}
            review={review}
            round={round}
            up={onGrid}
            standing={(name) => standing?.get(name)}
            needs={needs}
            accepted={review.accepted || acceptedHere ? acceptedAfter : undefined}
            step={gridStep}
            onFlow={(name) => leave(name, true)}
          />
        )}
      </main>
    </Page>
  );
}

// What you did taken over, as it's kept while you're there: the flow and moment you took it over at, the recording so
// far on one clock, and what you did, for taking it over again.
type Session = { address?: string; id: string; from: { flow: string; at: number }; events: { timestamp: number }[]; did: Did[]; kept: number; shift: number; heard?: number };
// The fork you're making while you're in the app, on the page you're in.
type Growing = ForkLine & { address: string };

// A fork off a flow: where you took it over, what you did there, and the longest recording kept of it, which plays the
// flow up to there, then you. It's named for the time you were in the app, as each note there keeps it. Walked again on
// a later round, it's that round's recording of your steps, with your notes on it where they got to: the same fork,
// under the same name, so the two are compared as two rounds of a flow are.
type Fork = { name: string; session: string; from: { flow: string; at: number }; did: Did[]; recording: string; length: number; walked?: boolean; notes?: { id: string; at: number }[] };
const sessionOf = (recording: string) => recording.match(/^(?:branches\/(.+)-\d+|walks\/(.+))\.json$/)?.slice(1).find(Boolean) ?? recording;
const forkName = (recording: string) => `fork:${sessionOf(recording)}`;
// The recording a place is on: its flow's, or its fork's.
const playedOn = (place: Place) => (place.app ? forkName(place.app.recording) : place.flow);
function forksIn(notes: Note[]): Fork[] {
  const longest = new Map<string, Fork>();
  const keep = (fork: Fork) => void ((longest.get(fork.name)?.length ?? 0) < fork.length && longest.set(fork.name, fork));
  for (const { on } of notes) if (on?.app) keep({ name: forkName(on.app.recording), session: sessionOf(on.app.recording), ...on.app });
  return [...longest.values()];
}

// A step of yours a walk couldn't do, as you'd say it.
function couldntDo({ does, what }: Did): string {
  const named = what ? `“${what}”` : "What you did next";
  if (does === "fill" || does === "type") return `${named} isn’t there to type into any more.`;
  if (does === "selectOption") return `${named} isn’t there to choose from any more.`;
  return `${named} isn’t there to click any more.`;
}

// The forks walked again for a round, from where its answers to notes made in the app were placed.
function walkedIn(round: Round): Fork[] {
  const walked = new Map<string, Fork>();
  for (const { note, on } of round.replies) {
    if (!on?.app || on.at === undefined) continue;
    const name = forkName(on.app.recording);
    const fork = walked.get(name) ?? walked.set(name, { name, session: sessionOf(on.app.recording), ...on.app, walked: true, notes: [] }).get(name)!;
    fork.notes!.push({ id: note, at: on.at });
  }
  return [...walked.values()];
}

// Each fork plays after its flow, as the flow's steps up to where you took over, then yours, in the app, each of your
// notes a step of its own, so a fork and the same fork walked again keep in step at each note.
function forked(round: Round, forks: Fork[]): Round {
  if (!forks.length) return round;
  const off = (flow: Flow): Forked[] =>
    forks
      .filter((fork) => fork.from.flow === flow.name)
      .map((fork) => ({
        name: fork.name,
        length: fork.length,
        steps: [
          ...flow.steps.filter((step) => step.at < fork.from.at),
          { title: "In the app", at: fork.from.at },
          ...(fork.notes ?? []).toSorted((a, b) => a.at - b.at).map((note) => ({ title: `Note ${note.id}`, at: note.at })),
        ],
        recording: fork.recording,
        person: "You",
        fork: flow.name,
      }));
  return { ...round, flows: round.flows.flatMap((flow) => [flow, ...off(flow)]) };
}

// Where a note made in the app was taken over, on another round's recording of its flow: in the step you were in, by its
// title, as far into it as you were, kept in step as every moment is across rounds; and what the note is on, if the
// page there has it. Nowhere when that round's flow doesn't take the step that far.
function takenOverIn(review: Review, on: Place, written: number, round: Round, read: Read): { at?: number; element?: Thing } {
  const from = on.app!.from;
  const then = review.rounds.find((kept) => kept.number === written)?.flows.find((flow) => flow.name === from.flow);
  const now = round.flows.find((flow) => flow.name === from.flow);
  const paused = then && pausedAt(then, from.at);
  const step = paused && now?.steps.find((step) => step.title === paused.step);
  if (!then || !now || !paused || !step || (step.actions?.length ?? 0) < (paused.actions ?? 0)) return {};
  const kept = inStep(from.at, then, now);
  const at = Math.round((samePaused(pausedAt(now, kept), paused) ? kept : (paused.actions ? step.actions![paused.actions - 1]! : (step.actions?.at(-1) ?? step.at)) + 0.05) * 100) / 100;
  // The page as the last step before the moment left it.
  const readings = read(round.number, now.name) ?? [];
  const page = readings.findLast((reading) => reading.at <= at + 0.05) ?? readings[0];
  const thing = on.element && page?.things.find((thing) => thing.role === on.element!.role && thing.name === on.element!.name);
  return { at, ...(thing && { element: elementOf(thing, on.element!.name) }) };
}

