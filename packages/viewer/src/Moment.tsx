// A moment's page: the recording as large as the window lets it be, the bar across its foot and beside it the step left
// for the change, the change's moments on the left, and this one's notes on the right. From here: play the few seconds
// that led here, take over (the real app there, as that person), note what you click or the moment as a whole, compare
// with how it was when you last saw it, go on, or say Send or Done.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { escapedTwice, foundNow, looksAsItWas, RIGHT_AFTER, type Glimpse, type Reading } from "@playthrough/page";
import { conversation, isStill, madeInApp, newId, together, type Note, type Change, type HandBack, type Moment } from "@playthrough/change";
import { glimpses, isGuest, picture, readings as readingsOf, recording, shownByAnotherPage, source, type Listed } from "./api.ts";
import { clamp } from "./clamp.ts";
import { calledIn, changedAt, CHIP, playedTogether } from "./compare.ts";
import { DownloadVideo } from "./DownloadVideo.tsx";
import { Edge, MORE, Tile, useMore } from "./Edge.tsx";
import { Header, headerRows, Title } from "./Header.tsx";
import type { YourReply } from "./kept.ts";
import { Key } from "./Key.tsx";
import { arrived, can, isPlaying, isStepped, reduce, type Action } from "./mode.ts";
import { Progress, Getting, FrameButton, Tip, Notice, CantTakeOver, ITEM, BAR, PHONE_BAR } from "./MomentBar.tsx";
import { Turns, useFrames, NoteWords, NotePicture, NoteCard, NoteWas, Write, type Made } from "./Note.tsx";
import { usePhone } from "./phone.ts";
import { Picture } from "./Picture.tsx";
import { Pinned, type Pin } from "./Pinned.tsx";
import { Clock, Player, useCut, type Mark, type Placed } from "./Player.tsx";
import { TAG } from "./PointerTag.tsx";
import { Portal } from "./Portal.tsx";
import { doneIn, type Rect, type Scrolled } from "./replay.ts";
import { ago, noteSays, shownIn, shownOn, takingOf, seenOf } from "./standing.ts";
import { Share } from "./Share.tsx";
import { StepBox, StepNotice, useStepLeft } from "./StepLeft.tsx";
import { backAgain } from "./step.ts";
import { useKeptReady, useTakeOver } from "./takeOver.ts";
import { useHeld } from "./held.ts";
import { agentTo, tagged, TAGGED_WHILE_PLAYING } from "./tag.ts";
import { overAPause } from "./stepping.ts";
import { startOn, StillPicture } from "./Still.tsx";
import { STEPPING_BACK, STEPPING_OUT, STEPS_OUT, Together, type Box } from "./view.ts";

// How long what you did takes to fade out, back to the moment.
const FADING = 300;
// How long a frame takes to come in over the moment, as `animate-arrive` has it.
const ARRIVING = 240;
// How long a recording takes to say where its things are once it's laid, as the player's settle has it, and a little.
const SETTLING = 520;

// Where a moment's recording ends, and where what's shown of it starts.
export const endOf = (moment: Moment) => Math.max(0, moment.length - 0.05);
export const startOf = (moment: Moment) => Math.min(moment.from, endOf(moment));

