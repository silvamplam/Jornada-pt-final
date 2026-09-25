// Use the installed Next implementation, not a mock of unstable_cache.
import "next/dist/server/node-environment";
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { createHash } from "node:crypto";

export function nextDataCacheFixture() {
  let now = 0;
  type Value = { kind: string; data: { body: string }; revalidate: number };
  const entries = new Map<string, { value: Value; written: number }>();
  const incrementalCache = {
    isOnDemandRevalidate: false,
    async generateSimpleCacheKey(key: string) { return createHash("sha256").update(key).digest("hex"); },
    async get(key: string, { revalidate }: { revalidate: number }) {
      const entry = entries.get(key);
      return entry ? { value: structuredClone(entry.value), isStale: now - entry.written > revalidate * 1000 } : null;
    },
    async set(key: string, value: Value) { entries.set(key, { value: structuredClone(value), written: now }); },
  };
  return {
    entries,
    advance(seconds: number) { now += seconds * 1000; },
    async request<T>(read: () => Promise<T>): Promise<T> {
      // A different request store each time, with the same server Data Cache.
      const store = { forceDynamic: true, isStaticGeneration: false, isDraftMode: false,
        route: "/competicoes/fixture/2026-27/jornadas/4", incrementalCache } as unknown as WorkStore;
      return workAsyncStorage.run(store, async () => {
        try { return await read(); }
        finally { await Promise.all(Object.values(store.pendingRevalidates ?? {})); }
      });
    },
  };
}
