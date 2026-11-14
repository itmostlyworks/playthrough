// What a review is: one change an agent makes, its moments handed back round after round until the person says it's done.
// The agent keeps each moment as a scene of a round and answers notes; Playthrough compares each round with the ones
// before it; people send notes, replies, and Done. Each thing here has one writer, and once written, only a round still
// being worked on ever changes.
//
// Each shape is a schema, so the types and what's checked at the door are one statement. An error is written as
// what the thing still needs, to follow its name: “the scene “Export a quarter” needs its length, in seconds”.

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
  node: z.number().int().optional().describe("The element in that round's recording"),
});

// Shares of the screen, from 0 to 1, so they hold at any size.
const onScreen = "isn't on the screen. Boxes and points are shares of the screen, from 0 to 1";
export const Box = z
  .strictObject({ x: share(onScreen), y: share(onScreen), width: share(onScreen), height: share(onScreen) })
  .refine((box) => box.x + box.width <= 1 && box.y + box.height <= 1, { error: onScreen });
export const Point = z.strictObject({ x: share(onScreen), y: share(onScreen) });

// Something a person did in the app, taken over: what, on the element at that path, with what, and its words.
export const Did = z.strictObject({
  does: text("needs what it did"),
  on: text("needs the path to what it was done on"),
  with: z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
  what: z.string().optional().describe("The words of what it was done on"),
});

export const Place = z
  .strictObject({
    scene: text("needs the scene it's on"),
    at: seconds("needs its moment, in seconds").optional().describe("Without it, the whole scene"),
    element: Element.optional(),
    alike: z.array(Element).optional().describe("The other things changed alike with its element, each where it is"),
    box: Box.optional().describe("Something with no words of its own, or where only the pixels changed"),
    point: Point.optional().describe("Empty space"),
    app: z
      .strictObject({
        from: z.strictObject({ scene: text("needs the scene it was taken over in"), at: seconds("needs the moment it was taken over at, in seconds") }),
        did: z.array(Did).describe("What the person did there, in order"),
        recording: fileName("needs its recording: the name of a file in the round").describe("The scene up to where it was taken over, then the person's own steps"),
        length: z.number({ error: "needs its length, in seconds" }).positive({ error: "needs its length, in seconds" }),
      })
      .optional()
      .describe("In the app: on the person's own recording, which branches off a scene where they took it over. Its scene names the branch"),
  })
  .refine((place) => [place.element, place.box, place.point].filter((thing) => thing).length <= 1, {
    error: "is on more than one thing. Choose an element, a box or a point",
  })
  .refine((place) => place.at !== undefined || !(place.element || place.box || place.point), {
    error: "is on something but at no moment. Give it one",
  });

export const Step = z.strictObject({
  title: text("needs a title").describe("Steps are matched across rounds by their title"),
  at: seconds("needs the moment it starts, in seconds"),
  actions: z
    .array(seconds("needs the moment each of its actions was done, in seconds"))
    .optional()
    .describe("When each of its actions was done: between them the page rests, and a person can take the scene over there"),
  began: z
    .array(
      z.strictObject({
        action: text("needs what the action was"),
        at: seconds("needs the moment the action began, in seconds"),
      }),
    )
    .optional()
    .describe("Each of its actions as it began, in the order of actions: what it was, as another recording of the scene knows the same action, and when. Two recordings are lined up by these"),
});

export const Scene = z.strictObject({
  name: text("needs a name").describe("Its identity: a new name is a new scene"),
  length: z.number({ error: "needs its length, in seconds" }).positive({ error: "needs its length, in seconds" }),
  steps: z.array(Step),
  recording: fileName("needs its recording: the name of a file in the round"),
  person: text("needs the name of who it acts as, or no person")
    .optional()
    .describe("Who the scene is done as, as its file or the app's setup names them: the name on the recorded pointer, handed to you when you take over"),
  about: Element.optional().describe("A moment's: the one thing that shows it, as the page names it, which the person sees it closed in on"),
  acted: Element.optional().describe("A moment's: the last thing done something to on the way that's still there at its point, which its still closes in on where it's about nothing"),
  from: seconds("needs where the moment starts, in seconds").describe(
    "Where what's shown of its recording starts, where its step does, the way there before it kept and never shown; with nothing done from there on, the moment is a still",
  ),
  unsteady: z
    .array(text("needs the ids of the changes it makes by itself"))
    .optional()
    .describe("Changes found between two recordings of the same app, like a time the server stamps: left out of every comparison, in every scene"),
});

