/**
 * StepProgress
 *
 * A lightweight step progress indicator with a progress bar and step counter.
 * Uses inline styles and CSS variables for theming — no external UI library required.
 *
 * @module @rapidtool/cad-ui/primitives
 *
 * @example
 * <StepProgress currentStep={2} totalSteps={8} />
 *
 * @example
 * // With completed / skipped counts
 * <StepProgress currentStep={3} totalSteps={8} completedCount={2} skippedCount={1} />
 */

import React from 'react';

// ============================================================================
// Types
// ============================================================================

export interface StepProgressProps {
  /** 1-based index of the current step */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** Number of completed steps (used to compute progress %) */
  completedCount?: number;
  /** Number of skipped steps (counts toward progress %) */
  skippedCount?: number;
  /** Override the progress percentage directly (0-100) */
  value?: number;
  /** Height of the progress bar in px */
  barHeight?: number;
  /** Additional CSS class on the root element */
  className?: string;
  /** Additional inline styles on the root element */
  style?: React.CSSProperties;
  /** Hide the "Step x/y" label */
  hideLabel?: boolean;
  /** Custom label formatter */
  formatLabel?: (current: number, total: number) => string;
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  trackOuter: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: '9999px',
    backgroundColor: 'hsl(var(--secondary, 220 14% 96%))',
  },
  trackInner: {
    height: '100%',
    borderRadius: '9999px',
    backgroundColor: 'hsl(var(--primary, 198 89% 50%))',
    transition: 'width 0.3s ease',
  },
  label: {
    flexShrink: 0,
    fontSize: '12px',
    color: 'hsl(var(--muted-foreground, 220 9% 46%))',
    fontFamily: 'var(--font-tech, inherit)',
    whiteSpace: 'nowrap',
  },
};

// ============================================================================
// Component
// ============================================================================

export const StepProgress: React.FC<StepProgressProps> = ({
  currentStep,
  totalSteps,
  completedCount,
  skippedCount,
  value,
  barHeight = 6,
  className,
  style,
  hideLabel = false,
  formatLabel,
}) => {
  // Calculate progress
  const progressPercent =
    value !== undefined
      ? value
      : totalSteps > 0
        ? (((completedCount ?? 0) + (skippedCount ?? 0)) / totalSteps) * 100
        : 0;

  const clampedPercent = Math.max(0, Math.min(100, progressPercent));

  const labelText = formatLabel
    ? formatLabel(currentStep, totalSteps)
    : `Step ${currentStep}/${totalSteps}`;

  return (
    <div style={{ ...styles.root, ...style }} className={className}>
      <div style={{ ...styles.trackOuter, height: `${barHeight}px` }}>
        <div style={{ ...styles.trackInner, width: `${clampedPercent}%` }} />
      </div>
      {!hideLabel && <span style={styles.label}>{labelText}</span>}
    </div>
  );
};

export default StepProgress;
