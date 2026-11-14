// What each step of the loop must get right. Every store goes through these, so the rules live in one place.
// Each returns what's wrong in plain words, saying what to do about it, and nothing when all is well.

import type { z } from "zod";
import { Comparison, fileName, Round, Seen, Send, type Account, type Change, type Scene, type Note, type Place, type Reply, type Review, type Verdict } from "./model.ts";
import { list, quote } from "./words.ts";

// The round the agent is working on: the last one until it's finished, then the next.
export function roundInProgress(review: Review): number {
  const last = review.rounds.at(-1);
  if (!last) return 0;
  return last.finished ? last.number + 1 : last.number;
}

// Every scene the review has had, in the order they joined it: the task's first, from Before, then those the agent added
// for its own choices, whatever their files are called.
export function inOrderJoined(review: Review): string[] {
  return [...new Set(review.rounds.flatMap((kept) => [...kept.scenes.map((scene) => scene.name), ...(kept.cantStart ?? [])]))];
}

// Every note in the review, with the round it was written on and who wrote it.
export function allNotes(review: Review): Map<string, { note: Note; round: number; by: string }> {
  const notes = new Map<string, { note: Note; round: number; by: string }>();
  for (const send of review.sends) for (const note of send.notes) notes.set(note.id, { note, round: send.round, by: send.by });
  return notes;
}

// Where a note was last seen before a round: on the latest round before it where Playthrough placed an answer to it, else
// where it was written. A round's answers are placed on the thing as it's found on that round's recording.
export function lastSeen(review: Review, id: string, before: number): { round: number; on: Place } | undefined {
  const started = allNotes(review).get(id);
  if (!started?.note.on) return undefined;
  const placed = review.rounds.findLast((round) => round.number > started.round && round.number < before && round.replies.some((reply) => reply.note === id && reply.on));
  const on = placed?.replies.find((reply) => reply.note === id)?.on;
  return placed && on ? { round: placed.number, on } : { round: started.round, on: started.note.on };
}

// A note's conversation, oldest first: the note, then round by round the agent's reply and what people said about it.
// Each turn says who: a person, or the agent that recorded the round, whatever their names.
export type Turn = { by: string; agent: boolean; round: number; words: string; verdict?: Verdict["verdict"] };

export function conversation(review: Review, id: string): Turn[] {
  const started = allNotes(review).get(id);
  if (!started) return [];
  const turns: { turn: Turn; order: number }[] = [{ turn: { by: started.by, agent: false, round: started.round, words: started.note.words }, order: 0 }];
  for (const round of review.rounds.filter((round) => round.number > started.round)) {
    const reply = round.replies.find((reply) => reply.note === id);
    if (reply?.words.trim()) turns.push({ turn: { by: round.by, agent: true, round: round.number, words: reply.words }, order: 1 });
  }
  for (const send of review.sends) {
    for (const verdict of send.verdicts.filter((verdict) => verdict.note === id))
      turns.push({ turn: { by: send.by, agent: false, round: send.round, words: verdict.words ?? "", verdict: verdict.verdict }, order: 2 });
    for (const reply of (send.replies ?? []).filter((reply) => reply.note === id)) turns.push({ turn: { by: send.by, agent: false, round: send.round, words: reply.words }, order: 2 });
  }
  return turns.sort((a, b) => a.turn.round - b.turn.round || a.order - b.order).map(({ turn }) => turn);
}

// The notes a round has to answer: those in the sends it took that are new, or that anyone said aren't quite right.
export function notesToAnswer(review: Review, round: number): string[] {
  return asking(review.sends.filter((send) => review.taken.some((taken) => taken.send === send.id && taken.round === round)));
}

// The notes waiting for the agent: asking for an answer that no finished round has given yet.
export function waitingForTheAgent(review: Review): string[] {
  const answered = (send: Send) => {
    const taken = review.taken.find((taken) => taken.send === send.id);
    return !!taken && review.rounds.some((round) => round.number === taken.round && round.finished);
  };
  return asking(review.sends.filter((send) => !answered(send)));
}

