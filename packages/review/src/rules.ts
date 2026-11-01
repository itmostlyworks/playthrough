// What each step of the loop must get right. Every store goes through these, so the rules live in one place.
// Each returns what's wrong in plain words, saying what to do about it, and nothing when all is well.

import type { z } from "zod";
import { Comparison, fileName, Round, Send, type Account, type Change, type Flow, type Note, type Place, type Reply, type Review, type Verdict } from "./model.ts";
import { list, quote, time } from "./words.ts";

// The round the agent is working on: the last one until it's finished, then the next.
export function roundInProgress(review: Review): number {
  const last = review.rounds.at(-1);
  if (!last) return 0;
  return last.finished ? last.number + 1 : last.number;
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
  for (const send of review.sends)
    for (const verdict of send.verdicts.filter((verdict) => verdict.note === id))
      turns.push({ turn: { by: send.by, agent: false, round: send.round, words: verdict.words ?? "", verdict: verdict.verdict }, order: 2 });
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

// What asks for an answer in some sends: a new note, or one whose answer was last said not to be quite right. A note
// has one state for everyone, so the last word on it decides, whoever said it.
function asking(sends: Send[]): string[] {
  const asks = new Set<string>();
  const last = new Map<string, Verdict["verdict"]>();
  for (const send of sends) {
    for (const note of send.notes) asks.add(note.id);
    for (const verdict of send.verdicts) last.set(verdict.note, verdict.verdict);
  }
  for (const [note, verdict] of last) if (verdict === "not quite") asks.add(note);
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
  const problems = problemsWithFlows(round, at);
  const notes = allNotes(review);
  problems.push(...duplicates(round.replies.map((reply) => reply.note), (id) => `${at} has two replies to note ${id}. Say it all in one.`));
  for (const reply of round.replies) {
    if (!notes.has(reply.note)) problems.push(`${at} replies to note ${reply.note}, which doesn't exist.`);
    // One on a person's fork, walked again, is on that fork's recording, which branches off a flow of the round.
    if (reply.on) problems.push(...problemsWithPlace(reply.on.app ? { flow: reply.on.app.from.flow } : reply.on, round.flows, `${at}: the reply to note ${reply.note}`));
    if (reply.watch) problems.push(...problemsWatching(reply, round, at));
  }
  return problems;
}

// An answer watched in a step plays it, so the step is one of its flow's, here; one in the app plays where the person's
// steps went.
function problemsWatching(reply: Reply, round: Round, at: string): string[] {
  const flow = reply.on && !reply.on.app ? round.flows.find((flow) => flow.name === reply.on!.flow) : undefined;
  if (!flow) return [`${at}: the reply to note ${reply.note} watches ${quote(reply.watch!)}, but it isn't on one of this round's flows. Take "watch" out.`];
  if (flow.steps.some((step) => step.title === reply.watch)) return [];
  return [`${at}: the reply to note ${reply.note} watches ${quote(reply.watch!)}, which isn't a step of ${quote(flow.name)}. Name one of its steps: ${list(flow.steps.map((step) => quote(step.title)))}.`];
}

// Before, once recorded, only gains: a flow added later, recorded on the app as it was, or the word that the app as it
// was can't start it.
export function problemsAddingToBefore(review: Review, flows: Flow[], cantStart: string[]): string[] {
  if (review.accepted) return ["This review is accepted, so nothing more can be recorded."];
  const before = review.rounds.find((round) => round.number === 0);
  if (!before) return ["There's no Before to add a flow to: the app was new."];
  const after = withInBefore(before, flows, cantStart);
  const shape = problemsWithShape(Round, after, "Before");
  return shape.length ? shape : problemsWithFlows(after, "Before");
}

// Before with these flows in it, in place of what it had of them: a flow tried again replaces how far it went before.
export function withInBefore(before: Round, flows: Flow[], cantStart: string[]): Round {
  const names = new Set([...flows.map((flow) => flow.name), ...cantStart]);
  return {
    ...before,
    flows: [...before.flows.filter((flow) => !names.has(flow.name)), ...flows],
    cantStart: [...(before.cantStart ?? []).filter((name) => !names.has(name)), ...cantStart],
  };
}

// Flows are told apart by their names, and their steps by their titles, so each is there once.
function problemsWithFlows(round: Round, at: string): string[] {
  const problems = duplicates([...round.flows.map((flow) => flow.name), ...(round.cantStart ?? [])], (name) => `${at} has two flows called “${name}”.`);
  for (const flow of round.flows) {
    const steps = flow.steps.map((step) => step.title);
    problems.push(...duplicates(steps, (title) => `${at}: the flow “${flow.name}” has two steps called “${title}”. Steps are matched by title.`));
    for (const step of flow.steps.filter((step) => step.at > flow.length))
      problems.push(`${at}: the step “${step.title}” in the flow “${flow.name}” starts after the flow ends.`);
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
      const gone = seen.at === undefined && !round.flows.some((flow) => flow.name === seen.flow);
      problems.push(...problemsWithPlace(seen, gone ? earlier.flows : round.flows, `${at}: ${describe(change)}`));
    }
  return problems;
}

// A round is handed over once its file is in the right shape, every note it took is answered, it's compared with every
// round before it, and the agent has said why each change new since the round before is there.
// The most a flow's line can say.
export const LONGEST_LINE = 140;

export function problemsFinishing(review: Review, number: number): string[] {
  if (review.accepted) return ["This review is accepted, so nothing more can be recorded."];
  const round = review.rounds.find((round) => round.number === number);
  if (!round) return [`Round ${number} hasn't been recorded yet.`];
  const at = `Round ${number}`;
  const shape = problemsWithShape(Round, round, at);
  if (shape.length) return shape;
  if (!round.flows.length) return [`${at} has no flows yet. Record them first.`];

  const problems: string[] = [];
  const notes = allNotes(review);
  for (const id of notesToAnswer(review, number)) {
    const reply = round.replies.find((reply) => reply.note === id);
    const note = notes.get(id)?.note;
    if (!isText(reply?.words)) problems.push(`${at} needs an answer to note ${id}${note ? `, “${cut(note.words)}”` : ""}: its reply's “words”, under “replies”.`);
    else if (reply?.on && note?.on && reply.on.flow !== note.on.flow)
      problems.push(`${at}: the reply to note ${id} is on “${reply.on.flow}”, but the note is on “${note.on.flow}”. A reply goes in its note's flow.`);
  }

  // A flow's line is read in the moment before it plays, on its title card: a sentence, not a paragraph.
  for (const flow of round.flows)
    if (flow.line && flow.line.length > LONGEST_LINE)
      problems.push(`${at}: the line on “${flow.name}” is ${flow.line.length} characters. Say it in a sentence of up to ${LONGEST_LINE}: what it starts from, or the choice it shows.`);

  // Compared at all, a round is compared with every round before it, so what's new to anyone, wherever they last
  // looked, is known.
  const comparisons = review.comparisons.filter((comparison) => comparison.round === number);
  if (comparisons.length)
    for (const earlier of review.rounds.filter((earlier) => earlier.number < number && !comparisons.some((comparison) => comparison.since === earlier.number)))
      problems.push(`${at} isn't compared with ${roundName(earlier.number)} yet, so it can't be handed over. Record it again.`);
  const changes = new Map(comparisons.flatMap((comparison) => comparison.changes.map((change) => [change.id, change])));
  for (const change of comparisons.find((comparison) => comparison.since === number - 1)?.changes ?? [])
    if (!round.accounts[change.id])
      problems.push(`${at}: say why ${change.id} is there (${change.words}${where(change)}): its line, the note it was made for, or why nothing really changed.`);
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
  if (!send.notes.length && !send.verdicts.length && !send.looksGood.length && !takenBack.length) return ["There's nothing in this send."];

  const round = review.rounds.find((round) => round.number === send.round);
  if (send.round === 0) return ["Round 0 is Before: notes go on the rounds after it."];
  if (!round?.finished) return [`Round ${send.round} isn't finished, so it can't take notes yet.`];

  const problems: string[] = [];
  const notes = allNotes(review);
  problems.push(...duplicates(send.notes.map((note) => note.id), (id) => `This send has two notes with the id ${id}.`));
  for (const note of send.notes) {
    if (notes.has(note.id)) problems.push(`The id ${note.id} is already a note's. Make a new one.`);
    // One in the app is on the person's own recording, which branches off a flow of the round.
    if (note.on) problems.push(...problemsWithPlace(note.on.app ? { flow: note.on.app.from.flow } : note.on, round.flows, `Note ${note.id}`));
  }

  problems.push(...duplicates(send.verdicts.map((verdict) => verdict.note), (id) => `This send has two verdicts on note ${id}.`));
  for (const verdict of send.verdicts) {
    const known = notes.get(verdict.note);
    if (send.notes.some((note) => note.id === verdict.note)) problems.push(`Note ${verdict.note} is new: it needs words, not a verdict.`);
    else if (!known || known.round > send.round) problems.push(`There's no note ${verdict.note} on round ${send.round} to judge.`);
  }

  problems.push(...duplicates(send.looksGood, (flow) => `This send says “${flow}” looks good twice.`));
  problems.push(...duplicates(takenBack, (flow) => `This send takes back Looks good on “${flow}” twice.`));
  for (const flow of send.looksGood.filter((flow) => takenBack.includes(flow))) problems.push(`This send says “${flow}” looks good and takes that back: say one.`);
  for (const flow of [...send.looksGood, ...takenBack].filter((flow) => !round.flows.some((recorded) => recorded.name === flow)))
    problems.push(`Round ${send.round} has no flow called “${flow}”.`);
  return problems;
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

// What's wrong with something's shape: its name, then what it needs, as in “Round 2: flow 3 needs a name.”
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

// Names what a problem is on, innermost first: “Round 2: the step “Open” in the flow “Export a quarter””.
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
    flows: isText(name) && `the flow “${name}”`,
    steps: isText(title) && `the step “${title}”`,
    changes: (isText(words) && `the change “${cut(words)}”`) || (isText(id) && `the change ${id}`),
    replies: isText(note) && `the reply to note ${note}`,
    notes: isText(id) && `note ${id}`,
    verdicts: isText(note) && `the verdict on note ${note}`,
  };
  const singular: Record<string, string> = { flows: "flow", steps: "step", changes: "change", seen: "place it's seen", replies: "reply", notes: "note", verdicts: "verdict", looksGood: "flow said to look good" };
  return named[list] || `${singular[list] ?? list} ${index + 1}`;
}

function problemsWithPlace(place: Place, flows: Flow[], what: string): string[] {
  const flow = flows.find((flow) => flow.name === place.flow);
  if (!flow) return [`${what} is on the flow “${place.flow}”, which isn't there.`];
  const end = Math.max(place.at ?? 0, place.until ?? 0);
  return end <= flow.length ? [] : [`${what} is at ${end}s, but “${flow.name}” is ${flow.length}s long.`];
}

function duplicates(values: string[], problem: (value: string) => string): string[] {
  const seen = new Set<string>();
  const twice = new Set(values.filter((value) => seen.has(value) || !seen.add(value)));
  return [...twice].map(problem);
}

const roundName = (number: number) => (number === 0 ? "Before" : `round ${number}`);
const describe = (change: Change) => `the change ${change.id} (${cut(change.words)})`;
// Where it's first seen, so the agent can find it: “in “Export a quarter” at 0:02”.
const where = ({ seen: [first] }: Change) => (first ? `, in ${quote(first.flow)}${first.at === undefined ? "" : ` at ${time(first.at)}`}` : "");
const cut = (words: string) => (words.length > 48 ? `${words.slice(0, 47).trimEnd()}…` : words);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
