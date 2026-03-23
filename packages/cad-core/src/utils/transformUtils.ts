/**
 * Transform Utilities
 * 
 * Pure utility functions for 3D transform operations.
 * No framework-specific dependencies (React, events, etc.)
 * 
 * @module @rapidtool/cad-core/utils
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

export interface Transform3D {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

// ============================================================================
// Temporary Objects (for performance - reused to avoid allocations)
// ============================================================================

export const tempPosition = new THREE.Vector3();
export const tempQuaternion = new THREE.Quaternion();
export const tempEuler = new THREE.Euler();
export const tempScale = new THREE.Vector3();
export const tempMatrix = new THREE.Matrix4();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Safe number conversion with NaN/Infinity handling
 */
export function safeNum(val: number, fallback: number = 0): number {
  if (typeof val !== 'number' || !isFinite(val)) return fallback;
  return val;
}

/**
 * Reset a group's position, rotation, and scale to identity
 */
export function resetGroupTransform(group: THREE.Group): void {
  group.position.set(0, 0, 0);
  group.rotation.set(0, 0, 0);
  group.scale.set(1, 1, 1);
  group.updateMatrix();
  group.updateMatrixWorld(true);
}

/**
 * Get the world transform of an object
 */
export function getWorldTransform(object: THREE.Object3D): Transform3D {
  object.updateMatrixWorld(true);
  
  tempPosition.setFromMatrixPosition(object.matrixWorld);
  tempQuaternion.setFromRotationMatrix(object.matrixWorld);
  tempEuler.setFromQuaternion(tempQuaternion);
  tempScale.setFromMatrixScale(object.matrixWorld);

  return {
    position: {
      x: safeNum(tempPosition.x),
      y: safeNum(tempPosition.y),
      z: safeNum(tempPosition.z),
    },
    rotation: {
      x: safeNum(THREE.MathUtils.radToDeg(tempEuler.x)),
      y: safeNum(THREE.MathUtils.radToDeg(tempEuler.y)),
      z: safeNum(THREE.MathUtils.radToDeg(tempEuler.z)),
    },
    scale: {
      x: safeNum(tempScale.x, 1),
      y: safeNum(tempScale.y, 1),
      z: safeNum(tempScale.z, 1),
    },
  };
}

/**
 * Convert Three.js Y-up position to CAD Z-up position
 * Three.js: Y-up, CAD: Z-up
 */
export function toCadPosition(threePos: THREE.Vector3): { x: number; y: number; z: number } {
  return {
    x: safeNum(threePos.x),
    y: safeNum(-threePos.z), // Swap and negate
    z: safeNum(threePos.y),  // Swap
  };
}

/**
 * Convert Three.js rotation to CAD rotation (degrees)
 */
export function toCadRotation(threeEuler: THREE.Euler): { x: number; y: number; z: number } {
  return {
    x: safeNum(THREE.MathUtils.radToDeg(threeEuler.x)),
    y: safeNum(THREE.MathUtils.radToDeg(-threeEuler.z)),
    z: safeNum(THREE.MathUtils.radToDeg(threeEuler.y)),
  };
}

/**
 * Convert CAD Z-up position to Three.js Y-up position
 */
export function toThreePosition(cadPos: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(
    safeNum(cadPos.x),
    safeNum(cadPos.z),  // CAD Z -> Three Y
    safeNum(-cadPos.y)  // CAD Y -> Three -Z
  );
}

/**
 * Convert CAD rotation (degrees) to Three.js rotation
 */
export function toThreeRotation(cadRot: { x: number; y: number; z: number }): THREE.Euler {
  return new THREE.Euler(
    THREE.MathUtils.degToRad(safeNum(cadRot.x)),
    THREE.MathUtils.degToRad(safeNum(cadRot.z)),  // CAD Z -> Three Y
    THREE.MathUtils.degToRad(safeNum(-cadRot.y))  // CAD Y -> Three -Z
  );
}

/**
 * Convert CAD axis to Three.js axis
 * CAD (Z-up) -> Three.js (Y-up)
 */
export function cadToThreeAxis(cadAxis: string): 'x' | 'y' | 'z' {
  switch (cadAxis.toLowerCase()) {
    case 'x': return 'x';
    case 'y': return 'z'; // CAD Y -> Three Z (negated in position)
    case 'z': return 'y'; // CAD Z -> Three Y
    default: return 'y';
  }
}

/**
 * Apply a transform to an object
 */
export function applyTransform(object: THREE.Object3D, transform: Transform3D): void {
  object.position.set(
    transform.position.x,
    transform.position.y,
    transform.position.z
  );
  object.rotation.set(
    THREE.MathUtils.degToRad(transform.rotation.x),
    THREE.MathUtils.degToRad(transform.rotation.y),
    THREE.MathUtils.degToRad(transform.rotation.z)
  );
  object.scale.set(
    transform.scale.x,
    transform.scale.y,
    transform.scale.z
  );
  object.updateMatrix();
  object.updateMatrixWorld(true);
}

/**
 * Interpolate between two transforms
 */
export function lerpTransform(
  from: Transform3D,
  to: Transform3D,
  t: number
): Transform3D {
  const clampedT = Math.max(0, Math.min(1, t));
  
  return {
    position: {
      x: from.position.x + (to.position.x - from.position.x) * clampedT,
      y: from.position.y + (to.position.y - from.position.y) * clampedT,
      z: from.position.z + (to.position.z - from.position.z) * clampedT,
    },
    rotation: {
      x: from.rotation.x + (to.rotation.x - from.rotation.x) * clampedT,
      y: from.rotation.y + (to.rotation.y - from.rotation.y) * clampedT,
      z: from.rotation.z + (to.rotation.z - from.rotation.z) * clampedT,
    },
    scale: {
      x: from.scale.x + (to.scale.x - from.scale.x) * clampedT,
      y: from.scale.y + (to.scale.y - from.scale.y) * clampedT,
      z: from.scale.z + (to.scale.z - from.scale.z) * clampedT,
    },
  };
}

/**
 * Create an identity transform
 */
export function identityTransform(): Transform3D {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

/**
 * Check if two transforms are approximately equal
 */
export function transformsEqual(
  a: Transform3D,
  b: Transform3D,
  epsilon: number = 0.0001
): boolean {
  const posEqual = 
    Math.abs(a.position.x - b.position.x) < epsilon &&
    Math.abs(a.position.y - b.position.y) < epsilon &&
    Math.abs(a.position.z - b.position.z) < epsilon;
    
  const rotEqual =
    Math.abs(a.rotation.x - b.rotation.x) < epsilon &&
    Math.abs(a.rotation.y - b.rotation.y) < epsilon &&
    Math.abs(a.rotation.z - b.rotation.z) < epsilon;
    
  const scaleEqual =
    Math.abs(a.scale.x - b.scale.x) < epsilon &&
    Math.abs(a.scale.y - b.scale.y) < epsilon &&
    Math.abs(a.scale.z - b.scale.z) < epsilon;
    
  return posEqual && rotEqual && scaleEqual;
}
