// How Vantage says things, the same way in the command line and the viewer.

export const list = (things: string[]) => (things.length > 1 ? `${things.slice(0, -1).join(", ")} and ${things.at(-1)}` : (things[0] ?? ""));

export const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export const quote = (name: string) => `“${name}”`;
