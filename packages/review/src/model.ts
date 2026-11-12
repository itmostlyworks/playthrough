// What a review is. A review is one piece of work an agent does, round after round, until a person accepts it.
// The agent records rounds, answers notes and says why each change is there; Playthrough compares each round with the ones
// before it; people send notes and verdicts. Each thing here has one writer, and once written, only a round still being
// worked on ever changes, and Before, which gains each scene added later.
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
    until: seconds("needs its end, in seconds").optional().describe("The end of a stretch"),
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
        steps: z
          .array(z.strictObject({ title: text("needs its title"), at: seconds("needs its start, in seconds") }))
          .optional()
          .describe("Run again as the agent wrote it, a fork of its scene: its steps, each at its start"),
      })
      .optional()
      .describe("In the app: on the person's own recording, which branches off a scene where they took it over. Its scene names the branch"),
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
  actions: z
    .array(seconds("needs the moment each of its actions was done, in seconds"))
    .optional()
    .describe("When each of its actions was done: between them the page rests, and a person can take the scene over there"),
  person: text("needs the name of who does it, or no person")
    .optional()
    .describe("Who does it, once the scene has changed hands: someone other than who the scene is done as"),
});

export const Scene = z.strictObject({
  name: text("needs a name").describe("Its identity: a new name is a new scene"),
  length: z.number({ error: "needs its length, in seconds" }).positive({ error: "needs its length, in seconds" }),
  steps: z.array(Step),
  recording: fileName("needs its recording: the name of a file in the round"),
  line: text("needs words in its line, or no line").optional().describe("The agent's, beside the scene's steps and at its start: what it starts from, and whether it shows the change or what the change leaves alone"),
  stopped: text("needs the step it stopped at")
    .optional()
    .describe("On Before, the step the scene couldn't take there, or that the app as it was had something else for: it's kept as far as that"),
  person: text("needs the name of who it acts as, or no person")
    .optional()
    .describe("Who the scene is done as, as its file or the app's setup names them: the name on the recorded pointer, handed to you when you take over"),
  about: Element.optional().describe("A moment's: the one thing that shows it, as the page names it, which the person sees it closed in on"),
  acted: Element.optional().describe("A moment's: the last thing done something to on the way that's still there at its point, which its still closes in on where it's about nothing"),
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

// A round compared with one before it. Against Before it's the work so far; against the round before, what the agent
// did this round; against the round someone last looked at a scene on, what's new to them. The same difference found by
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
    z.strictObject({ note: text("needs the id of the note it was made for") }).describe("Made for that note: the reply on the note says why"),
    z.strictObject({ notReal: text("needs to say why nothing really changed") }).describe("Nothing really changed; nobody is shown it"),
  ],
  { error: "says one of { line }, { note } or { notReal }" },
);

export const Reply = z.strictObject({
  note: text("needs the note it answers"),
  words: z.string({ error: "needs its words, even if empty until it's answered" }),
  on: Place.optional().describe("Where it shows on this round's recording; without it, the note's place was lost"),
  watch: text("needs a step's title").optional().describe("For an answer that moves: the step of its scene it's seen in, which the note then plays"),
});

// A note is a conversation about one thing. A person starts it in a send; then the agent's replies and people's replies
// take turns on it until someone says it looks good.
export const Note = z.strictObject({
  id: id("needs an id of letters, digits and dashes"),
  on: Place.optional().describe("Without it, about the work in general"),
  words: text("needs words"),
});

// What the agent recorded, and what it says about it. Once finished, a round never changes, except that Before gains each
// scene added later, recorded on the app as it was.
export const Round = z.strictObject({
  number: z.number().int().min(0).describe("Round 0 is Before: the app as it was"),
  by: text("needs to say which agent recorded it").describe("By the name it goes by, “Claude Code” or “Codex”: one review can pass between agents"),
  scenes: z.array(Scene),
  replies: z.array(Reply).describe("The agent's answer to each note that asks for one"),
  accounts: z.record(z.string(), Account).describe("What the agent says about each change new since the round before, by its id"),
  commit: z.string().optional().describe("What it was recorded from"),
  cantStart: z.array(text("needs the scene's name")).optional().describe("Before: the scenes the app as it was can't start, so they have no Before"),
  finished: z.iso.datetime().optional(),
});

// An answer that fixes what its note asked for. One that doesn't gets a reply instead, saying what's still wrong.
export const Verdict = z.strictObject({
  note: text("needs the note it's on"),
  verdict: z.literal("looks good", { error: "is “looks good”: one that isn't gets a reply" }),
  words: z.string().optional(),
});

// What one person sent about one round, at once. Once sent, it never changes.
export const Send = z.strictObject({
  id: id("needs an id of letters, digits and dashes").describe("Chosen by the sender, so sending twice sends once"),
  round: z.number().int().min(0),
  by: text("needs to say who sent it"),
  sent: z.iso.datetime({ error: "needs to say when it was sent, as an ISO date" }),
  notes: z.array(Note).describe("New ones"),
  verdicts: z.array(Verdict),
  replies: z
    .array(z.strictObject({ note: text("needs the note it's on"), words: text("needs words") }))
    .optional()
    .describe("A person's words back on a note's latest answer: what's still not right, or an answer to a question the agent asked. They judge nothing, and ask the agent again"),
  looksGood: z.array(text("needs the scene's name")).describe("Scenes that look good as a whole; one that isn't quite right gets a note"),
  takenBack: z.array(text("needs the scene's name")).optional().describe("Scenes whose Looks good, said before, is taken back: they ask again"),
});

// The agent took a send, and answers it in this round.
export const Taken = z.strictObject({ send: z.string(), round: z.number().int(), at: z.iso.datetime() });

// A moment someone has opened, as it was handed back in one round: one handed back again, different, asks to be seen again.
export const Seen = z.strictObject({ round: z.number().int().min(1), scene: text("needs the scene it's of") });

// Final: no rounds or sends come after it.
export const Accepted = z.strictObject({ by: z.string(), at: z.iso.datetime() });

export const Review = z.strictObject({
  id: z.string(),
  title: z.string().describe("A few words for the change, as a pull request's title"),
  asked: z.string().optional().describe("What was asked, in the person's words"),
  started: z.iso.datetime(),
  rounds: z.array(Round),
  comparisons: z.array(Comparison),
  sends: z.array(Send),
  taken: z.array(Taken),
  accepted: Accepted.optional(),
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
export type Account = z.infer<typeof Account>;
export type Reply = z.infer<typeof Reply>;
export type Note = z.infer<typeof Note>;
export type Round = z.infer<typeof Round>;
export type Verdict = z.infer<typeof Verdict>;
export type Send = z.infer<typeof Send>;
export type Taken = z.infer<typeof Taken>;
export type Accepted = z.infer<typeof Accepted>;
export type Seen = z.infer<typeof Seen>;
export type Review = z.infer<typeof Review>;

// Ids are made where the thing is made, by whoever makes it, so nobody has to ask anyone for one.
export function newId(): string {
  const letters = "abcdefghijkmnpqrstuvwxyz23456789"; // none that read alike
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => letters[byte % 32]).join("");
}
