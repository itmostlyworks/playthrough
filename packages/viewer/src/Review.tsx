// A review on one page: the recording is where you look, the column is the map of what's been said, and the foot is
// where you act. The view changes only when you change it: a new round says it's in, and waits for you.

import { useEffect, useState, type ReactNode } from "react";
import { list, newId, readyToAccept, time, type Flow, type Place, type Point, type Review, type Round, type Verdict } from "@vantage/review";
import { accept, recording, send, useReview, useYou } from "./api.ts";
import { useDraft } from "./draft.ts";
import { fill, goodTo, notesOn, nothing, seen, type Draft, type Shown } from "./notes.ts";
import { mac, NoteRow, number, Writing } from "./Notes.tsx";
import type { Events } from "./player.ts";
import { Recording, usePlayer } from "./Recording.tsx";
import { Ruler } from "./Ruler.tsx";

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
  return <OnRound key={round.number} review={review} round={round} latest={latest} arrived={latest.number !== newest} you={you} onRound={choose} />;
}

type OnRoundProps = { review: Review; round: Round; latest: Round; arrived: boolean; you: string; onRound: (round: number) => void };

function OnRound({ review, round, latest, arrived, you, onRound }: OnRoundProps) {
  const [draft, change] = useDraft(review.id, round.number);
  const [open, setOpen] = useState<Open>();
  const [fresh, setFresh] = useState<string>();
  const [chosen, setChosen] = useState(round.flows[0]?.name);
  const [startAt, setStartAt] = useState(0);
  const [loaded, setLoaded] = useState<{ flow: Flow; events: Events }>();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const flow = round.flows.find((flow) => flow.name === chosen) ?? round.flows[0];

  useEffect(() => {
    if (!flow) return;
    let current = true;
    recording(review.id, round.number, flow.recording).then((events) => current && setLoaded({ flow, events }));
    return () => void (current = false);
  }, [review.id, round.number, flow]);
  const player = usePlayer(host, loaded?.events, loaded?.flow.length ?? 1, startAt);
  const [met, setMet] = useState<string[]>([]);

  // Before is how the app was: it's there to look back on, and notes go on the rounds after it.
  const readOnly = !!review.accepted || round.number === 0 || (round !== latest && !arrived);
  const notes = notesOn(review, round.number, you, draft);
  const onFlow = (name: string) => notes.filter((note) => note.on?.flow === name);
  const inGeneral = notes.filter((note) => !note.on || !round.flows.some((flow) => flow.name === note.on?.flow));
  const playingNotes = loaded ? onFlow(loaded.flow.name).filter((note) => note.on?.at !== undefined) : [];

  // Your Looks good holds while nothing of yours in the flow waits, for you or for the agent; a note there takes it back.
  const goodFor = new Map(round.flows.map((flow) => [flow.name, goodTo(review, round.number, flow.name)]));
  const holds = (name: string) => !onFlow(name).some((note) => note.yours && (note.state === "needs you" || note.state === "with the agent"));
  const toWatch = round.flows.map((flow) => flow.name).filter((name) => !goodFor.get(name)?.includes(you) && !draft.looksGood.includes(name) && holds(name));

  const go = (name: string, at = 0) => {
    if (loaded?.flow.name === name && player) {
      player.pause();
      player.seek(at);
    } else {
      setStartAt(at);
      setChosen(name);
    }
  };
  const show = (note: Shown) => {
    setOpen({ note: note.id });
    setMet((met) => (met.includes(note.id) ? met : [...met, note.id]));
    if (note.on) go(note.on.flow, note.on.at);
  };

  // Playing stops at each answer that waits for you, the first time it gets there, and opens it as a click on it would.
  useEffect(() =>
    player?.stopAt(
      playingNotes.flatMap((note) => (note.state === "needs you" && !note.unsent && !met.includes(note.id) ? [{ at: note.on?.at ?? 0, reached: () => show(note) }] : [])),
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

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
      if (event.key === " ") {
        event.preventDefault();
        player?.toggle();
      }
      if (event.key === "Escape" && open && "note" in open) setOpen(undefined);
    };
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  }, [player, open]);

  return (
    <Page title={review.title}>
      <main className="grid min-h-0 grid-cols-[minmax(0,1fr)_min(350px,31vw)]">
        <section className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] pr-3.5 pb-4">
          <Recording
            caption={loaded?.flow.name ?? ""}
            player={player}
            host={setHost}
            pins={playingNotes.flatMap((note) => (note.on?.point && note.on.at !== undefined ? [{ id: note.id, number: note.number, at: note.on.at, until: note.on.until, point: note.on.point, fill: fill(note) }] : []))}
            placing={writing?.writing?.point}
            onPlace={readOnly ? undefined : (point: Point) => loaded && player && write({ flow: loaded.flow.name, at: Math.round(player.time * 100) / 100, point })}
            onPin={(id) => {
              const note = notes.find((note) => note.id === id);
              if (note) show(note);
            }}
          />
          {loaded ? (
            <Ruler
              player={player}
              flow={loaded.flow}
              dots={playingNotes.map((note) => ({ id: note.id, at: note.on?.at ?? 0, until: note.on?.until, fill: fill(note) }))}
              onDot={(id) => {
                const note = notes.find((note) => note.id === id);
                if (note) show(note);
              }}
            />
          ) : (
            <div className="h-[54px]" />
          )}
        </section>

        <aside className="flex min-h-0 min-w-0 flex-col pb-4">
          <Rounds review={review} round={round} latest={latest} arrived={arrived} onRound={onRound} />
          <div className="min-h-0 flex-1 overflow-y-auto pb-3">
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
                  current={loaded?.flow.name === flow.name}
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
            watching={loaded?.flow.name}
            onShow={show}
            onFlow={go}
            onRound={onRound}
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

const roundName = (number: number) => (number === 0 ? "Before" : `Round ${number}`);

function Rounds({ review, round, latest, arrived, onRound }: Omit<OnRoundProps, "you">) {
  const at = review.rounds.indexOf(round);
  const step = "grid size-7 place-items-center rounded-md text-soft transition-colors duration-150 ease-calm enabled:hover:bg-hover enabled:hover:text-fg disabled:opacity-30";
  return (
    <div className="flex h-10 items-center gap-1 px-1">
      <button className={step} aria-label="The round before" disabled={at <= 0} onClick={() => onRound(review.rounds[at - 1]!.number)}>‹</button>
      <b className="w-18 text-center font-semibold">{roundName(round.number)}</b>
      <button className={step} aria-label="The round after" disabled={at >= review.rounds.length - 1} onClick={() => onRound(review.rounds[at + 1]!.number)}>›</button>
      {arrived && (
        <button className="ml-auto flex animate-arrive items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-amber-ink hover:bg-hover" onClick={() => onRound(latest.number)}>
          <span className="size-1.5 rounded-full bg-amber" />
          {roundName(latest.number)} is in
        </button>
      )}
    </div>
  );
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
