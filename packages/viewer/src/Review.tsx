// A review on one page: the recording is where you look, with what you can do to its moment on a bar across its bottom
// edge and what's open beside its spot; the timeline under it is the map of what's been said. The round is the page with
// every scene: where you arrive, go back through rounds, and send and accept. The view changes only when you change it: a
// new round says it's in, and waits for you.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { elementOf } from "@playthrough/page";
import { inStep, lastLooked, newId, readyToAccept, time, waitingForTheAgent, type Did, type Element as Thing, type Scene, type Note, type Point, type Place, type Review, type Round, type Send, type Verdict } from "@playthrough/review";
import { accept, keepBranch, recording, send, useAgentWaiting, useReview, useYou } from "./api.ts";
import { Bar } from "./Bar.tsx";
import { Beside, clickedAt } from "./Beside.tsx";
import { HOLD } from "./Card.tsx";
import { answersTo, diamondAt, diamondsOn, grownFrom, madeFor, type Changed, type Diamond } from "./changes.ts";
import { Chosen, rowsIn, settles, type Props as ChosenProps, type Row } from "./Chosen.tsx";
import { Controls, type Look } from "./Controls.tsx";
import { DownloadVideo, type Asked } from "./DownloadVideo.tsx";
import type { ForkLine } from "./Timeline.tsx";
import { useUnsent } from "./draft.ts";
import { grow, pushIn, takeOff, type Taking } from "./flight.ts";
import type { Step } from "./Step.tsx";
import { Work } from "./Work.tsx";
import { follow, pausedAt, readyAt, readyIn, samePaused, takenOver, type Live, type Paused } from "./live.ts";
import { along, CARD, clamp, SCENE_IN, momentAt, POSTER, type Moment } from "./moments.ts";
import { asIfSent, changedFirst, draftOn, toSend, everyDraft, fill, ink, lookGood, notesOn, nothing, said, seen, sendOf, settledBefore, standings, takeBack, upTo, workingSince, type Draft, type Shown } from "./notes.ts";
import { NoteRow, number as numberLook, Writing, type Comparing } from "./Notes.tsx";
import { Playhead, useNow, type Forked } from "./playhead.ts";
import { changesIn, recorded } from "./replay.ts";
import { clock, roundName } from "./Rounds.tsx";
import { Stage, type Bare, type Mark, type Placed, type Shown as Size } from "./Stage.tsx";
import { placeFrom, placeName as nameOf, placeOn, useReadings, watchedIn, type Read } from "./things.ts";
import { Wire } from "./Wire.tsx";

// What's open beside the recording: a note, a change you chose, or a new note being written, by its id.
// What's open: a note, a change, a note being written, or a scene's own card, at its end.
// A change's moment is open with `change`; with `one`, the change whose why is open beside its mark, `kept` once its
// pin is pressed rather than pointed at.
type Open = { note: string } | { change: string; one?: string; kept?: boolean } | { writing: string } | { end: string };
// A click noted in the app: what it's on there, what was done there before it, and where, in the app's page.
type NotedInApp = { element?: Thing; point?: Point; did: Did[]; x: number; y: number };

// Leaving every scene at once for one, the recording waits under its name until the pictures have landed, and this long
// after: one thing moves at a time.
const SETTLE = 400;
// A card is at its mark while the playhead is this near it, in seconds: a moment kept to the hundredth lands a frame off.
const NEAR = 0.05;

export function ReviewPage({ id, scene }: { id: string; scene?: string }) {
  const kept = useReview(id);
  const you = useYou();
  const title = Array.isArray(kept) ? undefined : kept?.title;
  useEffect(() => void (document.title = title ? `${title} · Playthrough` : "Playthrough"), [title]);
  const shown = useMemo(() => (kept && !Array.isArray(kept) ? changedFirst(seen(kept)) : undefined), [kept]);
  if (Array.isArray(kept)) return <Page><p className="m-auto text-soft">{kept[0]}</p></Page>;
  if (!shown || !you) return <Page />;
  return <Reviewing review={shown} you={you} scene={scene} />;
}

