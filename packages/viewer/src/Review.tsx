// A review on one page: the recording is where you look, the column is the map of what's been said, and the foot is
// where you act. The view changes only when you change it: a new round says it's in, and waits for you.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { inStep, lastLooked, newId, readyToAccept, time, waitingForTheAgent, type Flow, type Note, type Place, type Review, type Round, type Send, type Verdict } from "@vantage/review";
import { accept, recording, send, useReview, useYou } from "./api.ts";
import { HOLD } from "./Card.tsx";
import { answersTo, diamondAt, diamondsOn, grownFrom, type Changed, type Diamond } from "./changes.ts";
import { Column, rowsIn, settles, type Landed } from "./Column.tsx";
import { Controls, type Look } from "./Controls.tsx";
import { Drawer } from "./Drawer.tsx";
import { useDraft, useWatched } from "./draft.ts";
import { land, slideIn, takeOff, type Taking } from "./flight.ts";
import { Foot, type Step } from "./Foot.tsx";
import { Grid } from "./Grid.tsx";
import { along, CARD, clamp, FLOW_IN, momentAt, POSTER, type Moment } from "./moments.ts";
import { asIfSent, fill, goodTo, ink, lookGood, notesOn, nothing, said, seen, sendOf, settledBefore, standings, takeBack, type Shown } from "./notes.ts";
import { NoteRow, number as numberLook, opened, pointed, SettledCount, SettledList, Writing, type Comparing } from "./Notes.tsx";
import { Playhead, useNow } from "./playhead.ts";
import { recorded } from "./replay.ts";
import { roundName } from "./Rounds.tsx";
import { Stage, type Bare, type Mark, type Placed, type Shown as Size } from "./Stage.tsx";
import { placeFrom, placeName as nameOf, placeOn, useReadings } from "./things.ts";
import { Wire } from "./Wire.tsx";

// What's open in the column: a note, a change you chose, or a new note being written, by its id.
type Open = { note: string } | { change: string } | { writing: string };

