// The parts of a page around an element that scroll by themselves, as a panel, a long list or a dialog's body does, the
// innermost first: each one a person can scroll, or one scrolled from its start; and whether any of the element is still
// in sight there, through it and every part inside it. The page's own scroll is the page's, not a part's. Written for
// the page it runs in, as the agent's browser (as.ts) and the way tried from a fresh start (way.ts) put it in the app's.
export function partsAround(element: Element): { part: Element; shows: boolean }[] {
  const around: { part: Element; shows: boolean }[] = [];
  const box = element.getBoundingClientRect();
  // Nothing of it drawn, it's nowhere to be out of sight.
  if (!box.width && !box.height) return around;
  let [left, top, right, bottom] = [box.left, box.top, box.right, box.bottom];
  const page = element.ownerDocument;
  for (let part = element.parentElement; part && part !== page.body && part !== page.documentElement; part = part.parentElement) {
    const look = getComputedStyle(part);
    const scrolls = (overflow: string, more: boolean) => /auto|scroll|overlay/.test(overflow) && more;
    if (!part.scrollTop && !part.scrollLeft && !scrolls(look.overflowY, part.scrollHeight > part.clientHeight) && !scrolls(look.overflowX, part.scrollWidth > part.clientWidth)) continue;
    // What it shows is inside its borders and scrollbars.
    const edges = part.getBoundingClientRect();
    const [inLeft, inTop] = [edges.left + part.clientLeft, edges.top + part.clientTop];
    [left, top, right, bottom] = [Math.max(left, inLeft), Math.max(top, inTop), Math.min(right, inLeft + part.clientWidth), Math.min(bottom, inTop + part.clientHeight)];
    around.push({ part, shows: right > left && bottom > top });
  }
  return around;
}
