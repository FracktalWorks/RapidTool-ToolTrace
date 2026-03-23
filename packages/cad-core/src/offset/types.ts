/**
 * Offset Mesh Processor Types
 */

import type * as THREE from 'three';

// ============================================
// Core Processing Types
// ============================================

export interface OffsetMeshOptions {
  /** Offset distance in world units */
  offsetDistance: number;
  /** Resolution (pixels per unit) */
  pixelsPerUnit: number;
  /** Tile size for large heightmaps (default: 2048) */
  tileSize?: number;
  /** Rotation around Y axis in degrees (XZ plane) */
  rotationXZ?: number;
  /** Rotation around X axis in degrees (YZ plane) */
  rotationYZ?: number;
  /** Fill holes in input mesh before heightmap generation */
  fillHoles?: boolean;
  /** Progress callback (current, total, stage) */
  progressCallback?: ((current: number, total: number, stage: string) => void) | null;
}

export interface OffsetMeshMetadata {
  offsetDistance: number;
  pixelsPerUnit: number;
  resolution: number;
  vertexCount: number;
  triangleCount: number;
  processingTime: number;
  originalTriangleCount: number;
  geometryCreationTime: number;
  holesFilled: number;
  holesCapTriangles: number;
  /** Number of internal holes filled in heightmap */
  internalHolesFilled?: number;
  /** Number of pixels filled for internal holes */
  internalHolesPixels?: number;
}

export interface HeightmapResult {
  heightMap: Float32Array;
  scale: number;
  center: THREE.Vector3;
  usesIndexedDB?: boolean;
  tileKeys?: string[];
  tileResolution?: number;
  tilesPerSide?: number;
}

export interface OffsetMeshResult {
  heightmapResult: HeightmapResult | null;
  geometry: THREE.BufferGeometry | null;
  metadata: OffsetMeshMetadata;
}

// ============================================
// Cavity Settings
// ============================================

export interface CavitySettings {
  /** Enable cavity creation */
  enabled: boolean;
  /** Offset distance for the cavity (clearance from part) in mm */
  offsetDistance: number;
  /** Resolution - pixels per unit for heightmap generation */
  pixelsPerUnit: number;
  /** Rotation around Y axis in degrees (XZ plane) */
  rotationXZ: number;
  /** Rotation around X axis in degrees (YZ plane) */
  rotationYZ: number;
  /** Fill holes in input mesh before heightmap generation */
  fillHoles: boolean;
  /** Show cavity preview mesh */
  showPreview: boolean;
  /** Preview mesh opacity (0-1) */
  previewOpacity: number;
  /** Enable mesh decimation to reduce triangle count */
  enableDecimation: boolean;
  /** Enable mesh smoothing to remove jagged edges */
  enableSmoothing: boolean;
  /**
   * Smoothing strength (0-1).
   * Controls the blend between Taubin and Laplacian smoothing:
   * - 0 = Pure Taubin smoothing (weak effect, volume-preserving)
   * - 1 = Pure Laplacian smoothing (strong effect, may cause shrinkage)
   * Reference: trCAD smoothing modifier
   */
  smoothingStrength: number;
  /**
   * Number of smoothing iterations.
   * More iterations = smoother result but slower processing.
   * Typical values: 1-100
   */
  smoothingIterations: number;
  /**
   * Quality mode toggle.
   * - true: Enhanced mesh surface quality (slower)
   * - false: Faster processing (may develop uneven regions)
   */
  smoothingQuality: boolean;
  /**
   * Debug coloring mode - adds vertex colors based on classification:
   * - RED: WALL vertices (smoothed in X-Z)
   * - GREEN: TOP_SURFACE_BOUNDARY vertices (smoothed in X-Z)
   * - BLUE: TOP_SURFACE_INTERIOR vertices (NOT smoothed)
   * - YELLOW: BOTTOM_SURFACE vertices (NOT smoothed)
   */
  debugSmoothingColors: boolean;
  /** CSG Cleanup: Minimum volume for component to be kept (mm³) */
  csgMinVolume: number;
  /** CSG Cleanup: Minimum thickness for component to be kept (mm) */
  csgMinThickness: number;
  /** CSG Cleanup: Minimum triangle count for component to be kept */
  csgMinTriangles: number;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Calculate adaptive pixels per unit based on part diagonal size.
 * Larger parts (600mm+) use 2 px/mm for performance.
 * Smaller parts (100mm-) use 6 px/mm for detail.
 *
 * @param diagonal - Part diagonal in mm
 * @returns pixelsPerUnit value (2-6)
 */
export function getAdaptivePixelsPerUnit(diagonal: number): number {
  const MIN_DIAGONAL = 100;
  const MAX_DIAGONAL = 600;
  const MAX_PPU = 6;
  const MIN_PPU = 2;

  if (diagonal <= MIN_DIAGONAL) return MAX_PPU;
  if (diagonal >= MAX_DIAGONAL) return MIN_PPU;

  // Linear interpolation
  const t = (diagonal - MIN_DIAGONAL) / (MAX_DIAGONAL - MIN_DIAGONAL);
  return Math.round(MAX_PPU - t * (MAX_PPU - MIN_PPU));
}

// ============================================
// Default Settings
// ============================================

export const DEFAULT_CAVITY_SETTINGS: CavitySettings = {
  enabled: true,
  offsetDistance: 0.2,
  pixelsPerUnit: 6,
  rotationXZ: 0,
  rotationYZ: 0,
  fillHoles: true,
  showPreview: true,
  previewOpacity: 0.3,
  enableDecimation: true,
  enableSmoothing: true,
  smoothingStrength: 0.5, // 50% blend of Taubin and Laplacian
  smoothingIterations: 10, // Default iterations
  smoothingQuality: true, // Quality mode always on
  debugSmoothingColors: false, // Debug colors off by default
  csgMinVolume: 1.0,
  csgMinThickness: 0.5,
  csgMinTriangles: 5,
};