// Leaving every flow at once for one, the recording waits on its first frame until the pictures have landed, and this
// long after: one thing moves at a time.
const SETTLE = 400;

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
  const [watched, see] = useWatched(review.id, round.number);
  const [open, setOpen] = useState<Open>();
  // The note whose Not quite is being written.
  const [asking, setAsking] = useState<string>();
  if (asking && !(open && "note" in open && open.note === asking)) setAsking(undefined);
  const [fresh, setFresh] = useState<string>();
  const [met, setMet] = useState<string[]>([]);
  // Looking at another round starts on its map, with nothing open, unless you went there to a settled note.
  const [on, setOn] = useState(round.number);
  const toNote = useRef<Shown>(undefined);
  const [listing, setListing] = useState(false);
  // Every flow at once: where you arrive on the latest round when it has more than one, and come back to. A round
  // that's new to you starts there too.
  const many = round === latest && round.flows.length > 1;
  const [grid, setGrid] = useState(many);
  const onGrid = grid && many;
  const been = useRef([round.number]);
  if (on !== round.number) {
    setOn(round.number);
    setOpen(toNote.current && { note: toNote.current.id });
    setListing(false);
    setGrid(many && !been.current.includes(round.number));
    been.current.push(round.number);
  }

  // You arrive at the start, as on a video before you press play. Going to another round keeps your place: the same flow
  // at the matching moment, or its start if that round never recorded the flow.
  const [playhead] = useState(() => new Playhead(round.flows, { flow: round.flows[0]?.name ?? "", at: POSTER }));
  useEffect(() => () => playhead.destroy(), [playhead]);
  const onRoundNow = useRef(round.number);
  useLayoutEffect(() => {
    if (onRoundNow.current === round.number) return playhead.watch(round.flows, playhead.now.moment);
    onRoundNow.current = round.number;
    const from = playhead.flow;
    const to = round.flows.find((flow) => flow.name === from.name);
    playhead.pause();
    playhead.watch(round.flows, to ? { flow: to.name, at: inStep(playhead.now.moment.at, from, to) } : { flow: round.flows[0]?.name ?? "", at: -CARD });
    const place = toNote.current?.on;
    toNote.current = undefined;
    if (place) playhead.go({ flow: place.flow, at: place.at ?? FLOW_IN });
  }, [round, playhead]);
  const watching = useNow(playhead, (now) => now.moment.flow);
  const flow = round.flows.find((flow) => flow.name === watching) ?? round.flows[0];
  // Where the playhead is, as the foot's step needs it: playing, at a flow's start, partway, or at its end.
  const where = useNow(playhead, ({ moment, playing }) => {
    const length = playhead.flows.find((flow) => flow.name === moment.flow)?.length ?? 0;
    return playing ? "playing" : moment.at >= length - 0.06 ? "end" : moment.at <= 0 ? "start" : "partway";
  });

  // A flow is watched once it's played to its end from no later than its middle.
  const seeing = useRef(see);
  seeing.current = see;
  useEffect(() => {
    let from: Moment | undefined;
    let last = playhead.now.moment;
    return playhead.subscribe(() => {
      const { moment, playing } = playhead.now;
      const length = playhead.flow.length;
      if (from && (moment.flow !== from.flow || Math.abs(moment.at - last.at) > 0.5)) from = undefined;
      if (playing && !from) from = moment;
      if (from && moment.at >= length - 0.06) {
        const name = moment.flow;
        if (from.at <= length / 2) seeing.current((flows) => (flows.includes(name) ? flows : [...flows, name]));
        from = undefined;
      }
      last = moment;
    });
  }, [playhead]);

  // The view is yours: it changes only when you change it, and holds for the review.
  const [look, setLook] = useState<Look>(() => (stored(`vantage:${review.id}:look`) === "side" ? "side" : "one"));
  const [actual, setActual] = useState(false);
  // Side by side starts at actual size each time you go to it; the size then fits both to the whole page.
  const [sideFit, setSideFit] = useState(false);
  const [then, setThen] = useState<number>();
  const [size, setSize] = useState<Size>();
  const [bare, setBare] = useState<Bare>();
  const first = review.rounds[0]!.number;
  const comparing = round.number > first && look === "side";
  const earlier = comparing ? review.rounds.find((kept) => kept.number === (then !== undefined && then < round.number ? then : round.number - 1)) : undefined;
  const zoomed = comparing ? !sideFit : actual;
  const chooseLook = (chosen: Look) => {
    if (chosen === look) return;
    setLook(chosen);
    store(`vantage:${review.id}:look`, chosen);
    if (chosen === "side") setSideFit(false);
  };
  const toRound = (number: number) => {
    if (then !== undefined && then >= number) setThen(undefined);
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
  const looked = flow && round === latest ? lastLooked(review, you, flow.name, round.number) : undefined;
  // What you judge on the latest round is a difference from there, or else from the round you last looked at its flow,
  // or Before: held, that round shows in place; clicked, the two go side by side. The earlier side says why it's that one.
  const compared = round === latest && round.number > first && !review.accepted ? (askedFrom ?? looked ?? first) : undefined;
  const why =
    askedFrom !== undefined
      ? `· when note ${noteOpen!.number} was ${askedFrom === noteOpen!.written ? "written" : "sent back"}`
      : compared === looked
        ? "· when you last looked"
        : undefined;
  const [peek, setPeek] = useState(false);
  const beside = comparing && earlier?.number === compared;
  const comparingIt: Comparing | undefined = compared === undefined ? undefined : {
    held: peek,
    beside,
    onHold: setPeek,
    onBeside: () => {
      if (beside) return chooseLook("one");
      setThen(compared);
      chooseLook("side");
    },
  };
  const working = review.accepted ? undefined : review.taken.find((taken) => taken.round > latest.number)?.at;

  // Left and Right step to the next moment the page changes, or a second where nothing does; with Shift, a tenth.
  const [changes, setChanges] = useState<{ flow: string; at: number[]; clicks: number[] }>();
  useEffect(() => {
    if (!flow) return;
    let current = true;
    recording(review.id, round.number, flow.recording).then((events) => {
      const { changes, clicks } = recorded(events);
      if (current) setChanges({ flow: flow.name, at: changes, clicks });
    });
    return () => void (current = false);
  }, [review.id, round.number, flow]);
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
  const read = useReadings(review, [round.number, ...(earlier ? [earlier.number] : []), ...(compared === undefined ? [] : [compared]), ...noted.map((note) => note.written)]);
  // Each note sits where its thing is on this round: its moment here, on what it's on here, once that's found. One on
  // something this round doesn't have is lost here.
  const notes = noted.map((note) => (note.on ? { ...note, on: placeOn(review, note.id, note.on, note.written, round, read) ?? note.on } : note));
  const lost = noted.filter((note, i) => note.on?.element && notes[i]!.on !== note.on && !notes[i]!.on?.element).map((note) => note.id);
  // The notes whose things have left the page you're watching.
  const [gone, setGone] = useState<string[]>([]);
  const settled = settledBefore(review, round.number, you);
  const inGeneral = notes.filter((note) => !note.on || !round.flows.some((flow) => flow.name === note.on?.flow));
  const playingNotes = flow ? notes.filter((note) => note.on?.flow === flow.name && note.on.at !== undefined) : [];

  const goodFor = new Map(round.flows.map((flow) => [flow.name, goodTo(review, round.number, flow.name)]));
  // Where each flow stands for you on the round you judge, and, once the work is accepted, on the last.
  const judging = !readOnly || (!!review.accepted && round === latest);
  const standing = useMemo(() => (judging ? standings(review, round.number, you, draft, watched) : undefined), [judging, review, round.number, you, draft, watched]);
  // A flow that still needs you: not good, and not only waiting on what you've said for the agent.
  const needs = (name: string) => !["good", "to send", "with the agent", undefined].includes(standing?.get(name)?.is);

  // A flow asks whether it's good at its end, once you've watched it, or when you ask it from its end row; it goes once
  // you move on.
  const [asked, setAsked] = useState<string>();
  if (asked && (where !== "end" || watching !== asked)) setAsked(undefined);
  const question = !open && flow && where === "end" && standing?.get(flow.name)?.asks && (asked === flow.name || standing.get(flow.name)?.is === "is it good") ? flow.name : undefined;
  // The flow that just turned good, its tick travelling to the meter.
  const [landed, setLanded] = useState<Landed>();

  const go = (name: string, at = FLOW_IN) => {
    playhead.pause();
    playhead.go({ flow: name, at });
  };

  // What's new to you on this round: a diamond at each moment something changed, on the timeline and in the column.
  const diamonds = diamondsOn(review, round.number, you);
  const clicks = changes?.flow === flow?.name ? (changes?.clicks ?? []) : [];
  const onNow = useNow(playhead, (now) => diamondAt(diamonds, now.moment, clicks)?.id);
  const chosen = open && "change" in open ? diamonds.find((diamond) => diamond.id === open.change) : undefined;
  // Your notes on what changed, each grown out of its change's row; and the change whose note is open or being written.
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
  // Pointing at one of several changes in an open row draws only that one.
  const [pointedChange, setPointedChange] = useState<string>();
  useEffect(() => setPointedChange(undefined), [changeOpen?.id]);
  // Paused on a change, with nothing else open, it's outlined where it is on the page; chosen, more firmly.
  const outlined = changeOpen?.flow === watching ? changeOpen : !open ? diamonds.find((diamond) => diamond.id === onNow) : undefined;

  // Opened, a row in the column plays its moment, from its start each time, and its time plays it again: a click on the
  // rest of its header opens it or closes it, and never plays or pauses anything else.
  const running = useRef<string>(undefined);
  const play = (id: string, from: Moment, until: number) => {
    running.current = id;
    playhead.run(from, until);
  };
  // A change is played from a beat before it, to where it is; new steps, through them.
  const choose = (diamond: Diamond) => {
    setOpen({ change: diamond.id });
    play(diamond.id, { flow: diamond.flow, at: Math.max(0, diamond.at - (diamond.until === undefined ? 0.8 : 0.3)) }, diamond.until ?? diamond.at);
  };
  // A flow's heading plays and pauses it: from its start, unless you're partway through it.
  const playFlow = (chosen: Flow) => {
    const { moment, playing } = playhead.now;
    if (moment.flow !== chosen.name || moment.at >= chosen.length - 0.06) playhead.go({ flow: chosen.name, at: FLOW_IN });
    else if (playing) return playhead.pause();
    playhead.play();
  };
  const show = (note: Shown) => {
    setOpen({ note: note.id });
    setMet((met) => (met.includes(note.id) ? met : [...met, note.id]));
    if (note.on) go(note.on.flow, note.on.at);
  };
  // Chosen, a note opens and plays its moment, from a beat before it to the frame it was written on (the end of its
  // stretch), as a change plays to where it is: past it, the page may have moved its thing away. One on a whole flow
  // plays the flow, going on if it's already playing.
  const pick = (note: Shown) => {
    const on = note.on;
    const its = on && round.flows.find((flow) => flow.name === on.flow);
    if (!on || !its || on.at === undefined) {
      show(note);
      const { moment, playing } = playhead.now;
      if (its && !(playing && moment.flow === its.name)) playFlow(its);
      return;
    }
    setOpen({ note: note.id });
    setMet((met) => (met.includes(note.id) ? met : [...met, note.id]));
    play(note.id, { flow: on.flow, at: Math.max(0, on.at - 0.8) }, Math.min(its.length, on.until ?? on.at));
  };

  // Playing stops at each answer that waits for you, the first time it gets there, and opens it as a click on it would.
  useEffect(() =>
    playhead.stopAt(
      playingNotes.flatMap((note) =>
        note.on && note.state === "needs you" && !note.unsent && !met.includes(note.id) ? [{ flow: note.on.flow, at: note.on.at ?? 0, reached: () => show(note) }] : [],
      ),
    ),
  );
  // A new note starts unsaved, where it will sit. With words in it, it's never thrown away by going elsewhere: it stays in
  // its row, not saved, until you save it or Cancel takes it back. With none, it goes.
  const write = (on: Place | undefined) => {
    if (readOnly) return;
    const id = newId();
    change((draft) => ({ ...draft, unsaved: [...draft.unsaved, { id, ...(on && { on }), words: "" }] }));
    setOpen({ writing: id });
  };
  const writingId = open && "writing" in open ? open.writing : undefined;
  useEffect(() => {
    if (draft.unsaved.some((note) => !note.words.trim() && note.id !== writingId))
      change((draft) => ({ ...draft, unsaved: draft.unsaved.filter((note) => note.words.trim() || note.id === writingId) }));
  });
  const glow = (id: string) => {
    setFresh(id);
    setTimeout(() => setFresh((fresh) => (fresh === id ? undefined : fresh)), 1200);
  };

  // Saved, a new note stays open in its row with your words in it, and Play on its way on. A note on a flow you said
  // looks good takes that back.
  const saveNote = (note: Note, words: string) => {
    change((draft) => ({
      ...(note.on ? takeBack(draft, note.on.flow, notes) : draft),
      notes: [...draft.notes, { id: note.id, ...(note.on && { on: note.on }), words }],
      unsaved: draft.unsaved.filter((kept) => kept.id !== note.id),
    }));
    setOpen({ note: note.id });
    glow(note.id);
  };
  const keepWords = (id: string, words: string) => change((draft) => ({ ...draft, unsaved: draft.unsaved.map((note) => (note.id === id ? { ...note, words } : note)) }));
  const dropUnsaved = (id: string) => {
    change((draft) => ({ ...draft, unsaved: draft.unsaved.filter((note) => note.id !== id) }));
    setOpen(undefined);
  };
  // Removing a note you haven't sent takes it away at once, and leaves a way to put it back for a few seconds.
  const [removed, setRemoved] = useState<{ note: Note; number: number; at: number }>();
  useEffect(() => {
    if (!removed) return;
    const later = setTimeout(() => setRemoved(undefined), 6000);
    return () => clearTimeout(later);
  }, [removed]);
  const editNote = (id: string, words: string | undefined) => {
    const at = draft.notes.findIndex((note) => note.id === id);
    if (!words && at >= 0) setRemoved({ note: draft.notes[at]!, number: notes.find((note) => note.id === id)?.number ?? 0, at });
    change((draft) => ({ ...draft, notes: draft.notes.flatMap((note) => (note.id !== id ? [note] : words ? [{ ...note, words }] : [])) }));
    if (!words) setOpen(undefined);
  };
  const undoRemove = () => {
    if (!removed) return;
    change((draft) => ({ ...draft, notes: draft.notes.toSpliced(removed.at, 0, removed.note) }));
    setRemoved(undefined);
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
  // answered it, and its tick travels to the meter.
  const lookingGood = (name: string) => {
    if (draft.looksGood.includes(name)) return change((draft) => takeBack(draft, name, notes));
    if (standing?.get(name)?.is === "good") return;
    change((draft) => lookGood(draft, name, notes));
    setAsked(name);
    setLanded({ flow: name, at: performance.now() });
  };
  // Asked from its end row, the flow goes to its end and asks there.
  const ask = (name: string) => {
    if (readOnly) return;
    setOpen(undefined);
    go(name, round.flows.find((flow) => flow.name === name)?.length ?? 0);
    setAsked(name);
  };
  // Watching a flow is from its start.
  const watchFrom = (name: string) => {
    setOpen(undefined);
    playhead.go({ flow: name, at: FLOW_IN });
    playhead.play();
  };

  // Leaving every flow at once, each picture flies from its tile into the column as it comes in; going to a flow, it
  // plays once they've landed. Coming back, the pictures in the column's view fly home, paused at the start, and what
  // you were reading is let go, unless you're writing it.
  const gridRoom = useRef<HTMLDivElement>(null);
  const aside = useRef<HTMLElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const flying = useRef<{ taking: Taking; to: "column" | "grid"; playing?: boolean }>(undefined);
  const settling = useRef<number>(undefined);
  useEffect(() => () => clearTimeout(settling.current), []);
  const [done, setDone] = useState<number>();
  const leave = (name: string | undefined, playing: boolean) => {
    flying.current = { taking: takeOff(gridRoom.current!), to: "column", playing };
    setGrid(false);
    if (name) go(name);
  };
  // Called a moment after Accept, it knows whether you're there already.
  const gridNow = useRef(onGrid);
  gridNow.current = onGrid;
  const toGrid = (accepted?: number) => {
    const map = aside.current?.querySelector("[data-map]");
    if (map && !gridNow.current) flying.current = { taking: takeOff(map, map.getBoundingClientRect()), to: "grid" };
    playhead.pause();
    playhead.go({ flow: round.flows[0]!.name, at: POSTER });
    if (open && !("writing" in open)) setOpen(undefined);
    setListing(false);
    setDone(accepted);
    setGrid(true);
  };
  useLayoutEffect(() => {
    const flight = flying.current;
    flying.current = undefined;
    if (!flight) return;
    if (flight.to === "grid") return void land(flight.taking, gridRoom.current!);
    // Each picture flies to where its still will stand once the column has settled, not to where it's passing.
    const map = aside.current!.querySelector("[data-map]")!;
    for (const animation of map.getAnimations({ subtree: true })) if (animation.id === "glide") animation.finish();
    const last = land(flight.taking, map, map.getBoundingClientRect());
    slideIn(aside.current!);
    if (!flight.playing) return;
    const from = playhead.now.moment;
    clearTimeout(settling.current);
    settling.current = window.setTimeout(() => {
      const { moment, playing } = playhead.now;
      if (!playing && moment.flow === from.flow && moment.at === from.at) playhead.play();
    }, last + SETTLE);
  });

  // Up and Down go through the column, flows and their rows in its order, the recording going with them.
  const column = [
    ...round.flows.flatMap((flow) => [{ flow }, ...rowsIn(flow.name, notes, diamonds, settles(standing?.get(flow.name), flow.name === watching))]),
    ...inGeneral.map((note) => ({ note, at: Infinity })),
  ];
  const through = (direction: 1 | -1) => {
    const here = column.findIndex((row) =>
      "note" in row ? open && "note" in open && open.note === row.note.id : "diamond" in row ? chosen === row.diamond : !open && row.flow.name === watching,
    );
    const next = column[here < 0 ? 0 : clamp(here + direction, 0, column.length - 1)];
    if (!next || (here >= 0 && column[here] === next)) return;
    if ("note" in next) pick(next.note);
    else if ("diamond" in next) choose(next.diamond);
    else {
      setOpen(undefined);
      go(next.flow.name);
    }
  };

  // Your notes that aren't notes yet sit where they will once saved, numbered after the rest: the one you're writing,
  // its box opened under it as a card is, and the ones you haven't saved. One just removed leaves a way back where it was.
  const nextNumber = Math.max(0, ...notes.map((note) => note.number)) + 1;
  const writing = draft.unsaved.find((note) => note.id === writingId);
  const placeName = (on: Place | undefined) => nameOf(on, read, round.number);
  const unsaved = (note: Note, number: number) => {
    const head = (
      <>
        <span data-mark className={`${numberLook} relative z-1 mt-px in-data-here:line-ring ${note.id === writingId ? "bg-amber text-white" : "bg-[color-mix(in_srgb,var(--c)_18%,var(--ground))] text-[color-mix(in_srgb,var(--c)_80%,var(--fg))]"}`}>
          {number}
        </span>
        <span className="flex min-w-0 gap-1.5">
          <span className="truncate">{note.id === writingId || !note.words ? placeName(note.on) : note.words}</span>
          {note.id !== writingId && <span className="flex-none text-faint">not saved</span>}
        </span>
        <span className="min-w-[78px] text-right text-xs leading-5 text-amber-ink tabular-nums">{note.on?.at === undefined ? "" : time(note.on.at)}</span>
      </>
    );
    const row = "grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-x-2 py-1.5 pr-2.5 pl-[18px] text-left";
    return note.id === writingId ? (
      <div key={note.id} data-key={`note:${note.id}`} data-stop={note.on?.at} data-open className={`relative ${opened} [--c:var(--amber)]`}>
        <div className={row}>{head}</div>
        <div className="grid gap-2.5 pr-3.5 pl-[44px]">
          <Writing
            words={note.words}
            placeholder={note.on && note.on.at === undefined ? "What isn’t good about it?" : "What do you think?"}
            question="Your new note"
            onWords={(words) => keepWords(note.id, words)}
            onSave={(words) => saveNote(note, words)}
            onCancel={() => dropUnsaved(note.id)}
          />
        </div>
      </div>
    ) : (
      <div key={note.id} data-key={`note:${note.id}`} data-stop={note.on?.at} className={`relative ${pointed}`} style={{ "--c": "var(--amber)" } as CSSProperties}>
        <button className={row} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen({ writing: note.id })}>
          {head}
        </button>
      </div>
    );
  };
  // Grown out of a change's row: the box under the change's why while you write, and your words under its name after.
  const grownRow = (note: Note) =>
    note.id === writingId ? (
      <div key={note.id} data-key={`note:${note.id}`} className="mt-4 grid gap-2.5 pr-3.5 pl-[44px]">
        <Writing words={note.words} placeholder="What isn’t right about it?" question="Your new note" onWords={(words) => keepWords(note.id, words)} onSave={(words) => saveNote(note, words)} onCancel={() => dropUnsaved(note.id)} />
      </div>
    ) : (
      <button
        key={note.id}
        data-key={`note:${note.id}`}
        className="-mt-1 flex w-full gap-1.5 pr-2.5 pb-1.5 pl-[44px] text-left text-[12.5px] leading-[18px] text-soft transition-colors duration-150 ease-calm hover:text-fg"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen({ writing: note.id })}
      >
        <span className="truncate">{note.words}</span>
        <span className="flex-none text-faint">not saved</span>
      </button>
    );
  const pending = [
    ...draft.unsaved.map((note, i) => ({ id: note.id, on: note.on, row: unsaved(note, nextNumber + i), grown: grownRow(note), open: note.id === writingId })),
    ...(removed
      ? [
          {
            id: removed.note.id,
            on: removed.note.on,
            row: (
              <div key={removed.note.id} data-key={`note:${removed.note.id}`} className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2 py-1.5 pr-2.5 pl-[18px] text-faint">
                <span />
                <span>
                  Removed
                  <button className="ml-2 text-xs transition-colors duration-150 ease-calm hover:text-fg" onClick={undoRemove}>
                    Undo
                  </button>
                </span>
              </div>
            ),
          },
        ]
      : []),
  ];
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
  // Playing on from an open row lets it go, as moving on from it does.
  const playOn = () => {
    setOpen(undefined);
    playhead.play();
  };
  // What the agent changed for a note is gone to as its diamond is, the note staying open.
  const toAnswer = (changed: Changed) => {
    const diamond = diamonds.find((diamond) => diamond.changes.includes(changed));
    if (diamond) play(diamond.id, { flow: diamond.flow, at: Math.max(0, diamond.at - 0.8) }, diamond.at);
  };
  const row = (note: Shown, grownHere?: boolean) => {
    const isOpen = !!open && "note" in open && open.note === note.id;
    // A note's card is away once you've gone on into another flow, or what it's on has left the page: it asks nothing
    // there. Not while its own moment plays, on the way to it.
    const away =
      (!!note.on && round.flows.some((flow) => flow.name === note.on!.flow) && note.on.flow !== watching) ||
      ((gone.includes(note.id) || lost.includes(note.id)) && !(where === "playing" && running.current === note.id));
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
        compare={isOpen && (answered(note) || grownHere) ? comparingIt : undefined}
        asking={asking === note.id}
        away={away}
        grown={grownHere}
        onOpen={() => pick(note)}
        onClose={() => setOpen(undefined)}
        onAsking={(on) => setAsking(on ? note.id : undefined)}
        onJudge={(verdict) => judge(note, verdict)}
        onEdit={(words) => editNote(note.id, words)}
        onAnswer={toAnswer}
        onPlayOn={playOn}
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

  // The open card answers Enter and X, as its buttons say: Looks good and Not quite on an answer, Play on and a note on
  // a change. C compares, held for a look and tapped for side by side, as the pointer does on Compare.
  const openNote = open && "note" in open ? notes.find((note) => note.id === open.note) : undefined;
  const asks = !!openNote && !readOnly && openNote.toJudge && openNote.on?.flow === watching;
  const compareNow = (openNote && answered(openNote) && openNote.on?.flow === watching) || changeOpen?.flow === watching ? comparingIt : undefined;
  const cKey = useRef<{ down: number; holding: number }>(undefined);
  const comparedRound = compareNow ? review.rounds.find((kept) => kept.number === compared) : undefined;

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
    if (many) setTimeout(() => toGrid(performance.now()), 900);
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
  // or Carry on checking once you've begun; else what the foot would offer, sending and accepting where you are.
  const begun = watched.length > 0 || said(draft) > 0 || draft.unsaved.length > 0;
  const gridStep = ((): Step | undefined => {
    if (review.accepted || acceptedHere || readOnly) return undefined;
    const step = onward(-1);
    if (step.kind === "agent") return step;
    if (step.kind !== "go") return undefined;
    if (step.flow) return { ...step, words: begun ? "Carry on checking" : "Start checking", what: undefined, take: () => leave(step.flow, true) };
    if (step.send || step.final) return step;
    return {
      ...step,
      take: () => {
        leave(undefined, false);
        step.take();
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
      // What can't be undone takes Ctrl+Enter, never a plain Enter in passing.
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !writingHere(event) && acting?.kind === "go" && acting.final) {
        event.preventDefault();
        return acting.take();
      }
      if (writingHere(event) || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      // Over every flow, Space plays from the start and Enter takes the step; a tile is chosen as a button is.
      if (onGrid) {
        if (event.key === " ") {
          event.preventDefault();
          leave(playhead.flow.name, true);
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
      } else if (event.key.toLowerCase() === "c" && !event.repeat && compareNow) {
        const holding = window.setTimeout(() => compareNow.onHold(true), HOLD);
        cKey.current = { down: performance.now(), holding };
      } else if (event.key === "Escape") {
        // Escape goes back a step you can see: from a note or a change to the column, looking back to now, and from a
        // flow to every flow.
        if (listing) setListing(false);
        else if (open) setOpen(undefined);
        else if (round !== latest) toRound(latest.number);
        else if (many) toGrid();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === " " && !writingHere(event)) event.preventDefault();
      if (event.key.toLowerCase() === "h") bareKey(false);
      if (event.key.toLowerCase() === "c" && cKey.current) {
        clearTimeout(cKey.current.holding);
        const tapped = performance.now() - cKey.current.down < HOLD;
        cKey.current = undefined;
        comparingIt?.onHold(false);
        if (tapped) comparingIt?.onBeside();
      }
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
  const drawn = (diamond: Diamond) => {
    const pointed = diamond.changes.filter((changed) => changed.change.id === pointedChange);
    return pointed.length ? pointed : diamond.changes;
  };
  const changed = (outlined ? drawn(outlined) : []).flatMap((changed) => markOn(changed.on) ?? []);
  const marks = new Map<number, Mark[]>([
    [
      round.number,
      [
        ...playingNotes.flatMap((note): Mark[] => {
          const on = !grown.has(note.id) && markOn(note.on);
          const chosen = openNote?.id === note.id;
          return on ? [{ id: note.id, kind: "note", on, pin: { number: note.number, fill: fill(note) }, ink: ink(note), chosen, shows: chosen ? undefined : { at: note.on!.at!, until: note.on!.until } }] : [];
        }),
        ...(writing?.on?.flow === watching && writing.on.element?.node !== undefined && !grown.has(writing.id) ? [{ id: writing.id, kind: "writing" as const, on: { node: writing.on.element.node }, chosen: true }] : []),
        ...changed.map((on, i): Mark => ({ id: outlined!.id, kind: "change", on, pin: i === 0 ? "diamond" : undefined, dot: grownInk(outlined!), chosen: outlined === chosen || outlined === grownOpen })),
      ],
    ],
  ]);
  const other = earlier ?? comparedRound;
  if (other) {
    const own = openNote && noted.find((note) => note.id === openNote.id);
    const there = own?.on && markOn(placeOn(review, own.id, own.on, own.written, other, read));
    marks.set(other.number, [
      ...(there ? [{ id: own.id, kind: "note" as const, on: there, ink: ink(own), chosen: true }] : []),
      ...(chosen?.flow === watching ? drawn(chosen).flatMap((changed): Mark[] => {
        const on = markOn(placeFrom(review, changed.on, round.number, other, read));
        return on ? [{ id: chosen.id, kind: "change", on, chosen: true }] : [];
      }) : []),
    ]);
  }

  return (
    <Page title={review.title}>
      <Wire id={grownOpen?.id ?? openNote?.id ?? chosen?.id} colour={openNote ? ink(openNote) : grownOpen ? "var(--amber)" : "var(--soft)"} hidden={!!bare || peek} />
      <main className="relative grid min-h-0 grid-cols-[minmax(0,1fr)_min(350px,31vw)] phone:flex phone:flex-col">
        <section inert={onGrid} className={`grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] pr-3.5 pb-4 phone:flex-none phone:grid-rows-[auto_auto] phone:pr-0 phone:pb-3 ${onGrid ? "invisible" : ""}`}>
          <Stage
            review={review}
            playhead={playhead}
            round={round}
            earlier={earlier}
            why={(earlier ?? comparedRound)?.number === compared ? why : undefined}
            then={comparedRound}
            peeking={peek}
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
            onPlace={readOnly ? undefined : (on: Placed) => flow && write({ flow: flow.name, at: Math.round(Math.max(0, playhead.now.moment.at) * 100) / 100, ...on })}
            onMark={(id) => {
              const note = notes.find((note) => note.id === id);
              const diamond = diamonds.find((diamond) => diamond.id === id);
              if (note) show(note);
              else if (diamond) choose(diamond);
            }}
            read={read}
            onGone={setGone}
            onAllFlows={many ? () => toGrid() : undefined}
          />
          <Controls
            ref={controls}
            playhead={playhead}
            dots={playingNotes.filter((note) => !grown.has(note.id)).map((note) => ({ id: note.id, at: note.on?.at ?? 0, until: note.on?.until, ink: ink(note), number: note.number, words: note.turns[0]?.words ?? "" }))}
            onDot={(id) => {
              const note = notes.find((note) => note.id === id);
              if (note) pick(note);
            }}
            marks={diamonds
              .filter((diamond) => diamond.flow === watching)
              .map((diamond) => {
                const answered = notes.find((note) => grown.get(note.id) === diamond) ?? notes.find((note) => diamond.changes.some((changed) => changed.answers && changed.note === note.id));
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
            onEarlier={(number) => setThen(number >= round.number - 1 ? undefined : Math.max(first, number))}
            look={look}
            onLook={chooseLook}
          />
        </section>

        <Drawer ref={aside} over={controls} away={onGrid}>
          <div className="flex items-baseline gap-2 px-[18px] pt-1 pb-2">
            {listing ? (
              <button className="-ml-1 flex items-center gap-0.5 text-soft hover:text-fg" onClick={() => setListing(false)}>
                <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M7.5 3L4.5 6l3 3" />
                </svg>
                All notes
              </button>
            ) : (
              <span className="font-semibold">{roundName(round.number)}</span>
            )}
          </div>
          <SettledCount notes={settled} open={listing} onOpen={() => setListing(!listing)} />
          {listing && (
            <SettledList
              notes={settled}
              onNote={(note) => {
                const on = note.turns.at(-1)?.round ?? round.number;
                if (on === round.number) return setListing(false);
                toNote.current = note;
                toRound(on);
              }}
            />
          )}
          <Column
            hidden={listing}
            review={review}
            round={round}
            playhead={playhead}
            notes={notes}
            diamonds={diamonds}
            chosen={chosen?.id}
            openNote={openNote?.id}
            lit={lit}
            standing={(name) => standing?.get(name)}
            saidGood={draft.looksGood}
            asked={question}
            landed={landed}
            note={row}
            pending={pending}
            grown={new Map([...grown].map(([id, diamond]) => [id, diamond.id]))}
            onFlow={playFlow}
            compare={changeOpen?.flow === watching ? comparingIt : undefined}
            others={(name) => goodFor.get(name)?.filter((person) => person !== you) ?? []}
            onDiamond={choose}
            onClose={() => setOpen(undefined)}
            onPoint={setPointedChange}
            onPlayOn={playOn}
            onNoteOn={noteOn}
            onNote={pick}
            onAsk={ask}
            onGood={lookingGood}
            onNotQuite={(name) => write({ flow: name })}
            onAgain={(flow) => watchFrom(flow.name)}
            onTakeBack={(name) => change((draft) => takeBack(draft, name, notes))}
            onGeneral={readOnly ? undefined : () => write(undefined)}
          />
          <Foot
            step={step}
            quiet={!!open}
            notes={asksTheAgent}
            onSend={!readOnly && asksTheAgent ? sendNow : undefined}
            sent={sent}
            trouble={trouble}
            pieces={judging && standing ? round.flows.map((flow) => ({ flow: flow.name, standing: standing.get(flow.name)!, here: flow.name === watching })) : undefined}
            landed={landed}
            busy={!!working}
            onFlow={watchFrom}
          />
        </Drawer>
        {many && (
          <Grid
            room={gridRoom}
            review={review}
            round={round}
            up={onGrid}
            standing={(name) => standing?.get(name)}
            needs={needs}
            diamonds={review.accepted ? [] : diamonds}
            accepted={review.accepted || acceptedHere ? acceptedAfter : undefined}
            step={gridStep}
            done={done}
            onFlow={(name) => leave(name, true)}
          />
        )}
      </main>
    </Page>
  );
}

// What's kept for you in this browser, such as how you like to look at a review. Without it, nothing is kept.
function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // the browser keeps nothing here
  }
}
