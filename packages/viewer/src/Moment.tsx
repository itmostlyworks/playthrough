// A moment's page: the recording as large as the window lets it be, the bar across its foot, the change's moments on
// the left, ending in the step left for it, and this one's notes on the right. From here: play the few seconds that led
// here, step in (the real app there, as that person), note what you click, compare with how it was when you last saw
// it, go on, or say Done or Send.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Glimpse, Reading } from "@playthrough/page";
import { conversation, isStill, madeInApp, newId, together, type Note, type Change, type HandBack, type Moment } from "@playthrough/change";
import { glimpses, picture, readings as readingsOf, recording, type Listed } from "./api.ts";
import { clamp } from "./clamp.ts";
import { CHIP, playedTogether } from "./compare.ts";
import { Edge, Tile } from "./Edge.tsx";
import { Header, Title } from "./Header.tsx";
import type { YourReply } from "./kept.ts";
import { Key } from "./Key.tsx";
import { arrived, can, isPlaying, isStepped, reduce, type Action } from "./mode.ts";
import { Progress, Getting, FrameButton, Tip, ITEM, BAR } from "./MomentBar.tsx";
import { Turns, useFrames, NoteWords, NotePicture, NoteCard, Write, type Made } from "./Note.tsx";
import { usePhone } from "./phone.ts";
import { Picture } from "./Picture.tsx";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Clock, Player, useCut, type Mark, type Placed } from "./Player.tsx";
import { Portal, TAG } from "./Portal.tsx";
import type { Rect, Scrolled } from "./replay.ts";
import { ago, noteSays, takingOf, seenOf } from "./standing.ts";
import { LastStop } from "./LastStop.tsx";
import { StepAction, StepCard, useStepLeft } from "./StepLeft.tsx";
import { backAgain } from "./step.ts";
import { useKeptReady, useStepIn } from "./stepIn.ts";
import { useHeld } from "./held.ts";
import { overAPause } from "./stepping.ts";
import { closeOn, aboutBox, StillPicture } from "./Still.tsx";
import type { Together } from "./view.ts";

// How long what you did takes to fade out, back to the moment.
const FADING = 300;

// Where a moment's recording ends, and where what's shown of it starts.
const endOf = (moment: Moment) => Math.max(0, moment.length - 0.05);
const startOf = (moment: Moment) => Math.min(moment.from, endOf(moment));

