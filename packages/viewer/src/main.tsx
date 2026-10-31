// The viewer: the reviews on this machine at /, and each review at its own address.

import { createRoot } from "react-dom/client";
import { useReviews } from "./api.ts";
import { Page, ReviewPage } from "./Review.tsx";
import "./style.css";

function Reviews() {
  const reviews = useReviews();
  if (!reviews) return <Page />;
  return (
    <Page>
      <ul className="mx-auto w-full max-w-xl self-start pt-10">
        {reviews.length === 0 && <li className="text-soft">There are no reviews here yet. An agent starts one with playthrough start.</li>}
        {reviews.map((review) => (
          <li key={review.id}>
            <a href={`/${review.id}`} className="flex items-baseline gap-4 rounded-lg px-3 py-2.5 transition-colors duration-150 ease-calm hover:bg-hover">
              <span className="min-w-0 flex-1 truncate font-medium">{review.title}</span>
              <span className="text-xs text-faint">{review.accepted ? "Accepted" : review.rounds === 0 ? "No rounds yet" : review.rounds === 1 ? "1 round" : `${review.rounds} rounds`}</span>
            </a>
          </li>
        ))}
      </ul>
    </Page>
  );
}

// A review's address, and the flow you're in, so coming back to it, or reloading, finds you there.
const [id, flow] = location.pathname.slice(1).split("/").map(decodeURIComponent);
createRoot(document.getElementById("root")!).render(id ? <ReviewPage id={id} flow={flow} /> : <Reviews />);
