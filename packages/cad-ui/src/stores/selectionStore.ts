/**
 * Generic Selection Store
 * 
 * Manages selection state for ANY category of items.
 * Categories are defined by the consuming application (e.g., 'part', 'support', 'node', 'edge').
 * 
 * @example
 * // In a fixture app
 * useSelectionStore.getState().select('clamp', 'clamp-123');
 * 
 * // In a circuit board app
 * useSelectionStore.getState().select('component', 'resistor-456');
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { SelectionItem } from './types';

export interface SelectionState {
  /** Currently selected item: { category, id } or null */
  selected: SelectionItem | null;
  
  /** Transform target (may differ from selection for multi-step operations) */
  transformTarget: SelectionItem | null;
  
  /** Multi-select support */
  multiSelected: SelectionItem[];
  
  /** Whether multi-select mode is active */
  isMultiSelectMode: boolean;
}

export interface SelectionActions {
  /** Select a single item (clears multi-select unless in multi-select mode) */
  select: (category: string, id: string | null) => void;
  
  /** Add to multi-selection */
  addToSelection: (category: string, id: string) => void;
  
  /** Remove from multi-selection */
  removeFromSelection: (category: string, id: string) => void;
  
  /** Toggle item in multi-selection */
  toggleSelection: (category: string, id: string) => void;
  
  /** Clear all selection */
  clear: () => void;
  
  /** Set transform target separately from selection */
  setTransformTarget: (category: string | null, id: string | null) => void;
  
  /** Enable/disable multi-select mode */
  setMultiSelectMode: (enabled: boolean) => void;
  
  /** Check if a specific item is selected */
  isSelected: (category: string, id: string) => boolean;
  
  /** Get all selected items of a category */
  getSelectedByCategory: (category: string) => string[];
}

export type SelectionStore = SelectionState & SelectionActions;

const INITIAL_STATE: SelectionState = {
  selected: null,
  transformTarget: null,
  multiSelected: [],
  isMultiSelectMode: false,
};

export const useSelectionStore = create<SelectionStore>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...INITIAL_STATE,

        select: (category, id) => {
          set((state) => {
            if (id === null) {
              state.selected = null;
              state.transformTarget = null;
              if (!state.isMultiSelectMode) {
                state.multiSelected = [];
              }
            } else {
              state.selected = { category, id };
              state.transformTarget = { category, id };
              if (!state.isMultiSelectMode) {
                state.multiSelected = [{ category, id }];
              }
            }
          });
        },

        addToSelection: (category, id) => {
          set((state) => {
            const exists = state.multiSelected.some(
              (item) => item.category === category && item.id === id
            );
            if (!exists) {
              state.multiSelected.push({ category, id });
            }
            // Update primary selection to latest
            state.selected = { category, id };
          });
        },

        removeFromSelection: (category, id) => {
          set((state) => {
            state.multiSelected = state.multiSelected.filter(
              (item) => !(item.category === category && item.id === id)
            );
            // Clear primary if it was removed
            if (state.selected?.category === category && state.selected?.id === id) {
              state.selected = state.multiSelected[0] || null;
            }
          });
        },

        toggleSelection: (category, id) => {
          const { isSelected, addToSelection, removeFromSelection } = get();
          if (isSelected(category, id)) {
            removeFromSelection(category, id);
          } else {
            addToSelection(category, id);
          }
        },

        clear: () => {
          set(INITIAL_STATE);
        },

        setTransformTarget: (category, id) => {
          set((state) => {
            state.transformTarget = category && id ? { category, id } : null;
          });
        },

        setMultiSelectMode: (enabled) => {
          set((state) => {
            state.isMultiSelectMode = enabled;
            if (!enabled) {
              // Keep only primary selection when exiting multi-select
              state.multiSelected = state.selected ? [state.selected] : [];
            }
          });
        },

        isSelected: (category, id) => {
          const { selected, multiSelected, isMultiSelectMode } = get();
          if (isMultiSelectMode) {
            return multiSelected.some(
              (item) => item.category === category && item.id === id
            );
          }
          return selected?.category === category && selected?.id === id;
        },

        getSelectedByCategory: (category) => {
          const { multiSelected } = get();
          return multiSelected
            .filter((item) => item.category === category)
            .map((item) => item.id);
        },
      }))
    ),
    { name: 'cad-selection' }
  )
);

// Selectors for optimized subscriptions
export const selectSelected = (state: SelectionStore) => state.selected;
export const selectTransformTarget = (state: SelectionStore) => state.transformTarget;
export const selectMultiSelected = (state: SelectionStore) => state.multiSelected;
export const selectIsMultiSelectMode = (state: SelectionStore) => state.isMultiSelectMode;
