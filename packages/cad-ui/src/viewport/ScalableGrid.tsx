/**
 * ScalableGrid Component
 * 
 * Renders an adaptive floor grid that scales based on model bounds.
 * Uses THREE.GridHelper for the main grid and custom Lines for subdivisions.
 * 
 * @module @rapidtool/cad-ui/viewport
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { BoundsSummary } from './types';

// ============================================================================
// Types
// ============================================================================

export interface ScalableGridProps {
  /** Model bounds for adaptive sizing */
  bounds?: BoundsSummary | null;
  /** Color for main grid lines */
  mainColor?: string | number;
  /** Color for subdivision lines */
  subColor?: string | number;
  /** Opacity of grid lines */
  opacity?: number;
  /** Number of divisions in the grid */
  divisions?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_GRID_SIZE = 10;
const GRID_SCALE_FACTOR = 1.2;
const DEFAULT_DIVISIONS = 10;

const DEFAULT_MAIN_COLOR = 0x888888;
const DEFAULT_SUB_COLOR = 0x444444;
const DEFAULT_OPACITY = 0.5;

// ============================================================================
// Component
// ============================================================================

const ScalableGrid: React.FC<ScalableGridProps> = ({
  bounds,
  mainColor = DEFAULT_MAIN_COLOR,
  subColor = DEFAULT_SUB_COLOR,
  opacity = DEFAULT_OPACITY,
  divisions = DEFAULT_DIVISIONS,
}) => {
  // Compute grid size based on bounds
  const gridSize = useMemo(() => {
    if (!bounds) return DEFAULT_GRID_SIZE;
    
    const maxDimension = Math.max(bounds.size.x, bounds.size.z);
    return maxDimension * GRID_SCALE_FACTOR;
  }, [bounds]);
  
  // Create grid helper (main grid lines)
  const gridHelper = useMemo(() => {
    const helper = new THREE.GridHelper(
      gridSize,
      divisions,
      mainColor,
      subColor
    );
    
    // Apply opacity to materials
    const materials = Array.isArray(helper.material) 
      ? helper.material 
      : [helper.material];
    
    materials.forEach((mat) => {
      mat.transparent = true;
      mat.opacity = opacity;
    });
    
    return helper;
  }, [gridSize, divisions, mainColor, subColor, opacity]);
  
  // Create subdivision lines for better visual reference
  const subdivisionLines = useMemo(() => {
    const halfSize = gridSize / 2;
    const step = gridSize / divisions;
    const points: THREE.Vector3[] = [];
    
    // Create lines perpendicular to X axis
    for (let i = -halfSize; i <= halfSize; i += step) {
      points.push(new THREE.Vector3(i, 0, -halfSize));
      points.push(new THREE.Vector3(i, 0, halfSize));
    }
    
    // Create lines perpendicular to Z axis
    for (let i = -halfSize; i <= halfSize; i += step) {
      points.push(new THREE.Vector3(-halfSize, 0, i));
      points.push(new THREE.Vector3(halfSize, 0, i));
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: subColor,
      transparent: true,
      opacity: opacity * 0.5,
    });
    
    return new THREE.LineSegments(geometry, material);
  }, [gridSize, divisions, subColor, opacity]);
  
  return (
    <group>
      <primitive object={gridHelper} />
      <primitive object={subdivisionLines} />
    </group>
  );
};

export default ScalableGrid;
