// Playthrough runs on Node 22.18 or later, which runs an app's setup and flows as the TypeScript they're written in. On an
// older Node, the command says so before anything else, rather than failing somewhere later in words that don't.
const [major, minor] = process.versions.node.split(".").map(Number);
if (major! < 22 || (major === 22 && minor! < 18)) {
  console.error(`Playthrough needs Node 22.18 or later, and this is Node ${process.versions.node}. Install Node 24, then run this again.`);
  process.exit(1);
}
