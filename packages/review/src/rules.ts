// What each step of the loop must get right. Every store goes through these, so the rules live in one place.
// Each returns what's wrong in plain words, saying what to do about it, and nothing when all is well.

import type { z } from "zod";
import { Comparison, fileName, Round, Seen, Send, type Change, type Scene, type Note, type Place, type Review } from "./model.ts";
import { quote } from "./words.ts";

// The round the agent is working on: the last one until it's finished, then the next; the first is 1.
export function roundInProgress(review: Review): number {
  const last = review.rounds.at(-1);
  if (!last) return 1;
  return last.finished ? last.number + 1 : last.number;
}

// Every note in the review, with the round it was written on and who wrote it.
export function allNotes(review: Review): Map<string, { note: Note; round: number; by: string }> {
  const notes = new Map<string, { note: Note; round: number; by: string }>();
  for (const send of review.sends) for (const note of send.notes) notes.set(note.id, { note, round: send.round, by: send.by });
  return notes;
}

// A note's conversation, oldest first: the note, then round by round the agent's reply and what people said about it.
// Each turn says who: a person, or the agent that recorded the round, whatever their names.
export type Turn = { by: string; agent: boolean; round: number; words: string };

export function conversation(review: Review, id: string): Turn[] {
  const started = allNotes(review).get(id);
  if (!started) return [];
  const turns: { turn: Turn; order: number }[] = [{ turn: { by: started.by, agent: false, round: started.round, words: started.note.words }, order: 0 }];
  for (const round of review.rounds.filter((round) => round.number > started.round)) {
    const reply = round.replies.find((reply) => reply.note === id);
    if (reply?.words.trim()) turns.push({ turn: { by: round.by, agent: true, round: round.number, words: reply.words }, order: 1 });
  }
  for (const send of review.sends)
    for (const reply of (send.replies ?? []).filter((reply) => reply.note === id)) turns.push({ turn: { by: send.by, agent: false, round: send.round, words: reply.words }, order: 2 });
  return turns.sort((a, b) => a.turn.round - b.turn.round || a.order - b.order).map(({ turn }) => turn);
}

// The notes a round has to answer: those in the sends it took that are new, or that someone replied to.
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
  return !last.notes.length && !last.replies?.length && handedBack.scenes.every((scene) => last.looksGood.includes(scene.name)) ? last : undefined;
}

// What asks for an answer in some sends: a new note, or one a person replied to.
function asking(sends: Send[]): string[] {
  return [...new Set(sends.flatMap((send) => [...send.notes.map((note) => note.id), ...(send.replies ?? []).map((reply) => reply.note)]))];
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

  const due = roundInProgress(review);
  if (round.number !== due) {
    if (round.number < due) return [`Round ${round.number} is finished, so it can't change.`];
    return [`Round ${round.number} can't be recorded yet: the round being worked on is ${due}.`];
  }

  const at = `Round ${round.number}`;
  const problems = problemsWithScenes(round, at);
  const notes = allNotes(review);
  problems.push(...duplicates(round.replies.map((reply) => reply.note), (id) => `${at} has two replies to note ${id}. Say it all in one.`));
  for (const reply of round.replies) if (!notes.has(reply.note)) problems.push(`${at} replies to note ${reply.note}, which doesn't exist.`);
  return problems;
}

// Scenes are told apart by their names, and their steps by their titles, so each is there once.
function problemsWithScenes(round: Round, at: string): string[] {
  const problems = duplicates(round.scenes.map((scene) => scene.name), (name) => `${at} has two scenes called “${name}”.`);
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
  const at = `Round ${comparison.round} against round ${comparison.since}`;
  const round = review.rounds.find((kept) => kept.number === comparison.round);
  const earlier = review.rounds.find((kept) => kept.number === comparison.since);
  if (!round) return [`Round ${comparison.round} hasn't been recorded yet, so it can't be compared.`];
  if (round.finished) return [`Round ${comparison.round} is finished, so what it's compared with can't change.`];
  if (comparison.since >= comparison.round) return [`${at}: a round is only compared with a round before it.`];
  if (!earlier) return [`${at}: there's no round ${comparison.since} to compare it with.`];

  const problems = duplicates(comparison.changes.map((change) => change.id), (id) => `${at} has two changes with the id ${id}.`);
  for (const change of comparison.changes)
    for (const seen of change.seen) {
      const gone = seen.at === undefined && !round.scenes.some((scene) => scene.name === seen.scene);
      problems.push(...problemsWithPlace(seen, gone ? earlier.scenes : round.scenes, `${at}: ${describe(change)}`));
    }
  return problems;
}

// The changes the agent is told of: those Playthrough can name. One only the pictures show is the person's to look at.
export const toAccountFor = (comparison?: Comparison) => (comparison?.changes ?? []).filter((change) => !change.pictureOnly);

