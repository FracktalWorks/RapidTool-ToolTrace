/**
 * UI Store
 * 
 * Manages UI preferences and panel states.
 * Persisted to localStorage.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { ThemeMode } from './types';

export interface UIState {
  /** Theme preference */
  theme: ThemeMode;
  
  /** Panel visibility */
  panels: {
    leftSidebar: boolean;
    rightSidebar: boolean;
    bottomPanel: boolean;
  };
  
  /** 3D viewport options */
  viewport: {
    showGrid: boolean;
    showAxes: boolean;
    showLabels: boolean;
    showWireframe: boolean;
    showBoundingBoxes: boolean;
  };
  
  /** Debug options */
  debug: {
    showStats: boolean;
    showDebugInfo: boolean;
    logEvents: boolean;
  };
}

export interface UIActions {
  /** Set theme */
  setTheme: (theme: ThemeMode) => void;
  
  /** Toggle panel */
  togglePanel: (panel: keyof UIState['panels']) => void;
  
  /** Set panel visibility */
  setPanel: (panel: keyof UIState['panels'], visible: boolean) => void;
  
  /** Toggle viewport option */
  toggleViewportOption: (option: keyof UIState['viewport']) => void;
  
  /** Set viewport option */
  setViewportOption: (option: keyof UIState['viewport'], value: boolean) => void;
  
  /** Toggle debug option */
  toggleDebugOption: (option: keyof UIState['debug']) => void;
  
  /** Reset to defaults */
  reset: () => void;
}

export type UIStore = UIState & UIActions;

const INITIAL_STATE: UIState = {
  theme: 'system',
  panels: {
    leftSidebar: true,
    rightSidebar: true,
    bottomPanel: false,
  },
  viewport: {
    showGrid: true,
    showAxes: true,
    showLabels: true,
    showWireframe: false,
    showBoundingBoxes: false,
  },
  debug: {
    showStats: false,
    showDebugInfo: false,
    logEvents: false,
  },
};

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      immer((set) => ({
        ...INITIAL_STATE,

        setTheme: (theme) => {
          set((state) => {
            state.theme = theme;
          });
        },

        togglePanel: (panel) => {
          set((state) => {
            state.panels[panel] = !state.panels[panel];
          });
        },

        setPanel: (panel, visible) => {
          set((state) => {
            state.panels[panel] = visible;
          });
        },

        toggleViewportOption: (option) => {
          set((state) => {
            state.viewport[option] = !state.viewport[option];
          });
        },

        setViewportOption: (option, value) => {
          set((state) => {
            state.viewport[option] = value;
          });
        },

        toggleDebugOption: (option) => {
          set((state) => {
            state.debug[option] = !state.debug[option];
          });
        },

        reset: () => {
          set(INITIAL_STATE);
        },
      })),
      { name: 'cad-ui-preferences' }
    ),
    { name: 'cad-ui' }
  )
);

// Selectors
export const selectTheme = (state: UIStore) => state.theme;
export const selectPanels = (state: UIStore) => state.panels;
export const selectViewport = (state: UIStore) => state.viewport;
export const selectDebug = (state: UIStore) => state.debug;
