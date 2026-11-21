// The states: each a moment in a kept change's life, made again from its own history at every load. Each says what to
// do and what you'll see, then how the copy starts, in the loop's own steps, so the same states hold on any app with a
// kept change.

export type State = {
  name: string; // its address, after the #
  title: string;
  says: string;
  // The change as it was when this version was handed back: the first one with notes sent on it, or the latest.
  version: "noted" | "latest";
  // The notes the person kept on that version: written in the page but not sent, sent, sent and taken by the agent; or
  // Done said on it.
  notes?: "written" | "sent" | "taken" | "done";
  watched: "nothing" | "earlier" | "all" | "all but the last" | "some";
  // Listening, it takes what's sent and hands back the next kept version a few seconds later; working, it has taken
  // what's sent and stays at it; nobody, no agent at all.
  agent: "listening" | "working" | "nobody";
  // Seconds after you arrive that the agent hands back what it has taken, instead of a few.
  landsIn?: number;
  // The latest version made this long, from its own moments.
  moments?: number;
  // No change at all.
  empty?: true;
  // What's sent can't be kept.
  sendFails?: true;
  // Where the player opens: on the first moment, rather than what's next.
  opens?: "first moment";
};

export const states: State[] = [
  {
    name: "handed-back",
    title: "Handed back",
    says: "A version just handed back, nothing watched. Watch the moments, write a note and send it: the agent takes it, and the next version lands a few seconds later.",
    version: "noted",
    watched: "nothing",
    agent: "listening",
  },
  {
    name: "notes-written",
    title: "Notes written, not sent",
    says: "You've watched it all and written your notes, but not sent them. Send them and watch the next version land.",
    version: "noted",
    notes: "written",
    watched: "all",
    agent: "listening",
  },
  {
    name: "agent-working",
    title: "The agent working",
    says: "You sent your notes and the agent took them. It stays at it: nothing more lands.",
    version: "noted",
    notes: "taken",
    watched: "all",
    agent: "working",
  },
  {
    name: "a-new-version-lands",
    title: "A new version lands",
    says: "You're on a moment of the old version, your notes with the agent. The next version lands five seconds after you arrive.",
    version: "noted",
    notes: "taken",
    watched: "all",
    agent: "listening",
    landsIn: 5,
    opens: "first moment",
  },
  {
    name: "no-agent-listening",
    title: "No agent listening",
    says: "You sent your notes, and no agent is listening for them.",
    version: "noted",
    notes: "sent",
    watched: "all",
    agent: "nobody",
  },
  {
    name: "answers-came-back",
    title: "Answers came back",
    says: "The latest version, with the agent's answers to your notes, nothing of it watched yet.",
    version: "latest",
    watched: "earlier",
    agent: "listening",
  },
  {
    name: "ready-for-done",
    title: "Ready for Done",
    says: "Everything in the latest version is watched. Press Done.",
    version: "latest",
    watched: "all",
    agent: "listening",
  },
  {
    name: "unseen-at-done",
    title: "Something unseen at Done",
    says: "Everything in the latest version is watched but its last moment. Press Done.",
    version: "latest",
    watched: "all but the last",
    agent: "listening",
  },
  {
    name: "all-caught-up",
    title: "All caught up",
    says: "You said Done on the latest version: nothing is waiting on you.",
    version: "latest",
    notes: "done",
    watched: "all",
    agent: "nobody",
  },
  {
    name: "nothing-here-yet",
    title: "Nothing here yet",
    says: "No change has come from any agent yet.",
    version: "latest",
    watched: "nothing",
    agent: "nobody",
    empty: true,
  },
  {
    name: "sending-fails",
    title: "Sending fails",
    says: "Your notes are written, and sending them fails: the change's folder can't be written to.",
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
    version: "latest",
    watched: "some",
    agent: "listening",
    moments: 15,
  },
];
