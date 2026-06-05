/**
 * SkipStep
 *
 * A styled "Skip this step" action bar for optional workflow steps.
 * Uses inline styles and CSS variables — no external UI library required.
 *
 * @module @rapidtool/cad-ui/primitives
 *
 * @example
 * <SkipStep onSkip={handleSkip} />
 *
 * @example
 * // With custom label and badge text
 * <SkipStep
 *   onSkip={handleSkip}
 *   label="Skip clamps"
 *   badgeText="Not required"
 * />
 */

import React, { useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface SkipStepProps {
  /** Callback when skip is clicked */
  onSkip: () => void;
  /** Button label */
  label?: string;
  /** Badge text shown on the right */
  badgeText?: string;
  /** Whether the skip action is disabled */
  disabled?: boolean;
  /** Custom icon element (defaults to a built-in skip-forward icon) */
  icon?: React.ReactNode;
  /** Additional CSS class on the root element */
  className?: string;
  /** Additional inline styles on the root element */
  style?: React.CSSProperties;
}

// ============================================================================
// Default Icon
// ============================================================================

const SkipForwardIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </svg>
);

// ============================================================================
// Styles
// ============================================================================

const baseStyles: Record<string, React.CSSProperties> = {
  container: {
    padding: '8px',
    borderRadius: '8px',
    backgroundColor: 'hsl(var(--warning) / 0.08)',
    border: '1px solid hsl(var(--warning) / 0.25)',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    gap: '8px',
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    color: 'hsl(var(--warning))',
    transition: 'background-color 0.15s ease',
  },
  badge: {
    marginLeft: 'auto',
    fontSize: '10px',
    padding: '0 6px',
    borderRadius: '9999px',
    backgroundColor: 'hsl(var(--warning) / 0.15)',
    color: 'hsl(var(--warning))',
    border: '1px solid hsl(var(--warning) / 0.35)',
    lineHeight: '18px',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
};

// ============================================================================
// Component
// ============================================================================

export const SkipStep: React.FC<SkipStepProps> = ({
  onSkip,
  label = 'Skip this step',
  badgeText = 'Optional',
  disabled = false,
  icon,
  className,
  style,
}) => {
  const [hovered, setHovered] = useState(false);

  const buttonStyle: React.CSSProperties = {
    ...baseStyles.button,
    ...(hovered && !disabled
      ? { backgroundColor: 'hsl(var(--warning) / 0.12)' }
      : {}),
    ...(disabled
      ? { opacity: 0.5, cursor: 'not-allowed' }
      : {}),
  };

  return (
    <div style={{ ...baseStyles.container, ...style }} className={className}>
      <button
        style={buttonStyle}
        onClick={disabled ? undefined : onSkip}
        disabled={disabled}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {icon ?? <SkipForwardIcon />}
        <span>{label}</span>
        {badgeText && <span style={baseStyles.badge}>{badgeText}</span>}
      </button>
    </div>
  );
};

export default SkipStep;
