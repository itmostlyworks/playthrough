// Which agent is running the commands, by the name it goes by, so each answer shows whose it is when a review passes
// between agents. The best-known ones say so in their shell; any other writes its name in the round, as `by`.

const known: { name: string; says: string[] }[] = [
  { name: "Claude Code", says: ["CLAUDECODE"] },
  { name: "Codex", says: ["CODEX_THREAD_ID", "CODEX_SANDBOX"] },
  { name: "Cursor", says: ["CURSOR_AGENT"] },
  { name: "Gemini CLI", says: ["GEMINI_CLI"] },
];

// An agent nobody can name, until it writes its name.
export const unnamed = "Agent";

export function agent(written?: string, shell: NodeJS.ProcessEnv = process.env): string {
  return known.find((agent) => agent.says.some((name) => shell[name]))?.name ?? written ?? unnamed;
}
