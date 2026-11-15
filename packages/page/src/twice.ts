// Escape, while the app is yours: a single press is the app's, whatever it does with it, and two, the second right after
// the first, are Back. The same rule wherever the keyboard is, in the app or on Playthrough's page around it.
//
// It uses nothing from outside it: it's put into the app's pages as it's written here.
export function escapedTwice(): (at: number) => boolean {
  // How soon the second must come, in milliseconds: soon enough for a deliberate double press, and later than two
  // unhurried presses that close two things in the app, a menu and then the card it was on.
  const RIGHT_AFTER = 500;
  let first = -Infinity;
  return (at) => {
    const twice = at - first < RIGHT_AFTER;
    first = twice ? -Infinity : at;
    return twice;
  };
}
