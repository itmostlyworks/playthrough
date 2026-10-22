// What each step of the loop must get right. Every store goes through these, so the rules live in one place.
// Each returns what's wrong in plain words, saying what to do about it, and nothing when all is well.

import type { z } from "zod";
import { fileName, Round, Send, type Change, type Flow, type Note, type Place, type Review, type Verdict } from "./model.ts";

// The round the agent is working on: the last one until it's finished, then the next.
export function roundInProgress(review: Review): number {
  const last = review.rounds.at(-1);
  if (!last) return 0;
  return last.finished ? last.number + 1 : last.number;
}

// Every note in the review, whoever started it, with the round it's on.
export function allNotes(review: Review): Map<string, { note: Note; round: number; by: string }> {
  const notes = new Map<string, { note: Note; round: number; by: string }>();
  for (const round of review.rounds) for (const note of round.unprompted) notes.set(note.id, { note, round: round.number, by: "agent" });
  for (const send of review.sends) for (const note of send.notes) notes.set(note.id, { note, round: send.round, by: send.by });
  return notes;
}

// A note's conversation, oldest first: the note, then round by round the agent's reply and what people said about it.
export type Turn = { by: string; round: number; words: string; verdict?: Verdict["verdict"] };

export function conversation(review: Review, id: string): Turn[] {
  const started = allNotes(review).get(id);
  if (!started) return [];
  const turns: { turn: Turn; order: number }[] = [{ turn: { by: started.by, round: started.round, words: started.note.words }, order: 0 }];
  for (const round of review.rounds.filter((round) => round.number > started.round)) {
    const reply = round.replies.find((reply) => reply.note === id);
    if (reply?.words.trim()) turns.push({ turn: { by: "agent", round: round.number, words: reply.words }, order: 1 });
  }
  for (const send of review.sends)
    for (const verdict of send.verdicts.filter((verdict) => verdict.note === id))
      turns.push({ turn: { by: send.by, round: send.round, words: verdict.words ?? "", verdict: verdict.verdict }, order: 2 });
  return turns.sort((a, b) => a.turn.round - b.turn.round || a.order - b.order).map(({ turn }) => turn);
}

// The notes a round has to answer: those in the sends it took that are new, or that someone said aren't quite right.
// When two people judge the same note, the later verdict counts.
export function notesToAnswer(review: Review, round: number): string[] {
  const asks = new Map<string, boolean>();
  for (const taken of review.taken.filter((taken) => taken.round === round)) {
    const send = review.sends.find((send) => send.id === taken.send);
    for (const note of send?.notes ?? []) asks.set(note.id, true);
    for (const verdict of send?.verdicts ?? []) asks.set(verdict.note, verdict.verdict === "not quite");
  }
  return [...asks].filter(([, asking]) => asking).map(([id]) => id);
}

export function problemsWithId(id: string): string[] {
  return typeof id === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)
    ? []
    : [`A review's id is lowercase words joined by dashes, like “export-a-quarter”, not “${id}”.`];
}

export function problemsStarting(id: string, title: string): string[] {
  const problems = problemsWithId(id);
  if (!isText(title)) problems.push("A review needs a title: what was asked, in the person's words.");
  return problems;
}

