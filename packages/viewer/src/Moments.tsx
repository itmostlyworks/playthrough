// A rough try at moments: what's waiting on you, each change by its title with its moments under it, a line each in the
// agent's words; and a moment opened, the app at the point that matters, still and as large as the window allows. From
// there: look (play the few seconds that led here), step in (the real app there, as that person), or say something (a
// note on what you click). Going on to the next moment is the yes. What you said goes to the agent when you leave the
// change, back to the list. Its own address, /moments, beside the page; the recording, the pointer, the pins and
// stepping in are the page's own.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import { newId, pausedAt, type Did, type Note, type Place, type Review, type Round, type Scene } from "@playthrough/review";
import { glimpses, keepBranch, picture, readings as readingsOf, recording, send, useReview, useYou } from "./api.ts";
import { Key } from "./Card.tsx";
import { Picture } from "./Picture.tsx";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Clock, Player, useCut, type Mark, type Placed } from "./Player.tsx";
import { Portal, TAG } from "./Portal.tsx";
import { readyAt } from "./live.ts";
import type { Scrolled } from "./replay.ts";
import { clock } from "./Rounds.tsx";

// Where you are: the list, or a change's moment, by its place in the list from 1.
type Where = { review?: string; moment?: number };
const whereFrom = (path: string): Where => {
  const [, review, moment] = path.split("/").filter(Boolean).map(decodeURIComponent);
  return review ? { review, moment: Math.max(1, Number(moment) || 1) } : {};
};
const pathOf = ({ review, moment }: Where) => (review ? `/moments/${encodeURIComponent(review)}/${moment ?? 1}` : "/moments");

export function MomentsPage() {
  const [where, setWhere] = useState(() => whereFrom(location.pathname));
  useEffect(() => {
    const back = () => setWhere(whereFrom(location.pathname));
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, []);
  // Going from one moment to the next replaces the address, so the browser's back is the list, as Back is.
  const go = (to: Where, replace = false) => {
    history[replace ? "replaceState" : "pushState"](null, "", pathOf(to));
    setWhere(to);
  };
  useEffect(() => void (document.title = "Moments · Playthrough"), []);
  return where.review ? <Change key={where.review} id={where.review} moment={where.moment ?? 1} go={go} /> : <List onOpen={(review, moment) => go({ review, moment })} />;
}

// Your notes on a change not yet sent, kept in this browser until you leave it.
const unsentKey = (review: string) => `playthrough:moments:${review}`;
function unsentOf(review: string): Note[] {
  try {
    return JSON.parse(localStorage.getItem(unsentKey(review)) ?? "[]");
  } catch {
    return [];
  }
}
function keepUnsent(review: string, notes: Note[]) {
  try {
    if (notes.length) localStorage.setItem(unsentKey(review), JSON.stringify(notes));
    else localStorage.removeItem(unsentKey(review));
  } catch {}
}

// What's waiting on you: a change has a finished recording of moments and isn't accepted.
const latestOf = (review: Review): Round | undefined => review.rounds.findLast((round) => round.number > 0 && !!round.finished && round.scenes.length > 0);
const sentBy = (review: Review, you: string) => review.sends.filter((one) => one.by === you);

// Leaving a change sends what you said on it, all at once, as Send does.
async function sendUnsent(review: Review, you: string): Promise<string[]> {
  const notes = unsentOf(review.id);
  const round = latestOf(review);
  if (!notes.length || !round) return [];
  const problems = await send(review.id, { id: newId(), round: round.number, by: you, sent: new Date().toISOString(), notes, verdicts: [], looksGood: [] });
  if (!problems.length) keepUnsent(review.id, []);
  return problems;
}

function List({ onOpen }: { onOpen: (review: string, moment: number) => void }) {
  const you = useYou();
  const [reviews, setReviews] = useState<Review[]>();
  // What couldn't be sent, by change: kept, and said so.
  const [unsent, setUnsent] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!you) return;
    let current = true;
    const load = () => fetch("/api/reviews").then((answer) => answer.json() as Promise<Review[]>);
    load()
      .then(async (all) => {
        const tried = await Promise.all(all.map(async (review) => [review.id, await sendUnsent(review, you)] as const));
        const failed = Object.fromEntries(tried.filter(([, problems]) => problems.length));
        const sent = tried.some(([id, problems]) => !problems.length && all.some((review) => review.id === id));
        return { all: sent ? await load() : all, failed };
      })
      .then(({ all, failed }) => current && (setReviews(all), setUnsent(failed)));
    return () => void (current = false);
  }, [you]);
  const waiting = (reviews ?? []).filter((review) => !review.accepted && latestOf(review));
  return (
    <div className="min-h-dvh bg-ground">
      <main className="mx-auto max-w-[680px] px-6 pt-14 pb-24 phone:px-4 phone:pt-8">
        <h1 className="px-3 text-[13px] leading-5 font-semibold text-soft">Waiting on you</h1>
        {reviews && !waiting.length && <p className="mt-6 text-soft">Nothing is waiting on you.</p>}
        {waiting.map((review) => (
          <ChangeInList key={review.id} review={review} you={you ?? ""} problems={unsent[review.id]} onOpen={(moment) => onOpen(review.id, moment)} />
        ))}
      </main>
    </div>
  );
}

