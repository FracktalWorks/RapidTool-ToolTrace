/**
 * ArtifactCache — Unit Tests (L1 in-memory tier only)
 *
 * IndexedDB is not available in Node.js (Vitest runs in Node).
 * The constructor catches the `indexedDB is not defined` error and sets
 * `l2Available = false`, so all tests exercise the L1 (Map + LRU) logic.
 *
 * L2 behaviour is verified separately via E2E tests in a real browser.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ArtifactCache } from '../artifactCache';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a deterministic ArrayBuffer of `bytes` length. */
function makeBuffer(bytes: number, fill = 0xab): ArrayBuffer {
  const buf = new ArrayBuffer(bytes);
  new Uint8Array(buf).fill(fill);
  return buf;
}

/**
 * Create an ArtifactCache with a very small L1 budget for eviction tests.
 * We reach into the private constant by overriding it via subclass + vitest mock
 * — instead, we just set a tiny budget per-entry and use many large buffers.
 */
function makeSmallCache(): ArtifactCache {
  return new ArtifactCache();
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ArtifactCache (L1 only)', () => {
  let cache: ArtifactCache;

  beforeEach(() => {
    cache = new ArtifactCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Basic get / set ────────────────────────────────────────────────────────

  it('set then get returns the same buffer', async () => {
    const buf = makeBuffer(1024);
    await cache.set('key-a', buf);
    const result = await cache.get('key-a');
    expect(result).not.toBeNull();
    expect(result!.byteLength).toBe(1024);
  });

  it('get on unknown key returns null', async () => {
    const result = await cache.get('does-not-exist');
    expect(result).toBeNull();
  });

  it('different keys store independently', async () => {
    await cache.set('alpha', makeBuffer(100, 0x01));
    await cache.set('beta', makeBuffer(200, 0x02));

    const a = await cache.get('alpha');
    const b = await cache.get('beta');

    expect(a!.byteLength).toBe(100);
    expect(b!.byteLength).toBe(200);
    expect(new Uint8Array(a!)[0]).toBe(0x01);
    expect(new Uint8Array(b!)[0]).toBe(0x02);
  });

  // ── TTL / expiry ──────────────────────────────────────────────────────────

  it('get returns null after TTL expires', async () => {
    const TTL_1MS = 1;
    await cache.set('expiring', makeBuffer(512), TTL_1MS);

    // Advance Date.now() past TTL
    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockReturnValue(realNow() + 1000);

    const result = await cache.get('expiring');
    expect(result).toBeNull();
  });

  it('get returns buffer before TTL expires', async () => {
    const TTL_1HOUR = 60 * 60 * 1000;
    await cache.set('fresh', makeBuffer(256), TTL_1HOUR);
    const result = await cache.get('fresh');
    expect(result).not.toBeNull();
  });

  // ── has() ─────────────────────────────────────────────────────────────────

  it('has() returns true for a valid entry', async () => {
    await cache.set('exists', makeBuffer(64));
    expect(await cache.has('exists')).toBe(true);
  });

  it('has() returns false for a missing key', async () => {
    expect(await cache.has('missing')).toBe(false);
  });

  it('has() returns false after TTL expires', async () => {
    await cache.set('temp', makeBuffer(64), 1);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);
    expect(await cache.has('temp')).toBe(false);
  });

  // ── evict() ───────────────────────────────────────────────────────────────

  it('evict() removes entry from L1', async () => {
    await cache.set('to-remove', makeBuffer(128));
    await cache.evict('to-remove');
    expect(await cache.get('to-remove')).toBeNull();
  });

  it('evict() of non-existent key is a no-op', async () => {
    await expect(cache.evict('ghost')).resolves.not.toThrow();
  });

  // ── clear() ───────────────────────────────────────────────────────────────

  it('clear() empties the cache entirely', async () => {
    await cache.set('k1', makeBuffer(64));
    await cache.set('k2', makeBuffer(64));
    await cache.clear();

    expect(await cache.get('k1')).toBeNull();
    expect(await cache.get('k2')).toBeNull();

    const stats = cache.getStats();
    expect(stats.l1Entries).toBe(0);
    expect(stats.l1Bytes).toBe(0);
  });

  // ── Overwrite / byte count ─────────────────────────────────────────────────

  it('overwriting an existing key updates byte count correctly', async () => {
    await cache.set('key', makeBuffer(100));
    await cache.set('key', makeBuffer(200)); // overwrite with larger buffer

    const stats = cache.getStats();
    // Only one entry, 200 bytes — no double-counting the old 100 bytes
    expect(stats.l1Entries).toBe(1);
    expect(stats.l1Bytes).toBe(200);
  });

  // ── Hit / miss stats ──────────────────────────────────────────────────────

  it('tracks hit rate correctly', async () => {
    await cache.set('hit-key', makeBuffer(64));

    await cache.get('hit-key');   // hit
    await cache.get('hit-key');   // hit
    await cache.get('miss-key');  // miss

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3, 5);
  });

  it('hit rate is 0 when no operations have been done', () => {
    const stats = cache.getStats();
    expect(stats.hitRate).toBe(0);
  });

  // ── LRU eviction ─────────────────────────────────────────────────────────

  it('LRU: evicts least-recently-used entry when budget is exceeded', async () => {
    // L1_MAX_BYTES is 300 MB (from source). We use 3 x 150 MB buffers.
    // First two fill the cache; third triggers eviction of oldest.
    const MB = 1024 * 1024;

    // We can't change L1_MAX_BYTES from outside the class, but we can
    // test the LRU ordering logic with smaller buffers if we insert enough entries.
    // Strategy: insert 4 entries of 80 MB each (total 320 MB > 300 MB budget).

    await cache.set('oldest', makeBuffer(80 * MB));
    await cache.set('middle', makeBuffer(80 * MB));
    await cache.set('newer', makeBuffer(80 * MB));
    // This push should evict 'oldest' to make room
    await cache.set('newest', makeBuffer(80 * MB));

    // 'oldest' should be evicted
    expect(await cache.get('oldest')).toBeNull();
    // Others should still be present
    expect(await cache.get('newest')).not.toBeNull();
  });

  it('LRU: recently accessed entry is promoted and survives eviction', async () => {
    const MB = 1024 * 1024;

    await cache.set('first', makeBuffer(80 * MB));
    await cache.set('second', makeBuffer(80 * MB));
    await cache.set('third', makeBuffer(80 * MB));

    // Access 'first' — moves it to tail (most recently used)
    await cache.get('first');

    // Insert a new large entry — should evict 'second' (now the LRU), not 'first'
    await cache.set('fourth', makeBuffer(80 * MB));

    expect(await cache.get('first')).not.toBeNull();  // survived
    expect(await cache.get('second')).toBeNull();     // evicted (was LRU)
  });

  // ── l2Available flag ──────────────────────────────────────────────────────

  it('l2Available is false in Node.js environment (no IndexedDB)', () => {
    const stats = cache.getStats();
    // In Node.js, IndexedDB does not exist → constructor catches error → l2Available = false
    expect(stats.l2Available).toBe(false);
  });
});
