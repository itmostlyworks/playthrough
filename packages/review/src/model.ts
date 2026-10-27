// What a review is. A review is one piece of work an agent does, round after round, until a person accepts it.
// The agent records rounds, answers notes and says why each change is there; Vantage compares each round with the ones
// before it; people send notes and verdicts. Each thing here has one writer, and once written, only a round still being
// worked on ever changes, and Before, which gains each flow added later.
//
// Each shape is a schema, so the types and what's checked at the door are one statement. An error is written as
// what the thing still needs, to follow its name: “the flow “Export a quarter” needs its length, in seconds”.

import { z } from "zod";

const text = (error: string) => z.string({ error }).refine((value) => value.trim() !== "", { error });
const seconds = (error: string) => z.number({ error }).min(0, { error });
const share = (error: string) => z.number({ error }).min(0, { error }).max(1, { error });
export const fileName = (error: string) =>
  z
    .string({ error })
    .regex(/^[\w.-]+(\/[\w.-]+)*$/, { error })
    .refine((name) => !name.split("/").some((part) => part === "." || part === ".."), { error });

export const Element = z.strictObject({
  role: text("needs its role").describe("As getByRole takes it, or text, row or box for something with no role of its own"),
  name: text("needs its name"),
  css: z.string().optional(),
  node: z.number().int().optional().describe("The element in that round's recording"),
});

// Shares of the screen, from 0 to 1, so they hold at any size.
const onScreen = "isn't on the screen. Boxes and points are shares of the screen, from 0 to 1";
export const Box = z
  .strictObject({ x: share(onScreen), y: share(onScreen), width: share(onScreen), height: share(onScreen) })
  .refine((box) => box.x + box.width <= 1 && box.y + box.height <= 1, { error: onScreen });
export const Point = z.strictObject({ x: share(onScreen), y: share(onScreen) });

export const Place = z
  .strictObject({
    flow: text("needs the flow it's on"),
    at: seconds("needs its moment, in seconds").optional().describe("Without it, the whole flow"),
    until: seconds("needs its end, in seconds").optional().describe("The end of a stretch"),
    element: Element.optional(),
    box: Box.optional().describe("Something with no words of its own, or where only the pixels changed"),
    point: Point.optional().describe("Empty space"),
  })
  .refine((place) => [place.element, place.box, place.point].filter((thing) => thing).length <= 1, {
    error: "is on more than one thing. Choose an element, a box or a point",
  })
  .refine((place) => place.at !== undefined || !(place.element || place.box || place.point), {
    error: "is on something but at no moment. Give it one",
  })
  .refine((place) => place.until === undefined || (place.at !== undefined && place.until > place.at), {
    error: "ends before it starts. A stretch ends after its moment",
  });

export const Step = z.strictObject({
  title: text("needs a title").describe("Steps are matched across rounds by their title"),
  at: seconds("needs the moment it starts, in seconds"),
});

export const Flow = z.strictObject({
  name: text("needs a name").describe("Its identity: a new name is a new flow"),
  length: z.number({ error: "needs its length, in seconds" }).positive({ error: "needs its length, in seconds" }),
  steps: z.array(Step),
  recording: fileName("needs its recording: the name of a file in the round"),
  line: text("needs words in its line, or no line").optional().describe("The agent's, at the flow's start: what it starts from, or the choice it shows"),
  stopped: text("needs the step it stopped at")
    .optional()
    .describe("On Before, the step the flow couldn't take there: it's kept as far as that, and tried again by vantage start"),
  person: text("needs the name of who it acts as, or no person")
    .optional()
    .describe("Who the flow acts as, from the app's setup: the name on the recorded pointer, handed to you when you take over"),
  unsteady: z
    .array(text("needs the ids of the changes it makes by itself"))
    .optional()
    .describe("Changes found between two recordings of the same app, like a time the server stamps: left out of every comparison of the flow"),
});

// Something different on screen between two rounds, found by Vantage and said in its fixed words.
export const Change = z.strictObject({
  id: text("needs an id").describe("Its thing and its kind of change, so it keeps its id in every round while it's the same change"),
  words: text("needs its words").describe("What changed, for the agent: “Download CSV and Cancel have swapped places”"),
  seen: z
    .array(Place, { error: "needs where it's seen, a list" })
    .min(1, { error: "needs where it's seen: each flow, at its moment there" })
    .describe("Each flow it's seen in, at its moment there; a flow that's gone, with no moment"),
});

// A round compared with one before it. Against Before it's the work so far; against the round before, what the agent
// did this round; against the round someone last looked at a flow on, what's new to them. The same difference found by
// two comparisons has the same id, so what the agent said about it holds in both.
export const Comparison = z.strictObject({
  round: z.number({ error: "needs its round" }).int().min(1, { error: "needs its round, after Before" }),
  since: z.number({ error: "needs the round it's compared with" }).int().min(0).describe("0 is Before"),
  changes: z.array(Change, { error: "needs its changes, a list, even if it's empty" }),
});

