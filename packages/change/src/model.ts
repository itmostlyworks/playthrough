// What a change is: one change an agent makes, its moments handed back hand-back after hand-back until the person says it's done.
// The agent keeps each moment as a moment of a hand-back and answers notes; Playthrough compares each hand-back with the ones
// before it; people send notes, replies, and Done. Each thing here has one writer, and once written, only a hand-back still
// being worked on ever changes.
//
// Each shape is a schema, so the types and what's checked at the door are one statement. An error is written as
// what the thing still needs, to follow its name: “the moment “Export a quarter” needs its length, in seconds”.

import { z } from "zod";

const text = (error: string) => z.string({ error }).refine((value) => value.trim() !== "", { error });
// A send's id names the file it's kept in, and a note's the pictures of it: words a file can be called.
const id = (error: string) => z.string({ error }).regex(/^[\w-]+$/, { error });
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
  node: z.number().int().optional().describe("The element in the one recording it was read from: no other's"),
});

// Shares of the screen, from 0 to 1, so they hold at any size.
const onScreen = "isn't on the screen. Boxes and points are shares of the screen, from 0 to 1";
export const Box = z
  .strictObject({ x: share(onScreen), y: share(onScreen), width: share(onScreen), height: share(onScreen) })
  .refine((box) => box.x + box.width <= 1 && box.y + box.height <= 1, { error: onScreen });
export const Point = z.strictObject({ x: share(onScreen), y: share(onScreen) });

const ONE_THING = "is on more than one thing. Choose an element, a box or a point";
function onOneThing(place: { element?: unknown; box?: unknown; point?: unknown }) {
  return [place.element, place.box, place.point].filter((thing) => thing).length <= 1;
}
function atSomeMoment(place: { at?: number; element?: unknown; box?: unknown; point?: unknown }) {
  return place.at !== undefined || !(place.element || place.box || place.point);
}

// Something a person did in the app, stepped into: what, on the element at that path, with what, and its words.
export const Did = z.strictObject({
  does: text("needs what it did"),
  on: text("needs the path to what it was done on"),
  with: z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
  what: z.string().optional().describe("The words of what it was done on"),
});

// Where Playthrough saw a change: a moment, at a time in its recording, on a thing there. Without a time, the whole
// moment, as one that's gone.
export const Place = z
  .strictObject({
    moment: text("needs the moment it's on"),
    at: seconds("needs its time, in seconds").optional().describe("Without it, the whole moment"),
    element: Element.optional(),
    alike: z.array(Element).optional().describe("The other things changed alike with its element, each where it is"),
    box: Box.optional().describe("Something with no words of its own, or where only the pixels changed"),
    inside: z.array(Element).optional().describe("For a part of the page counted as one change, the things that changed inside it, each on whichever hand-back has it"),
    point: Point.optional().describe("Empty space"),
  })
  .refine(onOneThing, { error: ONE_THING })
  .refine(atSomeMoment, { error: "is on something but at no time. Give it one" });

// Where a note is: on a moment as it was handed back, or on what was there after stepping into the app from one. Either
// way it names the hand-back and the moment, so which moment a note is on is always its `moment`, and the recording its
// thing's element number belongs to is said outright.
const handBackNumber = z.number({ error: "needs the hand-back it's on" }).int().min(1, { error: "needs the hand-back it's on, from 1" });
export const OnMoment = z
  .strictObject({
    handBack: handBackNumber,
    moment: text("needs the moment it's on"),
    at: seconds("needs its time, in seconds").optional().describe("Seconds into the moment's recording on that hand-back; without it, the whole moment"),
    element: Element.optional().describe("Its node is in the moment's recording on that hand-back"),
    box: Box.optional().describe("Something with no words of its own"),
    point: Point.optional().describe("Empty space"),
    cantStepIn: text("needs why Step in didn't work, or no cantStepIn")
      .optional()
      .describe("Why Step in didn't work here, whole, as Playthrough said it for the agent: kept on the note the person made of it with Tell the agent, and never shown them"),
  })
  .refine(onOneThing, { error: ONE_THING })
  .refine(atSomeMoment, { error: "is on something but at no time. Give it one" });