// What's done with the review as a whole sits at the right of the line its title is on.
export function Page({ title, actions, children }: { title?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden px-5 phone:px-4">
      <header className="flex min-h-[46px] min-w-0 items-center gap-2 py-2.5 text-soft">
        <a href="/" className="font-semibold text-fg">Playthrough</a>
        {title && <span className="text-faint">/</span>}
        {title && <span className="truncate">{title}</span>}
        {/* Its words end on the page's edge, as the name at the start begins on it. */}
        {actions && <div className="-my-1.5 -mr-2.5 ml-auto flex flex-none items-center">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

// You review scenes, each its newest recording: a round that arrives while you're on the newest is followed between scenes,
// never under you. One that arrives while you're looking back at an older one says it's in; it's yours to go to. Going to
// the newest round, you've seen it's there, and the older ones are for looking back.
function Reviewing({ review, you, scene }: { review: Review; you: string; scene?: string }) {
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
  const following = viewing === newest && latest.number !== newest;
  return <OnRound review={review} round={round} latest={latest} newer={following ? latest : undefined} arrived={latest.number !== newest && !following} you={you} scene={scene} onRound={choose} />;
}

// newer: a round that came in while you were on the newest, to follow at the next scene you go to.
type OnRoundProps = { review: Review; round: Round; latest: Round; newer?: Round; arrived: boolean; you: string; scene?: string; onRound: (round: number) => void };

function OnRound({ review: kept, round, latest, newer, arrived, you, scene: inAddress, onRound }: OnRoundProps) {
  // What you've just sent shows as sent until the review comes back with it.
  const [posted, setPosted] = useState<Send[]>([]);
  const notBack = posted.filter((sent) => !kept.sends.some((send) => send.id === sent.id));
  const review = notBack.length ? { ...kept, sends: [...kept.sends, ...notBack] } : kept;
  // What you haven't sent is the review's, each part under the round it's about: here is everything up to this round.
  // What you write goes under this round; what you change of it, under whichever it's under.
  const [unsent, changeUnsent] = useUnsent(review.id);
  const draft = upTo(unsent, round.number);
  const change = (changed: (draft: Draft) => Draft) => changeUnsent((unsent) => everyDraft(unsent, changed));
  const changeHere = (changed: (draft: Draft) => Draft) => changeUnsent((unsent) => draftOn(unsent, round.number, changed));
  // A note made in the app before forks were part of their scene named a scene of its own.
  useEffect(() => {
    const own = (note: Note) => (note.on?.app && note.on.scene !== note.on.app.from.scene ? { ...note, on: { ...note.on, scene: note.on.app.from.scene } } : note);
    if ([...draft.notes, ...draft.unsaved].some((note) => own(note) !== note)) change((draft) => ({ ...draft, notes: draft.notes.map(own), unsaved: draft.unsaved.map(own) }));
  });
  // The round as it plays: each scene with your forks off it, where you took it over, carried on by hand and said
  // something there, from the notes you made in the app on it.
  const here = unsent[round.number] ?? nothing;
  const madeHere = [...review.sends.filter((send) => send.round === round.number).flatMap((send) => send.notes), ...here.notes, ...here.unsaved];
  const forks = JSON.stringify([...forksIn(madeHere), ...ranAgainIn(round)]);
  const forkList: Fork[] = useMemo(() => JSON.parse(forks), [forks]);
  const played = useMemo(() => forked(round, forkList), [round, forkList]);
  const [open, setOpen] = useState<Open>();
  // Until a newer round is followed, the round you're on is still the one you act on.
  const current = round === latest || !!newer;
  const following = useRef(false);
  // The note whose Not quite is being written.
  const [asking, setAsking] = useState<string>();
  if (asking && !(open && "note" in open && open.note === asking)) setAsking(undefined);
  // What was being written in a note's Not quite or Edit when its card closed, by the note.
  const [unfinished, setUnfinished] = useState<Record<string, string>>({});
  const keepUnfinished = (id: string, words: string | undefined) =>
    setUnfinished(({ [id]: _, ...others }) => (words === undefined ? others : { ...others, [id]: words }));
  const [fresh, setFresh] = useState<string>();
  const [met, setMet] = useState<string[]>([]);
  // Looking at another round starts with nothing open.
  const [on, setOn] = useState(round.number);
  // Every scene at once: where you arrive on a round, even one with a single scene, and come back to, where the round is
  // sent and accepted, unless the address names a scene of the round: there, you're in it. A round that's new to you
  // starts there too, and going through rounds there stays there. One that arrives while you're on another leaves you
  // where you are.
  const many = round.scenes.length > 0;
  const [arrivedIn] = useState(() => round.scenes.find((scene) => slug(scene.name) === inAddress)?.name);
  // Every scene is noted and taken over where it is, on the page: you don't leave it for one.
  const [grid, setGrid] = useState(many);
  const onGrid = grid && many;
  const been = useRef([round.number]);
  if (on !== round.number) {
    setOn(round.number);
    setOpen(undefined);
    setGrid(grid || (many && !following.current && !been.current.includes(round.number)));
    been.current.push(round.number);
  }

  // You arrive at the start, as on a video before you press play. Going to another round keeps your place: the same scene
  // at the matching moment, or its start if that round never recorded the scene.
  const [playhead] = useState(() => new Playhead(played.scenes, { scene: arrivedIn ?? round.scenes[0]?.name ?? "", at: POSTER }));
  useEffect(() => () => playhead.destroy(), [playhead]);
  const onRoundNow = useRef(round.number);
  useLayoutEffect(() => {
    // A fork that's gone, with its last note, or on the round you go to, leaves you where it left its scene.
    const from = playhead.scene as Forked;
    const gone = !played.scenes.some((scene) => scene.name === from.name) && from.fork !== undefined && from.leaves !== undefined;
    const was = gone ? { scene: playhead.scenes.find((scene) => scene.name === from.fork) ?? from, at: from.leaves! } : { scene: from, at: playhead.now.moment.at };
    const to = played.scenes.find((scene) => scene.name === was.scene.name);
    if (onRoundNow.current === round.number) {
      playhead.keep(played.scenes);
      if (gone && to) playhead.go({ scene: to.name, at: was.at });
      return;
    }
    onRoundNow.current = round.number;
    // Followed between scenes, what was playing plays on.
    const playing = following.current && playhead.now.playing;
    following.current = false;
    playhead.pause();
    playhead.watch(played.scenes, to ? { scene: to.name, at: inStep(was.at, was.scene, to) } : { scene: round.scenes[0]?.name ?? "", at: -CARD });
    if (playing) playhead.play();
  }, [round, played, playhead]);
  // On a fork, you're still watching its scene.
  const inPlay = useNow(playhead, (now) => now.moment.scene);
  const onFork = forkList.find((fork) => fork.name === inPlay);
  const watching = onFork?.from.scene ?? inPlay;
  const scene = round.scenes.find((scene) => scene.name === watching) ?? round.scenes[0];
  // The address says the scene you're in, as words joined by dashes, as a review's id is, and only the review on every
  // scene at once.
  useEffect(() => {
    const address = `/${encodeURIComponent(review.id)}${onGrid || !watching ? "" : `/${slug(watching)}`}`;
    if (location.pathname !== address) history.replaceState(null, "", address);
  }, [review.id, onGrid, watching]);
  // Where the playhead is, as the step needs it: playing, at a scene's start, partway, or at its end. A fork's end
  // isn't the scene's.
  const where = useNow(playhead, ({ moment, playing }) => {
    const length = playhead.scenes.find((scene) => scene.name === moment.scene)?.length ?? 0;
    const forking = forkList.some((fork) => fork.name === moment.scene);
    return playing ? "playing" : moment.at >= length - 0.06 && !forking ? "end" : moment.at <= 0 ? "start" : "partway";
  });

  // Taking over: the moment the playhead rests on, on the latest round, is made ready when you press Take over, and the
  // frame turns into the app once it has loaded. Playing again, or going to another round, lays the recording back over
  // it; a round arriving doesn't.
  const [live, setLive] = useState<Live>();
  // How quickly the app has loaded and settled in the frame, from when its address came: on top of how long the moment
  // takes to be made ready, part of how long taking over takes. The quickest so far, as one slow load, a page the app
  // builds for the first time, isn't every load.
  const loading = useRef<{ since?: number; took?: number }>({});
  useEffect(() => void (live?.address && !live.settled && (loading.current.since = Date.now())), [live?.address]);
  const passing = useNow(playhead, ({ moment, playing }) => {
    const on = round.scenes.find((scene) => scene.name === moment.scene);
    const paused = playing && current && !onGrid && on && moment.at >= 0 ? pausedAt(on, moment.at) : undefined;
    return paused && JSON.stringify({ scene: on!.name, paused });
  });
  useEffect(() => {
    if (!passing) return;
    const { scene, paused }: { scene: string; paused: Paused } = JSON.parse(passing);
    follow(review.id, scene, paused);
  }, [passing, review.id]);
  const playingNow = useNow(playhead, (now) => now.playing);
  const backToRecording = (at?: { x: number; y: number }) => {
    setLive((now) => now && { ...now, shown: false, at });
    window.focus();
  };
  if (live?.shown && (playingNow || on !== round.number)) setLive({ ...live, shown: false });
  // The note whose answer you're trying in the app, taken over where you made it.
  const trying = useRef<string>(undefined);
  // Letting go, what you did is kept only as far as you said something about it: you land at your last note on the
  // fork, or with nothing said, back where you took the scene over, with nothing left behind.
  const letGo = (at?: { x: number; y: number }) => {
    // On the page, you're back on the step you took over, your notes from the app on it.
    const kept = !onGrid && live?.shown && yours.current.address === live.address && forkList.find((fork) => fork.session === yours.current.id);
    if (kept) playhead.go({ scene: kept.name, at: kept.length });
    trying.current = undefined;
    backToRecording(at);
  };
  const letGoNow = useRef(letGo);
  letGoNow.current = letGo;
  // A fork run again isn't taken over: a fork is taken over from its scene, never from another fork. Your own, on the
  // round you made it, is carried on from its end: the scene taken over where you took it, your steps done again.
  const forkOfFork = !!onFork?.again;
  // With the answer to a note made in the app open, it's taken over where you made the note, as Take over where you
  // were in its card does; on the page, resting at one, the way it was found.
  const takeOver = () => {
    if (live?.shown) return letGo();
    if (forkOfFork) return;
    if (onGrid && restingAt.current) return tryAgain(restingAt.current);
    if (openNote && whereYouWere.get(openNote.id)?.at !== undefined && openNote.on?.scene === watching) return tryWhereYouWere(openNote);
    trying.current = undefined;
    const base = onFork && round.scenes.find((scene) => scene.name === onFork.from.scene);
    if (onFork && base) {
      starting.current = { from: onFork.from, carry: yours.current.id === onFork.session ? yours.current : undefined };
      return takeOverAt(base, onFork.from.at, onFork.did);
    }
    starting.current = { from: { scene: playhead.scene.name, at: Math.round(Math.max(0, playhead.now.moment.at) * 100) / 100 } };
    // While its name is up, the scene is at its start.
    takeOverAt(playhead.scene, Math.max(0, playhead.now.moment.at));
  };
  // On the page, the answer to a note made in the app you rest at: where you took its scene over, what you did there
  // done again on this round's work, the note's pin on what it's on.
  const restingAt = useRef<string>(undefined);
  const tryAgain = (id: string) => {
    const app = notes.find((note) => note.id === id)?.on?.app;
    const scene = app && round.scenes.find((one) => one.name === app.from.scene);
    if (!app || !scene) return;
    trying.current = id;
    starting.current = { from: app.from };
    takeOverAt(scene, app.from.at, app.did, [id]);
  };
  // A note made in the app on an earlier round is checked the way it was found, by trying it: this round's scene taken
  // over where you took it over then, what you did there done again, and in the app the note's pin on what it's on, its
  // card beside it.
  const tryWhereYouWere = (note: Shown) => {
    const was = whereYouWere.get(note.id);
    const scene = round.scenes.find((scene) => scene.name === note.on?.scene);
    if (!scene || was?.at === undefined || !current) return;
    trying.current = note.id;
    setOpen({ note: note.id });
    starting.current = { from: { scene: scene.name, at: was.at } };
    takeOverAt(scene, was.at, was.did, [note.id]);
  };
  const takeOverAt = (on: Scene, at: number, did?: Did[], notes?: string[]) => {
    const paused = pausedAt(on, at);
    if (!current || at < 0 || !paused) return;
    playhead.pause();
    // The app is now, alone: how it was goes.
    setPeek(false);
    chooseLook("one");
    if (!did && live && live.scene === on.name && samePaused(live.paused, paused) && live.address) {
      takenOver(review.id, on.name, paused);
      const { since, took } = loading.current;
      return setLive({ ...live, shown: true, at: undefined, due: !live.settled && since && took ? since + took : undefined });
    }
    // The one being made ready since you paused, if it is, and how long it will be, if the last run says.
    setLive({ scene: on.name, paused, shown: true });
    const same = (now: Live | undefined): now is Live => now?.scene === on.name && samePaused(now.paused, paused);
    readyAt(review.id, on.name, paused, { did, notes }).then((answer) => {
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
      if (data?.playthrough === "settled" && source === waiting) {
        // Once for each moment: it says so again on every page it loads while it's yours.
        if (loading.current.since) loading.current = { took: Math.min(Date.now() - loading.current.since, loading.current.took ?? Infinity) };
        setLive((now) => now && { ...now, settled: true });
      }
      if (data?.playthrough === "recorded" && source === waiting) recordedInApp.current(data.events);
      if (data?.playthrough === "did" && source === waiting) yours.current.did = data.did;
      if (data?.playthrough === "pinned") pinnedInApp(data.at);
      if (data?.playthrough === "escape") {
        if (notingNow.current) setNoting(false);
        else letGoNow.current({ x: data.x, y: data.y });
      }
      if (data?.playthrough === "note") noteNow.current();
      if (data?.playthrough === "noted") notedInApp.current(data);
    };
    addEventListener("message", told);
    return () => removeEventListener("message", told);
  }, []);

  // The view is yours: it changes only when you change it. Compare pressed puts how it was beside how it is now
  // ("side"), until it's pressed again.
  const [look, setLook] = useState<Look>("one");
  const [actual, setActual] = useState(false);
  // Side by side starts at actual size each time you go to it; the size then fits both to the whole page.
  const [sideFit, setSideFit] = useState(false);
  // The note whose old fork is side by side with its fork run again.
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
  const noted = notesOn(review, round.number, you, unsent);
  // Only an answer is a difference to judge: a note nobody has answered has nothing to compare.
  const answered = (note: Shown) => note.on?.at !== undefined && note.turns.some((turn) => turn.agent);
  // An answer is judged against what its note asked about: the round it was written on, or the round it was last sent
  // back on, whoever wrote it.
  const noteOpen = open && "note" in open ? noted.find((note) => note.id === open.note) : undefined;
  const askedIn = noteOpen && answered(noteOpen) ? noteOpen.turns.filter((turn) => !turn.agent && turn.round < round.number).map((turn) => turn.round) : [];
  const askedFrom = askedIn.length ? Math.max(...askedIn) : undefined;
  const looked = scene ? lastLooked(review, you, scene.name, round.number) : undefined;
  // Compare is this moment as it was: on the round an open answer's note asked about, or else the round you last looked
  // at this scene on, or Before. Held, it's a still look in place while you hold it; pressed and let go, the two go side
  // by side, playing together, until it's pressed again, or Escape. On a bar, an answer that moves, held or pressed, the
  // two play its stretch side by side on repeat.
  const compared = round.number > first ? (askedFrom ?? looked ?? first) : undefined;
  const [peek, setPeek] = useState(false);
  const pressed = useRef<number>(undefined);
  const pressCompare = () => {
    if (pressed.current === undefined)
      pressed.current = window.setTimeout(() => {
        setPeek(true);
        if (repeats) setSideFit(false);
      }, HOLD);
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
  const noteNow = useRef(() => {});
  const notedInApp = useRef<(noted: NotedInApp) => void>(() => {});
  // While you're in the app, what you do there is recorded, from when it was handed to you: a fork off the scene, on the
  // timeline as soon as you're there. Carried on from a fork, it goes on from where that one ended.
  const yours = useRef<Session>({ id: "", events: [], did: [], kept: 0, shift: 0, from: { scene: "", at: 0 } });
  const starting = useRef<{ from: Fork["from"]; carry?: Session }>(undefined);
  const [growing, setGrowing] = useState<Growing>();
  const recordedInApp = useRef<(events: { timestamp: number }[]) => void>(() => {});
  recordedInApp.current = (events) => {
    if (!live || !events.length) return;
    if (yours.current.address !== live.address) {
      const { from, carry } = starting.current ?? { from: { scene: live.scene, at: 0 } };
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
  // Kept as a recording, what you did plays as the scene up to where you took it over, then you. What you said earlier on
  // the same fork goes on with the longer one.
  const keepFork = async (session: Session): Promise<Fork | string[]> => {
    const kept = `${session.id}-${++session.kept}.json`;
    // It ends now, not at the last thing the page did: still time is time you spent there too.
    const now = { type: 5, data: { tag: "now", payload: {} }, timestamp: session.events.at(-1)!.timestamp + Date.now() - (session.heard ?? Date.now()) };
    const length = await keepBranch(review.id, round.number, session.from, [...session.events, now], kept);
    if (typeof length !== "number") return length;
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
    document.querySelector<HTMLIFrameElement>("[data-live] iframe")?.contentWindow?.postMessage({ playthrough: "noting", on: noting && inApp }, "*");
  }, [noting, inApp]);
  const playingOn = useNow(playhead, (now) => now.playing);
  useEffect(() => void (playingOn && setNoting(false)), [playingOn]);
  const working = workingSince(review, latest);
  const agentWaiting = useAgentWaiting(review.id);

  // Left and Right step to the next moment the page changes, or a second where nothing does; with Shift, a tenth.
  const [changes, setChanges] = useState<{ scene: string; at: number[]; clicks: number[]; acted: [number, number][]; moved: Map<string, number[]> }>();
  useEffect(() => {
    if (!scene) return;
    let current = true;
    recording(review.id, round.number, scene.recording).then((events) => {
      const { changes, clicks, acted } = recorded(events);
      // When what each answer that moves is on changed: watching it starts at what set it moving.
      const moved = new Map(round.replies.flatMap((reply) => (reply.watch && reply.on?.scene === scene.name && reply.on.element?.node !== undefined ? [[reply.note, changesIn(events, reply.on.element.node)] as const] : [])));
      if (current) setChanges({ scene: scene.name, at: changes, clicks, acted, moved });
    });
    return () => void (current = false);
  }, [review.id, round.number, scene]);
  // The forks off the scene you're watching.
  const forksHere = forkList.filter((fork) => fork.from.scene === watching).map((fork): ForkLine => ({ name: fork.name, at: fork.from.at, length: fork.length }));
  // A step crosses from one scene into the next, never into a fork; on a fork, past its end, it's back where the fork
  // left its scene, and before where it leaves, on the scene, which it's the same as there.
  const nudge = (direction: 1 | -1, fine: boolean) => {
    const on = playhead.scene as Forked;
    if (on.fork !== undefined && on.leaves !== undefined) {
      const at = playhead.now.moment.at + direction * (fine ? 0.1 : 1);
      if (at > on.length) return playhead.go({ scene: on.fork, at: on.leaves + Math.min(at - on.length, 0.1) });
      return playhead.go(at < on.leaves ? { scene: on.fork, at } : { scene: on.name, at });
    }
    const scenes = playhead.scenes.filter((scene) => (scene as Forked).fork === undefined);
    const now = along(scenes, playhead.now.moment);
    const starts = scenes.map((scene) => along(scenes, { scene: scene.name, at: 0 }));
    const here = changes?.scene === scene?.name ? (changes?.at ?? []).map((at) => along(scenes, { scene: scene!.name, at: Math.min(at, scene!.length - 0.02) })) : [];
    const moments = [...starts, ...here].sort((a, b) => a - b);
    const next = direction > 0 ? moments.find((at) => at > now + 0.02) : moments.findLast((at) => at < now - 0.02);
    playhead.go(momentAt(scenes, fine ? now + direction * 0.1 : next !== undefined && Math.abs(next - now) < 1 ? next : now + direction));
  };

  // Before is how the app was: it's there to look back on, and notes go on the rounds after it.
  const readOnly = !!review.accepted || round.number === 0 || (!current && !arrived);
  const readOn = [round.number, ...(compared === undefined ? [] : [compared]), ...noted.map((note) => note.written)];
  const read = useReadings(review, review.rounds.filter((kept) => readOn.includes(kept.number)).map((kept) => (kept.number === round.number ? played : kept)));
  // Each note sits where its thing is on this round: its moment here, on what it's on here, once that's found. One on
  // something this round doesn't have is lost here. One made in the app is answered on its fork, run again as the agent
  // wrote it, where the fork first shows its thing, as record places it. On a round that doesn't answer it, it sits where you took its scene over, which this round's recording shows, as nothing
  // recorded what you did after; where this round's scene doesn't go that far, it's on the whole scene.
  const answeredOn = (note: Shown) => (note.on?.app && note.written !== round.number ? round.replies.find((reply) => reply.note === note.id)?.on : undefined);
  const ranAgainTo = (note: Shown) => (answeredOn(note)?.app ? answeredOn(note) : undefined);
  const whereYouWere = new Map(
    noted.flatMap((note) => (note.on?.app && note.written !== round.number && !answeredOn(note) ? [[note.id, { ...takenOverIn(review, note.on, note.written, round, read), did: note.on.app.did }] as const] : [])),
  );
  const notes = noted.map((note) => {
    const answered = answeredOn(note);
    if (answered) return { ...note, on: answered };
    const was = whereYouWere.get(note.id);
    if (was) return { ...note, on: { scene: note.on!.app!.from.scene, ...(was.at !== undefined && { at: was.at, ...(was.element && { element: was.element }) }) } };
    return note.on && !note.on.app ? { ...note, on: placeOn(review, note.id, note.on, note.written, round, read) ?? note.on } : note;
  });
  const lost = noted.filter((note, i) => note.on?.element && !note.on.app && notes[i]!.on !== note.on && !notes[i]!.on?.element).map((note) => note.id);
  // The notes whose things have left the page you're watching.
  const [gone, setGone] = useState<string[]>([]);
  const settled = settledBefore(review, round.number, you);
  const playingNotes = scene ? notes.filter((note) => note.on?.scene === scene.name && note.on.at !== undefined) : [];

  // Where each scene stands for you on the round you judge, and, once the work is accepted, on the last.
  const judging = !readOnly || (!!review.accepted && round === latest);
  const standing = useMemo(() => (judging ? standings(review, round.number, you, unsent) : undefined), [judging, review, round.number, you, unsent]);

  // A newer round is followed once you go to another scene, or to every scene: never under the scene you're watching.
  const followFrom = useRef<{ round: number; scene: string }>(undefined);
  useEffect(() => {
    if (!newer) return void (followFrom.current = undefined);
    if (followFrom.current?.round !== newer.number) followFrom.current = { round: newer.number, scene: watching };
    if (!onGrid && watching === followFrom.current.scene) return;
    following.current = true;
    onRound(newer.number);
  });
  const go = (name: string, at = SCENE_IN) => {
    playhead.pause();
    playhead.go({ scene: name, at });
  };

  // What's new to you on this round: a diamond at each moment something changed, on the timeline.
  const diamonds = diamondsOn(review, round.number, you);
  const clicks = changes?.scene === scene?.name ? (changes?.clicks ?? []) : [];
  const onNow = useNow(playhead, (now) => diamondAt(diamonds, now.moment, clicks)?.id);
  const chosen = open && "change" in open ? diamonds.find((diamond) => diamond.id === open.change) : undefined;
  const oneOpen = chosen && open && "change" in open ? open.one : undefined;
  const keptOne = oneOpen && open && "change" in open && open.kept ? oneOpen : undefined;
  // A change's why opens as you point at its pin, and goes a moment after you've left both the pin and its card, unless
  // you pressed the pin, which keeps it. Pointed at, a change is only drawn stronger: it never moves the view, which
  // carried the pin out from under the pointer, closed the card, and brought both back, again and again. Pressed, it's
  // chosen, and brought into view as anything chosen is.
  const leaving = useRef<ReturnType<typeof setTimeout>>(undefined);
  const whyOf = (id?: string) => {
    clearTimeout(leaving.current);
    const diamond = id && diamonds.find((diamond) => diamond.changes.some(({ change }) => change.id === id));
    if (diamond) {
      if (keptOne !== id) setOpen({ change: diamond.id, one: id });
    } else if (!keptOne) leaving.current = setTimeout(() => setOpen((open) => (open && "change" in open && !open.kept ? { change: open.change } : open)), 250);
  };
  // Your notes on what changed, each grown out of its change; and the change whose note is open or being written.
  const grown = new Map(
    [...notes.filter((note) => note.yours), ...draft.unsaved].flatMap((note) => {
      const diamond = grownFrom(diamonds, note.on);
      return diamond ? [[note.id, diamond] as const] : [];
    }),
  );
  const grownOpen = open && ("note" in open || "writing" in open) ? grown.get("note" in open ? open.note : open.writing) : undefined;
  // The change whose card is open, chosen or with your note on it open: one card, the change, the agent, you, Compare,
  // which compares as the change does.
  const changeOpen = chosen ?? grownOpen;
  const lit = chosen?.id ?? onNow;
  // Pointing at one of several changes, in a change's card or a note's answer, draws only that one.
  const [pointedChange, setPointedChange] = useState<string>();
  useEffect(() => setPointedChange(undefined), [changeOpen?.id]);
  // Paused on a change, with nothing else open, it's outlined where it is on the page; chosen, more firmly. What the agent
  // changed for the open note is the note's, drawn with it.
  const outlined = changeOpen?.scene === watching ? changeOpen : !open ? diamonds.find((diamond) => diamond.id === onNow) : undefined;

  // Every mark covers what it shows. Opened, a dot or a diamond goes still to its moment; a bar plays what it covers. In a
  // change's card its time goes there again, and a click on the rest of its header closes it, never playing or pausing
  // anything else.
  const running = useRef<string>(undefined);
  const play = (id: string, from: Moment, until: number) => {
    running.current = id;
    playhead.run(from, until);
  };
  // A change is a difference from an earlier round, seen on one frame: it opens there, still. New steps open on the
  // first step the scene didn't take before; Play goes on through them.
  const choose = (diamond: Diamond) => {
    setMet((met) => (met.includes(diamond.id) ? met : [...met, diamond.id]));
    setOpen({ change: diamond.id });
    go(diamond.scene, diamond.at);
  };
  // One on the whole scene is laid out at its end, so that's where it opens.
  const show = (note: Shown) => {
    setOpen(note.on && note.on.at === undefined ? { end: note.on.scene } : { note: note.id });
    setMet((met) => (met.includes(note.id) ? met : [...met, note.id]));
    if (note.on) go(playedOn(note.on), note.on.at ?? played.scenes.find((scene) => scene.name === playedOn(note.on!))?.length);
  };
  // Where an answer that moves is watched, in the scene its note is on, once the recording says when what it's on changed.
  const movingOf = (note: Shown) => {
    const watched = watchedIn(round, note.id, changes?.scene === scene?.name ? changes?.moved.get(note.id) : undefined);
    return watched && note.on && playedOn(note.on) === watched.scene ? watched : undefined;
  };
  // The time a note covers on the timeline is the time it plays: a dot its moment, a bar the stretch its answer moves in
  // (or that it's on).
  const span = (note: Shown) => movingOf(note) ?? { at: note.on?.at ?? 0, until: note.on?.until };
  // Chosen, from its dot, its pin or the bar's list alike, a note opens on the frame it was written on, still: that frame
  // is what it's about. A bar plays exactly what it covers, then its card asks. One on a whole scene opens in the scene's
  // own card, at its end.
  const pick = (note: Shown) => {
    const on = note.on;
    const its = on && played.scenes.find((scene) => scene.name === playedOn(on));
    const { at, until } = span(note);
    if (!its || until === undefined) return show(note);
    setOpen({ note: note.id });
    setMet((met) => (met.includes(note.id) ? met : [...met, note.id]));
    play(note.id, { scene: its.name, at }, Math.min(its.length, until));
  };

  // The agent's line about a scene is on its title card: the first time you come to the scene, playing waits there, the
  // card up, until you play on. Once its recording has started, it's read.
  const [readLines, setReadLines] = useState<string[]>([]);
  const pastCard = useNow(playhead, (now) => (now.moment.at >= 0 ? now.moment.scene : undefined));
  if (pastCard && !readLines.includes(pastCard)) setReadLines([...readLines, pastCard]);
  // Playing stops at each answer that waits for you, and at each change new to you, the first time it gets there, and
  // opens it as a click on it would: what changed is marked on the recording, where it's still, and the card says why.
  // One on a fork run again is on the way: playing goes up the fork where you took the scene over, and from the fork's
  // end comes back down into the scene (playhead.ts).
  const forksAgain = forkList.filter((fork) => fork.again);
  const waitsOn = (fork: Fork) => playingNotes.some((note) => note.on && playedOn(note.on) === fork.name && note.state === "needs you" && !note.unsent && !met.includes(note.id));
  const onto = (scene: string, at: number) => () => {
    playhead.go({ scene, at });
    playhead.play();
  };
  useEffect(() =>
    playhead.stopAt([
      ...forksAgain.filter(waitsOn).map((fork) => ({ id: fork.name, scene: fork.from.scene, at: fork.from.at, reached: onto(fork.name, fork.from.at) })),
      ...round.scenes.filter((scene) => scene.line && !readLines.includes(scene.name)).map((scene) => ({ id: `card:${scene.name}`, scene: scene.name, at: POSTER, reached: () => {} })),
      ...diamonds.filter((diamond) => diamond.row && diamond.until === undefined && !met.includes(diamond.id)).map((diamond) => ({ id: diamond.id, scene: diamond.scene, at: diamond.at, reached: () => choose(diamond) })),
      ...playingNotes.flatMap((note) =>
        note.on && note.state === "needs you" && !note.unsent && !met.includes(note.id) ? [{ id: note.id, scene: playedOn(note.on), at: span(note).at, reached: () => pick(note) }] : [],
      ),
    ]),
  );
  // A new note starts unsaved, where it will sit. With words in it, it's never thrown away by going elsewhere: it's kept,
  // not saved, until you save it or Cancel takes it back. With none, it goes. Started again on the same thing at the same
  // moment, it's the one kept there, opened again.
  const write = (on: Place) => {
    if (readOnly) return;
    const kept = draft.unsaved.find((note) => JSON.stringify(note.on) === JSON.stringify(on));
    if (kept) return setOpen({ writing: kept.id });
    const id = newId();
    changeHere((draft) => ({ ...draft, unsaved: [...draft.unsaved, { id, on, words: "" }] }));
    setOpen({ writing: id });
  };
  const writingId = open && "writing" in open ? open.writing : undefined;
  // Note, by its key, the bar or the app, turns on only where a note can be made: never on an accepted review or a round
  // gone by, where it lit up and the click went nowhere.
  const pressNote = () => {
    if (readOnly) return;
    playhead.pause();
    setNoting(!noting);
  };
  noteNow.current = pressNote;
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
    // Not kept, there's nothing for a note to be on: it says why, as a send that wasn't kept does.
    if (Array.isArray(fork)) return void setTrouble(fork);
    const app = { from: fork.from, did, recording: fork.recording, length: fork.length };
    write({ scene: fork.from.scene, at: Math.floor(fork.length * 100) / 100, ...(element ? { element } : point && { point }), app });
  };
  // A note in the app shows there as a pin on what it's on.
  const pinInApp = (id: string, on: Place) =>
    document
      .querySelector<HTMLIFrameElement>("[data-live] iframe")
      ?.contentWindow?.postMessage({ playthrough: "pin", id, number: notes.find((note) => note.id === id)?.number ?? notes.length + 1, css: on.element?.css, point: on.point }, "*");
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

  // Saved, a new note stays open with your words in it, and Play on its way on. A note on a scene you said looks good
  // takes that back.
  const saveNote = (note: Note, words: string) => {
    // Saved under the round it was started on.
    change((draft) => ({
      ...(note.on ? takeBack(draft, note.on.scene, notes) : draft),
      notes: draft.unsaved.some((kept) => kept.id === note.id) ? [...draft.notes, { id: note.id, ...(note.on && { on: note.on }), words }] : draft.notes,
      unsaved: draft.unsaved.filter((kept) => kept.id !== note.id),
    }));
    setOpen(note.on && note.on.at === undefined ? { end: note.on.scene } : { note: note.id });
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
  // Judging an answer yourself takes it from its scene's Looks good; Not quite takes back the scene's Looks good.
  const judge = (note: Shown, verdict: Verdict | undefined) =>
    changeUnsent((unsent) => {
      const unjudged = everyDraft(unsent, (draft) => {
        const kept = verdict?.verdict === "not quite" && note.on ? takeBack(draft, note.on.scene, notes) : draft;
        return { ...kept, verdicts: kept.verdicts.filter((kept) => kept.note !== note.id), withTheScene: kept.withTheScene.filter((id) => id !== note.id) };
      });
      return verdict ? draftOn(unjudged, round.number, (draft) => ({ ...draft, verdicts: [...draft.verdicts, verdict] })) : unjudged;
    });
  // A scene's Looks good is a checkbox in its header: pressed again, it's taken back.
  // Said, it's kept with the rest until you send, with the answers in it you haven't judged riding along. Pressed again,
  // it's taken back: unsent, it's gone; sent, taking it back goes with the next send.
  const lookingGood = (name: string) => {
    if (draft.takenBack.includes(name)) return changeHere((draft) => ({ ...draft, takenBack: draft.takenBack.filter((kept) => kept !== name) }));
    const good = standing?.get(name)?.is === "good";
    if (good && draft.looksGood.includes(name)) return change((draft) => takeBack(draft, name, notes));
    if (good) return changeHere((draft) => ({ ...draft, takenBack: [...draft.takenBack, name] }));
    changeHere((draft) => lookGood(draft, name, notes));
  };


  // Leaving every scene at once for a scene, its picture grows into the frame, and the scene plays once it's there; for a
  // step, the camera pulls back from it. Coming back, it pushes in on the step you were on, and what you were reading is
  // let go, unless you're writing it.
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

  // The scene you came back from and where you were in it, which every scene opens on.
  const [back, setBack] = useState<{ scene: string; at: number }>();
  const homing = useRef<{ frame: HTMLElement; box: DOMRect; page: DOMRect }>(undefined);
  const toGrid = () => {
    const scene = playhead.scene as Forked;
    const frame = document.querySelector<HTMLElement>("[data-frame][data-watched]");
    const page = frame?.querySelector("[data-replay]:not([hidden])")?.getBoundingClientRect();
    if (frame && page) homing.current = { frame, box: frame.getBoundingClientRect(), page };
    setBack(scene.fork === undefined ? { scene: scene.name, at: playhead.now.moment.at } : { scene: scene.fork, at: scene.leaves ?? 0 });
    playhead.pause();
    playhead.go({ scene: round.scenes[0]!.name, at: POSTER });
    if (open && !("writing" in open)) setOpen(undefined);
    setGrid(true);
  };
  useLayoutEffect(() => {
    const going = homing.current;
    homing.current = undefined;
    const home = back && gridRoom.current?.querySelector<HTMLElement>(`[data-picture="${CSS.escape(back.scene)}"]`);
    if (going && home && onGrid) pushIn(going.frame, going.box, going.page, home);
  });
  useLayoutEffect(() => {
    const flight = flying.current;
    flying.current = undefined;
    if (!flight) return;
    // Only the picture of the scene that plays grows into the frame.
    const frame = document.querySelector<HTMLElement>(`[data-frame="${round.number}"]`);
    const last = !frame ? 0 : grow(flight.taking.filter((taken) => taken.scene === playhead.scene.name), frame);
    if (!flight.playing) return;
    const from = playhead.now.moment;
    clearTimeout(settling.current);
    settling.current = window.setTimeout(() => {
      const { moment, playing } = playhead.now;
      if (playing || moment.scene !== from.scene || moment.at !== from.at) return;
      playhead.play();
    }, last + SETTLE);
  });

  // Up and Down go through the scene you're in: its notes and changes by their time, the recording going with them.
  const order: (Row | { scene: Scene })[] = scene ? [{ scene }, ...rowsIn(scene.name, notes, diamonds, settles(standing?.get(scene.name), true))] : [];
  const through = (direction: 1 | -1) => {
    const here = order.findIndex((row) =>
      "note" in row
        ? open && "note" in open && open.note === row.note.id
        : "diamond" in row
          ? chosen === row.diamond
          : !open && row.scene.name === watching,
    );
    const next = order[here < 0 ? 0 : clamp(here + direction, 0, order.length - 1)];
    if (!next || (here >= 0 && order[here] === next)) return;
    if ("note" in next) pick(next.note);
    else if ("diamond" in next) choose(next.diamond);
    else {
      setOpen(undefined);
      go(next.scene.name);
    }
  };

  // The note you're writing is a card beside what it's on, in a card's own margins, as an open note's is: numbered after
  // the rest, counting the ones you haven't saved, and named for where it is, over its box.
  const nextNumber = Math.max(0, ...notes.map((note) => note.number)) + 1;
  const writing = draft.unsaved.find((note) => note.id === writingId);
  const placeName = (on: Place | undefined) => nameOf(on && { ...on, scene: playedOn(on) }, read, round.number);
  const writingWords = (note: Note) => (
    <Writing
      words={note.words}
      placeholder={note.on && note.on.at === undefined ? "What isn’t good about it?" : "What do you think?"}
      question={note.on?.app ? "Your new note, on what’s in the app" : "Your new note"}
      onWords={(words) => keepWords(note.id, words)}
      onSave={(words) => saveNote(note, words)}
      onCancel={() => dropUnsaved(note.id)}
    />
  );
  const writingCard = (note: Note) => (
    <div key={note.id} data-open className="grid gap-2.5 px-4 py-2">
      <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-x-2">
        <span data-mark className={`${numberLook} relative z-1 mt-px bg-amber text-white`}>
          {nextNumber + draft.unsaved.indexOf(note)}
        </span>
        <span className="truncate">{placeName(note.on)}</span>
        <span className="min-w-[78px] text-right text-xs leading-5 text-amber-ink tabular-nums">{note.on?.at === undefined ? "" : time(note.on.at)}</span>
      </div>
      {writingWords(note)}
    </div>
  );
  // What isn't right about a change is a note on what it's on, at its moment, or on the first of new steps: one note,
  // opened again once it's there.
  const noteOn = (diamond: Diamond, one?: string) => {
    const already = [...grown].find(([, on]) => on === diamond)?.[0];
    const note = notes.find((note) => note.id === already);
    if (note) return pick(note);
    if (already) return setOpen({ writing: already });
    const on = diamond.changes.find((changed) => (one ? changed.change.id === one : !changed.answers))?.on;
    go(diamond.scene, diamond.at);
    write({ scene: diamond.scene, at: diamond.at, ...(diamond.until === undefined && (on?.element ? { element: on.element } : on?.box && { box: on.box })) });
  };
  // Playing on from an open card lets it go, as moving on from it does. At the scene's end there's nothing left to play,
  // and the scene asks whether it's good before the next one starts.
  const playOn = () => {
    setOpen(undefined);
    if (where !== "end") playhead.play();
  };
  // What the agent changed for a note is gone to as its diamond is, the note staying open.
  const row = (note: Shown, grownHere?: boolean) => {
    const isOpen = !!open && "note" in open && open.note === note.id;
    // A note's card is away once you've gone on into another scene, or what it's on has left the page: it asks nothing
    // there. Not while its own moment plays, on the way to it.
    const away =
      (!!note.on && round.scenes.some((scene) => scene.name === note.on!.scene) && note.on.scene !== watching) ||
      ((gone.includes(note.id) || lost.includes(note.id)) && !(where === "playing" && running.current === note.id));
    // Made in the app on an earlier round, it's tried where you were rather than compared, on the round that's the app
    // as it is now; in the app, a Looks good stays where you said it, as there's nothing to play on to.
    const was = whereYouWere.get(note.id);
    const takeable = current && !readOnly;
    // Answered on its fork, it's checked by watching and compared, as any answer is.
    const tryHere = was && (was.at === undefined || takeable) ? { round: round.number, live: trying.current === note.id ? liveNow : undefined, ...(was.at !== undefined && { onTakeOver: () => tryWhereYouWere(note) }) } : undefined;
    return (
      <NoteRow
        key={note.id}
        note={note}
        playhead={playhead}
        you={you}
        readOnly={readOnly}
        open={isOpen}
        fresh={fresh === note.id}
        compare={isOpen && !was && (answered(note) || grownHere) ? comparingIt : undefined}
        whereYouWere={tryHere}
        asking={asking === note.id}
        unfinished={unfinished[note.id]}
        away={away}
        grown={grownHere}
        whole={note.on?.at === undefined}
        onOpen={() => pick(note)}
        onClose={() => setOpen(undefined)}
        onAsking={(on) => setAsking(on ? note.id : undefined)}
        onUnfinished={(words) => keepUnfinished(note.id, words)}
        onJudge={(verdict) => judge(note, verdict)}
        onEdit={(words) => editNote(note.id, words)}
        changedAt={note.on?.at === undefined ? madeFor(diamonds, note.id) : undefined}
        onDiamond={choose}
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
  const asks = !!openNote && !readOnly && openNote.on?.at !== undefined && openNote.toJudge && !draft.verdicts.some((verdict) => verdict.note === openNote.id) && openNote.on?.scene === watching;
  // In the app where you were, with the note you're trying open: it stays by its pin there while you try it.
  const tryingHere = inApp && !!openNote && trying.current === openNote.id;
  // A card is about its mark's moment, a dot's or a diamond's, or a bar's stretch: once the playhead has left it, played
  // on or dragged along the timeline, it closes, and doesn't come back when playing stops. One made in the app is about
  // its moment on its fork run again, as its dot there is. One on a whole scene, or on the fork you're making, has no
  // mark there, and stays.
  const marked = openNote?.on?.at !== undefined && (!openNote.on.app || !!ranAgainTo(openNote));
  const mark = marked ? { scene: playedOn(openNote!.on!), ...span(openNote!) } : chosen && { scene: chosen.scene, at: chosen.at, until: undefined };
  // A change's card stays as long as its marks do: just past its moment too, until the next click, as they're drawn.
  const leftMark = useNow(playhead, ({ moment }) =>
    !!mark && !live?.shown && (chosen && !openNote ? diamondAt(diamonds, moment, clicks)?.id !== chosen.id : moment.scene !== mark.scene || moment.at < mark.at - NEAR || moment.at > (mark.until ?? mark.at) + NEAR),
  );
  useEffect(() => {
    if (leftMark) setOpen(undefined);
  }, [leftMark]);
  const comparedRound = compared === undefined ? undefined : review.rounds.find((kept) => kept.number === compared);
  // Motion is compared moving: on an open bar, Compare held is side by side too, while you hold it.
  const repeats = openNote && movingOf(openNote);
  const side = look === "side" || (peek && !!repeats);
  // A fork run again is compared with the fork you made, at its notes: the fork whose note is open, or
  // the one you're watching, open note or not. Side by side, it stays beside it once you've left it, until you go back
  // to one.
  const againHere =
    (openNote && ranAgainTo(openNote) ? forksAgain.find((fork) => fork.notes?.some((note) => note.id === openNote.id)) : undefined) ??
    (onFork?.again ? onFork : undefined) ??
    (side ? forksAgain.find((fork) => fork.name === besideFork.current) : undefined);
  besideFork.current = side ? againHere?.name : undefined;
  const madeFrom = (againHere?.notes ?? []).flatMap(({ id }) => {
    const on = noted.find((note) => note.id === id)?.on;
    return on?.app && on.at !== undefined ? [{ id, at: on.at, app: on.app }] : [];
  });
  // Kept longer as you went on, the fork's longest recording.
  const source = madeFrom.toSorted((a, b) => b.app.length - a.app.length)[0]?.app;
  // Past your last note, your fork plays on at its own pace and ends where the one run again does: what you did after
  // it was writing the note, and kept in step with the other's short end, it raced.
  const again = againHere && played.scenes.find((scene) => scene.name === againHere.name);
  const lastNote = again?.steps.findLast((step) => step.title.startsWith("Note "));
  const after = again && lastNote ? again.length - lastNote.at : undefined;
  const lastAt = Math.max(...madeFrom.map((from) => from.at));
  const heldOver = comparedRound && source
    ? forked(comparedRound, [
        {
          name: forkName(source.recording),
          session: sessionOf(source.recording),
          ...source,
          length: after === undefined ? source.length : Math.min(source.length, lastAt + after),
          notes: madeFrom.map(({ id, at }) => ({ id, at })),
        },
      ])
    : comparedRound;
  // Compare is there only where the round it compares with has what you're watching: a fork you made on this round, or
  // a scene new in it, has nothing to show beside it.
  const comparingIt: Comparing | undefined = heldOver?.scenes.some((scene) => scene.name === inPlay) ? { on: peek || side, off: !!live?.shown, onPress: pressCompare, onRelease: releaseCompare } : undefined;
  // Gone where there's nothing to compare, Compare is off, as its button is gone: back where there is, it's off until
  // pressed, rather than on with no way to turn it off.
  if (look === "side" && !comparingIt) setLook("one");
  // Side by side, the round it compares with is on the left, or above.
  const comparing = side && !!heldOver;
  const earlier = comparing ? heldOver : undefined;
  const zoomed = comparing ? !sideFit : actual;
  // The scene as a video, as it's shown: alone, or beside the round Compare shows.
  const downloader = useRef<{ start: () => void }>(null);
  const toDownload = (): Asked | undefined =>
    scene && !onGrid
      ? {
          review: review.id,
          filmed: { round: round.number, scene: scene.name, beside: earlier?.number, dark: matchMedia("(prefers-color-scheme: dark)").matches },
          name: `${scene.name} · ${earlier ? `${roundName(earlier.number)} and ${roundName(round.number)}` : roundName(round.number)}`,
        }
      : undefined;
  // Holding Compare or How it was, that round shows over the recording, in place.
  // It waits unseen over the recording while it's paused, so Compare shows it at once; playing, only while it's on.
  const peeking = peek && !repeats && !!comparedRound;
  // Side by side on a bar, both rounds play its stretch again and again; let go or pressed again, it rests at the
  // stretch's end, where its card asks.
  const looping = comparing && repeats ? `${openNote!.id} ${repeats.scene} ${repeats.at} ${repeats.until}` : undefined;
  useEffect(() => {
    if (!looping || !repeats) return;
    running.current = openNote!.id;
    playhead.repeat({ scene: repeats.scene, at: repeats.at }, repeats.until);
    return () => {
      playhead.pause();
      playhead.go({ scene: repeats.scene, at: repeats.until });
    };
  }, [looping]);

  // Send sends everything you've said, together, so the agent starts on all of it; what you haven't saved stays. Accepting
  // sends anything left first. Each round's part goes as a send on that round, oldest first, so a note stays on the
  // recording it's about.
  const [trouble, setTrouble] = useState<string[]>([]);
  const [acceptedHere, setAcceptedHere] = useState(false);
  const sending = useRef(false);
  const sendNow = async () => {
    const parts = Object.entries(unsent).filter(([about, draft]) => Number(about) <= round.number && said(draft));
    if (!parts.length || sending.current) return false;
    sending.current = true;
    for (const [about, draft] of parts) {
      const sends: Send = { id: newId(), round: Number(about), by: you, sent: new Date().toISOString(), ...sendOf(draft) };
      const problems = await send(review.id, sends);
      setTrouble(problems);
      if (problems.length) {
        sending.current = false;
        return false;
      }
      setPosted((posted) => [...posted, sends]);
      changeUnsent((unsent) => draftOn(unsent, Number(about), (kept) => ({ ...nothing, unsaved: kept.unsaved })));
    }
    sending.current = false;
    return true;
  };
  const acceptNow = async () => {
    if (said(draft) && !(await sendNow())) return;
    const problems = await accept(review.id, you);
    setTrouble(problems);
    if (problems.length) return;
    setAcceptedHere(true);
    // Done, it goes back to every scene, where their ticks land in turn.
    if (many) setTimeout(toGrid, 900);
  };

  // The one step, from where the playhead is, which Enter takes: play on through the scene you're in, finishing a
  // note you started in it; at its end, back to every scene, where it's judged and what you said is sent.
  const stepHere = (): Step => {
    if (review.accepted || acceptedHere)
      return { kind: "done", words: !review.accepted || review.accepted.by === you ? "Accepted" : `Accepted by ${review.accepted.by}`, just: acceptedHere };
    if (round !== latest && arrived) return { kind: "go", words: `${roundName(latest.number)} is in`, what: "See it", take: () => toRound(latest.number) };
    if (!current) return { kind: "go", words: "Back to now", what: roundName(latest.number), take: () => toRound(latest.number) };
    if (round.number === 0) return { kind: "agent", words: "The agent is working", what: "on round 1", busy: true };
    if (!scene) return { kind: "go", words: "All scenes", take: toGrid };
    if (where === "playing") return { kind: "say", words: "Playing", what: scene.name };
    // A note you started here and didn't save, as one a reload kept, is finished where it is.
    const started = draft.unsaved.find((note) => note.on?.scene === scene.name);
    if (started) return { kind: "go", words: "Finish your note", what: placeName(started.on), take: () => setOpen({ writing: started.id }) };
    if (where !== "end") return { kind: "go", words: where === "start" ? "Play" : "Play on", what: scene.name, take: () => playhead.play() };
    return { kind: "go", words: "All scenes", take: toGrid };
  };
  const step = stepHere();

  // At the foot of every scene, what's yours to do: finish a note you started; send what you've said, all of it at once,
  // so the agent starts on the whole of it; accept, once nothing waits on you or the agent, sending your Looks goods
  // with it; else what the agent is doing. Looking back, it's the way back to now.
  const asksTheAgent = draft.notes.length > 0 || draft.verdicts.some((verdict) => verdict.verdict === "not quite");
  const gridStep = ((): Step | undefined => {
    if (review.accepted || acceptedHere) return undefined;
    if (!current) return arrived ? undefined : step;
    if (readOnly) return undefined;
    const started = draft.unsaved[0];
    if (started)
      return {
        kind: "go",
        words: "Finish your note",
        what: placeName(started.on),
        // On the page, its scene comes up and the note opens in its list, where it was being written.
        take: () => {
          const there = started.on && gridRoom.current?.querySelector(`[data-scene="${CSS.escape(started.on.scene)}"]`);
          if (onGrid) (there?.scrollIntoView({ behavior: "smooth", block: "start" }), there?.querySelector<HTMLElement>("li[aria-current] textarea")?.focus({ preventScroll: true }));
          else if (started.on) {
            leave(started.on.scene, false);
            go(started.on.scene, started.on.at);
          }
          setOpen({ writing: started.id });
        },
      };
    if (!asksTheAgent && readyToAccept(asIfSent(review, you, unsent), you)) return { kind: "go", words: "All good", what: "Accept the work", take: acceptNow, final: true };
    // Sent, it can't be taken back, so it's Ctrl+Enter, as accepting is: never a plain Enter in passing, where Enter says
    // Looks good.
    if (said(draft)) return { kind: "go", words: "Send", what: toSend(draft), take: () => void sendNow(), final: true };
    if (waitingForTheAgent(review).length)
      return working
        ? { kind: "agent", words: "The agent is working", what: `started at ${clock(working)}`, busy: true }
        : agentWaiting === false
          ? { kind: "agent", words: "Sent, no agent is waiting", what: "tell your agent", busy: false }
          : { kind: "agent", words: "Sent, waiting for the agent", busy: false };
    return undefined;
  })();
  const acting = onGrid ? gridStep : step;
  // Accepted, beside the round it was accepted on, with how many notes settled on the way.
  const settledNotes = [...settled, ...notes].filter((note) => note.state === "settled").length;
  const acceptedAfter = `Accepted${settledNotes ? ` · ${settledNotes} ${settledNotes === 1 ? "note" : "notes"} settled` : ""}`;

  // The button you last clicked, keeping focus: Enter on it is the step's, as Space is, until Tab takes you elsewhere.
  const clicked = useRef<Element | null>(null);
  useEffect(() => {
    const writingHere = (event: KeyboardEvent) => event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
    // Enter presses a button you came to by keyboard; one you just clicked, like play, keeps no hold on it, so at a scene's
    // end it's still Looks good.
    const pressing = (event: KeyboardEvent, buttons: string) => {
      const button = (event.target as Element).closest?.(buttons);
      return !!button && button !== clicked.current;
    };
    const pointed = (event: PointerEvent) => (clicked.current = (event.target as Element).closest?.("button, [role=button], [role=slider]") ?? null);
    const down = (event: KeyboardEvent) => {
      if (event.key === "Tab") clicked.current = null;
      // What can't be undone takes Ctrl+Enter, never a plain Enter in passing, and never while the app is yours.
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !writingHere(event) && !live?.shown && acting?.kind === "go" && acting.final) {
        event.preventDefault();
        return acting.take();
      }
      if (writingHere(event) || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      // Taking over, the keys that drive the recording rest with it: only noting and going back answer, and until the app
      // is there, only calling it off, as what you type then was meant for it. Noting, only noting answers until you've
      // chosen what it's on.
      if (live?.shown && !(inApp ? /^(n|t|escape)$/i : /^(t|escape)$/i).test(event.key)) return;
      if (noting && !/^(n|escape)$/i.test(event.key)) return;
      // On the page, Enter takes the step; a row is chosen as a button is. N, T and Escape are for the scene you're
      // on, as its bar is; Space and C are its own.
      if (onGrid) {
        if (event.key === "Enter" && !pressing(event, "button") && gridStep?.kind === "go" && !gridStep.final) {
          event.preventDefault();
          gridStep.take();
        } else if (event.key.toLowerCase() === "n" && !event.repeat) {
          event.preventDefault();
          pressNote();
        } else if (event.key.toLowerCase() === "t" && !event.repeat) {
          event.preventDefault();
          takeOver();
        } else if (event.key === "Escape" && noting) setNoting(false);
        else if (event.key === "Escape" && live?.shown) letGo();
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
      } else if (event.key === "Enter" && !pressing(event, "button, [role=button], [role=slider]")) {
        if (asks) {
          event.preventDefault();
          judge(openNote, { note: openNote.id, verdict: "looks good" });
          playOn();
        } else if (openNote || chosen) {
          event.preventDefault();
          playOn();
        } else if (!open && step.kind === "go" && !step.final) {
          event.preventDefault();
          step.take();
        }
      } else if (event.key.toLowerCase() === "x" && !event.repeat) {
        // The box it opens takes the next key, not this one.
        event.preventDefault();
        if (asks) setAsking(openNote.id);
        else if (chosen && oneOpen && !readOnly) noteOn(chosen, oneOpen);
      } else if (event.key.toLowerCase() === "c" && !event.repeat && comparingIt && !live?.shown) {
        pressCompare();
      } else if (event.key.toLowerCase() === "n" && !event.repeat) {
        event.preventDefault();
        pressNote();
      } else if (event.key === "Escape" && noting) {
        setNoting(false);
      } else if (event.key.toLowerCase() === "t" && !event.repeat) {
        event.preventDefault();
        takeOver();
      } else if (event.key.toLowerCase() === "v" && !event.repeat && !live?.shown) {
        event.preventDefault();
        downloader.current?.start();
      } else if (event.key === "Escape" && live?.shown) {
        letGo();
      } else if (event.key === "Escape" && (peek || comparing)) {
        setPeek(false);
        chooseLook("one");
      } else if (event.key === "Escape") {
        // Escape goes back a step you can see: from a note or a change to the recording, from a scene to every scene, and
        // looking back to now.
        if (open) setOpen(undefined);
        else if (many) toGrid();
        else if (!current) toRound(latest.number);
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
    addEventListener("pointerdown", pointed, true);
    return () => {
      removeEventListener("pointerdown", pointed, true);
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", away);
    };
  });

  // What's drawn on the recordings: on the round you're watching, the notes in its scene on their things, the open one
  // whenever its thing is there and the rest around their moments, the note being written, and what changed where
  // you're stopped; on the round beside it, what's chosen, where it is there.
  // The note on the whole scene a change was made for: answered at the scene's end, the change is met where it happened.
  const wholeOf = (diamond: Diamond) => notes.find((note) => note.on?.at === undefined && madeFor([diamond], note.id).length > 0);
  // A change carries the colour of the note grown out of it, or of the note on the whole scene it was made for.
  const grownInk = (diamond: Diamond) => {
    const id = [...grown].find(([, on]) => on === diamond)?.[0];
    const note = notes.find((note) => note.id === id) ?? wholeOf(diamond);
    return note ? ink(note) : id === undefined ? undefined : "var(--amber)";
  };
  const markOn = (on: Place | undefined): Mark["on"] | undefined =>
    on?.element?.node !== undefined ? { node: on.element.node } : on?.point ? { point: on.point } : on?.box ? { box: on.box } : undefined;
  // A change in each place it's seen: things changed alike are one change, in several places.
  const marksOn = (on: Place | undefined): Mark["on"][] => [markOn(on), ...(on?.alike ?? []).map((element) => element.node !== undefined && { node: element.node })].filter((mark) => !!mark);
  // Pointed at by its line, a change is marked alone, with the others that line explains.
  const pointedIn = (changes: Changed[]) => {
    const line = changes.find((changed) => changed.change.id === pointedChange)?.line;
    const pointed = changes.filter((changed) => changed.change.id === pointedChange || (!!line && changed.line === line));
    return pointed.length ? pointed : changes;
  };
  // The open note's answer, outlined in every place in the note's colour, on the round you're watching and the one beside it.
  const answerMarks = (on: (changed: Changed) => Place | undefined): Mark[] => {
    const note = openNote && openNote.on?.at !== undefined ? openNote : undefined;
    const changes = note ? pointedIn(answersTo(diamonds, note.id).filter((changed) => changed.on.scene === watching)) : [];
    return note
      ? changes.flatMap((changed) =>
          marksOn(on(changed)).map((at): Mark => ({ id: changed.change.id, kind: "change", on: at, ink: ink(note), answers: note.id, pointed: changed.change.id === pointedChange, chosen: false })),
        )
      : [];
  };
  const drawn = (diamond: Diamond) => pointedIn(diamond.changes);
  // New steps aren't on one thing: they're outlined on what they click or type into, as the recording shows it.
  const actedOn = (diamond: Diamond): Mark["on"][] =>
    diamond.until === undefined || changes?.scene !== diamond.scene
      ? []
      : [...new Set(changes.acted.filter(([at]) => at >= diamond.at && at <= diamond.until!).map(([, node]) => node))].map((node) => ({ node }));
  // Each change is marked on its own, with a pin of its own that opens its why; words reworded are marked themselves, not
  // what they're in. What's gone isn't on this round: Compare shows it, where it was.
  const changed = (outlined ? drawn(outlined) : [])
    .filter((changed) => !changed.change.gone)
    .flatMap((changed) => (markOn(changed.on) ? marksOn(changed.on) : actedOn(outlined!)).map((on, i) => ({ id: changed.change.id, on, words: changed.change.reworded, pinned: i === 0, line: changed.line })));
  const oneLine = outlined?.changes.find((changed) => changed.change.id === oneOpen)?.line;
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
        ...changed.map(({ id, on, words, pinned, line }): Mark => ({ id, kind: "change", on, words, pin: pinned ? "diamond" : undefined, dot: grownInk(outlined!), pointed: !keptOne && !!oneOpen && (id === oneOpen || (!!line && line === oneLine)), chosen: (!!keptOne && (id === keptOne || (!!line && line === oneLine))) || outlined === grownOpen })),
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
      ...(chosen?.scene === watching ? drawn(chosen).flatMap((changed) => marksOn(placeFrom(review, changed.on, round.number, other, read)).map((on): Mark => ({ id: changed.change.id, kind: "change", on, chosen: !keptOne || changed.change.id === keptOne }))) : []),
      ...answerMarks((changed) => placeFrom(review, changed.on, round.number, other, read)),
    ]);
  }

  // What's chosen, beside the recording: a change's card.
  const chosenProps: ChosenProps = {
    notes: notes,
    diamonds: diamonds,
    chosen: chosen?.id,
    one: oneOpen,
    onWhy: (inside: boolean) => (inside ? clearTimeout(leaving.current) : whyOf()),
    note: row,
    grown: new Map([...grown].map(([id, diamond]) => [id, diamond.id])),
    onDiamond: choose,
    onClose: () => setOpen(undefined),
    onNoteOn: noteOn,
    onNote: pick,
  };
  return (
    <Page title={review.title} actions={<DownloadVideo ref={downloader} asked={toDownload} shown={!onGrid && !!scene} resting={inApp} />}>
      {/* In the app, the recording's pins are under it: a card there sits by the app's own pin, with nothing drawn to it. */}
      <Wire id={grownOpen?.id ?? openNote?.id ?? oneOpen} colour={openNote ? ink(openNote) : grownOpen ? "var(--amber)" : "var(--soft)"} hidden={!!bare || peeking || inApp || onGrid} faded={playingNow} />
      <main className="relative grid min-h-0 grid-cols-[minmax(0,1fr)] phone:flex phone:flex-col">
        {/* Opened, a scene keeps its steps where they were on the page, beside the recording that took its pictures' place. */}
        <div inert={onGrid} className={`grid min-h-0 min-w-0 wide:mx-auto wide:w-full wide:max-w-[1320px] wide:grid-cols-[260px_minmax(0,1fr)] wide:gap-x-8 wide:px-8 ${onGrid ? "invisible" : ""}`}>
        <section inert={onGrid} className={`grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] pb-4 phone:flex-none phone:grid-rows-[auto_auto] phone:pr-0 phone:pb-3 ${onGrid ? "invisible" : ""}`}>
          <div className="relative grid min-h-0 grid-rows-[minmax(0,1fr)] pb-6">
          <Stage
            review={review}
            playhead={playhead}
            round={played}
            earlier={earlier}
            about={againHere && source ? { earlier: "what you did", now: "done again" } : undefined}
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
                    if (scene) write({ scene: scene.name, at: Math.round(Math.max(0, playhead.now.moment.at) * 100) / 100, ...on, ...(app && { app }) });
                  }
            }
            onMark={(id) => {
              const note = notes.find((note) => note.id === id);
              // Pressed, a change's pin keeps its why open, until it's pressed again.
              const diamond = diamonds.find((diamond) => diamond.changes.some(({ change }) => change.id === id));
              if (note) pick(note);
              else if (diamond) {
                setOpen(keptOne === id ? { change: diamond.id } : { change: diamond.id, one: id, kept: true });
              }
            }}
            read={read}
            onGone={setGone}
            onPointAt={whyOf}
            onAllScenes={many ? () => toGrid() : undefined}
            over={arrived ? { words: `${roundName(latest.number)} is in`, take: () => toRound(latest.number) } : current ? undefined : { words: roundName(round.number) }}
            live={onGrid ? undefined : live}
            away={onGrid}
          />
          {/* Playing, the bar stays: what you can do is there while you watch, as it is paused. */}
          <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 translate-y-1/2">
            <Bar
              live={liveNow}
              latest={current}
              compare={liveNow === "shown" ? undefined : comparingIt}
              noting={noting}
              onNote={readOnly ? undefined : pressNote}
              onTakeOver={forkOfFork ? undefined : takeOver}
              onBack={() => letGo()}
              scene={watching ?? ""}
              list={{
                notes: notes
                  .filter((note) => note.on?.scene === watching && note.on.at !== undefined && note.turns[0]?.words)
                  .sort((a, b) => a.on!.at! - b.on!.at!)
                  .map((note) => ({ id: note.id, ink: ink(note), words: note.turns[0]!.words, at: time(note.on!.at!), app: !!note.on!.app || whereYouWere.has(note.id) })),
                listed,
                onList: (listed) => (setListed(listed), listed || setLitNote(undefined)),
                onLight: setLitNote,
                onSaid: (id) => {
                  setListed(false);
                  setLitNote(undefined);
                  const note = notes.find((note) => note.id === id);
                  // From the app, a note goes back to the recording, at it.
                  if (live?.shown) letGo();
                  if (note) pick(note);
                },
              }}
            />
          </div>
          </div>
          {/* What went wrong taking a scene over, sending or noting: on the page with every scene, a send says it there instead. */}
          {(live?.problems || (!onGrid && trouble.length > 0)) && (
            <div role="alert" className="fixed right-4 bottom-4 z-30 max-w-[28rem] animate-arrive rounded-lg bg-surface px-3 py-2 text-sm whitespace-pre-wrap shadow-tip [overflow-wrap:anywhere]">
              {[...(live?.problems ?? []), ...(onGrid ? [] : trouble)].join("\n")}
              <button
                className="ml-3 text-soft hover:text-fg"
                onClick={() => {
                  if (live?.problems) setLive(undefined);
                  setTrouble([]);
                }}
              >
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
            onTakeOver={forkOfFork ? undefined : takeOver}
            playhead={playhead}
            dots={playingNotes.filter((note) => !grown.has(note.id)).map((note) => ({ id: note.id, ...span(note), ink: ink(note), number: note.number, words: note.turns[0]?.words ?? "", ...(note.on?.app && { fork: playedOn(note.on) }) }))}
            onDot={(id) => {
              const note = notes.find((note) => note.id === id);
              if (note) pick(note);
            }}
            // What was changed for a note is in the note's answer, not marked again: its dot is the one mark for both.
            marks={diamonds
              .filter((diamond) => diamond.scene === watching && diamond.row)
              .map((diamond) => {
                const answered = notes.find((note) => grown.get(note.id) === diamond) ?? wholeOf(diamond);
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
            look={look}
            onLook={chooseLook}
          />
          </div>
          </div>
        </section>
        </div>

        <Beside
          id={openNote?.id ?? writingId ?? oneOpen}
          still={playingNow}
          // Taking over is doing: a card about the recording rests with it; one about the app answers there, a note made in
          // the app or the one you're trying.
          resting={(writing ? writing.on?.app : openNote && (openNote.on?.app || trying.current === openNote.id)) ? undefined : liveNow}
          over={!writingId && !chosen && !!openNote && whereYouWere.has(openNote.id) && !openNote.on?.element && !tryingHere}
          pinned={openNote && inApp && (openNote.on?.app || tryingHere) ? () => appPins.current.get(openNote.id) : undefined}
          onAway={(openNote && !tryingHere) || chosen ? () => setOpen(undefined) : undefined}
        >
          {/* On the page, what's said is in its scene's list, in the app or not. */}
          {listed || onGrid ? undefined : openNote ? row(openNote) : writing ? writingCard(writing) : oneOpen ? <Chosen {...chosenProps} /> : undefined}
        </Beside>
        {many && (
          <Work
            room={gridRoom}
            review={review}
            round={round}
            up={onGrid}
            read={read}
            notes={notes}
            standing={(name) => standing?.get(name)}
            onLooksGood={readOnly ? undefined : lookingGood}
            threads={{ you, readOnly, unfinished, onUnfinished: keepUnfinished, onJudge: judge, onEdit: editNote }}
            diamonds={diamonds}
            accepted={review.accepted || acceptedHere ? acceptedAfter : undefined}
            step={gridStep}
            trouble={trouble}
            acting={{
              latest: current,
              noting,
              onNote: readOnly ? undefined : pressNote,
              onTakeOver: takeOver,
              onBack: () => letGo(),
              onPlace: (on) => (setNoting(false), write(on)),
              onRest: (scene, at, again) => {
                playhead.pause();
                playhead.go({ scene, at });
                restingAt.current = again;
              },
              onClose: () => setOpen(undefined),
              live: live && { scene: live.scene, address: live.address, shown: live.shown, inApp, due: live.due, at: live.at },
              writing: writing ? { note: writing, number: nextNumber + draft.unsaved.indexOf(writing), words: writingWords(writing) } : undefined,
              opened: openNote?.id,
            }}
            arrived={arrived ? latest : undefined}
            working={working}
            onRound={toRound}
          />
        )}
      </main>
    </Page>
  );
}

// What you did taken over, as it's kept while you're there: the scene and moment you took it over at, the recording so
// far on one clock, and what you did, for taking it over again.
type Session = { address?: string; id: string; from: { scene: string; at: number }; events: { timestamp: number }[]; did: Did[]; kept: number; shift: number; heard?: number };
// The fork you're making while you're in the app, on the page you're in.
type Growing = ForkLine & { address: string };

// A fork off a scene: where you took it over, what you did there, and the longest recording kept of it, which plays the
// scene up to there, then you. It's named for the time you were in the app, as each note there keeps it. Run again on a
// later round, it's that round's recording of what you did, as the agent wrote it, its steps the agent's, with your
// notes on it where it shows their things: the same fork, under the same name, so the two are compared as two rounds of
// a scene are.
type Fork = { name: string; session: string; from: { scene: string; at: number }; did: Did[]; recording: string; length: number; steps?: { title: string; at: number }[]; again?: boolean; notes?: { id: string; at: number }[] };
const sessionOf = (recording: string) => recording.match(/^(?:branches\/(.+)-\d+|forks\/(.+))\.json$/)?.slice(1).find(Boolean) ?? recording;
const forkName = (recording: string) => `fork:${sessionOf(recording)}`;
// The recording a place is on: its scene's, or its fork's.
const playedOn = (place: Place) => (place.app ? forkName(place.app.recording) : place.scene);
function forksIn(notes: Note[]): Fork[] {
  const longest = new Map<string, Fork>();
  const keep = (fork: Fork) => void ((longest.get(fork.name)?.length ?? 0) < fork.length && longest.set(fork.name, fork));
  for (const { on } of notes) if (on?.app) keep({ name: forkName(on.app.recording), session: sessionOf(on.app.recording), ...on.app });
  return [...longest.values()];
}

// The forks run again for a round, from where its answers to notes made in the app were placed.
function ranAgainIn(round: Round): Fork[] {
  const again = new Map<string, Fork>();
  for (const { note, on } of round.replies) {
    if (!on?.app || on.at === undefined) continue;
    const name = forkName(on.app.recording);
    const fork = again.get(name) ?? again.set(name, { name, session: sessionOf(on.app.recording), ...on.app, again: true, notes: [] }).get(name)!;
    fork.notes!.push({ id: note, at: on.at });
  }
  return [...again.values()];
}

// Each fork plays after its scene, as the scene's steps up to where you took over, then yours in the app, or run again,
// the agent's, and each of your notes a step of its own, so a fork and the same fork run again keep in step at each
// note.
function forked(round: Round, forks: Fork[]): Round {
  if (!forks.length) return round;
  const off = (scene: Scene): Forked[] =>
    forks
      .filter((fork) => fork.from.scene === scene.name)
      .map((fork) => ({
        name: fork.name,
        length: fork.length,
        steps: [
          ...scene.steps.filter((step) => step.at < fork.from.at),
          ...[
            ...(fork.steps ?? [{ title: "In the app", at: fork.from.at }]),
            ...(fork.notes ?? []).map((note) => ({ title: `Note ${note.id}`, at: note.at })),
          ].toSorted((a, b) => a.at - b.at),
        ],
        recording: fork.recording,
        person: "You",
        fork: scene.name,
        leaves: fork.from.at,
      }));
  return { ...round, scenes: round.scenes.flatMap((scene) => [scene, ...off(scene)]) };
}

// Where a note made in the app was taken over, on another round's recording of its scene: in the step you were in, by its
// title, as far into it as you were, kept in step as every moment is across rounds; and what the note is on, if the
// page there has it. Nowhere when that round's scene doesn't take the step that far.
function takenOverIn(review: Review, on: Place, written: number, round: Round, read: Read): { at?: number; element?: Thing } {
  const from = on.app!.from;
  const then = review.rounds.find((kept) => kept.number === written)?.scenes.find((scene) => scene.name === from.scene);
  const now = round.scenes.find((scene) => scene.name === from.scene);
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

const slug = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
