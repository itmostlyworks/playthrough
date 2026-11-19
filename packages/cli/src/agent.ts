// Which agent is running the commands, by the name it goes by, so each answer shows whose it is when a change passes
// between agents. The best-known ones say so in their shell; any other writes its name in the hand-back, as `by`.

import { knownAgents, unnamedAgent } from "@playthrough/change";

// What each agent Playthrough knows by name (`knownAgents`) sets in its shell: one for every name, and only those.
const says: Record<(typeof knownAgents)[number], string[]> = {
  "Claude Code": ["CLAUDECODE"],
  Codex: ["CODEX_THREAD_ID", "CODEX_SANDBOX"],
  Cursor: ["CURSOR_AGENT"],
  "Gemini CLI": ["GEMINI_CLI"],
};

export function agent(written?: string, shell: NodeJS.ProcessEnv = process.env): string {
  return knownAgents.find((name) => says[name].some((variable) => shell[variable])) ?? written ?? unnamedAgent;
}
