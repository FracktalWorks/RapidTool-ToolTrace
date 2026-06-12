/**
 * decimateWorker — Off-Thread MeshOptimizer Simplification
 *
 * WHAT THIS FILE DOES:
 *   - Runs inside a dedicated Web Worker (no DOM, no THREE.js).
 *   - Awaits `MeshoptSimplifier.ready` (inline WASM — DOM-free).
 *   - Receives a geometry's position and index typed arrays plus a target index
 *     count, runs `MeshoptSimplifier.simplify`, and returns the simplified index
 *     buffer via zero-copy transfer.
 *
 * WHAT THIS FILE DOES NOT DO:
 *   - Does NOT merge vertices — caller must ensure geometry is indexed (welded)
 *     before dispatching here.
 *   - Does NOT reconstruct THREE.BufferGeometry — caller does that after receiving
 *     the new indices.
 *   - Does NOT run the Fast Quadric step — that is DOM-dependent (Emscripten
 *     `window.Module` + `document.createElement`) and must stay on the main thread.
 *
 * CANONICAL LOCATION: packages/cad-core/src/workers/decimateWorker.ts
 * Exported via:       packages/cad-core/src/workers/index.ts  (types only)
 */

/// <reference lib="webworker" />

import { MeshoptSimplifier } from 'meshoptimizer';

// ─── Message types ────────────────────────────────────────────────────────────

export interface DecimateWorkerInput {
  type: 'decimate';
  /** Job identifier — echoed back in every response message. */
  id: string;
  /** Vertex positions (X,Y,Z interleaved). Sent via structured clone — caller retains ownership. */
  positions: Float32Array;
  /** Index buffer. Sent via structured clone — caller retains ownership. */
  indices: Uint32Array;
  /** Target number of indices (= targetTriangles × 3). */
  targetIndexCount: number;
}

export type DecimateWorkerOutput =
  | {
      type: 'decimate-complete';
      id: string;
      /** Simplified index buffer — transferred (zero-copy) to the main thread. */
      newIndices: Uint32Array;
      finalTriangles: number;
    }
  | {
      type: 'decimate-error';
      id: string;
      error: string;
    };

// ─── Worker entry point ───────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<DecimateWorkerInput>): Promise<void> => {
  const { type, id, positions, indices, targetIndexCount } = e.data;

  if (type !== 'decimate') return;

  try {
    // Wait for the inline WASM bundle to finish compiling (first call only, < 50ms).
    await MeshoptSimplifier.ready;

    // simplify(indices, vertex_positions, vertex_stride, target_index_count, target_error, flags)
    // target_error = 0.001 → allow up to 0.1% of mesh extents error.
    // This acts as a quality brake: for a 258mm model the max error is 0.258mm,
    // preserving fine features. Fast Quadric handles any remaining reduction.
    // LockBorder → preserve boundary vertices (prevents open-mesh artefacts).
    const [newIndices] = MeshoptSimplifier.simplify(
      indices,
      positions,
      3,                // stride: X, Y, Z
      targetIndexCount,
      0.001,
      ['LockBorder'],
    );

    if (newIndices.length === 0) {
      throw new Error('MeshoptSimplifier produced an empty index buffer');
    }

    const finalTriangles = Math.floor(newIndices.length / 3);

    // Transfer newIndices (zero-copy) — the main thread owns the buffer after this.
    (self as unknown as Worker).postMessage(
      { type: 'decimate-complete', id, newIndices, finalTriangles } satisfies DecimateWorkerOutput,
      [newIndices.buffer],
    );

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage(
      { type: 'decimate-error', id, error } satisfies DecimateWorkerOutput,
    );
  }
};
