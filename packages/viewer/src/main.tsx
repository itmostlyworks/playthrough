// The viewer: the reviews on this machine at /, and each review at its own address.

import { createRoot } from "react-dom/client";
import { MomentsPage } from "./Moments.tsx";
import { ReviewPage } from "./Review.tsx";
import { Reviews } from "./Reviews.tsx";
import { Video, type Filmed } from "./Video.tsx";
import "./style.css";

// A review's address, and the scene you're in, so coming back to it, or reloading, finds you there. Filmed, a scene as a
// video.
const [id, scene] = location.pathname.slice(1).split("/").map(decodeURIComponent);
const filmed = new URLSearchParams(location.search).get("video");
// A rough try, beside the page: the moments waiting on you, at /moments.
createRoot(document.getElementById("root")!).render(id === "moments" ? <MomentsPage /> : id && filmed ? <Video id={id} filmed={JSON.parse(filmed) as Filmed} /> : id ? <ReviewPage id={id} scene={scene} /> : <Reviews />);
