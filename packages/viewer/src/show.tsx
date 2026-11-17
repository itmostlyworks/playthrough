// The viewer for another page to show, on an element of its own, from a source of that page's own in place of
// `playthrough open`: built beside the viewer into the command's show/, as viewer.js and viewer.css. The element is the
// page's: the viewer takes the whole of it, its keys and its address, as it does at `playthrough open`'s.

import { createRoot } from "react-dom/client";
import { from, type Source } from "./api.ts";
import { MomentsPage } from "./Moments.tsx";
import "./style.css";

export type { Listed, Source } from "./api.ts";

export function show(element: Element, source: Source) {
  from(source);
  createRoot(element).render(<MomentsPage afterHash />);
}
