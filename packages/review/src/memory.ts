// Reviews kept in memory: for tests, and the plainest statement of what a storage has to do.

import type { Storage } from "./store.ts";

export function memory(): Storage {
  const files = new Map<string, Uint8Array>();
  const watchers = new Set<{ folder: string; changed: () => void }>();

  return {
    async read(path) {
      const bytes = files.get(path);
      return bytes && bytes.slice();
    },
    async write(path, bytes) {
      files.set(path, bytes.slice());
      for (const watcher of watchers) if (path.startsWith(`${watcher.folder}/`)) queueMicrotask(watcher.changed);
    },
    async list(folder) {
      const prefix = folder ? `${folder}/` : "";
      const names = [...files.keys()].filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length).split("/")[0] ?? "");
      return [...new Set(names)];
    },
    watch(folder, changed) {
      const watcher = { folder, changed };
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
  };
}
