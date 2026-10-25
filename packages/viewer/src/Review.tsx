// A review on one page: the recording is where you look, the column is the map of what's been said, and the foot is
// where you act. The view changes only when you change it: a new round says it's in, and waits for you.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { lastLooked, newId, readyToAccept, time, waitingForTheAgent, type Flow, type Note, type Place, type Point, type Review, type Round, type Send, type Verdict } from "@vantage/review";
import { accept, recording, send, useReview, useYou } from "./api.ts";
import { HOLD } from "./Card.tsx";
import { answersTo, diamondAt, diamondsOn, type Changed, type Diamond } from "./changes.ts";
import { Column, rowsIn, settles, type Landed } from "./Column.tsx";
import { Controls, type Look } from "./Controls.tsx";
import { useDraft, useWatched } from "./draft.ts";
import { Foot, type Step } from "./Foot.tsx";
import { along, CARD, clamp, FLOW_IN, inStep, momentAt, POSTER, type Moment } from "./moments.ts";
import { asIfSent, fill, goodTo, ink, lookGood, notesOn, nothing, said, seen, sendOf, settledBefore, standings, takeBack, type Shown } from "./notes.ts";
import { NoteRow, number as numberLook, opened, SettledCount, SettledList, Writing, type Comparing } from "./Notes.tsx";
import { Playhead, useNow } from "./playhead.ts";
import { recorded } from "./replay.ts";
import { roundName } from "./Rounds.tsx";
import { Stage, type Bare, type Shown as Size } from "./Stage.tsx";
import { Wire } from "./Wire.tsx";

