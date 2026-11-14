// What each step of the loop must get right. Every store goes through these, so the rules live in one place.
// Each returns what's wrong in plain words, saying what to do about it, and nothing when all is well.

import type { z } from "zod";
import { Comparison, fileName, madeInApp, Round, Seen, Send, type Finding, type InApp, type Note, type OnMoment, type Change, type Scene } from "./model.ts";
import { quote } from "./words.ts";

// The round the agent is working on: the last one until it's finished, then the next; the first is 1.
export function roundInProgress(change: Change): number {
  const last = change.rounds.at(-1);
  if (!last) return 1;
  return last.finished ? last.number + 1 : last.number;
}

// Every note in the change, with the round it was written on and who wrote it.
export function allNotes(change: Change): Map<string, { note: Note; round: number; by: string }> {
  const notes = new Map<string, { note: Note; round: number; by: string }>();
  for (const send of change.sends) for (const note of send.notes) notes.set(note.id, { note, round: send.round, by: send.by });
  return notes;
}

// A note's conversation, oldest first: the note, then round by round the agent's reply and what people said about it.
// Each turn says who: a person, or the agent that recorded the round, whatever their names.
export type Turn = { by: string; agent: boolean; round: number; words: string };

export function conversation(change: Change, id: string): Turn[] {
  const started = allNotes(change).get(id);
  if (!started) return [];
  const turns: { turn: Turn; order: number }[] = [{ turn: { by: started.by, agent: false, round: started.round, words: started.note.words }, order: 0 }];
  for (const round of change.rounds.filter((round) => round.number > started.round)) {
    const reply = round.replies.find((reply) => reply.note === id);
    if (reply?.words.trim()) turns.push({ turn: { by: round.by, agent: true, round: round.number, words: reply.words }, order: 1 });
  }
  for (const send of change.sends)
    for (const reply of (send.replies ?? []).filter((reply) => reply.note === id)) turns.push({ turn: { by: send.by, agent: false, round: send.round, words: reply.words }, order: 2 });
  return turns.sort((a, b) => a.turn.round - b.turn.round || a.order - b.order).map(({ turn }) => turn);
}

// The notes a round has to answer: those in the sends it took that are new, or that someone replied to.
export function notesToAnswer(change: Change, round: number): string[] {
  return asking(change.sends.filter((send) => change.taken.some((taken) => taken.send === send.id && taken.round === round)));
}

// The notes waiting for the agent: asking for an answer that no finished round has given yet.
export function waitingForTheAgent(change: Change): string[] {
  const answered = (send: Send) => {
    const taken = change.taken.find((taken) => taken.send === send.id);
    return !!taken && change.rounds.some((round) => round.number === taken.round && round.finished);
  };
  return asking(change.sends.filter((send) => !answered(send)));
}

// The send that said the change is done, while it stands: done is the person's latest word, on the moments as last handed
// back, saying Done. Whatever comes after it opens the change again: a note or a reply sent, or the moments handed back
// anew. Asked about one person, it's their latest word.
export function saidDone(change: Change, by?: string): Send | undefined {
  const handedBack = change.rounds.findLast((round) => round.finished);
  const last = change.sends.filter((send) => by === undefined || send.by === by).at(-1);
  return handedBack && last?.round === handedBack.number && last.done ? last : undefined;
}

// A change has moments when its latest round is finished with some in it.
export const latestOf = (change: Change): Round | undefined => change.rounds.findLast((round) => !!round.finished && round.scenes.length > 0);

export const sentBy = (change: Change, you: string) => change.sends.filter((one) => one.by === you);

// Waiting on you until you've sent something on its latest moments, or said Done; then it's with your agents.
const sentOn = (change: Change, you: string) => {
  const round = latestOf(change);
  return round ? sentBy(change, you).filter((one) => one.round === round.number) : [];
};

// Where a change stands for one person: waiting on them; with their agents, once they've sent notes on its latest
// moments; or done, once they said Done (saidDone). Nothing about Done is final: a note later sends as any other, and the
// change is with their agents again. The list and the page read it alike.
export type Standing = { is: "waiting" } | { is: "sent"; at: string; notes: number; replies: number } | { is: "done"; at: string };

export function standingOf(change: Change, you: string): Standing {
  const done = saidDone(change, you);
  if (done) return { is: "done", at: done.sent };
  const sends = sentOn(change, you);
  const last = sends.at(-1);
  if (!last) return { is: "waiting" };
  // What's been said since it was last done, if it was.
  const since = sends.slice(sends.findLastIndex((one) => one.done) + 1);
  return { is: "sent", at: last.sent, notes: since.reduce((sum, one) => sum + one.notes.length, 0), replies: since.reduce((sum, one) => sum + (one.replies?.length ?? 0), 0) };
}

