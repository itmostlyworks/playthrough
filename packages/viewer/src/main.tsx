// The viewer: what's waiting on you from every app on this machine at /, and each moment at /moments/…; any other
// address is the list.

import { createRoot } from "react-dom/client";
import { FramePage, type Framed } from "./Frame.tsx";
import { MomentsPage } from "./Moments.tsx";
import "./style.css";

// Drawn into a picture, a note's frame alone.
const framed = new URLSearchParams(location.search).get("frame");
createRoot(document.getElementById("root")!).render(framed ? <FramePage framed={JSON.parse(framed) as Framed} /> : <MomentsPage />);
