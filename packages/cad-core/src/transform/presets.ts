/**
 * Generic Transform Presets
 * 
 * Application-specific presets (fixture components) have been moved to the app.
 * This file now contains only generic presets that apply across projects.
 */

import type { TransformConfig } from './types';

/**
 * Transform config for parts (full freedom)
 * - Full XYZ translation with optional snap
 * - Full XYZ rotation with optional snap
 * - Scale enabled
 * 
 * This is a generic preset suitable for imported 3D models in any CAD application.
 */
export const PART_TRANSFORM_CONFIG: TransformConfig = {
  componentType: 'part',
  constraints: {
    position: {
      snapGrid: 5,  // Optional grid snapping
    },
    rotation: {
      snapDegrees: 15,  // 15-degree rotation snap
    },
    scale: { enabled: true, uniform: true }
  },
  pivotMode: 'center',
  gizmoScale: 'auto',
  activationMode: 'double-click',
  deactivationMode: 'escape',
  disableOrbitOnDrag: true,
};
