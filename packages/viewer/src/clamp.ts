// A number kept between two others, from nothing to whole unless said.
export const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
