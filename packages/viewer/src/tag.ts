// Whose hands the pointer is, said on the pointer and nowhere else: a small tag just below and right of its tip, as a
// name on someone else's pointer. The recording's says "Your agent" ("The agent" to a guest, whose agent it isn't);
// taking over, it rolls to "You" as the pointer becomes yours.

// The agent's words on it, to whoever is watching.
export const agentTo = (guest: boolean) => (guest ? "The agent" : "Your agent");

// Whether the recording's pointer wears it: only as a moment starts playing, a beat under two seconds, when the hands are
// seen at work; at rest the pointer is simply where it stopped. Never on a still, where nobody acts, nor in Compare or while
// noting, where what it's on isn't the moment's pointer.
export function tagged(moment: { still: boolean; playing: boolean; playedAWhile: boolean; comparing: boolean; noting: boolean }) {
  const { still, playing, playedAWhile, comparing, noting } = moment;
  return playing && !playedAWhile && !still && !comparing && !noting;
}

// How long it stays once a moment starts playing, in milliseconds: long enough to read, then out of the way.
export const TAGGED_WHILE_PLAYING = 1800;

// Where it stands from the tip, in a pointer drawn `grown` times its own size: below and right of it, clear of the
// arrow, as the note's name on your pointer stands; left of the tip where the picture's right edge would cut it off,
// and above it where the bottom would. Measured from the tip, in the picture's pixels.
export function besideTip(tip: { x: number; y: number }, tag: { width: number; height: number }, room: { width: number; height: number }, grown: number) {
  const left = tip.x + RIGHT * grown + tag.width > room.width;
  const above = tip.y + BELOW * grown + tag.height > room.height;
  return { left, above };
}
// Below and right of the tip; or, turned, just clear of it on that side.
export const RIGHT = 13;
export const BELOW = 17;
export const CLEAR = 4;
