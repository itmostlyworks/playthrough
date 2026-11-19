// What's serving on this machine, as you: each port something listens on, the folder it runs from and the command it
// runs. The folder is what tells one copy of an app from another, wherever it answers. macOS says it through lsof and ps,
// Linux through /proc; Windows says which process listens where, but not the folder it runs from, so there it's
// nothing known.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, readlinkSync } from "node:fs";

export type Serving = { pid: number; port: number; folder: string; command: string };

export function serving(): Serving[] | undefined {
  if (process.platform === "linux") return fromProc();
  if (process.platform === "darwin") return fromLsof();
  return undefined;
}

function fromLsof(): Serving[] | undefined {
  const run = (command: string, ...args: string[]) => {
    const ran = spawnSync(command, args, { encoding: "utf8" });
    return ran.error ? undefined : ran.stdout;
  };
  // Each process as lsof's fields give it: a line starting p for the process, then n for each name it has open.
  const fields = (text: string) => {
    const named = new Map<number, string[]>();
    let pid = 0;
    for (const line of text.split("\n")) {
      if (line.startsWith("p")) named.set((pid = Number(line.slice(1))), []);
      else if (line.startsWith("n")) named.get(pid)?.push(line.slice(1));
    }
    return named;
  };
  const listening = run("lsof", "-nP", "-a", "-iTCP", "-sTCP:LISTEN", "-u", String(process.getuid!()), "-Fpn");
  if (listening === undefined) return undefined;
  const ports = fields(listening);
  if (!ports.size) return [];
  const pids = [...ports.keys()].join(",");
  const folders = fields(run("lsof", "-a", "-d", "cwd", "-p", pids, "-Fpn") ?? "");
  const commands = new Map(
    (run("ps", "-o", "pid=,command=", "-p", pids) ?? "").split("\n").flatMap((line) => {
      const [, pid, command] = line.match(/^\s*(\d+)\s+(.*)$/) ?? [];
      return pid ? [[Number(pid), command!] as const] : [];
    }),
  );
  return [...ports].flatMap(([pid, names]) => {
    const folder = folders.get(pid)?.[0];
    if (!folder) return [];
    const each = new Set(names.map((name) => Number(name.split(":").at(-1))));
    return [...each].map((port) => ({ pid, port, folder, command: commands.get(pid) ?? "" }));
  });
}

function fromProc(): Serving[] {
  // Listening sockets by their inode, from the kernel's tables: the local address's port in hex, state 0A.
  const ports = new Map<string, number>();
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    const lines = (() => {
      try {
        return readFileSync(table, "utf8").split("\n").slice(1);
      } catch {
        return [];
      }
    })();
    for (const line of lines) {
      const [, local, , state, , , , , , inode] = line.trim().split(/\s+/);
      if (state === "0A" && local && inode) ports.set(inode, parseInt(local.split(":").at(-1)!, 16));
    }
  }
  // Each of your processes holding one of them; another's can't be read, and is passed by.
  return readdirSync("/proc").flatMap((pid) => {
    if (!/^\d+$/.test(pid)) return [];
    try {
      const held = new Set(
        readdirSync(`/proc/${pid}/fd`).flatMap((fd) => {
          const port = ports.get(readlinkSync(`/proc/${pid}/fd/${fd}`).match(/^socket:\[(\d+)\]$/)?.[1] ?? "");
          return port === undefined ? [] : [port];
        }),
      );
      if (!held.size) return [];
      const folder = readlinkSync(`/proc/${pid}/cwd`);
      const command = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean).join(" ");
      return [...held].map((port) => ({ pid: Number(pid), port, folder, command }));
    } catch {
      return [];
    }
  });
}

// Whether something serves there: it answers, or it took the request and is still at it after two seconds, as a dev
// server building a page for the first time is. Taken for nothing there, it was started again beside itself.
export const answers = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(2000) }).then(
    (response) => (response.body?.cancel(), true),
    (error) => (error as Error)?.name === "TimeoutError",
  );

// Whether what answers there serves pages, as a web app does at its start: a page, or a way to one. Still at it after two
// seconds, as a dev server building a page for the first time is, it's taken to be.
export const servesPages = (url: string) =>
  fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2000) }).then(
    (response) => (response.body?.cancel(), response.status < 400 && (response.status >= 300 || /html/.test(response.headers.get("content-type") ?? ""))),
    (error) => (error as Error)?.name === "TimeoutError",
  );