export const InApp = z
  .strictObject({
    handBack: handBackNumber,
    moment: text("needs the moment it was stepped into"),
    steppedIn: seconds("needs where they stepped in, in seconds").describe("Seconds into the moment's recording on that hand-back"),
    did: z.array(Did, { error: "needs what they did there, a list, even if it's empty" }).describe("What the person did there, in order"),
    address: z.string().optional().describe("Where the app was when the note was made: its path, query and hash, as the agent's browser would go there, with what setup made for that run written as setup's (${setup.board})"),
    recording: fileName("needs its recording: the name of one of the person's own files").describe("The moment up to where they stepped in, then what they did"),
    length: z.number({ error: "needs its length, in seconds" }).positive({ error: "needs its length, in seconds" }),
    at: seconds("needs its time, in seconds").describe("Seconds into the person's own recording"),
    element: Element.optional().describe("Its node is in the person's own recording"),
    box: Box.optional().describe("Something with no words of its own"),
    point: Point.optional().describe("Empty space"),
  })
  .refine(onOneThing, { error: ONE_THING });

// Something done in a moment as it was recorded: when it was done, and, recorded since Playthrough kept them, what it was,
// as another recording of the moment knows the same thing done, and when it began. Two recordings are lined up by these.
export const Action = z.strictObject({
  at: seconds("needs the time it was done, in seconds").describe("Between two, the page rests, and a person can step in there"),
  what: text("needs what was done").optional().describe("As a recording names it: “click link “Settings””"),
  began: seconds("needs the time it began, in seconds").optional(),
});

export const Moment = z.strictObject({
  name: text("needs a name").describe("Its identity: a new name is a new moment"),
  length: z.number({ error: "needs its length, in seconds" }).positive({ error: "needs its length, in seconds" }),
  recording: fileName("needs its recording: the name of a file in the hand-back"),
  person: text("needs the name of who it acts as, or no person")
    .optional()
    .describe("Who the moment is done as, as its file or the app's setup names them: the name on the recorded pointer, handed to you when you step in"),
  about: Element.optional().describe("A moment's: the one thing that shows it, as the page names it, which the person sees it closed in on"),
  acted: Element.optional().describe("A moment's: the last thing done something to on the way that's still there at its point, which its still closes in on where it's about nothing"),
  from: seconds("needs where the moment starts, in seconds").describe(
    "Where what's shown of its recording starts, the way there before it kept and never shown; with nothing done from there on, the moment is a still",
  ),
  actions: z.array(Action, { error: "needs what was done in it, a list, even if it's empty" }).describe("What it did once its way there was done, in order; a moment kept before moments had a start did its way there here too, before where it starts"),
  unsteady: z
    .array(text("needs the ids of the changes it makes by itself"))
    .optional()
    .describe("Changes found between two recordings of the same app, like a time the server stamps: left out of every comparison, in every moment"),
});

// Something different on screen between two hand-backs, found by Playthrough and said in its fixed words.
export const Finding = z.strictObject({
  id: text("needs an id").describe("Its thing and its kind of change, so it keeps its id in every hand-back while it's the same change"),
  words: text("needs its words").describe("What changed, for the agent: “Download CSV and Cancel have swapped places”"),
  reworded: text("needs the words that read differently")
    .optional()
    .describe("For words reworded, the words that read differently now, which the viewer marks where they are: “on their own”"),
  gone: z.literal(true).optional().describe("Not on the newer hand-back: where it was, on the hand-back before, is where it's seen, with Compare"),
  seen: z
    .array(Place, { error: "needs where it's seen, a list" })
    .min(1, { error: "needs where it's seen: each moment, at its time there" })
    .describe("Each moment it's seen in, at its time there; a moment that's gone, with no time"),
  pictureOnly: z
    .literal(true)
    .optional()
    .describe("Seen only in the pictures, with nothing read there changed: shown to the person, who can see what it is, and not put to the agent, who can't see more of it than Playthrough did"),
});

// A hand-back compared with one before it: against the hand-back before, what the agent did this hand-back; against the hand-back
// someone last looked at a moment on, what's new to them. The same difference found by two comparisons has the same id.
export const Comparison = z.strictObject({
  handBack: z.number({ error: "needs its hand-back" }).int().min(1, { error: "needs its hand-back, from 1" }),
  since: z.number({ error: "needs the hand-back it's compared with" }).int().min(1, { error: "needs the hand-back it's compared with, from 1" }),
  findings: z.array(Finding, { error: "needs its findings, a list, even if it's empty" }),
});

// Where an answered note's thing is in the hand-back its answer goes with, as Playthrough followed it there: its moment,
// the time of the frame it's seen at, the thing by its role, name and element there, and that frame's picture.
export const Shown = z.strictObject({
  moment: text("needs the moment it's shown on"),
  at: seconds("needs its time, in seconds").describe("Seconds into the moment's recording on that hand-back"),
  element: Element.describe("Its node is in the moment's recording on that hand-back"),
  frame: text("needs the name of the frame's picture").optional().describe("The moment's frame it's seen at, as pictured (“first”, “after-1”…); without it, the moment's end"),
});

