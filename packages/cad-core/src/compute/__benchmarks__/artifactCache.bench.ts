/**
 * ArtifactCache L1 — Performance Benchmarks
 *
 * Threshold (from TESTING_PROGRESS.md Phase 4 spec):
 *   L1 cache get/set ×10 000 < 100 ms total
 *
 * ArtifactCache degrades gracefully when IndexedDB is unavailable (Node).
 * BUT: l2Available starts as `true` and is only flipped to `false` when the
 * openDB() rejection's .catch() handler fires — which requires a microtask
 * flush.  Without that flush, set() enters the L2 path and l2Set() rejects
 * ("DB not open"), killing the bench.
 *
 * Fix: call `await cache.get('__warmup__')` once before measuring. get()
 * resolves null safely even when db is null, and the await gives the event
 * loop a chance to run the catch handler → l2Available becomes false →
 * subsequent set() calls skip L2 entirely.
 */

import { bench, describe } from 'vitest';
import { ArtifactCache } from '../artifactCache';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBuffer(bytes: number): ArrayBuffer {
  const buf = new ArrayBuffer(bytes);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bytes; i++) view[i] = i & 0xff;
  return buf;
}

/** Create a new ArtifactCache with L2 already disabled (l2Available=false). */
async function makeL1Cache(): Promise<ArtifactCache> {
  const cache = new ArtifactCache();
  // One get() flushes the dbReady microtask → sets l2Available=false safely.
  await cache.get('__warmup__');
  return cache;
}

const SMALL_BUF  = makeBuffer(1_024);        // 1 KB
const MEDIUM_BUF = makeBuffer(256 * 1_024);  // 256 KB

// Pre-generate key arrays so string creation is not timed
const SET_KEYS  = Array.from({ length: 10_000 }, (_, i) => `set-${i.toString(16).padStart(8, '0')}`);
const GET_KEYS  = Array.from({ length: 1_000  }, (_, i) => `get-${i.toString(16).padStart(8, '0')}`);
const MISS_KEYS = Array.from({ length: 1_000  }, (_, i) => `miss-${i.toString(16).padStart(8, '0')}`);

// ── Benchmarks ────────────────────────────────────────────────────────────────

describe('ArtifactCache L1 throughput', () => {

  bench(
    'L1 set — 1 KB buffer (×10 000)',
    async () => {
      const cache = await makeL1Cache();
      for (let i = 0; i < 10_000; i++) {
        await cache.set(SET_KEYS[i], SMALL_BUF);
      }
    },
    { warmupIterations: 1, warmupTime: 0, iterations: 3 },
  );

  bench(
    'L1 get — cache hit (×10 000)',
    async () => {
      const cache = await makeL1Cache();
      for (const key of GET_KEYS) {
        await cache.set(key, SMALL_BUF);
      }
      for (let i = 0; i < 10_000; i++) {
        await cache.get(GET_KEYS[i % 1_000]);
      }
    },
    { warmupIterations: 1, warmupTime: 0, iterations: 3 },
  );

  bench(
    'L1 get — cache miss (×1 000)',
    async () => {
      const cache = await makeL1Cache();
      for (const key of MISS_KEYS) {
        await cache.get(key);
      }
    },
    { warmupIterations: 1, warmupTime: 0, iterations: 5 },
  );

  bench(
    'L1 set — 256 KB buffer (×100)',
    async () => {
      const cache = await makeL1Cache();
      for (let i = 0; i < 100; i++) {
        await cache.set(`medium-${i}`, MEDIUM_BUF);
      }
    },
    { warmupIterations: 1, warmupTime: 0, iterations: 5 },
  );
});
