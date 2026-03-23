/**
 * PositionControl - Reusable 3D position input control
 * 
 * Used for editing X/Y/Z coordinates with CAD-style axis coloring.
 * Standalone component with inline styles - no external CSS dependencies.
 * 
 * @module @rapidtool/cad-ui/primitives
 */

import React, { useCallback } from 'react';
import { NumberInput } from './NumberInput';
import { cn } from '../utils/utils';

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface PositionControlProps {
  /** Current position values */
  position: Position3D;
  /** Position change handler */
  onChange: (axis: 'x' | 'y' | 'z', value: number) => void;
  /** Reset position handler */
  onReset?: () => void;
  /** Set to baseplate handler */
  onSetToBaseplate?: () => void;
  /** Whether baseplate button should be shown */
  showBaseplateButton?: boolean;
  /** Step increment for inputs */
  step?: number;
  /** Decimal places for display */
  decimals?: number;
  /** Number of columns (2 or 3) */
  columns?: 2 | 3;
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
  buttonGroup: {
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
 * 3D position control with optional reset and baseplate buttons
 */
export const PositionControl: React.FC<PositionControlProps> = ({
  position,
  onChange,
  onReset,
  onSetToBaseplate,
  showBaseplateButton = false,
  step = 0.5,
  decimals = 1,
  columns = 3,
  label = 'Position (mm)',
  className,
}) => {
  const handleChange = useCallback(
    (axis: 'x' | 'y' | 'z') => (value: number) => {
      onChange(axis, value);
    },
    [onChange]
  );

  const gridStyle = columns === 2 ? styles.grid2 : styles.grid3;

  return (
    <div style={styles.container} className={cn(className)}>
      <div style={styles.header}>
        <span style={styles.label}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="2" x2="12" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
          {label}
        </span>
        <div style={styles.buttonGroup}>
          {showBaseplateButton && onSetToBaseplate && (
            <button
              style={styles.iconButton}
              onClick={onSetToBaseplate}
              title="Set to baseplate"
              aria-label="Set to baseplate"
            >
              ↓
            </button>
          )}
          {onReset && (
            <button
              style={styles.iconButton}
              onClick={onReset}
              title="Reset position"
              aria-label="Reset position"
            >
              ↺
            </button>
          )}
        </div>
      </div>
      <div style={gridStyle}>
        <NumberInput
          value={position.x}
          onChange={handleChange('x')}
          label="X"
          axis="x"
          step={step}
          decimals={decimals}
        />
        <NumberInput
          value={position.y}
          onChange={handleChange('y')}
          label="Y"
          axis="y"
          step={step}
          decimals={decimals}
        />
        {columns === 3 && (
          <NumberInput
            value={position.z}
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

export default PositionControl;