// What the agent says about a change: why it's there, the note it was made for, or that nothing really changed. One of
// them, in the round where something about the change is new.
export const Account = z.union(
  [
    z.strictObject({ line: text("needs words in its line") }).describe("Why it's there, in the agent's voice: what it meant or chose"),
    z.strictObject({ note: text("needs the note it was made for") }).describe("Made for that note: the reply on the note says why"),
    z.strictObject({ notReal: text("needs to say why nothing really changed") }).describe("Nothing really changed; nobody is shown it"),
  ],
  { error: "says one of { line }, { note } or { notReal }" },
);

export const Reply = z.strictObject({
  note: text("needs the note it answers"),
  words: z.string({ error: "needs its words, even if empty until it's answered" }),
  on: Place.optional().describe("Where it shows on this round's recording; without it, the note's place was lost"),
});

// A note is a conversation about one thing. A person starts it in a send; then the agent's replies and people's verdicts
// take turns on it until it looks good.
export const Note = z.strictObject({
  id: text("needs an id"),
  on: Place.optional().describe("Without it, about the work in general"),
  words: text("needs words"),
});

// What the agent recorded, and what it says about it. Once finished, a round never changes, except that Before gains each
// flow added later, recorded on the app as it was.
export const Round = z.strictObject({
  number: z.number().int().min(0).describe("Round 0 is Before: the app as it was"),
  by: text("needs to say which agent recorded it").describe("By the name it goes by, “Claude Code” or “Codex”: one review can pass between agents"),
  flows: z.array(Flow),
  replies: z.array(Reply).describe("The agent's answer to each note that asks for one"),
  accounts: z.record(z.string(), Account).describe("What the agent says about each change new since the round before, by its id"),
  commit: z.string().optional().describe("What it was recorded from"),
  cantStart: z.array(text("needs the flow's name")).optional().describe("Before: the flows the app as it was can't start, so they have no Before"),
  finished: z.iso.datetime().optional(),
});

export const Verdict = z
  .strictObject({
    note: text("needs the note it's on"),
    verdict: z.enum(["looks good", "not quite"], { error: "is “looks good” or “not quite”" }),
    words: z.string().optional(),
  })
  .refine((verdict) => verdict.verdict !== "not quite" || verdict.words?.trim(), {
    error: "is not quite, so it needs words saying what's still wrong",
  });

// What one person sent about one round, at once. Once sent, it never changes.
export const Send = z.strictObject({
  id: text("needs an id").describe("Chosen by the sender, so sending twice sends once"),
  round: z.number().int().min(0),
  by: text("needs to say who sent it"),
  sent: z.iso.datetime({ error: "needs to say when it was sent, as an ISO date" }),
  notes: z.array(Note).describe("New ones"),
  verdicts: z.array(Verdict),
  looksGood: z.array(text("needs the flow's name")).describe("Flows that look good as a whole; one that isn't quite right gets a note"),
});

// The agent took a send, and answers it in this round.
export const Taken = z.strictObject({ send: z.string(), round: z.number().int(), at: z.iso.datetime() });

// Final: no rounds or sends come after it.
export const Accepted = z.strictObject({ by: z.string(), at: z.iso.datetime() });

export const Review = z.strictObject({
  id: z.string(),
  title: z.string().describe("What was asked, in the person's words"),
  started: z.iso.datetime(),
  rounds: z.array(Round),
  comparisons: z.array(Comparison),
  sends: z.array(Send),
  taken: z.array(Taken),
  accepted: Accepted.optional(),
});

export type Element = z.infer<typeof Element>;
export type Box = z.infer<typeof Box>;
export type Point = z.infer<typeof Point>;
export type Place = z.infer<typeof Place>;
export type Step = z.infer<typeof Step>;
export type Flow = z.infer<typeof Flow>;
export type Change = z.infer<typeof Change>;
export type Comparison = z.infer<typeof Comparison>;
export type Account = z.infer<typeof Account>;
export type Reply = z.infer<typeof Reply>;
export type Note = z.infer<typeof Note>;
export type Round = z.infer<typeof Round>;
export type Verdict = z.infer<typeof Verdict>;
export type Send = z.infer<typeof Send>;
export type Taken = z.infer<typeof Taken>;
export type Accepted = z.infer<typeof Accepted>;
export type Review = z.infer<typeof Review>;

// Ids are made where the thing is made, by whoever makes it, so nobody has to ask anyone for one.
export function newId(): string {
  const letters = "abcdefghijkmnpqrstuvwxyz23456789"; // none that read alike
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => letters[byte % 32]).join("");
}
