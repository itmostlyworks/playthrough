// What each step of the loop must get right. Every store goes through these, so the rules live in one place.
// Each returns what's wrong in plain words, saying what to do about it, and nothing when all is well.

import type { z } from "zod";
import { Comparison, fileName, madeInApp, HandBack, Seen, Send, type Finding, type InApp, type Note, type OnMoment, type Change, type Moment } from "./model.ts";
import { list, quote } from "./words.ts";

// The hand-back the agent is working on: the last one until it's finished, then the next; the first is 1.
export function handBackInProgress(change: Change): number {
  const last = change.handBacks.at(-1);
  if (!last) return 1;
  return last.finished ? last.number + 1 : last.number;
}

// Every note in the change, with the hand-back it was written on and who wrote it, a guest or not.
export function allNotes(change: Change): Map<string, { note: Note; handBack: number; by: string; guest?: true }> {
  const notes = new Map<string, { note: Note; handBack: number; by: string; guest?: true }>();
  for (const send of change.sends) for (const note of send.notes) notes.set(note.id, { note, handBack: send.handBack, by: send.by, ...(send.guest && { guest: true as const }) });
  return notes;
}

// A note's conversation, oldest first: the note, then hand-back by hand-back the agent's reply and what people said about it.
// Each turn says who: a person, a guest who came by a shared link, or the agent that recorded the hand-back, whatever
// their names.
export type Turn = { by: string; agent: boolean; guest?: true; handBack: number; words: string };

export function conversation(change: Change, id: string): Turn[] {
  const started = allNotes(change).get(id);
  if (!started) return [];
  const turns: { turn: Turn; order: number }[] = [{ turn: { by: started.by, agent: false, ...(started.guest && { guest: true as const }), handBack: started.handBack, words: started.note.words }, order: 0 }];
  for (const handBack of change.handBacks.filter((handBack) => handBack.number > started.handBack)) {
    const reply = handBack.replies.find((reply) => reply.note === id);
    if (reply?.words.trim()) turns.push({ turn: { by: handBack.by, agent: true, handBack: handBack.number, words: reply.words }, order: 1 });
  }
  for (const send of change.sends)
    for (const reply of (send.replies ?? []).filter((reply) => reply.note === id)) turns.push({ turn: { by: send.by, agent: false, ...(send.guest && { guest: true as const }), handBack: send.handBack, words: reply.words }, order: 2 });
  return turns.sort((a, b) => a.turn.handBack - b.turn.handBack || a.order - b.order).map(({ turn }) => turn);
}

// The notes a hand-back has to answer: those in the sends it took that are new, or that someone replied to.
export function notesToAnswer(change: Change, handBack: number): string[] {
  return asking(change.sends.filter((send) => change.taken.some((taken) => taken.send === send.id && taken.handBack === handBack)));
}

// The notes waiting for the agent: asking for an answer that no finished hand-back has given yet.
export function waitingForTheAgent(change: Change): string[] {
  const answered = (send: Send) => {
    const taken = change.taken.find((taken) => taken.send === send.id);
    return !!taken && change.handBacks.some((handBack) => handBack.number === taken.handBack && handBack.finished);
  };
  return asking(change.sends.filter((send) => !answered(send)));
}

// What's been sent that no agent has taken yet, and the notes in it: what the next wait on the change gets.
export const sendsNotTaken = (change: Change) => change.sends.filter((send) => !change.taken.some((taken) => taken.send === send.id));
export const notesNotTaken = (change: Change) => asking(sendsNotTaken(change));

// The send that said the change is done, while it stands: done is the person's latest word, on the moments as last handed
// back, saying Done. Whatever comes after it opens the change again: a note or a reply sent, or the moments handed back
// anew. Asked about one person, it's their latest word.
export function saidDone(change: Change, by?: string): Send | undefined {
  const handedBack = change.handBacks.findLast((handBack) => handBack.finished);
  const last = change.sends.filter((send) => by === undefined || send.by === by).at(-1);
  return handedBack && last?.handBack === handedBack.number && last.done ? last : undefined;
}