// The send that said the change is done, while it stands: done is the person's latest word, on the moments as last handed
// back, saying every one of them looks good and nothing more. Whatever comes after it opens the change again: a note or a
// reply sent, or the moments handed back anew. Asked about one person, it's their latest word.
export function saidDone(review: Review, by?: string): Send | undefined {
  const handedBack = review.rounds.findLast((round) => round.finished);
  const last = review.sends.filter((send) => by === undefined || send.by === by).at(-1);
  if (!handedBack || last?.round !== handedBack.number) return undefined;
  const nothingMore = !last.notes.length && !last.verdicts.length && !last.replies?.length && !last.takenBack?.length;
  return nothingMore && handedBack.scenes.every((scene) => last.looksGood.includes(scene.name)) ? last : undefined;
}

// What asks for an answer in some sends: a new note, or one whose answer was last replied to rather than said to look
// good. A note has one state for everyone, so the last word on it decides, whoever said it.
function asking(sends: Send[]): string[] {
  const asks = new Set<string>();
  const replied = new Map<string, boolean>();
  for (const send of sends) {
    for (const note of send.notes) asks.add(note.id);
    for (const verdict of send.verdicts) replied.set(verdict.note, false);
    for (const reply of send.replies ?? []) replied.set(reply.note, true);
  }
  for (const [note, yes] of replied) if (yes) asks.add(note);
  return [...asks];
}

// What the agent last said about a change, on this round or before it.
export function accountOf(review: Review, round: number, change: string): Account | undefined {
  return review.rounds.findLast((kept) => kept.number <= round && kept.accounts[change])?.accounts[change];
}

export function problemsWithId(id: string): string[] {
  return typeof id === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)
    ? []
    : [`A review's id is lowercase words joined by dashes, like “export-a-quarter”, not “${id}”.`];
}

export function problemsStarting(id: string, title: string, asked?: string): string[] {
  const problems = problemsWithId(id);
  if (!isText(title)) problems.push("A review needs a title: a few words for the change, as a pull request's title.");
  if (asked !== undefined && !isText(asked)) problems.push("What was asked is the person's words, as they put it.");
  return problems;
}

export function problemsWithRound(review: Review, round: Round): string[] {
  const shape = problemsWithShape(Round, round, Number.isInteger(round?.number) ? `Round ${round.number}` : "This round");
  if (shape.length) return shape;
  if (review.accepted) return ["This review is accepted, so nothing more can be recorded."];

  const due = roundInProgress(review);
  if (round.number !== due && !(review.rounds.length === 0 && round.number === 1)) {
    if (review.rounds.length === 0) return ["The first round is 0, Before, or 1 when the app is new and there's no Before."];
    if (round.number < due) return [`Round ${round.number} is finished, so it can't change.`];
    return [`Round ${round.number} can't be recorded yet: the round being worked on is ${due}.`];
  }

  const at = `Round ${round.number}`;
  const problems = problemsWithScenes(round, at);
  const notes = allNotes(review);
  problems.push(...duplicates(round.replies.map((reply) => reply.note), (id) => `${at} has two replies to note ${id}. Say it all in one.`));
  for (const reply of round.replies) {
    if (!notes.has(reply.note)) problems.push(`${at} replies to note ${reply.note}, which doesn't exist.`);
    // One on a person's fork, run again, is on that fork's recording, which branches off a scene of the round.
    if (reply.on) problems.push(...problemsWithPlace(reply.on.app ? { scene: reply.on.app.from.scene } : reply.on, round.scenes, `${at}: the reply to note ${reply.note}`));
    if (reply.watch) problems.push(...problemsWatching(reply, round, at));
  }
  return problems;
}

// An answer watched in a step plays it, so the step is one of its scene's, here; one in the app plays where the person's
// steps went.
function problemsWatching(reply: Reply, round: Round, at: string): string[] {
  const scene = reply.on && !reply.on.app ? round.scenes.find((scene) => scene.name === reply.on!.scene) : undefined;
  if (!scene) return [`${at}: the reply to note ${reply.note} watches ${quote(reply.watch!)}, but it isn't on one of this round's scenes. Take "watch" out.`];
  if (scene.steps.some((step) => step.title === reply.watch)) return [];
  return [`${at}: the reply to note ${reply.note} watches ${quote(reply.watch!)}, which isn't a step of ${quote(scene.name)}. Name one of its steps: ${list(scene.steps.map((step) => quote(step.title)))}.`];
}

// Before gains each scene as its round is recorded: the scene recorded on the app as it was, or the word that the app as
// it was can't start it.
export function problemsAddingToBefore(review: Review, scenes: Scene[], cantStart: string[]): string[] {
  if (review.accepted) return ["This review is accepted, so nothing more can be recorded."];
  const before = review.rounds.find((round) => round.number === 0);
  if (!before) return ["There's no Before to add a scene to: the app was new."];
  const after = withInBefore(before, scenes, cantStart);
  const shape = problemsWithShape(Round, after, "Before");
  return shape.length ? shape : problemsWithScenes(after, "Before");
}

