/**
 * Artifact Key Hashing
 *
 * Deterministic SHA-256 cache keys for heavy compute results.
 * Keys encode only geometry-affecting inputs — not UI state (colors,
 * visibility, preview opacity, debug flags).
 *
 * Cache invalidation strategy:
 *   - Bump PIPELINE_VERSION whenever a worker algorithm or geometry
 *     pipeline changes. This busts every stale key automatically on
 *     the next page load without manual cache clearing.
 *
 * Usage:
 *   const wk = await makeWorkpieceKey({ partKeys, baseplate, supports, holes, cavity });
 *   const buf = await artifactCache.get(wk);   // null = cache miss, run CSG
 *   if (!buf) {
 *     const result = await runExpensiveCSG(...);
 *     await artifactCache.set(wk, result);
 *   }
 */

// ─── Pipeline version ─────────────────────────────────────────────────────────

/**
 * Bump this integer whenever any compute worker algorithm or geometry
 * pipeline changes (e.g. new CSG library, changed heightmap resolution
 * formula, different smoothing defaults).
 *
 * Effect: every existing cache key becomes a miss on next load because
 * PIPELINE_VERSION is embedded in every hash input.
 */
export const PIPELINE_VERSION = 1;

// ─── Stable JSON ──────────────────────────────────────────────────────────────

/**
 * Recursively sort object keys so JSON.stringify is deterministic
 * regardless of property insertion order.
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
      }, {});
  }
  return value;
}

function stableJson(obj: unknown): string {
  return JSON.stringify(sortKeys(obj));
}

// ─── SHA-256 ──────────────────────────────────────────────────────────────────

async function sha256hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Key builders ─────────────────────────────────────────────────────────────

/**
 * Key for a single parsed part geometry.
 *
 * Encodes file identity (name + byte size) and triangle count so that
 * re-importing the same file with different names or a differently
 * parsed result gets a different key. The `partId` (UUID) disambiguates
 * same-file re-imports within a session.
 */
export async function makePartKey(
  partId: string,
  metadata: { name: string; size: number; triangles: number },
): Promise<string> {
  return sha256hex(
    stableJson({
      v: PIPELINE_VERSION,
      t: 'part',
      partId,
      name: metadata.name,
      size: metadata.size,
      triangles: metadata.triangles,
    }),
  );
}

/**
 * Geometry-only subset of CavitySettings.
 * These fields change the output mesh. The excluded fields
 * (showPreview, previewOpacity, debugSmoothingColors) are display-only.
 */
export interface CavityGeometryInputs {
  offsetDistance: number;
  pixelsPerUnit: number;
  rotationXZ: number;
  rotationYZ: number;
  fillHoles: boolean;
  enableDecimation: boolean;
  enableSmoothing: boolean;
  smoothingStrength: number;
  smoothingIterations: number;
  smoothingQuality: boolean;
  csgMinVolume: number;
  csgMinThickness: number;
  csgMinTriangles: number;
}

export interface BaseplateKeyInputs {
  type: string;
  padding?: number;
  height?: number;
  depth?: number;
  sections?: Array<{
    id: string;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }>;
}

export interface WorkpieceKeyParams {
  /**
   * Array of `makePartKey` results — one per imported part.
   * Order does not matter; the array is sorted before hashing.
   */
  partKeys: string[];
  baseplate: BaseplateKeyInputs | null;
  /**
   * All supports as plain objects (AnySupport).
   * Every field is geometric so the entire object is hashed.
   */
  supports: Array<Record<string, unknown>>;
  /**
   * All placed holes as plain objects (PlacedHole).
   */
  holes: Array<Record<string, unknown>>;
  /**
   * Null when cavity has not been applied; non-null after the cavity
   * subtraction step is complete and its result is being cached.
   */
  cavity: CavityGeometryInputs | null;
}

/**
 * Key for the post-cavity workpiece: baseplate + supports + cavity subtracted.
 *
 * This is the most expensive compute result. Cache a hit here and the
 * export step drops from 3–4 minutes to under 5 seconds.
 */
export async function makeWorkpieceKey(params: WorkpieceKeyParams): Promise<string> {
  const { partKeys, baseplate, supports, holes, cavity } = params;
  return sha256hex(
    stableJson({
      v: PIPELINE_VERSION,
      t: 'workpiece',
      // Sort part keys so order of import doesn't affect the hash
      partKeys: [...partKeys].sort(),
      baseplate,
      supports,
      holes,
      cavity,
    }),
  );
}

export interface ExportKeyParams {
  workpieceKey: string;
  /** STL binary (default) or ASCII. Different bytes → different key. */
  format: 'stl-binary' | 'stl-ascii';
  /** Export quality preset affects decimation target triangle count. */
  quality: 'fast' | 'balanced' | 'high';
}

/**
 * Key for a completed export STL.
 * Derived from the workpiece key plus export options that change output bytes.
 */
export async function makeExportKey(params: ExportKeyParams): Promise<string> {
  return sha256hex(stableJson({ v: PIPELINE_VERSION, t: 'export', ...params }));
}
