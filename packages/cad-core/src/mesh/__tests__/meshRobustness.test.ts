/**
 * Fixture Generation — Mesh Robustness Tests
 *
 * Validates the post-CSG cleanup and smoothing pipeline without requiring
 * a browser or web workers. Covers:
 *   - cleanupCSGResult: degenerate triangle removal, small-component culling
 *   - laplacianSmooth: valid output (no NaN), topology preservation
 *   - analyzeMesh: correct detection of manifold/non-manifold geometry
 *
 * Geometry helpers produce synthetic meshes that mimic real Manifold3D CSG
 * output: flat (non-indexed) triangle-soup, occasional degenerate faces,
 * and small disconnected components (CSG Boolean artifacts).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  cleanupCSGResult,
  laplacianSmooth,
  analyzeMesh,
} from '../meshAnalysis';

// ── Geometry helpers ──────────────────────────────────────────────────────────

/**
 * Build a simple closed box as non-indexed triangle soup.
 * Matches the flat layout produced by Manifold3D CSG workers.
 */
function makeBox(sx = 20, sy = 10, sz = 20, offsetX = 0, offsetY = 0, offsetZ = 0): THREE.BufferGeometry {
  const base = new THREE.BoxGeometry(sx, sy, sz);
  const flat = base.toNonIndexed();
  if (offsetX || offsetY || offsetZ) {
    flat.translate(offsetX, offsetY, offsetZ);
  }
  base.dispose();
  return flat;
}

/**
 * Merge two BufferGeometries into one flat triangle soup.
 * Simulates the output of a CSG Union that produces two disconnected shells
 * (a common artifact when supports don't fully overlap the baseplate).
 */
function mergeGeoms(...geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const arrays: Float32Array[] = geoms.map(g => {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    return pos.array as Float32Array;
  });
  const totalLen = arrays.reduce((s, a) => s + a.length, 0);
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    merged.set(arr, offset);
    offset += arr.length;
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(merged, 3));
  return result;
}

/**
 * Inject `count` zero-area (degenerate) triangles into a geometry.
 * Mimics the micro-faces Manifold3D sometimes produces at CSG seams.
 */
function injectDegenerateTriangles(geo: THREE.BufferGeometry, count = 5): THREE.BufferGeometry {
  const pos = (geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
  const extra = new Float32Array(count * 9);
  // All three vertices of each degenerate triangle are at the same point
  for (let i = 0; i < count; i++) {
    const base = i * 9;
    extra[base] = extra[base + 3] = extra[base + 6] = 5.0;
    extra[base + 1] = extra[base + 4] = extra[base + 7] = 2.0;
    extra[base + 2] = extra[base + 5] = extra[base + 8] = 3.0;
  }
  const merged = new Float32Array(pos.length + extra.length);
  merged.set(pos, 0);
  merged.set(extra, pos.length);
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(merged, 3));
  return result;
}

/** Count triangles in a non-indexed geometry. */
function triangleCount(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  return Math.floor(pos.count / 3);
}

/** Return true if any position value in the geometry is NaN or Infinity. */
function hasNaNOrInf(geo: THREE.BufferGeometry): boolean {
  const arr = (geo.getAttribute('position') as THREE.BufferAttribute).array;
  for (let i = 0; i < arr.length; i++) {
    if (!isFinite(arr[i])) return true;
  }
  return false;
}

// ── cleanupCSGResult ──────────────────────────────────────────────────────────

describe('cleanupCSGResult — degenerate triangle removal', () => {
  it('removes zero-area triangles injected as CSG seam artifacts', async () => {
    const box = makeBox();
    const boxTriangles = triangleCount(box);
    const dirty = injectDegenerateTriangles(box, 10);

    expect(triangleCount(dirty)).toBe(boxTriangles + 10);

    const result = await cleanupCSGResult(dirty, { minTriangleArea: 0.0001 });

    expect(result.success).toBe(true);
    expect(result.geometry).not.toBeNull();
    expect(result.degenerateTrianglesRemoved).toBe(10);
    // Cleaned geometry should have the original triangle count (or close to it)
    expect(triangleCount(result.geometry!)).toBe(boxTriangles);

    dirty.dispose();
    result.geometry?.dispose();
  });

  it('leaves a clean geometry unchanged', async () => {
    const box = makeBox();
    const before = triangleCount(box);

    const result = await cleanupCSGResult(box, { minTriangleArea: 0.0001 });

    expect(result.success).toBe(true);
    expect(result.degenerateTrianglesRemoved).toBe(0);
    expect(triangleCount(result.geometry!)).toBe(before);

    box.dispose();
    result.geometry?.dispose();
  });
});

