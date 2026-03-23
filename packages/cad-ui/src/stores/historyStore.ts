/**
 * History Store
 * 
 * Generic undo/redo functionality.
 * Works with any serializable state via snapshots.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { HistorySnapshot } from './types';

export interface HistoryState {
  /** Undo stack */
  undoStack: HistorySnapshot[];
  
  /** Redo stack */
  redoStack: HistorySnapshot[];
  
  /** Maximum history size */
  maxSize: number;
  
  /** Whether history tracking is paused */
  isPaused: boolean;
}

export interface HistoryActions {
  /** Push a snapshot to history */
  push: <T>(data: T, label?: string) => void;
  
  /** Undo last action, returns the snapshot data */
  undo: () => HistorySnapshot | null;
  
  /** Redo last undone action, returns the snapshot data */
  redo: () => HistorySnapshot | null;
  
  /** Check if undo is available */
  canUndo: () => boolean;
  
  /** Check if redo is available */
  canRedo: () => boolean;
  
  /** Clear all history */
  clear: () => void;
  
  /** Pause history tracking */
  pause: () => void;
  
  /** Resume history tracking */
  resume: () => void;
  
  /** Set max history size */
  setMaxSize: (size: number) => void;
}

export type HistoryStore = HistoryState & HistoryActions;

const INITIAL_STATE: HistoryState = {
  undoStack: [],
  redoStack: [],
  maxSize: 50,
  isPaused: false,
};

export const useHistoryStore = create<HistoryStore>()(
  devtools(
    immer((set, get) => ({
      ...INITIAL_STATE,

      push: <T>(data: T, label?: string) => {
        const { isPaused, maxSize } = get();
        if (isPaused) return;
        
        set((state) => {
          // Add to undo stack
          state.undoStack.push({
            timestamp: Date.now(),
            label,
            data,
          });
          
          // Trim if exceeds max size
          if (state.undoStack.length > maxSize) {
            state.undoStack.shift();
          }
          
          // Clear redo stack on new action
          state.redoStack = [];
        });
      },

      undo: () => {
        const { undoStack } = get();
        if (undoStack.length === 0) return null;
        
        let snapshot: HistorySnapshot | null = null;
        
        set((state) => {
          snapshot = state.undoStack.pop() || null;
          if (snapshot) {
            state.redoStack.push(snapshot);
          }
        });
        
        return snapshot;
      },

      redo: () => {
        const { redoStack } = get();
        if (redoStack.length === 0) return null;
        
        let snapshot: HistorySnapshot | null = null;
        
        set((state) => {
          snapshot = state.redoStack.pop() || null;
          if (snapshot) {
            state.undoStack.push(snapshot);
          }
        });
        
        return snapshot;
      },

      canUndo: () => get().undoStack.length > 0,
      
      canRedo: () => get().redoStack.length > 0,

      clear: () => {
        set((state) => {
          state.undoStack = [];
          state.redoStack = [];
        });
      },

      pause: () => {
        set((state) => {
          state.isPaused = true;
        });
      },

      resume: () => {
        set((state) => {
          state.isPaused = false;
        });
      },

      setMaxSize: (size) => {
        set((state) => {
          state.maxSize = size;
          // Trim existing stacks if needed
          while (state.undoStack.length > size) {
            state.undoStack.shift();
          }
          while (state.redoStack.length > size) {
            state.redoStack.shift();
          }
        });
      },
    })),
    { name: 'cad-history' }
  )
);

// Selectors
export const selectCanUndo = (state: HistoryStore) => state.undoStack.length > 0;
export const selectCanRedo = (state: HistoryStore) => state.redoStack.length > 0;
export const selectUndoStack = (state: HistoryStore) => state.undoStack;
export const selectRedoStack = (state: HistoryStore) => state.redoStack;