export const Reply = z.strictObject({
  note: text("needs the note it answers"),
  words: z.string({ error: "needs its words, even if empty until it's answered" }),
  shown: Shown.optional().describe("Where what it's on shows in this hand-back; without it, as it's shown on its moment"),
});

// A note is a conversation about one thing. A person starts it in a send; then the agent's replies and people's replies
// take turns on it.
export const Note = z.strictObject({
  id: id("needs an id of letters, digits and dashes"),
  on: z
    .union([OnMoment, InApp], { error: "is on a moment as handed back (its hand-back, moment and at) or in the app (its hand-back, moment, steppedIn, did, recording, length and at)" })
    .optional()
    .describe("Without it, about the work in general"),
  words: text("needs words"),
});

// What the agent handed back, and its answers. Once finished, a hand-back never changes.
export const HandBack = z.strictObject({
  number: z.number().int().min(1),
  by: text("needs to say which agent recorded it").describe("By the name it goes by, “Claude Code” or “Codex”: one change can pass between agents"),
  moments: z.array(Moment),
  replies: z.array(Reply).describe("The agent's answer to each note that asks for one"),
  finished: z.iso.datetime().optional(),
});

// What one person sent about one hand-back, at once: notes and replies, or Done. Once sent, it never changes.
export const Send = z.strictObject({
  id: id("needs an id of letters, digits and dashes").describe("Chosen by the sender, so sending twice sends once"),
  handBack: z.number().int().min(1),
  by: text("needs to say who sent it"),
  sent: z.iso.datetime({ error: "needs to say when it was sent, as an ISO date" }),
  notes: z.array(Note).describe("New ones"),
  replies: z
    .array(z.strictObject({ note: text("needs the note it's on"), words: text("needs words") }))
    .optional()
    .describe("A person's words back on a note's latest answer: what's still not right, or an answer to a question the agent asked. They judge nothing, and ask the agent again"),
  done: z.literal(true, { error: "is true or left out" }).optional().describe("Done: every moment of its hand-back looks good, and that's all it says"),
});

// The agent took a send, and answers it in this hand-back.
export const Taken = z.strictObject({ send: z.string(), handBack: z.number().int(), at: z.iso.datetime() });

// A moment someone has opened, as it was handed back in one hand-back: one handed back again, different, asks to be seen again.
export const Seen = z.strictObject({ handBack: z.number().int().min(1), moment: text("needs the moment it's of").optional().describe("Without it, the last stop: the change as a whole") });

export const Change = z.strictObject({
  id: z.string(),
  title: z.string().describe("A few words for the change, as a pull request's title"),
  asked: z.string().optional().describe("What was asked, in the person's words"),
  started: z.iso.datetime(),
  handBacks: z.array(HandBack),
  comparisons: z.array(Comparison),
  sends: z.array(Send),
  taken: z.array(Taken),
  seen: z.record(z.string(), z.array(Seen)).optional().describe("What each person has opened, by their name"),
});

export type Element = z.infer<typeof Element>;
export type Box = z.infer<typeof Box>;
export type Point = z.infer<typeof Point>;
export type Did = z.infer<typeof Did>;
export type Place = z.infer<typeof Place>;
export type OnMoment = z.infer<typeof OnMoment>;
export type InApp = z.infer<typeof InApp>;
export type Action = z.infer<typeof Action>;
export type Moment = z.infer<typeof Moment>;
export type Finding = z.infer<typeof Finding>;
export type Comparison = z.infer<typeof Comparison>;
export type Reply = z.infer<typeof Reply>;
export type Shown = z.infer<typeof Shown>;
export type Note = z.infer<typeof Note>;
export type HandBack = z.infer<typeof HandBack>;
export type Send = z.infer<typeof Send>;
export type Taken = z.infer<typeof Taken>;
export type Seen = z.infer<typeof Seen>;
export type Change = z.infer<typeof Change>;

// A note made in the app after stepping in, rather than on a moment as handed back.
export const madeInApp = (on: OnMoment | InApp): on is InApp => "recording" in on;

// Ids are made where the thing is made, by whoever makes it, so nobody has to ask anyone for one.
export function newId(): string {
  const letters = "abcdefghijkmnpqrstuvwxyz23456789"; // none that read alike
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => letters[byte % 32]).join("");
}