export function problemsWithRound(review: Review, round: Round): string[] {
  const shape = problemsWithShape(Round, round, Number.isInteger(round?.number) ? `Round ${round.number}` : "This round");
  if (shape.length) return shape;
  if (review.accepted) return ["This review is accepted, so nothing more can be recorded."];

  const due = roundInProgress(review);
  if (round.number !== due && !(review.rounds.length === 0 && round.number === 1)) {
    if (review.rounds.length === 0) return ["The first round is 0, the before, or 1 when the app is new and there's no before."];
    if (round.number < due) return [`Round ${round.number} is finished, so it can't change.`];
    return [`Round ${round.number} can't be recorded yet: the round being worked on is ${due}.`];
  }

  const at = `Round ${round.number}`;
  const problems: string[] = [];
  const before = review.rounds.find((other) => other.number === round.number - 1);
  if (!before && (round.changes.length || round.replies.length || round.unprompted.length))
    problems.push(`${at} has no round before it, so it has no changes, replies or unprompted notes.`);

  problems.push(...duplicates(round.flows.map((flow) => flow.name), (name) => `${at} has two flows called “${name}”.`));
  for (const flow of round.flows) {
    const steps = flow.steps.map((step) => step.title);
    problems.push(...duplicates(steps, (title) => `${at}: the flow “${flow.name}” has two steps called “${title}”. Steps are matched by title.`));
    for (const step of flow.steps.filter((step) => step.at > flow.length))
      problems.push(`${at}: the step “${step.title}” in the flow “${flow.name}” starts after the flow ends.`);
  }

  problems.push(...duplicates(round.changes.map((change) => change.id), (id) => `${at} has two changes with the id ${id}.`));
  for (const change of round.changes) {
    const gone = change.on.at === undefined && !round.flows.some((flow) => flow.name === change.on.flow);
    problems.push(...problemsWithPlace(change.on, gone ? (before?.flows ?? []) : round.flows, `${at}: ${describe(change)}`));
  }

  const notes = allNotes(review);
  problems.push(...duplicates(round.unprompted.map((note) => note.id), (id) => `${at} has two unprompted notes with the id ${id}.`));
  for (const note of round.unprompted) {
    if (notes.has(note.id) && notes.get(note.id)?.round !== round.number) problems.push(`${at}: the id ${note.id} is already a note's. Make a new one.`);
    if (note.on) problems.push(...problemsWithPlace(note.on, round.flows, `${at}: the unprompted note ${note.id}`));
  }

  problems.push(...duplicates(round.replies.map((reply) => reply.note), (id) => `${at} has two replies to note ${id}. Say it all in one.`));
  for (const reply of round.replies) {
    if (!notes.has(reply.note)) problems.push(`${at} replies to note ${reply.note}, which doesn't exist.`);
    if (reply.on) problems.push(...problemsWithPlace(reply.on, round.flows, `${at}: the reply to note ${reply.note}`));
  }
  return problems;
}

