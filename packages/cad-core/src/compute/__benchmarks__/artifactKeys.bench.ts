/**
 * Artifact Key Hashing — Performance Benchmarks
 *
 * Threshold (from TESTING_PROGRESS.md Phase 4 spec):
 *   makePartKey ×1000 < 10 ms total
 *
 * SHA-256 is done via Web Crypto (crypto.subtle) which is available in
 * Node 15+ and in Vitest's node environment.
 */

import { bench, describe } from 'vitest';
import { makePartKey, makeWorkpieceKey, makeExportKey, type WorkpieceKeyParams } from '../artifactKeys';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PART_META = { name: 'bracket.stl', size: 5_242_880, triangles: 104_855 };

const WORKPIECE_PARAMS: WorkpieceKeyParams = {
  partKeys: ['aaa111', 'bbb222', 'ccc333'],
  baseplate: { type: 'flat', padding: 5, height: 10, depth: 3 },
  supports: [
    { id: 's1', x: 0,  y: 0,  z: 0,  radius: 5,  height: 20 },
    { id: 's2', x: 50, y: 0,  z: 50, radius: 5,  height: 20 },
    { id: 's3', x: 25, y: 0,  z: 25, radius: 3,  height: 15 },
  ],
  holes: [
    { id: 'h1', x: 10, y: 0, diameter: 4, depth: 8 },
    { id: 'h2', x: 40, y: 0, diameter: 6, depth: 8 },
  ],
  cavity: {
    offsetDistance: 0.5,
    pixelsPerUnit: 6,
    rotationXZ: 0,
    rotationYZ: 0,
    fillHoles: true,
    enableDecimation: true,
    enableSmoothing: true,
    smoothingStrength: 0.5,
    smoothingIterations: 10,
    smoothingQuality: true,
    csgMinVolume: 0.01,
    csgMinThickness: 0.5,
    csgMinTriangles: 50,
  },
};

// ── Benchmarks ────────────────────────────────────────────────────────────────

describe('artifact key generation', () => {
  bench(
    'makePartKey — single call',
    async () => {
      await makePartKey('part-abc-123', PART_META);
    },
    // 1000 iterations: total should be well under 10 ms
    { iterations: 1000, time: 0 },
  );

  bench(
    'makeWorkpieceKey — single call (larger payload)',
    async () => {
      await makeWorkpieceKey(WORKPIECE_PARAMS);
    },
    { iterations: 500, time: 0 },
  );

  bench(
    'makeExportKey — single call',
    async () => {
      await makeExportKey({
        workpieceKey: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
        format: 'stl-binary',
        quality: 'balanced',
      });
    },
    { iterations: 1000, time: 0 },
  );
});
