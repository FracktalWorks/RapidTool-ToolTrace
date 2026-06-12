/**
 * @rapidtool/cad-core — compute
 *
 * Cache and compute infrastructure.
 * No React dependencies. No design-state types.
 */

export { ArtifactCache, artifactCache } from './artifactCache';
export type { ArtifactCacheStats } from './artifactCache';

export {
  PIPELINE_VERSION,
  makePartKey,
  makeWorkpieceKey,
  makeExportKey,
} from './artifactKeys';
export type {
  CavityGeometryInputs,
  BaseplateKeyInputs,
  WorkpieceKeyParams,
  ExportKeyParams,
} from './artifactKeys';

export { serializeGeometry, deserializeGeometry } from './geometrySerializer';

export {
  ComputeRuntime,
  computeRuntime,
  ComputeCancelledError,
  ComputeMemoryBudgetError,
  type WorkerType,
  type ComputeTask,
} from './computeRuntime';
