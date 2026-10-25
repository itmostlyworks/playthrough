// Which agent recorded a round, so each answer in a review that passes between agents shows whose it is.

import assert from "node:assert/strict";
import { test } from "node:test";
import { agent } from "../src/agent.ts";

test("an agent is known by what its shell says about it, whatever the round says", () => {
  assert.equal(agent(undefined, { CLAUDECODE: "1" }), "Claude Code");
  assert.equal(agent(undefined, { CODEX_THREAD_ID: "019a" }), "Codex");
  assert.equal(agent(undefined, { CURSOR_AGENT: "1" }), "Cursor");
  assert.equal(agent(undefined, { GEMINI_CLI: "1" }), "Gemini CLI");
  assert.equal(agent("Claude Code", { CODEX_SANDBOX: "seatbelt" }), "Codex");
});

test("any other agent goes by the name it wrote in the round, and is the agent until it does", () => {
  assert.equal(agent("Aider", {}), "Aider");
  assert.equal(agent(undefined, {}), "Agent");
});
