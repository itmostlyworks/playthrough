// A moment's page: the recording as large as the window lets it be, the bar across its foot, the change's moments on
// the left and this one's notes on the right. From here: play the few seconds that led here, step in (the real app
// there, as that person), note what you click, compare with how it was when you last saw it, or go on.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import { conversation, isStill, madeInApp, newId, together, type Note, type Review, type Round, type Scene } from "@playthrough/review";
import { glimpses, picture, readings as readingsOf, recording } from "./api.ts";
import { clamp } from "./clamp.ts";
import { CHIP, playedTogether } from "./compare.ts";
import { Edge, Tile } from "./Edge.tsx";
import type { YourReply } from "./kept.ts";
import { Key } from "./Key.tsx";
import { arrived, can, isPlaying, isStepped, reduce, type Action } from "./mode.ts";
import { Progress, Getting, ITEM, BAR } from "./MomentBar.tsx";
import { Turns, useFrames, NoteWords, NotePicture, NoteCard, Write, type Made } from "./Note.tsx";
import { usePhone } from "./phone.ts";
import { Picture } from "./Picture.tsx";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Clock, Player, useCut, type Mark, type Placed } from "./Player.tsx";
import { Portal, TAG } from "./Portal.tsx";
import type { Rect, Scrolled } from "./replay.ts";
import { SendButton, tick, FILLED_KEY, SAID, useSend } from "./Send.tsx";
import { toSend, noteSays, takingOf, seenOf } from "./standing.ts";
import { useStepIn } from "./stepIn.ts";
import { closeOn, aboutBox, StillPicture } from "./Still.tsx";
import type { Together } from "./view.ts";

// How long what you did takes to fade out, back to the moment.
const FADING = 300;

// Where a moment's recording ends, and where what's shown of it starts.
const endOf = (scene: Scene) => Math.max(0, scene.length - 0.05);
const startOf = (scene: Scene) => Math.min(scene.from, endOf(scene));

