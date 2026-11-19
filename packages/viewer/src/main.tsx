// The viewer: what's next for you from every app on this machine at /, and each moment at /moments/…; any other
// address is what's next.

import { createRoot } from "react-dom/client";
import { from } from "./api.ts";
import { FramePage, type Framed } from "./Frame.tsx";
import { MomentsPage } from "./Moments.tsx";
import { guest } from "./server.ts";
import "./style.css";

// At a shared change's link, a guest's: the change on its own, as another page shows it, asked for at the link.
const shared = location.pathname.match(/^\/\.playthrough\/shared\/[\w-]+\//)?.[0];
if (shared) from(guest(shared));

// Drawn into a picture, a note's frame alone.
const framed = new URLSearchParams(location.search).get("frame");
createRoot(document.getElementById("root")!).render(framed ? <FramePage framed={JSON.parse(framed) as Framed} /> : <MomentsPage />);
