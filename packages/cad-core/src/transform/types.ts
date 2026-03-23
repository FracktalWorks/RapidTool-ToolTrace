import * as THREE from 'three';

/**
 * Position constraint configuration
 */
export interface PositionConstraints {
  lockX?: boolean;
  lockY?: boolean;
  lockZ?: boolean;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  minZ?: number;
  maxZ?: number;
  snapGrid?: number;
  snapToSurface?: boolean;
}

/**
 * Rotation constraint configuration
 */
export interface RotationConstraints {
  lockX?: boolean;
  lockY?: boolean;
  lockZ?: boolean;
  snapDegrees?: number;
}

/**
 * Scale constraint configuration
 */
export interface ScaleConstraints {
  enabled: boolean;
  uniform?: boolean;
  lockX?: boolean;
  lockY?: boolean;
  lockZ?: boolean;
  minScale?: number;
  maxScale?: number;
}

/**
 * Full transform constraints configuration
 */
export interface TransformConstraints {
  position: PositionConstraints;
  rotation: RotationConstraints;
  scale: ScaleConstraints;
}

/**
 * Pivot mode for gizmo positioning
 */
export type PivotMode = 'center' | 'origin' | 'custom' | 'world';

/**
 * How the transform control is activated
 */
export type ActivationMode = 'always' | 'double-click' | 'selection';

/**
 * How the transform control is deactivated
 */
export type DeactivationMode = 'escape' | 'click-outside' | 'manual' | 'ui-click';

/**
 * Component type for determining specific behaviors.
 * Applications can extend this type with their own component types.
 * The 'part' type is generic and suitable for any 3D model.
 */
export type TransformComponentType = string;

/**
 * Full transform configuration
 */
export interface TransformConfig {
  componentType: TransformComponentType;
  constraints: TransformConstraints;
  pivotMode: PivotMode;
  customPivot?: THREE.Vector3;
  gizmoScale?: number | 'auto';
  activationMode: ActivationMode;
  deactivationMode: DeactivationMode;
  /** Whether to use 'YXZ' euler order for clean Y extraction */
  useYXZEulerOrder?: boolean;
  /** Whether to disable orbit controls during drag */
  disableOrbitOnDrag?: boolean;
}

/**
 * Transform delta from gizmo interaction
 */
export interface TransformDelta {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

/**
 * Output transform data after constraint application
 */
export interface TransformOutput {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  /** For supports/clamps: rotation in radians around Y */
  rotationY?: number;
  /** For supports: height value */
  height?: number;
  /** For labels: depth value */
  depth?: number;
  /** For baseplate: bounds */
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/**
 * Callbacks for transform events
 */
export  interface TransformCallbacks {
  onTransformStart?: () => void;
  onTransformChange?: (output: TransformOutput) => void;
  onTransformEnd?: (output: TransformOutput) => void;
  onActivate?: () => void;
  onDeactivate?: () => void;
}