function ChangeInList({ review, you, problems, onOpen }: { review: Review; you: string; problems?: string[]; onOpen: (moment: number) => void }) {
  const round = latestOf(review)!;
  const sent = sentBy(review, you);
  const kept = unsentOf(review.id);
  const last = sent.at(-1);
  const taken = last && review.taken.some((one) => one.send === last.id);
  return (
    <section className="mt-6 first-of-type:mt-5">
      <h2 className="px-3 text-[15px] leading-[22px] font-semibold text-fg">{review.title}</h2>
      <p className="mt-0.5 min-h-5 px-3 text-[13px] leading-5 text-soft">
        {problems?.length ? (
          <span className="text-amber-ink">Kept, not sent yet: {problems[0]}</span>
        ) : kept.length ? (
          <span>Kept, not sent yet</span>
        ) : last ? (
          <span>{taken ? `The agent has your notes, sent at ${clock(last.sent)}` : `Your notes went to the agent at ${clock(last.sent)}`}</span>
        ) : (
          <span>{round.scenes.length === 1 ? "One moment" : `${round.scenes.length} moments`}</span>
        )}
      </p>
      <ol className="mt-2">
        {round.scenes.map((scene, i) => {
          const said = [...sent.flatMap((one) => one.notes.filter((note) => note.on?.scene === scene.name)).map((note) => ({ note, sent: true })), ...kept.filter((note) => note.on?.scene === scene.name).map((note) => ({ note, sent: false }))];
          return (
            <li key={scene.name}>
              <button onClick={() => onOpen(i + 1)} className="grid w-full grid-cols-[16px_minmax(0,1fr)] gap-x-2 rounded-lg px-3 py-2 text-left transition-colors duration-150 ease-calm hover:bg-hover focus-visible:bg-hover">
                <span className="pt-[7px] text-center">
                  <i className="block size-1.5 justify-self-center rounded-full bg-track" />
                </span>
                <span className="text-[14px] leading-[21px] text-fg">{scene.name}</span>
                {said.map(({ note, sent }) => (
                  <span key={note.id} className="col-start-2 mt-1 flex items-baseline gap-2 text-[13px] leading-5 text-soft">
                    <i className={`size-1.5 flex-none translate-y-[-1px] rounded-full ${sent ? "bg-slate" : "bg-amber"}`} />
                    <span className="min-w-0">{note.words}</span>
                  </span>
                ))}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// Each moment's thing it's about, as `playthrough moment` keeps it, by its words.
type About = { words: string; about?: { role: string; name: string } };

function Change({ id, moment, go }: { id: string; moment: number; go: (to: Where, replace?: boolean) => void }) {
  const { review } = useReview(id);
  const you = useYou();
  const [abouts, setAbouts] = useState<About[]>([]);
  useEffect(() => void fetch(`/api/reviews/${encodeURIComponent(id)}/moments`).then((answer) => (answer.ok ? answer.json() : []), () => []).then(setAbouts), [id]);
  const [notes, setNotesNow] = useState(() => unsentOf(id));
  const setNotes = (change: (notes: Note[]) => Note[]) =>
    setNotesNow((now) => {
      const next = change(now);
      keepUnsent(id, next);
      return next;
    });
  if (!review || Array.isArray(review) || !you) return <div className="h-dvh bg-ground" />;
  const round = latestOf(review);
  if (!round) return <div className="grid h-dvh place-items-center bg-ground text-soft">Nothing is waiting on you here.</div>;
  const n = Math.min(moment, round.scenes.length);
  const sent = sentBy(review, you).flatMap((one) => one.notes);
  return (
    <MomentView
      key={`${round.number}`}
      review={review}
      round={round}
      n={n}
      about={abouts.find((one) => one.words === round.scenes[n - 1]!.name)?.about}
      notes={notes}
      sent={sent}
      setNotes={setNotes}
      onMoment={(to) => go({ review: id, moment: to }, true)}
      onLeave={() => go({})}
    />
  );
}

type Live = { scene: string; address?: string; shown: boolean; settled?: boolean; problems?: string[]; at?: { x: number; y: number } };
type Writing = { note: Note; spot: { x: number; y: number } };

function MomentView(props: {
  review: Review;
  round: Round;
  n: number;
  about?: { role: string; name: string };
  notes: Note[];
  sent: Note[];
  setNotes: (change: (notes: Note[]) => Note[]) => void;
  onMoment: (n: number) => void;
  onLeave: () => void;
}) {
  const { review, round, n, about, notes, sent, setNotes, onMoment, onLeave } = props;
  const scene = round.scenes[n - 1]!;
  const count = round.scenes.length;
  const end = Math.max(0, scene.length - 0.05);
  const [readings, setReadings] = useState<Reading[]>();
  const [glimpsed, setGlimpsed] = useState<Glimpse[]>();
  useEffect(() => {
    let current = true;
    setReadings(undefined);
    setGlimpsed(undefined);
    readingsOf(review.id, round.number, scene.recording).then((read) => current && setReadings(read));
    glimpses(review.id, round.number, scene.recording).then((read) => current && setGlimpsed(read));
    return () => void (current = false);
  }, [scene.recording]);
  // The others are fetched as this one opens, so going on to the next is as quick as the first.
  useEffect(() => {
    for (const other of round.scenes) {
      void recording(review.id, round.number, other.recording).catch(() => {});
      new Image().src = picture(review.id, round.number, other.recording, Math.max(0, other.steps.length - 1));
    }
  }, [round]);
  const screen = readings?.at(-1)?.screen ?? { width: 1280, height: 800 };
  const cut = useCut(review.id, round.number, scene);
  const [clockOf] = useState(() => new Clock(end));
  const [playing, setPlaying] = useState<{ until: number }>();
  const [noting, setNoting] = useState(false);
  const [writing, setWriting] = useState<Writing>();
  const [open, setOpen] = useState<string>();
  const [placed, setPlaced] = useState<Placed>({});
  const [live, setLive] = useState<Live>();
  const scrolled = useRef<(() => Scrolled) | undefined>(undefined);
  const frame = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const pill = useRef<HTMLSpanElement>(null);
  const [aiming, setAiming] = useState(false);
  // What you did in the app, recorded from when it was handed to you, for a note made there to be on.
  const session = useRef<{ id: string; events: { timestamp: number }[]; did: Did[]; kept: number }>({ id: newId(), events: [], did: [], kept: 0 });

  // Going to another moment, everything about this one is let go of.
  useEffect(() => {
    setPlaying(undefined);
    setNoting(false);
    setWriting(undefined);
    setOpen(undefined);
    setPlaced({});
    setLive(undefined);
    clockOf.set(end);
  }, [n]);

  const inApp = !!live?.shown && !!live.settled && !!live.address;
  const stepping = !!live?.shown && !inApp;
  const person = scene.person;

  const play = () => {
    if (live?.shown || writing) return;
    setOpen(undefined);
    setNoting(false);
    if (playing || !cut) return setPlaying(undefined);
    // The few seconds that led here, with waiting cut short, and it rests where it was.
    clockOf.set(cut.real(Math.max(0, cut.length - LEADING)));
    setPlaying({ until: end });
  };
  const stepIn = () => {
    if (live?.shown) return back();
    const paused = pausedAt(scene, end);
    if (!paused || writing) return;
    setPlaying(undefined);
    setOpen(undefined);
    setNoting(false);
    if (live?.address && live.scene === scene.name) return setLive({ ...live, shown: true, at: undefined });
    session.current = { id: newId(), events: [], did: [], kept: 0 };
    setLive({ scene: scene.name, shown: true });
    readyAt(review.id, scene.name, paused).then((answer) =>
      setLive((now) => (now?.scene !== scene.name ? now : typeof answer === "string" ? { ...now, address: answer } : { ...now, problems: answer, shown: false })),
    );
  };
  const back = (at?: { x: number; y: number }) => {
    setNoting(false);
    setLive((now) => now && { ...now, shown: false, at });
    window.focus();
  };
  const note = () => {
    if (writing || stepping) return;
    setPlaying(undefined);
    setOpen(undefined);
    setNoting((now) => !now);
  };
  const next = (by: number) => {
    if (writing || live?.shown) return;
    const to = n + by;
    if (to < 1) return;
    if (to > count) return onLeave();
    onMoment(to);
  };

  // In the app, noting goes there: it rings what's under the pointer and tells what's clicked.
  useEffect(() => {
    document.querySelector<HTMLIFrameElement>("[data-live] iframe")?.contentWindow?.postMessage({ playthrough: "noting", on: noting && inApp }, "*");
  }, [noting, inApp]);
  const heard = useRef<(data: any) => void>(() => {});
  heard.current = async (data) => {
    if (data.playthrough === "settled") setLive((now) => now && { ...now, settled: true });
    if (data.playthrough === "escape") noting ? setNoting(false) : back({ x: data.x, y: data.y });
    if (data.playthrough === "note") note();
    if (data.playthrough === "recorded") session.current.events.push(...data.events);
    if (data.playthrough === "did") session.current.did = data.did;
    if (data.playthrough === "noted") {
      setNoting(false);
      const iframe = document.querySelector<HTMLIFrameElement>("[data-live] iframe");
      const shown = frame.current?.getBoundingClientRect();
      const box = iframe?.getBoundingClientRect();
      const kept = session.current;
      if (!iframe || !box || !shown || !kept.events.length) return;
      kept.did = data.did;
      const from = { scene: scene.name, at: Math.round(end * 100) / 100 };
      const file = `${kept.id}-${++kept.kept}.json`;
      const now = { type: 5, data: { tag: "now", payload: {} }, timestamp: kept.events.at(-1)!.timestamp };
      const length = await keepBranch(review.id, round.number, from, [...kept.events, now], file);
      if (typeof length !== "number") return setLive((live) => live && { ...live, problems: length });
      const spot = { x: box.left - shown.left + (data.x * box.width) / iframe.offsetWidth, y: box.top - shown.top + (data.y * box.height) / iframe.offsetHeight };
      const on: Place = { scene: scene.name, at: Math.floor(length * 100) / 100, ...(data.element ? { element: data.element } : data.point && { point: data.point }), app: { from, did: data.did, recording: `branches/${file}`, length } };
      setWriting({ note: { id: newId(), on, words: "" }, spot });
    }
  };
  useEffect(() => {
    const told = ({ data, source }: MessageEvent) => {
      const app = document.querySelector<HTMLIFrameElement>("[data-live] iframe")?.contentWindow;
      if (data?.playthrough && source === app) heard.current(data);
    };
    addEventListener("message", told);
    return () => removeEventListener("message", told);
  }, []);

  // Saved, a note made in the app shows there as a pin on what it's on.
  const pinInApp = (note: Note, number: number) =>
    document.querySelector<HTMLIFrameElement>("[data-live] iframe")?.contentWindow?.postMessage({ playthrough: "pin", id: note.id, number, css: note.on?.element?.css, point: note.on?.point }, "*");
  const save = (words: string) => {
    if (!writing) return;
    const kept = { ...writing.note, words };
    setNotes((all) => [...all, kept]);
    setWriting(undefined);
    if (kept.on?.app && inApp) pinInApp(kept, mine.length + 1);
  };

  // The keys: Space plays, T steps in and back, N notes, ↓ and ↑ go a moment on and back, Escape lets go.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    const typing = event.target instanceof HTMLElement && event.target.closest("textarea, input, [contenteditable]");
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (open) setOpen(undefined);
      else if (noting) setNoting(false);
      else if (live?.shown) back();
      return;
    }
    if (live?.shown && !/^(t|n)$/.test(key)) return;
    const did = { " ": play, t: stepIn, n: note, arrowdown: () => next(1), arrowright: () => next(1), j: () => next(1), arrowup: () => next(-1), arrowleft: () => next(-1), k: () => next(-1) }[key];
    if (!did || event.repeat) return;
    event.preventDefault();
    did();
  };
  useEffect(() => {
    const down = (event: KeyboardEvent) => keys.current(event);
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, []);
  // The wheel goes a moment at a time: one turn, a notch or a swipe, is one moment, and the next waits for it to end.
  const wheel = useRef({ sum: 0, quiet: 0, spent: false });
  const onWheel = (event: React.WheelEvent) => {
    if (writing || live?.shown) return;
    const it = wheel.current;
    clearTimeout(it.quiet);
    it.quiet = window.setTimeout(() => (wheel.current = { sum: 0, quiet: 0, spent: false }), 220);
    if (it.spent) return;
    it.sum += event.deltaY;
    if (Math.abs(it.sum) < 30) return;
    it.spent = true;
    next(it.sum > 0 ? 1 : -1);
  };

  // What you said on this moment, unsent and sent, each a pin on what it's on; and the thing the moment is about.
  const mine = notes.filter((one) => one.on?.scene === scene.name);
  const theirs = sent.filter((one) => one.on?.scene === scene.name);
  const shownNotes = [...theirs.map((note) => ({ note, sent: true })), ...mine.map((note) => ({ note, sent: false })), ...(writing ? [{ note: writing.note, sent: false }] : [])];
  // A thing on the moment's page by its role and name, as it was read there: what it's about, or what a note made in
  // the app is on, as the app numbers its things anew.
  const nodeOf = (named?: { role: string; name: string }) => named && readings?.at(-1)?.things.find((thing) => thing.role === named.role && thing.name === named.name)?.node;
  const markOf = (note: Note): Mark => {
    const on = note.on;
    const element = on?.element;
    const node = on?.app ? nodeOf(element) : element?.node;
    return { id: note.id, ...(element && { name: element.name, ...(node !== undefined && { node }) }), ...(on?.point && { point: on.point }) };
  };
  const aboutNode = nodeOf(about);
  const marks: Mark[] = [...(aboutNode !== undefined ? [{ id: ABOUT, node: aboutNode }] : []), ...shownNotes.map(({ note }) => markOf(note))];
  const pins: Pin[] = shownNotes.map(({ note, sent }) => ({ id: note.id, on: [note.id], ink: sent ? "var(--slate)" : "var(--amber)", fill: sent ? "bg-slate" : "bg-amber" }));
  const aboutAt = !playing && !live?.shown ? placed[ABOUT] : undefined;
  const openNote = shownNotes.find(({ note }) => note.id === open);

  // Beside your pointer, what a click on the moment does: note what's under it, or step in.
  const onFrame = !playing && !live?.shown && !writing && !open;
  const movePill = (event: React.PointerEvent) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    pointer.current = { x: event.clientX - box.left, y: event.clientY - box.top };
    if (pill.current) pill.current.style.transform = `translate(${pointer.current.x - 3}px, ${pointer.current.y - 2}px)`;
  };

  return (
    <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden bg-ground px-6 phone:px-4" onWheel={onWheel}>
      <header className="flex h-12 min-w-0 items-center gap-3">
        <button onClick={onLeave} className="-ml-2 flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg">
          <svg viewBox="0 0 12 12" className="size-3 flex-none" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7.5 2.5L4 6l3.5 3.5" />
          </svg>
          <span className="truncate">{review.title}</span>
        </button>
        <button onClick={() => next(1)} disabled={!!live?.shown || !!writing} className="-mr-2 ml-auto flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm enabled:hover:bg-hover enabled:hover:text-fg disabled:opacity-50">
          {n < count ? "Next" : "Done"}
          <Key>↓</Key>
        </button>
      </header>
      {/* Who and where, in the agent's words: room for two lines, three on a phone, so nothing under it moves. */}
      <p className="line-clamp-2 h-[44px] text-[15px] leading-[22px] text-fg phone:line-clamp-3 phone:h-[66px]" title={scene.name}>
        {scene.name}
      </p>
      <div className="relative mt-2 grid min-h-0 place-items-center [container-type:size]">
        <div
          ref={frame}
          className="relative overflow-visible rounded-lg"
          style={{ aspectRatio: `${screen.width} / ${screen.height}`, width: `min(100cqw, calc(100cqh * ${screen.width / screen.height}))` }}
          onPointerMove={(event) => (movePill(event), aiming || setAiming(true))}
          onPointerLeave={() => setAiming(false)}
        >
          <div key={scene.recording} className="absolute inset-0 animate-arrive overflow-hidden rounded-lg bg-paper shadow-frame" onClick={(event) => onFrame && !noting && !(event.target as Element).closest("button") && stepIn()}>
            <Picture shot={{ src: picture(review.id, round.number, scene.recording, Math.max(0, scene.steps.length - 1)) }} />
            <Player
              review={review.id}
              round={round.number}
              recording={scene.recording}
              at={end}
              playing={playing}
              cut={cut}
              clock={clockOf}
              onStop={() => setPlaying(undefined)}
              marks={marks}
              onMarks={setPlaced}
              things={noting && !live?.shown && !writing ? glimpsed : undefined}
              onPlace={
                noting && !live?.shown && !writing
                  ? (on) => {
                      setNoting(false);
                      setWriting({ note: { id: newId(), on: { scene: scene.name, at: end, ...on }, words: "" }, spot: { ...pointer.current } });
                    }
                  : undefined
              }
              scrolled={scrolled}
            />
            {aboutAt && (
              <div
                className="pointer-events-none absolute animate-arrive rounded-[4px] outline-[1.5px] outline-offset-4 outline-slate outline-solid"
                style={{ left: aboutAt.left, top: aboutAt.top, width: aboutAt.width, height: aboutAt.height }}
              />
            )}
            <Pinned pins={pins} placed={placed} open={open ?? writing?.note.id} faded={!!playing || !!live?.shown} onOpen={(id) => (setNoting(false), setOpen(id))} />
          </div>
          <Portal live={live && { ...live, inApp }} person={person} screen={screen} scrolled={() => scrolled.current?.()} waiting="Stepping in…" />
          <span ref={pill} aria-hidden className={`pointer-events-none absolute top-0 left-0 z-30 transition-opacity duration-150 ease-calm ${onFrame && aiming ? "" : "opacity-0"}`}>
            <span className={TAG}>{noting ? "Note on this" : person ? `Step in as ${person}` : "Step in"}</span>
          </span>
          {writing && <NoteCard at={(!writing.note.on?.app && pinOf(placed[writing.note.id])) || writing.spot} frame={frame}><Write onSave={save} onDrop={() => setWriting(undefined)} /></NoteCard>}
          {!writing && openNote && (
            <NoteCard at={pinOf(placed[openNote.note.id]) ?? { x: 24, y: 24 }} frame={frame}>
              <p className="px-1 text-[13px] leading-5 whitespace-pre-wrap text-fg">{openNote.note.words}</p>
              <div className="mt-2 flex items-center gap-2 px-1 text-xs text-soft">
                <span>{openNote.sent ? "Sent to the agent" : "Sent when you leave"}</span>
                {!openNote.sent && (
                  <button className="ml-auto rounded-md px-1.5 py-0.5 hover:bg-hover hover:text-fg" onClick={() => (setNotes((all) => all.filter((one) => one.id !== openNote.note.id)), setOpen(undefined))}>
                    Remove
                  </button>
                )}
              </div>
            </NoteCard>
          )}
        </div>
        {live?.problems && <p className="absolute bottom-0 left-1/2 max-w-[90%] -translate-x-1/2 translate-y-full rounded-md bg-surface px-3 py-1.5 text-xs text-amber-ink shadow-tip">{live.problems.join(" ")}</p>}
      </div>
      <div className="flex h-16 items-center justify-center">
        <div role="toolbar" aria-label="This moment" onClick={(event) => (event.target as Element).closest("button")?.blur()} className={`flex gap-0.5 rounded-xl bg-surface p-1 text-[13px] select-none ${inApp ? "shadow-[0_0_0_1.5px_rgba(236,178,72,0.95),0_6px_20px_rgba(20,24,34,0.12)]" : "shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]"}`}>
          <button className={`${ITEM}`} disabled={!!live?.shown || !cut} aria-pressed={!!playing} onClick={play}>
            Play <Key className="min-w-9">Space</Key>
          </button>
          <button className={`${ITEM} w-[116px]`} disabled={!!writing} aria-pressed={stepping} onClick={stepIn}>
            {inApp ? "Back" : stepping ? "Stepping in…" : "Step in"} {!stepping && <Key>{inApp ? "Esc" : "T"}</Key>}
          </button>
          <button className={`${ITEM}`} disabled={stepping || !!writing} aria-pressed={noting} onClick={note}>
            Note <Key>N</Key>
          </button>
        </div>
      </div>
    </div>
  );
}

const ITEM =
  "inline-flex items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 whitespace-nowrap text-fg transition-colors duration-150 ease-calm enabled:hover:bg-hover disabled:cursor-default disabled:opacity-50 aria-pressed:bg-hover [&_kbd]:text-[color-mix(in_srgb,var(--faint)_55%,var(--soft))]";
// How many seconds of a moment Play shows, waiting cut short.
const LEADING = 7;
const ABOUT = "about";

// Where a note's pin is on what it's on, as Pinned puts it: just outside its top right corner.
const pinOf = (thing: Placed[string]) => thing && { x: thing.left + thing.width + 14, y: thing.top - 14 };

// A card by a spot on the moment: beside it where there's room, never past the frame's sides.
function NoteCard({ at, frame, children }: { at: { x: number; y: number }; frame: React.RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const wide = frame.current?.clientWidth ?? 0;
  const width = Math.min(280, wide - 16);
  const left = at.x + 18 + width <= wide ? at.x + 18 : Math.max(8, at.x - 18 - width);
  return (
    <div className="absolute z-40 animate-arrive rounded-xl bg-surface p-2 shadow-float" style={{ left, top: Math.max(8, at.y - 12), width }} onClick={(event) => event.stopPropagation()}>
      {children}
    </div>
  );
}

// Writing a note: Enter keeps it, Shift+Enter is a new line, Escape lets it go.
function Write({ onSave, onDrop }: { onSave: (words: string) => void; onDrop: () => void }) {
  const [words, setWords] = useState("");
  return (
    <div>
      <textarea
        autoFocus
        rows={3}
        value={words}
        placeholder="What's right or wrong here?"
        className="block w-full resize-none rounded-lg bg-transparent px-1 py-0.5 text-[13px] leading-5 text-fg outline-none placeholder:text-faint"
        onChange={(event) => setWords(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") return (event.stopPropagation(), onDrop());
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (words.trim()) onSave(words.trim());
          }
        }}
      />
      <div className="mt-1 flex items-center justify-end gap-1 text-xs">
        <button className="rounded-md px-2 py-1 text-soft hover:bg-hover hover:text-fg" onClick={onDrop}>
          Cancel
        </button>
        <button className="rounded-md px-2 py-1 font-medium text-fg enabled:hover:bg-hover disabled:opacity-50" disabled={!words.trim()} onClick={() => onSave(words.trim())}>
          Keep <Key>↵</Key>
        </button>
      </div>
    </div>
  );
}