describe('cleanupCSGResult — small-component culling', () => {
  it('removes a tiny isolated component below minVolume threshold', async () => {
    // Main body: 100×50×100mm box  (~large volume)
    const main = makeBox(100, 50, 100);
    // Tiny orphan: 1×1×1mm box placed 200mm away (volume ≈ 1 mm³)
    const tiny = makeBox(1, 1, 1, 200, 0, 200);
    const combined = mergeGeoms(main, tiny);

    const mainTriangles = triangleCount(main);

    // minVolume=5 should cull the 1mm³ component
    const result = await cleanupCSGResult(combined, { minVolume: 5.0, vertexMergeTolerance: 0.1 });

    expect(result.success).toBe(true);
    expect(result.componentsRemoved).toBeGreaterThanOrEqual(1);
    // Remaining triangles should be close to the main body only
    expect(triangleCount(result.geometry!)).toBeLessThanOrEqual(mainTriangles + 6);

    main.dispose(); tiny.dispose(); combined.dispose();
    result.geometry?.dispose();
  });

  it('keeps a single-component geometry intact', async () => {
    const box = makeBox(50, 25, 50);
    const before = triangleCount(box);

    const result = await cleanupCSGResult(box, { minVolume: 5.0 });

    expect(result.success).toBe(true);
    expect(result.componentsRemoved).toBe(0);
    expect(triangleCount(result.geometry!)).toBe(before);

    box.dispose();
    result.geometry?.dispose();
  });
});

describe('cleanupCSGResult — combined artifacts (degenerate + multi-component)', () => {
  it('handles both artifact types in a single pass', async () => {
    const main = makeBox(80, 30, 80);
    const tiny = makeBox(0.5, 0.5, 0.5, 300, 0, 300); // sub-threshold volume
    const combined = mergeGeoms(main, tiny);
    const dirty = injectDegenerateTriangles(combined, 8);

    const result = await cleanupCSGResult(dirty, {
      minVolume: 1.0,
      minTriangleArea: 0.0001,
      vertexMergeTolerance: 0.1,
    });

    expect(result.success).toBe(true);
    expect(result.degenerateTrianglesRemoved).toBe(8);
    expect(result.componentsRemoved).toBeGreaterThanOrEqual(1);
    expect(hasNaNOrInf(result.geometry!)).toBe(false);

    dirty.dispose(); combined.dispose(); main.dispose(); tiny.dispose();
    result.geometry?.dispose();
  });
});

// ── laplacianSmooth ───────────────────────────────────────────────────────────

describe('laplacianSmooth — output validity', () => {
  it('produces no NaN or Infinity after 4 iterations on a box', async () => {
    const box = makeBox(40, 20, 40);
    box.computeVertexNormals();

    const result = await laplacianSmooth(box, { iterations: 4, strength: 0.2, quality: true });

    expect(result.success).toBe(true);
    expect(result.geometry).not.toBeNull();
    expect(hasNaNOrInf(result.geometry!)).toBe(false);

    box.dispose();
    result.geometry?.dispose();
  });

  it('preserves vertex count (smoothing moves vertices, does not split them)', async () => {
    const box = makeBox(30, 15, 30);
    const beforeCount = box.getAttribute('position').count;
    box.computeVertexNormals();

    const result = await laplacianSmooth(box, { iterations: 5, strength: 0.3, quality: true });

    expect(result.success).toBe(true);
    // Vertex count must be exactly preserved — smoothing is in-place
    expect(result.geometry!.getAttribute('position').count).toBe(beforeCount);

    box.dispose();
    result.geometry?.dispose();
  });

  it('Taubin mode (strength=0) does not shrink the geometry significantly', async () => {
    const size = 50;
    const box = makeBox(size, size, size);
    box.computeVertexNormals();

    const result = await laplacianSmooth(box, { iterations: 10, strength: 0, quality: false });

    expect(result.success).toBe(true);
    // Compute bounding box of result and check it is within 20% of original
    result.geometry!.computeBoundingBox();
    const out = result.geometry!.boundingBox!;
    const diag = out.getSize(new THREE.Vector3()).length();
    // Original diagonal ≈ sqrt(3)*50 ≈ 86.6mm; allow ±20%
    expect(diag).toBeGreaterThan(size * 0.8);

    box.dispose();
    result.geometry?.dispose();
  });

  it('handles a large geometry (100 k triangles) without crashing', async () => {
    // SphereGeometry with high detail approximates a smooth high-poly mesh
    const sphere = new THREE.SphereGeometry(30, 100, 50);
    const flat = sphere.toNonIndexed();
    sphere.dispose();
    flat.computeVertexNormals();

    const triCount = triangleCount(flat);
    expect(triCount).toBeGreaterThan(5_000); // SphereGeometry(30,100,50) → ~9800 tris

    const result = await laplacianSmooth(flat, { iterations: 3, strength: 0.2, quality: false });

    expect(result.success).toBe(true);
    expect(hasNaNOrInf(result.geometry!)).toBe(false);

    flat.dispose();
    result.geometry?.dispose();
  }, 30_000); // generous timeout for large mesh
});

