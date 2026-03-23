import * as THREE from 'three';
import type { TransformComponentType } from './types';

/**
 * Calculate gizmo scale based on component type and data
 */
export function calculateGizmoScale(
  componentType: TransformComponentType,
  data: Record<string, unknown>
): number {
  switch (componentType) {
    case 'support':
      return Math.max(((data.radius ?? data.width ?? 10) as number) * 2, 25);
    case 'clamp':
      return 40; // Fixed size
    case 'hole':
      return Math.max(((data.diameter ?? 10) as number) * 3, 30);
    case 'label':
      return Math.max(((data.fontSize ?? 10) as number) * 2, 20);
    case 'baseplate':
      return Math.max(Math.max((data.width ?? 100) as number, (data.depth ?? 100) as number) * 0.8, 30);
    case 'part':
      return Math.max(((data.boundingRadius ?? 50) as number) * 0.75, 25);
    default:
      return 30;
  }
}

/**
 * Calculate gizmo position based on component type and data
 */
export function calculateGizmoPosition(
  componentType: TransformComponentType,
  data: Record<string, unknown>
): THREE.Vector3 {
  switch (componentType) {
    case 'support': {
      // At TOP of support
      const center = (data.center ?? { x: 0, y: 0 }) as { x: number; y: number };
      const baseY = (data.baseY ?? 0) as number;
      const height = (data.height ?? 10) as number;
      return new THREE.Vector3(center.x, baseY + height + 5, center.y);
    }
    case 'clamp': {
      // At fixture point world position
      const pos = (data.position ?? { x: 0, y: 0, z: 0 }) as { x: number; y: number; z: number };
      return new THREE.Vector3(pos.x, pos.y, pos.z);
    }
    case 'hole': {
      // Above baseplate surface
      const holeX = (data.x ?? 0) as number;
      const holeZ = (data.z ?? 0) as number;
      const baseTopY = (data.baseTopY ?? 0) as number;
      return new THREE.Vector3(holeX, baseTopY + 5, holeZ);
    }
    case 'label': {
      // Above label
      const labelPos = (data.position ?? { x: 0, y: 0, z: 0 }) as { x: number; y: number; z: number };
      const depth = (data.depth ?? 0) as number;
      return new THREE.Vector3(labelPos.x, labelPos.y + depth + 5, labelPos.z);
    }
    case 'baseplate': {
      // Above ground at section center
      const centerX = (((data.minX ?? 0) as number) + ((data.maxX ?? 100) as number)) / 2;
      const centerZ = (((data.minZ ?? 0) as number) + ((data.maxZ ?? 100) as number)) / 2;
      return new THREE.Vector3(centerX, 5, centerZ);
    }
    case 'part': {
      // At mesh world position
      const pos = (data.worldPosition ?? { x: 0, y: 0, z: 0 }) as { x: number; y: number; z: number };
      return new THREE.Vector3(pos.x, pos.y, pos.z);
    }
    default:
      return new THREE.Vector3(0, 5, 0);
  }
}

/**
 * Dispatch orbit control disable event
 */
export function setOrbitControlsEnabled(enabled: boolean): void {
  window.dispatchEvent(
    new CustomEvent('disable-orbit-controls', { detail: { disabled: !enabled } })
  );
}

/**
 * Dispatch transform update event
 */
export function dispatchTransformUpdate(componentType: TransformComponentType, id: string): void {
  window.dispatchEvent(
    new CustomEvent('model-transform-updated', { 
      detail: { componentType, id } 
    })
  );
}

/**
 * Reset a pivot/group matrix to identity
 */
export function resetPivotMatrix(pivot: THREE.Object3D): void {
  pivot.matrix.identity();
  pivot.position.set(0, 0, 0);
  pivot.rotation.set(0, 0, 0);
  pivot.scale.set(1, 1, 1);
  pivot.updateMatrix();
}
