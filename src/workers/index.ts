/**
 * Workers Module
 */

export {
  detectPaper,
  traceTool,
  traceRegion,
  traceAllTools,
  grabCutInit,
  grabCutRefine,
  grabCutClear,
  contourFromMask,
  type PaperDetectionResult,
  type ToolTracingResult,
  type Stroke,
} from './cvWorkerManager';

export {
  samSegmentPoint,
  samAutoSegment,
  samPreload,
  samClear,
  samEverLoaded,
  type SamLoadProgress,
} from './samWorkerManager';
