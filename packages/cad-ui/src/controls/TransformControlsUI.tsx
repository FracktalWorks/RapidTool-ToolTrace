/**
 * TransformControlsUI
 *
 * Floating toolbar for transform mode selection (move/rotate/scale).
 * Displays when transform mode is enabled.
 * 
 * @module @rapidtool/cad-ui/controls
 */

import React, { useCallback, useMemo } from 'react';
import { cn } from '../utils/utils';
import type { TransformMode } from '../stores/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TransformControlsUIProps {
  /** Whether transform controls are enabled */
  transformEnabled: boolean;
  /** Current transform mode */
  currentTransformMode: TransformMode;
  /** Mode change handler */
  onModeChange: (mode: TransformMode) => void;
}

interface ModeConfig {
  mode: TransformMode;
  icon: string;
  label: string;
  activeColor: string;
  borderColor: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MODES: readonly ModeConfig[] = [
  {
    mode: 'translate',
    icon: '↔',
    label: 'MOVE',
    activeColor: 'hsl(var(--primary))',
    borderColor: 'hsl(var(--primary) / 0.5)',
  },
  {
    mode: 'rotate',
    icon: '↻',
    label: 'ROTATE',
    activeColor: 'hsl(142 76% 36%)',
    borderColor: 'hsl(142 76% 36% / 0.5)',
  },
  {
    mode: 'scale',
    icon: '⤢',
    label: 'SCALE',
    activeColor: 'hsl(var(--accent))',
    borderColor: 'hsl(var(--accent) / 0.5)',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface ModeButtonProps {
  config: ModeConfig;
  isActive: boolean;
  onClick: () => void;
}

const ModeButton: React.FC<ModeButtonProps> = React.memo(
  ({ config, isActive, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={`${config.label} mode`}
      style={isActive ? {
        backgroundColor: config.activeColor,
        borderColor: config.borderColor,
        color: '#ffffff',
        borderWidth: '2px',
        borderStyle: 'solid',
      } : {
        backgroundColor: 'hsl(var(--muted))',
        borderColor: 'hsl(var(--border))',
        color: 'hsl(var(--muted-foreground))',
        borderWidth: '1px',
        borderStyle: 'solid',
      }}
      className={cn(
        'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
        'cursor-pointer select-none hover:scale-105',
      )}
    >
      {config.icon} {config.label}
    </button>
  )
);

ModeButton.displayName = 'ModeButton';

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

const TransformControlsUI: React.FC<TransformControlsUIProps> = ({
  transformEnabled,
  currentTransformMode,
  onModeChange,
}) => {
  const handleModeClick = useCallback(
    (mode: TransformMode) => {
      onModeChange(mode);
    },
    [onModeChange]
  );

  const modeButtons = useMemo(
    () =>
      MODES.map((config) => (
        <ModeButton
          key={config.mode}
          config={config}
          isActive={currentTransformMode === config.mode}
          onClick={() => handleModeClick(config.mode)}
        />
      )),
    [currentTransformMode, handleModeClick]
  );

  if (!transformEnabled) {
    return null;
  }

  return (
    <div
      role="toolbar"
      aria-label="Transform mode selection"
      className="absolute top-5 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto"
    >
      <div
        className="flex gap-2 text-sm p-3 rounded-lg shadow-lg backdrop-blur-sm"
        style={{
          backgroundColor: 'hsl(var(--card) / 0.95)',
          border: '1px solid hsl(var(--border))',
          color: 'hsl(var(--foreground))',
        }}
      >
        {modeButtons}
      </div>
    </div>
  );
};

export default TransformControlsUI;
