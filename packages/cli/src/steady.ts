// What makes a page read the same each time it's run: the day the change started, and random numbers from one seed. Put
// in every page, as it loads, by the moments run (test.ts) and by the agent's browser (as.ts), so both are on one day.

const DAY = 24 * 60 * 60 * 1000;

// Every hand-back runs on the day the change started, at the time of day it's recorded, so what the page works out from the
// day reads the same each time. The app's server keeps the real time, which nothing here sets, and on the real time of day
// what it stamps reads as it would: a card the setup made was made “less than a minute ago”, in every hand-back that day.
// On a later day, the server's times are that many days ahead. The clock runs on from there, as a person's does.
export const onTheDayItStarted = (started: string, now = Date.now()) => new Date(now - (Math.floor(now / DAY) - Math.floor(Date.parse(started) / DAY)) * DAY);

// Only the date is moved, whole days back. The page's own clock for what moves, performance.now and each animation frame's
// time, is left as the browser keeps it: Playwright's clock moved that too, counted from when it was set, not from when the
// page loaded, so in a browser open a while an animation the app starts on arriving was timed for minutes ahead, and what
// fades in stayed unseen (Kan's boards, reloaded ten minutes in).
export function steadied(started: string): string {
  const now = Date.now();
  const back = now - onTheDayItStarted(started, now).getTime();
  return `(() => {
  const Real = Date;
  const back = ${back};
  function Dated(...given) {
    if (!new.target) return new Real(Real.now() - back).toString();
    return given.length ? new Real(...given) : new Real(Real.now() - back);
  }
  Object.setPrototypeOf(Dated, Real);
  Dated.prototype = Real.prototype;
  Dated.now = () => Real.now() - back;
  if (back) window.Date = Dated;
  let seed = 20251026;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;
}
