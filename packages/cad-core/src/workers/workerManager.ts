/**
 * Worker Manager
 *
 * Manages three persistent web worker pools: CSG, clamp CSG, hole CSG.
 *
 * Geometry transfer strategy — two modes:
 *
 *   CLONE mode  (extractGeometryForWorker, serializeGeometryForClamp/HoleWorker)
 *     Used when the source geometry is still live in the THREE.js scene and will
 *     continue to be rendered after the worker call (design phase: support trim,
 *     clamp CSG, hole CSG). new Float32Array(src.array) copies bytes; both the
 *     scene and the worker have valid data simultaneously.
 *
 *   TRANSFER mode  (performRealCSGUnionInWorker)
 *     Used on the export path only. The geometries sent here are ephemeral copies
 *     built by exportService — they are NOT rendered after this call. Transferring
 *     the underlying ArrayBuffer moves ownership to the worker with zero allocation.
 *     After postMessage the main-thread views are neutered (byteLength === 0).
 *     On a 100 MB model this cuts peak memory from ~200 MB to ~100 MB.
 *
 * Worker crash recovery:
 *   All onerror handlers null the worker reference so the next getXxxWorker()
 *   call spawns a fresh instance instead of silently reusing a dead one.
 */

import type { CSGWorkerInput, CSGWorkerOutput } from './csgWorker';
import CsgWorker from './csgWorker?worker';
import ClampCSGWorker from './clampCSGWorker?worker';
import HoleCSGWorker from './holeCSGWorker?worker';

// Worker pool for CSG operations
let csgWorker: Worker | null = null;
const csgWorkerPromises: Map<string, {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  onProgress?: (current: number, total: number, stage: string) => void;
  needsReconstruction?: boolean; // Whether to reconstruct geometry from raw data
}> = new Map();

/**
 * Get or create the CSG worker
 */
function getCSGWorker(): Worker {
  if (!csgWorker) {
    csgWorker = new CsgWorker();

    csgWorker.onmessage = (e: MessageEvent<CSGWorkerOutput>) => {
      const { type, id, data, batchData, error, progress } = e.data;
      const promise = csgWorkerPromises.get(id);

      if (!promise) return;

      if (type === 'error') {
        promise.reject(new Error(error));
        csgWorkerPromises.delete(id);
      } else if (type === 'progress' && progress && promise.onProgress) {
        // Handle progress updates
        promise.onProgress(progress.current, progress.total, progress.stage);
      } else if (type === 'subtraction-result' || type === 'batch-result' || type === 'union-result') {
        // For union-result, reconstruct geometry if needed
        if (type === 'union-result' && promise.needsReconstruction && data) {
          const geometry = reconstructGeometry({
            positions: data.positions,
            normals: data.normals,
            indices: data.indices
          });
          if (!geometry.getAttribute('normal')) {
            geometry.computeVertexNormals();
          }
          promise.resolve(geometry);
        } else {
          promise.resolve(data || batchData);
        }
        csgWorkerPromises.delete(id);
      } else if (type === 'progress') {
        // Progress updates are handled separately via callbacks
      }
    };

    csgWorker.onerror = (error) => {
      console.error('[CSGWorker] Crashed:', error);
      csgWorkerPromises.forEach((promise) => promise.reject(error));
      csgWorkerPromises.clear();
      // Null out so getCSGWorker() spawns a fresh instance on the next call.
      // Without this, every subsequent job silently uses the dead worker.
      csgWorker = null;
    };
  }

  return csgWorker;
}

/**
 * Generate unique ID for worker requests
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Extract geometry data for transfer to a worker — CLONE mode.
 *
 * Intentional copies: this is called on the design path (support trim,
 * batch subtraction) where the source geometry is still live in the scene
 * and must remain valid after the worker call. Do NOT change to transfer
 * mode here — it would neuter the scene geometry and corrupt rendering.
 *
 * For the export path use performRealCSGUnionInWorker (transfer mode).
 */
