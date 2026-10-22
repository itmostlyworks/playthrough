// Serves the example app on http://localhost:4400, as vantage/app.json says.

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const app = join(import.meta.dirname, "app");
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

createServer(async (request, response) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  const file = normalize(join(app, path === "/" ? "index.html" : path));
  const bytes = file.startsWith(app + sep) ? await readFile(file).catch(() => undefined) : undefined;
  response.writeHead(bytes ? 200 : 404, { "content-type": `${types[extname(file)] ?? "text/plain"}; charset=utf-8` });
  response.end(bytes ?? "Not found");
}).listen(4400, "127.0.0.1", () => console.log("The example app is on http://localhost:4400"));
