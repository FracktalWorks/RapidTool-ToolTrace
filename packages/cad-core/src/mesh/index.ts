/**
 * Mesh Utilities
 * 
 * Mesh simplification, decimation, analysis, repair, and smoothing utilities.
 */

// Simplification (WASM-based quadric decimation)
export { 
  simplifyGeometry, 
  isModuleReady, 
  preloadModule 
} from './simplify';

export type { 
  SimplifyOptions, 
  SimplifyResult 
} from './simplify';

// Analysis, Repair, Decimation, Smoothing
export {
  analyzeMesh,
  repairMesh,
  cleanupCSGResult,
  decimateMesh,
  laplacianSmooth,
  boundarySmooth,
  processMeshPipeline,
  DECIMATION_THRESHOLD,
  DECIMATION_TARGET,
} from './meshAnalysis';

export type {
  MeshAnalysisResult,
  MeshRepairResult,
  DecimationResult,
  SmoothingResult,
  SmoothingOptions,
  BoundarySmoothingOptions,
  BoundarySmoothingResult,
  CSGCleanupResult,
  CSGCleanupOptions,
  ProcessingProgress,
  ProgressCallback,
  PipelineOptions,
  PipelineResult,
  MeshProcessingProgress,
} from './meshAnalysis';

// Manifold-based repair and decimation
export {
  repairMeshWithManifold,
  decimateMeshWithManifold,
  repairAndDecimateMesh,
  unionGeometriesWithManifold,
  repairMeshForExport,
  initManifold as initManifoldMeshService
} from './manifoldMeshService';

export type {
  ManifoldRepairResult,
  ManifoldDecimationResult,
  ManifoldProcessResult,
  ManifoldProgressCallback,
  ManifoldUnionResult,
  MeshRepairForExportResult
} from './manifoldMeshService';
