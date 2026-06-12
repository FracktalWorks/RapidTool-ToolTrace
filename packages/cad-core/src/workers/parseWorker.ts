/// <reference lib="webworker" />
/**
 * parseWorker — STL Parse Worker
 *
 * Runs in a dedicated worker thread. No DOM access. No THREE.js.
 * All operations use pure TypedArray math so no allocation overhead
 * from THREE.js wrappers, and the worker bundle stays small.
 *
 * Full pipeline (all off main thread):
 *   1. Format detect (binary size heuristic vs ASCII "solid" header)
 *   2. Parse → flat Float32Array of positions (triangleCount × 3 vertices × 3 floats)
 *   3. Z→Y coordinate rotation  (STL is Z-up; THREE.js is Y-up)
 *      rotateX(-π/2):  (x, y, z) → (x, z, -y)
 *   4. Vertex weld (P2-02) — deduplicate shared corners, produce indexed geometry
 *      Result: unique positions Float32Array + Uint32Array indices
 *      30–60% memory reduction vs flat unindexed representation
 *   5. Smooth vertex normals — recomputed from indexed geometry, area-weighted
 *      Flat STL face normals are discarded (often low quality from old CAD tools)
 *   6. Transfer positions, normals, indices back to main thread (zero-copy)
 *
 * Message protocol:
 *   IN  → { type: 'parse', id, buffer: ArrayBuffer, filename: string }
 *   OUT → { type: 'parse-complete', id, positions, normals, indices, triangleCount, format }
 *       → { type: 'parse-error',    id, error: string }
 *       → { type: 'parse-progress', id, stage: string, pct: number }
 *
 * CANONICAL LOCATION: packages/cad-core/src/workers/parseWorker.ts
 * Do NOT add THREE.js imports here — they would pull in DOM shims.
 * Do NOT add geometry caching here — that belongs in artifactCache.ts.
 */

// ─── Message types ────────────────────────────────────────────────────────────

export interface ParseWorkerInput {
  type: 'parse';
  id: string;
  /** Raw file bytes — transferred (not copied) from the main thread. */
  buffer: ArrayBuffer;
  filename: string;
}

export interface ParseWorkerOutput {
  type: 'parse-complete' | 'parse-error' | 'parse-progress';
  id: string;
  // parse-complete:
  positions?: Float32Array;
  normals?: Float32Array;
  indices?: Uint32Array;
  triangleCount?: number;
  format?: 'binary' | 'ascii';
  // parse-error:
  error?: string;
  // parse-progress:
  stage?: string;
  pct?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STL_HEADER_SIZE        = 80;
const STL_TRIANGLE_SIZE      = 50;  // 12 normal + 36 vertices + 2 attribute
const STL_HEADER_PLUS_COUNT  = 84;  // 80 header + 4 count
/** Quantization resolution for vertex welding: 0.00001 mm = 10 nm. */
const WELD_PRECISION         = 100_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function postProgress(id: string, stage: string, pct: number): void {
  self.postMessage({ type: 'parse-progress', id, stage, pct } as ParseWorkerOutput);
}

// ─── Format detection ─────────────────────────────────────────────────────────

function isBinarySTL(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength <= STL_HEADER_PLUS_COUNT) return false;
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(STL_HEADER_SIZE, true);
  if (triangleCount === 0 || triangleCount > 100_000_000) return false;
  const expected = STL_HEADER_PLUS_COUNT + triangleCount * STL_TRIANGLE_SIZE;
  return Math.abs(expected - buffer.byteLength) < 100;
}

// ─── Binary parser ────────────────────────────────────────────────────────────

/**
 * Parses binary STL → flat positions Float32Array (no normals — we recompute them).
 * Returns triangleCount × 9 floats  (3 vertices × 3 components each).
 */
function parseBinarySTLRaw(buffer: ArrayBuffer): { positions: Float32Array; triangleCount: number } {
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(STL_HEADER_SIZE, true);
  const expected = STL_HEADER_PLUS_COUNT + triangleCount * STL_TRIANGLE_SIZE;

  if (expected > buffer.byteLength) {
    throw new Error(
      `Binary STL truncated: expected ${expected} bytes, got ${buffer.byteLength}`,
    );
  }

  const positions = new Float32Array(triangleCount * 9);
  let src = STL_HEADER_PLUS_COUNT;
  let dst = 0;

  for (let i = 0; i < triangleCount; i++) {
    src += 12; // skip face normal
    for (let j = 0; j < 3; j++) {
      positions[dst++] = view.getFloat32(src,      true);
      positions[dst++] = view.getFloat32(src +  4, true);
      positions[dst++] = view.getFloat32(src +  8, true);
      src += 12;
    }
    src += 2; // skip attribute byte count
  }

  return { positions, triangleCount };
}

