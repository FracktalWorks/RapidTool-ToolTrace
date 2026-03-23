/**
 * Offset Mesh Processor - Main API
 * High-level API for creating offset meshes from STL geometry
 */

import * as THREE from 'three';
import {
  createOffsetHeightMap,
  loadHeightMapFromTiles,
  cleanupOffscreenResources,
  fillInternalHoles,
} from './offsetHeightmap';
import { createWatertightMeshFromHeightmap } from './meshGenerator';
import { fillMeshHoles, analyzeMeshHoles } from './meshHoleFiller';
import type { OffsetMeshOptions, OffsetMeshResult, HeightmapResult } from './types';

// ============================================
// Constants
// ============================================

const DEGREES_TO_RADIANS = Math.PI / 180;
const BASELINE_YZ_ROTATION = 180;
const MIN_RESOLUTION = 64;
const MAX_RESOLUTION = 16384;

// ============================================
// Progress Stages (percentages)
// ============================================

const PROGRESS = {
  ROTATION: 0,
  HOLE_ANALYSIS: 2,
  HOLE_FILLING: 3,
  RESOLUTION_CALC: 5,
  HEIGHTMAP_START: 10,
  HEIGHTMAP_END: 50,
  LOAD_TILES_START: 50,
  LOAD_TILES_END: 70,
  FILL_INTERNAL: 65,
  MESH_SETTINGS: 70,
  MESH_CREATION: 75,
  RESTORE_ORIENTATION: 92,
  COMPLETE: 100,
} as const;

// ============================================
// Types
// ============================================

type ProgressCallback = (current: number, total: number, stage: string) => void;

interface ProcessingOptions {
  offsetDistance: number;
  pixelsPerUnit: number;
  tileSize: number;
  rotationXZ: number;
  rotationYZ: number;
  fillHoles: boolean;
  progressCallback: ProgressCallback | null;
}

// ============================================
// Helper Functions
// ============================================

/** Yield to browser for UI responsiveness */
const yieldToBrowser = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/** Report progress if callback is available */
const reportProgress = (
  callback: ProgressCallback | null,
  percent: number,
  stage: string
): void => {
  callback?.(percent, 100, stage);
};

/** Calculate clamped resolution from model dimensions */
const calculateResolutionFromDimensions = (
  maxDimension: number,
  offsetDistance: number,
  pixelsPerUnit: number
): number => {
  const effectiveDim = maxDimension + offsetDistance * 10;
  const resolution = Math.ceil(effectiveDim * pixelsPerUnit);
  return Math.max(MIN_RESOLUTION, Math.min(MAX_RESOLUTION, resolution));
};

// ============================================
// Rotation Functions
// ============================================

/**
 * Create rotation matrix for tilt adjustments
 * Order: Z axis first (left/right), then X axis (front/back)
 */
const createRotationMatrix = (xzAngleDeg: number, yzAngleDeg: number): THREE.Matrix4 => {
  const matrix = new THREE.Matrix4();

  if (xzAngleDeg === 0 && yzAngleDeg === 0) {
    return matrix;
  }

  if (xzAngleDeg !== 0) {
    const rotZ = new THREE.Matrix4().makeRotationZ(xzAngleDeg * DEGREES_TO_RADIANS);
    matrix.multiply(rotZ);
  }

  if (yzAngleDeg !== 0) {
    const rotX = new THREE.Matrix4().makeRotationX(yzAngleDeg * DEGREES_TO_RADIANS);
    matrix.multiply(rotX);
  }

  return matrix;
};

/**
 * Create inverse rotation matrix (reverse order, negative angles)
 */
const createInverseRotationMatrix = (xzAngleDeg: number, yzAngleDeg: number): THREE.Matrix4 => {
  const matrix = new THREE.Matrix4();

  if (xzAngleDeg === 0 && yzAngleDeg === 0) {
    return matrix;
  }

  if (yzAngleDeg !== 0) {
    const rotX = new THREE.Matrix4().makeRotationX(-yzAngleDeg * DEGREES_TO_RADIANS);
    matrix.multiply(rotX);
  }

  if (xzAngleDeg !== 0) {
    const rotZ = new THREE.Matrix4().makeRotationZ(-xzAngleDeg * DEGREES_TO_RADIANS);
    matrix.multiply(rotZ);
  }

  return matrix;
};

