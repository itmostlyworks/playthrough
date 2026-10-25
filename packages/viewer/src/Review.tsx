// A review on one page: the recording is where you look, the column is the map of what's been said, and the foot is
// where you act. The view changes only when you change it: a new round says it's in, and waits for you.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { lastLooked, list, newId, readyToAccept, time, type Place, type Point, type Review, type Round, type Verdict } from "@vantage/review";
import { accept, recording, send, useReview, useYou } from "./api.ts";
import { Controls, type Look } from "./Controls.tsx";
import { useDraft } from "./draft.ts";
import { along, CARD, FLOW_IN, inStep, momentAt, POSTER } from "./moments.ts";
import { fill, goodTo, ink, notesOn, nothing, seen, type Draft, type Shown } from "./notes.ts";
import { mac, NoteRow, number, Writing } from "./Notes.tsx";
import { Playhead, useNow } from "./playhead.ts";
import { recorded } from "./replay.ts";
import { roundName } from "./Rounds.tsx";
import { Stage, type Bare, type Shown as Size } from "./Stage.tsx";

// What's open in the column: a note, or a new one being written, on a place or, without one, in general.
type Open = { note: string } | { writing: Place | undefined };

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

function OnRound({ review, round, latest, arrived, you, onRound }: OnRoundProps) {
  const [draft, change] = useDraft(review.id, round.number);
  const [open, setOpen] = useState<Open>();
  const [fresh, setFresh] = useState<string>();
  const [met, setMet] = useState<string[]>([]);
  // Looking at another round starts on its map, with nothing open.
  const [on, setOn] = useState(round.number);
  if (on !== round.number) {
    setOn(round.number);
    setOpen(undefined);
  }

  // You arrive at the start, as on a video before you press play. Going to another round keeps your place: the same flow
  // at the matching moment, or its start if that round never recorded the flow.
  const [playhead] = useState(() => new Playhead(round.flows, { flow: round.flows[0]?.name ?? "", at: POSTER }));
  useEffect(() => () => playhead.destroy(), [playhead]);
  const watched = useRef(round.number);
  useLayoutEffect(() => {
    if (watched.current === round.number) return playhead.watch(round.flows, playhead.now.moment);
    watched.current = round.number;
    const from = playhead.flow;
    const to = round.flows.find((flow) => flow.name === from.name);
    playhead.pause();
    playhead.watch(round.flows, to ? { flow: to.name, at: inStep(playhead.now.moment.at, from, to) } : { flow: round.flows[0]?.name ?? "", at: -CARD });
  }, [round, playhead]);
  const watching = useNow(playhead, (now) => now.moment.flow);
  const flow = round.flows.find((flow) => flow.name === watching) ?? round.flows[0];

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
  const working = review.accepted ? undefined : review.taken.find((taken) => taken.round > latest.number)?.at;

  // Left and Right step to the next moment the page changes, or a second where nothing does; with Shift, a tenth.
  const [changes, setChanges] = useState<{ flow: string; at: number[] }>();
  useEffect(() => {
    if (!flow) return;
    let current = true;
    recording(review.id, round.number, flow.recording).then((events) => current && setChanges({ flow: flow.name, at: recorded(events).changes }));
    return () => void (current = false);
  }, [review.id, round.number, flow]);
  const step = (direction: 1 | -1, fine: boolean) => {
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
  const onFlow = (name: string) => notes.filter((note) => note.on?.flow === name);
  const inGeneral = notes.filter((note) => !note.on || !round.flows.some((flow) => flow.name === note.on?.flow));
  const playingNotes = flow ? onFlow(flow.name).filter((note) => note.on?.at !== undefined) : [];

  // Your Looks good holds while nothing of yours in the flow waits, for you or for the agent; a note there takes it back.
  const goodFor = new Map(round.flows.map((flow) => [flow.name, goodTo(review, round.number, flow.name)]));
  const holds = (name: string) => !onFlow(name).some((note) => note.yours && (note.state === "needs you" || note.state === "with the agent"));
  const toWatch = round.flows.map((flow) => flow.name).filter((name) => !goodFor.get(name)?.includes(you) && !draft.looksGood.includes(name) && holds(name));

  const go = (name: string, at = FLOW_IN) => {
    playhead.pause();
    playhead.go({ flow: name, at });
  };
  const show = (note: Shown) => {
    setOpen({ note: note.id });
    setMet((met) => (met.includes(note.id) ? met : [...met, note.id]));
    if (note.on) go(note.on.flow, note.on.at);
  };

  // Playing stops at each answer that waits for you, the first time it gets there, and opens it as a click on it would.
  useEffect(() =>
    playhead.stopAt(
      playingNotes.flatMap((note) =>
        note.on && note.state === "needs you" && !note.unsent && !met.includes(note.id) ? [{ flow: note.on.flow, at: note.on.at ?? 0, reached: () => show(note) }] : [],
      ),
    ),
  );
  const write = (on: Place | undefined) => !readOnly && setOpen({ writing: on });
  const glow = (id: string) => {
    setFresh(id);
    setTimeout(() => setFresh((fresh) => (fresh === id ? undefined : fresh)), 1200);
  };

  const saveNote = (on: Place | undefined, words: string) => {
    const id = newId();
    change((draft) => ({ ...draft, notes: [...draft.notes, { id, ...(on && { on }), words }], looksGood: draft.looksGood.filter((flow) => flow !== on?.flow) }));
    setOpen(undefined);
    glow(id);
  };
  const editNote = (id: string, words: string | undefined) => {
    change((draft) => ({ ...draft, notes: draft.notes.flatMap((note) => (note.id !== id ? [note] : words ? [{ ...note, words }] : [])) }));
    if (!words) setOpen(undefined);
  };
  const judge = (note: Shown, verdict: Verdict | undefined) =>
    change((draft) => ({
      ...draft,
      verdicts: [...draft.verdicts.filter((kept) => kept.note !== note.id), ...(verdict ? [verdict] : [])],
      looksGood: verdict?.verdict === "not quite" ? draft.looksGood.filter((flow) => flow !== note.on?.flow) : draft.looksGood,
    }));
  const toggleGood = (name: string) =>
    change((draft) => ({ ...draft, looksGood: draft.looksGood.includes(name) ? draft.looksGood.filter((flow) => flow !== name) : [...draft.looksGood, name] }));

  const nextNumber = Math.max(0, ...notes.map((note) => note.number)) + 1;
  const writing = open && "writing" in open ? open : undefined;
  const composer = (on: Place | undefined) => (
    <div className="rounded-lg bg-hover">
      <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2 px-2.5 py-2">
        <span className={`${number} mt-px bg-amber`}>{nextNumber}</span>
        <span className="font-medium">{on?.point ? "This moment" : on ? "The whole flow" : "New note"}</span>
        <span className="text-xs leading-5 text-faint tabular-nums">{on?.at === undefined ? "" : time(on.at)}</span>
      </div>
      <div className="pr-2.5 pb-2.5 pl-9">
        <Writing words="" placeholder={on && !on.point ? "What isn’t good about it?" : "What do you think?"} onSave={(words) => saveNote(on, words)} onCancel={() => setOpen(undefined)} />
      </div>
    </div>
  );
  const row = (note: Shown) => (
    <NoteRow
      key={note.id}
      note={note}
      you={you}
      readOnly={readOnly}
      open={!!open && "note" in open && open.note === note.id}
      fresh={fresh === note.id}
      onOpen={() => show(note)}
      onClose={() => setOpen(undefined)}
      onJudge={(verdict) => judge(note, verdict)}
      onEdit={(words) => editNote(note.id, words)}
    />
  );

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

  useEffect(() => {
    const writingHere = (event: KeyboardEvent) => event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
    const down = (event: KeyboardEvent) => {
      if (writingHere(event) || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      // Space plays and pauses wherever you are, also on a button you just clicked: it never presses it.
      if (event.key === " ") {
        event.preventDefault();
        playhead.toggle();
      } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        if ((event.target as Element).closest?.("[role=slider][aria-label=Rounds]")) return;
        event.preventDefault();
        step(event.key === "ArrowRight" ? 1 : -1, event.shiftKey);
      } else if (event.key.toLowerCase() === "h") {
        if (!event.repeat) bareKey(true);
      } else if (event.key === "Escape") {
        // Escape goes back a step you can see: from a note to the column, and looking back, to now.
        if (open && "note" in open) setOpen(undefined);
        else if (round !== latest) toRound(latest.number);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === " " && !writingHere(event)) event.preventDefault();
      if (event.key.toLowerCase() === "h") bareKey(false);
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
      <main className="grid min-h-0 grid-cols-[minmax(0,1fr)_min(350px,31vw)]">
        <section className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] pr-3.5 pb-4">
          <Stage
            review={review}
            playhead={playhead}
            round={round}
            earlier={earlier}
            why={earlier && earlier.number === looked ? "· when you last looked" : undefined}
            zoomed={zoomed}
            bare={bare}
            onShown={setSize}
            onBareOff={() => {
              bareKeys.current.kept = false;
              setBare(undefined);
            }}
            pins={playingNotes.flatMap((note) => (note.on?.point && note.on.at !== undefined ? [{ id: note.id, number: note.number, at: note.on.at, until: note.on.until, point: note.on.point, fill: fill(note) }] : []))}
            placing={writing?.writing?.point}
            onPlace={readOnly ? undefined : (point: Point) => flow && write({ flow: flow.name, at: Math.round(Math.max(0, playhead.now.moment.at) * 100) / 100, point })}
            onPin={(id) => {
              const note = notes.find((note) => note.id === id);
              if (note) show(note);
            }}
          />
          <Controls
            playhead={playhead}
            dots={playingNotes.map((note) => ({ id: note.id, at: note.on?.at ?? 0, until: note.on?.until, ink: ink(note), number: note.number, words: note.turns[0]?.words ?? "" }))}
            onDot={(id) => {
              const note = notes.find((note) => note.id === id);
              if (note) show(note);
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
          <div className="min-h-0 flex-1 overflow-y-auto pt-1 pb-3">
            {(!readOnly || inGeneral.length > 0) && (
              <section className="mb-2">
                <Heading name="In general" onAdd={readOnly ? undefined : () => write(undefined)} add="Add a note on the work in general" />
                {inGeneral.map(row)}
                {writing && !writing.writing && composer(undefined)}
              </section>
            )}
            {round.flows.map((flow) => (
              <section key={flow.name} className="mb-2">
                <Heading
                  name={flow.name}
                  length={flow.length}
                  current={watching === flow.name}
                  onChoose={() => go(flow.name)}
                  onAdd={readOnly ? undefined : () => write({ flow: flow.name })}
                  add="Add a note on the whole flow"
                  good={goodFor.get(flow.name)?.includes(you) ? "sent" : draft.looksGood.includes(flow.name)}
                  onGood={readOnly || !holds(flow.name) ? undefined : () => toggleGood(flow.name)}
                />
                <Said line={flow.line} by={round.by} others={goodFor.get(flow.name)?.filter((person) => person !== you) ?? []} />
                {onFlow(flow.name).map(row)}
                {writing?.writing?.flow === flow.name && composer(writing.writing)}
              </section>
            ))}
          </div>
          <Foot
            review={review}
            round={round}
            latest={latest}
            arrived={arrived}
            you={you}
            notes={notes}
            draft={draft}
            toWatch={toWatch}
            watching={watching}
            onShow={show}
            onFlow={go}
            onRound={toRound}
            onSent={() => change(() => nothing)}
          />
        </aside>
      </main>
    </Page>
  );
}

function Heading(props: {
  name: string;
  length?: number;
  current?: boolean;
  onChoose?: () => void;
  onAdd?: () => void;
  add: string;
  good?: boolean | "sent";
  onGood?: () => void;
}) {
  const quiet = "grid h-6 place-items-center rounded-md px-2 text-xs font-medium text-soft opacity-0 transition duration-150 ease-calm group-hover:opacity-100 hover:bg-hover hover:text-fg";
  return (
    <div className={`group flex h-9 items-center gap-2 rounded-lg px-2.5 ${props.onChoose ? "cursor-pointer" : ""}`} onClick={props.onChoose}>
      <span className={`truncate font-semibold ${props.current === false ? "text-soft" : "text-fg"}`}>{props.name}</span>
      {props.length !== undefined && <span className="text-xs text-faint tabular-nums">{time(props.length)}</span>}
      <span className="ml-auto flex flex-none items-center gap-1">
        {props.good === "sent" ? (
          <span className="px-2 text-xs font-medium text-green">✓ Looks good</span>
        ) : (
          props.onGood && (
            <button
              className={`${quiet} ${props.current ? "opacity-100" : ""} aria-pressed:bg-green/12 aria-pressed:text-green aria-pressed:opacity-100`}
              aria-pressed={!!props.good}
              onClick={(event) => (event.stopPropagation(), props.onGood?.())}
            >
              {props.good ? "✓ Looks good" : "Looks good"}
            </button>
          )
        )}
        {props.onAdd && (
          <button className={`${quiet} ${props.current ? "opacity-100" : ""} w-6 px-0 text-base`} title={props.add} aria-label={props.add} onClick={(event) => (event.stopPropagation(), props.onAdd?.())}>
            +
          </button>
        )}
      </span>
    </div>
  );
}

// Under a flow's name: the agent's line at its start, under the agent's own name as in a note's conversation, and who
// else it looks good to.
function Said({ line, by, others }: { line?: string; by: string; others: string[] }) {
  if (!line && !others.length) return null;
  return (
    <div className="-mt-1 flex flex-col gap-0.5 px-2.5 pb-1.5">
      {line && (
        <p className="text-soft">
          <span className="mr-1 font-medium">{by}:</span>
          {line}
        </p>
      )}
      {others.length > 0 && <p className="text-xs text-green">✓ Looks good to {few(others)}</p>}
    </div>
  );
}

// A few names by name, then how many more.
const few = (names: string[]) => (names.length > 3 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} others` : list(names));

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

type FootProps = OnRoundProps & {
  notes: Shown[];
  draft: Draft;
  toWatch: string[];
  watching?: string;
  onShow: (note: Shown) => void;
  onFlow: (name: string) => void;
  onSent: () => void;
};

function Foot(props: FootProps) {
  const { review, round, latest, you, notes, draft } = props;
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [trouble, setTrouble] = useState<string[]>([]);
  const before = round.number === 0;
  const unsent = draft.notes.length + draft.verdicts.length + draft.looksGood.length;
  const toCheck = notes.find((note) => note.state === "needs you" && !note.unsent);
  // The next flow you haven't said looks good, after the one you're watching.
  const at = props.toWatch.indexOf(props.watching ?? "");
  const toWatch = [...props.toWatch.slice(at + 1), ...props.toWatch.slice(0, Math.max(0, at))][0];
  const withTheAgent = notes.some((note) => note.state === "with the agent" && !note.unsent);
  const taken = review.sends.filter((send) => send.round === round.number).every((send) => review.taken.some((taken) => taken.send === send.id));
  const canAccept = !review.accepted && latest === round && !unsent && readyToAccept(review, you);

  const sendNow = async () => {
    if (!unsent || sending) return;
    setSending(true);
    const problems = await send(review.id, { id: newId(), round: round.number, by: you, sent: new Date().toISOString(), ...draft });
    setSending(false);
    setTrouble(problems);
    if (problems.length) return;
    props.onSent();
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  };
  const acceptNow = async () => {
    if (canAccept) setTrouble(await accept(review.id, you));
  };

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !(event.target instanceof HTMLTextAreaElement)) acceptNow();
    };
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  });

  const action = "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-hover px-3 text-xs shadow-[inset_0_0_0_1px_var(--line)] transition-colors duration-150 ease-calm hover:bg-line";
  const said = "flex h-8 min-w-0 flex-1 items-center gap-2 px-1 text-xs";
  let step: ReactNode;
  if (review.accepted)
    step = (
      <span className={`${said} font-semibold text-green`}>
        <span className="truncate">✓ Accepted{review.accepted.by === you ? "" : ` by ${review.accepted.by}`}</span>
      </span>
    );
  else if (latest !== round && props.arrived)
    step = (
      <button className={action} onClick={() => props.onRound(latest.number)}>
        <span className="truncate">{roundName(latest.number)} is in</span>
        <span className="text-faint">· See it</span>
      </button>
    );
  else if (latest !== round)
    step = (
      <button className={action} onClick={() => props.onRound(latest.number)}>
        <span className="truncate text-soft">Looking back</span>
        <span>· Back to now</span>
      </button>
    );
  else if (before)
    step = (
      <span className={`${said} text-soft`}>
        <span className="size-1.5 flex-none animate-breathe rounded-full bg-slate" />
        <span className="truncate">The agent is working on round 1</span>
      </span>
    );
  else if (toCheck)
    step = (
      <button className={action} onClick={() => props.onShow(toCheck)}>
        <span className="flex-none text-faint">Next to check ·</span>
        <span className="truncate">{toCheck.turns[0]?.words}</span>
      </button>
    );
  else if (toWatch)
    step = (
      <button className={action} onClick={() => props.onFlow(toWatch)}>
        <span className="flex-none text-faint">Next ·</span>
        <span className="truncate">{toWatch}</span>
      </button>
    );
  else if (props.watching && props.toWatch.includes(props.watching))
    step = (
      <span className={`${said} text-soft`}>
        <span className="truncate">Looks good? Say so beside its name.</span>
      </span>
    );
  else if (unsent)
    step = (
      <span className={`${said} text-soft`}>
        <span className="truncate">Nothing reaches the agent until you send it.</span>
      </span>
    );
  else if (withTheAgent)
    step = (
      <span className={`${said} text-soft`}>
        <span className="size-1.5 flex-none animate-breathe rounded-full bg-slate" />
        <span className="truncate">{taken ? `The agent is working on round ${round.number + 1}` : "Sent, waiting for the agent"}</span>
      </span>
    );
  else if (canAccept)
    step = (
      <button className={action} onClick={acceptNow}>
        <span className="truncate">All good · Accept the work</span>
        <kbd className="ml-auto font-ui text-[11px] text-faint">{mac ? "⌘" : "Ctrl"} ↵</kbd>
      </button>
    );

  return (
    <div className="border-t border-line px-1 pt-3">
      {trouble.length > 0 && <p className="mb-2 text-xs text-amber-ink">{trouble.join(" ")}</p>}
      <div className="flex min-h-8 items-center gap-2">
        {step}
        {!review.accepted && !before && (latest === round || props.arrived) && (
          <button
            className={`flex h-8 w-[88px] flex-none items-center justify-center gap-2 rounded-lg text-[12.5px] font-semibold transition-colors duration-150 ease-calm ${sent ? "text-slate" : "bg-fg text-ground disabled:opacity-30"}`}
            disabled={!unsent || sending}
            onClick={sendNow}
          >
            {sent ? "✓ Sent" : "Send"}
            {!sent && unsent > 0 && <span className="text-[11px] font-medium opacity-60 tabular-nums">{unsent}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