// What's open in the column: a note, a change you chose, or a new note being written, by its id.
type Open = { note: string } | { change: string } | { writing: string };

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
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden px-5">
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
  if (on !== round.number) {
    setOn(round.number);
    setOpen(toNote.current && { note: toNote.current.id });
    setListing(false);
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
  // The earlier side, where it's the round you last looked at this flow, says why it's that one.
  const looked = flow && round === latest ? lastLooked(review, you, flow.name, round.number) : undefined;
  // What you judge on the latest round is a difference from the round you last looked at its flow, or Before: held,
  // that round shows in place; clicked, the two go side by side.
  const compared = round === latest && round.number > first && !review.accepted ? (looked ?? first) : undefined;
  const [peek, setPeek] = useState(false);
  // Only an answer is a difference to judge: a note nobody has answered has nothing to compare.
  const answered = (note: Shown) => note.on?.at !== undefined && note.turns.some((turn) => turn.agent);
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
  const notes = notesOn(review, round.number, you, draft);
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
  const lit = chosen?.id ?? onNow;
  // Paused on a change, with nothing else open, it's outlined where it is on the page; chosen, more firmly.
  const outlined = chosen?.flow === watching ? chosen : !open ? diamonds.find((diamond) => diamond.id === onNow) : undefined;

  // A row in the column plays its moment, as a click on a video's chapter would: clicked while it plays, it pauses;
  // paused partway, it carries on to its end; anywhere else, it plays from its start.
  const running = useRef<string>(undefined);
  const play = (id: string, from: Moment, until: number) => {
    const { moment, playing } = playhead.now;
    const inside = running.current === id && moment.flow === from.flow && moment.at >= from.at && moment.at < until - 0.02;
    if (playing && inside) return playhead.pause();
    running.current = id;
    playhead.run(inside ? moment : from, until);
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
  // Chosen, a note opens and plays its moment, from a beat before it to a second after; one on a whole flow plays the flow.
  const pick = (note: Shown) => {
    const on = note.on;
    const its = on && round.flows.find((flow) => flow.name === on.flow);
    if (!on || !its || on.at === undefined) {
      show(note);
      return its && playFlow(its);
    }
    setOpen({ note: note.id });
    setMet((met) => (met.includes(note.id) ? met : [...met, note.id]));
    play(note.id, { flow: on.flow, at: Math.max(0, on.at - 0.8) }, Math.min(its.length, (on.until ?? on.at) + 1));
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
  const placeName = (on: Place | undefined) => (on?.element ? on.element.name : on?.at !== undefined ? "This moment" : on ? "The whole flow" : "New note");
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
      <div key={note.id} data-key={`note:${note.id}`} data-stop={note.on?.at} data-open className={`relative rounded-r-lg ${opened} [--c:var(--amber)] [--rail:var(--amber)]`}>
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
      <div key={note.id} data-key={`note:${note.id}`} data-stop={note.on?.at} className="relative rounded-r-lg transition-colors duration-150 ease-calm hover:bg-hover" style={{ "--c": "var(--amber)" } as CSSProperties}>
        <button className={row} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen({ writing: note.id })}>
          {head}
        </button>
      </div>
    );
  };
  const pending = [
    ...draft.unsaved.map((note, i) => ({ on: note.on, row: unsaved(note, nextNumber + i) })),
    ...(removed
      ? [
          {
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
  // What isn't right about a change is a note on what it's on, at its moment, or over new steps.
  const noteOn = (diamond: Diamond) => {
    const element = diamond.changes.find((changed) => !changed.answers)?.on.element;
    go(diamond.flow, diamond.at);
    write({ flow: diamond.flow, at: diamond.at, ...(diamond.until !== undefined ? { until: diamond.until } : element && { element }) });
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
  const row = (note: Shown) => {
    const isOpen = !!open && "note" in open && open.note === note.id;
    // A note's card is away once you've gone on into another flow: it asks nothing there.
    const away = !!note.on && round.flows.some((flow) => flow.name === note.on!.flow) && note.on.flow !== watching;
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
        compare={isOpen && answered(note) ? comparingIt : undefined}
        asking={asking === note.id}
        away={away}
        onOpen={() => pick(note)}
        onClose={() => (running.current === note.id && playhead.now.playing ? playhead.pause() : setOpen(undefined))}
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
  const compareNow = (openNote && answered(openNote) && openNote.on?.flow === watching) || chosen?.flow === watching ? comparingIt : undefined;
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
    if (!problems.length) setAcceptedHere(true);
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
    if (next) return { kind: "go", words: "Next", what: next.name, take: () => watchFrom(next.name) };
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

  useEffect(() => {
    const writingHere = (event: KeyboardEvent) => event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
    const down = (event: KeyboardEvent) => {
      // What can't be undone takes Ctrl+Enter, never a plain Enter in passing.
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !writingHere(event) && step.kind === "go" && step.final) {
        event.preventDefault();
        return step.take();
      }
      if (writingHere(event) || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
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
        // Escape goes back a step you can see: from a note or a change to the column, and looking back, to now.
        if (listing) setListing(false);
        else if (open) setOpen(undefined);
        else if (round !== latest) toRound(latest.number);
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

  return (
    <Page title={review.title}>
      <Wire id={openNote?.id ?? chosen?.id} colour={openNote ? ink(openNote) : "var(--soft)"} hidden={!!bare || peek} />
      <main className="grid min-h-0 grid-cols-[minmax(0,1fr)_min(350px,31vw)]">
        <section className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] pr-3.5 pb-4">
          <Stage
            review={review}
            playhead={playhead}
            round={round}
            earlier={earlier}
            why={(earlier ?? comparedRound)?.number === looked ? "· when you last looked" : undefined}
            then={comparedRound}
            peeking={peek}
            zoomed={zoomed}
            bare={bare}
            onShown={setSize}
            onBareOff={() => {
              bareKeys.current.kept = false;
              setBare(undefined);
            }}
            pins={playingNotes.flatMap((note) => (note.on?.point && note.on.at !== undefined ? [{ id: note.id, number: note.number, at: note.on.at, until: note.on.until, point: note.on.point, fill: fill(note) }] : []))}
            placing={writing?.on?.point}
            onPlace={readOnly ? undefined : (point: Point) => flow && write({ flow: flow.name, at: Math.round(Math.max(0, playhead.now.moment.at) * 100) / 100, point })}
            onPin={(id) => {
              const note = notes.find((note) => note.id === id);
              if (note) show(note);
            }}
            outline={
              outlined && {
                id: outlined.id,
                nodes: outlined.changes.flatMap(({ on }) => (on.element?.node === undefined ? [] : [on.element.node])),
                chosen: outlined === chosen,
              }
            }
            onOutline={(id) => {
              const diamond = diamonds.find((diamond) => diamond.id === id);
              if (diamond) choose(diamond);
            }}
          />
          <Controls
            playhead={playhead}
            dots={playingNotes.map((note) => ({ id: note.id, at: note.on?.at ?? 0, until: note.on?.until, ink: ink(note), number: note.number, words: note.turns[0]?.words ?? "" }))}
            onDot={(id) => {
              const note = notes.find((note) => note.id === id);
              if (note) pick(note);
            }}
            marks={diamonds
              .filter((diamond) => diamond.flow === watching)
              .map((diamond) => {
                const answered = notes.find((note) => diamond.changes.some((changed) => changed.answers && changed.note === note.id));
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

        <aside className="flex min-h-0 min-w-0 flex-col pb-4">
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
            lit={lit}
            standing={(name) => standing?.get(name)}
            saidGood={draft.looksGood}
            asked={question}
            landed={landed}
            note={row}
            pending={pending}
            onFlow={playFlow}
            compare={chosen && chosen.flow === watching ? comparingIt : undefined}
            others={(name) => goodFor.get(name)?.filter((person) => person !== you) ?? []}
            onDiamond={choose}
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
        </aside>
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
