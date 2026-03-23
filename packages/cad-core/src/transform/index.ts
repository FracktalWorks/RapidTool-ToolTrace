// Types
export type {
  PositionConstraints,
  RotationConstraints,
  ScaleConstraints,
  TransformConstraints,
  TransformConfig,
  TransformDelta,
  TransformOutput,
  TransformCallbacks,
  PivotMode,
  ActivationMode,
  DeactivationMode,
  TransformComponentType,
} from './types';

// Controller
export { TransformController } from './TransformController';

// Presets
export {
  PART_TRANSFORM_CONFIG,
} from './presets';

// Utilities
export {
  calculateGizmoScale,
  calculateGizmoPosition,
  setOrbitControlsEnabled,
  dispatchTransformUpdate,
  resetPivotMatrix,
} from './utils';

// Note: React hooks (useTransformControl, etc.) are not part of cad-core.
// They live in the app at src/core/transform/hooks/ and will be moved to cad-ui later.
