/**
 * VerticalToolbar
 * 
 * A generic vertical toolbar for CAD applications.
 * Pass your own tool items with icons and handlers.
 * 
 * @module @rapidtool/cad-ui/toolbar
 */

import React, { useCallback, useMemo } from 'react';
import { cn } from '../utils/utils';

// ============================================================================
// Types
// ============================================================================

export interface ToolItem<T extends string = string> {
  /** Unique identifier for the tool */
  id: T;
  /** Icon element (React node - use any icon library) */
  icon: React.ReactNode;
  /** Display label */
  label: string;
  /** Tooltip text on hover */
  tooltip?: string;
  /** Whether the tool is disabled */
  disabled?: boolean;
  /** Optional badge content (e.g., notification count) */
  badge?: string | number;
}

export interface VerticalToolbarProps<T extends string = string> {
  /** Array of tool items to display */
  items: ToolItem<T>[];
  /** Currently active tool ID */
  activeId?: T;
  /** Callback when a tool is selected */
  onSelect?: (id: T) => void;
  /** Toolbar orientation */
  orientation?: 'vertical' | 'horizontal';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
  /** Aria label for accessibility */
  ariaLabel?: string;
  /** Custom render for tool button */
  renderButton?: (item: ToolItem<T>, isActive: boolean, onClick: () => void) => React.ReactNode;
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    backgroundColor: 'var(--toolbar-bg, transparent)',
    borderRadius: '8px',
  },
  toolbarVertical: {
    flexDirection: 'column',
    gap: '8px',
    padding: '8px',
  },
  toolbarHorizontal: {
    flexDirection: 'row',
    gap: '4px',
    padding: '4px 8px',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    backgroundColor: 'transparent',
    color: 'var(--foreground, #374151)',
    position: 'relative',
  },
  buttonSm: {
    width: '36px',
    height: '36px',
  },
  buttonMd: {
    width: '40px',
    height: '40px',
  },
  buttonLg: {
    width: '48px',
    height: '48px',
  },
  buttonActive: {
    backgroundColor: 'var(--primary-light, rgba(59, 130, 246, 0.15))',
    color: 'var(--primary, #3b82f6)',
    border: '1px solid var(--primary-border, rgba(59, 130, 246, 0.2))',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    backgroundColor: 'var(--destructive, #ef4444)',
    color: 'white',
    fontSize: '10px',
    fontWeight: 600,
    borderRadius: '9999px',
    padding: '2px 6px',
    minWidth: '16px',
    textAlign: 'center',
  },
  iconWrapper: {
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};

// ============================================================================
// Default Button Component
// ============================================================================

interface ToolButtonProps<T extends string> {
  item: ToolItem<T>;
  isActive: boolean;
  onClick: () => void;
  size: 'sm' | 'md' | 'lg';
}

function ToolButton<T extends string>({ 
  item, 
  isActive, 
  onClick, 
  size 
}: ToolButtonProps<T>) {
  const sizeStyle = size === 'sm' ? styles.buttonSm : size === 'lg' ? styles.buttonLg : styles.buttonMd;
  
  return (
    <button
      onClick={onClick}
      disabled={item.disabled}
      aria-label={item.label}
      aria-pressed={isActive}
      title={item.tooltip || item.label}
      style={{
        ...styles.button,
        ...sizeStyle,
        ...(isActive ? styles.buttonActive : {}),
        ...(item.disabled ? styles.buttonDisabled : {}),
      }}
      onMouseEnter={(e) => {
        if (!isActive && !item.disabled) {
          e.currentTarget.style.backgroundColor = 'var(--accent, rgba(59, 130, 246, 0.1))';
          e.currentTarget.style.color = 'var(--primary, #3b82f6)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive && !item.disabled) {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'var(--foreground, #374151)';
        }
      }}
    >
      <span style={styles.iconWrapper}>{item.icon}</span>
      {item.badge !== undefined && (
        <span style={styles.badge as React.CSSProperties}>{item.badge}</span>
      )}
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function VerticalToolbar<T extends string = string>({
  items,
  activeId,
  onSelect,
  orientation = 'vertical',
  size = 'md',
  className,
  ariaLabel = 'Toolbar',
  renderButton,
}: VerticalToolbarProps<T>) {
  const handleClick = useCallback((id: T) => {
    onSelect?.(id);
  }, [onSelect]);

  const toolbarStyle = {
    ...styles.toolbar,
    ...(orientation === 'vertical' ? styles.toolbarVertical : styles.toolbarHorizontal),
  } as React.CSSProperties;

  return (
    <nav
      role="toolbar"
      aria-label={ariaLabel}
      className={className}
      style={toolbarStyle}
    >
      {items.map((item) => {
        const isActive = activeId === item.id;
        const handleItemClick = () => handleClick(item.id);
        
        if (renderButton) {
          return (
            <React.Fragment key={item.id}>
              {renderButton(item, isActive, handleItemClick)}
            </React.Fragment>
          );
        }
        
        return (
          <ToolButton
            key={item.id}
            item={item}
            isActive={isActive}
            onClick={handleItemClick}
            size={size}
          />
        );
      })}
    </nav>
  );
}

export default VerticalToolbar;
