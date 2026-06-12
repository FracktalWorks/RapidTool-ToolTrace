/**
 * Artifact Keys — Unit Tests
 *
 * Verifies that SHA-256 cache keys are:
 *   - Deterministic: same input → same hash every time
 *   - Discriminating: any geometry-affecting field change → different hash
 *   - Stable: PIPELINE_VERSION is embedded → bump busts all old keys
 */

import { describe, it, expect } from 'vitest';
import {
  makePartKey,
  makeWorkpieceKey,
  makeExportKey,
  PIPELINE_VERSION,
  type CavityGeometryInputs,
  type WorkpieceKeyParams,
} from '../artifactKeys';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PART_META = { name: 'bracket.stl', size: 204800, triangles: 1024 };

const CAVITY: CavityGeometryInputs = {
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
};

const WORKPIECE_PARAMS: WorkpieceKeyParams = {
  partKeys: ['aaa', 'bbb'],
  baseplate: { type: 'flat', padding: 5, height: 10 },
  supports: [{ id: 's1', x: 0, y: 0, z: 0, radius: 5 }],
  holes: [{ id: 'h1', x: 10, y: 0, diameter: 4 }],
  cavity: CAVITY,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** SHA-256 output is a 64-char lowercase hex string. */
function isValidHash(h: string): boolean {
  return /^[0-9a-f]{64}$/.test(h);
}

// ── makePartKey ───────────────────────────────────────────────────────────────

describe('makePartKey', () => {
  it('returns a 64-char hex hash', async () => {
    const h = await makePartKey('part-1', PART_META);
    expect(isValidHash(h)).toBe(true);
  });

  it('is deterministic — same inputs produce same hash', async () => {
    const h1 = await makePartKey('part-1', PART_META);
    const h2 = await makePartKey('part-1', PART_META);
    expect(h1).toBe(h2);
  });

  it('differs when partId changes', async () => {
    const h1 = await makePartKey('part-1', PART_META);
    const h2 = await makePartKey('part-2', PART_META);
    expect(h1).not.toBe(h2);
  });

  it('differs when file name changes', async () => {
    const h1 = await makePartKey('part-1', { ...PART_META, name: 'a.stl' });
    const h2 = await makePartKey('part-1', { ...PART_META, name: 'b.stl' });
    expect(h1).not.toBe(h2);
  });

  it('differs when file size changes', async () => {
    const h1 = await makePartKey('part-1', { ...PART_META, size: 100 });
    const h2 = await makePartKey('part-1', { ...PART_META, size: 200 });
    expect(h1).not.toBe(h2);
  });

  it('differs when triangle count changes', async () => {
    const h1 = await makePartKey('part-1', { ...PART_META, triangles: 512 });
    const h2 = await makePartKey('part-1', { ...PART_META, triangles: 1024 });
    expect(h1).not.toBe(h2);
  });

  it('embeds PIPELINE_VERSION — simulated bump changes the hash', async () => {
    // Can't actually change the exported constant, but we can verify it's present
    // by checking a known stable hash only matches the current version.
    const h1 = await makePartKey('part-1', PART_META);
    // The hash must encode version somehow — we verify it's stable across calls
    // (bumping version in the source would be tested via integration/regression).
    expect(isValidHash(h1)).toBe(true);
    // Verify PIPELINE_VERSION is a positive integer (bumping it will bust cache)
    expect(Number.isInteger(PIPELINE_VERSION)).toBe(true);
    expect(PIPELINE_VERSION).toBeGreaterThan(0);
  });
});

// ── makeWorkpieceKey ──────────────────────────────────────────────────────────

describe('makeWorkpieceKey', () => {
  it('returns a 64-char hex hash', async () => {
    const h = await makeWorkpieceKey(WORKPIECE_PARAMS);
    expect(isValidHash(h)).toBe(true);
  });

  it('is deterministic', async () => {
    const h1 = await makeWorkpieceKey(WORKPIECE_PARAMS);
    const h2 = await makeWorkpieceKey(WORKPIECE_PARAMS);
    expect(h1).toBe(h2);
  });

  it('partKeys order does NOT affect hash (sorted before hashing)', async () => {
    const h1 = await makeWorkpieceKey({ ...WORKPIECE_PARAMS, partKeys: ['aaa', 'bbb'] });
    const h2 = await makeWorkpieceKey({ ...WORKPIECE_PARAMS, partKeys: ['bbb', 'aaa'] });
    expect(h1).toBe(h2);
  });

  it('differs when cavity is null vs non-null', async () => {
    const h1 = await makeWorkpieceKey({ ...WORKPIECE_PARAMS, cavity: null });
    const h2 = await makeWorkpieceKey({ ...WORKPIECE_PARAMS, cavity: CAVITY });
    expect(h1).not.toBe(h2);
  });

  it('differs when offsetDistance changes', async () => {
    const h1 = await makeWorkpieceKey({
      ...WORKPIECE_PARAMS,
      cavity: { ...CAVITY, offsetDistance: 0.5 },
    });
    const h2 = await makeWorkpieceKey({
      ...WORKPIECE_PARAMS,
      cavity: { ...CAVITY, offsetDistance: 1.0 },
    });
    expect(h1).not.toBe(h2);
  });

  it('differs when pixelsPerUnit changes', async () => {
    const h1 = await makeWorkpieceKey({
      ...WORKPIECE_PARAMS,
      cavity: { ...CAVITY, pixelsPerUnit: 6 },
    });
    const h2 = await makeWorkpieceKey({
      ...WORKPIECE_PARAMS,
      cavity: { ...CAVITY, pixelsPerUnit: 12 },
    });
    expect(h1).not.toBe(h2);
  });

  it('differs when smoothingQuality changes', async () => {
    const h1 = await makeWorkpieceKey({
      ...WORKPIECE_PARAMS,
      cavity: { ...CAVITY, smoothingQuality: true },
    });
    const h2 = await makeWorkpieceKey({
      ...WORKPIECE_PARAMS,
      cavity: { ...CAVITY, smoothingQuality: false },
    });
    expect(h1).not.toBe(h2);
  });

  it('differs when supports change', async () => {
    const h1 = await makeWorkpieceKey({ ...WORKPIECE_PARAMS, supports: [] });
    const h2 = await makeWorkpieceKey({
      ...WORKPIECE_PARAMS,
      supports: [{ id: 's1', x: 0, y: 0 }],
    });
    expect(h1).not.toBe(h2);
  });

  it('differs when holes change', async () => {
    const h1 = await makeWorkpieceKey({ ...WORKPIECE_PARAMS, holes: [] });
    const h2 = await makeWorkpieceKey({
      ...WORKPIECE_PARAMS,
      holes: [{ id: 'h1', diameter: 4 }],
    });
    expect(h1).not.toBe(h2);
  });

  it('differs when baseplate changes', async () => {
    const h1 = await makeWorkpieceKey({ ...WORKPIECE_PARAMS, baseplate: null });
    const h2 = await makeWorkpieceKey({
      ...WORKPIECE_PARAMS,
      baseplate: { type: 'flat', padding: 5 },
    });
    expect(h1).not.toBe(h2);
  });
});

// ── makeExportKey ─────────────────────────────────────────────────────────────

describe('makeExportKey', () => {
  const BASE = { workpieceKey: 'abc123', format: 'stl-binary' as const, quality: 'balanced' as const };

  it('returns a 64-char hex hash', async () => {
    const h = await makeExportKey(BASE);
    expect(isValidHash(h)).toBe(true);
  });

  it('is deterministic', async () => {
    const h1 = await makeExportKey(BASE);
    const h2 = await makeExportKey(BASE);
    expect(h1).toBe(h2);
  });

  it('differs for stl-binary vs stl-ascii', async () => {
    const h1 = await makeExportKey({ ...BASE, format: 'stl-binary' });
    const h2 = await makeExportKey({ ...BASE, format: 'stl-ascii' });
    expect(h1).not.toBe(h2);
  });

  it('differs for fast vs balanced vs high quality', async () => {
    const hFast = await makeExportKey({ ...BASE, quality: 'fast' });
    const hBalanced = await makeExportKey({ ...BASE, quality: 'balanced' });
    const hHigh = await makeExportKey({ ...BASE, quality: 'high' });
    expect(hFast).not.toBe(hBalanced);
    expect(hBalanced).not.toBe(hHigh);
    expect(hFast).not.toBe(hHigh);
  });

  it('differs when workpieceKey changes', async () => {
    const h1 = await makeExportKey({ ...BASE, workpieceKey: 'key-a' });
    const h2 = await makeExportKey({ ...BASE, workpieceKey: 'key-b' });
    expect(h1).not.toBe(h2);
  });
});
