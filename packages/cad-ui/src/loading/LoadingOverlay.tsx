/**
 * LoadingOverlay
 * 
 * A full-screen loading overlay for CAD applications.
 * Displays during heavy operations like file loading or CSG operations.
 * 
 * @module @rapidtool/cad-ui/loading
 */

import React from 'react';
import { LoadingIndicator, LoadingType, LoadingIndicatorProps } from './LoadingIndicator';

export interface LoadingOverlayProps extends Omit<LoadingIndicatorProps, 'style'> {
  /** Whether the overlay is visible */
  isVisible: boolean;
  /** Z-index for the overlay */
  zIndex?: number;
  /** Background color/opacity */
  backdropColor?: string;
  /** Whether to blur the background */
  blur?: boolean;
}

const overlayStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.2s ease-in-out',
  },
};

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  zIndex = 50,
  backdropColor = 'rgba(0, 0, 0, 0.5)',
  blur = true,
  ...indicatorProps
}) => {
  if (!isVisible) return null;

  return (
    <div
      style={{
        ...overlayStyles.overlay,
        zIndex,
        backgroundColor: backdropColor,
        backdropFilter: blur ? 'blur(4px)' : undefined,
        WebkitBackdropFilter: blur ? 'blur(4px)' : undefined,
      }}
    >
      <LoadingIndicator {...indicatorProps} />
    </div>
  );
};

export default LoadingOverlay;
