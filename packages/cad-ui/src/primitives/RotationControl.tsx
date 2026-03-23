/**
 * RotationControl - Reusable 3D rotation input control
 * 
 * Used for editing rotation values in degrees with consistent styling.
 * Standalone component with inline styles - no external CSS dependencies.
 * 
 * @module @rapidtool/cad-ui/primitives
 */

import React, { useCallback } from 'react';
import { NumberInput } from './NumberInput';
import { cn } from '../utils/utils';

export interface Rotation3D {
  x: number;
  y: number;
  z: number;
}

export interface RotationControlProps {
  /** Current rotation values in degrees */
  rotation: Rotation3D;
  /** Rotation change handler */
  onChange: (axis: 'x' | 'y' | 'z', degrees: number) => void;
  /** Reset rotation handler */
  onReset?: () => void;
  /** Step increment for inputs */
  step?: number;
  /** Decimal places for display */
  decimals?: number;
  /** Which axes to show (default: all) */
  axes?: ('x' | 'y' | 'z')[];
  /** Label text */
  label?: string;
  /** Additional class name */
  className?: string;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: '10px',
    fontWeight: 500,
    color: 'var(--muted-foreground, #6b7280)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  iconButton: {
    padding: '4px 6px',
    fontSize: '10px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '4px',
    color: 'var(--foreground, #1f2937)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid1: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '8px',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  grid3: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '8px',
  },
};

/**
 * 3D rotation control with optional reset button
 */
export const RotationControl: React.FC<RotationControlProps> = ({
  rotation,
  onChange,
  onReset,
  step = 5,
  decimals = 1,
  axes = ['x', 'y', 'z'],
  label = 'Rotation (°)',
  className,
}) => {
  const handleChange = useCallback(
    (axis: 'x' | 'y' | 'z') => (value: number) => {
      onChange(axis, value);
    },
    [onChange]
  );

  const gridStyle = axes.length === 1 
    ? styles.grid1 
    : axes.length === 2 
      ? styles.grid2 
      : styles.grid3;

  return (
    <div style={styles.container} className={cn(className)}>
      <div style={styles.header}>
        <span style={styles.label}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          {label}
        </span>
        {onReset && (
          <button
            style={styles.iconButton}
            onClick={onReset}
            title="Reset rotation"
            aria-label="Reset rotation"
          >
            ↺
          </button>
        )}
      </div>
      <div style={gridStyle}>
        {axes.includes('x') && (
          <NumberInput
            value={rotation.x}
            onChange={handleChange('x')}
            label="X"
            axis="x"
            step={step}
            decimals={decimals}
          />
        )}
        {axes.includes('y') && (
          <NumberInput
            value={rotation.y}
            onChange={handleChange('y')}
            label="Y"
            axis="y"
            step={step}
            decimals={decimals}
          />
        )}
        {axes.includes('z') && (
          <NumberInput
            value={rotation.z}
            onChange={handleChange('z')}
            label="Z"
            axis="z"
            step={step}
            decimals={decimals}
          />
        )}
      </div>
    </div>
  );
};

export default RotationControl;