// Something different on screen between two rounds, found by Playthrough and said in its fixed words.
export const Change = z.strictObject({
  id: text("needs an id").describe("Its thing and its kind of change, so it keeps its id in every round while it's the same change"),
  words: text("needs its words").describe("What changed, for the agent: “Download CSV and Cancel have swapped places”"),
  reworded: text("needs the words that read differently")
    .optional()
    .describe("For words reworded, the words that read differently now, which the viewer marks where they are: “on their own”"),
  gone: z.literal(true).optional().describe("Not on the newer round: where it was, on the round before, is where it's seen, with Compare"),
  seen: z
    .array(Place, { error: "needs where it's seen, a list" })
    .min(1, { error: "needs where it's seen: each scene, at its moment there" })
    .describe("Each scene it's seen in, at its moment there; a scene that's gone, with no moment"),
  pictureOnly: z
    .literal(true)
    .optional()
    .describe("Seen only in the pictures, with nothing read there changed: shown to the person, who can see what it is, and not put to the agent, who can't see more of it than Playthrough did"),
});

// A round compared with one before it: against the round before, what the agent did this round; against the round
// someone last looked at a moment on, what's new to them. The same difference found by two comparisons has the same id.
export const Comparison = z.strictObject({
  round: z.number({ error: "needs its round" }).int().min(1, { error: "needs its round, from 1" }),
  since: z.number({ error: "needs the round it's compared with" }).int().min(1, { error: "needs the round it's compared with, from 1" }),
  changes: z.array(Change, { error: "needs its changes, a list, even if it's empty" }),
});

export const Reply = z.strictObject({
  note: text("needs the note it answers"),
  words: z.string({ error: "needs its words, even if empty until it's answered" }),
});

// A note is a conversation about one thing. A person starts it in a send; then the agent's replies and people's replies
// take turns on it.
export const Note = z.strictObject({
  id: id("needs an id of letters, digits and dashes"),
  on: Place.optional().describe("Without it, about the work in general"),
  words: text("needs words"),
});

// What the agent handed back, and its answers. Once finished, a round never changes.
export const Round = z.strictObject({
  number: z.number().int().min(1),
  by: text("needs to say which agent recorded it").describe("By the name it goes by, “Claude Code” or “Codex”: one review can pass between agents"),
  scenes: z.array(Scene),
  replies: z.array(Reply).describe("The agent's answer to each note that asks for one"),
  finished: z.iso.datetime().optional(),
});

// What one person sent about one round, at once: notes and replies, or Done. Once sent, it never changes.
export const Send = z.strictObject({
  id: id("needs an id of letters, digits and dashes").describe("Chosen by the sender, so sending twice sends once"),
  round: z.number().int().min(1),
  by: text("needs to say who sent it"),
  sent: z.iso.datetime({ error: "needs to say when it was sent, as an ISO date" }),
  notes: z.array(Note).describe("New ones"),
  replies: z
    .array(z.strictObject({ note: text("needs the note it's on"), words: text("needs words") }))
    .optional()
    .describe("A person's words back on a note's latest answer: what's still not right, or an answer to a question the agent asked. They judge nothing, and ask the agent again"),
  done: z.literal(true, { error: "is true or left out" }).optional().describe("Done: every moment of its round looks good, and that's all it says"),
});

// The agent took a send, and answers it in this round.
export const Taken = z.strictObject({ send: z.string(), round: z.number().int(), at: z.iso.datetime() });

// A moment someone has opened, as it was handed back in one round: one handed back again, different, asks to be seen again.
export const Seen = z.strictObject({ round: z.number().int().min(1), scene: text("needs the scene it's of") });

export const Review = z.strictObject({
  id: z.string(),
  title: z.string().describe("A few words for the change, as a pull request's title"),
  asked: z.string().optional().describe("What was asked, in the person's words"),
  started: z.iso.datetime(),
  rounds: z.array(Round),
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
export type Step = z.infer<typeof Step>;
export type Scene = z.infer<typeof Scene>;
export type Change = z.infer<typeof Change>;
export type Comparison = z.infer<typeof Comparison>;
export type Reply = z.infer<typeof Reply>;
export type Note = z.infer<typeof Note>;
export type Round = z.infer<typeof Round>;
export type Send = z.infer<typeof Send>;
export type Taken = z.infer<typeof Taken>;
export type Seen = z.infer<typeof Seen>;
export type Review = z.infer<typeof Review>;

// Ids are made where the thing is made, by whoever makes it, so nobody has to ask anyone for one.
export function newId(): string {
  const letters = "abcdefghijkmnpqrstuvwxyz23456789"; // none that read alike
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => letters[byte % 32]).join("");
}
