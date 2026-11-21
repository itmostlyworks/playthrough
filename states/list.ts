// The states: each a moment in a kept change's life, made again from its own history at every load. Each says what to
// do and what you'll see, then how the copy starts, in the loop's own steps, so the same states hold on any app with a
// kept change.

export type State = {
  name: string; // its address, after the #
  title: string;
  says: string;
  // The loop itself, in its order, or what's beside it.
  group: "The loop" | "Beside it";
  // The change as it was when this version was handed back: the first one with notes sent on it, or the latest.
  version: "noted" | "latest";
  // The notes the person kept on that version: written in the page but not sent, sent, sent and taken by the agent; or
  // Done said on it.
  notes?: "written" | "sent" | "taken" | "done";
  watched: "nothing" | "earlier" | "all" | "all but the last" | "some";
  // Listening, it takes what's sent and hands back the next kept version a few seconds later; working, it has taken
  // what's sent and stays at it until Hand back now; nobody, no agent at all.
  agent: "listening" | "working" | "nobody";
  // Seconds after you arrive that the agent hands back what it has taken, instead of a few.
  landsIn?: number;
  // The latest version made this long, from its own moments.
  moments?: number;
  // No change at all.
  empty?: true;
  // What's sent never reaches Playthrough, as when it has stopped.
  sendFails?: true;
  // More changes beside this one, each made from the kept one as the named state makes it, under a title of its own.
  beside?: string[];
  // Where the player opens: on the first moment, rather than what's next.
  opens?: "first moment";
};

export const states: State[] = [
  {
    name: "handed-back",
    title: "Handed back",
    says: "Nothing watched yet. Watch, write a note and send it: the next version lands a few seconds later.",
    group: "The loop",
    version: "noted",
    watched: "nothing",
    agent: "listening",
  },
  {
    name: "notes-written",
    title: "Notes written, not sent",
    says: "All watched, your notes written but not sent. Send them: the next version lands a few seconds later.",
    group: "The loop",
    version: "noted",
    notes: "written",
    watched: "all",
    agent: "listening",
  },
  {
    name: "agent-working",
    title: "The agent working",
    says: "The agent took your notes and stays at it. Press Hand back now when you want the next version.",
    group: "The loop",
    version: "noted",
    notes: "taken",
    watched: "all",
    agent: "working",
  },
  {
    name: "a-new-version-lands",
    title: "A new version lands",
    says: "You're on the old version, your notes with the agent. The next version lands five seconds in.",
    group: "The loop",
    version: "noted",
    notes: "taken",
    watched: "all",
    agent: "listening",
    landsIn: 5,
    opens: "first moment",
  },
  {
    name: "answers-came-back",
    title: "Answers came back",
    says: "The latest version, the agent's answers to your notes in it, nothing of it watched yet.",
    group: "The loop",
    version: "latest",
    watched: "earlier",
    agent: "listening",
  },
  {
    name: "ready-for-done",
    title: "Ready for Done",
    says: "Everything in the latest version watched. Press Done.",
    group: "The loop",
    version: "latest",
    watched: "all",
    agent: "listening",
  },
  {
    name: "unseen-at-done",
    title: "Something unseen at Done",
    says: "All of the latest version watched but its last moment. Press Done.",
    group: "The loop",
    version: "latest",
    watched: "all but the last",
    agent: "listening",
  },
  {
    name: "all-caught-up",
    title: "All caught up",
    says: "You said Done on the latest version: nothing waits on you.",
    group: "The loop",
    version: "latest",
    notes: "done",
    watched: "all",
    agent: "nobody",
  },
  {
    name: "no-agent-listening",
    title: "No agent listening",
    says: "Your notes are sent, and no agent is listening for them.",
    group: "Beside it",
    version: "noted",
    notes: "sent",
    watched: "all",
    agent: "nobody",
  },
  {
    name: "sending-fails",
    title: "Sending fails",
    says: "Your notes are written. Send them: Playthrough has stopped, so they don't go.",
    group: "Beside it",
    version: "noted",
    notes: "written",
    watched: "all",
    agent: "listening",
    sendFails: true,
  },
  {
    name: "a-long-change",
    title: "A long change",
    says: "The latest version, fifteen moments long, the first few watched.",
    group: "Beside it",
    version: "latest",
    watched: "some",
    agent: "listening",
    moments: 15,
  },
  {
    name: "several-changes",
    title: "Several changes",
    says: "Three changes: one handed back, one the agent is working on, one sent with no agent listening.",
    group: "Beside it",
    version: "noted",
    watched: "nothing",
    agent: "listening",
    beside: ["agent-working", "no-agent-listening"],
  },
  {
    name: "nothing-here-yet",
    title: "Nothing here yet",
    says: "No change has come from any agent yet.",
    group: "Beside it",
    version: "latest",
    watched: "nothing",
    agent: "nobody",
    empty: true,
  },
];
