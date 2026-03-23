/**
 * NumberInput - Specialized numeric input with axis color support
 * 
 * Used throughout transform/position controls with consistent styling.
 * Standalone component with inline styles - no external CSS dependencies.
 * 
 * @module @rapidtool/cad-ui/primitives
 */

import React, { useCallback } from 'react';
import { cn } from '../utils/utils';

export type AxisColor = 'x' | 'y' | 'z' | 'none';

const AXIS_COLORS: Record<AxisColor, string> = {
  x: '#ef4444', // red-500
  y: '#22c55e', // green-500
  z: '#3b82f6', // blue-500
  none: '#6b7280', // gray-500
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '10px',
    fontFamily: 'monospace',
    fontWeight: 500,
  },
  input: {
    height: '28px',
    padding: '4px 8px',
    fontSize: '11px',
    fontFamily: 'monospace',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: '4px',
    backgroundColor: 'var(--input-bg, #ffffff)',
    color: 'var(--input-text, #1f2937)',
    outline: 'none',
    width: '100%',
  },
};

export interface NumberInputProps {
  /** Current value */
  value: number;
  /** Change handler */
  onChange: (value: number) => void;
  /** Input label */
  label?: string;
  /** Axis for color styling */
  axis?: AxisColor;
  /** Decimal places for display */
  decimals?: number;
  /** Step increment */
  step?: number;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Additional class names */
  className?: string;
  /** Unit suffix to display */
  unit?: string;
  /** Whether input is disabled */
  disabled?: boolean;
}

/**
 * Numeric input with axis-aware color styling
 */
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  label,
  axis = 'none',
  decimals = 1,
  step = 0.5,
  min,
  max,
  className,
  disabled = false,
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseFloat(e.target.value);
      const numValue = Number.isNaN(parsed) ? 0 : parsed;
      onChange(numValue);
    },
    [onChange]
  );

  const displayValue = value.toFixed(decimals);
  const labelColor = AXIS_COLORS[axis];

  return (
    <div style={styles.container} className={cn(className)}>
      {label && (
        <label style={{ ...styles.label, color: labelColor }}>
          {label}
        </label>
      )}
      <input
        type="number"
        value={displayValue}
        onChange={handleChange}
        style={styles.input}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
      />
    </div>
  );
};

export default NumberInput;