// ─── ASCII parser ─────────────────────────────────────────────────────────────

/**
 * Parses ASCII STL → flat positions Float32Array (normals discarded).
 */
function parseASCIISTLRaw(buffer: ArrayBuffer): { positions: Float32Array; triangleCount: number } {
  const text = new TextDecoder().decode(buffer);

  const vertexPattern =
    /vertex\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/gi;

  const matches = [...text.matchAll(vertexPattern)];
  const triangleCount = Math.floor(matches.length / 3);

  if (matches.length !== triangleCount * 3) {
    throw new Error(
      `ASCII STL vertex count ${matches.length} is not a multiple of 3`,
    );
  }

  const positions = new Float32Array(triangleCount * 9);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    positions[i * 3]     = parseFloat(m[1]) || 0;
    positions[i * 3 + 1] = parseFloat(m[2]) || 0;
    positions[i * 3 + 2] = parseFloat(m[3]) || 0;
  }

  return { positions, triangleCount };
}

// ─── Z→Y rotation ─────────────────────────────────────────────────────────────

/**
 * Applies rotateX(-π/2) in-place: STL Z-up → THREE.js Y-up.
 *
 * Matrix: [[1,0,0],[0,0,1],[0,-1,0]]
 * Per vertex: (x, y, z) → (x, z, -y)
 */
function applyZToYUp(positions: Float32Array): void {
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1];
    const z = positions[i + 2];
    positions[i + 1] =  z;
    positions[i + 2] = -y;
  }
}

// ─── Vertex weld (P2-02) ──────────────────────────────────────────────────────

/**
 * Returns the next power of 2 ≥ n (minimum 16).
 */
