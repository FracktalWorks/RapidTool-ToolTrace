/**
 * ArtifactCache
 *
 * Two-tier cache for heavy compute results (geometry ArrayBuffers, export STLs).
 *
 * L1 — in-memory Map  : < 1 ms access, LRU eviction at L1_MAX_BYTES (300 MB)
 * L2 — IndexedDB      : < 50 ms access, survives refresh, 7-day TTL by default
 *
 * Usage:
 *   const cache = new ArtifactCache();
 *   await cache.set(key, buffer);
 *   const hit = await cache.get(key);  // null on miss
 *
 * What this does NOT do:
 *   - Store THREE.js geometries directly — only plain ArrayBuffer
 *   - Store design/UI state — use @rapidtool/storage for that
 *   - Sync to cloud — client-side only
 *
 * When to modify:
 *   - Adjust memory budget → change L1_MAX_BYTES
 *   - Adjust IndexedDB TTL → change DEFAULT_TTL_MS
 *   - Add a new IndexedDB store → bump DB_VERSION and add upgrade branch
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'rapidtool-compute';
const DB_VERSION = 1;
const STORE_NAME = 'artifact-cache';

/** Maximum L1 in-memory size before LRU eviction kicks in (300 MB). */
const L1_MAX_BYTES = 300 * 1024 * 1024;

/** Default L2 TTL: 7 days in milliseconds. */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface L1Entry {
  buffer: ArrayBuffer;
  bytes: number;
  expiresAt: number;
}

interface L2Record {
  key: string;
  buffer: ArrayBuffer;
  createdAt: number;
  expiresAt: number;
}

export interface ArtifactCacheStats {
  l1Entries: number;
  l1Bytes: number;
  l2Available: boolean;
  hits: number;
  misses: number;
  hitRate: number;
}

// ─── ArtifactCache ────────────────────────────────────────────────────────────

export class ArtifactCache {
  /**
   * L1: Map preserves insertion order → we use it as an LRU by
   * deleting-and-re-inserting on every access (moves to "tail" = most recent).
   * Eviction removes from "head" = least recently used.
   */
  private l1 = new Map<string, L1Entry>();
  private l1Bytes = 0;

  private db: IDBDatabase | null = null;
  private dbReady: Promise<void> | null = null;
  private l2Available = true;

  private hits = 0;
  private misses = 0;

  constructor() {
    this.dbReady = this.openDB().catch(() => {
      // IndexedDB unavailable (private browsing, storage denied, etc.)
      // Graceful degradation: L1 still works.
      this.l2Available = false;
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Store a buffer under `key`.
   * Written to L1 immediately; L2 write is fire-and-await (non-blocking to caller).
   */
  async set(key: string, buffer: ArrayBuffer, ttlMs = DEFAULT_TTL_MS): Promise<void> {
    const expiresAt = Date.now() + ttlMs;

    // L1 write
    this.l1Set(key, buffer, expiresAt);

    // L2 write (awaited so caller can rely on persistence after this resolves)
    if (this.l2Available) {
      await this.dbReady;
      await this.l2Set(key, buffer, expiresAt);
    }
  }

  /**
   * Retrieve a buffer.
   * Checks L1 first, then L2. On L2 hit, promotes entry back to L1.
   * Returns null on miss or expired entry.
   */
  async get(key: string): Promise<ArrayBuffer | null> {
    // L1 check
    const l1 = this.l1.get(key);
    if (l1) {
      if (l1.expiresAt < Date.now()) {
        this.l1Evict(key);
      } else {
        // Move to tail (most recently used)
        this.l1.delete(key);
        this.l1.set(key, l1);
        this.hits++;
        return l1.buffer;
      }
    }

    // L2 check
    if (this.l2Available) {
      await this.dbReady;
      const record = await this.l2Get(key);
      if (record) {
        if (record.expiresAt < Date.now()) {
          await this.l2Delete(key);
        } else {
          // Promote to L1
          this.l1Set(key, record.buffer, record.expiresAt);
          this.hits++;
          return record.buffer;
        }
      }
    }

    this.misses++;
    return null;
  }

  /** Returns true if a valid (non-expired) entry exists for `key`. */
  async has(key: string): Promise<boolean> {
    const result = await this.get(key);
    return result !== null;
  }

  /** Remove a specific entry from both tiers. */
  async evict(key: string): Promise<void> {
    this.l1Evict(key);
    if (this.l2Available) {
      await this.dbReady;
      await this.l2Delete(key);
    }
  }

  /** Remove all entries from both tiers. */
  async clear(): Promise<void> {
    this.l1.clear();
    this.l1Bytes = 0;
    if (this.l2Available) {
      await this.dbReady;
      await this.l2Clear();
    }
  }

  /** Current cache statistics (useful for debugging). */
  getStats(): ArtifactCacheStats {
    const total = this.hits + this.misses;
    return {
      l1Entries: this.l1.size,
      l1Bytes: this.l1Bytes,
      l2Available: this.l2Available,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  // ─── L1 helpers ─────────────────────────────────────────────────────────────

  private l1Set(key: string, buffer: ArrayBuffer, expiresAt: number): void {
    const bytes = buffer.byteLength;

    // If entry already exists, remove old size first
    const existing = this.l1.get(key);
    if (existing) {
      this.l1Bytes -= existing.bytes;
      this.l1.delete(key);
    }

    // Evict LRU entries until there is room
    while (this.l1Bytes + bytes > L1_MAX_BYTES && this.l1.size > 0) {
      // Map iterator returns entries in insertion order → first = LRU
      const oldestKey = this.l1.keys().next().value!;
      this.l1Evict(oldestKey);
    }

    this.l1.set(key, { buffer, bytes, expiresAt });
    this.l1Bytes += bytes;
  }

  private l1Evict(key: string): void {
    const entry = this.l1.get(key);
    if (entry) {
      this.l1Bytes -= entry.bytes;
      this.l1.delete(key);
    }
  }

  // ─── IndexedDB helpers ───────────────────────────────────────────────────────

  private openDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('expiresAt', 'expiresAt');
        }
      };

      req.onsuccess = () => {
        this.db = req.result;
        // Prune expired entries on open (background, don't block)
        this.l2PruneExpired().catch(() => {});
        resolve();
      };

      req.onerror = () => reject(req.error);
    });
  }

  private l2Set(key: string, buffer: ArrayBuffer, expiresAt: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not open'));
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const record: L2Record = { key, buffer, createdAt: Date.now(), expiresAt };
      const req = tx.objectStore(STORE_NAME).put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private l2Get(key: string): Promise<L2Record | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve(null);
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve((req.result as L2Record) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  private l2Delete(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private l2Clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /** Delete all entries whose `expiresAt` is in the past. */
  private l2PruneExpired(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('expiresAt');
      const range = IDBKeyRange.upperBound(Date.now());
      const req = index.openCursor(range);

      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/**
 * Shared singleton instance.
 * Import this in any module that needs cache access:
 *   import { artifactCache } from '@rapidtool/cad-core';
 *
 * Exposed on window in development for inspection:
 *   window.__rapidtoolCache?.getStats()
 */
export const artifactCache = new ArtifactCache();

if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  (window as any).__rapidtoolCache = artifactCache;
}
