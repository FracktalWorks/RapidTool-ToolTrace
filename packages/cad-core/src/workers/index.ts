// ============================================
// Workers Module Exports
// ============================================

// Parse worker (STL parsing off main thread — P2-01 + P2-02)
export {
  parseSTLInWorker,
  terminateParseWorker,
  type ParsedSTLResult,
  type ParseProgressCallback,
} from './parseWorkerManager';

export type { ParseWorkerInput, ParseWorkerOutput } from './parseWorker';

// Decimate worker (MeshOptimizer simplification off main thread — P2-D)
export {
  simplifyInWorker,
  terminateDecimateWorker,
  type DecimateResult,
  type DecimateProgressCallback,
} from './decimateWorkerManager';

export type { DecimateWorkerInput, DecimateWorkerOutput } from './decimateWorker';

export {
  performBatchCSGSubtractionInWorker,
  performCSGSubtractionInWorker,
  performBatchCSGUnionInWorker,
  performRealCSGUnionInWorker,
  performClampCSGInWorker,
  performHoleCSGInWorker,
  terminateHoleCSGWorker,
  serializeGeometryForClampWorker,
  extractGeometryForWorker,
  reconstructGeometry,
  terminateWorkers
} from './workerManager';

export type { CSGWorkerInput, CSGWorkerOutput } from './csgWorker';
export type { OffsetMeshWorkerInput, OffsetMeshWorkerOutput, OffsetGeometryWorkerInput, OffsetGeometryWorkerOutput } from './offsetMeshWorker';

// Offset mesh worker (full pipeline off main thread — P2-03)
export {
  generateOffsetMeshInWorker,
  reconstructOffsetGeometry,
  terminateOffsetMeshWorker,
  type OffsetMeshWorkerResult,
  type OffsetProgressCallback,
} from './offsetMeshWorkerManager';