export function MomentView(props: {
  review: Review;
  round: Round;
  n: number;
  about?: { role: string; name: string };
  who: string;
  notes: Note[];
  sent: Note[];
  setNotes: (change: (notes: Note[]) => Note[]) => void;
  replies: YourReply[];
  setReplies: (change: (replies: YourReply[]) => YourReply[]) => void;
  you: string;
  // A note to open as the moment opens, pressed on the list.
  opening?: string;
  onMoment: (n: number) => void;
  onLeave: () => void;
}) {
  const { review, round, n, about, who, notes, setNotes, replies, setReplies, you, onMoment, onLeave } = props;
  // Send, here as on the list: everything unsent on the change goes. Sent, it says so where you pressed, and what was
  // sent is drawn as sent at once, as the change comes back with it.
  const { sending, send, again } = useSend(review.id, round.number, you);
  const [justSent, setJustSent] = useState<Note[]>([]);
  const sent = [...props.sent, ...justSent.filter((note) => !props.sent.some((one) => one.id === note.id))];
  const unsent = notes.length + replies.length;
  const sendNow = async () => {
    if (!unsent || sending === "sending") return;
    const going = notes;
    await send({ notes: going, replies }, () => setJustSent((now) => [...now, ...going]));
  };
  useEffect(() => {
    if (sending !== "sent") return;
    const done = setTimeout(again, SAID + 1000);
    return () => clearTimeout(done);
  }, [sending]);
  const scene = round.scenes[n - 1]!;
  const count = round.scenes.length;
  const end = endOf(scene);
  const from = startOf(scene);
  const still = isStill(scene);
  // Read from this moment's recording, and only ever drawn on it: another moment's is nothing here.
  const [read, setRead] = useState<{ recording: string; readings?: Reading[]; glimpsed?: Glimpse[] }>();
  const readings = read?.recording === scene.recording ? read.readings : undefined;
  const glimpsed = read?.recording === scene.recording ? read.glimpsed : undefined;
  useEffect(() => {
    let current = true;
    const kept = (more: { readings?: Reading[]; glimpsed?: Glimpse[] }) => current && setRead((now) => ({ ...(now?.recording === scene.recording && now), recording: scene.recording, ...more }));
    readingsOf(review.id, round.number, scene.recording).then((readings) => kept({ readings }));
    glimpses(review.id, round.number, scene.recording).then((glimpsed) => kept({ glimpsed }));
    return () => void (current = false);
  }, [scene.recording]);
  // The others are fetched as this one opens, so going on to the next is as quick as the first.
  useEffect(() => {
    for (const other of round.scenes) {
      void recording(review.id, round.number, other.recording).catch(() => {});
      new Image().src = picture(review.id, round.number, other.recording, Math.max(0, other.steps.length - 1));
    }
  }, [round]);
  // The recording's shape, kept from one moment to the next until the next's is known, so the recording never changes
  // size as you go from one to another.
  const [screen, setScreen] = useState({ width: 1280, height: 800 });
  const shape = readings?.at(-1)?.screen;
  useEffect(() => void (shape && (shape.width !== screen.width || shape.height !== screen.height) && setScreen(shape)), [shape?.width, shape?.height]);
  // On a phone, the whole screen is too small to read: it's closed in on what the moment is about, as its still is.
  const phone = usePhone();
  const closeTo = about ?? scene.acted;
  const closer = useMemo(() => (phone ? closeOn(readings?.at(-1), closeTo, screen.width / screen.height) : undefined), [phone, readings, closeTo?.role, closeTo?.name]);
  const cut = useCut(review.id, round.number, scene);
  const [clockOf] = useState(() => new Clock(end));
  const [bothOf] = useState(() => new Clock(0));
  // What the page is doing, one thing at a time, and where the recording rests. Every press is an action, carrying
  // where the recording has got to. It opens at the moment's end, with a note open where one was pressed on the list,
  // on this moment; another moment, going to it is an action too, so nothing of this one is drawn there.
  const [page, setPage] = useState(() => arrived(scene.name, from, end, [...props.sent, ...notes].some((one) => one.id === props.opening && one.on?.scene === scene.name) ? props.opening : undefined));
  // Come to another moment other than by going to it here, it's arrived at as it would have been, before it's drawn.
  if (page.scene !== scene.name) setPage(arrived(scene.name, from, end));
  // An action from a moment left behind, as the app answering late, changes nothing on this one.
  const act = (action: Action) => {
    const now = { now: clockOf.at, along: bothOf.at };
    setPage((was) => (action.type === "moment" || was.scene === scene.name ? reduce(was, { ...action, ...now }) : was));
  };
  const { mode, at } = page;
  // The clock is where the recording rests, and only playing moves it: what plays starts from it.
  const wasPlaying = useRef(false);
  useLayoutEffect(() => {
    if (!(wasPlaying.current && isPlaying(mode))) clockOf.set(at);
    wasPlaying.current = isPlaying(mode);
  }, [page]);
  const playing = mode.is === "playing" ? mode : mode.is === "comparing" ? mode.playing : undefined;
  const comparing = mode.is === "comparing";
  const open = mode.is === "a note open" ? mode.note : undefined;
  const writing = mode.is === "writing" || mode.is === "the app yours" ? mode.writing : undefined;
  // Pointing at what a note is on, on the recording or in the app.
  const noting = mode.is === "pointing" || (mode.is === "the app yours" && !!mode.pointing);
  const away = isStepped(mode);
  const inApp = mode.is === "the app yours";
  const stepping = mode.is === "getting there";
  // Compare: this moment as it was when you last looked at it, before this hand-back, beside how it is now, played
  // together. Offered only where there's such a look; where nothing differs since, the bar says so instead. Any moment
  // of the change with a look keeps the bar four wide for every one, so it never changes width going from one to the next.
  const [looked] = useState(() => seenOf(review, you));
  const lastLook = (one: Scene) => {
    const earlier = review.rounds.findLast((kept) => kept.number > 0 && kept.number < round.number && kept.finished && looked.includes(takingOf(kept.number, one.name)) && kept.scenes.some((taken) => taken.name === one.name));
    const kept = earlier?.scenes.find((taken) => taken.name === one.name);
    return earlier && kept ? { round: earlier, scene: kept } : undefined;
  };
  const anyLook = round.scenes.some((one) => lastLook(one));
  const looking = lastLook(scene);
  const compared = looking && review.comparisons.find((one) => one.round === round.number && one.since === looking.round.number);
  const unchanged = !!compared && !compared.changes.some((change) => change.seen.some((seen) => seen.scene === scene.name));
  const then = unchanged ? undefined : looking;
  const both = useMemo(() => then && cut && playedTogether(cut, together(scene, then.scene)), [cut, then?.scene.recording, scene.recording]);
  // Each side at actual size, a window onto the same part of the page, following now's pointer, as the older page's are.
  const [{ leading, beside }] = useState(() => {
    const samePart: Together = {};
    return { leading: { together: samePart, leads: true }, beside: { together: samePart, leads: false } };
  });
  // How far along both it rests: where now first is, or where it was let go, as now held while the other went on.
  const along = (both && page.along) ?? both?.of(at) ?? 0;
  const atPoint = !playing && at >= end - 0.02;
  // How far through what's shown it is, waiting cut short, as Play's line counts it.
  const shareOf = (moment: number) => (cut ? clamp((cut.cut(moment) - cut.cut(from)) / Math.max(0.01, cut.cut(end) - cut.cut(from))) : 1);
  // Where the moment's marks are on it, once its recording has said.
  const [placedOn, setPlaced] = useState<{ recording: string; placed?: Placed }>();
  const placed = placedOn?.recording === scene.recording ? placedOn.placed : undefined;
  // A note's pin on the recording and its picture on the edge are one thing: pointing at either lights both. A pin
  // pointed at says its note right there, as its picture does, after a breath, so passing over one says nothing.
  const [pointed, setPointed] = useState<string>();
  const [saying, setSaying] = useState<string>();
  const sayingAfter = useRef(0);
  const pointPin = (id?: string) => {
    setPointed(id);
    clearTimeout(sayingAfter.current);
    if (!id) return setSaying(undefined);
    sayingAfter.current = window.setTimeout(() => setSaying(id), 120);
  };
  // Played compared, both sides go together, each as far as the other along what both did.
  useEffect(() => {
    if (!comparing || !playing || !both) return;
    const [start, until, since] = [clockOf.at === at ? along : both.of(clockOf.at), both.of(playing.until), performance.now()];
    let frameId = 0;
    const tick = () => {
      const going = Math.min(until, start + (performance.now() - since) / 1000);
      bothOf.set(going);
      clockOf.set(both.at(going)[0]);
      if (going >= until) return act({ type: "played" });
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [comparing, playing, both]);
  const scrolled = useRef<(() => Scrolled) | undefined>(undefined);
  // The recording's pointer, and whether the app's stands in for it.
  const drawn = useRef<(() => { x: number; y: number } | undefined) | undefined>(undefined);
  const [standIn, setStandIn] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const pill = useRef<HTMLSpanElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [aiming, setAiming] = useState(false);
  const stepIn = useStepIn({ review: review.id, round: round.number, scene, page, clock: clockOf, act, pointing: () => note() });

  // Going to another moment, the one you were on stays under the new one until it has come in over it.
  const [behind, setBehind] = useState<string>();
  const was = useRef(scene);
  if (was.current !== scene) {
    if (was.current.recording !== scene.recording && !phone && !matchMedia("(prefers-reduced-motion: reduce)").matches) setBehind(picture(review.id, round.number, was.current.recording, Math.max(0, was.current.steps.length - 1)));
    was.current = scene;
  }

  const person = scene.person;

  // What you said on this moment, sent and then unsent, in the order said: the edge's pictures, and the pins.
  const mine = notes.filter((one) => one.on?.scene === scene.name);
  const theirs = sent.filter((one) => one.on?.scene === scene.name);
  const said = [...theirs.map((note) => ({ note, sent: true })), ...mine.map((note) => ({ note, sent: false }))];
  const onEdge = said.filter(({ note }) => !stepIn.madeThere(note));
  // What was new as you came to this moment stays new here until you open it: coming counts as seeing it, for the list
  // and for next time.
  const newAsYouCame = useRef(new Map<string, Set<string>>());
  if (!newAsYouCame.current.has(scene.name)) newAsYouCame.current.set(scene.name, new Set(said.filter(({ note, sent }) => noteSays(review, you, note, sent, replies).fresh).map(({ note }) => note.id)));
  const [openedHere, setOpenedHere] = useState<string[]>([]);
  useEffect(() => void (open && !openedHere.includes(open) && setOpenedHere((now) => [...now, open])), [open]);
  const says = (note: Note, sent: boolean) => {
    const said = noteSays(review, you, note, sent, replies);
    const fresh = sent && said.stands !== "sent" && said.stands !== "reply not sent yet" && !!newAsYouCame.current.get(scene.name)?.has(note.id) && !openedHere.includes(note.id);
    return { ...said, fresh, stands: said.stands === "new answer" || said.stands === "answered" ? (fresh ? "new answer" : "answered") : said.stands };
  };
  const madeAt = ({ on }: Note): Made | undefined => {
    if (!on) return undefined;
    const thing = on.element?.node !== undefined ? { node: on.element.node } : on.point && { point: on.point };
    if (madeInApp(on)) return { round: on.round, recording: on.recording, at: Math.min(on.length, on.at), ...thing };
    const taking = review.rounds.find((one) => one.number === on.round)?.scenes.find((one) => one.name === on.scene);
    return taking && { round: on.round, recording: taking.recording, at: on.at ?? taking.length, ...thing };
  };
  // A note's element number is good only in the recording it was read from: this taking's, where it was made on it.
  const onThisTaking = (on: Note["on"]) => !!on && !madeInApp(on) && on.round === round.number;
  // A thing on the moment's page by its role and name, as it was read at its end.
  const nodeOf = (named?: { role: string; name: string }) => named && readings?.at(-1)?.things.find((thing) => thing.role === named.role && thing.name === named.name)?.node;
  // A note is shown on its thing as it is now wherever that thing is in the moment's picture now, found as its pin is;
  // only otherwise on the frame it was made on. Its picture on the edge and the note open both go by this.
  const nowOn = (note: Note) => {
    const node = onThisTaking(note.on) ? note.on?.element?.node : nodeOf(note.on?.element);
    return node !== undefined && readings?.at(-1)?.things.some((thing) => thing.node === node) ? node : undefined;
  };
  const shownAt = (note: Note): Made | undefined => {
    const node = nowOn(note);
    return node !== undefined ? { round: round.number, recording: scene.recording, at: scene.length, node } : madeAt(note);
  };
  const isNow = (shown?: Made) => !!shown && shown.round === round.number && shown.recording === scene.recording && Math.abs(shown.at - scene.length) < 0.1;
  const frames = useFrames(review, readings ? onEdge.map(({ note }) => ({ note, shown: shownAt(note) })) : []);
  // A note's pin is on the recording whenever its thing is in the picture: made on this taking, that very thing; made in
  // the app or on an earlier taking, the same thing drawn here, by its role and name. One on a spot is on this taking's
  // picture only where it was made.
  const markOf = (note: Note): Mark => {
    const on = note.on;
    const node = onThisTaking(on) ? on?.element?.node : nodeOf(on?.element);
    if (node !== undefined) return { id: note.id, node };
    if (onThisTaking(on) && on?.point && Math.abs((on.at ?? end) - at) < 0.06) return { id: note.id, point: on.point };
    return { id: note.id };
  };
  const aboutNode = nodeOf(about);
  // Compared, at the point, what the moment is about (else the last thing done) is in view whole, as on the older page.
  const closeNode = nodeOf(closeTo);
  // with its nearest words, as the line under a field, which is often what changed.
  const held = useMemo(() => {
    const end = readings?.at(-1);
    const box = end && aboutBox(end, closeTo);
    return box && { x: box.x / end.screen.width, y: box.y / end.screen.height, width: box.width / end.screen.width, height: box.height / end.screen.height };
  }, [readings, closeTo?.role, closeTo?.name]);
  const holdsAt = atPoint && held ? { id: ABOUT, box: held } : undefined;
  const pinned = [...onEdge, ...(writing ? [{ note: writing.note, sent: false }] : [])];
  const marks: Mark[] = [...(aboutNode !== undefined ? [{ id: ABOUT, node: aboutNode }] : []), ...pinned.map(({ note }) => markOf(note))];
  const pinFor = ({ note, sent }: { note: Note; sent: boolean }): Pin => ({ id: note.id, on: [note.id], ink: sent ? "var(--slate)" : "var(--amber)", fill: sent ? "bg-slate" : "bg-amber" });

  // A note open shows the frame it was made on, wherever that was, its pin on its thing and what's been said on it,
  // and nothing more. It fades in over the moment, and out again where it was.
  const opened = onEdge.find(({ note }) => note.id === open);
  const openMade = opened && shownAt(opened.note);
  // Its thing is in the moment's picture now: the moment, at its end, is where it's shown.
  const openNow = isNow(openMade);
  // Open on a frame of its own, not on the moment as it is now.
  const elsewhere = !!opened && !openNow;
  // Shown as it was before the agent last handed the moment back, the bar says so where Play would be.
  const asItWas = !!opened && !openNow && !!openMade && openMade.round < round.number;

  // What may be pressed now, which every key and button asks.
  const may = can(page, { still, ready: !!cut, compares: !!then, elsewhere });
  const play = () => may.play && act({ type: "play" });
  // A note open on a frame of its own shows somewhere the app can't be taken to: stepping in from it would swap the
  // picture for the moment's and open the app there. Closed, Step in answers again. In the app, it's Back.
  const stepInOrBack = () => (inApp ? may.back && stepIn.back() : may.stepIn && stepIn.stepIn());
  const back = () => may.back && stepIn.back();
  const note = () => may.note && act({ type: "note" });
  // Opened or closed, it stops where it's got to.
  const compare = () => {
    if (!may.compare) return;
    leading.together.centre = undefined;
    act({ type: "compare" });
  };
  const goTo = (to: number) => {
    const other = round.scenes[to - 1]!;
    act({ type: "moment", scene: other.name, starts: startOf(other), end: endOf(other) });
    onMoment(to);
  };
  const next = (by: number) => {
    if (!may.move) return;
    const to = n + by;
    if (to < 1) return;
    if (to > count) return onLeave();
    goTo(to);
  };
  const toMoment = (to: number) => may.move && to !== n && goTo(to);
  const openNote = (id: string) => may.move && act({ type: "open", note: id });
  const close = () => act({ type: "close" });
  const save = (words: string) => {
    if (!writing) return;
    const kept = { ...writing.note, words };
    setNotes((all) => [...all, kept]);
    act({ type: "written" });
    stepIn.saved(kept, mine.length + 1);
  };
  // Next goes through this moment's answers that were new as you came to it, one by one, before it goes on.
  const nextAnswer = may.move ? onEdge.find(({ note, sent }) => note.id !== open && says(note, sent).fresh) : undefined;
  const onward = () => (nextAnswer ? openNote(nextAnswer.note.id) : next(1));
  // The open note's frame over the moment, and the one before it while that fades: only ever this moment's.
  const [layered, setLayers] = useState<{ note: Note; sent: boolean; made: Made }[]>([]);
  const layers = layered.filter((one) => one.note.on?.scene === scene.name);
  // Where the recording on the open note's own frame has its thing, once it has said, and for which note.
  const [onFrame, setOnFrame] = useState<{ note: string; at?: Placed }>();
  const shut = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (opened && openNow && at < end - 0.02) act({ type: "rest", at: end });
    if (opened && openMade && !openNow) {
      setLayers((now) => [...now.filter((one) => one.note.id !== opened.note.id).slice(-1), { ...opened, made: openMade }]);
      // The one under it goes once the new one has come in over it.
      const settled = setTimeout(() => setLayers((now) => now.slice(-1)), FADING);
      return () => clearTimeout(settled);
    }
    if (!layered.length) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fading = calm ? undefined : shut.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADING, easing: "ease", fill: "forwards" });
    let current = true;
    void (fading?.finished ?? Promise.resolve()).then(() => current && (setLayers([]), setOnFrame(undefined)), () => {});
    return () => void ((current = false), fading?.cancel());
  }, [opened?.note.id, openNow]);
  const shownOpen = layers.at(-1);
  // On its picture, its thing is where the picture says, as the picture's drawn in the recording's room.
  const [, resized] = useState(0);
  useEffect(() => {
    if (!layers.length) return;
    const again = () => resized((n) => n + 1);
    addEventListener("resize", again);
    return () => removeEventListener("resize", again);
  }, [layers.length > 0]);
  const pictured = shownOpen && frames[shownOpen.note.id];
  const onPicture = ((): Placed | undefined => {
    const shown = stage.current;
    if (!shownOpen || !pictured || !shown) return undefined;
    const { screen, box } = pictured;
    if (!box) return {};
    const k = Math.min(shown.clientWidth / screen.width, shown.clientHeight / screen.height);
    const [left, top] = [(shown.clientWidth - screen.width * k) / 2, (shown.clientHeight - screen.height * k) / 2];
    return { [shownOpen.note.id]: { left: left + box.x * screen.width * k, top: top + box.y * screen.height * k, width: box.width * screen.width * k, height: box.height * screen.height * k } };
  })();
  // Where the open note's thing is, one answer however it's found, and none until it's known: on the moment as it is
  // now, by the recording; on its own frame, by its kept picture, or the recording there until that's drawn. Known,
  // and not there, it's on nothing.
  const openAt = opened && openNow ? placed : pictured ? onPicture : shownOpen && onFrame?.note === shownOpen.note.id ? onFrame.at : undefined;
  // What the bar must never cover: an open note's thing while it's open; else, from the first frame shown to the last,
  // what the moment is about and the last thing done in it, where the page has them at its end, known from its reading
  // before anything is drawn. The bar is one place: over one of them, it drops just below the recording's edge for that
  // moment, still in the middle, and that's all.
  const openThing = opened && openAt?.[opened.note.id];
  const kept = (() => {
    const shown = stage.current;
    const end = readings?.at(-1);
    if (!shown || !end || closer) return [];
    const k = Math.min(shown.clientWidth / end.screen.width, shown.clientHeight / end.screen.height);
    return [about, scene.acted].flatMap((named) => {
      const thing = named && end.things.find((one) => one.role === named.role && one.name === named.name);
      return thing ? [{ left: thing.box.x * k, top: thing.box.y * k, width: thing.box.width * k, height: thing.box.height * k }] : [];
    });
  })();
  // Until this moment's reading has come, the bar stays where it was; on the page's first moment, it waits unseen.
  const lastClear = useRef<{ x: number; y: number }>(undefined);
  const clear = !readings && !openThing ? lastClear.current : (lastClear.current = (() => {
    const [wide, high, barWide] = [stage.current?.clientWidth ?? 0, stage.current?.clientHeight ?? 0, toolbar.current?.offsetWidth ?? 0];
    const [left, right] = [(wide - barWide) / 2, (wide + barWide) / 2];
    const under = (openThing ? [openThing] : away || comparing ? [] : kept).filter((one) => one.top + one.height > high - BAR / 2 - 12);
    const covers = under.some((one) => one.left < right + 12 && one.left + one.width > left - 12);
    return { x: 0, y: covers ? BAR / 2 : 0 };
  })());
  // The note whose card shows: open on the moment as it is now, or on the frame it was made on, until that has faded.
  const carded = opened && openNow ? opened : shownOpen && (opened ? shownOpen.note.id === opened.note.id && shownOpen : !phone && shownOpen);
  // Its card comes in by its thing, so it waits until where that is is known: it never stands somewhere else first and
  // moves. Only a note that turns out to be on nothing stands in the corner.
  const corner = spotAt({ x: 24, y: 24 });
  const cardBy = !carded ? undefined : phone ? corner : openAt && (openAt[carded.note.id] ?? corner);
  // What it's about is outlined only at the point: midway, it may not be there yet.
  const aboutAt = atPoint && !away && !opened ? placed?.[ABOUT] : undefined;

  // Pressing away from what's open, anywhere but its card and its picture on the edge, closes it.
  const pressAway = (event: React.PointerEvent) => opened && !(event.target as Element).closest("[data-note-card], [data-tile]") && !stage.current?.contains(event.target as Node) && close();

  // The keys: Space plays, T steps in and back, N notes, C compares, ↑ and ↓ go a moment back and on, ← and → open this
  // moment's notes one after another, Escape lets go.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    const typing = event.target instanceof HTMLElement && event.target.closest("textarea, input, [contenteditable]");
    // A picture on an edge with the keyboard on it is pressed with Enter or Space, as any button is.
    if (event.target instanceof HTMLElement && event.target.closest("[data-tile]") && /^( |enter)$/i.test(event.key)) return;
    // Ctrl+Enter sends, as on the list.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !writing) return (event.preventDefault(), void sendNow());
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (open) close();
      else if (comparing) compare();
      else if (noting) act({ type: "note" });
      else back();
      return;
    }
    if ((key === "arrowleft" || key === "arrowright") && onEdge.length && may.move) {
      const i = onEdge.findIndex(({ note }) => note.id === open);
      const to = key === "arrowright" ? (i < 0 ? 0 : Math.min(onEdge.length - 1, i + 1)) : i < 0 ? onEdge.length - 1 : Math.max(0, i - 1);
      event.preventDefault();
      return void (onEdge[to]!.note.id !== open && openNote(onEdge[to]!.note.id));
    }
    const did = { " ": play, t: stepInOrBack, n: note, c: compare, arrowdown: onward, j: onward, arrowup: () => next(-1), k: () => next(-1) }[key];
    if (!did || event.repeat) return;
    event.preventDefault();
    did();
  };
  useEffect(() => {
    const down = (event: KeyboardEvent) => keys.current(event);
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, []);

  // A note's picture is new on the edge when it wasn't there the last time this moment was drawn: it arrives.
  const known = useRef<{ n: number; ids: Set<string> }>(undefined);
  const before = known.current?.n === n ? known.current.ids : undefined;
  useEffect(() => void (known.current = { n, ids: new Set(onEdge.map(({ note }) => note.id)) }));
  const newest = before && onEdge.findLast(({ note }) => !before.has(note.id))?.note.id;
  const [lastArrived, setLastArrived] = useState<string>();
  useEffect(() => void (newest && setLastArrived(newest)), [newest]);

  // A click on the moment plays and pauses it, as Space does; with a note open, it closes it; noting, it's on what's
  // under the pointer, said beside it.
  const aimingNote = mode.is === "pointing";
  const movePill = (event: React.PointerEvent) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    pointer.current = { x: event.clientX - box.left, y: event.clientY - box.top };
    if (pill.current) pill.current.style.transform = `translate(${pointer.current.x - 3}px, ${pointer.current.y - 2}px)`;
  };

  const momentTiles = (forward: boolean) =>
    round.scenes.map((other, i) => {
      // Its notes' dots, as its edge has them: one made in the app joins once you're back.
      const talk = other === scene ? onEdge.map(({ note }) => note) : [...sent, ...notes].filter((one) => one.on?.scene === other.name);
      return (
        <Tile
          key={other.name}
          id={other.name}
          label={other.name}
          forward={forward}
          strong={i + 1 === n}
          quiet
          picture={
            <>
              <StillPicture review={review} round={round} scene={other} about={other.about ?? other.acted} />
              {talk.length > 0 && (
                <span className="absolute top-1.5 right-1.5 flex gap-[3px]">
                  {talk.slice(0, 5).map((one) => (
                    <i key={one.id} className={`size-[7px] rounded-full shadow-[0_0_0_1.5px_#fff] ${notes.includes(one) ? "bg-amber" : "bg-slate"}`} />
                  ))}
                </span>
              )}
            </>
          }
          words={
            <>
              {/* Who by their name alone: who they are is said over the recording once you're there. */}
              <span className="line-clamp-2 text-[12.5px] leading-[17px] text-fg">
                {other.person && <span className="text-soft">{other.person} · </span>}
                {other.name}
              </span>
            </>
          }
          onPress={() => toMoment(i + 1)}
        />
      );
    });
  // What the moment is about on its end's picture, as shares of the screen: where a note's strip closes in when the
  // note is on something too large to show, that holds it.
  const aboutHere = (() => {
    const end = readings?.at(-1);
    const thing = end && closeTo && end.things.find((one) => one.role === closeTo.role && one.name === closeTo.name)?.box;
    return thing && { x: thing.x / end.screen.width, y: thing.y / end.screen.height, width: thing.width / end.screen.width, height: thing.height / end.screen.height };
  })();
  const noteTiles = (forward: boolean) =>
    onEdge.map(({ note, sent: isSent }) => {
      const { words, stands, fresh } = says(note, isSent);
      return (
        <Tile
          key={note.id}
          id={note.id}
          label={note.words}
          forward={forward}
          strong={open === note.id}
          lit={pointed === note.id}
          arriving={before && !before.has(note.id) ? "right" : undefined}
          strip
          picture={<NotePicture frame={frames[note.id]} sent={isSent} focus={isNow(shownAt(note)) ? aboutHere : undefined} />}
          words={<NoteWords words={words} stands={stands} fresh={fresh} short />}
          onPress={() => openNote(note.id)}
          onPoint={(now) => setPointed(now ? note.id : undefined)}
        />
      );
    });

  // What's said by a pin: the note being written, or the one open. On a phone, under the bar, where there's room.
  const cards = (
    <>
          {writing && <NoteCard by={(!(writing.note.on && madeInApp(writing.note.on)) && placed?.[writing.note.id]) || writing.box || spotAt(writing.spot)} stage={stage} under={phone}><Write onSave={save} onDrop={() => act({ type: "written" })} /></NoteCard>}
          {/* Closing, it fades where it stood; under the bar on a phone, it goes at once, so it never holds its room. */}
          {!writing && carded && cardBy && (
            <NoteCard key={carded.note.id} by={cardBy} stage={stage} closing={!opened} under={phone}>
              <div className="min-h-0 flex-1 overflow-y-auto px-1">
                {carded.sent ? <Turns you={you} turns={conversation(review, carded.note.id)} /> : <Turns you={you} turns={[]} unsent={carded.note.words} />}
              </div>
              {carded.sent && (
                <div className="mt-2 border-t border-line pt-2">
                  <Write
                    key={carded.note.id}
                    placeholder="Reply"
                    rows={2}
                    focus={false}
                    start={replies.find((one) => one.note === carded.note.id)?.words ?? ""}
                    onSave={(words) => (setReplies((all) => [...all.filter((one) => one.note !== carded.note.id), { note: carded.note.id, words }]), close())}
                    onDrop={close}
                  />
                </div>
              )}
              {!carded.sent && (
                <div className="mt-2 flex items-center gap-2 px-1 text-xs text-soft">
                  <span>Sent with Send, at the top</span>
                  <button className="ml-auto rounded-md px-1.5 py-0.5 hover:bg-hover hover:text-fg" onClick={() => (setNotes((all) => all.filter((one) => one.id !== carded.note.id)), close())}>
                    Remove
                  </button>
                </div>
              )}
            </NoteCard>
          )}
    </>
  );

  const momentsEdge = (
    <Edge side="left" label="Moments" stage={stage} quiet={away} phone={phone} showing={scene.name}>
      {momentTiles}
    </Edge>
  );

  return (
    // Clipped, never scrolled: a caret put in a note's box can't move the page under you.
    <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] overflow-clip bg-ground phone:grid-rows-[auto_auto_auto_minmax(0,1fr)]" onPointerDown={pressAway}>
      <header className="flex h-12 min-w-0 items-center gap-3 px-6 phone:px-4">
        <button onClick={onLeave} className="-ml-2 flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm hover:bg-hover hover:text-fg">
          <svg viewBox="0 0 12 12" className="size-3 flex-none" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7.5 2.5L4 6l3.5 3.5" />
          </svg>
          <span className="truncate">{review.title}</span>
        </button>
        {(unsent > 0 || sending) && (
          <SendButton className="ml-auto" filled={unsent > 0 && sending !== "sent"} arrives onClick={() => void sendNow()} disabled={sending === "sending" || sending === "sent"}>
            {sending === "sent" ? <>{tick}Sent</> : sending === "sending" ? "Sending…" : <>Send {toSend(notes.length, replies.length)} <Key className={FILLED_KEY}>Ctrl ↵</Key></>}
          </SendButton>
        )}
        {Array.isArray(sending) && <span className="text-[13px] text-amber-ink">Not sent: {sending[0]}</span>}
        <button onClick={onward} disabled={!may.move} className={`-mr-2 flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm enabled:hover:bg-hover enabled:hover:text-fg disabled:opacity-50 ${unsent > 0 || sending ? "" : "ml-auto"}`}>
          {nextAnswer ? "Next answer" : n < count ? "Next" : "To the list"}
          <Key>↓</Key>
        </button>
      </header>
      {/* Who and where, in the agent's words: room for two lines, three on a phone, so nothing under it moves. */}
      <p className="line-clamp-2 h-[44px] px-6 text-[15px] leading-[22px] text-fg phone:line-clamp-3 phone:h-[66px] phone:px-4" title={scene.name}>
        {who && <span className="text-soft">{who} · </span>}
        {scene.name}
      </p>
      {/* The recording, as large as the room beside the edges lets it be: the same size from one moment to the next. */}
      <div className="relative mt-2 grid min-h-0 place-items-center [container-type:size] phone:[container-type:inline-size]">
        <div
          ref={stage}
          className="relative overflow-visible rounded-lg"
          style={{
            aspectRatio: `${screen.width} / ${screen.height}`,
            width: phone ? "calc(100cqw - 32px)" : `min(calc(100cqw - 2 * ${SIDE}), calc((100cqh - ${UNDER}px) * ${screen.width / screen.height}))`,
            marginBottom: UNDER,
          }}
          onPointerMove={(event) => (movePill(event), setAiming(!(event.target as Element).closest("[role=toolbar]")))}
          onPointerLeave={() => setAiming(false)}
        >
          <div
            className="absolute inset-0 overflow-hidden rounded-lg bg-paper shadow-frame"
            onClick={(event) => !noting && !(event.target as Element).closest("button") && (opened ? close() : play())}
          >
            {behind && <img src={behind} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain" />}
            <div key={scene.recording} className="absolute inset-0 animate-arrive" onAnimationEnd={(event) => event.target === event.currentTarget && setBehind(undefined)}>
              {(!phone || readings) && <Picture shot={{ src: picture(review.id, round.number, scene.recording, Math.max(0, scene.steps.length - 1)), crop: closer }} />}
              <Player
                review={review.id}
                round={round.number}
                recording={scene.recording}
                crop={closer}
                at={at}
                playing={comparing ? undefined : playing}
                cut={cut}
                clock={clockOf}
                onStop={() => act({ type: "played" })}
                marks={marks}
                onMarks={(placed) => setPlaced({ recording: scene.recording, placed })}
                things={aimingNote ? glimpsed : undefined}
                onPlace={aimingNote ? (on) => act({ type: "pointed", writing: { note: { id: newId(), on: { round: round.number, scene: scene.name, at, ...on }, words: "" }, spot: { ...pointer.current } } }) : undefined}
                scrolled={scrolled}
                hand={!standIn}
                drawn={drawn}
              />
            </div>
            {aboutAt && (
              <div
                className="pointer-events-none absolute animate-arrive rounded-[4px] outline-[1.5px] outline-offset-4 outline-slate outline-solid"
                style={{ left: aboutAt.left, top: aboutAt.top, width: aboutAt.width, height: aboutAt.height }}
              />
            )}
            {comparing && then && both && (
              // Now leads, so it's drawn first, on the right. Both end above the bar, so nothing they hold in view, what
              // the moment is about above all, is ever under it.
              <div className="absolute inset-0 z-[5] flex animate-arrive flex-row-reverse gap-3 bg-ground" style={{ paddingBottom: BAR / 2 + 8 }}>
                {[
                  { label: "Now", round: round.number, recording: scene.recording, side: 0, actualSize: { ...leading, holds: holdsAt } },
                  { label: "When you last saw it", round: then.round.number, recording: then.scene.recording, side: 1, actualSize: { ...beside, holds: holdsAt } },
                ].map((side) => (
                  <div key={side.label} className="relative min-w-0 flex-1">
                    <div className="absolute inset-0 overflow-hidden rounded-lg bg-paper shadow-frame">
                      <Player
                        review={review.id}
                        round={side.round}
                        recording={side.recording}
                        at={both.at(along)[side.side]!}
                        following={playing ? { clock: bothOf, at: (along) => both.at(along)[side.side]! } : undefined}
                        actualSize={side.actualSize}
                      />
                      <span className={CHIP}>{side.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {layers.length > 0 && (
              // The frame the open note was made on, over the moment: its kept picture, the same one its edge shows, or the
              // recording there until that's drawn, with no pointer and nothing played.
              <div ref={shut} className={`absolute inset-0 z-[5] ${opened ? "" : "pointer-events-none"}`}>
                {layers.map(({ note, made }) => (
                  <div key={note.id} className="absolute inset-0 animate-arrive overflow-hidden bg-paper">
                    {frames[note.id] ? (
                      <img src={frames[note.id]!.src} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain" />
                    ) : (
                      <Player
                        review={review.id}
                        round={made.round}
                        recording={made.recording}
                        at={made.at}
                        hand={false}
                        marks={[{ id: note.id, ...(made.node !== undefined ? { node: made.node } : made.point && { point: made.point }) }]}
                        onMarks={note.id === shownOpen?.note.id ? (at) => setOnFrame({ note: note.id, at }) : undefined}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className={`pointer-events-none absolute inset-0 ${layers.length ? "z-[6]" : ""}`}>
              {shownOpen && !openNow ? (
                <Pinned pins={[pinFor(shownOpen)]} placed={openAt} open={shownOpen.note.id} faded={!opened} onOpen={close} />
              ) : (
                <Pinned pins={(opened && openNow ? [opened] : pinned).map(pinFor)} placed={placed} open={writing?.note.id ?? (openNow ? opened?.note.id : undefined)} faded={!!playing || away} lit={pointed} onPoint={pointPin} onOpen={(id) => id && openNote(id)} quiet />
              )}
            </div>
          </div>
          <Portal
            {...stepIn.portal}
            screen={screen}
            scrolled={() => scrolled.current?.()}
            theirs={() => drawn.current?.()}
            onStandIn={setStandIn}
          />
          {(() => {
            const one = saying && !opened && !writing && !playing && !away ? onEdge.find(({ note }) => note.id === saying) : undefined;
            const thing = one && placed?.[one.note.id];
            if (!one || !thing) return null;
            const said = says(one.note, one.sent);
            // Beside its pin, which stands just outside the thing's top right corner, on whichever side has room.
            const [x, y, wide] = [thing.left + thing.width + (thing.width || thing.height ? 14 : 0), thing.top - (thing.width || thing.height ? 14 : 0), stage.current?.clientWidth ?? 0];
            const left = x + 16 + 220 <= wide ? x + 16 : Math.max(8, x - 16 - 220);
            return (
              <div aria-hidden className="pointer-events-none absolute z-30 w-[220px] animate-arrive rounded-lg bg-surface px-2 pt-1.5 pb-[7px] shadow-float" style={{ left, top: Math.max(8, y - 10) }}>
                <NoteWords {...said} />
              </div>
            );
          })()}
          <span ref={pill} aria-hidden className={`pointer-events-none absolute top-0 left-0 z-30 transition-opacity duration-150 ease-calm ${aimingNote && aiming ? "" : "opacity-0"}`}>
            <span className={TAG}>Note on this</span>
          </span>
          {!phone && cards}
          {/* What you can do here, across the recording's bottom edge, as on the older page. */}
          <div
            role="toolbar"
            aria-label="This moment"
            onClick={(event) => (event.target as Element).closest("button")?.blur()}
            className={`absolute top-full left-1/2 z-20 flex gap-0.5 rounded-xl transition-[translate,opacity] duration-300 ease-calm bg-surface p-1 text-[13px] select-none ${inApp ? "outline-2 outline-[rgba(236,178,72,0.95)] outline-solid shadow-[0_6px_20px_rgba(20,24,34,0.12)]" : "shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]"}`}
            ref={toolbar}
            style={{ height: BAR, translate: `calc(-50% + ${clear?.x ?? 0}px) calc(-50% + ${clear?.y ?? 0}px)`, opacity: clear ? 1 : 0 }}
          >
            {/* Noting, the bar says what to do and how to leave, over what it holds, at its width. */}
            {noting && (
              <div className="absolute inset-1 z-1 flex animate-arrive items-center justify-between gap-2 rounded-lg bg-surface pl-2.5">
                <span className="truncate text-soft">Point at what it's about</span>
                <button className={ITEM} onClick={() => act({ type: "note" })}>
                  Cancel <Key>Esc</Key>
                </button>
              </div>
            )}
            <div className="contents" inert={noting}>
            {inApp ? (
              // In the app, who you are there, beside Back.
              <span className={`${ITEM} w-[96px] cursor-default px-1! phone:w-[64px]`}>
                <span className="truncate rounded-full bg-[#EDB654] px-[7px] text-[11.5px] leading-[19px] text-[#3B2A07]">{person ? `You, as ${person}` : "You"}</span>
              </span>
            ) : asItWas ? (
              // What's shown is from before the agent last handed it back.
              <span className={`${ITEM} w-[96px] cursor-default text-faint! phone:w-[64px]`}>As it was</span>
            ) : still ? (
              // Nothing to play: where Play would be, it says what this moment is.
              <span className={`${ITEM} w-[96px] cursor-default text-faint! phone:w-[64px]`}>A still</span>
            ) : (
              <button className={`${ITEM} relative w-[96px] phone:w-[64px]`} disabled={!may.play} onClick={play}>
                <span className="w-9 text-left">{playing ? "Pause" : "Play"}</span> <Key className="min-w-9">Space</Key>
                <Progress clock={clockOf} share={shareOf(at)} shareOf={shareOf} moving={!!playing} shown={!atPoint && !away} />
              </button>
            )}
            <button className={`${ITEM} relative w-[116px] phone:w-[104px]`} disabled={!may.stepIn && !may.back} aria-pressed={stepping} onClick={stepInOrBack}>
              {inApp ? "Back" : stepping ? "Stepping in…" : "Step in"} {!stepping && <Key>{inApp ? "Esc" : "T"}</Key>}
              {stepIn.getting && <Getting {...stepIn.getting} />}
            </button>
            <button className={`${ITEM}`} disabled={!may.note} aria-pressed={noting} onClick={note}>
              Note <Key>N</Key>
            </button>
            {anyLook &&
              (then ? (
                <button className={`${ITEM} w-[104px] phone:w-auto`} disabled={!may.compare} aria-pressed={comparing} onClick={compare}>
                  Compare <Key>C</Key>
                </button>
              ) : (
                // Nothing to compare: what it is, in Compare's place.
                <span className={`${ITEM} w-[104px] cursor-default text-faint! phone:w-auto`}>{looking ? "Unchanged" : "New"}</span>
              ))}
            </div>
          </div>
        </div>
        {stepIn.said && <p className="absolute bottom-0 left-1/2 max-w-[90%] -translate-x-1/2 translate-y-full animate-arrive rounded-md bg-surface px-3 py-1.5 text-xs text-amber-ink shadow-tip">{stepIn.said}</p>}
      </div>
      {/* Beside the recording, or under it on a phone: the change's moments, and this one's notes. */}
      <div className={phone ? "grid min-h-0 grid-cols-[minmax(0,1fr)] content-start gap-6 overflow-y-auto px-4 pt-6 pb-8" : "contents"}>
        {phone && cards}
        {/* Tab reaches them as they read, left to right; on a phone, the notes come first, nearest what they're on. */}
        {!phone && momentsEdge}
        {(!phone || onEdge.length > 0) && (
          <Edge side="right" label="Notes" stage={stage} quiet={away} phone={phone} showing={open ?? lastArrived} arrived={lastArrived}>
            {noteTiles}
          </Edge>
        )}
        {phone && momentsEdge}
      </div>
    </div>
  );
}

const ABOUT = "about";

// Under the recording, room for the lower half of the bar that hangs across its edge, and a little more.
const UNDER = BAR / 2 + 20;

// Beside the recording, room for each edge's pictures at rest.
const SIDE = "clamp(104px, 10vw, 160px)";

// A spot, as a thing with no size.
const spotAt = ({ x, y }: { x: number; y: number }): Rect => ({ left: x, top: y, width: 0, height: 0 });