// A round is finished once every note it took is answered and every change on screen is accounted for.
export function problemsFinishing(review: Review, number: number): string[] {
  if (review.accepted) return ["This review is accepted, so nothing more can be recorded."];
  const round = review.rounds.find((round) => round.number === number);
  if (!round) return [`Round ${number} hasn't been recorded yet.`];
  const at = `Round ${number}`;
  if (!round.flows.length) return [`${at} has no flows yet. Record them first.`];

  const problems: string[] = [];
  const notes = allNotes(review);
  const answering = notesToAnswer(review, number);
  const changes = new Map(round.changes.map((change) => [change.id, change]));

  for (const change of round.changes) {
    const because = change.because;
    const what = `${at}: ${describe(change)}`;
    if (because === undefined)
      problems.push(`${what} needs a because: the note it answers, an unprompted note, another change it follows from, or noise.`);
    else if (because === "asked") {
      if (number !== 1 || review.rounds[0]?.number !== 0) problems.push(`${what} says it was asked for, which only round 1 can say, against the before.`);
    } else if ("note" in because) {
      if (!answering.includes(because.note)) problems.push(`${what} answers note ${because.note}, which isn't one this round answers.`);
    } else if ("unprompted" in because) {
      if (!round.unprompted.some((note) => note.id === because.unprompted))
        problems.push(`${what} is put down to the unprompted note ${because.unprompted}, which this round doesn't have.`);
    } else if ("follows" in because && !followsToAnEnd(change, changes))
      problems.push(`${what} follows from a change that isn't in this round, or that leads back to it.`);
  }

  for (const id of answering) {
    const reply = round.replies.find((reply) => reply.note === id);
    const note = notes.get(id)?.note;
    if (!isText(reply?.words)) problems.push(`${at} needs an answer to note ${id}${note ? `, “${cut(note.words)}”` : ""}.`);
    else if (reply?.on && note?.on && reply.on.flow !== note.on.flow)
      problems.push(`${at}: the reply to note ${id} is on “${reply.on.flow}”, but the note is on “${note.on.flow}”. A reply goes in its note's flow.`);
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
  if (!send.notes.length && !send.verdicts.length && !send.looksGood.length) return ["There's nothing in this send."];

  const round = review.rounds.find((round) => round.number === send.round);
  if (send.round === 0) return ["Round 0 is the before: notes go on the rounds after it."];
  if (!round?.finished) return [`Round ${send.round} isn't finished, so it can't take notes yet.`];

  const problems: string[] = [];
  const notes = allNotes(review);
  problems.push(...duplicates(send.notes.map((note) => note.id), (id) => `This send has two notes with the id ${id}.`));
  for (const note of send.notes) {
    if (notes.has(note.id)) problems.push(`The id ${note.id} is already a note's. Make a new one.`);
    if (note.on) problems.push(...problemsWithPlace(note.on, round.flows, `Note ${note.id}`));
  }

  problems.push(...duplicates(send.verdicts.map((verdict) => verdict.note), (id) => `This send has two verdicts on note ${id}.`));
  for (const verdict of send.verdicts) {
    const known = notes.get(verdict.note);
    if (send.notes.some((note) => note.id === verdict.note)) problems.push(`Note ${verdict.note} is new: it needs words, not a verdict.`);
    else if (!known || known.round > send.round) problems.push(`There's no note ${verdict.note} on round ${send.round} to judge.`);
  }

  problems.push(...duplicates(send.looksGood, (flow) => `This send says “${flow}” looks good twice.`));
  for (const flow of send.looksGood.filter((flow) => !round.flows.some((recorded) => recorded.name === flow)))
    problems.push(`Round ${send.round} has no flow called “${flow}”.`);
  return problems;
}

export function problemsAccepting(review: Review, by: string): string[] {
  if (!isText(by)) return ["Accepting needs to say who accepted."];
  if (!review.rounds.some((round) => round.finished && round.number > 0)) return ["There's no finished round to accept yet."];
  return [];
}

// What's wrong with something's shape: its name, then what it needs, as in “Round 2: flow 3 needs a name.”
export function problemsWithShape(schema: z.ZodType, value: unknown, subject: string): string[] {
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

// Names what a problem is on, innermost first: “Round 2: the step “Open” in the flow “Export a quarter””.
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
    flows: isText(name) && `the flow “${name}”`,
    steps: isText(title) && `the step “${title}”`,
    changes: (isText(words) && `the change “${cut(words)}”`) || (isText(id) && `the change ${id}`),
    replies: isText(note) && `the reply to note ${note}`,
    unprompted: isText(id) && `the unprompted note ${id}`,
    notes: isText(id) && `note ${id}`,
    verdicts: isText(note) && `the verdict on note ${note}`,
  };
  const singular: Record<string, string> = { flows: "flow", steps: "step", changes: "change", replies: "reply", unprompted: "unprompted note", notes: "note", verdicts: "verdict", looksGood: "flow said to look good" };
  return named[list] || `${singular[list] ?? list} ${index + 1}`;
}

function problemsWithPlace(place: Place, flows: Flow[], what: string): string[] {
  const flow = flows.find((flow) => flow.name === place.flow);
  if (!flow) return [`${what} is on the flow “${place.flow}”, which isn't there.`];
  const end = Math.max(place.at ?? 0, place.until ?? 0);
  return end <= flow.length ? [] : [`${what} is at ${end}s, but “${flow.name}” is ${flow.length}s long.`];
}

function followsToAnEnd(change: Change, changes: Map<string, Change>): boolean {
  const seen = new Set<string>([change.id]);
  let next = change.because;
  while (next !== undefined && next !== "asked" && "follows" in next) {
    if (seen.has(next.follows)) return false;
    seen.add(next.follows);
    const followed = changes.get(next.follows);
    if (!followed) return false;
    next = followed.because;
  }
  return true;
}

function duplicates(values: string[], problem: (value: string) => string): string[] {
  const seen = new Set<string>();
  const twice = new Set(values.filter((value) => seen.has(value) || !seen.add(value)));
  return [...twice].map(problem);
}

const describe = (change: Change) => `the change “${cut(change.words)}”`;
const cut = (words: string) => (words.length > 48 ? `${words.slice(0, 47).trimEnd()}…` : words);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
