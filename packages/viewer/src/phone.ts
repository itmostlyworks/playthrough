// On a phone, or any screen 820 wide or less, the page is laid out down the screen: the recording at the top as large as
// the width lets it be, its controls under it, and the column a drawer from the bottom; every flow at once is two to a
// row. The styles say the same with `phone:`.

export const onPhone = () => matchMedia("(max-width: 820px)").matches;
