// On a phone, or any screen 820 wide or less, the page is laid out down the screen: the recording at the top as large as
// the width lets it be, its controls under it, and the foot under them; every flow at once is its list, then the frame,
// scrolled as one. The styles say the same with `phone:`.

export const onPhone = () => matchMedia("(max-width: 820px)").matches;
