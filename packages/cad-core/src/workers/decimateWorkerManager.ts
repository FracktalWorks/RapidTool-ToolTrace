/**
 * decimateWorkerManager — Main-Thread Proxy for the Decimate Worker
 *
 * WHAT THIS FILE DOES:
 *   - Owns the singleton DecimateWorker instance (lazy-created on first call).
 *   - Exposes `simplifyInWorker(positions, indices, targetIndexCount, onProgress?)` —
 *     the only public API for off-thread MeshOptimizer simplification.
 *   - Sends typed arrays to the worker via structured clone so the main thread
 *     retains its references for geometry reconstruction.
 *   - Returns a Promise that resolves with the simplified index buffer (zero-copy
 *     transfer back from the worker).
 *
 * WHAT THIS FILE DOES NOT DO:
 *   - Does NOT merge vertices or build THREE.BufferGeometry — caller does both.
 *   - Does NOT run the Fast Quadric (simplify.ts) step — that is DOM-dependent.
 *   - Does NOT cache results — use artifactCache.ts for that.
 *
 * CANONICAL LOCATION: packages/cad-core/src/workers/decimateWorkerManager.ts
 * Exported via:       packages/cad-core/src/workers/index.ts → packages/cad-core/src/index.ts
 */

import DecimateWorker from './decimateWorker?worker';
import type { DecimateWorkerInput, DecimateWorkerOutput } from './decimateWorker';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DecimateResult {
  /** Simplified index buffer — transferred from the worker (zero-copy). */
  newIndices: Uint32Array;
  finalTriangles: number;
}

export type DecimateProgressCallback = (stage: string, pct: number) => void;

// ─── Singleton worker ─────────────────────────────────────────────────────────

let decimateWorker: Worker | null = null;

const pendingJobs = new Map<string, {
  resolve:     (result: DecimateResult) => void;
  reject:      (error:  Error)          => void;
  onProgress?: DecimateProgressCallback;
}>();

function getDecimateWorker(): Worker {
  if (decimateWorker) return decimateWorker;

  decimateWorker = new DecimateWorker();

  decimateWorker.onmessage = (e: MessageEvent<DecimateWorkerOutput>) => {
    const { type, id } = e.data;
    const job = pendingJobs.get(id);
    if (!job) return;

    if (type === 'decimate-complete') {
      pendingJobs.delete(id);
      job.resolve({
        newIndices:    e.data.newIndices,
        finalTriangles: e.data.finalTriangles,
      });
    } else if (type === 'decimate-error') {
      pendingJobs.delete(id);
      job.reject(new Error(e.data.error ?? 'Decimate worker error'));
    }
  };

  decimateWorker.onerror = (event) => {
    console.error('[DecimateWorker] Crashed:', event);
    // Reject all pending jobs and null the reference so the next call spawns fresh.
    pendingJobs.forEach(({ reject }) => reject(new Error('Decimate worker crashed')));
    pendingJobs.clear();
    decimateWorker = null;
  };

  return decimateWorker;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Simplify a mesh's index buffer using MeshoptSimplifier in a dedicated worker.
 *
 * `positions` and `indices` are sent via **structured clone** — the main thread
 * retains its references so it can reconstruct the THREE.BufferGeometry after
 * receiving the simplified indices.
 *
 * The returned `newIndices` buffer is **transferred** (zero-copy) from the worker.
 *
 * @param positions        Vertex positions (Float32Array, X/Y/Z interleaved)
 * @param indices          Index buffer (Uint32Array) — geometry must be indexed/welded
 * @param targetIndexCount Target number of indices (= targetTriangles × 3)
 * @param onProgress       Optional progress callback
 */
export function simplifyInWorker(
  positions:        Float32Array,
  indices:          Uint32Array,
  targetIndexCount: number,
  onProgress?:      DecimateProgressCallback,
): Promise<DecimateResult> {
  const worker = getDecimateWorker();
  const id     = `decimate-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  return new Promise((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject, onProgress });

    // Structured clone (no transferables) — main thread keeps positions + indices
    // for geometry reconstruction after the worker returns the simplified indices.
    worker.postMessage(
      { type: 'decimate', id, positions, indices, targetIndexCount } as DecimateWorkerInput,
    );
  });
}

/**
 * Terminate the decimate worker and clear all pending jobs.
 * Call this on session reset or when the app is unmounted.
 */
export function terminateDecimateWorker(): void {
  if (decimateWorker) {
    decimateWorker.terminate();
    decimateWorker = null;
  }
  pendingJobs.forEach(({ reject }) => reject(new Error('Decimate worker terminated')));
  pendingJobs.clear();
}
