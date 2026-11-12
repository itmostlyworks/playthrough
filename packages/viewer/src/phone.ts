import { useEffect, useState } from "react";

// On a phone, or any screen 820 wide or less, the page is laid out down the screen: the recording at the top as large as
// the width lets it be, and its controls under it; every scene at once is its list, then the frame,
// scrolled as one. The styles say the same with `phone:`.

export const onPhone = () => matchMedia("(max-width: 820px)").matches;

// The same, followed as the window is resized.
export function usePhone(): boolean {
  const [phone, setPhone] = useState(onPhone);
  useEffect(() => {
    const query = matchMedia("(max-width: 820px)");
    const change = () => setPhone(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return phone;
}
