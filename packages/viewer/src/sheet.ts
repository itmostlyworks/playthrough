// How the last stop lays out your notes across its sheet, from the room the frame gives it alone, never from how many
// notes there are, so a note kept or a box opened takes the next place and nothing else moves. A note's card is wide and
// flat, its picture beside its words: two across where the frame holds two at least this wide, each at most this wide;
// else one, a little wider, or as wide as there is.

const [NARROWEST, WIDEST, ALONE] = [420, 480, 560];
export const APART = 16;

export function notesAcross(room: number): { across: 1 | 2; card: number; measure: number } {
  if (room >= 2 * NARROWEST + APART) {
    const card = Math.min(WIDEST, (room - APART) / 2);
    return { across: 2, card, measure: 2 * card + APART };
  }
  const card = Math.max(0, Math.min(ALONE, room));
  return { across: 1, card, measure: card };
}