export function extractGeometryForWorker(geometry: THREE.BufferGeometry): {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
} {
  const posAttr  = geometry.getAttribute('position');
  const normAttr = geometry.getAttribute('normal');
  const indexAttr = geometry.index;

  // Intentional clones — source geometry stays alive in the scene.
  const positions = new Float32Array(posAttr.array);
  const normals   = normAttr ? new Float32Array(normAttr.array) : new Float32Array(0);
  const indices   = indexAttr ? new Uint32Array(indexAttr.array) : new Uint32Array(0);

  return { positions, normals, indices };
}

/**
 * Reconstruct geometry from worker result
 */
export function reconstructGeometry(data: {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));

  if (data.normals.length > 0) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  }

  if (data.indices.length > 0) {
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

/**
 * Perform batch CSG subtraction in a web worker
 */
export async function performBatchCSGSubtractionInWorker(
  supports: Array<{
    id: string;
    geometry: THREE.BufferGeometry;
  }>,
  cutterGeometry: THREE.BufferGeometry,
  onProgress?: (current: number, total: number, supportId: string, stage?: string) => void
): Promise<Map<string, THREE.BufferGeometry>> {
  const worker = getCSGWorker();
  const id = generateId();

  // Prepare data for transfer
  const supportsData = supports.map(s => ({
    id: s.id,
    ...extractGeometryForWorker(s.geometry)
  }));

  const cutterData = extractGeometryForWorker(cutterGeometry);

  // Set up progress handler
  const progressHandler = (e: MessageEvent<CSGWorkerOutput>) => {
    if (e.data.id === id && e.data.type === 'progress' && e.data.progress && onProgress) {
      onProgress(
        e.data.progress.current,
        e.data.progress.total,
        e.data.progress.supportId || '',
        'csg' // Stage: CSG operations in worker
      );
    }
  };

  worker.addEventListener('message', progressHandler);

  return new Promise((resolve, reject) => {
    csgWorkerPromises.set(id, {
      resolve: (batchData: CSGWorkerOutput['batchData']) => {
        worker.removeEventListener('message', progressHandler);

        const resultMap = new Map<string, THREE.BufferGeometry>();

        if (batchData) {
          const total = batchData.length;
          for (let i = 0; i < batchData.length; i++) {
            const result = batchData[i];
            // Report reconstruction progress
            if (onProgress) {
              onProgress(i + 1, total, result.supportId, 'reconstruct');
            }

            if (result.success && result.positions && result.normals && result.indices) {
              const geometry = reconstructGeometry({
                positions: result.positions,
                normals: result.normals,
                indices: result.indices
              });
              resultMap.set(result.supportId, geometry);
            } else if (!result.success) {
              // Log the error for debugging
              console.warn(`[CSGWorker] Failed to process support ${result.supportId}: ${result.error}`);
            }
          }
        }

        resolve(resultMap);
      },
      reject: (error) => {
        worker.removeEventListener('message', progressHandler);
        reject(error);
      }
    });

    // Collect transferable buffers
    const transferables: Transferable[] = [];
    supportsData.forEach(s => {
      transferables.push(s.positions.buffer as ArrayBuffer);
      transferables.push(s.normals.buffer as ArrayBuffer);
      transferables.push(s.indices.buffer as ArrayBuffer);
    });
    transferables.push(cutterData.positions.buffer as ArrayBuffer);
    transferables.push(cutterData.normals.buffer as ArrayBuffer);
    transferables.push(cutterData.indices.buffer as ArrayBuffer);

    // Send message to worker
    worker.postMessage(
      {
        type: 'subtract-batch',
        id,
        data: {
          supports: supportsData,
          cutter: cutterData
        }
      } as CSGWorkerInput,
      transferables
    );
  });
}

/**
 * Perform single CSG subtraction in a web worker
 */
export async function performCSGSubtractionInWorker(
  supportGeometry: THREE.BufferGeometry,
  cutterGeometry: THREE.BufferGeometry,
  supportId?: string
): Promise<THREE.BufferGeometry | null> {
  const worker = getCSGWorker();
  const id = generateId();

  const supportData = extractGeometryForWorker(supportGeometry);
  const cutterData = extractGeometryForWorker(cutterGeometry);

  return new Promise((resolve, reject) => {
    csgWorkerPromises.set(id, {
      resolve: (data: CSGWorkerOutput['data']) => {
        if (data && data.positions && data.normals && data.indices) {
          const geometry = reconstructGeometry({
            positions: data.positions,
            normals: data.normals,
            indices: data.indices
          });
          resolve(geometry);
        } else {
          resolve(null);
        }
      },
      reject
    });

    // Collect transferable buffers
    const transferables: Transferable[] = [
      supportData.positions.buffer as ArrayBuffer,
      supportData.normals.buffer as ArrayBuffer,
      supportData.indices.buffer as ArrayBuffer,
      cutterData.positions.buffer as ArrayBuffer,
      cutterData.normals.buffer as ArrayBuffer,
      cutterData.indices.buffer as ArrayBuffer
    ];

    // Send message to worker
    worker.postMessage(
      {
        type: 'subtract-single',
        id,
        data: {
          supportGeometry: supportData,
          cutterGeometry: cutterData,
          supportId
        }
      } as CSGWorkerInput,
      transferables
    );
  });
}

/**
 * Perform batch CSG union in a web worker (combine multiple geometries into one)
 */
export async function performBatchCSGUnionInWorker(
  geometries: Array<{
    id: string;
    geometry: THREE.BufferGeometry;
  }>,
  baseplateGeometry?: THREE.BufferGeometry,
  onProgress?: (current: number, total: number, stage: string) => void
): Promise<THREE.BufferGeometry | null> {
  const worker = getCSGWorker();
  const id = generateId();

  const geometriesData = geometries.map(g => ({ id: g.id, ...extractGeometryForWorker(g.geometry) }));
  const baseplateData = baseplateGeometry ? extractGeometryForWorker(baseplateGeometry) : undefined;

  // Set up progress handler
  const progressHandler = (e: MessageEvent<CSGWorkerOutput>) => {
    if (e.data.id === id && e.data.type === 'progress' && e.data.progress && onProgress) {
      onProgress(
        e.data.progress.current,
        e.data.progress.total,
        e.data.progress.stage || ''
      );
    }
  };

  worker.addEventListener('message', progressHandler);

  return new Promise((resolve, reject) => {
    csgWorkerPromises.set(id, {
      resolve: (data: CSGWorkerOutput['data']) => {
        worker.removeEventListener('message', progressHandler);

        if (data && data.positions && data.normals && data.indices) {
          const geometry = reconstructGeometry({
            positions: data.positions,
            normals: data.normals,
            indices: data.indices
          });
          resolve(geometry);
        } else {
          resolve(null);
        }
      },
      reject: (error) => {
        worker.removeEventListener('message', progressHandler);
        reject(error);
      }
    });

    // Collect transferable buffers
    const transferables: Transferable[] = [];
    geometriesData.forEach(g => {
      transferables.push(g.positions.buffer as ArrayBuffer);
      transferables.push(g.normals.buffer as ArrayBuffer);
      transferables.push(g.indices.buffer as ArrayBuffer);
    });
    if (baseplateData) {
      transferables.push(baseplateData.positions.buffer as ArrayBuffer);
      transferables.push(baseplateData.normals.buffer as ArrayBuffer);
      transferables.push(baseplateData.indices.buffer as ArrayBuffer);
    }

    // Send message to worker
    worker.postMessage(
      {
        type: 'union-batch',
        id,
        data: {
          supports: geometriesData,
          cutter: baseplateData
        }
      } as CSGWorkerInput,
      transferables
    );
  });
}

/**
 * Perform REAL CSG union of multiple geometries using three-bvh-csg ADDITION.
 * Unlike performBatchCSGUnionInWorker which just concatenates buffers,
 * this performs proper boolean union that removes internal faces at intersections.
 * This is slower but produces manifold geometry suitable for 3D printing/export.
 */
export function performRealCSGUnionInWorker(
  geometries: Array<{ id: string; geometry: THREE.BufferGeometry }>,
  baseplateGeometry?: THREE.BufferGeometry,
  onProgress?: (current: number, total: number, stage: string) => void
): Promise<THREE.BufferGeometry | null> {
  return new Promise((resolve, reject) => {
    const id = `csg-real-union-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    // Get or create worker
    const worker = getCSGWorker();

    // Store promise handlers with needsReconstruction flag for union results
    csgWorkerPromises.set(id, { resolve, reject, onProgress, needsReconstruction: true });

    // Convert geometries to transferable format
    const geometriesData: Array<{
      id: string;
      positions: Float32Array;
      normals: Float32Array;
      indices: Uint32Array | null;
    }> = [];
    const transferables: Transferable[] = [];

    // TRANSFER MODE — export path only.
    // Geometries here are ephemeral copies built by exportService; the main
    // thread does not render them after this call. We grab direct references
    // (no copy) and transfer their ArrayBuffers to the worker.
    // Indices: Uint16→Uint32 conversion is kept because the worker expects Uint32.
    // Positions & normals: direct reference — saves ~2× peak memory on large models.
    for (const { id: geomId, geometry } of geometries) {
      const positionAttr = geometry.getAttribute('position');
      const normalAttr   = geometry.getAttribute('normal');
      const indexAttr    = geometry.index;

      if (!positionAttr || !normalAttr) {
        console.warn(`[WorkerManager] Geometry ${geomId} missing position or normal — skipping`);
        continue;
      }

      // Direct references — no allocation.
      const positions = positionAttr.array as Float32Array;
      const normals   = normalAttr.array  as Float32Array;
      // Indices may be Uint16 in older THREE.js geometries; worker expects Uint32.
      const indices = indexAttr
        ? (indexAttr.array instanceof Uint32Array
            ? indexAttr.array
            : new Uint32Array(indexAttr.array))
        : null;

      geometriesData.push({ id: geomId, positions, normals, indices });

      transferables.push(positions.buffer, normals.buffer);
      if (indices) transferables.push(indices.buffer);
    }

    // Convert baseplate geometry if provided — same transfer strategy.
    let baseplateData: {
      positions: Float32Array;
      normals: Float32Array;
      indices: Uint32Array | null;
    } | undefined;

    if (baseplateGeometry) {
      const positionAttr = baseplateGeometry.getAttribute('position');
      const normalAttr   = baseplateGeometry.getAttribute('normal');
      const indexAttr    = baseplateGeometry.index;

      if (positionAttr && normalAttr) {
        const positions = positionAttr.array as Float32Array;
        const normals   = normalAttr.array  as Float32Array;
        const indices   = indexAttr
          ? (indexAttr.array instanceof Uint32Array
              ? indexAttr.array
              : new Uint32Array(indexAttr.array))
          : null;

        baseplateData = { positions, normals, indices };

        transferables.push(positions.buffer, normals.buffer);
        if (indices) transferables.push(indices.buffer);
      }
    }

    if (geometriesData.length === 0 && !baseplateData) {
      resolve(null);
      return;
    }

    // Send message to worker - use the NEW 'csg-union-batch' type for real CSG union
    worker.postMessage(
      {
        type: 'csg-union-batch',
        id,
        data: {
          supports: geometriesData,
          cutter: baseplateData
        }
      } as CSGWorkerInput,
      transferables
    );
  });
}

/**
 * Terminate all workers and clean up
 * Should be called on session reset to free memory
 */
export function terminateWorkers(): void {
  if (csgWorker) {
    csgWorker.terminate();
    csgWorker = null;
    csgWorkerPromises.clear();
  }
  if (clampCSGWorker) {
    clampCSGWorker.terminate();
    clampCSGWorker = null;
    clampCSGWorkerPromises.clear();
  }
  if (holeCSGWorker) {
    holeCSGWorker.terminate();
    holeCSGWorker = null;
    holeCSGWorkerPromises.clear();
  }
  console.log('[WorkerManager] All workers terminated');
}

// ============================================
// Clamp CSG Worker
// ============================================

// Worker pool for clamp CSG operations
let clampCSGWorker: Worker | null = null;
const clampCSGWorkerPromises: Map<string, {
  resolve: (value: THREE.BufferGeometry | null) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: number) => void;
}> = new Map();

/**
 * Get or create the clamp CSG worker
 */
function getClampCSGWorker(): Worker {
  if (!clampCSGWorker) {
    clampCSGWorker = new ClampCSGWorker();

    clampCSGWorker.onmessage = (e: MessageEvent) => {
      const { type, id, payload, progress, error } = e.data;
      const promise = clampCSGWorkerPromises.get(id);

      if (!promise) return;

      if (type === 'csg-error') {
        promise.reject(new Error(error));
        clampCSGWorkerPromises.delete(id);
      } else if (type === 'csg-progress' && promise.onProgress) {
        promise.onProgress(progress);
      } else if (type === 'csg-result') {
        if (payload) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(payload.positions, 3));

          if (payload.indices) {
            geometry.setIndex(new THREE.BufferAttribute(payload.indices, 1));
          }

          if (payload.normals) {
            geometry.setAttribute('normal', new THREE.BufferAttribute(payload.normals, 3));
          } else {
            geometry.computeVertexNormals();
          }

          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();

          promise.resolve(geometry);
        } else {
          promise.resolve(null);
        }
        clampCSGWorkerPromises.delete(id);
      }
    };

    clampCSGWorker.onerror = (error) => {
      console.error('[ClampCSGWorker] Crashed:', error);
      clampCSGWorkerPromises.forEach((promise) => promise.reject(new Error('Worker error')));
      clampCSGWorkerPromises.clear();
      clampCSGWorker = null;
    };
  }

  return clampCSGWorker;
}

/**
 * Serialize a BufferGeometry for the clamp CSG worker — CLONE mode.
 *
 * The support/cutout geometry is still live in the scene; cloning ensures
 * the scene mesh remains valid while the worker runs.
 */
export function serializeGeometryForClampWorker(geometry: THREE.BufferGeometry): {
  positions: Float32Array;
  indices?: Uint32Array;
  normals?: Float32Array;
} {
  const posAttr = geometry.getAttribute('position');
  const positions = new Float32Array(posAttr.array);

  const result: { positions: Float32Array; indices?: Uint32Array; normals?: Float32Array } = {
    positions,
  };

  if (geometry.index) {
    result.indices = new Uint32Array(geometry.index.array);
  }

  const normAttr = geometry.getAttribute('normal');
  if (normAttr) {
    result.normals = new Float32Array(normAttr.array);
  }

  return result;
}

/**
 * Perform clamp CSG subtraction in a web worker
 * Used to subtract fixture cutouts from support geometry
 * Note: cutoutsGeometry should already have the Y offset applied
 */
export async function performClampCSGInWorker(
  supportGeometry: THREE.BufferGeometry,
  cutoutsGeometry: THREE.BufferGeometry | null,
  onProgress?: (progress: number) => void
): Promise<THREE.BufferGeometry | null> {
  // If no cutouts, return support geometry as-is (no worker needed)
  if (!cutoutsGeometry) {
    return supportGeometry.clone();
  }

  const worker = getClampCSGWorker();
  const id = generateId();

  const supportData = serializeGeometryForClampWorker(supportGeometry);
  const cutoutsData = serializeGeometryForClampWorker(cutoutsGeometry);

  return new Promise((resolve, reject) => {
    clampCSGWorkerPromises.set(id, {
      resolve,
      reject,
      onProgress,
    });

    // Collect transferable buffers
    const transferables: Transferable[] = [
      supportData.positions.buffer,
    ];
    if (supportData.indices) {
      transferables.push(supportData.indices.buffer);
    }
    if (supportData.normals) {
      transferables.push(supportData.normals.buffer);
    }

    transferables.push(cutoutsData.positions.buffer);
    if (cutoutsData.indices) {
      transferables.push(cutoutsData.indices.buffer);
    }
    if (cutoutsData.normals) {
      transferables.push(cutoutsData.normals.buffer);
    }

    // Send message to worker
    worker.postMessage(
      {
        type: 'compute-csg',
        id,
        payload: {
          supportGeometryData: supportData,
          cutoutsGeometryData: cutoutsData,
        },
      },
      transferables
    );
  });
}

// ============================================
// Hole CSG Worker
// For subtracting mounting holes from baseplate
// ============================================

let holeCSGWorker: Worker | null = null;
const holeCSGWorkerPromises: Map<string, {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  onProgress?: (progress: number) => void;
}> = new Map();

/**
 * Get or create the hole CSG worker
 */
function getHoleCSGWorker(): Worker {
  if (!holeCSGWorker) {
    holeCSGWorker = new HoleCSGWorker();

    holeCSGWorker.onmessage = (e: MessageEvent) => {
      const { type, id, payload, progress, error } = e.data;
      const promise = holeCSGWorkerPromises.get(id);

      if (!promise) return;

      if (type === 'hole-csg-error') {
        promise.reject(new Error(error));
        holeCSGWorkerPromises.delete(id);
      } else if (type === 'hole-csg-progress') {
        promise.onProgress?.(progress);
      } else if (type === 'hole-csg-result') {
        // Reconstruct geometry from result
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(payload.positions, 3));
        if (payload.indices) {
          geometry.setIndex(new THREE.BufferAttribute(payload.indices, 1));
        }
        if (payload.normals) {
          geometry.setAttribute('normal', new THREE.BufferAttribute(payload.normals, 3));
        } else {
          geometry.computeVertexNormals();
        }
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        promise.resolve(geometry);
        holeCSGWorkerPromises.delete(id);
      }
    };

    holeCSGWorker.onerror = (error) => {
      console.error('[HoleCSGWorker] Crashed:', error);
      holeCSGWorkerPromises.forEach((promise) => promise.reject(error));
      holeCSGWorkerPromises.clear();
      holeCSGWorker = null;
    };
  }

  return holeCSGWorker;
}

/**
 * Serialize geometry for the hole CSG worker — CLONE mode.
 *
 * The baseplate is still rendered on-screen during hole subtraction; cloning
 * keeps the scene geometry intact while the worker processes the operation.
 */
function serializeGeometryForHoleWorker(geometry: THREE.BufferGeometry): {
  positions: Float32Array;
  indices?: Uint32Array;
  normals?: Float32Array;
} {
  const positions = geometry.getAttribute('position').array as Float32Array;
  const result: {
    positions: Float32Array;
    indices?: Uint32Array;
    normals?: Float32Array;
  } = {
    positions: new Float32Array(positions),
  };

  if (geometry.index) {
    result.indices = new Uint32Array(geometry.index.array);
  }

  const normals = geometry.getAttribute('normal');
  if (normals) {
    result.normals = new Float32Array(normals.array as Float32Array);
  }

  return result;
}

/**
 * Perform hole CSG subtraction in a web worker
 * Subtracts hole geometry from baseplate geometry
 */
export async function performHoleCSGInWorker(
  baseplateGeometry: THREE.BufferGeometry,
  holesGeometry: THREE.BufferGeometry,
  onProgress?: (progress: number) => void
): Promise<THREE.BufferGeometry | null> {
  const worker = getHoleCSGWorker();
  const id = generateId();

  const baseplateData = serializeGeometryForHoleWorker(baseplateGeometry);
  const holesData = serializeGeometryForHoleWorker(holesGeometry);

  return new Promise((resolve, reject) => {
    holeCSGWorkerPromises.set(id, {
      resolve,
      reject,
      onProgress,
    });

    // Collect transferable buffers
    const transferables: Transferable[] = [
      baseplateData.positions.buffer,
    ];
    if (baseplateData.indices) {
      transferables.push(baseplateData.indices.buffer);
    }
    if (baseplateData.normals) {
      transferables.push(baseplateData.normals.buffer);
    }

    transferables.push(holesData.positions.buffer);
    if (holesData.indices) {
      transferables.push(holesData.indices.buffer);
    }
    if (holesData.normals) {
      transferables.push(holesData.normals.buffer);
    }

    // Send message to worker
    worker.postMessage(
      {
        type: 'subtract-holes',
        id,
        payload: {
          baseplateGeometryData: baseplateData,
          holesGeometryData: holesData,
        },
      },
      transferables
    );
  });
}

/**
 * Terminate the hole CSG worker (cleanup)
 */
export function terminateHoleCSGWorker(): void {
  if (holeCSGWorker) {
    holeCSGWorker.terminate();
    holeCSGWorker = null;
    holeCSGWorkerPromises.clear();
  }
}

// Need to import THREE for type definitions
import * as THREE from 'three';
