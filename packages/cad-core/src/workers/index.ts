// ============================================
// Workers Module Exports
// ============================================

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
export type { OffsetMeshWorkerInput, OffsetMeshWorkerOutput } from './offsetMeshWorker';
