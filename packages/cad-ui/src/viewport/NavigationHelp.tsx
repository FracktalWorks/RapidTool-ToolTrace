/**
 * NavigationHelp - 3D Navigation Help Tooltip
 * 
 * A dismissible tooltip that shows mouse/keyboard controls for 3D navigation.
 * Remembers user's dismiss preference in localStorage.
 * 
 * @packageDocumentation
 * @module @rapidtool/cad-ui/viewport
 */

import React, { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NavigationControl {
  /** Control name (e.g., "Left Click") */
  name: string;
  /** Action description (e.g., "Rotate") */
  action: string;
  /** Color for the control indicator */
  color: string;
  /** Border color for the control indicator */
  borderColor: string;
  /** Shape: 'square' for buttons, 'circle' for scroll wheel */
  shape?: 'square' | 'circle';
}

export interface NavigationHelpProps {
  /** localStorage key for storing dismiss preference */
  storageKey?: string;
  /** Position of the tooltip */
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  /** Custom controls to display */
  controls?: NavigationControl[];
  /** Custom class name */
  className?: string;
  /** Title text */
  title?: string;
  /** Dismiss hint text */
  dismissHint?: string;
  /** Z-index for positioning */
  zIndex?: number;
  /** Delay before showing (ms) */
  showDelay?: number;
  /** Callback when dismissed */
  onDismiss?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Controls
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONTROLS: NavigationControl[] = [
  {
    name: 'Left',
    action: 'Rotate',
    color: 'rgba(59, 130, 246, 0.35)',
    borderColor: '#2563eb',
    shape: 'square',
  },
  {
    name: 'Right',
    action: 'Pan',
    color: 'rgba(34, 197, 94, 0.35)',
    borderColor: '#16a34a',
    shape: 'square',
  },
  {
    name: 'Scroll',
    action: 'Zoom',
    color: 'rgba(245, 158, 11, 0.5)',
    borderColor: '#d97706',
    shape: 'circle',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    zIndex: 50,
    backgroundColor: 'var(--popover, rgba(255,255,255,0.95))',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid var(--border, rgba(0,0,0,0.1))',
    borderRadius: 8,
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
    padding: 12,
    maxWidth: 280,
    fontFamily: 'var(--font-tech, system-ui, sans-serif)',
    transition: 'opacity 0.2s, transform 0.2s',
  },
  closeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--muted-foreground, #666)',
    fontSize: 14,
    fontWeight: 'bold',
    transition: 'background-color 0.15s',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingRight: 24,
  },
  title: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--foreground, #000)',
    margin: 0,
  },
  content: {
    display: 'flex',
    gap: 16,
    alignItems: 'center',
  },
  legend: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    fontSize: 12,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  legendIndicator: {
    width: 14,
    height: 14,
    flexShrink: 0,
  },
  legendText: {
    color: 'var(--muted-foreground, #666)',
  },
  legendAction: {
    color: 'var(--foreground, #000)',
    fontWeight: 500,
  },
  dismissHint: {
    fontSize: 10,
    color: 'var(--muted-foreground, #888)',
    textAlign: 'center' as const,
    marginTop: 8,
  },
};