export function MomentView(props: {
  change: Change;
  // The app it's in, by its name.
  app: string;
  handBack: HandBack;
  n: number;
  about?: { role: string; name: string };
  who: string;
  notes: Note[];
  sent: Note[];
  setNotes: (edit: (notes: Note[]) => Note[]) => void;
  replies: YourReply[];
  setReplies: (edit: (replies: YourReply[]) => YourReply[]) => void;
  you: string;
  // A note to open as the moment opens, as its address says.
  opening?: string;
  // What's waiting, top left: the way to every other change.
  opener: ReactNode;
  // The answers new as you came to the change that you haven't opened, each on its moment: each is new on its note
  // until it's opened.
  unopened: { note: string; moment: number }[];
  onOpened: (note: string) => void;
  onMoment: (n: number) => void;
  // The change as listed, for the step left, and on to what's next once it's taken.
  listed: Listed;
  goOn: () => void;
  // At the last stop, after the last moment (`n` is the last moment then): the whole change in the recording's place,
  // the step left in the bar's. Gone to and from it as between moments.
  atLastStop: boolean;
  onLastStop: () => void;
  // The moments you haven't watched, by their place from 1.
  unwatched: number[];
}) {
  const { change, handBack, n, about, who, notes, setNotes, replies, setReplies, you, onMoment, atLastStop } = props;
  // What was sent is drawn as sent at once, as the change comes back with it.
  const [justSent, setJustSent] = useState<Note[]>([]);
  const sent = [...props.sent, ...justSent.filter((note) => !props.sent.some((one) => one.id === note.id))];
  const unsent = notes.length + replies.length;
  // The step left: at the last stop, pressed or Enter; from anywhere, Ctrl+Enter while something's unsent.
  const step = useStepLeft(props.listed, you, (going) => setJustSent((now) => [...now, ...going]), props.goOn);
  // What Send sends, and only that, is what the last stop shows of what you said: your notes not sent, and the sent
  // ones you've replied to, in your words. Pressed, what went stays shown, as gone, till the page goes on.
  const sendable = [...sent.filter((note) => replies.some((one) => one.note === note.id)).map((note) => ({ note, sent: true })), ...notes.map((note) => ({ note, sent: false }))];
  const sending = useRef<typeof sendable>(undefined);
  if (!step.said || !sending.current) sending.current = sendable;
  // The last stop's sheet stays drawn while it fades, as leaving it.
  const sheet = useRef<HTMLDivElement>(null);
  const [sheetDrawn, setSheetDrawn] = useState(atLastStop);
  useEffect(() => {
    if (atLastStop) return setSheetDrawn(true);
    const shown = sheet.current;
    if (!shown || matchMedia("(prefers-reduced-motion: reduce)").matches) return setSheetDrawn(false);
    const fading = shown.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards" });
    let current = true;
    fading.finished.then(() => current && setSheetDrawn(false), () => {});
    return () => void ((current = false), fading.cancel());
  }, [atLastStop]);
  const moment = handBack.moments[n - 1]!;
  const count = handBack.moments.length;
  const end = endOf(moment);
  const from = startOf(moment);
  const still = isStill(moment);
  // Read from this moment's recording, and only ever drawn on it: another moment's is nothing here.
  const [read, setRead] = useState<{ recording: string; readings?: Reading[]; glimpsed?: Glimpse[] }>();
  const readings = read?.recording === moment.recording ? read.readings : undefined;
  const glimpsed = read?.recording === moment.recording ? read.glimpsed : undefined;
  useEffect(() => {
    let current = true;
    const kept = (more: { readings?: Reading[]; glimpsed?: Glimpse[] }) => current && setRead((now) => ({ ...(now?.recording === moment.recording && now), recording: moment.recording, ...more }));
    readingsOf(change.id, handBack.number, moment.recording).then((readings) => kept({ readings }));
    glimpses(change.id, handBack.number, moment.recording).then((glimpsed) => kept({ glimpsed }));
    return () => void (current = false);
  }, [moment.recording]);
  // The others are fetched as this one opens, so going on to the next is as quick as the first.
  useEffect(() => {
    for (const other of handBack.moments) {
      void recording(change.id, handBack.number, other.recording).catch(() => {});
      new Image().src = picture(change.id, handBack.number, other.recording, 0);
    }
  }, [handBack]);
  // The recording's shape, kept from one moment to the next until the next's is known, so the recording never changes
  // size as you go from one to another.
  const [screen, setScreen] = useState({ width: 1280, height: 800 });
  const shape = readings?.at(-1)?.screen;
  useEffect(() => void (shape && (shape.width !== screen.width || shape.height !== screen.height) && setScreen(shape)), [shape?.width, shape?.height]);
  // On a phone, the whole screen is too small to read: it's closed in on what the moment is about, as its still is.
  const phone = usePhone();
  const closeTo = about ?? moment.acted;
  const closer = useMemo(() => (phone ? closeOn(readings?.at(-1), closeTo, screen.width / screen.height) : undefined), [phone, readings, closeTo?.role, closeTo?.name]);
  const cut = useCut(change.id, handBack.number, moment);
  const [clockOf] = useState(() => new Clock(end));
  const [bothOf] = useState(() => new Clock(0));
  // What the page is doing, one thing at a time, and where the recording rests. Every press is an action, carrying
  // where the recording has got to. It opens at the moment's end, with a note open where its address names one,
  // on this moment; another moment, going to it is an action too, so nothing of this one is drawn there.
  const [page, setPage] = useState(() => arrived(moment.name, from, end, [...props.sent, ...notes].some((one) => one.id === props.opening && one.on?.moment === moment.name) ? props.opening : undefined));
  // Come to another moment other than by going to it here, it's arrived at as it would have been, before it's drawn.
  if (page.moment !== moment.name) setPage(arrived(moment.name, from, end));
  // An action from a moment left behind, as the app answering late, changes nothing on this one.
  const act = (action: Action) => {
    const now = { now: clockOf.at, along: bothOf.at };
    setPage((was) => (action.type === "moment" || was.moment === moment.name ? reduce(was, { ...action, ...now }) : was));
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
  const [looked] = useState(() => seenOf(change, you));
  const lastLook = (one: Moment) => {
    const earlier = change.handBacks.findLast((kept) => kept.number > 0 && kept.number < handBack.number && kept.finished && looked.includes(takingOf(kept.number, one.name)) && kept.moments.some((taken) => taken.name === one.name));
    const kept = earlier?.moments.find((taken) => taken.name === one.name);
    return earlier && kept ? { handBack: earlier, moment: kept } : undefined;
  };
  const anyLook = handBack.moments.some((one) => lastLook(one));
  const looking = lastLook(moment);
  const compared = looking && change.comparisons.find((one) => one.handBack === handBack.number && one.since === looking.handBack.number);
  const unchanged = !!compared && !compared.findings.some((finding) => finding.seen.some((seen) => seen.moment === moment.name));
  const then = unchanged ? undefined : looking;
  const both = useMemo(() => then && cut && playedTogether(cut, together(moment, then.moment)), [cut, then?.moment.recording, moment.recording]);
  // Each side at actual size, a window onto the same part of the page, following now's pointer, as the older page's are.
  const [{ leading, beside }] = useState(() => {
    const samePart: Together = {};
    return { leading: { together: samePart, leads: true }, beside: { together: samePart, leads: false } };
  });
  // How far along both it rests: where now first is, or where it was let go, as now held while the other went on.
  const along = (both && page.along) ?? both?.of(at) ?? 0;
  const atPoint = !playing && at >= end - 0.02;
  // How far through what's shown it is, waiting cut short, as Play's line counts it.
  const shareOf = (time: number) => (cut ? clamp((cut.cut(time) - cut.cut(from)) / Math.max(0.01, cut.cut(end) - cut.cut(from))) : 1);
  // Where the moment's marks are on it, once its recording has said.
  const [placedOn, setPlaced] = useState<{ recording: string; placed?: Placed }>();
  const placed = placedOn?.recording === moment.recording ? placedOn.placed : undefined;
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
  const stepIn = useStepIn({ change: change.id, handBack: handBack.number, moment, page, clock: clockOf, act, pointing: () => note() });

  // Going to another moment, the one you were on stays under the new one, drawn just as it was where it stood, until the
  // new one has come in over it. Its picture would do it no justice: taken by another browser, its words fall a little
  // wider and heavier, and two moments that look the same would blend into doubled, swollen words.
  const [behind, setBehind] = useState<{ recording: string; at: number }>();
  const was = useRef(moment);
  if (was.current !== moment) {
    if (was.current.recording !== moment.recording && !phone && !matchMedia("(prefers-reduced-motion: reduce)").matches) setBehind({ recording: was.current.recording, at: clockOf.at });
    was.current = moment;
  }

  const person = moment.person;

  // What you said on this moment, sent and then unsent, in the order said: the edge's pictures, and the pins.
  const mine = notes.filter((one) => one.on?.moment === moment.name);
  const theirs = sent.filter((one) => one.on?.moment === moment.name);
  const said = [...theirs.map((note) => ({ note, sent: true })), ...mine.map((note) => ({ note, sent: false }))];
  const onEdge = said.filter(({ note }) => !stepIn.madeThere(note));
  // What was new as you came to the change stays new here until you open it: coming to its moment counts as seeing it,
  // for what's next and for next time.
  useEffect(() => void (open && props.onOpened(open)), [open]);
  const says = (note: Note, sent: boolean) => {
    const said = noteSays(change, you, note, sent, replies);
    const fresh = sent && said.stands !== "sent" && said.stands !== "reply not sent yet" && props.unopened.some((one) => one.note === note.id);
    return { ...said, fresh, stands: said.stands === "new answer" || said.stands === "answered" ? (fresh ? "new answer" : "answered") : said.stands };
  };
  const madeAt = ({ on }: Note): Made | undefined => {
    if (!on) return undefined;
    const thing = on.element?.node !== undefined ? { node: on.element.node } : on.point && { point: on.point };
    if (madeInApp(on)) return { handBack: on.handBack, recording: on.recording, at: Math.min(on.length, on.at), ...thing };
    const taking = change.handBacks.find((one) => one.number === on.handBack)?.moments.find((one) => one.name === on.moment);
    return taking && { handBack: on.handBack, recording: taking.recording, at: on.at ?? taking.length, ...thing };
  };
  // A note's element number is good only in the recording it was read from: this taking's, where it was made on it.
  const onThisTaking = (on: Note["on"]) => !!on && !madeInApp(on) && on.handBack === handBack.number;
  // A thing on the moment's page by its role and name, as it was read at its end.
  const nodeOf = (named?: { role: string; name: string }) => named && readings?.at(-1)?.things.find((thing) => thing.role === named.role && thing.name === named.name)?.node;
  // A note is shown on its thing as it is now wherever that thing is in the moment's picture now, found as its pin is;
  // only otherwise on the frame it was made on, which is what its kept picture is drawn from.
  const nowOn = (note: Note) => {
    const node = onThisTaking(note.on) ? note.on?.element?.node : nodeOf(note.on?.element);
    return node !== undefined && readings?.at(-1)?.things.some((thing) => thing.node === node) ? node : undefined;
  };
  const shownAt = (note: Note): Made | undefined => {
    const node = nowOn(note);
    return node !== undefined ? { handBack: handBack.number, recording: moment.recording, at: moment.length, node } : madeAt(note);
  };
  const isNow = (shown?: Made) => !!shown && shown.handBack === handBack.number && shown.recording === moment.recording && Math.abs(shown.at - moment.length) < 0.1;
  const frames = useFrames(change, readings ? onEdge.map(({ note }) => ({ note, shown: shownAt(note) })) : []);
  // The last stop's notes, from across the change, each on the frame it was made on.
  const sheetFrames = useFrames(change, atLastStop ? sending.current!.map(({ note }) => ({ note, shown: madeAt(note) })) : []);
  // A note from an earlier hand-back is shown on the moment as it is now, at its end, on its thing where that's found
  // there; how it was, the frame it was made on, is one flip away, asked for only once it's open. Its thing not
  // there now (gone since, or on a page you went to after stepping in), there's no now to show it on: it's shown as
  // it was, and a pin never stands on whatever is there instead.
  const earlier = (note: Note) => !!note.on && note.on.handBack < handBack.number;
  const found = (note: Note) => nowOn(note) !== undefined;
  const opened = onEdge.find(({ note }) => note.id === open);
  const flips = !!opened && earlier(opened.note);
  const nowThere = !!opened && found(opened.note);
  const flipped = flips && (!nowThere || (mode.is === "a note open" && !!mode.asItWas));
  const wasFrames = useFrames(change, opened && earlier(opened.note) && found(opened.note) ? [{ note: opened.note, shown: madeAt(opened.note) }] : []);
  // The kept picture of the frame a note was made on.
  const wasFrame = (note: Note) => (earlier(note) && found(note) ? wasFrames[note.id] : frames[note.id]);
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

  // A note open shows where it's shown, its pin on its thing and what's been said on it, and nothing more: from an
  // earlier hand-back, the moment as it is now, or flipped, the frame it was made on; else the frame it was made on,
  // wherever that was. A frame fades in over the moment, and out again where it was.
  const openMade = opened && (!earlier(opened.note) ? shownAt(opened.note) : flipped ? madeAt(opened.note) : { handBack: handBack.number, recording: moment.recording, at: moment.length });
  // The moment, at its end, is where it's shown.
  const openNow = isNow(openMade);
  // Open on a frame of its own, not on the moment as it is now.
  const elsewhere = !!opened && !openNow;

  // What may be pressed now, which every key and button asks.
  const facts = { still, ready: !!cut, compares: !!then, elsewhere, flips: flips && nowThere };
  const may = can(page, facts);
  useKeptReady({ change: change.id, moment, page, facts });
  const play = () => may.play && act({ type: "play" });
  // The frame before or the next, from where the recording has got to: pressed as it plays, it stops there and steps.
  const frameFrom = useRef<((at: number, by: 1 | -1, from: number, end: number) => number | undefined) | undefined>(undefined);
  // Held, only a step that's no more than a pause away. It says whether it went.
  const frame = (by: 1 | -1, held = false) => {
    if (!(by < 0 ? may.frameBefore : may.nextFrame)) return false;
    const to = frameFrom.current?.(clockOf.at, by, from, end);
    if (to === undefined || (held && overAPause(clockOf.at, to))) return false;
    act({ type: "step", at: to });
    return true;
  };
  const arrow = useHeld(frame);
  // A note open on a frame of its own shows somewhere the app can't be taken to: stepping in from it would swap the
  // picture for the moment's and open the app there. Closed, Step in answers again. In the app, it's Back.
  const stepInOrBack = () => (inApp ? may.back && stepIn.back() : may.stepIn && stepIn.stepIn());
  const back = () => may.back && stepIn.back();
  const note = () => may.note && act({ type: "note" });
  const flip = () => may.flip && act({ type: "flip" });
  // Opened or closed, it stops where it's got to.
  const compare = () => {
    if (!may.compare) return;
    leading.together.centre = undefined;
    act({ type: "compare" });
  };
  const goTo = (to: number, open?: string) => {
    const other = handBack.moments[to - 1]!;
    act({ type: "moment", moment: other.name, starts: startOf(other), end: endOf(other), open });
    onMoment(to);
  };
  // After the last moment, the last stop; from it, ↑ is the last moment again and there's nothing further on.
  const toLastStop = () => {
    if (!may.move || atLastStop) return;
    act({ type: "moment", moment: moment.name, starts: from, end });
    props.onLastStop();
  };
  const next = (by: number) => {
    if (!may.move) return;
    if (atLastStop) return void (by < 0 && goTo(count));
    const to = n + by;
    if (to < 1) return;
    if (to > count) return toLastStop();
    goTo(to);
  };
  const toMoment = (to: number) => may.move && (to !== n || atLastStop) && goTo(to);
  const openNote = (id: string) => may.move && act({ type: "open", note: id });
  // What you said on a moment of the change, in the order its edge has it: one made in the app joins once you're back.
  const notesOn = (other: Moment) => (other === moment ? onEdge.map(({ note }) => note) : [...sent, ...notes].filter((one) => one.on?.moment === other.name));
  // The note before or the next, through the whole change: this moment's one after another, then on to the nearest
  // moment that has one, its first going on, its last going back. Past the change's last or first, nothing.
  const nextNote = (by: 1 | -1) => {
    if (!may.move) return;
    // From the last stop, back is the change's last note, wherever it is, and on is nothing.
    const here = atLastStop ? [] : notesOn(moment);
    const i = here.findIndex((one) => one.id === open);
    const to = here[i < 0 ? (by > 0 ? 0 : here.length - 1) : i + by];
    if (to) return openNote(to.id);
    for (let other = atLastStop ? (by < 0 ? count : count + 1) : n + by; other >= 1 && other <= count; other += by) {
      const there = notesOn(handBack.moments[other - 1]!).at(by > 0 ? 0 : -1);
      if (there) return goTo(other, there.id);
    }
  };
  const close = () => act({ type: "close" });
  const save = (words: string) => {
    if (!writing) return;
    const kept = { ...writing.note, words };
    setNotes((all) => [...all, kept]);
    act({ type: "written" });
    stepIn.saved(kept, mine.length + 1);
  };
  // The open note's frame over the moment, and the one before it while that fades: only ever this moment's.
  const [layered, setLayers] = useState<{ note: Note; sent: boolean; made: Made }[]>([]);
  const layers = layered.filter((one) => one.note.on?.moment === moment.name);
  // Where the recording on the open note's own frame has its thing, once it has said, and for which note.
  const [onFrame, setOnFrame] = useState<{ note: string; at?: Placed }>();
  const shut = useRef<HTMLDivElement>(null);
  useEffect(() => void (opened && openNow && at < end - 0.02 && act({ type: "rest", at: end })), [opened?.note.id, openNow]);
  // The note open on a frame of its own, not on the moment as it is now.
  const framed = opened && openMade && !openNow ? { ...opened, made: openMade } : undefined;
  // Gone to from another note's frame, that frame stays under the new one while it comes in. Gone to from the moment,
  // nothing is under it: what was fading off the moment is older than what was showing. Both before the page is next
  // drawn, so the fade let go never shows the old frame again.
  const framedBefore = useRef(false);
  useLayoutEffect(() => {
    const before = framedBefore.current;
    framedBefore.current = !!framed;
    if (!framed) return;
    setLayers((now) => [...(before ? now.filter((one) => one.note.id !== framed.note.id).slice(-1) : []), framed]);
    // The one under it goes once the new one has come in over it.
    const settled = setTimeout(() => setLayers((now) => now.slice(-1)), FADING);
    return () => clearTimeout(settled);
  }, [framed?.note.id]);
  // Off every frame, onto the moment, what's over it fades once: going on through notes shown on the moment as it is
  // now neither starts the fade again nor brings back what's fading.
  useLayoutEffect(() => {
    if (framed || !layered.length) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fading = calm ? undefined : shut.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADING, easing: "ease", fill: "forwards" });
    let current = true;
    void (fading?.finished ?? Promise.resolve()).then(() => current && (setLayers([]), setOnFrame(undefined)), () => {});
    return () => void ((current = false), fading?.cancel());
  }, [!!framed]);
  const shownOpen = layers.at(-1);
  // On its picture, its thing is where the picture says, as the picture's drawn in the recording's room.
  const [, resized] = useState(0);
  useEffect(() => {
    if (!layers.length) return;
    const again = () => resized((n) => n + 1);
    addEventListener("resize", again);
    return () => removeEventListener("resize", again);
  }, [layers.length > 0]);
  const pictured = shownOpen && wasFrame(shownOpen.note);
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
    return [about, moment.acted].flatMap((named) => {
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

  // The keys: Space plays, ← and → go a frame back and on (held, on and on), S steps in and back, N notes, C compares,
  // ↑ and ↓ go a moment back and on, and with Shift a note back and on, Escape lets go. Left and right are along the
  // moment, up and down through what's listed at its edges, and neither runs on into the other.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    const typing = event.target instanceof HTMLElement && event.target.closest("textarea, input, [contenteditable]");
    // A picture on an edge with the keyboard on it is pressed with Enter or Space, as any button is.
    if (event.target instanceof HTMLElement && event.target.closest("[data-tile]") && /^( |enter)$/i.test(event.key)) return;
    // Ctrl+Enter sends.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !writing) return (event.preventDefault(), void (unsent && step.what === "send" && step.press()));
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    // Any other key pressed lets go of an arrow held; its own repeat is nothing, the page keeps its own pace.
    if (!event.repeat) arrow.letGo();
    // At the last stop there's no recording to drive: Enter presses the step left, ↑ or Escape go back to the last
    // moment, and with Shift ↑ ↓ the notes are gone through as anywhere; nothing else on it answers.
    if (atLastStop) {
      const pressing = key === "enter" && !(event.target instanceof HTMLElement && event.target.closest("button, a"));
      const did = pressing ? step.press : event.shiftKey ? { arrowup: () => nextNote(-1), k: () => nextNote(-1) }[key] : { arrowup: () => next(-1), k: () => next(-1), escape: () => next(-1) }[key];
      if (/^( |arrowdown|arrowleft|arrowright|j)$/.test(key) || did) event.preventDefault();
      if (!event.repeat) did?.();
      return;
    }
    if (key === "escape") {
      if (open) close();
      else if (comparing) compare();
      else if (noting) act({ type: "note" });
      else back();
      return;
    }
    if (key === "arrowleft" || key === "arrowright") return (event.preventDefault(), void (!event.repeat && arrow.press(key === "arrowleft" ? -1 : 1)));
    const down = () => (event.shiftKey ? nextNote(1) : next(1));
    const up = () => (event.shiftKey ? nextNote(-1) : next(-1));
    const did = { " ": play, s: stepInOrBack, n: note, c: () => (flips ? flip() : compare()), arrowdown: down, j: down, arrowup: up, k: up }[key];
    if (!did || event.repeat) return;
    event.preventDefault();
    did();
  };
  useEffect(() => {
    const down = (event: KeyboardEvent) => keys.current(event);
    const up = (event: KeyboardEvent) => /^Arrow(Left|Right)$/.test(event.key) && arrow.letGo();
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => (removeEventListener("keydown", down), removeEventListener("keyup", up));
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
    handBack.moments.map((other, i) => {
      // Its notes' dots, as its edge has them.
      const talk = notesOn(other);
      return (
        <Tile
          key={other.name}
          id={other.name}
          label={other.name}
          forward={forward}
          strong={i + 1 === n && !atLastStop}
          quiet
          picture={
            <>
              <StillPicture change={change} handBack={handBack} moment={other} about={other.about ?? other.acted} />
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
              {/* What happens, then as whom, as over the recording: here by their name alone, who they are is said there. */}
              <span className="line-clamp-2 text-[12.5px] leading-[17px] text-fg">
                {other.name}
                {other.person && <span className="text-soft"> as {other.person}</span>}
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
  // At the last stop you're on no moment: the notes are on the sheet, and the edge holds none.
  const noteTiles = (forward: boolean) =>
    (atLastStop ? [] : onEdge).map(({ note, sent: isSent }) => {
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
          picture={<NotePicture frame={frames[note.id]} focus={isNow(shownAt(note)) ? aboutHere : undefined} />}
          words={
            // Its dot first, as on the recording and on its moment's picture: a dot means a note.
            <span className="flex gap-[7px]">
              <i className={`mt-[5px] size-[7px] flex-none rounded-full shadow-[0_0_0_1.5px_#fff] ${isSent ? "bg-slate" : "bg-amber"}`} />
              <span className="min-w-0">
                <NoteWords words={words} stands={stands} fresh={fresh} short />
              </span>
            </span>
          }
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
                {carded.sent ? <Turns you={you} turns={conversation(change, carded.note.id)} /> : <Turns you={you} turns={[]} unsent={carded.note.words} />}
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
                  <span>Sent with Send, under Moments</span>
                  {/* A button as the reply box's Keep is, its padding taken from the row so the card stays its size. */}
                  <button className="-my-0.5 ml-auto rounded-md px-2 py-1 font-medium text-fg hover:bg-hover" onClick={() => (setNotes((all) => all.filter((one) => one.id !== carded.note.id)), close())}>
                    Remove
                  </button>
                </div>
              )}
            </NoteCard>
          )}
    </>
  );

  const momentsEdge = (
    <Edge
      side="left"
      label="Moments"
      keys={["↑", "↓"]}
      stage={stage}
      quiet={away}
      phone={phone}
      showing={atLastStop ? LAST_STOP : moment.name}
      foot={(forward, tucked) => <StepCard step={step} here={atLastStop} forward={forward} tucked={tucked} onPress={toLastStop} />}
    >
      {momentTiles}
    </Edge>
  );

  const title = <Title title={change.title} asked={change.asked} quiet={`${props.app} · ${backAgain(change, you) ? "back again" : "back"} ${ago(handBack.finished!, Date.now())}`} />;

  return (
    // Clipped, never scrolled: a caret put in a note's box can't move the page under you.
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-clip bg-ground phone:grid-rows-[auto_auto_minmax(0,1fr)]" onPointerDown={pressAway}>
      <Header opener={props.opener} centre={phone ? title : undefined}>
        {/* The next moment, and after the last the last stop; there, nothing. */}
        <button onClick={() => next(1)} disabled={!may.move || atLastStop} className="-mr-2 flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-soft transition-colors duration-150 ease-calm enabled:hover:bg-hover enabled:hover:text-fg disabled:opacity-50">
          Next
          <Key>↓</Key>
        </button>
      </Header>
      {/* The recording, as large as the room beside the edges lets it be: the same size from one moment to the next. */}
      <div className="relative grid min-h-0 place-items-center [container-type:size] phone:[container-type:inline-size]">
        <div
          ref={stage}
          className="relative overflow-visible rounded-lg"
          style={{ aspectRatio: `${screen.width} / ${screen.height}`, ...(phone ? { width: "calc(100cqw - 32px)", marginTop: 3 * 22 + 8, marginBottom: UNDER } : inItsRoom(screen.width / screen.height)) }}
          onPointerMove={(event) => (movePill(event), setAiming(!(event.target as Element).closest("[role=toolbar]")))}
          onPointerLeave={() => setAiming(false)}
        >
          {/* What this is, on the recording's top, wherever that stands: the change's title, quietly, and under it the
              moment in the agent's words, then as whom ("… as Maja, the admin"). Those take two lines at most, three on a phone, growing up into room kept
              for them, so nothing under them moves. */}
          <div className="absolute inset-x-0 bottom-full mb-3 flex flex-col items-center phone:mb-2 phone:items-start">
            {/* At the last stop there's no moment to name: the change's title takes the moment's line, as the sheet's
                heading, and its own small place over it rests empty. Both stay drawn, one faded out, so nothing moves. */}
            {!phone && <div className={`flex min-w-0 max-w-full justify-center transition-opacity duration-[240ms] ease-calm ${atLastStop ? "pointer-events-none opacity-0" : ""}`}>{title}</div>}
            <div className="grid w-full">
              <p className={`line-clamp-2 text-center text-[15px] leading-[22px] text-balance text-fg transition-opacity duration-[240ms] ease-calm [grid-area:1/1] phone:line-clamp-3 phone:text-left ${atLastStop ? "opacity-0" : ""}`} title={moment.name}>
                {moment.name}
                {who && <span className="text-soft"> as {who}</span>}
              </p>
              <p aria-hidden={!atLastStop} className={`min-w-0 self-end truncate text-center text-[15px] leading-[22px] text-fg transition-opacity duration-[240ms] ease-calm [grid-area:1/1] phone:text-left ${atLastStop ? "" : "opacity-0"}`}>
                {change.title}
              </p>
            </div>
          </div>
          <div
            className="absolute inset-0 overflow-hidden rounded-lg bg-paper shadow-frame"
            onClick={(event) => !noting && !(event.target as Element).closest("button") && (opened ? close() : play())}
          >
            {/* The very layer the moment left was drawn in, kept by its key and laid out as it was, picture and all, so its
                recording stays as drawn rather than being loaded and drawn again: it's only told nothing more. */}
            {behind && (
              <div key={behind.recording} className="pointer-events-none absolute inset-0">
                <Picture shot={{ src: picture(change.id, handBack.number, behind.recording, 0) }} />
                <Player change={change.id} handBack={handBack.number} recording={behind.recording} at={behind.at} hand={!standIn} />
              </div>
            )}
            <div key={moment.recording} className="absolute inset-0 animate-arrive" onAnimationEnd={(event) => event.target === event.currentTarget && setBehind(undefined)}>
              {(!phone || readings) && <Picture shot={{ src: picture(change.id, handBack.number, moment.recording, 0), crop: closer }} />}
              <Player
                change={change.id}
                handBack={handBack.number}
                recording={moment.recording}
                crop={closer}
                at={at}
                playing={comparing ? undefined : playing}
                cut={cut}
                clock={clockOf}
                onStop={() => act({ type: "played" })}
                marks={marks}
                onMarks={(placed) => setPlaced({ recording: moment.recording, placed })}
                things={aimingNote ? glimpsed : undefined}
                onPlace={aimingNote ? (on) => act({ type: "pointed", writing: { note: { id: newId(), on: { handBack: handBack.number, moment: moment.name, at, ...on }, words: "" }, spot: { ...pointer.current } } }) : undefined}
                scrolled={scrolled}
                hand={!standIn}
                drawn={drawn}
                frameFrom={frameFrom}
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
                  { label: "Now", handBack: handBack.number, recording: moment.recording, side: 0, actualSize: { ...leading, holds: holdsAt } },
                  { label: "When you last saw it", handBack: then.handBack.number, recording: then.moment.recording, side: 1, actualSize: { ...beside, holds: holdsAt } },
                ].map((side) => (
                  <div key={side.label} className="relative min-w-0 flex-1">
                    <div className="absolute inset-0 overflow-hidden rounded-lg bg-paper shadow-frame">
                      <Player
                        change={change.id}
                        handBack={side.handBack}
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
                    {wasFrame(note) ? (
                      <img src={wasFrame(note)!.src} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-contain" />
                    ) : (
                      <Player
                        change={change.id}
                        handBack={made.handBack}
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
          {/* The last stop's sheet, in the recording's very frame, coming in over it and going as a moment does. */}
          {sheetDrawn && (
            <div ref={sheet} className={`absolute inset-0 z-[15] ${atLastStop ? "animate-arrive" : "pointer-events-none"}`}>
              <LastStop
                asked={change.asked}
                notes={sending.current.map(({ note, sent: isSent }) => {
                  // The note's card as it is on the Notes edge forward, with the moment it's on, since here they come
                  // from several; amber while it's yours to send, slate once it's gone.
                  const on = handBack.moments.findIndex((one) => one.name === note.on?.moment) + 1;
                  const words = says(note, isSent).words;
                  return {
                    id: note.id,
                    card: (
                      <Tile
                        id={note.id}
                        label={words}
                        forward
                        strong={false}
                        strip
                        picture={<NotePicture frame={sheetFrames[note.id]} />}
                        words={
                          <span className="flex gap-[7px]">
                            <i className={`mt-[5px] size-[7px] flex-none rounded-full shadow-[0_0_0_1.5px_#fff] ${step.taken === "Sent" ? "bg-slate" : "bg-amber"}`} />
                            <span className="min-w-0">
                              <span className="block text-[12.5px] leading-[17px] text-fg">{words}</span>
                              {on > 0 && <span className="mt-0.5 block line-clamp-1 text-[11.5px] leading-4 text-soft">{handBack.moments[on - 1]!.name}</span>}
                            </span>
                          </span>
                        }
                        onPress={() => on && may.move && goTo(on, note.id)}
                      />
                    ),
                  };
                })}
                unwatched={props.unwatched.length}
                unopened={props.unopened.length}
                onUnwatched={() => props.unwatched[0] && may.move && goTo(props.unwatched[0])}
                onUnopened={() => props.unopened[0] && may.move && goTo(props.unopened[0].moment, props.unopened[0].note)}
              />
            </div>
          )}
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
            {/* At the last stop, the one thing to do there. */}
            {atLastStop ? (
              <StepAction step={step} />
            ) : (
            <>
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
              <span className={`${ITEM} ${PLAYS} cursor-default px-1!`}>
                <span className="truncate rounded-full bg-[#EDB654] px-[7px] text-[11.5px] leading-[19px] text-[#3B2A07]">{person ? `You, as ${person}` : "You"}</span>
              </span>
            ) : (
              // A still has nothing to play: Play and its arrows rest where they are, as anything that can't be pressed
              // does, and Play says why when it's pointed at.
              <>
                <FrameButton by={-1} disabled={!may.frameBefore} onStep={() => frame(-1)} held={arrow} />
                {/* The tip stands beside Play, not in it, so it's as clear as any other while Play rests. */}
                <span className="group/tip relative flex">
                  <button className={`${ITEM} relative w-[96px] phone:w-[56px]`} disabled={!may.play} aria-description={still ? STILL : undefined} onClick={play}>
                    <span className="w-9 text-left">{playing ? "Pause" : "Play"}</span> <Key className="min-w-9">Space</Key>
                    {!still && <Progress clock={clockOf} share={shareOf(at)} shareOf={shareOf} moving={!!playing} shown={!atPoint && !away} />}
                  </button>
                  {still && <Tip>{STILL}</Tip>}
                </span>
                <FrameButton by={1} disabled={!may.nextFrame} onStep={() => frame(1)} held={arrow} />
              </>
            )}
            {/* On a phone, "Stepping…": its amber line says where, and the bar fits 390 wide with the arrows by Play. */}
            <button className={`${ITEM} relative w-[116px] phone:w-[84px]`} disabled={!may.stepIn && !may.back} aria-pressed={stepping} onClick={stepInOrBack}>
              {inApp ? "Back" : stepping ? <>Stepping<span className="phone:hidden"> in</span>…</> : "Step in"} {!stepping && <Key>{inApp ? "Esc" : "S"}</Key>}
              {stepIn.getting && <Getting {...stepIn.getting} />}
            </button>
            <button className={`${ITEM}`} disabled={!may.note} aria-pressed={noting} onClick={note}>
              Note <Key>N</Key>
            </button>
            {(anyLook || sent.some(earlier)) &&
              (flips ? (
                // A note from an earlier hand-back open: how it was, or now, flipped in place. Each part chooses itself.
                // Its thing not in the moment now, Now rests, and says why when the switch is pointed at.
                <span role="group" aria-label="Shown" className={`${COMPARING} group/tip relative flex items-stretch rounded-lg bg-hover p-0.5`}>
                  {(["As it was", "Now"] as const).map((words) => {
                    const chosen = (words === "As it was") === flipped;
                    return (
                      <button
                        key={words}
                        aria-pressed={chosen}
                        disabled={!chosen && !nowThere}
                        aria-description={!chosen && !nowThere ? NOT_NOW : undefined}
                        onClick={() => !chosen && flip()}
                        className={`flex flex-auto items-center justify-center rounded-md px-2 phone:px-[5px] whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 ease-calm ${chosen ? "cursor-default bg-surface text-fg shadow-[0_0_0_1px_var(--edge),0_1px_2px_var(--drop)]" : "text-soft enabled:hover:text-fg disabled:cursor-default disabled:opacity-50"}`}
                      >
                        {words}
                      </button>
                    );
                  })}
                  {!nowThere && <Tip>{NOT_NOW}</Tip>}
                </span>
              ) : then ? (
                <button className={`${ITEM} ${COMPARING}`} disabled={!may.compare} aria-pressed={comparing} onClick={compare}>
                  Compare <Key>C</Key>
                </button>
              ) : (
                // Nothing to compare: what it is, in Compare's place.
                <span className={`${ITEM} ${COMPARING} cursor-default text-faint!`}>{looking ? "Unchanged" : "New"}</span>
              ))}
            </div>
            </>
            )}
          </div>
        </div>
        {stepIn.said && <p className="absolute bottom-0 left-1/2 max-w-[90%] -translate-x-1/2 translate-y-full animate-arrive rounded-md bg-surface px-3 py-1.5 text-xs text-amber-ink shadow-tip">{stepIn.said}</p>}
      </div>
      {/* Beside the recording, or under it on a phone: the change's moments, and this one's notes. */}
      <div className={phone ? "grid min-h-0 grid-cols-[minmax(0,1fr)] content-start gap-6 overflow-y-auto px-4 pt-6 pb-8" : "contents"}>
        {phone && cards}
        {/* Tab reaches them as they read, left to right; on a phone, the notes come first, nearest what they're on. */}
        {!phone && momentsEdge}
        {(!phone || (!atLastStop && onEdge.length > 0)) && (
          <Edge side="right" label="Notes" keys={["Shift", "↑", "↓"]} stage={stage} quiet={away} phone={phone} empty={atLastStop ? !sent.length && !notes.length : !onEdge.length} showing={open ?? lastArrived} arrived={lastArrived}>
            {noteTiles}
          </Edge>
        )}
        {phone && momentsEdge}
      </div>
    </div>
  );
}

const ABOUT = "about";

// The last stop's card on the Moments edge, by its name there.
const LAST_STOP = "the last stop";

// Compare's place on the bar, as wide as what it holds at its widest, so the bar is the same width whatever's there.
const COMPARING = "w-[124px] phone:w-[112px]";

// Why Now rests for a note whose thing isn't in the moment's picture now.
const NOT_NOW = "Not in this moment now";

// Why Play rests on a still.
const STILL = "A still: nothing to play";

// Play's place, with the arrows either side: in the app, who you are there takes all of it, so the bar is the same
// width there too.
const PLAYS = "w-[148px] phone:w-[100px]";

// Under the recording, room for the lower half of the bar that hangs across its edge, and a little more.
const UNDER = BAR / 2 + 20;

// Beside the recording, room for each edge's pictures at rest.
const SIDE = "clamp(104px, 10vw, 160px)";

// Over the recording, room for the change's title, who and where in two lines, and the gap under them.
const OVER = 3 * 22 + 12;

// The recording in its room, by its shape: as wide as the edges leave, or as tall as what's over and under it does.
export const inItsRoom = (shape: number) => ({ width: `min(calc(100cqw - 2 * ${SIDE}), calc((100cqh - ${OVER + UNDER}px) * ${shape}))`, marginTop: OVER, marginBottom: UNDER });

// A spot, as a thing with no size.
const spotAt = ({ x, y }: { x: number; y: number }): Rect => ({ left: x, top: y, width: 0, height: 0 });
