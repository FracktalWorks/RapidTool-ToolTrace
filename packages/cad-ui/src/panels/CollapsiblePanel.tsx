/**
 * CollapsiblePanel
 * 
 * A generic collapsible panel/accordion for CAD property panels.
 * Self-contained with inline styles, no external dependencies.
 * 
 * @module @rapidtool/cad-ui/panels
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface CollapsiblePanelProps {
  /** Panel title */
  title: string;
  /** Optional icon element */
  icon?: React.ReactNode;
  /** Whether the panel is initially open */
  defaultOpen?: boolean;
  /** Controlled open state */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Panel content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Optional actions in the header (e.g., buttons) */
  actions?: React.ReactNode;
  /** Disable the panel */
  disabled?: boolean;
  /** Optional badge/count display */
  badge?: string | number;
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderBottom: '1px solid var(--border, #e5e7eb)',
    backgroundColor: 'var(--card, #ffffff)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background-color 0.15s ease',
  },
  headerDisabled: {
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  icon: {
    width: '16px',
    height: '16px',
    color: 'var(--muted-foreground, #6b7280)',
    flexShrink: 0,
  },
  title: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--foreground, #1f2937)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    backgroundColor: 'var(--secondary, #e5e7eb)',
    color: 'var(--secondary-foreground, #1f2937)',
    fontSize: '11px',
    fontWeight: 500,
    padding: '2px 8px',
    borderRadius: '9999px',
    flexShrink: 0,
  },
  chevron: {
    width: '16px',
    height: '16px',
    color: 'var(--muted-foreground, #6b7280)',
    transition: 'transform 0.2s ease',
    flexShrink: 0,
  },
  chevronOpen: {
    transform: 'rotate(180deg)',
  },
  content: {
    overflow: 'hidden',
    transition: 'height 0.2s ease',
  },
  contentInner: {
    padding: '0 16px 16px 16px',
  },
};

// ============================================================================
// Chevron Icon
// ============================================================================

const ChevronIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    style={{
      ...styles.chevron,
      ...(open ? styles.chevronOpen : {}),
    }}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

// ============================================================================
// Main Component
// ============================================================================

export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  title,
  icon,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
  className,
  actions,
  disabled = false,
  badge,
}) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

  // Use controlled or uncontrolled state
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  // Measure content height for animation
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [children, isOpen]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    
    const newOpen = !isOpen;
    if (controlledOpen === undefined) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [isOpen, disabled, controlledOpen, onOpenChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  }, [handleToggle]);

  const handleActionsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div style={styles.container} className={className}>
      {/* Header */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={isOpen}
        aria-disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        style={{
          ...styles.header,
          ...(disabled ? styles.headerDisabled : {}),
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = 'var(--accent, rgba(0, 0, 0, 0.04))';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <div style={styles.headerLeft}>
          {icon && <span style={styles.icon}>{icon}</span>}
          <span style={styles.title}>{title}</span>
          {badge !== undefined && <span style={styles.badge}>{badge}</span>}
        </div>
        <div style={styles.headerRight}>
          {actions && <div onClick={handleActionsClick}>{actions}</div>}
          <ChevronIcon open={isOpen} />
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          ...styles.content,
          height: isOpen ? contentHeight : 0,
        }}
      >
        <div ref={contentRef} style={styles.contentInner}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default CollapsiblePanel;
