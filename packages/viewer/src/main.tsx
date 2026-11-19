// The viewer: what's next for you from every app on this machine at /, and each moment at /moments/…; any other
// address is what's next.

import { createRoot } from "react-dom/client";
import { from } from "./api.ts";
import { FramePage, type Framed } from "./Frame.tsx";
import { MomentsPage } from "./Moments.tsx";
import { guest } from "./server.ts";
import { VideoPage, type Filmed } from "./Video.tsx";
import "./style.css";

// At a shared change's link, a guest's: the change on its own, as another page shows it, asked for at the link.
const shared = location.pathname.match(/^\/\.playthrough\/shared\/[\w-]+\//)?.[0];
if (shared) from(guest(shared));

// Drawn into a picture, a note's frame alone; filmed, what you were watching.
const [framed, filmed] = ["frame", "video"].map((asked) => new URLSearchParams(location.search).get(asked));
createRoot(document.getElementById("root")!).render(
  framed ? <FramePage framed={JSON.parse(framed) as Framed} /> : filmed ? <VideoPage filmed={JSON.parse(filmed) as Filmed} /> : <MomentsPage />,
);
