/**
 * Offset Mesh Processor - Module Exports
 */

export { createOffsetMesh, cleanup, extractVertices, calculateResolution } from './offsetMeshProcessor';
export {
  initManifold,
  isManifoldReady,
  processWithManifold,
  csgSubtract,
  csgUnion,
  csgIntersect,
} from './manifoldProcessor';
export { createWatertightMeshFromHeightmap, calculateOptimalMeshSettings } from './meshGenerator';
export { fillMeshHoles, analyzeMeshHoles } from './meshHoleFiller';
export type {
  OffsetMeshOptions,
  OffsetMeshResult,
  OffsetMeshMetadata,
  HeightmapResult,
  CavitySettings,
} from './types';
export { DEFAULT_CAVITY_SETTINGS, getAdaptivePixelsPerUnit } from './types';