// What asks for an answer in some sends: a new note, or one a person replied to.
function asking(sends: Send[]): string[] {
  return [...new Set(sends.flatMap((send) => [...send.notes.map((note) => note.id), ...(send.replies ?? []).map((reply) => reply.note)]))];
}

export function problemsWithId(id: string): string[] {
  return typeof id === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)
    ? []
    : [`A change's id is lowercase words joined by dashes, like “export-a-quarter”, not “${id}”.`];
}

export function problemsStarting(id: string, title: string, asked?: string): string[] {
  const problems = problemsWithId(id);
  if (!isText(title)) problems.push("A change needs a title: a few words for the change, as a pull request's title.");
  if (asked !== undefined && !isText(asked)) problems.push("What was asked is the person's words, as they put it.");
  return problems;
}

export function problemsWithRound(change: Change, round: Round): string[] {
  const shape = problemsWithShape(Round, round, Number.isInteger(round?.number) ? `Round ${round.number}` : "This round");
  if (shape.length) return shape;

  const due = roundInProgress(change);
  if (round.number !== due) {
    if (round.number < due) return [`Round ${round.number} is finished, so it can't change.`];
    return [`Round ${round.number} can't be recorded yet: the round being worked on is ${due}.`];
  }

  const at = `Round ${round.number}`;
  const problems = problemsWithScenes(round, at);
  const notes = allNotes(change);
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
export function problemsWithComparison(change: Change, comparison: Comparison): string[] {
  const shape = problemsWithShape(Comparison, comparison, "This comparison");
  if (shape.length) return shape;
  const at = `Round ${comparison.round} against round ${comparison.since}`;
  const round = change.rounds.find((kept) => kept.number === comparison.round);
  const earlier = change.rounds.find((kept) => kept.number === comparison.since);
  if (!round) return [`Round ${comparison.round} hasn't been recorded yet, so it can't be compared.`];
  if (round.finished) return [`Round ${comparison.round} is finished, so what it's compared with can't change.`];
  if (comparison.since >= comparison.round) return [`${at}: a round is only compared with a round before it.`];
  if (!earlier) return [`${at}: there's no round ${comparison.since} to compare it with.`];

  const problems = duplicates(comparison.changes.map((finding) => finding.id), (id) => `${at} has two changes with the id ${id}.`);
  for (const finding of comparison.changes)
    for (const seen of finding.seen) {
      const gone = seen.at === undefined && !round.scenes.some((scene) => scene.name === seen.scene);
      problems.push(...problemsWithPlace(seen, gone ? earlier.scenes : round.scenes, `${at}: ${describe(finding)}`));
    }
  return problems;
}

// The changes the agent is told of: those Playthrough can name. One only the pictures show is the person's to look at.
export const toAccountFor = (comparison?: Comparison) => (comparison?.changes ?? []).filter((finding) => !finding.pictureOnly);

// A round is handed back once its file is in the right shape, every note it took is answered, and, compared at all, it's
// compared with every round before it.
export function problemsFinishing(change: Change, number: number): string[] {
  const round = change.rounds.find((round) => round.number === number);
  if (!round) return [`Round ${number} hasn't been recorded yet.`];
  const at = `Round ${number}`;
  const shape = problemsWithShape(Round, round, at);
  if (shape.length) return shape;
  if (!round.scenes.length) return [`${at} has no scenes yet. Record them first.`];

  const problems: string[] = [];
  const notes = allNotes(change);
  for (const id of notesToAnswer(change, number)) {
    const reply = round.replies.find((reply) => reply.note === id);
    const note = notes.get(id)?.note;
    if (!isText(reply?.words)) problems.push(`${at} needs an answer to note ${id}${note ? `, “${cut(note.words)}”` : ""}: its reply's “words”, under “replies”.`);
  }

  // Compared at all, a round is compared with every round before it, so what's new to anyone, wherever they last
  // looked, is known.
  const comparisons = change.comparisons.filter((comparison) => comparison.round === number);
  if (comparisons.length)
    for (const earlier of change.rounds.filter((earlier) => earlier.number < number && !comparisons.some((comparison) => comparison.since === earlier.number)))
      problems.push(`${at} isn't compared with round ${earlier.number} yet, so it can't be handed back. Run every moment again.`);
  return problems;
}

export function problemsWithFile(change: Change, round: number, name: string): string[] {
  const due = roundInProgress(change);
  if (round !== due) return [`Files go in the round being worked on, ${due}, not round ${round}.`];
  return problemsWithFileName(name);
}

export function problemsWithFileName(name: string): string[] {
  return fileName("").safeParse(name).success
    ? []
    : [`“${name}” can't be a file's name: use letters, digits, dots, dashes and underscores, and slashes between folders.`];
}

// A send says new notes and replies to notes it can see, or Done: that every moment of a finished round looks good.
export function problemsWithSend(change: Change, send: Send): string[] {
  const shape = problemsWithShape(Send, send, "This send");
  if (shape.length) return shape;
  if (change.sends.some((other) => other.id === send.id)) return [`Something else was already sent as ${send.id}. Send this with a new id.`];
  const replies = send.replies ?? [];
  if (!send.notes.length && !replies.length && !send.done) return ["There's nothing in this send."];
  if (send.done && (send.notes.length || replies.length)) return ["Done says every moment looks good, and nothing more: send the notes and replies on their own."];

  const round = change.rounds.find((round) => round.number === send.round);
  if (!round?.finished) return [`Round ${send.round} isn't finished, so it can't take notes yet.`];

  const problems: string[] = [];
  const notes = allNotes(change);
  problems.push(...duplicates(send.notes.map((note) => note.id), (id) => `This send has two notes with the id ${id}.`));
  for (const note of send.notes) {
    if (notes.has(note.id)) problems.push(`The id ${note.id} is already a note's. Make a new one.`);
    if (note.on) problems.push(...problemsWithNotePlace(change, send, note.id, note.on));
  }

  problems.push(...duplicates(replies.map((reply) => reply.note), (id) => `This send has two replies on note ${id}. Say it all in one.`));
  for (const reply of replies) {
    const known = notes.get(reply.note);
    if (send.notes.some((note) => note.id === reply.note)) problems.push(`Note ${reply.note} is new: say it in the note, not a reply.`);
    else if (!known || known.round > send.round) problems.push(`There's no note ${reply.note} on round ${send.round} to reply to.`);
  }

  return problems;
}

// What's seen is a moment handed back: a scene of a finished round.
export function problemsSeeing(change: Change, by: string, moments: Seen[]): string[] {
  if (!isText(by)) return ["Seeing needs to say who saw it."];
  return moments.flatMap((moment) => {
    const shape = problemsWithShape(Seen, moment, "What's seen");
    if (shape.length) return shape;
    const round = change.rounds.find((round) => round.number === moment.round && round.finished);
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
  const singular: Record<string, string> = { scenes: "scene", steps: "step", changes: "change", seen: "place it's seen", replies: "reply", notes: "note" };
  return named[list] || `${singular[list] ?? list} ${index + 1}`;
}

// A note is on a moment of a hand-back the person could see: on it, within its recording; or in the app, stepped into
// within it, and within the person's own recording, which is one of their own files.
function problemsWithNotePlace(change: Change, send: Send, id: string, on: OnMoment | InApp): string[] {
  const handedBack = change.rounds.find((round) => round.number === on.round && round.finished);
  if (!handedBack) return [`Note ${id} is on round ${on.round}, which hasn't been handed back.`];
  if (on.round > send.round) return [`Note ${id} is on round ${on.round}, but it's sent on round ${send.round}.`];
  if (!madeInApp(on)) return problemsWithPlace(on, handedBack.scenes, `Note ${id}`);
  const problems = problemsWithPlace({ scene: on.scene, at: on.steppedIn }, handedBack.scenes, `Note ${id}'s step in`);
  if (!on.recording.startsWith("branches/")) problems.push(`Note ${id} is in the app, so its recording is one of the person's own, “branches/…”, not “${on.recording}”.`);
  if (on.at > on.length) problems.push(`Note ${id} is at ${on.at}s, but the person's own recording is ${on.length}s long.`);
  return problems;
}

function problemsWithPlace(place: { scene: string; at?: number }, scenes: Scene[], what: string): string[] {
  const scene = scenes.find((scene) => scene.name === place.scene);
  if (!scene) return [`${what} is on the scene “${place.scene}”, which isn't there.`];
  return (place.at ?? 0) <= scene.length ? [] : [`${what} is at ${place.at}s, but “${scene.name}” is ${scene.length}s long.`];
}

function duplicates(values: string[], problem: (value: string) => string): string[] {
  const seen = new Set<string>();
  const twice = new Set(values.filter((value) => seen.has(value) || !seen.add(value)));
  return [...twice].map(problem);
}

const describe = (finding: Finding) => `the change ${finding.id} (${cut(finding.words)})`;
const cut = (words: string) => (words.length > 48 ? `${words.slice(0, 47).trimEnd()}…` : words);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
