/**
 * Viewport Types
 * 
 * Shared types for 3D viewport components.
 * 
 * @module @rapidtool/cad-ui/viewport
 */

import * as THREE from 'three';

/**
 * Summary of an object's bounding box with computed metrics.
 */
export interface BoundsSummary {
  /** Minimum corner of the bounding box */
  min: THREE.Vector3;
  /** Maximum corner of the bounding box */
  max: THREE.Vector3;
  /** Center point of the bounding box */
  center: THREE.Vector3;
  /** Size (width, height, depth) of the bounding box */
  size: THREE.Vector3;
  /** Radius of the bounding sphere */
  radius: number;
  /** Scale factor for unit conversion */
  unitsScale: number;
}

/**
 * Standard view orientations for CAD viewport.
 */
export type ViewOrientation = 
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'isometric'
  | 'isometric-back';

/**
 * Grid configuration for ScalableGrid component.
 */
export interface GridConfig {
  /** Size of the grid in world units */
  size: number;
  /** Number of divisions */
  divisions: number;
  /** Main grid line color */
  mainColor: string | number;
  /** Subdivision line color */
  subColor: string | number;
  /** Grid line opacity */
  opacity: number;
}
