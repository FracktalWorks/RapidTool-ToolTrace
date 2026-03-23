/**
 * Generic Workflow Store
 * 
 * Manages workflow step state for ANY step-based workflow.
 * Steps are strings defined by the consuming application.
 * 
 * @example
 * // Configure steps for your app
 * useWorkflowStore.getState().configure({
 *   steps: ['import', 'baseplate', 'supports', 'clamps', 'export'],
 *   initialStep: 'import'
 * });
 * 
 * // Navigate
 * useWorkflowStore.getState().goToStep('supports');
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { WorkflowStep } from './types';

export interface WorkflowConfig {
  /** Ordered list of workflow steps */
  steps: WorkflowStep[];
  /** Initial step */
  initialStep: WorkflowStep;
  /** Whether steps must be completed in order */
  strictOrder?: boolean;
}

export interface WorkflowState {
  /** Available workflow steps */
  steps: WorkflowStep[];
  
  /** Current active step */
  activeStep: WorkflowStep | null;
  
  /** Steps that have been completed */
  completedSteps: WorkflowStep[];
  
  /** Steps that were skipped */
  skippedSteps: WorkflowStep[];
  
  /** Navigation history for back navigation */
  history: WorkflowStep[];
  
  /** Whether strict order is enforced */
  strictOrder: boolean;
  
  /** Associated accordion state (for UI sync) */
  activeAccordion: string | null;
  
  /** Associated sub-accordion state */
  activeSubAccordion: string | null;
}

export interface WorkflowActions {
  /** Configure the workflow steps */
  configure: (config: WorkflowConfig) => void;
  
  /** Navigate to a specific step */
  goToStep: (step: WorkflowStep) => void;
  
  /** Go to next step in sequence */
  nextStep: () => void;
  
  /** Go to previous step in sequence */
  prevStep: () => void;
  
  /** Go back in navigation history */
  goBack: () => void;
  
  /** Mark step as completed */
  completeStep: (step: WorkflowStep) => void;
  
  /** Mark step as skipped */
  skipStep: (step: WorkflowStep) => void;
  
  /** Reset completed/skipped state */
  resetProgress: () => void;
  
  /** Set accordion state (for UI components) */
  setActiveAccordion: (accordion: string | null, subAccordion?: string | null) => void;
  
  /** Check if step is accessible */
  canAccessStep: (step: WorkflowStep) => boolean;
  
  /** Get step index */
  getStepIndex: (step: WorkflowStep) => number;
  
  /** Reset workflow */
  reset: () => void;
}

export type WorkflowStore = WorkflowState & WorkflowActions;

const INITIAL_STATE: WorkflowState = {
  steps: [],
  activeStep: null,
  completedSteps: [],
  skippedSteps: [],
  history: [],
  strictOrder: false,
  activeAccordion: null,
  activeSubAccordion: null,
};

export const useWorkflowStore = create<WorkflowStore>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...INITIAL_STATE,

        configure: (config) => {
          set((state) => {
            state.steps = config.steps;
            state.activeStep = config.initialStep;
            state.strictOrder = config.strictOrder ?? false;
            state.completedSteps = [];
            state.skippedSteps = [];
            state.history = [];
          });
        },

        goToStep: (step) => {
          const { activeStep, steps, strictOrder, completedSteps, skippedSteps } = get();
          
          // Check if step exists
          if (!steps.includes(step)) {
            console.warn(`[WorkflowStore] Step "${step}" not found in configured steps`);
            return;
          }
          
          // Check strict order
          if (strictOrder) {
            const targetIndex = steps.indexOf(step);
            const canAccess = steps.slice(0, targetIndex).every(
              (s) => completedSteps.includes(s) || skippedSteps.includes(s)
            );
            if (!canAccess) {
              console.warn(`[WorkflowStore] Cannot access step "${step}" - previous steps not completed`);
              return;
            }
          }
          
          set((state) => {
            // Add current step to history
            if (activeStep && activeStep !== step) {
              state.history.push(activeStep);
              // Keep history limited
              if (state.history.length > 20) {
                state.history.shift();
              }
            }
            state.activeStep = step;
          });
        },

        nextStep: () => {
          const { activeStep, steps } = get();
          if (!activeStep) return;
          
          const currentIndex = steps.indexOf(activeStep);
          if (currentIndex < steps.length - 1) {
            get().goToStep(steps[currentIndex + 1]);
          }
        },

        prevStep: () => {
          const { activeStep, steps } = get();
          if (!activeStep) return;
          
          const currentIndex = steps.indexOf(activeStep);
          if (currentIndex > 0) {
            get().goToStep(steps[currentIndex - 1]);
          }
        },

        goBack: () => {
          set((state) => {
            const prevStep = state.history.pop();
            if (prevStep) {
              state.activeStep = prevStep;
            }
          });
        },

        completeStep: (step) => {
          set((state) => {
            if (!state.completedSteps.includes(step)) {
              state.completedSteps.push(step);
            }
            // Remove from skipped if it was there
            state.skippedSteps = state.skippedSteps.filter((s) => s !== step);
          });
        },

        skipStep: (step) => {
          set((state) => {
            if (!state.skippedSteps.includes(step)) {
              state.skippedSteps.push(step);
            }
            // Remove from completed if it was there
            state.completedSteps = state.completedSteps.filter((s) => s !== step);
          });
        },

        resetProgress: () => {
          set((state) => {
            state.completedSteps = [];
            state.skippedSteps = [];
          });
        },

        setActiveAccordion: (accordion, subAccordion = null) => {
          set((state) => {
            state.activeAccordion = accordion;
            state.activeSubAccordion = subAccordion;
          });
        },

        canAccessStep: (step) => {
          const { steps, strictOrder, completedSteps, skippedSteps } = get();
          
          if (!strictOrder) return true;
          
          const targetIndex = steps.indexOf(step);
          if (targetIndex === -1) return false;
          if (targetIndex === 0) return true;
          
          return steps.slice(0, targetIndex).every(
            (s) => completedSteps.includes(s) || skippedSteps.includes(s)
          );
        },

        getStepIndex: (step) => {
          return get().steps.indexOf(step);
        },

        reset: () => {
          const { steps } = get();
          set((state) => ({
            ...INITIAL_STATE,
            steps, // Keep configured steps
            activeStep: steps[0] || null,
          }));
        },
      }))
    ),
    { name: 'cad-workflow' }
  )
);

// Selectors
export const selectActiveStep = (state: WorkflowStore) => state.activeStep;
export const selectCompletedSteps = (state: WorkflowStore) => state.completedSteps;
export const selectSkippedSteps = (state: WorkflowStore) => state.skippedSteps;
export const selectActiveAccordion = (state: WorkflowStore) => state.activeAccordion;
export const selectSteps = (state: WorkflowStore) => state.steps;
