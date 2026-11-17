// Shown by another page inside its frame, as on a site that shows it, the viewer keeps to its own: the wheel, a drag and
// a swipe over the picture are that page's, as is a scroll that has run out, and its Back; nothing here takes the keys
// from it until the person has pressed in here. On its own, or at `playthrough open`'s in any frame (as an editor's
// browser), nothing of this applies.

import { shownByAnotherPage } from "./api.ts";

export const insideAnotherPage = () => shownByAnotherPage() && window.self !== window.top;

// Whether the viewer may move the keys into a field of its own: inside another page, only once they're already here.
export const mayTakeKeys = () => !insideAnotherPage() || document.hasFocus();