const positionStyles: Record<string, React.CSSProperties> = {
  'bottom-left': { bottom: 16, left: 16 },
  'bottom-right': { bottom: 16, right: 16 },
  'top-left': { top: 16, left: 16 },
  'top-right': { top: 16, right: 16 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Mouse Illustration SVG
// ─────────────────────────────────────────────────────────────────────────────

interface MouseIllustrationProps {
  controls: NavigationControl[];
}

const MouseIllustration: React.FC<MouseIllustrationProps> = ({ controls }) => {
  const leftControl = controls.find(c => c.name.toLowerCase().includes('left'));
  const rightControl = controls.find(c => c.name.toLowerCase().includes('right'));
  const scrollControl = controls.find(c => c.name.toLowerCase().includes('scroll'));

  return (
    <svg
      width="64"
      height="88"
      viewBox="0 0 64 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      {/* Mouse body - only the bottom portion */}
      <path
        d="M8 40 V56 C8 67.046 16.954 76 28 76 H36 C47.046 76 56 67.046 56 56 V40 H8 Z"
        fill="var(--background, #fff)"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="2"
      />
      
      {/* Left button - with solid fill to cover any overlap */}
      <path
        d="M8 40 V36 C8 24.954 16.954 16 28 16 H32 V40 H8 Z"
        fill="var(--background, #fff)"
      />
      <path
        d="M8 40 V36 C8 24.954 16.954 16 28 16 H32 V40 H8 Z"
        fill={leftControl?.color || 'rgba(59, 130, 246, 0.35)'}
        stroke={leftControl?.borderColor || '#2563eb'}
        strokeWidth="2"
      />
      
      {/* Right button - with solid fill to cover any overlap */}
      <path
        d="M56 40 V36 C56 24.954 47.046 16 36 16 H32 V40 H56 Z"
        fill="var(--background, #fff)"
      />
      <path
        d="M56 40 V36 C56 24.954 47.046 16 36 16 H32 V40 H56 Z"
        fill={rightControl?.color || 'rgba(34, 197, 94, 0.35)'}
        stroke={rightControl?.borderColor || '#16a34a'}
        strokeWidth="2"
      />
      
      {/* Center divider line */}
      <line
        x1="32"
        y1="16"
        x2="32"
        y2="40"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="1"
      />
      
      {/* Scroll wheel well */}
      <rect
        x="27"
        y="24"
        width="10"
        height="16"
        rx="5"
        fill="var(--muted, rgba(0,0,0,0.1))"
        fillOpacity="0.2"
      />
      
      {/* Scroll wheel */}
      <rect
        x="29"
        y="26"
        width="6"
        height="12"
        rx="3"
        fill={scrollControl?.color || 'rgba(245, 158, 11, 0.5)'}
        stroke={scrollControl?.borderColor || '#d97706'}
        strokeWidth="1.5"
      />
      
      {/* Scroll wheel notches */}
      <line x1="32" y1="29" x2="32" y2="31" stroke="white" strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="32" y1="33" x2="32" y2="35" stroke="white" strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Mouse Icon (for header)
// ─────────────────────────────────────────────────────────────────────────────

const MouseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a8 8 0 0 0-8 8v4a8 8 0 0 0 16 0v-4a8 8 0 0 0-8-8z"/>
    <line x1="12" y1="6" x2="12" y2="10"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const NavigationHelp: React.FC<NavigationHelpProps> = ({
  storageKey = 'cad-navigation-help-dismissed',
  position = 'bottom-left',
  controls = DEFAULT_CONTROLS,
  className,
  title = '3D Navigation',
  dismissHint = 'Click × to dismiss',
  zIndex = 50,
  showDelay = 500,
  onDismiss,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  useEffect(() => {
    // Check if user has dismissed in this session (sessionStorage, not localStorage)
    const dismissed = sessionStorage.getItem(storageKey);
    if (!dismissed) {
      const timer = setTimeout(() => setIsVisible(true), showDelay);
      return () => clearTimeout(timer);
    }
  }, [storageKey, showDelay]);

  const handleClose = useCallback(() => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      setIsVisible(false);
      // Use sessionStorage so it only persists for this session
      sessionStorage.setItem(storageKey, 'true');
      onDismiss?.();
    }, 200);
  }, [storageKey, onDismiss]);

  if (!isVisible) return null;

  return (
    <div
      className={className}
      style={{
        ...styles.container,
        ...positionStyles[position],
        zIndex,
        opacity: isAnimatingOut ? 0 : 1,
        transform: isAnimatingOut ? 'translateY(8px)' : 'translateY(0)',
      }}
    >
      {/* Close button */}
      <button
        style={styles.closeButton}
        onClick={handleClose}
        aria-label="Close navigation help"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--muted, rgba(0,0,0,0.1))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        ×
      </button>

      {/* Header */}
      <div style={styles.header}>
        <MouseIcon />
        <span style={styles.title}>{title}</span>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Mouse illustration */}
        <MouseIllustration controls={controls} />

        {/* Legend */}
        <div style={styles.legend}>
          {controls.map((control, i) => (
            <div key={i} style={styles.legendItem}>
              <div
                style={{
                  ...styles.legendIndicator,
                  backgroundColor: control.color,
                  border: `1.5px solid ${control.borderColor}`,
                  borderRadius: control.shape === 'circle' ? '50%' : 2,
                }}
              />
              <span style={styles.legendText}>
                <span style={styles.legendAction}>{control.name}</span> → {control.action}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Dismiss hint */}
      {dismissHint && (
        <p style={styles.dismissHint}>{dismissHint}</p>
      )}
    </div>
  );
};

export default NavigationHelp;