function nextPow2(n: number): number {
  let p = 16;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Deduplicates vertex positions and builds an index buffer.
 *
 * Algorithm: open-addressing hash table over quantized integer keys.
 * No string allocations — hash computed with integer multiply + XOR,
 * collisions resolved with linear probing.
 *
 * O(n) average.  ~20× faster than string-keyed Map for large meshes
 * (eliminates all template-string allocation and GC pressure in the hot path).
 *
 * Returns unique positions (may be 30–60% smaller than flat input) +
 * an index array of length == original flat vertex count.
 */
function weldPositions(flat: Float32Array): { positions: Float32Array; indices: Uint32Array } {
  const vertexCount = flat.length / 3;

  // Table size = next power of 2 above 2× vertex count → load ≤ 0.5.
  // Cap at 128 M entries (512 MB) so a pathological file cannot OOM.
  const TABLE_SIZE = nextPow2(Math.min(vertexCount * 2, 128_000_000));
  const MASK       = TABLE_SIZE - 1;

  // hashTable[slot] = unique-vertex index, or -1 if empty.
  const hashTable  = new Int32Array(TABLE_SIZE).fill(-1);

  // Quantized coords per unique vertex — for collision resolution.
  // Interleaved: [qx0, qy0, qz0, qx1, qy1, qz1, …]
  const uniqueKeys = new Int32Array(vertexCount * 3); // worst-case: all unique
  const outPos     = new Float32Array(vertexCount * 3);
  const indices    = new Uint32Array(vertexCount);
  let   uniqueCount = 0;

  for (let i = 0; i < vertexCount; i++) {
    const x = flat[i * 3], y = flat[i * 3 + 1], z = flat[i * 3 + 2];

    // Quantize to integer precision (10 nm resolution).
    const qx = (x * WELD_PRECISION + 0.5) | 0;
    const qy = (y * WELD_PRECISION + 0.5) | 0;
    const qz = (z * WELD_PRECISION + 0.5) | 0;

    // Integer hash — no string allocation.
    let h = (Math.imul(qx, 73856093) ^ Math.imul(qy, 19349663) ^ Math.imul(qz, 83492791)) >>> 0;
    h &= MASK;

    for (;;) {
      const slot = hashTable[h];

      if (slot < 0) {
        // Empty slot → new unique vertex.
        const k         = uniqueCount * 3;
        hashTable[h]    = uniqueCount;
        uniqueKeys[k]   = qx;
        uniqueKeys[k+1] = qy;
        uniqueKeys[k+2] = qz;
        outPos[k]       = x;
        outPos[k+1]     = y;
        outPos[k+2]     = z;
        indices[i]      = uniqueCount++;
        break;
      }

      // Check for match (full key comparison to guard against hash collisions).
      const k = slot * 3;
      if (uniqueKeys[k] === qx && uniqueKeys[k+1] === qy && uniqueKeys[k+2] === qz) {
        indices[i] = slot;
        break;
      }

      h = (h + 1) & MASK; // linear probe
    }
  }

  return {
    // slice() creates a properly-sized copy and allows the oversized outPos
    // buffer to be GC'd while the caller holds only what it needs.
    positions: outPos.slice(0, uniqueCount * 3),
    indices,
  };
}

// ─── Smooth vertex normals ────────────────────────────────────────────────────

/**
 * Computes smooth (Gouraud) vertex normals from indexed geometry.
 *
 * For each triangle we compute the face normal (cross product of two edges,
 * magnitude = 2× triangle area → automatic area weighting).
 * We then accumulate into each of the triangle's three vertices and
 * normalize the sum.  Vertices shared by many triangles get a weighted
 * average of all surrounding face normals.
 */
function computeSmoothNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const vertexCount = positions.length / 3;
  const normals     = new Float32Array(vertexCount * 3); // zero-initialized

  for (let i = 0; i < indices.length; i += 3) {
    const ai = indices[i]     * 3;
    const bi = indices[i + 1] * 3;
    const ci = indices[i + 2] * 3;

    const ax = positions[ai], ay = positions[ai + 1], az = positions[ai + 2];
    const bx = positions[bi], by = positions[bi + 1], bz = positions[bi + 2];
    const cx = positions[ci], cy = positions[ci + 1], cz = positions[ci + 2];

    // Edge vectors b-a and c-a
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const fx = cx - ax, fy = cy - ay, fz = cz - az;

    // Cross product (area-weighted face normal)
    const nx = ey * fz - ez * fy;
    const ny = ez * fx - ex * fz;
    const nz = ex * fy - ey * fx;

    normals[ai] += nx; normals[ai + 1] += ny; normals[ai + 2] += nz;
    normals[bi] += nx; normals[bi + 1] += ny; normals[bi + 2] += nz;
    normals[ci] += nx; normals[ci + 1] += ny; normals[ci + 2] += nz;
  }

  // Normalize
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.sqrt(normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2);
    if (len > 1e-10) {
      normals[i]     /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    }
  }

  return normals;
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<ParseWorkerInput>) => {
  const { type, id, buffer } = e.data;
  if (type !== 'parse') return;

  try {
    // ── 1. Parse ──────────────────────────────────────────────────────────────
    postProgress(id, 'Parsing...', 5);

    let flatPositions: Float32Array;
    let triangleCount: number;
    let format: 'binary' | 'ascii';

    if (isBinarySTL(buffer)) {
      ({ positions: flatPositions, triangleCount } = parseBinarySTLRaw(buffer));
      format = 'binary';
    } else {
      ({ positions: flatPositions, triangleCount } = parseASCIISTLRaw(buffer));
      format = 'ascii';
    }

    if (triangleCount === 0) {
      throw new Error('STL file contains no triangles');
    }

    // ── 2. Z→Y rotation ───────────────────────────────────────────────────────
    postProgress(id, 'Transforming coordinates...', 30);
    applyZToYUp(flatPositions);

    // ── 3. Vertex weld (P2-02) ────────────────────────────────────────────────
    postProgress(id, 'Welding vertices...', 45);
    const { positions, indices } = weldPositions(flatPositions);

    // ── 4. Smooth normals ─────────────────────────────────────────────────────
    postProgress(id, 'Computing normals...', 80);
    const normals = computeSmoothNormals(positions, indices);

    postProgress(id, 'Done', 100);

    // ── 5. Transfer back (zero-copy) ──────────────────────────────────────────
    self.postMessage(
      {
        type: 'parse-complete',
        id,
        positions,
        normals,
        indices,
        triangleCount,
        format,
      } as ParseWorkerOutput,
      [positions.buffer, normals.buffer, indices.buffer],
    );
  } catch (err) {
    self.postMessage({
      type: 'parse-error',
      id,
      error: err instanceof Error ? err.message : String(err),
    } as ParseWorkerOutput);
  }
};