/**
 * Apply transformation matrix to vertices (optimized manual multiplication)
 */
const applyMatrixToVertices = (
  vertices: Float32Array,
  matrix: THREE.Matrix4
): Float32Array => {
  const result = new Float32Array(vertices.length);
  const e = matrix.elements;

  // Extract matrix elements for direct access
  const m11 = e[0], m12 = e[4], m13 = e[8], m14 = e[12];
  const m21 = e[1], m22 = e[5], m23 = e[9], m24 = e[13];
  const m31 = e[2], m32 = e[6], m33 = e[10], m34 = e[14];
  const m41 = e[3], m42 = e[7], m43 = e[11], m44 = e[15];

  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];

    const w = m41 * x + m42 * y + m43 * z + m44 || 1;

    result[i] = (m11 * x + m12 * y + m13 * z + m14) / w;
    result[i + 1] = (m21 * x + m22 * y + m23 * z + m24) / w;
    result[i + 2] = (m31 * x + m32 * y + m33 * z + m34) / w;
  }

  return result;
};

// ============================================
// Processing Pipeline
// ============================================

/**
 * Apply rotation to vertices if needed
 */
const applyRotation = (
  vertices: Float32Array,
  rotationXZ: number,
  actualYZ: number,
  progressCallback: ProgressCallback | null
): { vertices: Float32Array; needsRestore: boolean } => {
  const needsRotation = rotationXZ !== 0 || actualYZ !== 0;

  if (!needsRotation) {
    return { vertices, needsRestore: false };
  }

  reportProgress(progressCallback, PROGRESS.ROTATION, 'Applying rotation');
  const rotationMatrix = createRotationMatrix(rotationXZ, actualYZ);
  const rotatedVertices = applyMatrixToVertices(vertices, rotationMatrix);

  return { vertices: rotatedVertices, needsRestore: true };
};

/**
 * Fill holes in mesh if enabled
 */
const processHoleFilling = async (
  vertices: Float32Array,
  fillHoles: boolean,
  progressCallback: ProgressCallback | null
): Promise<{ vertices: Float32Array; holesFilled: number; capTriangles: number }> => {
  console.log('[OffsetMesh] processHoleFilling called with fillHoles:', fillHoles);
  
  if (!fillHoles) {
    console.log('[OffsetMesh] Hole filling DISABLED by user');
    return { vertices, holesFilled: 0, capTriangles: 0 };
  }

  reportProgress(progressCallback, PROGRESS.HOLE_ANALYSIS, 'Analyzing mesh for holes');
  const holeAnalysis = analyzeMeshHoles(vertices);
  
  console.log('[OffsetMesh] Hole analysis result:', holeAnalysis);

  if (!holeAnalysis.hasHoles) {
    console.log('[OffsetMesh] No holes found in mesh');
    return { vertices, holesFilled: 0, capTriangles: 0 };
  }

  reportProgress(progressCallback, PROGRESS.HOLE_FILLING, 'Filling mesh holes');
  const originalLength = vertices.length;
  const filledVertices = fillMeshHoles(vertices);
  const addedVertices = filledVertices.length - originalLength;
  
  console.log('[OffsetMesh] Filled holes:', {
    originalVertices: originalLength / 3,
    newVertices: filledVertices.length / 3,
    addedTriangles: addedVertices / 9,
  });

  return {
    vertices: filledVertices,
    holesFilled: holeAnalysis.estimatedHoles,
    capTriangles: addedVertices / 9,
  };
};

/**
 * Generate heightmap from vertices
 */
