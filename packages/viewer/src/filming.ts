// How long each part of a video takes, in its own seconds (Video.tsx): each moment comes in over the one before and its
// name stands at its bottom left for its first second; its end holds a beat before the next; and the last holds on its
// end while Playthrough's mark comes in at its bottom right.

// A moment coming in, before it plays; its name standing, from then; a still, which has nothing to play; a moment's end,
// before the next comes in; and the last's, with the mark.
export const ARRIVE = 0.24;
export const NAME = 1;
export const STILL = 1;
export const LAST = 0.8;
export const END = 1.6;

// A video of moments playing for these many seconds each.
export const videoLength = (playing: number[]) => playing.reduce((sum, seconds) => sum + ARRIVE + seconds, 0) + LAST * Math.max(0, playing.length - 1) + END;
