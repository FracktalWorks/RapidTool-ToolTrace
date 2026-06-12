/**
 * parseWorkerManager — Main-Thread Proxy for the Parse Worker
 *
 * WHAT THIS FILE DOES:
 *   - Owns the singleton ParseWorker instance (lazy-created on first call).
 *   - Exposes `parseSTLInWorker(buffer, filename, onProgress?)` — the only public API.
 *   - Transfers the raw ArrayBuffer to the worker (zero allocation).
 *   - Returns a Promise that resolves with typed arrays ready for THREE.js reconstruction.
 *
 * WHAT THIS FILE DOES NOT DO:
 *   - Does NOT construct THREE.BufferGeometry — that happens in the caller.
 *     Use `reconstructGeometry({ positions, normals, indices })` from workerManager.ts
 *     to build the geometry on the main thread.
 *   - Does NOT compute BVH (three-mesh-bvh) — that is the caller's responsibility.
 *   - Does NOT cache parsed geometry — use artifactCache.ts for that.
 *   - Does NOT handle non-STL formats — extend via a new worker or `type` discriminator.
 *
 * CANONICAL LOCATION: packages/cad-core/src/workers/parseWorkerManager.ts
 * Exported via:        packages/cad-core/src/workers/index.ts → packages/cad-core/src/index.ts
 */

import ParseWorker from './parseWorker?worker';
import type { ParseWorkerInput, ParseWorkerOutput } from './parseWorker';

// ─── Public types ─────────────────────────────────────────────────────────────

/** Result returned by parseSTLInWorker — raw typed arrays, ready to pass to reconstructGeometry(). */
export interface ParsedSTLResult {
  /** Unique vertex positions (indexed geometry — 30–60% smaller than flat). */
  positions:     Float32Array;
  /** Smooth vertex normals, area-weighted, one per unique vertex. */
  normals:       Float32Array;
  /** Index buffer: each triplet references three vertices in `positions`. */
  indices:       Uint32Array;
  triangleCount: number;
  format:        'binary' | 'ascii';
}

export type ParseProgressCallback = (stage: string, pct: number) => void;

// ─── Singleton worker ─────────────────────────────────────────────────────────

let parseWorker: Worker | null = null;

/** Pending promise handlers keyed by job id. */
const pendingJobs = new Map<string, {
  resolve: (result: ParsedSTLResult)  => void;
  reject:  (error:  Error)            => void;
  onProgress?: ParseProgressCallback;
}>();

function getParseWorker(): Worker {
  if (parseWorker) return parseWorker;

  parseWorker = new ParseWorker();

  parseWorker.onmessage = (e: MessageEvent<ParseWorkerOutput>) => {
    const { type, id } = e.data;
    const job = pendingJobs.get(id);
    if (!job) return;

    if (type === 'parse-progress') {
      job.onProgress?.(e.data.stage ?? '', e.data.pct ?? 0);

    } else if (type === 'parse-complete') {
      pendingJobs.delete(id);
      job.resolve({
        positions:     e.data.positions!,
        normals:       e.data.normals!,
        indices:       e.data.indices!,
        triangleCount: e.data.triangleCount!,
        format:        e.data.format!,
      });

    } else if (type === 'parse-error') {
      pendingJobs.delete(id);
      job.reject(new Error(e.data.error ?? 'Parse worker error'));
    }
  };

  parseWorker.onerror = (event) => {
    console.error('[ParseWorker] Crashed:', event);
    // Reject all pending jobs and null the reference so the next call spawns fresh.
    pendingJobs.forEach(({ reject }) => reject(new Error('Parse worker crashed')));
    pendingJobs.clear();
    parseWorker = null;
  };

  return parseWorker;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse an STL file in a dedicated worker thread.
 *
 * The `buffer` ArrayBuffer is TRANSFERRED to the worker (zero-copy).
 * After this call, `buffer.byteLength === 0` on the main thread — do not
 * read it after calling this function.
 *
 * The promise resolves with typed arrays that can be passed directly to
 * `reconstructGeometry()` to build a THREE.BufferGeometry on the main thread.
 *
 * @param buffer    Raw file bytes (will be transferred, not copied)
 * @param filename  Original filename — used for error messages only
 * @param onProgress  Optional callback: (stage: string, pct: 0–100) => void
 */
export function parseSTLInWorker(
  buffer:     ArrayBuffer,
  filename:   string,
  onProgress?: ParseProgressCallback,
): Promise<ParsedSTLResult> {
  const worker = getParseWorker();
  const id     = `parse-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  return new Promise((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject, onProgress });

    worker.postMessage(
      { type: 'parse', id, buffer, filename } as ParseWorkerInput,
      [buffer],   // transfer — zero-copy, main thread gives up ownership
    );
  });
}

/**
 * Terminate the parse worker and clear all pending jobs.
 * Call this on session reset or when the app is unmounted.
 */
export function terminateParseWorker(): void {
  if (parseWorker) {
    parseWorker.terminate();
    parseWorker = null;
  }
  pendingJobs.forEach(({ reject }) => reject(new Error('Parse worker terminated')));
  pendingJobs.clear();
}