const generateHeightmap = async (
  vertices: Float32Array,
  offsetDistance: number,
  resolution: number,
  tileSize: number,
  progressCallback: ProgressCallback | null
): Promise<HeightmapResult> => {
  reportProgress(progressCallback, PROGRESS.HEIGHTMAP_START, 'Generating heightmap');
  await yieldToBrowser();

  const tileProgressCallback =
    resolution > tileSize
      ? (current: number, total: number) => {
          const percent =
            PROGRESS.HEIGHTMAP_START +
            (current / total) * (PROGRESS.HEIGHTMAP_END - PROGRESS.HEIGHTMAP_START);
          reportProgress(progressCallback, percent, `Rendering tile ${current}/${total}`);
        }
      : null;

  return createOffsetHeightMap(vertices, offsetDistance, resolution, tileSize, tileProgressCallback);
};

/**
 * Load heightmap data from tiles if needed
 */
const loadHeightmapData = async (
  heightmapResult: HeightmapResult,
  progressCallback: ProgressCallback | null
): Promise<Float32Array> => {
  reportProgress(progressCallback, PROGRESS.LOAD_TILES_START, 'Loading heightmap data');
  await yieldToBrowser();

  if (!heightmapResult.usesIndexedDB) {
    return heightmapResult.heightMap;
  }

  const loadProgressCallback = (current: number, total: number) => {
    const percent =
      PROGRESS.LOAD_TILES_START +
      (current / total) * (PROGRESS.LOAD_TILES_END - PROGRESS.LOAD_TILES_START);
    reportProgress(progressCallback, percent, `Loading tile ${current}/${total}`);
  };

  return loadHeightMapFromTiles(heightmapResult, loadProgressCallback);
};

/**
 * Fill internal holes in heightmap
 */
const processInternalHoles = (
  heightMap: Float32Array,
  resolution: number,
  fillHoles: boolean,
  progressCallback: ProgressCallback | null
): { filledHoles: number; filledPixels: number } => {
  if (!fillHoles) {
    return { filledHoles: 0, filledPixels: 0 };
  }

  reportProgress(progressCallback, PROGRESS.FILL_INTERNAL, 'Filling internal holes in heightmap');
  return fillInternalHoles(heightMap, resolution);
};

// ============================================
// Main API
// ============================================

/**
 * Process STL geometry and create offset mesh
 *
 * @param vertices - Triangle soup vertices (xyz per vertex)
 * @param options - Processing options
 * @returns Result with geometry and metadata
 */