// Before with these scenes in it, in place of what it had of them: a scene tried again replaces how far it went before.
// One that's gone since, tried again, goes from Before too.
export function withInBefore(before: Round, scenes: Scene[], cantStart: string[], gone: string[] = []): Round {
  const names = new Set([...scenes.map((scene) => scene.name), ...cantStart, ...gone]);
  // One recorded again keeps its place, so the scenes stay in the order they joined the review.
  const again = new Map(scenes.map((scene) => [scene.name, scene]));
  return {
    ...before,
    scenes: [...before.scenes.flatMap((scene) => (again.has(scene.name) ? [again.get(scene.name)!] : names.has(scene.name) ? [] : [scene])), ...scenes.filter((scene) => !before.scenes.some((kept) => kept.name === scene.name))],
    cantStart: [...(before.cantStart ?? []).filter((name) => !names.has(name)), ...cantStart],
  };
}

// Scenes are told apart by their names, and their steps by their titles, so each is there once.
function problemsWithScenes(round: Round, at: string): string[] {
  const problems = duplicates([...round.scenes.map((scene) => scene.name), ...(round.cantStart ?? [])], (name) => `${at} has two scenes called “${name}”.`);
  for (const scene of round.scenes) {
    const steps = scene.steps.map((step) => step.title);
    problems.push(...duplicates(steps, (title) => `${at}: the scene “${scene.name}” has two steps called “${title}”. Steps are matched by title.`));
    for (const step of scene.steps.filter((step) => step.at > scene.length))
      problems.push(`${at}: the step “${step.title}” in the scene “${scene.name}” starts after the scene ends.`);
  }
  return problems;
}

// Playthrough compares the round being worked on with each round before it, and can compare again until it's finished.
export function problemsWithComparison(review: Review, comparison: Comparison): string[] {
  const shape = problemsWithShape(Comparison, comparison, "This comparison");
  if (shape.length) return shape;
  if (review.accepted) return ["This review is accepted, so nothing more can be recorded."];
  const at = `Round ${comparison.round} against ${roundName(comparison.since)}`;
  const round = review.rounds.find((kept) => kept.number === comparison.round);
  const earlier = review.rounds.find((kept) => kept.number === comparison.since);
  if (!round) return [`Round ${comparison.round} hasn't been recorded yet, so it can't be compared.`];
  if (round.finished) return [`Round ${comparison.round} is finished, so what it's compared with can't change.`];
  if (comparison.since >= comparison.round) return [`${at}: a round is only compared with a round before it.`];
  if (!earlier) return [`${at}: there's no ${roundName(comparison.since)} to compare it with.`];

  const problems = duplicates(comparison.changes.map((change) => change.id), (id) => `${at} has two changes with the id ${id}.`);
  for (const change of comparison.changes)
    for (const seen of change.seen) {
      const gone = seen.at === undefined && !round.scenes.some((scene) => scene.name === seen.scene);
      problems.push(...problemsWithPlace(seen, gone ? earlier.scenes : round.scenes, `${at}: ${describe(change)}`));
    }
  return problems;
}

// A round is handed over once its file is in the right shape, every note it took is answered, and it's compared with every
// round before it.
// The most a scene's line can say.
export const LONGEST_LINE = 140;

// The changes the agent says why of: those Playthrough can name. One only the pictures show is the person's to look at.
export const toAccountFor = (comparison?: Comparison) => (comparison?.changes ?? []).filter((change) => !change.pictureOnly);

// Changes this close together are at one moment: the person meets them together, and the agent says why of them once.
export const TOGETHER = 0.05;

// What the agent says why of, a step at a time, as the person meets it: all that changed at one moment of a scene, or
// the new steps it takes, under the id of the first change found there. A change seen in several scenes is in the first
// of them, in the order they joined.
export type StepToAccountFor = { id: string; scene: string; at?: number; until?: number; changes: Change[] };

