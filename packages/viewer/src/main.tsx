// The viewer: what's waiting on you from every app on this machine at /, each moment at /moments/…, and the page before,
// a review at its own address.

import { createRoot } from "react-dom/client";
import { MomentsPage } from "./Moments.tsx";
import { ReviewPage } from "./Review.tsx";
import { Video, type Filmed } from "./Video.tsx";
import "./style.css";

// A review's address, and the scene you're in, so coming back to it, or reloading, finds you there. Filmed, a scene as a
// video.
const [id, scene] = location.pathname.slice(1).split("/").map(decodeURIComponent);
const filmed = new URLSearchParams(location.search).get("video");
createRoot(document.getElementById("root")!).render(!id || id === "moments" ? <MomentsPage /> : filmed ? <Video id={id} filmed={JSON.parse(filmed) as Filmed} /> : <ReviewPage id={id} scene={scene} />);
