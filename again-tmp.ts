import { cpSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compareWithEarlier } from "./packages/cli/src/compare.ts";
import { repo } from "./packages/cli/src/repo.ts";
const room = mkdtempSync(join(tmpdir(), "again-"));
cpSync(process.env.HOME + "/projects/spliit/.vantage/group-totals", join(room, ".vantage/group-totals"), { recursive: true });
const r = repo(room);
const one = (await r.reviews.get("group-totals")).rounds.find((round) => round.number === 1)!;
for (const c of await compareWithEarlier(r.reviews, "group-totals", 1, one.flows))
  for (const change of c.changes) console.log(change.words, "|", change.seen.length, "flows");
