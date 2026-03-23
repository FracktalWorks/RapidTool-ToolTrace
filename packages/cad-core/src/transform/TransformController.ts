import * as THREE from 'three';
import type { TransformConfig, TransformDelta } from './types';

/**
 * Core transform controller that applies constraints to transform deltas.
 * This is the main logic extracted from all individual transform controls.
 */
export class TransformController {
  private config: TransformConfig;
  private tempEuler = new THREE.Euler();
  private tempQuaternion = new THREE.Quaternion();
  
  constructor(config: TransformConfig) {
    this.config = config;
  }
  
  /**
   * Apply all constraints to a raw transform delta
   */
  applyConstraints(delta: TransformDelta): TransformDelta {
    const result: TransformDelta = {
      position: delta.position.clone(),
      rotation: delta.rotation.clone(),
      scale: delta.scale.clone(),
    };
    
    this.applyPositionConstraints(result);
    this.applyRotationConstraints(result);
    this.applyScaleConstraints(result);
    
    return result;
  }
  
  /**
   * Apply position constraints
   */
  private applyPositionConstraints(delta: TransformDelta): void {
    const { position } = this.config.constraints;
    
    // Lock axes
    if (position.lockX) delta.position.x = 0;
    if (position.lockY) delta.position.y = 0;
    if (position.lockZ) delta.position.z = 0;
    
    // Clamp to bounds
    if (position.minX !== undefined) delta.position.x = Math.max(delta.position.x, position.minX);
    if (position.maxX !== undefined) delta.position.x = Math.min(delta.position.x, position.maxX);
    if (position.minY !== undefined) delta.position.y = Math.max(delta.position.y, position.minY);
    if (position.maxY !== undefined) delta.position.y = Math.min(delta.position.y, position.maxY);
    if (position.minZ !== undefined) delta.position.z = Math.max(delta.position.z, position.minZ);
    if (position.maxZ !== undefined) delta.position.z = Math.min(delta.position.z, position.maxZ);
    
    // Snap to grid
    if (position.snapGrid) {
      const grid = position.snapGrid;
      delta.position.x = Math.round(delta.position.x / grid) * grid;
      delta.position.y = Math.round(delta.position.y / grid) * grid;
      delta.position.z = Math.round(delta.position.z / grid) * grid;
    }
  }
  
  /**
   * Apply rotation constraints
   */
  private applyRotationConstraints(delta: TransformDelta): void {
    const { rotation } = this.config.constraints;
    
    // For clean Y extraction, convert through quaternion with YXZ order
    if (this.config.useYXZEulerOrder) {
      this.tempQuaternion.setFromEuler(delta.rotation);
      this.tempEuler.setFromQuaternion(this.tempQuaternion, 'YXZ');
      delta.rotation.copy(this.tempEuler);
    }
    
    // Lock axes
    if (rotation.lockX) delta.rotation.x = 0;
    if (rotation.lockY) delta.rotation.y = 0;
    if (rotation.lockZ) delta.rotation.z = 0;
    
    // Snap to degrees
    if (rotation.snapDegrees) {
      const snap = THREE.MathUtils.degToRad(rotation.snapDegrees);
      delta.rotation.x = Math.round(delta.rotation.x / snap) * snap;
      delta.rotation.y = Math.round(delta.rotation.y / snap) * snap;
      delta.rotation.z = Math.round(delta.rotation.z / snap) * snap;
    }
  }
  
  /**
   * Apply scale constraints
   */
  private applyScaleConstraints(delta: TransformDelta): void {
    const { scale } = this.config.constraints;
    
    if (!scale.enabled) {
      delta.scale.set(1, 1, 1);
      return;
    }
    
    // Uniform scaling
    if (scale.uniform) {
      const avg = (delta.scale.x + delta.scale.y + delta.scale.z) / 3;
      delta.scale.set(avg, avg, avg);
    }
    
    // Lock axes
    if (scale.lockX) delta.scale.x = 1;
    if (scale.lockY) delta.scale.y = 1;
    if (scale.lockZ) delta.scale.z = 1;
    
    // Clamp scale
    if (scale.minScale !== undefined) {
      delta.scale.x = Math.max(delta.scale.x, scale.minScale);
      delta.scale.y = Math.max(delta.scale.y, scale.minScale);
      delta.scale.z = Math.max(delta.scale.z, scale.minScale);
    }
    if (scale.maxScale !== undefined) {
      delta.scale.x = Math.min(delta.scale.x, scale.maxScale);
      delta.scale.y = Math.min(delta.scale.y, scale.maxScale);
      delta.scale.z = Math.min(delta.scale.z, scale.maxScale);
    }
  }
  
  /**
   * Extract Y rotation (spin) from euler in a reliable way
   * CRITICAL: Use 'YXZ' order for clean Y extraction
   */
  extractYRotation(euler: THREE.Euler): number {
    this.tempQuaternion.setFromEuler(euler);
    this.tempEuler.setFromQuaternion(this.tempQuaternion, 'YXZ');
    return this.tempEuler.y;
  }
  
  /**
   * Get active axes for PivotControls
   */
  getActiveAxes(): [boolean, boolean, boolean] {
    const { position } = this.config.constraints;
    return [
      !position.lockX,
      !position.lockY,
      !position.lockZ
    ];
  }
  
  /**
   * Check if any rotation is allowed
   */
  hasRotation(): boolean {
    const { rotation } = this.config.constraints;
    return !rotation.lockX || !rotation.lockY || !rotation.lockZ;
  }
  
  /**
   * Check if scaling is allowed
   */
  hasScale(): boolean {
    return this.config.constraints.scale.enabled;
  }
  
  /**
   * Get the config
   */
  getConfig(): TransformConfig {
    return this.config;
  }
  
  /**
   * Update config
   */
  updateConfig(config: Partial<TransformConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
