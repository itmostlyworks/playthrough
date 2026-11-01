// Makes the package npm publishes, in release/. Node runs Playthrough's TypeScript from a checkout but not from inside an
// installed package, so the command is made JavaScript there, with the review and the page inside it, and beside it go
// the viewer it serves, the types a flow is written against and what it prints. Run after the viewer is built, by
// `npm run build` from core. What the package needs from npm is what its parts need, less each other.

import { execFileSync } from "node:child_process";
import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative } from "node:path";
import { build } from "rolldown";

const cli = import.meta.dirname;
const packages = dirname(cli);
const release = join(cli, "release");
const manifest = (part: string) => JSON.parse(readFileSync(join(packages, part, "package.json"), "utf8"));
const own = manifest("cli");
const needs: Record<string, string> = Object.fromEntries(
  ["cli", "page", "review"].flatMap((part) => Object.entries<string>(manifest(part).dependencies ?? {})).filter(([name]) => !name.startsWith("@playthrough/")),
);
const fromNpm = (id: string) => builtinModules.includes(id) || id.startsWith("node:") || Object.keys(needs).some((name) => id === name || id.startsWith(`${name}/`));
const js = (path: string) => path.replace(/\.ts$/, ".js");

rmSync(release, { recursive: true, force: true });

// What Playwright and the command load by their paths: the command, what flows import, and the config and reporter a
// recording runs with. Each is found beside the file that names it, as in the checkout.
await build({
  input: { playthrough: "src/playthrough.ts", test: "src/test.ts", "playwright.config": "src/playwright.config.ts", reporter: "src/reporter.ts" },
  cwd: cli,
  platform: "node",
  external: fromNpm,
  plugins: [{ name: "beside", transform: (code) => code.replace(/(new URL\("\.\/[\w.]+)\.ts(", import\.meta\.url\))/g, "$1.js$2") }],
  output: { dir: join(release, "src"), format: "esm", entryFileNames: "[name].js", chunkFileNames: "[name]-[hash].js" },
});

// The types, laid out as the parts are, each part's name made the path to it.
const types = join(release, "types");
const roots = ["cli/src/test.ts", "review/src/index.ts", "review/src/folder.ts", "page/src/index.ts"].map((root) => join(packages, root));
const tsc = join(packages, "../node_modules/.bin/tsc");
execFileSync(tsc, ["--ignoreConfig", ...roots, "--declaration", "--emitDeclarationOnly", "--allowImportingTsExtensions", "--rootDir", packages, "--outDir", types, "--module", "nodenext", "--target", "es2024", "--strict", "--skipLibCheck", "--types", "node", "--verbatimModuleSyntax"], { stdio: "inherit" });
for (const file of readdirSync(types, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".d.ts")).map((name) => join(types, name))) {
  const part = (name: string, path = "index") => {
    const to = relative(dirname(file), join(types, name, "src", `${path}.js`));
    return to.startsWith(".") ? to : `./${to}`;
  };
  const text = readFileSync(file, "utf8")
    .replace(/(["'])(\.\.?\/[^"']+)\.ts\1/g, "$1$2.js$1")
    .replace(/(["'])@playthrough\/(\w+)(?:\/(\w+))?\1/g, (_, quote, name, path) => `${quote}${part(name, path)}${quote}`);
  writeFileSync(file, text);
}

cpSync(join(cli, "viewer"), join(release, "viewer"), { recursive: true });
cpSync(join(cli, "INSTRUCTIONS.md"), join(release, "INSTRUCTIONS.md"));
cpSync(join(packages, "../LICENSE"), join(release, "LICENSE"));
// On npm, the README's links lead to the repo.
const repository = own.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
const readme = readFileSync(join(packages, "../README.md"), "utf8").replace(/\]\((?!https?:|#)([^)]+)\)/g, `](${repository}/blob/main/$1)`);
writeFileSync(join(release, "README.md"), readme);

const { private: _, devDependencies: __, scripts: ___, ...published } = own;
// A command's file as npm wants it named, from the package's folder without “./”: with it, npm takes the command out.
const bin = Object.fromEntries(Object.entries<string>(own.bin).map(([name, path]) => [name, js(path).replace(/^\.\//, "")]));
const exports = Object.fromEntries(
  Object.entries<string>(own.exports).map(([name, path]) => [name, { types: `./types/cli/${js(path).replace(/^\.\//, "").replace(/\.js$/, ".d.ts")}`, default: js(path) }]),
);
writeFileSync(join(release, "package.json"), `${JSON.stringify({ ...published, bin, exports, dependencies: needs }, null, 2)}\n`);
console.log(`Playthrough ${own.version} is ready to publish in ${relative(process.cwd(), release) || "."}.`);
