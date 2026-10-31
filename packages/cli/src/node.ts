// Playthrough runs on Node 24 or later, which runs its TypeScript and an app's setup as they are. On an older Node, the
// command says so before anything else, rather than failing somewhere later in words that don't.
const [major] = process.versions.node.split(".").map(Number);
if (major! < 24) {
  console.error(`Playthrough needs Node 24 or later, and this is Node ${process.versions.node}. Install Node 24, then run this again.`);
  process.exit(1);
}
