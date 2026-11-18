// playthrough/test, as a moment's file or playthrough/setup.ts imports it, is always this Playthrough's, the one running
// it, wherever it's loaded (Playwright's runner, or Playthrough itself, stepping in or setting up): so nothing has to be
// added to the app to try Playthrough, and an app with one of its own never loads a second beside it, which Playwright,
// loaded twice, refuses.

import * as modules from "node:module";

const OWN = new URL("./test.ts", import.meta.url).href;
let finding = false;
export function findsThisPlaythrough() {
  if (finding) return;
  finding = true;
  modules.registerHooks({ resolve: (specifier, context, next) => (specifier === "playthrough/test" ? { url: OWN, shortCircuit: true } : next(specifier, context)) });
}
