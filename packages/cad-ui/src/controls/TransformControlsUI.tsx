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
    icon: '📦',
    label: 'MOVE',
    activeColor: 'bg-blue-600',
    borderColor: 'border-blue-400',
  },
  {
    mode: 'rotate',
    icon: '🔄',
    label: 'ROTATE',
    activeColor: 'bg-green-600',
    borderColor: 'border-green-400',
  },
  {
    mode: 'scale',
    icon: '📏',
    label: 'SCALE',
    activeColor: 'bg-purple-600',
    borderColor: 'border-purple-400',
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
      className={cn(
        'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
        'cursor-pointer select-none transform hover:scale-105',
        isActive
          ? `${config.activeColor} text-white shadow-md border-2 ${config.borderColor}`
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
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
      <div className="flex gap-2 bg-black/95 text-white text-sm p-3 rounded-lg border border-gray-600 shadow-lg backdrop-blur-sm">
        {modeButtons}
      </div>
    </div>
  );
};

export default TransformControlsUI;
