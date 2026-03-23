/**
 * Transform Store
 * 
 * Manages transform controls state for 3D manipulation.
 * Generic and workflow-agnostic.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { TransformMode, CoordinateSpace } from './types';

export interface TransformState {
  /** Current transform mode */
  mode: TransformMode;
  
  /** Coordinate space (local vs world) */
  space: CoordinateSpace;
  
  /** Whether pivot editing mode is active */
  isPivotMode: boolean;
  
  /** ID of the active pivot control */
  activePivotControl: string | null;
  
  /** Snap settings */
  snap: {
    enabled: boolean;
    translate: number;
    rotate: number; // degrees
    scale: number;
  };
  
  /** Whether transform controls are currently being dragged */
  isDragging: boolean;
}

export interface TransformActions {
  /** Set transform mode */
  setMode: (mode: TransformMode) => void;
  
  /** Toggle between modes */
  cycleMode: () => void;
  
  /** Set coordinate space */
  setSpace: (space: CoordinateSpace) => void;
  
  /** Toggle coordinate space */
  toggleSpace: () => void;
  
  /** Toggle pivot mode */
  togglePivotMode: () => void;
  
  /** Set pivot mode */
  setPivotMode: (enabled: boolean) => void;
  
  /** Set active pivot control */
  setActivePivotControl: (id: string | null) => void;
  
  /** Enable/disable snap */
  setSnapEnabled: (enabled: boolean) => void;
  
  /** Toggle snap */
  toggleSnap: () => void;
  
  /** Set snap values */
  setSnapValues: (values: Partial<TransformState['snap']>) => void;
  
  /** Set dragging state */
  setDragging: (isDragging: boolean) => void;
  
  /** Reset to defaults */
  reset: () => void;
}

export type TransformStore = TransformState & TransformActions;

const INITIAL_STATE: TransformState = {
  mode: 'translate',
  space: 'local',
  isPivotMode: false,
  activePivotControl: null,
  snap: {
    enabled: false,
    translate: 10,
    rotate: 15,
    scale: 0.1,
  },
  isDragging: false,
};

const MODE_CYCLE: TransformMode[] = ['translate', 'rotate', 'scale'];

export const useTransformStore = create<TransformStore>()(
  devtools(
    immer((set, get) => ({
      ...INITIAL_STATE,

      setMode: (mode) => {
        set((state) => {
          state.mode = mode;
        });
      },

      cycleMode: () => {
        set((state) => {
          const currentIndex = MODE_CYCLE.indexOf(state.mode);
          const nextIndex = (currentIndex + 1) % MODE_CYCLE.length;
          state.mode = MODE_CYCLE[nextIndex];
        });
      },

      setSpace: (space) => {
        set((state) => {
          state.space = space;
        });
      },

      toggleSpace: () => {
        set((state) => {
          state.space = state.space === 'local' ? 'world' : 'local';
        });
      },

      togglePivotMode: () => {
        set((state) => {
          state.isPivotMode = !state.isPivotMode;
        });
      },

      setPivotMode: (enabled) => {
        set((state) => {
          state.isPivotMode = enabled;
        });
      },

      setActivePivotControl: (id) => {
        set((state) => {
          state.activePivotControl = id;
        });
      },

      setSnapEnabled: (enabled) => {
        set((state) => {
          state.snap.enabled = enabled;
        });
      },

      toggleSnap: () => {
        set((state) => {
          state.snap.enabled = !state.snap.enabled;
        });
      },

      setSnapValues: (values) => {
        set((state) => {
          Object.assign(state.snap, values);
        });
      },

      setDragging: (isDragging) => {
        set((state) => {
          state.isDragging = isDragging;
        });
      },

      reset: () => {
        set(INITIAL_STATE);
      },
    })),
    { name: 'cad-transform' }
  )
);

// Selectors
export const selectMode = (state: TransformStore) => state.mode;
export const selectSpace = (state: TransformStore) => state.space;
export const selectIsPivotMode = (state: TransformStore) => state.isPivotMode;
export const selectSnap = (state: TransformStore) => state.snap;
export const selectIsDragging = (state: TransformStore) => state.isDragging;
