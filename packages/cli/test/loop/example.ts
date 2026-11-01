// A copy of the example app, made a git repo of its own, with the commands run in it as an agent types them, and the
// flows an agent writes for it. Each story gets a copy of its own on a port of its own, so the stories run side by side.

import { execFileSync, spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Reading } from "@playthrough/page";
import { Reviews, type Comparison, type Flow, type Round } from "@playthrough/review";
import { folder } from "@playthrough/review/folder";

const core = fileURLToPath(new URL("../../../..", import.meta.url));
const playthrough = join(core, "packages/cli/src/playthrough.ts");

export type Example = Awaited<ReturnType<typeof example>>;

// On a port that isn't the example's own, which may be running.
export async function example(port: number) {
  const repo = await mkdtemp(join(tmpdir(), "playthrough-repo-"));
  await cp(join(core, "example/app"), join(repo, "app"), { recursive: true });
  await writeFile(join(repo, "serve.ts"), (await readFile(join(core, "example/serve.ts"), "utf8")).replaceAll("4400", String(port)));
  await symlink(join(core, "node_modules"), join(repo, "node_modules"));
  await writeFile(join(repo, ".gitignore"), "node_modules\n");
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "commit.gpgSign=false", ...args], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_NAME: "Ana", GIT_AUTHOR_EMAIL: "ana@example.com", GIT_COMMITTER_NAME: "Ana", GIT_COMMITTER_EMAIL: "ana@example.com" },
    }).trim();
  git("init", "--quiet", "--initial-branch=main");
  git("add", "--all");
  git("commit", "--quiet", "--message", "The example app");

  const review = (path = "") => join(repo, ".playthrough/overdue", path);
  const file = (n: number, name: string) => readFile(review(`rounds/${n}/files/${name}`));
  return {
    repo,
    git,
    app: { start: "node serve.ts", url: `http://localhost:${port}` },
    reviews: new Reviews(folder(join(repo, ".playthrough"))),
    flows: review("flows"),
    round: async (n: number): Promise<Round> => JSON.parse(await readFile(review(`rounds/${n}/round.json`), "utf8")),
    saveRound: (round: Round) => writeFile(review(`rounds/${round.number}/round.json`), JSON.stringify(round)),
    file,
    readings: async (n: number, flow: Flow): Promise<Reading[]> => JSON.parse((await file(n, `readings/${flow.recording}`)).toString()),
    compared: async (n: number, since: number): Promise<Comparison> => JSON.parse(await readFile(review(`rounds/${n}/since/${since}.json`), "utf8")),
    // Runs a command in the repo and gives back what it said. One that doesn't end by itself is stopped the moment it says
    // something, with a signal of its own, or by default.
    run: (args: string[], stopWhen?: { says: RegExp; signal?: NodeJS.Signals }): Promise<{ said: string; code: number | null }> =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [playthrough, ...args], { cwd: repo });
        let said = "";
        let stopped = false;
        const heard = (chunk: Buffer) => {
          said += chunk;
          if (stopWhen?.says.test(said) && !stopped) stopped = child.kill(stopWhen.signal);
        };
        child.stdout.on("data", heard);
        child.stderr.on("data", heard);
        // Once everything it started is done with what it says, the Playwright it ran among them.
        child.on("close", (code) => resolve({ said, code }));
      }),
    remove: () => rm(repo, { recursive: true }),
  };
}

const flow = (name: string, steps: string) => `import { test, expect } from "playthrough/test";

test(${JSON.stringify(name)}, async ({ page }) => {
${steps}
});
`;

// On Before, a click on what the app as it was doesn't have gives up after a second rather than ten: what's promised is
// where Before stops, not how long it waits there.
export const seeOverdue = flow(
  "See what's overdue",
  `  await test.step("Open the invoices", async () => {
    await page.goto("/");
  });
  await test.step("Show only the overdue ones", async () => {
    await page.getByRole("button", { name: "Overdue" }).click();
    await expect(page.getByRole("row")).toHaveCount(3);
  });`,
);
export const seePaid = flow(
  "See what's paid",
  `  await test.step("Open the invoices", async () => {
    await page.goto("/");
  });
  await test.step("Show only the paid ones", async () => {
    await page.getByRole("button", { name: "Paid" }).click();
  });`,
);
// The app as it is has no Export button: the agent adds it once Before is recorded.
export const exportThem = flow(
  "Export the overdue ones",
  `  await test.step("Open the invoices", async () => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  });
  await test.step("Export them", async () => {
    await page.getByRole("button", { name: "Overdue" }).click();
    await page.getByRole("button", { name: "Export" }).click({ timeout: 1000 });
  });`,
);
// Added later, after Before: the app as it was can take the first two steps of one, and none of the other.
export const exportPaid = flow(
  "Export the paid ones",
  `  await test.step("Open the invoices", async () => {
    await page.goto("/");
  });
  await test.step("Show only the paid ones", async () => {
    await page.getByRole("button", { name: "Paid" }).click();
  });
  await test.step("Export them", async () => {
    await page.getByRole("button", { name: "Export" }).click({ timeout: 1000 });
  });`,
);
export const openExport = flow(
  "Open the export",
  `  await test.step("Open the export", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "Export" }).click({ timeout: 1000 });
  });`,
);
// Written for the work, where the header's last button is Export: in the app as it was, it's another one.
export const exportFromHeader = flow(
  "Export from the header",
  `  await test.step("Open the invoices", async () => {
    await page.goto("/");
  });
  await test.step("Export them", async () => {
    await page.locator("header button").last().click();
  });`,
);
export const lookThrough = flow(
  "Look through the invoices",
  `  await test.step("Open the invoices", async () => {
    await page.goto("/");
  });`,
);

// The change the agent makes once Before is recorded: an Export button in the header.
export const addExport = async (example: Example) => {
  const page = join(example.repo, "app/index.html");
  await writeFile(page, (await readFile(page, "utf8")).replace("</header>", "  <button>Export</button>\n      </header>"));
};
