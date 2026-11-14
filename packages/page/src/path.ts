// The path back to an element, by its tag and its place among those beside it, up to the nearest id the app chose: the
// same element in a page drawn again from its recording and in the app itself, so what's done in one, or where it's
// scrolled, is found in the other. Written for the page it runs in, as stepping in puts it in the app's (step-in.ts).
export function pathTo(element: Element): string {
  const parts: string[] = [];
  for (let at: Element | null = element; at && at !== at.ownerDocument.documentElement; at = at.parentElement) {
    // Not the ids an app makes up as it draws, or numbers, which differ next time.
    if (at.id && !/[:«»\d]/.test(at.id)) {
      parts.unshift(`#${CSS.escape(at.id)}`);
      break;
    }
    let nth = 1;
    for (let sibling = at.previousElementSibling; sibling; sibling = sibling.previousElementSibling) if (sibling.tagName === at.tagName) nth++;
    parts.unshift(`${at.tagName.toLowerCase()}:nth-of-type(${nth})`);
  }
  return parts.join(" > ");
}
