// Inside another page's frame, as on a site that shows it, the viewer keeps to its own: the wheel, a drag and a swipe
// over the picture are that page's, as is a scroll that has run out, and nothing here takes the keys from it until the
// person has pressed in here. On its own, nothing of this applies.

export const insideAnotherPage = () => window.self !== window.top;

// Whether the viewer may move the keys into a field of its own: inside another page, only once they're already here.
export const mayTakeKeys = () => !insideAnotherPage() || document.hasFocus();