export function MomentView(props: {
  change: Change;
  // The app it's in, by its name.
  app: string;
  handBack: HandBack;
  n: number;
  about?: { role: string; name: string };
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
  // The moments you haven't watched, by their place from 1.
  unwatched: number[];
}) {
  const { change, handBack, n, about, notes, setNotes, replies, setReplies, you, onMoment } = props;
  // What was sent is drawn as sent at once, as the change comes back with it.
  const [justSent, setJustSent] = useState<Note[]>([]);
  const sent = [...props.sent, ...justSent.filter((note) => !props.sent.some((one) => one.id === note.id))];
  const unsent = notes.length + replies.length;
  // The step left: its box beside the bar, pressed; from anywhere, Ctrl+Enter while something's unsent.
  const step = useStepLeft(props.listed, you, (going) => setJustSent((now) => [...now, ...going]), props.goOn);
  // Done pressed with moments not watched or answers not opened: the bar says which, and the box says Done anyway.
  // Gone to another moment, it's asked again.
  const [doneAnyway, setDoneAnyway] = useState(false);
  useEffect(() => setDoneAnyway(false), [n]);
  const unwatched = props.unwatched.filter((one) => one !== n);
  const unopened = props.unopened;
  const toDo = [
    unwatched.length > 0 && { words: `${unwatched.length} ${unwatched.length === 1 ? "moment" : "moments"} not watched`, go: () => may.move && goTo(unwatched[0]!) },
    unopened.length > 0 && { words: `${unopened.length} ${unopened.length === 1 ? "answer" : "answers"} not opened`, go: () => may.move && goTo(unopened[0]!.moment, unopened[0]!.note) },
  ].filter((one) => !!one);
  // The box does what it says, from wherever you are, the app yours or not: Send sends, Done ends the change.
  const pressStep = () => {
    if (step.what === "done" && !step.taken && !step.said && !doneAnyway && toDo.length) return setDoneAnyway(true);
    step.press();
  };
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
  // The picture's one window onto the moment's page, which the wheel brings closer and a drag moves, the moment's own
  // picture and Compare's two sides alike. On a phone, the whole screen is too small to read: it starts closed in on
  // what the moment is about, with the whole of the dialog or panel it's in, and a drag moves it from there. Each moment
  // starts afresh.
  const phone = usePhone();
  const closeTo = about ?? moment.acted;
  const closer = useMemo(() => (phone ? startOn(readings?.at(-1), closeTo, screen.width / screen.height) : undefined), [phone, readings, closeTo?.role, closeTo?.name]);
  const pageWindow = useMemo(() => new Together(flushSync), [phone, moment.recording]);
  // Moved, what's drawn over the picture by where things are on it is placed again.
  const [, windowMoved] = useState(0);
  useEffect(() => pageWindow.follow(() => windowMoved((times) => times + 1)), [pageWindow]);
  const cut = useCut(change.id, handBack.number, moment);
  const [clockOf] = useState(() => new Clock(end));
  const [bothOf] = useState(() => new Clock(0));
  // What the page is doing, one thing at a time, and where the recording rests. Every press is an action, carrying
  // where the recording has got to. It opens at the moment's end, with a note open where its address names one,
  // on this moment; another moment, going to it is an action too, so nothing of this one is drawn there.
  // Which moment of this hand-back a note is on: its own, or where it's shown since the agent took its own out.
  const isOn = (note: Note, name: string) => shownOn(change, handBack, note) === name;
  const [page, setPage] = useState(() => arrived(moment.name, from, end, [...props.sent, ...notes].some((one) => one.id === props.opening && isOn(one, moment.name)) ? props.opening : undefined));
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
  // Once you take over, the app takes the page: what's beside the recording and over it goes, and the recording grows into
  // their room. On a phone there's none beside it to take.
  const takes = away && !phone;
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
  // A hand-back after the first that's compared with nothing went on as the one before, unrun: a question answered with
  // nothing changed (`unchangedOn`).
  const unrun = !change.comparisons.some((one) => one.handBack === handBack.number);
  const unchanged = compared ? !compared.findings.some((finding) => finding.seen.some((seen) => seen.moment === moment.name)) : !!looking && unrun;
  const then = unchanged ? undefined : looking;
  const both = useMemo(() => then && cut && playedTogether(cut, together(moment, then.moment)), [cut, then?.moment.recording, moment.recording]);
  // Not yet moved by the person, Compare opens framed on what was done in the moment and what changed, on either side,
  // as both sides' readings and recordings tell: what was done is each click and typing, and the whole of the last thing
  // done to. It's drawn once they've told it, so it never opens anywhere else first.
  const [opensOn, setOpensOn] = useState<{ recording: string; changed: Box[]; done: Box[] }>();
  useEffect(() => {
    const now = readings?.at(-1);
    if (!then || !now) return;
    let current = true;
    const findings = compared ? compared.findings : [];
    const was = then.handBack.number;
    Promise.all([readingsOf(change.id, was, then.moment.recording), recording(change.id, handBack.number, moment.recording), recording(change.id, was, then.moment.recording)]).then(
      ([readThen, eventsNow, eventsThen]) => {
        const actedOn = (reading: Reading | undefined, acted: Moment["acted"]) => (acted ? calledIn(reading, acted) : []);
        const done = [...doneIn(eventsNow, from), ...doneIn(eventsThen, startOf(then.moment)), ...actedOn(now, moment.acted), ...actedOn(readThen.at(-1), then.moment.acted)];
        if (current) setOpensOn({ recording: moment.recording, changed: changedAt(findings, moment.name, readThen.at(-1), now), done });
      },
      () => {},
    );
    return () => void (current = false);
  }, [readings, then?.moment.recording]);
  const framedOn = opensOn?.recording === moment.recording ? opensOn : undefined;
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
  const drawn = useRef<(() => { x: number; y: number; worn: number } | undefined) | undefined>(undefined);
  const [standIn, setStandIn] = useState(false);
  // Whose hands it is, on its tag: as it starts playing, for a little under two seconds.
  const [playedAWhile, setPlayedAWhile] = useState(false);
  useEffect(() => {
    setPlayedAWhile(false);
    if (!playing) return;
    const after = setTimeout(() => setPlayedAWhile(true), TAGGED_WHILE_PLAYING);
    return () => clearTimeout(after);
  }, [!!playing]);
  const agent = agentTo(isGuest());
  // Where the recording rests, which the edges and what this is stand by; and the recording, which fills it but while
  // the app is yours, when it takes the page.
  const itsPlace = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const pill = useRef<HTMLSpanElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  // How wide noting's words are, whole: the bar's one width, which its places spread evenly across at rest.
  const notingRuler = useRef<HTMLDivElement>(null);
  const [notingWide, setNotingWide] = useState(0);
  useLayoutEffect(() => {
    const ruler = notingRuler.current;
    if (!ruler) return;
    const measure = () => setNotingWide(ruler.offsetWidth);
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(ruler);
    return () => watching.disconnect();
  }, [phone]);
  const [aiming, setAiming] = useState(false);
  // One Escape in the app, Back's Esc key lights, and fades over the time a second one would take you back.
  const backKeys = useRef<HTMLSpanElement>(null);
  const escapedOnce = () =>
    backKeys.current?.firstElementChild?.animate([{ backgroundColor: "#EDB654", color: "#3B2A07", boxShadow: "0 0 0 1px #EDB654" }, {}], {
      duration: RIGHT_AFTER,
      easing: matchMedia("(prefers-reduced-motion: reduce)").matches ? "steps(1, end)" : "ease-in",
    });
  const takeOver = useTakeOver({ change: change.id, handBack: handBack.number, moment, page, clock: clockOf, act, pointing: () => note(), escapedOnce });

  // The app shows whole, so Back is to the whole moment, as fresh: let go of while the app still covers it, so the
  // picture it closes onto is the screen it was.
  const wasInApp = useRef(false);
  useLayoutEffect(() => {
    if (wasInApp.current && !inApp) pageWindow.letGo();
    wasInApp.current = inApp;
  }, [inApp]);
  // Brought closer, the picture goes out to the whole screen as soon as Take over is pressed, while the app is on its way,
  // so the app comes in over the same picture it shows, without a jump; called off, it stays whole.
  useLayoutEffect(() => {
    if (stepping) pageWindow.wholeAgain(STEPS_OUT);
  }, [stepping]);
  // The wheel over a note's pin or card on the picture is the picture's, as it is anywhere else on it, Ctrl or not, and
  // never the page's: only a card's words, while they can still scroll that way, take a plain turn first.
  useEffect(() => {
    const shown = stage.current;
    if (!shown) return;
    const heard = (event: WheelEvent) => {
      const on = event.target instanceof Element ? event.target : undefined;
      if (!on?.closest("[data-pin], [data-note-card]") || (!event.ctrlKey && scrollsFirst(on, event.deltaY))) return;
      const picture = document.elementsFromPoint(event.clientX, event.clientY).find((one) => one.matches("[data-picture]"));
      if (picture && !picture.dispatchEvent(new WheelEvent("wheel", event))) event.preventDefault();
    };
    shown.addEventListener("wheel", heard, { passive: false });
    return () => shown.removeEventListener("wheel", heard);
  }, []);

  // Going to another moment, the one you were on stays under the new one, drawn just as it was where it stood, until the
  // new one has come in over it. Its picture would do it no justice: taken by another browser, its words fall a little
  // wider and heavier, and two moments that look the same would blend into doubled, swollen words.
  const [behind, setBehind] = useState<{ recording: string; at: number }>();
  const was = useRef(moment);
  if (was.current !== moment) {
    if (was.current.recording !== moment.recording && !phone && !matchMedia("(prefers-reduced-motion: reduce)").matches) setBehind({ recording: was.current.recording, at: clockOf.at });
    was.current = moment;
  }

  // What you said on this moment, sent and then unsent, in the order said: the edge's pictures, and the pins.
  const mine = notes.filter((one) => isOn(one, moment.name));
  const theirs = sent.filter((one) => isOn(one, moment.name));
  const said = [...theirs.map((note) => ({ note, sent: true })), ...mine.map((note) => ({ note, sent: false }))];
  const onEdge = said.filter(({ note }) => !takeOver.madeThere(note));
  // What was new as you came to the change stays new here until you open it: coming to its moment counts as seeing it,
  // for what's next and for next time.
  useEffect(() => void (open && props.onOpened(open)), [open]);
  const says = (note: Note, sent: boolean) => {
    const said = noteSays(change, you, note, sent, replies);
    const fresh = sent && said.stands !== "sent" && said.stands !== "reply not sent" && props.unopened.some((one) => one.note === note.id);
    return { ...said, fresh, stands: said.stands === "new answer" || said.stands === "answered" ? (fresh ? "new answer" : "answered") : said.stands };
  };
  // A note on nothing in it, the whole moment, is shown on the moment as it is now, at its end; so is one on the change
  // as a whole, which earlier versions kept, shown on the last moment.
  const madeAt = (note: Note): Made | undefined => {
    const on = note.on;
    if (!on || onNothing(note)) return { handBack: handBack.number, recording: moment.recording, at: moment.length };
    const thing = on.element?.node !== undefined ? { node: on.element.node } : on.point && { point: on.point };
    if (madeInApp(on)) return { handBack: on.handBack, recording: on.recording, at: Math.min(on.length, on.at), ...thing };
    const taking = change.handBacks.find((one) => one.number === on.handBack)?.moments.find((one) => one.name === on.moment);
    return taking && { handBack: on.handBack, recording: taking.recording, at: on.at ?? taking.length, ...thing };
  };
  // A note's element number is good only in the recording it was read from: this taking's, where it was made on it.
  const onThisTaking = (on: Note["on"]) => !!on && !madeInApp(on) && on.handBack === handBack.number;
  // A thing on the moment's page by its role and name, as it was read at its end.
  const nodeOf = (named?: { role: string; name: string }) => named && readings?.at(-1)?.things.find((thing) => thing.role === named.role && thing.name === named.name)?.node;
  // The readings of the earlier takings this moment's notes were made on, which tell what each note's thing is now.
  const takenThen = (note: Note) => {
    const made = note.on && !madeInApp(note.on) && !onThisTaking(note.on) ? madeAt(note) : undefined;
    return made && `${made.handBack}/${made.recording}`;
  };
  const [readThen, setReadThen] = useState<Record<string, Reading[]>>({});
  const wanted = [...new Set(onEdge.flatMap(({ note }) => takenThen(note) ?? []))].filter((taking) => !(taking in readThen));
  useEffect(() => {
    for (const taking of wanted) {
      const [number, recording] = [Number(taking.slice(0, taking.indexOf("/"))), taking.slice(taking.indexOf("/") + 1)];
      readingsOf(change.id, number, recording).then((kept) => setReadThen((was) => ({ ...was, [taking]: kept })));
    }
  }, [wanted.join(" ")]);
  // Until they've come, nothing a note is on is known, so nothing is drawn on a thing that might be the wrong one.
  const allRead = !!readings && !wanted.length;
  // A note made on an earlier taking: its thing then, and the thing it became, as the two readings of its step tell.
  const thenAndNow = (note: Note) => {
    const then = readThen[takenThen(note) ?? ""];
    return then && readings && note.on?.element ? foundNow(then, readings, note.on.element, madeAt(note)!.at) : undefined;
  };
  // Where its answer says its thing shows in this moment: followed there as it was handed back, at the frame it's on.
  const followed = (note: Note) => {
    const shown = shownIn(handBack, note);
    return shown?.moment === moment.name ? shown : undefined;
  };
  // Its thing in the picture now: made on this taking, that very thing; on an earlier one, where its answer says it
  // shows, or else the thing it became; made in the app, where no reading of it is kept, the same thing by its role and
  // name.
  const nodeNow = (note: Note) => {
    const on = note.on;
    if (onThisTaking(on)) return on?.element?.node;
    const shown = followed(note);
    if (shown) return shown.element.node;
    if (!on?.element || !readings) return undefined;
    if (madeInApp(on)) return nodeOf(on.element);
    return thenAndNow(note)?.now.node;
  };
  // A note is shown on its thing as it is now wherever that thing is in the moment's picture now, found as its pin is;
  // only otherwise on the frame it was made on, which is what its kept picture is drawn from.
  const nowOn = (note: Note) => {
    const node = nodeNow(note);
    if (followed(note)) return node;
    return node !== undefined && readings?.at(-1)?.things.some((thing) => thing.node === node) ? node : undefined;
  };
  // Where on the moment as it is now: at the frame its answer says it shows at, else at its end.
  const nowAt = (note: Note) => followed(note)?.at ?? moment.length;
  const shownAt = (note: Note): Made | undefined => {
    const node = nowOn(note);
    const frame = followed(note)?.frame;
    return node !== undefined ? { handBack: handBack.number, recording: moment.recording, at: nowAt(note), node, ...(frame && { frame }) } : madeAt(note);
  };
  const isNow = (shown?: Made) => !!shown && shown.handBack === handBack.number && shown.recording === moment.recording && Math.abs(shown.at - moment.length) < 0.1;
  const frames = useFrames(change, allRead ? onEdge.map(({ note }) => ({ note, shown: shownAt(note) })) : []);
  // A note from an earlier hand-back is shown on the moment as it is now, at its end, on its thing where that's found
  // there; how it was, the frame it was made on, is one flip away, asked for only once it's open. Its thing not
  // there now (gone since, or on a page you went to after taking over), there's no now to show it on: it's shown as
  // it was, and a pin never stands on whatever is there instead.
  const earlier = (note: Note) => !!note.on && !onNothing(note) && note.on.handBack < handBack.number;
  const found = (note: Note) => nowOn(note) !== undefined;
  const opened = onEdge.find(({ note }) => note.id === open);
  const flips = !!opened && earlier(opened.note);
  const nowThere = !!opened && found(opened.note);
  const flipped = flips && (!nowThere || (mode.is === "a note open" && !!mode.asItWas));
  const wasFrames = useFrames(change, opened && earlier(opened.note) && found(opened.note) ? [{ note: opened.note, shown: madeAt(opened.note) }] : []);
  // What a note from an earlier hand-back was on as it was written, shown with its words where it looks different now,
  // so they read as they were meant: the reading that showed it then, and where it was there. Looking the same, the
  // ring is on it already; made in the app, no reading of it is kept.
  const asItWas = (note: Note) => {
    const found = earlier(note) && nowOn(note) !== undefined ? thenAndNow(note) : undefined;
    return found && !looksAsItWas(found.then.thing, found.now) ? found.then : undefined;
  };
  // The kept picture of the frame a note was made on.
  const wasFrame = (note: Note) => (earlier(note) && found(note) ? wasFrames[note.id] : frames[note.id]);
  // A note's pin is on the recording whenever its thing is in the picture: made on this taking, that very thing; on
  // an earlier taking, the thing it became; in the app, the same thing drawn here, by its role and name. One on a spot is
  // on this taking's picture only where it was made.
  const markOf = (note: Note): Mark => {
    const on = note.on;
    const node = nodeNow(note);
    if (node !== undefined) return { id: note.id, node };
    if (onThisTaking(on) && on?.point && Math.abs((on.at ?? end) - at) < 0.06) return { id: note.id, point: on.point };
    return { id: note.id };
  };
  const pinned = [...onEdge, ...(writing ? [{ note: writing.note, sent: false }] : [])];
  const marks: Mark[] = pinned.map(({ note }) => markOf(note));
  const pinFor = ({ note, sent }: { note: Note; sent: boolean }): Pin => ({ id: note.id, on: [note.id], ink: sent ? "var(--slate)" : "var(--amber)", fill: sent ? "bg-slate" : "bg-amber" });

  // A note open shows where it's shown, its pin on its thing and what's been said on it, and nothing more: from an
  // earlier hand-back, the moment as it is now, or flipped, the frame it was made on; else the frame it was made on,
  // wherever that was. A frame fades in over the moment, and out again where it was.
  const openMade = opened && (!earlier(opened.note) ? shownAt(opened.note) : flipped ? madeAt(opened.note) : { handBack: handBack.number, recording: moment.recording, at: nowAt(opened.note) });
  // The moment itself is where it's shown: at its end, or for a note from an earlier hand-back, at the frame its thing
  // shows at now, the moment resting there.
  const openNow = !!opened && (earlier(opened.note) ? !flipped : isNow(openMade));
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
  // A note open on a frame of its own shows somewhere the app can't be taken to: taking over from it would swap the
  // picture for the moment's and open the app there. Closed, Take over answers again. In the app, it's Back.
  const takeOverOrBack = () => (inApp ? may.back && takeOver.back() : may.takeOver && takeOver.takeOver());
  const back = () => may.back && takeOver.back();
  const note = () => may.note && act({ type: "note" });
  // Flipped, its ring and card go to its thing in the picture coming in as that cross-fades in or out, in step with it;
  // and from its kept picture to the recording there, once that has said where it is, as As it was comes in. Only then:
  // as the view moves, they never trail it.
  const [easing, setEasing] = useState<string>();
  const easeFor = useRef(0);
  const ease = (ms: number, curve: string) => {
    if (unmoving()) return;
    clearTimeout(easeFor.current);
    setEasing(`${ms}ms ${curve}`);
    easeFor.current = window.setTimeout(() => setEasing(undefined), ms);
  };
  const flip = () => may.flip && (act({ type: "flip" }), openNow ? ease(ARRIVING, "var(--ease-calm)") : ease(FADING, "ease"));
  // Opened or closed, it stops where it's got to, and the picture stays where the person has it.
  const compare = () => {
    if (!may.compare) return;
    pageWindow.compareTurned();
    act({ type: "compare" });
  };
  const goTo = (to: number, open?: string) => {
    const other = handBack.moments[to - 1]!;
    act({ type: "moment", moment: other.name, starts: startOf(other), end: endOf(other), open });
    onMoment(to);
  };
  // While the app is yours, or on its way, a moment pressed leaves it as Back does, on the way there: one press for Back
  // and the press. The keys stay the app's. It says whether to go on.
  const leaving = () => (away ? may.back && (takeOver.back(), true) : may.move);
  // Past the first moment or the last, nothing: the step left is the box beside the bar.
  const next = (by: number) => {
    if (!may.move) return;
    const to = n + by;
    if (to < 1 || to > count) return;
    goTo(to);
  };
  // The moment you're on, pressed in the app, is Back.
  const toMoment = (to: number) => (to === n ? away && back() : leaving() && goTo(to));
  const openNote = (id: string) => may.move && act({ type: "open", note: id });
  // What you said on a moment of the change, in the order its edge has it: one made in the app joins once you're back.
  const notesOn = (other: Moment) => (other === moment ? onEdge.map(({ note }) => note) : [...sent, ...notes].filter((one) => isOn(one, other.name)));
  // The note before or the next, through the whole change: this moment's one after another, then on to the nearest
  // moment that has one, its first going on, its last going back. Past the change's last or first, nothing.
  const nextNote = (by: 1 | -1) => {
    if (!may.move) return;
    const here = notesOn(moment);
    const i = here.findIndex((one) => one.id === open);
    const to = here[i < 0 ? (by > 0 ? 0 : here.length - 1) : i + by];
    if (to) return openNote(to.id);
    for (let other = n + by; other >= 1 && other <= count; other += by) {
      const there = notesOn(handBack.moments[other - 1]!).at(by > 0 ? 0 : -1);
      if (there) return goTo(other, there.id);
    }
  };
  // Where a note on nothing stands, being written or open: over the bar's middle, as wide as a note's box.
  const overTheBar = () => {
    const [wide, high] = [stage.current?.clientWidth ?? 0, stage.current?.clientHeight ?? 0];
    return spotAt({ x: Math.max(8, wide / 2 - 140) + 24, y: high - BAR / 2 - 8 });
  };
  // A note on the moment as a whole: on its hand-back and moment, at no time and on no thing, so it has no pin. Its box
  // stands where a note on nothing does, over the bar's middle.
  const wholeMoment = () => act({ type: "pointed", writing: { note: { id: newId(), on: { handBack: handBack.number, moment: moment.name }, words: "" }, spot: { x: overTheBar().left, y: overTheBar().top } } });
  const close = () => act({ type: "close" });
  const save = (words: string) => {
    if (!writing) return;
    keep({ ...writing.note, words });
    act({ type: "written" });
  };
  const keep = (kept: Note) => {
    if (!phone) lightSend();
    setNotes((all) => [...all, kept]);
    takeOver.saved(kept);
  };
  // Take over didn't work here: the note saying so is the person's own, saved as any is, and carries why for the agent.
  const tellAgent = () => {
    const cant = takeOver.cant;
    if (!cant) return;
    keep({ id: newId(), on: { handBack: handBack.number, moment: moment.name, at: Math.round(Math.min(cant.from, moment.length) * 100) / 100, cantStepIn: cant.why }, words: "Take over doesn't work on this moment." });
    takeOver.closeCant();
  };
  const toldAgent = mine.some((one) => !!one.on && !madeInApp(one.on) && !!one.on.cantStepIn);
  // Saved, the note goes to the Notes edge, and the box beside the bar, saying Send one more as it's saved, lights amber
  // where it stands: nothing goes to it, since the note didn't. On a phone it's in sight under the bar already.
  const lightSend = () => {
    document.querySelector('[data-part="step"]')?.animate([{ boxShadow: "0 0 0 2px var(--amber), 0 0 0 6px color-mix(in srgb, var(--amber) 30%, transparent)" }, {}], { duration: 700, easing: unmoving() ? "steps(1, end)" : "ease-out" });
  };
  // The open note's frame over the moment, and the one before it while that fades: only ever this moment's.
  const [layered, setLayers] = useState<{ note: Note; sent: boolean; made: Made }[]>([]);
  const layers = layered.filter((one) => isOn(one.note, moment.name));
  // Where the recording on the open note's own frame has its thing, once it has said, and for which note.
  const [onFrame, setOnFrame] = useState<{ note: string; at?: Placed }>();
  const shut = useRef<HTMLDivElement>(null);
  // Opened on the moment itself, it rests where the note is shown: before it's drawn, so it never shows its end first.
  const openNowAt = opened && openNow ? (earlier(opened.note) ? Math.min(end, nowAt(opened.note)) : end) : undefined;
  useLayoutEffect(() => void (openNowAt !== undefined && Math.abs(at - openNowAt) > 0.02 && act({ type: "rest", at: openNowAt })), [opened?.note.id, openNowAt]);
  // The note open on a frame of its own, not on the moment as it is now.
  const framed = opened && openMade && !openNow ? { ...opened, made: openMade } : undefined;
  // A note from an earlier hand-back open, the frame it was made on is laid under the moment unseen, played there and
  // nothing more, so As it was only has to be shown: one fade, its thing's place already known. Only the open note's.
  const wasMade = opened && flips && nowThere ? madeAt(opened.note) : undefined;
  const ready = wasMade && { ...opened!, made: wasMade };
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
    // Back on Now, the frame kept ready keeps what it said.
    const readyFor = ready?.note.id;
    void (fading?.finished ?? Promise.resolve()).then(() => current && (setLayers([]), setOnFrame((was) => (was?.note === readyFor ? was : undefined))), () => {});
    return () => void ((current = false), fading?.cancel());
  }, [!!framed]);
  // Laid afresh for a note opened, what it says is its own.
  useLayoutEffect(() => void (ready && setOnFrame(undefined)), [ready?.note.id]);
  // The frame shown is the open note's from the render it's opened in, before its layer is laid, so what's drawn for the
  // note, its ring and its card, stays drawn in between.
  const shownOpen = framed && layers.at(-1)?.note.id !== framed.note.id ? framed : layers.at(-1);
  // On its picture, its thing is where the picture says, as the picture's drawn in the recording's room.
  const [, resized] = useState(0);
  useEffect(() => {
    if (!layers.length) return;
    const again = () => resized((n) => n + 1);
    addEventListener("resize", again);
    return () => removeEventListener("resize", again);
  }, [layers.length > 0]);
  const pictured = shownOpen && wasFrame(shownOpen.note);
  // Where a kept picture of a frame is drawn in the picture, and how large: through the window where the person has taken
  // it, as the recording is; else whole and in the middle.
  const framing = (screen: { width: number; height: number }) => {
    const shown = stage.current;
    if (!shown) return undefined;
    const room = { width: shown.clientWidth, height: shown.clientHeight };
    if (pageWindow.moved) {
      const view = pageWindow.shownIn(room, screen);
      return { k: view.k, left: -view.x * view.k, top: -view.y * view.k };
    }
    const k = Math.min(room.width / screen.width, room.height / screen.height);
    return { k, left: (room.width - screen.width * k) / 2, top: (room.height - screen.height * k) / 2 };
  };
  const onPicture = ((): Placed | undefined => {
    const framed = pictured && framing(pictured.screen);
    if (!shownOpen || !pictured || !framed) return undefined;
    const { screen, box } = pictured;
    if (!box) return {};
    const { k, left, top } = framed;
    return { [shownOpen.note.id]: { left: left + box.x * screen.width * k, top: top + box.y * screen.height * k, width: box.width * screen.width * k, height: box.height * screen.height * k } };
  })();
  // Where the open note's thing is, one answer however it's found, and none until it's known: on the moment as it is
  // now, by the recording; on its own frame, by the recording there once that's drawn, by its kept picture until then.
  // Known, and not there, it's on nothing.
  // Flipped before the recording there has said, its ring and card hold where they stood and go once, when it does; if
  // it never does, to its kept picture's place after a settle's time. Opened on its frame, its picture's place at once.
  const onItsFrame = shownOpen && onFrame?.note === shownOpen.note.id ? onFrame.at : undefined;
  const held = useRef<{ note: string; at: Placed }>(undefined);
  const holding = !!opened && held.current?.note === opened.note.id;
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    setWaited(false);
    if (!framed) return;
    const after = setTimeout(() => setWaited(true), SETTLING);
    return () => clearTimeout(after);
  }, [framed?.note.id]);
  const knownAt = opened && openNow ? placed : (onItsFrame ?? (pictured && (waited || !holding) ? onPicture : undefined));
  const openAt = knownAt ?? (holding ? held.current!.at : undefined);
  held.current = !opened ? undefined : knownAt ? { note: opened.note.id, at: knownAt } : held.current;
  // What the bar must never cover: an open note's thing while it's open; else, from the first frame shown to the last,
  // what the moment is about and the last thing done in it, where the page has them at its end, known from its reading
  // before anything is drawn. The bar is one place: over one of them, it drops just below the recording's edge for that
  // moment, still in the middle, and that's all.
  const openThing = opened && openAt?.[opened.note.id];
  const kept = (() => {
    const shown = stage.current;
    const end = readings?.at(-1);
    if (!shown || !end || closer) return [];
    const { x, y, k } = pageWindow.shownIn({ width: shown.clientWidth, height: shown.clientHeight }, end.screen);
    return [about, moment.acted].flatMap((named) => {
      const thing = named && end.things.find((one) => one.role === named.role && one.name === named.name);
      return thing ? [{ left: (thing.box.x - x) * k, top: (thing.box.y - y) * k, width: thing.box.width * k, height: thing.box.height * k }] : [];
    });
  })();
  // Until this moment's reading has come, the bar stays where it was; on the page's first moment, it waits unseen. While
  // the app is yours, or on its way, it stays where it was too: the app takes the page around it.
  const lastClear = useRef<{ x: number; y: number }>(undefined);
  const clear = (!readings && !openThing) || (away && lastClear.current) ? lastClear.current : (lastClear.current = (() => {
    const [wide, high, barWide] = [stage.current?.clientWidth ?? 0, stage.current?.clientHeight ?? 0, toolbar.current?.offsetWidth ?? 0];
    const [left, right] = [(wide - barWide) / 2, (wide + barWide) / 2];
    // What's below the picture, brought closer, isn't in it to be covered.
    const under = (openThing ? [openThing] : away || comparing ? [] : kept).filter((one) => one.top + one.height > high - BAR / 2 - 12 && one.top < high);
    const covers = under.some((one) => one.left < right + 12 && one.left + one.width > left - 12);
    return { x: 0, y: covers ? BAR / 2 : 0 };
  })());
  // The note whose card shows: open on the moment as it is now, or on the frame it was made on, until that has faded.
  const carded = opened && openNow ? opened : shownOpen && (opened ? shownOpen.note.id === opened.note.id && shownOpen : !phone && shownOpen);
  // Its card comes in by its thing, so it waits until where that is is known: it never stands somewhere else first and
  // moves. One on the whole moment stands over the bar's middle, as its box was written; only a note whose thing turns
  // out not to be there stands in the corner.
  const corner = spotAt({ x: 24, y: 24 });
  // Flipped to a frame whose thing isn't known yet, it stays where it stood until it is.
  const stood = useRef<{ note: string; by: Rect }>(undefined);
  const byThing = !carded ? undefined : phone ? corner : onNothing(carded.note) ? overTheBar() : openAt && (openAt[carded.note.id] ?? corner);
  const cardBy = byThing ?? (carded && stood.current?.note === carded.note.id ? stood.current.by : undefined);
  stood.current = carded && cardBy ? { note: carded.note.id, by: cardBy } : undefined;

  // Pressing away from what's open, anywhere but its card and its picture on the edge, closes it.
  const pressAway = (event: React.PointerEvent) => opened && !(event.target as Element).closest("[data-note-card], [data-tile]") && !stage.current?.contains(event.target as Node) && close();

  // The keys: Space plays, ← and → go a frame back and on (held, on and on), T takes over and back, N notes, C compares,
  // ↑ and ↓ go a moment back and on, and with Shift a note back and on, Escape lets go. Left and right are along the
  // moment, up and down through what's listed at its edges, and neither runs on into the other.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  const escapes = useRef(escapedTwice(RIGHT_AFTER));
  keys.current = (event) => {
    const typing = event.target instanceof HTMLElement && event.target.closest("textarea, input, [contenteditable]");
    // Ctrl+Enter sends, wherever the keyboard is but in a note being written, where it saves (`Write`).
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !writing) return (event.preventDefault(), void (unsent && step.what === "send" && step.press()));
    // A picture on an edge with the keyboard on it is pressed with Enter or Space, as any button is.
    const tile = event.target instanceof HTMLElement && event.target.closest("[data-tile]");
    if (tile && /^( |enter)$/i.test(event.key)) return;
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    // Any other key pressed lets go of an arrow held; its own repeat is nothing, the page keeps its own pace.
    if (!event.repeat) arrow.letGo();
    if (key === "escape") {
      if (takeOver.cant) takeOver.closeCant();
      else if (open) close();
      else if (comparing) compare();
      else if (noting) act({ type: "note" });
      // While the app is yours, Escape twice is Back, as it is in the app (take-over.ts); getting there, once calls it off.
      else if (!inApp) back();
      else if (!event.repeat) escapes.current(performance.now()) ? back() : escapedOnce();
      return;
    }
    // Noting, the bar holds only what to do and Cancel, and the keys say no more: N or Escape leave it, and nothing
    // else runs, so words typed before pointing, or an arrow, never drive the page or drop the note.
    if (noting) {
      if (key.length === 1 || key.startsWith("arrow")) event.preventDefault();
      if (key === "n" && !event.repeat) note();
      return;
    }
    if (key === "arrowleft" || key === "arrowright") return (event.preventDefault(), void (!event.repeat && arrow.press(key === "arrowleft" ? -1 : 1)));
    const down = () => (event.shiftKey ? nextNote(1) : next(1));
    const up = () => (event.shiftKey ? nextNote(-1) : next(-1));
    const did = { " ": play, t: takeOverOrBack, n: note, c: () => (flips ? flip() : compare()), arrowdown: down, j: down, arrowup: up, k: up }[key];
    if (!did || event.repeat) return;
    event.preventDefault();
    did();
  };
  useEffect(() => {
    const down = (event: KeyboardEvent) => keys.current(event);
    const up = (event: KeyboardEvent) => /^Arrow(Left|Right)$/.test(event.key) && arrow.letGo();
    // On the document, so the moment's keys come before W's, on the window, whichever was listening first.
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    return () => (document.removeEventListener("keydown", down), document.removeEventListener("keyup", up));
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
          part="moment"
          id={other.name}
          label={other.name}
          forward={forward}
          strong={i + 1 === n}
          quiet
          // Watched, by the same count Done's "not watched" is: softer forward, never at rest. Not on a phone.
          watched={!phone && !props.unwatched.includes(i + 1)}
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
              {/* What happens. */}
              <span className="line-clamp-2 text-[12.5px] leading-[17px] text-fg">{other.name}</span>
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
      const { words, stands, fresh, by } = says(note, isSent);
      return (
        <Tile
          key={note.id}
          id={note.id}
          label={note.words}
          forward={forward}
          strong={open === note.id}
          lit={pointed === note.id}
          waiting={fresh}
          arriving={before && !before.has(note.id) ? "right" : undefined}
          strip
          picture={<NotePicture frame={frames[note.id]} focus={isNow(shownAt(note)) ? aboutHere : undefined} />}
          words={
            // Its dot first, as on the recording and on its moment's picture: a dot means a note.
            <span className="flex gap-[7px]">
              <i className={`mt-[5px] size-[7px] flex-none rounded-full shadow-[0_0_0_1.5px_#fff] ${isSent ? "bg-slate" : "bg-amber"}`} />
              <span className="min-w-0">
                <NoteWords words={words} stands={stands} fresh={fresh} by={by} short />
              </span>
            </span>
          }
          onPress={() => openNote(note.id)}
          onPoint={(now) => setPointed(now ? note.id : undefined)}
        />
      );
    });

  const wasShown = (note: Note) => {
    const was = asItWas(note);
    const shown = stage.current;
    const drawn = shown ? pageWindow.shownIn({ width: shown.clientWidth, height: shown.clientHeight }, screen).k : 1;
    return was && <NoteWas src={source.file(change.id, note.on!.handBack, was.reading.picture)} screen={was.reading.screen} box={was.thing.box} drawn={drawn} />;
  };

  // What's said by a pin: the note being written, or the one open. On a phone, under the bar, where there's room.
  // A thread too long for its card, and on a phone the rows under the bar, fade where there's more, as an edge does.
  const thread = useRef<HTMLDivElement>(null);
  const threadMore = useMore(thread);
  // Opened, a thread comes in at its end, so its newest answer is what you see, what's before it fading above. In the
  // page's flow (on a phone) it doesn't scroll by itself: what holds it brings the newest in instead,
  // clear of its own fade.
  const threadShown = !writing && !!carded && !!cardBy;
  useLayoutEffect(() => {
    const shown = thread.current;
    if (!shown) return;
    shown.scrollTop = shown.scrollHeight;
    threadMore.look();
    const newest = shown.firstElementChild?.lastElementChild;
    let holder = shown.parentElement;
    while (holder && !/auto|scroll/.test(getComputedStyle(holder).overflowY)) holder = holder.parentElement;
    if (!newest || !holder || shown.scrollHeight > shown.clientHeight) return;
    const by = newest.getBoundingClientRect().bottom - holder.getBoundingClientRect().bottom + MORE;
    if (by > 0) holder.scrollTop += by;
  }, [threadShown && carded.note.id]);
  const rows = useRef<HTMLDivElement>(null);
  const rowsMore = useMore(rows);
  const cards = (
    <>
          {writing && <NoteCard by={(!(writing.note.on && madeInApp(writing.note.on)) && placed?.[writing.note.id]) || writing.box || spotAt(writing.spot)} stage={stage} under={phone}><Write onSave={save} onDrop={() => act({ type: "written" })} /></NoteCard>}
          {/* Closing, it fades where it stood; under the bar on a phone, it goes at once, so it never holds its room. */}
          {!writing && carded && cardBy && (
            <NoteCard key={carded.note.id} by={cardBy ?? corner} stage={stage} closing={!opened} under={phone} easing={easing}>
              <div ref={thread} onScroll={threadMore.look} className="min-h-0 flex-1 overflow-y-auto px-1" style={threadMore.fade}>
                {carded.sent ? <Turns you={you} turns={conversation(change, carded.note.id)} was={wasShown(carded.note)} /> : <Turns you={you} turns={[]} unsent={carded.note.words} />}
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
                  <span>Sent with Send, by the bar</span>
                  {/* A button as the reply box's Save is, its padding taken from the row so the card stays its size. */}
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
      place={itsPlace}
      quiet={away}
      phone={phone}
      showing={moment.name}
      answers={away && may.back}
    >
      {momentTiles}
    </Edge>
  );

  // How wide the recording is, against its place: all of it, or while the app is yours, the page's room for it.
  const wide = takes ? inTheAppsRoom(screen) : "100%";

  // Compare, or a note from an earlier hand-back's As it was and Now, or what the moment is to you if neither: in the
  // recording's top left on hover, or in the bar on a phone, where nothing hovers.
  // In the corner, Compare stays beside As it was and Now; in a phone's bar, the switch takes Compare's place.
  const offered = anyLook || sent.some(earlier);
  const shownSwitch = flips && (
                // A note from an earlier hand-back open: how it was, or now, flipped in place. Each part chooses itself.
                // Its thing not in the moment now, Now rests, and says why when the switch is pointed at.
                <span role="group" aria-label="Shown" data-part="shown" className={`${COMPARING} group/tip relative flex items-stretch rounded-lg bg-hover p-0.5`}>
                  {(["As it was", "Now"] as const).map((words) => {
                    const chosen = (words === "As it was") === flipped;
                    return (
                      <button
                        key={words}
                        data-part={words === "Now" ? "now" : "as-it-was"}
                        aria-pressed={chosen}
                        disabled={!chosen && !nowThere}
                        aria-description={!chosen && !nowThere ? NOT_NOW : undefined}
                        onClick={() => !chosen && flip()}
                        className={`flex flex-auto items-center justify-center rounded-md px-2 phone:px-0 whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 ease-calm ${chosen ? "cursor-default bg-surface text-fg shadow-[0_0_0_1px_var(--edge),0_1px_2px_var(--drop)]" : "text-soft enabled:hover:text-fg disabled:cursor-default disabled:opacity-50"}`}
                      >
                        {words}
                      </button>
                    );
                  })}
                  {!nowThere && <Tip>{NOT_NOW}</Tip>}
                </span>
  );
  // Off or on as a switch says it, its knob over and its track filled, and in its words' ink, soft till it's on: in the
  // corner it's read over the recording at a glance, so it says which by its shape, quietly. On a phone, in the bar,
  // it's pressed as before, filled.
  const compareButton = then && (
                <button data-part="compare" className={`${ITEM} ${COMPARING} w-[106px]! gap-1.5! px-2! py-0.5! text-soft! enabled:hover:text-fg! aria-pressed:text-fg! phone:w-auto! phone:px-0! phone:py-1.5! phone:text-fg! phone:aria-pressed:bg-fg! phone:aria-pressed:text-ground!`} disabled={!may.compare} aria-pressed={comparing} onClick={compare}>
                  <span aria-hidden className="relative h-3 w-5 flex-none rounded-full shadow-[inset_0_0_0_1px_var(--line)] transition-colors duration-200 ease-calm in-aria-pressed:bg-fg in-aria-pressed:shadow-none phone:hidden">
                    <span className="absolute top-0.5 left-0.5 size-2 rounded-full bg-soft transition-[translate,background-color] duration-200 ease-calm in-aria-pressed:translate-x-2 in-aria-pressed:bg-surface" />
                  </span>
                  Compare <Key className="phone:hidden">C</Key>
                </button>
  );
  const comparer = offered && (shownSwitch || compareButton || (
                // Nothing to compare: what it is, in Compare's place, at its width. Said, not offered: smaller, in the
                // soft ink of words that say what something is, so it can't be taken for a button resting.
                <span className={`${COMPARING} inline-flex cursor-default items-center justify-center text-xs text-soft`}>{looking ? "Unchanged" : "New"}</span>
              ));
  // Only something to press: on a moment with nothing to compare, the corner shows nothing.
  const inCorner = offered && (then || shownSwitch) ? <>{compareButton}{shownSwitch}</> : undefined;
  // Shown in the recording's corner while the pointer is over it, or while Compare or As it was is on, so the way out is
  // in sight; never while it plays or the app is yours.
  const [overRecording, setOverRecording] = useState(false);
  const cornerShown = !phone && !!inCorner && !playing && !away && (overRecording || comparing || flipped);
  const title = <Title title={change.title} asked={change.asked} quiet={`${props.app} · ${backAgain(change, you) ? "back again" : "back"} ${ago(handBack.finished!, Date.now())}`} />;

  return (
    // Clipped, never scrolled: a caret put in a note's box can't move the page under you. Shown by another page, with
    // no header, the recording takes its room.
    <div className={`grid h-dvh ${headerRows()} overflow-clip bg-ground ${shownByAnotherPage() ? "phone:grid-rows-[auto_minmax(0,1fr)]" : "phone:grid-rows-[auto_auto_minmax(0,1fr)]"}`} onPointerDown={pressAway}>
      <Header opener={props.opener} centre={phone ? title : undefined}>
        {/* Nothing to do while the app is yours: they go with what this is, and come back with it. */}
        <div className={`flex items-center gap-3 transition-opacity ${takes ? "opacity-0" : ""}`} style={STEPPING_OUT} inert={takes}>
        {/* What you're watching as a video: this moment as it's shown, or the whole change. */}
        <DownloadVideo
          change={change}
          handBack={handBack}
          n={n}
          rests={away}
          asShown={() => ({
            ...(comparing && then && framedOn && { beside: { handBack: then.handBack.number, framedOn: { changed: framedOn.changed, done: framedOn.done } } }),
            ...(pageWindow.moved && { window: { centre: pageWindow.centre!, k: pageWindow.k! } }),
          })}
        />
        <Share change={change.id} rests={away} />
        </div>
      </Header>
      {/* Where the recording rests, as large as the room beside the edges lets it be: the same size from one moment to the next. */}
      <div className="relative grid min-h-0 place-items-center [container-type:size] phone:[container-type:inline-size]">
        <div
          ref={itsPlace}
          className="relative"
          style={{ aspectRatio: `${screen.width} / ${screen.height}`, ...(phone ? { width: "calc(100cqw - 32px)", marginTop: 3 * 22 + 8, marginBottom: BAR + GAP } : inItsRoom(screen.width / screen.height)) }}
        >
          {/* What this is, on the recording's top, wherever that stands: the change's title, quietly, and under it the
              moment in the agent's words: whose hands it's in is the pointer's to say. Those take two lines at most, three on a
              phone, growing up into room kept for them, so nothing under them moves. While the app is yours it goes where it
              stands, under the app coming over it. Coming back, it waits for the recording's edge to pass under it, so the edge
              never runs across words coming in. */}
          <div className={`absolute inset-x-0 bottom-full mb-3 flex flex-col items-center phone:mb-2 phone:items-start transition-opacity ${takes ? "opacity-0" : ""}`} style={takes ? STEPPING_OUT : STEPPING_BACK} inert={takes}>
            {!phone && !shownByAnotherPage() && <div className="flex min-w-0 max-w-full justify-center">{title}</div>}
            <p className="line-clamp-2 w-full text-center text-[15px] leading-[22px] text-balance text-fg phone:line-clamp-3 phone:text-left" title={moment.name}>
              {moment.name}
            </p>
          </div>
          {/* The recording, filling its place; while the app is yours, taking the page from it in the very move that
              takes the picture out to the whole screen, its foot, and the bar across it, where they were. Over the
              edges meanwhile, so it grows over them as they go, never under. */}
          <div
            ref={stage}
            className={`absolute bottom-0 left-1/2 overflow-visible rounded-lg transition-[width,margin-left] ${takes ? "z-31" : ""}`}
            style={{ aspectRatio: `${screen.width} / ${screen.height}`, width: wide, marginLeft: `calc(${wide} / -2)`, ...STEPPING_OUT }}
            onPointerMove={(event) => (movePill(event), setAiming(!(event.target as Element).closest("[role=toolbar]")))}
            onPointerEnter={() => setOverRecording(true)}
            onPointerLeave={() => (setAiming(false), setOverRecording(false))}
          >
          <div
            data-part="picture"
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
                moves={pageWindow}
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
                tag={agent}
                tagged={tagged({ still, playing: !!playing, playedAWhile, comparing, noting })}
                drawn={drawn}
                frameFrom={frameFrom}
              />
            </div>
            {comparing && then && both && framedOn && (
              // Now first, on the right. Both end above the bar, so nothing they're framed on is ever under it.
              <div className="absolute inset-0 z-[5] flex animate-arrive flex-row-reverse gap-3 bg-ground" style={{ paddingBottom: phone ? 0 : BAR / 2 + 8 }}>
                {[
                  { label: "Now", handBack: handBack.number, recording: moment.recording, side: 0 },
                  { label: "When you last saw it", handBack: then.handBack.number, recording: then.moment.recording, side: 1 },
                ].map((side) => (
                  <div key={side.label} className="relative min-w-0 flex-1">
                    <div className="absolute inset-0 overflow-hidden rounded-lg bg-paper shadow-frame">
                      <Player
                        change={change.id}
                        handBack={side.handBack}
                        recording={side.recording}
                        at={both.at(along)[side.side]!}
                        following={playing ? { clock: bothOf, at: (along) => both.at(along)[side.side]! } : undefined}
                        framedOn={framedOn}
                        moves={pageWindow}
                      />
                      {/* The left side's label stands just right of Compare in the corner, on the line "Now" stands on. */}
                      <span className={CHIP} style={side.side === 1 && !phone ? { left: 130 } : undefined}>{side.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(layers.length > 0 || ready) && (
              // The frame the open note was made on, over the moment: the recording there, with no pointer and nothing played,
              // drawn by this browser as Now is, so a flip changes only what changed; its kept picture under it until that's
              // drawn, and in its place if it never is. Under the pins, as the moment is, so what lies over one lies over both.
              // Kept ready on Now, it's there unseen, untouchable and unread, until it's flipped to.
              <div ref={shut} className={`absolute inset-0 z-[5] ${opened && layers.length ? "" : "pointer-events-none"}`}>
                {(ready && !layers.some(({ note }) => note.id === ready.note.id) ? [...layers, ready] : layers).map((one) => {
                  const { note, made } = one;
                  const unseen = one === ready;
                  return (
                    <div key={note.id} className={`absolute inset-0 overflow-hidden bg-paper ${unseen ? "invisible" : "animate-arrive"}`} inert={unseen} aria-hidden={unseen || undefined}>
                      {wasFrame(note) &&
                        (() => {
                          const { src, screen } = wasFrame(note)!;
                          const framed = framing(screen);
                          return <img src={src} alt="" draggable={false} className={`pointer-events-none absolute ${framed ? "max-w-none" : "inset-0 size-full object-contain"}`} style={framed && { left: framed.left, top: framed.top, width: screen.width * framed.k, height: screen.height * framed.k }} />;
                        })()}
                      <Player
                        change={change.id}
                        handBack={made.handBack}
                        recording={made.recording}
                        at={made.at}
                        moves={pageWindow}
                        hand={false}
                        marks={[{ id: note.id, ...(made.node !== undefined ? { node: made.node } : made.point && { point: made.point }) }]}
                        onMarks={note.id === (shownOpen ?? ready)?.note.id ? (at) => (setOnFrame({ note: note.id, at }), at && !unseen && !onItsFrame && ease(ARRIVING, "var(--ease-calm)")) : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <div className={`pointer-events-none absolute inset-0 ${layers.length ? "z-[6]" : ""}`}>
              {shownOpen && !openNow ? (
                <Pinned pins={[pinFor(shownOpen)]} placed={openAt} open={shownOpen.note.id} faded={!opened} onOpen={close} easing={easing} />
              ) : (
                <Pinned pins={(opened && openNow ? [opened] : pinned).map(pinFor)} placed={placed} open={writing?.note.id ?? (openNow ? opened?.note.id : undefined)} faded={!!playing || away} lit={pointed} onPoint={pointPin} onOpen={(id) => id && openNote(id)} quiet easing={easing} />
              )}
            </div>
          </div>
          {/* Compare, and As it was and Now, in the recording's top left: over the left side's label while comparing. */}
          {!phone && inCorner && (
            <div data-part="corner" className={`absolute top-2 left-2.5 z-[16] flex rounded-[10px] bg-surface p-0.5 text-xs shadow-[0_0_0_1px_var(--edge),0_2px_8px_var(--drop)] transition-opacity duration-200 ease-calm select-none gap-0.5 ${cornerShown ? "" : "pointer-events-none opacity-0"}`} inert={!cornerShown} onClick={(event) => (event.target as Element).closest("button")?.blur()}>
              {inCorner}
            </div>
          )}
          <Portal
            {...takeOver.portal}
            screen={screen}
            scrolled={() => scrolled.current?.()}
            theirs={() => drawn.current?.()}
            onStandIn={setStandIn}
            tag={still ? undefined : agent}
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
          {/* What you can do here, across the recording's bottom edge, as on the older page; on a phone, just under it. */}
          <div
            role="toolbar"
            aria-label="This moment"
            onClick={(event) => (event.target as Element).closest("button")?.blur()}
            className={`absolute top-full left-1/2 z-20 flex w-max max-w-full ${PHONE_BAR} justify-evenly gap-0.5 rounded-xl transition-[translate,opacity] duration-300 ease-calm bg-surface p-1 text-[13px] select-none ${inApp ? "outline-2 outline-[rgba(236,178,72,0.95)] outline-solid shadow-[0_6px_20px_rgba(20,24,34,0.12)]" : "shadow-[0_0_0_1px_var(--edge),0_6px_20px_var(--drop)]"}`}
            ref={toolbar}
            style={{ height: BAR, minWidth: !phone && notingWide ? notingWide + 8 : undefined, translate: phone ? "-50% 0" : `calc(-50% + ${clear?.x ?? 0}px) calc(-50% + ${clear?.y ?? 0}px)`, opacity: clear ? 1 : 0 }}
          >
            {/* What Take over has to say, just over the bar, where it was pressed: that the app starts first, what your
                browser can't be of the one the moment ran in, or in the app that its check at the end doesn't hold
                now; or, as a sheet, that it couldn't open, with what to do about
                it. Under the bar there's no room for it, but on a phone, where over it is the picture. */}
            {takeOver.cant && <CantTakeOver plainly={takeOver.cant.plainly} told={toldAgent} onTell={tellAgent} onClose={takeOver.closeCant} />}
            {(takeOver.said || takeOver.waitingOn) && (
              <Notice className={takeOver.said ? "text-amber-ink" : "text-soft"}>
                {takeOver.said || (
                  // Both lines are always there, one over the other, so the note is as wide for either and the words
                  // swap without anything moving.
                  <>
                    <span className={`transition-opacity duration-200 ease-calm [grid-area:1/1] ${takeOver.waitingOn === "the app" ? "" : "opacity-0"}`} aria-hidden={takeOver.waitingOn !== "the app"}>
                      Starting the app, which can take a minute.
                    </span>
                    <span className={`transition-opacity duration-200 ease-calm [grid-area:1/1] ${takeOver.waitingOn === "the way there" ? "" : "opacity-0"}`} aria-hidden={takeOver.waitingOn !== "the way there"}>
                      Getting to this moment.
                    </span>
                  </>
                )}
              </Notice>
            )}
            {/* Where the change stands, over the bar on every moment, but where Take over or noting has its say there. */}
            {!phone && !takeOver.cant && !takeOver.said && !takeOver.waitingOn && !noting && !writing && <StepNotice step={step} todo={doneAnyway && !step.said ? toDo : undefined} faded={!!playing} />}
            {/* The step left, in its own box at the bar's right, on its line: with the bar always, playing or in the app. */}
            {!phone && (
              <div className="absolute top-0 left-full ml-3">
                <StepBox step={step} anyway={doneAnyway} onPress={pressStep} />
              </div>
            )}
            {/* What noting says, laid out unseen, so the bar is always as wide as its widest state and never cuts it. */}
            {!phone && (
              <div ref={notingRuler} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex w-max items-center gap-2 pl-2.5">
                <span className="flex items-center gap-1.5">
                  <span>Point at what it's about</span>
                  <span>or the whole moment</span>
                </span>
                <span className={ITEM}>
                  Cancel <Key>Esc</Key>
                </span>
              </div>
            )}
            {/* Noting, the bar says what to do and how to leave, over what it holds, at its width. */}
            {noting && (
              <div className="absolute inset-1 z-1 flex animate-arrive items-center justify-between gap-2 rounded-lg bg-surface pl-2.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-soft">Point at what it's about</span>
                  {/* Or the moment as a whole: written at once, on no one thing, its box just over the bar. */}
                  <button data-part="whole-moment" className="flex-none rounded-sm text-fg underline decoration-line underline-offset-[3px] transition-colors duration-150 ease-calm hover:decoration-current" onClick={wholeMoment}>
                    or the whole moment
                  </button>
                </span>
                <button className={ITEM} onClick={() => act({ type: "note" })}>
                  Cancel <Key>Esc</Key>
                </button>
              </div>
            )}
            <div className="contents" inert={noting}>
            {/* A still has nothing to play, and while the app is yours nothing drives the recording: Play and its arrows
                rest where they are, as anything that can't be pressed does, and on a still Play says why when it's
                pointed at. */}
            <FrameButton by={-1} disabled={!may.frameBefore} onStep={() => frame(-1)} held={arrow} />
            {/* The tip stands beside Play, not in it, so it's as clear as any other while Play rests. */}
            <span className="group/tip relative flex phone:[flex:20_1_36px]">
              <button data-part="play" className={`${ITEM} relative w-[96px] phone:w-auto phone:flex-auto phone:px-0!`} disabled={!may.play} aria-description={still ? STILL : undefined} onClick={play}>
                <span className="w-9 text-left">{playing ? "Pause" : "Play"}</span> <Key className="min-w-9">Space</Key>
                {!still && <Progress clock={clockOf} share={shareOf(at)} shareOf={shareOf} moving={!!playing} shown={!atPoint && !away} />}
              </button>
              {still && <Tip>{STILL}</Tip>}
            </span>
            <FrameButton by={1} disabled={!may.nextFrame} onStep={() => frame(1)} held={arrow} />
            {/* On a phone, "Taking…": its amber line says where, and the bar has room for the arrows by Play. Its words are
                one item of the bar's, so they read as words, not spaced apart as the bar spaces its items. */}
            <button data-part={inApp ? "back" : "take-over"} className={`${ITEM} relative w-[116px] phone:px-0! phone:[flex:19_1_65px]`} disabled={!may.takeOver && !may.back} aria-pressed={stepping} aria-label={inApp ? "Back, Escape twice" : undefined} onClick={takeOverOrBack}>
              {inApp ? "Back" : stepping ? <span>Taking<span className="phone:hidden"> over</span>…</span> : "Take over"}{" "}
              {/* In the app, a single Escape is the app's: twice is Back. */}
              {inApp ? (
                <Key ref={backKeys} times={2} className="phone:hidden">
                  Esc
                </Key>
              ) : (
                !stepping && <Key>T</Key>
              )}
              {takeOver.getting && <Getting {...takeOver.getting} />}
            </button>
            <button data-part="note" className={`${ITEM} phone:px-0! phone:[flex:16_1_29px]`} disabled={!may.note} aria-pressed={noting} onClick={note}>
              Note <Key>N</Key>
            </button>
            {phone && comparer}
            </div>
          </div>
          </div>
        </div>
      </div>
      {/* Beside the recording, or under it on a phone: the change's moments, and this one's notes. */}
      <div ref={rows} onScroll={rowsMore.look} className={phone ? "grid min-h-0 grid-cols-[minmax(0,1fr)] content-start gap-6 overflow-y-auto px-4 pt-6 pb-8" : "contents"} style={phone ? rowsMore.fade : undefined}>
        {phone && cards}
        {/* On a phone, the step left is a row of its own under the bar, where the change stands under it. */}
        {phone && (
          <div className="grid gap-2">
            <StepBox step={step} anyway={doneAnyway} onPress={pressStep} className="w-full" />
            <StepNotice step={step} todo={doneAnyway && !step.said ? toDo : undefined} faded={false} inFlow />
          </div>
        )}
        {/* Tab reaches them as they read, left to right; on a phone, the notes come first, nearest what they're on. */}
        {!phone && momentsEdge}
        {(!phone || onEdge.length > 0) && (
          <Edge side="right" label="Notes" keys={["Shift", "↑", "↓"]} place={itsPlace} quiet={away} phone={phone} empty={!onEdge.length} showing={open ?? lastArrived}>
            {noteTiles}
          </Edge>
        )}
        {phone && momentsEdge}
      </div>
    </div>
  );
}


// Compare's place on the bar, as wide as what it holds at its widest, so the bar is the same width whatever's there; on
// a phone, its words are the switch's.
const COMPARING = "w-[124px] phone:[flex:27_1_85px]";

// Why Now rests for a note whose thing isn't in the moment's picture now.
const NOT_NOW = "Not in this moment now";

// Why Play rests on a still.
const STILL = "A still: nothing to play";

// Under the recording, room for the lower half of the bar that hangs across its edge, and a little more; on a phone,
// where the bar hangs under the edge so as not to cover the picture, the whole bar and the same more.
const GAP = 20;
const UNDER = BAR / 2 + GAP;

// Beside the recording, room for each edge's pictures at rest.
const SIDE = "clamp(104px, 10vw, 160px)";

// Over the recording, room for the change's title, and the moment's name in two lines, and the gap under them. Shown by
// another page, that page says what the change is: no title, and no room for it.
const over = () => (shownByAnotherPage() ? 2 : 3) * 22 + 12;

// The recording in its room, by its shape: as wide as the edges leave, or as tall as what's over and under it does.
export const inItsRoom = (shape: number) => ({ width: `min(calc(100cqw - 2 * ${SIDE}), calc((100cqh - ${over() + UNDER}px) * ${shape}))`, marginTop: over(), marginBottom: UNDER });

// While the app is yours, how wide the recording is against its place (100%): standing on the place's foot, so the bar
// across it doesn't move, as large as the page lets it be, and never larger than the app's own size, where its words are
// as they were recorded; already that large, as it was.
const inTheAppsRoom = (screen: { width: number; height: number }) => {
  const shape = screen.width / screen.height;
  // As wide as its shape allows from its foot up to the room's top: the place stands in the room's middle with what's
  // over and under it, so its foot is half its own height and half what's over it less what's under it below the middle.
  const tall = `calc(50% + ((100cqh + ${over() - UNDER}px) / 2 - ${ABOVE}px) * ${shape})`;
  return `max(100%, min(calc(100cqw - ${2 * BESIDE}px), ${tall}, ${screen.width}px))`;
};
// While the app is yours, the room left beside the recording, where the header's words stand from the screen's edge,
// and over it.
const BESIDE = 24;
const ABOVE = 12;

// Whether something from `from` up to a note's card can still scroll its words `by` this way.
function scrollsFirst(from: Element, by: number): boolean {
  for (let one: Element | null = from; one; one = one.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(one).overflowY) && (by < 0 ? one.scrollTop > 0 : one.scrollTop + one.clientHeight < one.scrollHeight - 1)) return true;
    if (one.matches("[data-note-card], [data-pin]")) return false;
  }
  return false;
}

// A spot, as a thing with no size.
const spotAt = ({ x, y }: { x: number; y: number }): Rect => ({ left: x, top: y, width: 0, height: 0 });
// A note on nothing in the moment: the whole moment, or, kept by earlier versions, the whole change.
const onNothing = ({ on }: Note) => !on || (!madeInApp(on) && on.at === undefined && !on.element && !on.box && !on.point);
// Asked for reduced motion.
const unmoving = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