// A change has moments when its latest hand-back is finished with some in it.
export const latestOf = (change: Change): HandBack | undefined => change.handBacks.findLast((handBack) => !!handBack.finished && handBack.moments.length > 0);

export const sentBy = (change: Change, you: string) => change.sends.filter((one) => one.by === you);

// Waiting on you until you've sent something on its latest moments, or said Done; then it's with your agents.
const sentOn = (change: Change, you: string) => {
  const handBack = latestOf(change);
  return handBack ? sentBy(change, you).filter((one) => one.handBack === handBack.number) : [];
};

// Where a change stands for one person: waiting on them; with their agents, once they've sent notes on its latest
// moments; or done, once they said Done (saidDone). Nothing about Done is final: a note later sends as any other, and the
// change is with their agents again. Every change in the sheet and a moment's page read it alike.
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

export function problemsWithHandBack(change: Change, handBack: HandBack): string[] {
  const shape = problemsWithShape(HandBack, handBack, Number.isInteger(handBack?.number) ? `Hand-back ${handBack.number}` : "This hand-back");
  if (shape.length) return shape;

  const due = handBackInProgress(change);
  if (handBack.number !== due) {
    if (handBack.number < due) return [`Hand-back ${handBack.number} is finished, so it can't change.`];
    return [`Hand-back ${handBack.number} can't be recorded yet: the hand-back being worked on is ${due}.`];
  }

  const at = `Hand-back ${handBack.number}`;
  const problems = problemsWithMoments(handBack, at);
  const notes = allNotes(change);
  problems.push(...duplicates(handBack.replies.map((reply) => reply.note), (id) => `${at} has two replies to note ${id}. Say it all in one.`));
  for (const reply of handBack.replies) if (!notes.has(reply.note)) problems.push(`${at} replies to note ${reply.note}, which doesn't exist.`);
  return problems;
}

// Moments are told apart by their names, so each is there once; what each did is in its recording.
function problemsWithMoments(handBack: HandBack, at: string): string[] {
  const problems = duplicates(handBack.moments.map((moment) => moment.name), (name) => `${at} has two moments called “${name}”.`);
  for (const moment of handBack.moments)
    if (moment.actions.some((action) => action.at > moment.length)) problems.push(`${at}: the moment “${moment.name}” has something done after it ends.`);
  return problems;
}

// Playthrough compares the hand-back being worked on with each hand-back before it, and can compare again until it's finished.
export function problemsWithComparison(change: Change, comparison: Comparison): string[] {
  const shape = problemsWithShape(Comparison, comparison, "This comparison");
  if (shape.length) return shape;
  const at = `Hand-back ${comparison.handBack} against hand-back ${comparison.since}`;
  const handBack = change.handBacks.find((kept) => kept.number === comparison.handBack);
  const earlier = change.handBacks.find((kept) => kept.number === comparison.since);
  if (!handBack) return [`Hand-back ${comparison.handBack} hasn't been recorded yet, so it can't be compared.`];
  if (handBack.finished) return [`Hand-back ${comparison.handBack} is finished, so what it's compared with can't change.`];
  if (comparison.since >= comparison.handBack) return [`${at}: a hand-back is only compared with a hand-back before it.`];
  if (!earlier) return [`${at}: there's no hand-back ${comparison.since} to compare it with.`];

  const problems = duplicates(comparison.findings.map((finding) => finding.id), (id) => `${at} has two findings with the id ${id}.`);
  for (const finding of comparison.findings)
    for (const seen of finding.seen) {
      const gone = seen.at === undefined && !handBack.moments.some((moment) => moment.name === seen.moment);
      problems.push(...problemsWithPlace(seen, gone ? earlier.moments : handBack.moments, `${at}: ${describe(finding)}`));
    }
  return problems;
}

// The findings the agent is told of: those Playthrough can name. One only the pictures show is the person's to look at.
export const toAccountFor = (comparison?: Comparison) => (comparison?.findings ?? []).filter((finding) => !finding.pictureOnly);

