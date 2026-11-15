// How Playthrough says things, the same way in the command line and the viewer.

export const list = (things: string[]) => (things.length > 1 ? `${things.slice(0, -1).join(", ")} and ${things.at(-1)}` : (things[0] ?? ""));

export const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export const quote = (name: string) => `“${name}”`;

// An address with what setup made for one run written as setup's, so it's the same place in any run: the board made
// for the person's step in is the board made for the agent's.
export function madeBySetup(address: string, setup: Record<string, unknown>) {
  let out = address;
  for (const [key, value] of Object.entries(setup)) if (typeof value === "string" && value.length > 6) out = out.split(value).join(`\${setup.${key}}`);
  return out;
}
