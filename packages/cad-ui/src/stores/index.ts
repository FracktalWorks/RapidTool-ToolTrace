/**
 * CAD-UI Stores
 * 
 * Generic, workflow-agnostic state management for CAD applications.
 * These stores provide foundational state management that can be used
 * by any CAD workflow application.
 * 
 * @example
 * import { useSelectionStore, useWorkflowStore } from '@rapidtool/cad-ui';
 * 
 * // Selection
 * const selected = useSelectionStore(state => state.selected);
 * useSelectionStore.getState().select('part', 'part-123');
 * 
 * // Workflow
 * useWorkflowStore.getState().configure({
 *   steps: ['import', 'design', 'export'],
 *   initialStep: 'import'
 * });
 */

// Types
export * from './types';

// Selection Store
export {
  useSelectionStore,
  selectSelected,
  selectTransformTarget,
  selectMultiSelected,
  selectIsMultiSelectMode,
  type SelectionState,
  type SelectionActions,
  type SelectionStore,
} from './selectionStore';

// Workflow Store
export {
  useWorkflowStore,
  selectActiveStep,
  selectCompletedSteps,
  selectSkippedSteps,
  selectActiveAccordion,
  selectSteps,
  type WorkflowConfig,
  type WorkflowState,
  type WorkflowActions,
  type WorkflowStore,
} from './workflowStore';

// Transform Store
export {
  useTransformStore,
  selectMode,
  selectSpace,
  selectIsPivotMode,
  selectSnap,
  selectIsDragging,
  type TransformState,
  type TransformActions,
  type TransformStore,
} from './transformStore';

// UI Store
export {
  useUIStore,
  selectTheme,
  selectPanels,
  selectViewport,
  selectDebug,
  type UIState,
  type UIActions,
  type UIStore,
} from './uiStore';

// History Store
export {
  useHistoryStore,
  selectCanUndo,
  selectCanRedo,
  selectUndoStack,
  selectRedoStack,
  type HistoryState,
  type HistoryActions,
  type HistoryStore,
} from './historyStore';
