/**
 * offsetMeshWorkerManager — Main-Thread Proxy for the Offset Mesh Worker
 *
 * WHAT THIS FILE DOES:
 *   - Owns the singleton OffsetMeshWorker instance (lazy-created on first call).
 *   - Exposes `generateOffsetMeshInWorker(vertices, options, onProgress?)` — the public API.
 *   - Runs the full cavity heightmap + mesh pipeline entirely off the main thread
 *     using OffscreenCanvas for WebGL rendering inside the worker.
 *   - Transfers the `vertices` Float32Array to the worker (zero-copy).
 *   - Returns a Promise resolving with geometry arrays + metadata.
 *     Use `reconstructGeometryFromWorker(result)` to build a THREE.BufferGeometry.
 *
 * WHAT THIS FILE DOES NOT DO:
 *   - Does NOT decimate or smooth the result — that remains in the caller.
 *   - Does NOT cache results — use the offsetMeshResultCache in useOffsetMeshPreview.ts.
 *
 * CANONICAL LOCATION: packages/cad-core/src/workers/offsetMeshWorkerManager.ts
 * Exported via:        packages/cad-core/src/workers/index.ts → packages/cad-core/src/index.ts
 */

import * as THREE from 'three';
import OffsetMeshWorker from './offsetMeshWorker?worker';
import type { OffsetGeometryWorkerOutput } from './offsetMeshWorker';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface OffsetMeshWorkerResult {
  /** Raw vertex positions (indexed geometry). */
  positions: Float32Array;
  /** Smooth vertex normals. */
  normals: Float32Array;
  /** Index buffer. */
  indices: Uint32Array;
  metadata: {
    triangleCount: number;
    vertexCount: number;
    processingTime: number;
    resolution: number;
  };
}

export type OffsetProgressCallback = (current: number, total: number, stage: string) => void;

// ─── Singleton worker ─────────────────────────────────────────────────────────

let offsetWorker: Worker | null = null;

const pendingJobs = new Map<string, {
  resolve:    (result: OffsetMeshWorkerResult) => void;
  reject:     (error: Error)                   => void;
  onProgress?: OffsetProgressCallback;
}>();

function getOffsetWorker(): Worker {
  if (offsetWorker) return offsetWorker;

  offsetWorker = new OffsetMeshWorker();

  offsetWorker.onmessage = (e: MessageEvent<OffsetGeometryWorkerOutput>) => {
    const { type, id } = e.data;
    const job = pendingJobs.get(id);
    if (!job) return;

    if (type === 'geometry-progress') {
      job.onProgress?.(
        e.data.progress?.current ?? 0,
        e.data.progress?.total   ?? 100,
        e.data.progress?.stage   ?? ''
      );
    } else if (type === 'geometry-result') {
      pendingJobs.delete(id);
      job.resolve(e.data.data!);
    } else if (type === 'geometry-error') {
      pendingJobs.delete(id);
      job.reject(new Error(e.data.error ?? 'Offset mesh worker error'));
    }
  };

  offsetWorker.onerror = (event) => {
    console.error('[OffsetMeshWorker] Crashed:', event);
    pendingJobs.forEach(({ reject }) => reject(new Error('Offset mesh worker crashed')));
    pendingJobs.clear();
    offsetWorker = null;
  };

  return offsetWorker;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the full offset mesh pipeline in a dedicated worker thread.
 *
 * The `vertices` Float32Array is TRANSFERRED to the worker (zero-copy).
 * After this call, `vertices.buffer.byteLength === 0` on the main thread.
 *
 * @param vertices   Flat triangle-soup (xyz per vertex, 9 floats per triangle)
 * @param options    Same options as `createOffsetMesh` (without `canvas` / `progressCallback`)
 * @param onProgress Optional progress callback: (current, total, stage)
 */
export function generateOffsetMeshInWorker(
  vertices:    Float32Array,
  options: {
    offsetDistance: number;
    pixelsPerUnit:  number;
    tileSize?:      number;
    rotationXZ?:    number;
    rotationYZ?:    number;
    fillHoles?:     boolean;
  },
  onProgress?: OffsetProgressCallback,
): Promise<OffsetMeshWorkerResult> {
  const worker = getOffsetWorker();
  const id     = `offset-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  return new Promise((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject, onProgress });

    worker.postMessage(
      { type: 'generate-from-geometry', id, data: { vertices, options } },
      [vertices.buffer],   // transfer — zero-copy
    );
  });
}

/**
 * Reconstruct a THREE.BufferGeometry from the typed arrays returned by the worker.
 * Call this on the main thread after `generateOffsetMeshInWorker` resolves.
 */
export function reconstructOffsetGeometry(result: OffsetMeshWorkerResult): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(result.positions, 3));
  geometry.setAttribute('normal',   new THREE.BufferAttribute(result.normals,   3));
  geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
  return geometry;
}

/**
 * Terminate the offset mesh worker and clear all pending jobs.
 * Call this on session reset or when the app is unmounted.
 */
export function terminateOffsetMeshWorker(): void {
  if (offsetWorker) {
    offsetWorker.terminate();
    offsetWorker = null;
  }
  pendingJobs.forEach(({ reject }) => reject(new Error('Offset mesh worker terminated')));
  pendingJobs.clear();
}