// What's new since the round before; and in a scene new this round, all that's different from Before, as nobody has
// been asked about it.
export function stepsToAccountFor(review: Review, number: number): StepToAccountFor[] {
  const comparisons = review.comparisons.filter((comparison) => comparison.round === number);
  const since = toAccountFor(comparisons.find((comparison) => comparison.since === number - 1));
  const scenes = (round?: Round) => round?.scenes.map((scene) => scene.name) ?? [];
  const earlier = scenes(review.rounds.find((round) => round.number === number - 1));
  const joined = inOrderJoined(review);
  const fresh = number > 1 ? joined.filter((name) => scenes(review.rounds.find((round) => round.number === number)).includes(name) && !earlier.includes(name)) : [];
  const unasked = toAccountFor(comparisons.find((comparison) => comparison.since === 0)).filter(
    (change) => change.seen.some((seen) => fresh.includes(seen.scene)) && !since.some((one) => one.id === change.id) && !accountOf(review, number - 1, change.id),
  );
  const steps: StepToAccountFor[] = [];
  for (const change of [...since, ...unasked]) {
    const scene = (unasked.includes(change) ? fresh : joined).find((name) => change.seen.some((seen) => seen.scene === name)) ?? change.seen[0]!.scene;
    const on = change.seen.filter((seen) => seen.scene === scene).sort((a, b) => (a.at ?? 0) - (b.at ?? 0))[0]!;
    const moment = on.at !== undefined && on.until === undefined;
    const step = moment && steps.find((one) => one.scene === scene && one.at !== undefined && one.until === undefined && Math.abs(one.at - on.at!) < TOGETHER);
    if (step) step.changes.push(change);
    else steps.push({ id: change.id, scene, at: on.at, until: on.until, changes: [change] });
  }
  // As the person meets them: a scene at a time, in the order they joined, down its way.
  return steps.sort((a, b) => joined.indexOf(a.scene) - joined.indexOf(b.scene) || (a.at ?? 0) - (b.at ?? 0));
}

export function problemsFinishing(review: Review, number: number): string[] {
  if (review.accepted) return ["This review is accepted, so nothing more can be recorded."];
  const round = review.rounds.find((round) => round.number === number);
  if (!round) return [`Round ${number} hasn't been recorded yet.`];
  const at = `Round ${number}`;
  const shape = problemsWithShape(Round, round, at);
  if (shape.length) return shape;
  // Before gains its scenes as their rounds are recorded, so it's kept with none.
  if (number > 0 && !round.scenes.length) return [`${at} has no scenes yet. Record them first.`];

  const problems: string[] = [];
  const notes = allNotes(review);
  for (const id of notesToAnswer(review, number)) {
    const reply = round.replies.find((reply) => reply.note === id);
    const note = notes.get(id)?.note;
    if (!isText(reply?.words)) problems.push(`${at} needs an answer to note ${id}${note ? `, “${cut(note.words)}”` : ""}: its reply's “words”, under “replies”.`);
    else if (reply?.on && note?.on && reply.on.scene !== note.on.scene)
      problems.push(`${at}: the reply to note ${id} is on “${reply.on.scene}”, but the note is on “${note.on.scene}”. A reply goes in its note's scene.`);
  }

  // A scene's line is read in the moment before it plays, on its title card: a sentence, not a paragraph.
  for (const scene of round.scenes)
    if (scene.line && scene.line.length > LONGEST_LINE)
      problems.push(`${at}: the line on “${scene.name}” is ${scene.line.length} characters. Say it in a sentence of up to ${LONGEST_LINE}: what it starts from, and whether it shows the change or what the change leaves alone.`);

  // Compared at all, a round is compared with every round before it, so what's new to anyone, wherever they last
  // looked, is known.
  const comparisons = review.comparisons.filter((comparison) => comparison.round === number);
  if (comparisons.length)
    for (const earlier of review.rounds.filter((earlier) => earlier.number < number && !comparisons.some((comparison) => comparison.since === earlier.number)))
      problems.push(`${at} isn't compared with ${roundName(earlier.number)} yet, so it can't be handed over. Record it again.`);
  // What changed is shown to the person as it is: the agent's why is its answer to a note, so nothing asks it to say
  // why of each change. What it does say has to be about one of them.
  const changes = new Map(comparisons.flatMap((comparison) => comparison.changes.map((change) => [change.id, change])));
  for (const [id, account] of Object.entries(round.accounts)) {
    const change = changes.get(id);
    if (!change) problems.push(`${at} says something about the change ${id}, which isn't one of this round's changes.`);
    else if ("note" in account && !notes.has(account.note))
      problems.push(`${at}: ${describe(change)} was made for note ${account.note}, which doesn't exist.`);
  }
  return problems;
}

