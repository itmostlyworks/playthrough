// A note's frame alone, as `playthrough open` draws it into a picture (frames.ts): the recording at the moment the note
// was made, as large as the screen it was recorded on, with no pointer; and once it's drawn, where the note's thing is
// on it, as shares of the screen, for the page to close in on.

import { useRef } from "react";
import { Player } from "./Player.tsx";

export type Framed = { review: string; round: number; recording: string; at: number; node?: number; point?: { x: number; y: number } };

export function FramePage({ framed }: { framed: Framed }) {
  const room = useRef<HTMLDivElement>(null);
  const { review, round, recording, at, node, point } = framed;
  return (
    <div ref={room} className="fixed inset-0 bg-paper">
      <Player
        review={review}
        round={round}
        recording={recording}
        at={at}
        hand={false}
        marks={[{ id: "note", ...(node !== undefined ? { node } : point && { point }) }]}
        onMarks={(placed) => {
          // Told once the page has come to rest, with the note's thing there or not; nothing before.
          if (!placed) return;
          const { note } = placed;
          const { clientWidth: wide, clientHeight: high } = room.current!;
          Object.assign(window, { framed: note && { x: note.left / wide, y: note.top / high, width: note.width / wide, height: note.height / high } });
        }}
      />
    </div>
  );
}