// A hand-back is handed back once its file is in the right shape, every note it took is answered, and, compared at all, it's
// compared with every hand-back before it.
export function problemsFinishing(change: Change, number: number): string[] {
  const handBack = change.handBacks.find((handBack) => handBack.number === number);
  if (!handBack) return [`Hand-back ${number} hasn't been recorded yet.`];
  const at = `Hand-back ${number}`;
  const shape = problemsWithShape(HandBack, handBack, at);
  if (shape.length) return shape;
  if (!handBack.moments.length) return [`${at} has no moments yet. Record them first.`];

  const problems: string[] = [];
  const notes = allNotes(change);
  for (const id of notesToAnswer(change, number)) {
    const reply = handBack.replies.find((reply) => reply.note === id);
    const note = notes.get(id)?.note;
    if (!isText(reply?.words)) problems.push(`${at} needs an answer to note ${id}${note ? `, “${cut(note.words)}”` : ""}: its reply's “words”, under “replies”.`);
  }

  // Compared at all, a hand-back is compared with every hand-back before it, so what's new to anyone, wherever they last
  // looked, is known.
  const comparisons = change.comparisons.filter((comparison) => comparison.handBack === number);
  if (comparisons.length)
    for (const earlier of change.handBacks.filter((earlier) => earlier.number < number && !comparisons.some((comparison) => comparison.since === earlier.number)))
      problems.push(`${at} isn't compared with hand-back ${earlier.number} yet, so it can't be handed back. Run every moment again.`);
  return problems;
}

export function problemsWithFile(change: Change, handBack: number, name: string): string[] {
  const due = handBackInProgress(change);
  if (handBack !== due) return [`Files go in the hand-back being worked on, ${due}, not hand-back ${handBack}.`];
  return problemsWithKeptName(name);
}