// A round is handed back once its file is in the right shape, every note it took is answered, and, compared at all, it's
// compared with every round before it.
export function problemsFinishing(review: Review, number: number): string[] {
  const round = review.rounds.find((round) => round.number === number);
  if (!round) return [`Round ${number} hasn't been recorded yet.`];
  const at = `Round ${number}`;
  const shape = problemsWithShape(Round, round, at);
  if (shape.length) return shape;
  if (!round.scenes.length) return [`${at} has no scenes yet. Record them first.`];

  const problems: string[] = [];
  const notes = allNotes(review);
  for (const id of notesToAnswer(review, number)) {
    const reply = round.replies.find((reply) => reply.note === id);
    const note = notes.get(id)?.note;
    if (!isText(reply?.words)) problems.push(`${at} needs an answer to note ${id}${note ? `, “${cut(note.words)}”` : ""}: its reply's “words”, under “replies”.`);
  }

  // Compared at all, a round is compared with every round before it, so what's new to anyone, wherever they last
  // looked, is known.
  const comparisons = review.comparisons.filter((comparison) => comparison.round === number);
  if (comparisons.length)
    for (const earlier of review.rounds.filter((earlier) => earlier.number < number && !comparisons.some((comparison) => comparison.since === earlier.number)))
      problems.push(`${at} isn't compared with round ${earlier.number} yet, so it can't be handed back. Run every moment again.`);
  return problems;
}

export function problemsWithFile(review: Review, round: number, name: string): string[] {
  const due = roundInProgress(review);
  if (round !== due) return [`Files go in the round being worked on, ${due}, not round ${round}.`];
  return problemsWithFileName(name);
}

export function problemsWithFileName(name: string): string[] {
  return fileName("").safeParse(name).success
    ? []
    : [`“${name}” can't be a file's name: use letters, digits, dots, dashes and underscores, and slashes between folders.`];
}

// A send says new notes, replies to notes it can see, or Done: that every moment of a finished round looks good.
export function problemsWithSend(review: Review, send: Send): string[] {
  const shape = problemsWithShape(Send, send, "This send");
  if (shape.length) return shape;
  if (review.sends.some((other) => other.id === send.id)) return [`Something else was already sent as ${send.id}. Send this with a new id.`];
  if (send.verdicts.length) return ["A note's answer isn't judged any more: say what's still not right in a reply."];
  const replies = send.replies ?? [];
  if (!send.notes.length && !replies.length && !send.looksGood.length) return ["There's nothing in this send."];

  const round = review.rounds.find((round) => round.number === send.round);
  if (!round?.finished) return [`Round ${send.round} isn't finished, so it can't take notes yet.`];

  const problems: string[] = [];
  const notes = allNotes(review);
  problems.push(...duplicates(send.notes.map((note) => note.id), (id) => `This send has two notes with the id ${id}.`));
  for (const note of send.notes) {
    if (notes.has(note.id)) problems.push(`The id ${note.id} is already a note's. Make a new one.`);
    // One in the app is on the person's own recording, which branches off a scene of the round.
    if (note.on) problems.push(...problemsWithPlace(note.on.app ? { scene: note.on.app.from.scene } : note.on, round.scenes, `Note ${note.id}`));
  }

  problems.push(...duplicates(replies.map((reply) => reply.note), (id) => `This send has two replies on note ${id}. Say it all in one.`));
  for (const reply of replies) {
    const known = notes.get(reply.note);
    if (send.notes.some((note) => note.id === reply.note)) problems.push(`Note ${reply.note} is new: say it in the note, not a reply.`);
    else if (!known || known.round > send.round) problems.push(`There's no note ${reply.note} on round ${send.round} to reply to.`);
  }

  problems.push(...duplicates(send.looksGood, (scene) => `This send says “${scene}” looks good twice.`));
  for (const scene of send.looksGood.filter((scene) => !round.scenes.some((recorded) => recorded.name === scene))) problems.push(`Round ${send.round} has no scene called “${scene}”.`);
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
  };
  const singular: Record<string, string> = { scenes: "scene", steps: "step", changes: "change", seen: "place it's seen", replies: "reply", notes: "note", looksGood: "scene said to look good" };
  return named[list] || `${singular[list] ?? list} ${index + 1}`;
}

function problemsWithPlace(place: Place, scenes: Scene[], what: string): string[] {
  const scene = scenes.find((scene) => scene.name === place.scene);
  if (!scene) return [`${what} is on the scene “${place.scene}”, which isn't there.`];
  return (place.at ?? 0) <= scene.length ? [] : [`${what} is at ${place.at}s, but “${scene.name}” is ${scene.length}s long.`];
}

function duplicates(values: string[], problem: (value: string) => string): string[] {
  const seen = new Set<string>();
  const twice = new Set(values.filter((value) => seen.has(value) || !seen.add(value)));
  return [...twice].map(problem);
}

const describe = (change: Change) => `the change ${change.id} (${cut(change.words)})`;
const cut = (words: string) => (words.length > 48 ? `${words.slice(0, 47).trimEnd()}…` : words);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
