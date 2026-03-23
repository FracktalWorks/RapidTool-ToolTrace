/**
 * Shared Types for CAD-UI Stores
 * 
 * These types are generic and workflow-agnostic.
 * App-specific types should be defined in the consuming application.
 */

/** Transform mode for 3D controls */
export type TransformMode = 'translate' | 'rotate' | 'scale' | 'off';

/** Coordinate space for transforms */
export type CoordinateSpace = 'local' | 'world';

/** Theme preference */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Generic selection item */
export interface SelectionItem {
  category: string;
  id: string;
}

/** Generic workflow step (string-based for flexibility) */
export type WorkflowStep = string;

/** Undo/redo snapshot */
export interface HistorySnapshot<T = unknown> {
  timestamp: number;
  label?: string;
  data: T;
}