export function problemsWithFile(review: Review, round: number, name: string): string[] {
  if (review.accepted) return ["This review is accepted, so nothing more can be recorded."];
  const due = roundInProgress(review);
  if (round !== due && !(review.rounds.length === 0 && round === 1)) return [`Files go in the round being worked on, ${due}, not round ${round}.`];
  return problemsWithFileName(name);
}

export function problemsWithFileName(name: string): string[] {
  return fileName("").safeParse(name).success
    ? []
    : [`“${name}” can't be a file's name: use letters, digits, dots, dashes and underscores, and slashes between folders.`];
}

export function problemsWithSend(review: Review, send: Send): string[] {
  const shape = problemsWithShape(Send, send, "This send");
  if (shape.length) return shape;
  if (review.accepted) return ["This review is accepted, so nothing more can be sent."];
  if (review.sends.some((other) => other.id === send.id)) return [`Something else was already sent as ${send.id}. Send this with a new id.`];
  const takenBack = send.takenBack ?? [];
  const replies = send.replies ?? [];
  if (!send.notes.length && !send.verdicts.length && !replies.length && !send.looksGood.length && !takenBack.length) return ["There's nothing in this send."];

  const round = review.rounds.find((round) => round.number === send.round);
  if (send.round === 0) return ["Round 0 is Before: notes go on the rounds after it."];
  if (!round?.finished) return [`Round ${send.round} isn't finished, so it can't take notes yet.`];

  const problems: string[] = [];
  const notes = allNotes(review);
  problems.push(...duplicates(send.notes.map((note) => note.id), (id) => `This send has two notes with the id ${id}.`));
  for (const note of send.notes) {
    if (notes.has(note.id)) problems.push(`The id ${note.id} is already a note's. Make a new one.`);
    // One in the app is on the person's own recording, which branches off a scene of the round.
    if (note.on) problems.push(...problemsWithPlace(note.on.app ? { scene: note.on.app.from.scene } : note.on, round.scenes, `Note ${note.id}`));
  }

  problems.push(...duplicates(send.verdicts.map((verdict) => verdict.note), (id) => `This send has two verdicts on note ${id}.`));
  for (const verdict of send.verdicts) {
    const known = notes.get(verdict.note);
    if (send.notes.some((note) => note.id === verdict.note)) problems.push(`Note ${verdict.note} is new: it needs words, not a verdict.`);
    else if (!known || known.round > send.round) problems.push(`There's no note ${verdict.note} on round ${send.round} to judge.`);
  }

  problems.push(...duplicates(replies.map((reply) => reply.note), (id) => `This send has two replies on note ${id}. Say it all in one.`));
  for (const reply of replies) {
    const known = notes.get(reply.note);
    if (send.notes.some((note) => note.id === reply.note)) problems.push(`Note ${reply.note} is new: say it in the note, not a reply.`);
    else if (!known || known.round > send.round) problems.push(`There's no note ${reply.note} on round ${send.round} to reply to.`);
    else if (send.verdicts.some((verdict) => verdict.note === reply.note)) problems.push(`This send judges note ${reply.note} and replies to it: say one.`);
  }

  problems.push(...duplicates(send.looksGood, (scene) => `This send says “${scene}” looks good twice.`));
  problems.push(...duplicates(takenBack, (scene) => `This send takes back Looks good on “${scene}” twice.`));
  for (const scene of send.looksGood.filter((scene) => takenBack.includes(scene))) problems.push(`This send says “${scene}” looks good and takes that back: say one.`);
  for (const scene of [...send.looksGood, ...takenBack].filter((scene) => !round.scenes.some((recorded) => recorded.name === scene)))
    problems.push(`Round ${send.round} has no scene called “${scene}”.`);
  return problems;
}

// What's seen is a moment handed back: a scene of a finished round.
export function problemsSeeing(review: Review, by: string, moments: Seen[]): string[] {
  if (!isText(by)) return ["Seeing needs to say who saw it."];
  return moments.flatMap((moment) => {
    const shape = problemsWithShape(Seen, moment, "What's seen");
    if (shape.length) return shape;
    const round = review.rounds.find((round) => round.number === moment.round && round.finished);
    return round?.scenes.some((scene) => scene.name === moment.scene) ? [] : [`Round ${moment.round} hands back no ${quote(moment.scene)} to see.`];
  });
}