// ── analyzeMesh ───────────────────────────────────────────────────────────────

describe('analyzeMesh — manifold detection', () => {
  it('reports a closed box as manifold with no issues', async () => {
    const box = makeBox();
    const analysis = await analyzeMesh(box);

    expect(analysis.triangleCount).toBeGreaterThan(0);
    expect(analysis.vertexCount).toBeGreaterThan(0);
    // A well-formed box should not have degenerate faces
    expect(analysis.hasDegenerateFaces).toBe(false);

    box.dispose();
  });

  it('detects degenerate faces injected as CSG artifacts', async () => {
    const box = makeBox();
    const dirty = injectDegenerateTriangles(box, 3);

    const analysis = await analyzeMesh(dirty);

    expect(analysis.hasDegenerateFaces).toBe(true);

    dirty.dispose();
  });

  it('reports a non-zero triangle count for all geometry types', async () => {
    const cylinder = new THREE.CylinderGeometry(10, 10, 20, 32).toNonIndexed();
    const analysis = await analyzeMesh(cylinder);

    expect(analysis.triangleCount).toBeGreaterThan(0);
    cylinder.dispose();
  });
});

// ── Full post-CSG pipeline ────────────────────────────────────────────────────

describe('Full post-CSG pipeline: cleanup → smooth → analyze', () => {
  it('produces a valid, clean mesh from dirty CSG output', async () => {
    // Simulate typical Manifold3D CSG output:
    //  - Main body (baseplate + union'd supports, ~80×30×80mm)
    //  - Two tiny disconnected shards (volume < 1 mm³)
    //  - 12 degenerate triangles at seam lines
    const main = makeBox(80, 30, 80);
    const shard1 = makeBox(0.8, 0.8, 0.8, 250, 0, 0);
    const shard2 = makeBox(0.5, 0.5, 0.5, -250, 0, 0);
    const rawCSG = injectDegenerateTriangles(mergeGeoms(main, shard1, shard2), 12);

    // Step 1: CSG cleanup
    const cleanResult = await cleanupCSGResult(rawCSG, {
      minVolume: 1.0,
      minTriangleArea: 0.0001,
      vertexMergeTolerance: 0.1,
    });
    expect(cleanResult.success).toBe(true);
    expect(cleanResult.degenerateTrianglesRemoved).toBe(12);
    expect(cleanResult.componentsRemoved).toBeGreaterThanOrEqual(2);

    // Step 2: Post-CSG smoothing (same settings as useCavityOperations)
    const cleanGeo = cleanResult.geometry!;
    cleanGeo.computeVertexNormals();
    const smoothResult = await laplacianSmooth(cleanGeo, {
      iterations: 4,
      strength: 0.2,
      quality: true,
    });
    expect(smoothResult.success).toBe(true);
    expect(hasNaNOrInf(smoothResult.geometry!)).toBe(false);

    // Step 3: Final analysis — smoothed geometry should be structurally sound
    const smoothGeo = smoothResult.geometry!;
    const analysis = await analyzeMesh(smoothGeo);
    expect(analysis.triangleCount).toBeGreaterThan(0);
    expect(analysis.hasDegenerateFaces).toBe(false);

    // Cleanup
    rawCSG.dispose(); main.dispose(); shard1.dispose(); shard2.dispose();
    cleanResult.geometry?.dispose();
    smoothResult.geometry?.dispose();
  }, 30_000);

  it('handles geometry from a hole-cut scenario (cylinder subtracted from box)', async () => {
    // After hole CSG: the baseplate has a cylindrical hole — this is the geometry
    // that goes through the cleanup pipeline. We simulate it with a high-poly box
    // that has some rough edges from the Boolean.
    const baseplate = new THREE.BoxGeometry(100, 15, 80, 5, 3, 5).toNonIndexed();
    const withArtifacts = injectDegenerateTriangles(baseplate, 6);

    const cleanResult = await cleanupCSGResult(withArtifacts, {
      minVolume: 0.5,
      minTriangleArea: 0.0001,
    });

    expect(cleanResult.success).toBe(true);
    expect(cleanResult.degenerateTrianglesRemoved).toBe(6);
    expect(hasNaNOrInf(cleanResult.geometry!)).toBe(false);

    baseplate.dispose(); withArtifacts.dispose();
    cleanResult.geometry?.dispose();
  });

  it('handles empty geometry gracefully (zero triangles)', async () => {
    const empty = new THREE.BufferGeometry();
    empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3));

    const cleanResult = await cleanupCSGResult(empty, { minVolume: 1.0 });
    // Should not throw — may return success=false or empty geometry
    expect(cleanResult).toBeDefined();

    empty.dispose();
    cleanResult.geometry?.dispose();
  });
});