export async function createOffsetMesh(
  vertices: Float32Array,
  options: OffsetMeshOptions
): Promise<OffsetMeshResult> {
  // Validate inputs
  if (!vertices || vertices.length === 0) {
    throw new Error('No vertices provided');
  }
  if (options.offsetDistance < 0) {
    throw new Error('Offset distance cannot be negative');
  }
  if (options.pixelsPerUnit <= 0) {
    throw new Error('Pixels per unit must be positive');
  }

  const config: ProcessingOptions = {
    offsetDistance: options.offsetDistance,
    pixelsPerUnit: options.pixelsPerUnit,
    tileSize: options.tileSize ?? 2048,
    rotationXZ: options.rotationXZ ?? 0,
    rotationYZ: options.rotationYZ ?? 0,
    fillHoles: options.fillHoles ?? true,
    progressCallback: options.progressCallback ?? null,
  };

  const startTime = performance.now();
  const actualYZ = BASELINE_YZ_ROTATION + config.rotationYZ;

  // Initialize result
  const result: OffsetMeshResult = {
    heightmapResult: null,
    geometry: null,
    metadata: {
      offsetDistance: config.offsetDistance,
      pixelsPerUnit: config.pixelsPerUnit,
      resolution: 0,
      vertexCount: 0,
      triangleCount: 0,
      processingTime: 0,
      originalTriangleCount: 0,
      geometryCreationTime: 0,
      holesFilled: 0,
      holesCapTriangles: 0,
    },
  };

  try {
    // Step 1: Apply rotation
    const rotationResult = applyRotation(
      vertices,
      config.rotationXZ,
      actualYZ,
      config.progressCallback
    );
    let workingVertices = rotationResult.vertices;

    // Step 2: Fill mesh holes
    const holeResult = await processHoleFilling(
      workingVertices,
      config.fillHoles,
      config.progressCallback
    );
    workingVertices = holeResult.vertices;
    result.metadata.holesFilled = holeResult.holesFilled;
    result.metadata.holesCapTriangles = holeResult.capTriangles;

    // Step 3: Calculate resolution
    reportProgress(config.progressCallback, PROGRESS.RESOLUTION_CALC, 'Calculating resolution');
    await yieldToBrowser();

    const box = new THREE.Box3().setFromArray(workingVertices);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    const resolution = calculateResolutionFromDimensions(
      maxDim,
      config.offsetDistance,
      config.pixelsPerUnit
    );
    result.metadata.resolution = resolution;

    // Step 4: Generate heightmap
    const heightmapResult = await generateHeightmap(
      workingVertices,
      config.offsetDistance,
      resolution,
      config.tileSize,
      config.progressCallback
    );
    result.heightmapResult = heightmapResult as HeightmapResult;

    // Step 5: Load heightmap data
    const heightMap = await loadHeightmapData(heightmapResult as HeightmapResult, config.progressCallback);

    // Step 6: Fill internal holes in heightmap
    const internalHoles = processInternalHoles(
      heightMap,
      resolution,
      config.fillHoles,
      config.progressCallback
    );
    if (internalHoles.filledHoles > 0) {
      result.metadata.internalHolesFilled = internalHoles.filledHoles;
      result.metadata.internalHolesPixels = internalHoles.filledPixels;
    }

    // Step 7: Create mesh
    reportProgress(config.progressCallback, PROGRESS.MESH_CREATION, 'Creating watertight mesh');
    await yieldToBrowser();

    const clipYMin = box.min.y - config.offsetDistance;
    const clipYMax = box.max.y + config.offsetDistance;

    const meshSettings = {
      downsampleFactor: 1,
      effectiveResolution: resolution,
    };

    const geometry = createWatertightMeshFromHeightmap(
      heightMap,
      resolution,
      heightmapResult.scale,
      heightmapResult.center,
      clipYMin,
      clipYMax,
      meshSettings
    );

    await yieldToBrowser();
    result.geometry = geometry;
    result.metadata.originalTriangleCount = geometry.index!.count / 3;

    // Step 8: Restore orientation
    if (rotationResult.needsRestore) {
      reportProgress(config.progressCallback, PROGRESS.RESTORE_ORIENTATION, 'Restoring orientation');
      const inverseMatrix = createInverseRotationMatrix(config.rotationXZ, actualYZ);
      result.geometry.applyMatrix4(inverseMatrix);
      result.geometry.computeVertexNormals();
    }

    // Update final metadata
    result.metadata.vertexCount = result.geometry.getAttribute('position').count;
    result.metadata.triangleCount = result.geometry.index!.count / 3;

    const endTime = performance.now();
    result.metadata.processingTime = endTime - startTime;
    result.metadata.geometryCreationTime = result.metadata.processingTime;

    reportProgress(config.progressCallback, PROGRESS.COMPLETE, 'Complete');

    return result;
  } catch (error) {
    console.error('[OffsetMesh] Processing error:', error);
    throw error;
  }
}

/**
 * Cleanup GPU resources (call when done)
 */
export function cleanup(): void {
  cleanupOffscreenResources();
}

// ============================================
// Utility Functions
// ============================================

/**
 * Extract vertices from Three.js BufferGeometry
 */
export function extractVertices(geometry: THREE.BufferGeometry): Float32Array {
  const position = geometry.attributes.position;
  return position.array as Float32Array;
}

/**
 * Calculate adaptive resolution based on model size
 */
export function calculateResolution(
  boundingBox: THREE.Box3,
  pixelsPerUnit: number,
  offsetDistance: number
): number {
  const size = new THREE.Vector3();
  boundingBox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  return calculateResolutionFromDimensions(maxDim, offsetDistance, pixelsPerUnit);
}