// Accepting ends the review, so it waits until the agent has answered every note that asks for something.
export function problemsAccepting(review: Review, by: string): string[] {
  if (!isText(by)) return ["Accepting needs to say who accepted."];
  if (!review.rounds.some((round) => round.finished && round.number > 0)) return ["There's no finished round to accept yet."];
  const notes = allNotes(review);
  return waitingForTheAgent(review).map((id) => {
    const note = notes.get(id);
    return `Note ${id}${note ? `, “${cut(note.note.words)}”,` : ""} still waits for the agent's answer, so the work can't be accepted yet.`;
  });
}

// What's wrong with something's shape: its name, then what it needs, as in “Round 2: scene 3 needs a name.”
function problemsWithShape(schema: z.ZodType, value: unknown, subject: string): string[] {
  const result = schema.safeParse(value, { error: plainly });
  if (result.success) return [];
  return result.error.issues.map((issue) => `${whose(subject, issue.path, value)} ${issue.message}.`);
}

// The words for a problem no schema has words for.
const plainly: z.core.$ZodErrorMap = (issue) => {
  const field = issue.path?.findLast((key) => typeof key === "string");
  if (issue.code === "unrecognized_keys") {
    const keys = issue.keys.map((key) => `“${key}”`).join(" and ");
    return `has ${keys}, which ${issue.keys.length > 1 ? "aren't" : "isn't"} one of its fields`;
  }
  if (issue.code === "invalid_type") {
    if (field === undefined) return `isn't ${KINDS[issue.expected] ?? issue.expected}`;
    if (issue.input === undefined) return issue.expected === "array" ? `needs its ${field}, a list, even if it's empty` : `needs its ${field}`;
    return `has a ${field} that isn't ${KINDS[issue.expected] ?? issue.expected}`;
  }
  return field === undefined ? "isn't right" : `has a ${field} that isn't right`;
};
const KINDS: Record<string, string> = { string: "text", number: "a number", array: "a list", object: "an object", boolean: "true or false" };

// Names what a problem is on, innermost first: “Round 2: the step “Open” in the scene “Export a quarter””.
function whose(subject: string, path: PropertyKey[], value: unknown): string {
  const things: string[] = [];
  let here = value;
  for (const [i, key] of path.entries()) {
    here = here && typeof here === "object" ? (here as Record<PropertyKey, unknown>)[key] : undefined;
    if (typeof key === "number") things.unshift(nameOf(String(path[i - 1]), here as Record<string, unknown> | undefined, key));
    else if (path[i - 1] === "accounts") things.unshift(`what it says about the change ${String(key)}`);
  }
  return things.length ? `${subject}: ${things.join(" in ")}` : subject;
}

function nameOf(list: string, item: Record<string, unknown> | undefined, index: number): string {
  const { name, title, words, id, note } = item ?? {};
  const named: Record<string, string | false> = {
    scenes: isText(name) && `the scene “${name}”`,
    steps: isText(title) && `the step “${title}”`,
    changes: (isText(words) && `the change “${cut(words)}”`) || (isText(id) && `the change ${id}`),
    replies: isText(note) && `the reply to note ${note}`,
    notes: isText(id) && `note ${id}`,
    verdicts: isText(note) && `the verdict on note ${note}`,
  };
  const singular: Record<string, string> = { scenes: "scene", steps: "step", changes: "change", seen: "place it's seen", replies: "reply", notes: "note", verdicts: "verdict", looksGood: "scene said to look good" };
  return named[list] || `${singular[list] ?? list} ${index + 1}`;
}

function problemsWithPlace(place: Place, scenes: Scene[], what: string): string[] {
  const scene = scenes.find((scene) => scene.name === place.scene);
  if (!scene) return [`${what} is on the scene “${place.scene}”, which isn't there.`];
  const end = Math.max(place.at ?? 0, place.until ?? 0);
  return end <= scene.length ? [] : [`${what} is at ${end}s, but “${scene.name}” is ${scene.length}s long.`];
}

function duplicates(values: string[], problem: (value: string) => string): string[] {
  const seen = new Set<string>();
  const twice = new Set(values.filter((value) => seen.has(value) || !seen.add(value)));
  return [...twice].map(problem);
}

const roundName = (number: number) => (number === 0 ? "Before" : `round ${number}`);
const describe = (change: Change) => `the change ${change.id} (${cut(change.words)})`;
const cut = (words: string) => (words.length > 48 ? `${words.slice(0, 47).trimEnd()}…` : words);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
