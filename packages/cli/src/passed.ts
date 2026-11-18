// An address the browser only passed through on its way to another, before anything was done there (a sign-in's
// redirect, an OAuth callback with its state, nonce or code), is kept without its query and hash, on any origin: what's
// kept can be committed and shown to others, and nothing goes back there. Where something was done, or where a moment
// rests, it's kept whole, as that's how it's gone back to. A real run on 0.7.1 kept an OAuth redirect's state and nonce.

export const passedThrough = (address: string) => address.replace(/[?#][^]*$/, "");

// In a recording, each page loaded is rrweb's meta event, with its whole address: one is passed through where the next
// page loads before anything is clicked or typed there.
type Event = { type?: number; data?: { href?: string; source?: number } };
const loaded = (event: Event) => event.type === 4 && !!event.data?.href;
// rrweb's incremental snapshots of a click (2) or of words in a field (5).
const done = (event: Event) => event.type === 3 && (event.data?.source === 2 || event.data?.source === 5);
export function passedThroughIn<T extends object>(events: T[]): T[] {
  // Read from the end: whether, after the page met next, another loaded with nothing done between.
  let leftAtOnce = false;
  return events
    .toReversed()
    .map((one) => {
      const event = one as Event;
      if (done(event)) leftAtOnce = false;
      if (!loaded(event)) return one;
      const passed = leftAtOnce;
      leftAtOnce = true;
      return passed ? ({ ...event, data: { ...event.data, href: passedThrough(event.data!.href!) } } as T) : one;
    })
    .toReversed();
}
