/**
 * STL Export Service
 * 
 * Generates STL files from tool outlines for Gridfinity-compatible cutouts.
 * Uses Three.js for geometry creation and cad-core for STL export.
 */

import * as THREE from 'three';
import { meshToSTL, downloadFile } from '@rapidtool/cad-core';
import type { Point2D } from './geometry';

// ============================================================================
// Types
// ============================================================================

export interface STLExportOptions {
  /** Base thickness in mm */
  baseThickness?: number;
  /** Tool depth (how deep the cutout goes) in mm */
  toolDepth?: number;
  /** Gridfinity grid size in mm (default 42mm per unit) */
  gridSize?: number;
  /** Number of grid units in X */
  gridUnitsX?: number;
  /** Number of grid units in Y */
  gridUnitsY?: number;
  /** Add chamfer to edges */
  addChamfer?: boolean;
  /** Chamfer size in mm */
  chamferSize?: number;
  /** Use binary STL format */
  binary?: boolean;
}

export interface ToolOutlineExport {
  id: string;
  name: string;
  points: Point2D[];
  color: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OPTIONS: Required<STLExportOptions> = {
  baseThickness: 5,
  toolDepth: 4,
  gridSize: 42,
  gridUnitsX: 1,
  gridUnitsY: 1,
  addChamfer: true,
  chamferSize: 0.5,
  binary: true,
};

// ============================================================================
// STL Generation
// ============================================================================

/**
 * Generate STL mesh from tool outlines
 */
export function generateSTLMesh(
  outlines: ToolOutlineExport[],
  pixelsPerMm: number,
  options: STLExportOptions = {}
): THREE.Mesh | null {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (outlines.length === 0) {
    return null;
  }
  
  // Calculate bounding box of all tools
  const bounds = calculateToolBounds(outlines, pixelsPerMm);
  
  // Calculate required grid size
  const toolWidth = bounds.maxX - bounds.minX;
  const toolHeight = bounds.maxY - bounds.minY;
  
  // Auto-calculate grid units if needed (fit tools with margin)
  const margin = 5; // 5mm margin
  const requiredWidth = toolWidth + margin * 2;
  const requiredHeight = toolHeight + margin * 2;
  
  const gridUnitsX = opts.gridUnitsX || Math.ceil(requiredWidth / opts.gridSize);
  const gridUnitsY = opts.gridUnitsY || Math.ceil(requiredHeight / opts.gridSize);
  
  const baseWidth = gridUnitsX * opts.gridSize;
  const baseHeight = gridUnitsY * opts.gridSize;
  
  // Create base geometry
  const baseGeometry = new THREE.BoxGeometry(
    baseWidth,
    baseHeight,
    opts.baseThickness
  );
  
  // Create tool cutout shapes and extrude them
  const cutoutGeometries: THREE.BufferGeometry[] = [];
  
  // Center offset - position tools in center of base
  const centerOffsetX = -bounds.minX + (baseWidth - toolWidth) / 2;
  const centerOffsetY = -bounds.minY + (baseHeight - toolHeight) / 2;
  
  for (const outline of outlines) {
    const shape = createShapeFromPoints(
      outline.points,
      pixelsPerMm,
      centerOffsetX,
      centerOffsetY,
      baseWidth,
      baseHeight
    );
    
    if (shape) {
      const extrudeSettings = {
        depth: opts.toolDepth,
        bevelEnabled: opts.addChamfer,
        bevelThickness: opts.chamferSize,
        bevelSize: opts.chamferSize,
        bevelSegments: 1,
      };
      
      const cutoutGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      
      // Position cutout at top of base
      cutoutGeometry.translate(0, 0, opts.baseThickness / 2 - opts.toolDepth);
      
      cutoutGeometries.push(cutoutGeometry);
    }
  }
  
  // For simplicity, we'll create a combined mesh
  // In a full implementation, you'd use CSG to subtract cutouts from base
  // For now, create a mesh with the base and separate cutout meshes
  
  // Create base mesh
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
  
  // Position base so bottom is at Z=0
  baseMesh.position.z = opts.baseThickness / 2;
  
  // If we have cutouts, create a group with visual representation
  // For actual CSG, we'd need to use cad-core's csgSubtract
  if (cutoutGeometries.length > 0) {
    // For now, return the base mesh
    // TODO: Implement CSG subtraction using cad-core
    return baseMesh;
  }
  
  return baseMesh;
}

/**
 * Export tool outlines as STL and trigger download
 */
export async function downloadSTL(
  outlines: ToolOutlineExport[],
  pixelsPerMm: number,
  filename: string = 'tooltrace-export.stl',
  options: STLExportOptions = {}
): Promise<void> {
  const mesh = generateSTLMesh(outlines, pixelsPerMm, options);
  
  if (!mesh) {
    throw new Error('No geometry to export');
  }
  
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const stlData = meshToSTL(mesh, { binary: opts.binary });
  
  await downloadFile(
    stlData,
    filename.endsWith('.stl') ? filename : `${filename}.stl`,
    'application/sla'
  );
  
  // Clean up
  mesh.geometry.dispose();
  if (mesh.material instanceof THREE.Material) {
    mesh.material.dispose();
  }
}

/**
 * Generate simple base-only STL for Gridfinity
 */
export function generateGridfinityBase(
  width: number,
  height: number,
  depth: number
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  
  // Position so bottom is at Z=0
  mesh.position.z = depth / 2;
  
  return mesh;
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateToolBounds(
  outlines: ToolOutlineExport[],
  pixelsPerMm: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  for (const outline of outlines) {
    for (const p of outline.points) {
      const x = p.x / pixelsPerMm;
      const y = p.y / pixelsPerMm;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  
  return { minX, minY, maxX, maxY };
}

function createShapeFromPoints(
  points: Point2D[],
  pixelsPerMm: number,
  offsetX: number,
  offsetY: number,
  baseWidth: number,
  baseHeight: number
): THREE.Shape | null {
  if (points.length < 3) return null;
  
  const shape = new THREE.Shape();
  
  // Convert points to mm and apply offset
  // Also center relative to base center
  const first = points[0];
  const firstX = (first.x / pixelsPerMm + offsetX) - baseWidth / 2;
  const firstY = (first.y / pixelsPerMm + offsetY) - baseHeight / 2;
  
  shape.moveTo(firstX, firstY);
  
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const x = (p.x / pixelsPerMm + offsetX) - baseWidth / 2;
    const y = (p.y / pixelsPerMm + offsetY) - baseHeight / 2;
    shape.lineTo(x, y);
  }
  
  shape.closePath();
  
  return shape;
}