// What a kept file is, by how its name ends, and what it's served as: recordings and what's read and said of them,
// pictures, and the stylesheets and fonts a recording plays with. Only these are kept, and served as these; anything
// else on disk goes out as bytes. Never a document: no page, nothing that runs.
export const KEPT: Record<string, string> = {
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};
export const servedAs = (name: string): string => KEPT[name.slice(name.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream";

// A file Playthrough keeps is named for what it is: one of the kinds it keeps (`KEPT`), or, where only one will do, that one.
export function problemsWithKeptName(name: string, kinds: string[] = Object.keys(KEPT)): string[] {
  const named = problemsWithFileName(name);
  if (named.length) return named;
  return kinds.some((ending) => name.toLowerCase().endsWith(ending)) ? [] : [`“${name}” isn't a kind of file Playthrough keeps: its name ends in ${list(kinds)}.`];
}

export function problemsWithFileName(name: string): string[] {
  return fileName("").safeParse(name).success
    ? []
    : [`“${name}” can't be a file's name: use letters, digits, dots, dashes and underscores, and slashes between folders.`];
}

// The agents Playthrough knows by name (how each says so is the command's, `agent.ts`), and what one goes by that
// nobody can name, until it writes its name in a hand-back.
export const knownAgents = ["Claude Code", "Codex", "Cursor", "Gemini CLI"] as const;
export const unnamedAgent = "Agent";

// Where what a guest did in the app is kept among a change's branches, and only theirs: a recording kept there plays
// with nothing but its own files.
export const SHARED = "shared/";
// A guest's recording is named as their page names it, and nothing else: its take-over's id, then how many it has kept.
export const SHARED_RECORDING = /^shared\/[a-z][a-z0-9]{7,23}-\d{1,4}\.json$/;

// Who someone says they are, as a send or what they've seen says it: one short line, with nothing in it to make it read
// as anything but a name where it's printed. A guest, who came by a shared link, can't go by a name that reads as the
// person who asked for the change, the agent or Playthrough: those who sent here other than as guests, every agent
// named in the change, and the names that are always someone else's. Names are the same once folded: spaces, case and
// the Unicode forms that look alike.
const LONGEST_NAME = 60;
const NEVER_A_GUEST = ["You", "Playthrough", "The person", "Claude", "Gemini", unnamedAgent, ...knownAgents];
const folded = (name: string) => String(name).normalize("NFKC").replace(/[\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
export const sameName = (one: string, other: string) => folded(one) === folded(other);

export function problemsWithName(by: string): string[] {
  // What every object already has (“__proto__”, “constructor”) is never a name: names key what each person has seen.
  if (by === "__proto__" || by in Object.prototype) return [`“${by}” isn't a name. Say yours.`];
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(by)) return ["A name is one line, with nothing but its words in it."];
  if (by.trim().length > LONGEST_NAME) return [`A name is ${LONGEST_NAME} characters at most.`];
  return [];
}

export function problemsWithGuestsName(change: Change, by: string): string[] {
  const taken = [...NEVER_A_GUEST, ...change.handBacks.map((handBack) => handBack.by), ...change.sends.filter((send) => !send.guest).map((send) => send.by)];
  return taken.some((name) => sameName(name, by)) ? [`“${by.trim()}” is someone else here. Say your own name.`] : [];
}

// What a person writes in a note or a reply is shorter than words can be: a note, not a document.
export const LONGEST_WORDS = 4000;

// A send says new notes and replies to notes it can see, or Done: that every moment of a finished hand-back looks good.
export function problemsWithSend(change: Change, send: Send): string[] {
  const shape = problemsWithShape(Send, send, "This send");
  if (shape.length) return shape;
  const named = problemsWithName(send.by);
  if (named.length) return named;
  if (send.guest && send.done) return ["Done is for the person who shared this to say. Send your notes instead."];
  if (send.guest) {
    const someoneElse = problemsWithGuestsName(change, send.by);
    if (someoneElse.length) return someoneElse;
  }
  if ([...send.notes, ...(send.replies ?? [])].some((said) => said.words.length > LONGEST_WORDS)) return [`A note or a reply is ${LONGEST_WORDS} characters at most: say the rest in another.`];
  // Ids are told apart as the disk tells them apart, whatever case one kept before was in.
  if (change.sends.some((other) => other.id.toLowerCase() === send.id.toLowerCase())) return [`Something else was already sent as ${send.id}. Send this with a new id.`];
  const replies = send.replies ?? [];
  if (!send.notes.length && !replies.length && !send.done) return ["There's nothing in this send."];
  if (send.done && (send.notes.length || replies.length)) return ["Done says every moment looks good, and nothing more: send the notes and replies on their own."];

  const handBack = change.handBacks.find((handBack) => handBack.number === send.handBack);
  if (!handBack?.finished) return [`Hand-back ${send.handBack} isn't finished, so it can't take notes yet.`];

  const problems: string[] = [];
  const notes = allNotes(change);
  problems.push(...duplicates(send.notes.map((note) => note.id), (id) => `This send has two notes with the id ${id}.`));
  for (const note of send.notes) {
    if ([...notes.keys()].some((kept) => kept.toLowerCase() === note.id.toLowerCase())) problems.push(`The id ${note.id} is already a note's. Make a new one.`);
    if (note.on) problems.push(...problemsWithNotePlace(change, send, note.id, note.on));
  }

  problems.push(...duplicates(replies.map((reply) => reply.note), (id) => `This send has two replies on note ${id}. Say it all in one.`));
  for (const reply of replies) {
    const known = notes.get(reply.note);
    if (send.notes.some((note) => note.id === reply.note)) problems.push(`Note ${reply.note} is new: say it in the note, not a reply.`);
    else if (!known || known.handBack > send.handBack) problems.push(`There's no note ${reply.note} on hand-back ${send.handBack} to reply to.`);
  }

  return problems;
}

// What's seen is a moment handed back, a moment of a finished hand-back, or its last stop, where the notes on the whole
// change are.
export function problemsSeeing(change: Change, by: string, seen: Seen[]): string[] {
  if (!isText(by)) return ["Seeing needs to say who saw it."];
  if (problemsWithName(by).length) return problemsWithName(by);
  return seen.flatMap((one) => {
    const shape = problemsWithShape(Seen, one, "What's seen");
    if (shape.length) return shape;
    const handBack = change.handBacks.find((handBack) => handBack.number === one.handBack && handBack.finished);
    if (one.moment === undefined) return handBack ? [] : [`Hand-back ${one.handBack} hasn't been handed back, so there's nothing of it to see.`];
    return handBack?.moments.some((moment) => moment.name === one.moment) ? [] : [`Hand-back ${one.handBack} hands back no ${quote(one.moment)} to see.`];
  });
}

// What's wrong with something's shape: its name, then what it needs, as in “Hand-back 2: moment 3 needs a name.”
// What was asked, as its shape reads it (`Asked`): only its fields, each its kind; or what's wrong with it.
export function asAsked<T>(schema: z.ZodType<T>, value: unknown, subject: string): { asked: T } | { problems: string[] } {
  const result = schema.safeParse(value, { error: plainly });
  return result.success ? { asked: result.data } : { problems: problemsWithShape(schema, value, subject) };
}

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

// Names what a problem is on, innermost first: “Hand-back 2: action 1 in the moment “Export a quarter””.
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
  const { name, words, id, note } = item ?? {};
  const named: Record<string, string | false> = {
    moments: isText(name) && `the moment “${name}”`,
    findings: (isText(words) && `the finding “${cut(words)}”`) || (isText(id) && `the finding ${id}`),
    replies: isText(note) && `the reply to note ${note}`,
    notes: isText(id) && `note ${id}`,
  };
  const singular: Record<string, string> = { moments: "moment", actions: "action", findings: "finding", seen: "place it's seen", replies: "reply", notes: "note" };
  return named[list] || `${singular[list] ?? list} ${index + 1}`;
}

// A note is on a moment of a hand-back the person could see: on it, within its recording; or in the app, taken over
// within it, and within the person's own recording, which is one of their own files.
function problemsWithNotePlace(change: Change, send: Send, id: string, on: OnMoment | InApp): string[] {
  const handedBack = change.handBacks.find((handBack) => handBack.number === on.handBack && handBack.finished);
  if (!handedBack) return [`Note ${id} is on hand-back ${on.handBack}, which hasn't been handed back.`];
  if (on.handBack > send.handBack) return [`Note ${id} is on hand-back ${on.handBack}, but it's sent on hand-back ${send.handBack}.`];
  if (!madeInApp(on)) return problemsWithPlace(on, handedBack.moments, `Note ${id}`);
  const problems = problemsWithPlace({ moment: on.moment, at: on.steppedIn }, handedBack.moments, `Note ${id}'s take-over`);
  const own = send.guest ? `branches/${SHARED}` : "branches/";
  if (!on.recording.startsWith(own) || !on.recording.endsWith(".json") || (send.guest && !SHARED_RECORDING.test(on.recording.slice("branches/".length)))) problems.push(`Note ${id} is in the app, so its recording is one of ${send.guest ? "the guest's" : "the person's"} own, “${own}….json”, not “${on.recording}”.`);
  if (on.at > on.length) problems.push(`Note ${id} is at ${on.at}s, but the person's own recording is ${on.length}s long.`);
  return problems;
}

function problemsWithPlace(place: { moment: string; at?: number }, moments: Moment[], what: string): string[] {
  const moment = moments.find((moment) => moment.name === place.moment);
  if (!moment) return [`${what} is on the moment “${place.moment}”, which isn't there.`];
  return (place.at ?? 0) <= moment.length ? [] : [`${what} is at ${place.at}s, but “${moment.name}” is ${moment.length}s long.`];
}

function duplicates(values: string[], problem: (value: string) => string): string[] {
  const seen = new Set<string>();
  const twice = new Set(values.filter((value) => seen.has(value) || !seen.add(value)));
  return [...twice].map(problem);
}

const describe = (finding: Finding) => `the finding ${finding.id} (${cut(finding.words)})`;
const cut = (words: string) => (words.length > 48 ? `${words.slice(0, 47).trimEnd()}…` : words);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
