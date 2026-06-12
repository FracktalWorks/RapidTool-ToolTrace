/**
 * STL Parser — Performance Benchmarks
 *
 * Thresholds (from TESTING_PROGRESS.md Phase 4 spec):
 *   5 MB binary STL  → parse < 500 ms per call (mean)
 *   20 MB binary STL → parse < 2000 ms per call (mean)
 *
 * Buffers are built at module load time (synchronous) so no beforeAll
 * timing issues affect the measurement phase.
 */

import { bench, describe } from 'vitest';
import { parseSTL } from '../stlParser';

// ── Buffer factory ────────────────────────────────────────────────────────────

/**
 * Build a valid binary STL buffer with the given number of triangles.
 * Each triangle = 50 bytes; total = 84 (header) + triangleCount × 50.
 */
function makeBinarySTL(triangleCount: number): ArrayBuffer {
  const buf = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buf);
  view.setUint32(80, triangleCount, true); // triangle count at offset 80

  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    // Normal: (0, 1, 0)
    view.setFloat32(offset, 0, true); offset += 4;
    view.setFloat32(offset, 1, true); offset += 4;
    view.setFloat32(offset, 0, true); offset += 4;
    // Vertex A
    view.setFloat32(offset, 0,            true); offset += 4;
    view.setFloat32(offset, 0,            true); offset += 4;
    view.setFloat32(offset, 0,            true); offset += 4;
    // Vertex B
    view.setFloat32(offset, i * 0.001,    true); offset += 4;
    view.setFloat32(offset, 1,            true); offset += 4;
    view.setFloat32(offset, 0,            true); offset += 4;
    // Vertex C
    view.setFloat32(offset, 0,            true); offset += 4;
    view.setFloat32(offset, 0,            true); offset += 4;
    view.setFloat32(offset, 1,            true); offset += 4;
    // Attribute byte count
    view.setUint16(offset, 0, true); offset += 2;
  }
  return buf;
}

// Exact triangle counts to hit target byte sizes:
//   5 MB  = (5 × 1024 × 1024 − 84) / 50 = 104,855 triangles
//  20 MB  = (20 × 1024 × 1024 − 84) / 50 = 419,428 triangles
const TRIANGLES_5MB  = Math.floor((5  * 1024 * 1024 - 84) / 50);
const TRIANGLES_20MB = Math.floor((20 * 1024 * 1024 - 84) / 50);

// Build buffers at module load time (synchronous — no beforeAll needed)
console.log(`[bench/stl] building fixtures: ${TRIANGLES_5MB} + ${TRIANGLES_20MB} triangles...`);
const BUF_5MB  = makeBinarySTL(TRIANGLES_5MB);
const BUF_20MB = makeBinarySTL(TRIANGLES_20MB);
console.log(`[bench/stl] fixtures ready — 5 MB: ${(BUF_5MB.byteLength / 1024 / 1024).toFixed(2)} MB, 20 MB: ${(BUF_20MB.byteLength / 1024 / 1024).toFixed(2)} MB`);

// ── Benchmarks ────────────────────────────────────────────────────────────────

describe('STL parser throughput', () => {
  bench(
    'parseSTL — 5 MB binary (target < 500 ms)',
    () => {
      parseSTL(BUF_5MB);
    },
    // warmupIterations:1 so we get a warmup run; then Vitest measures for ~2s
    { warmupIterations: 1, warmupTime: 0, iterations: 5 },
  );

  bench(
    'parseSTL — 20 MB binary (target < 2000 ms)',
    () => {
      parseSTL(BUF_20MB);
    },
    { warmupIterations: 1, warmupTime: 0, iterations: 3 },
  );
});
