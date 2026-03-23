/**
 * LoadingIndicator
 * 
 * A generic loading indicator component for CAD applications.
 * Uses inline styles to avoid external CSS dependencies.
 * 
 * @module @rapidtool/cad-ui/loading
 */

import React from 'react';

export type LoadingType = 
  | 'file-processing' 
  | 'cad-operation' 
  | 'boolean-operation' 
  | 'stl-editing' 
  | 'export' 
  | 'import' 
  | 'kernel'
  | 'generic';

export interface LoadingIndicatorProps {
  /** Type of loading operation */
  type?: LoadingType;
  /** Custom message to display */
  message?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Additional details text */
  details?: string;
  /** Custom icon element */
  icon?: React.ReactNode;
  /** Custom styles */
  style?: React.CSSProperties;
  /** Custom class name */
  className?: string;
}

const defaultMessages: Record<LoadingType, string> = {
  'file-processing': 'Processing 3D model...',
  'cad-operation': 'Executing CAD operation...',
  'boolean-operation': 'Performing boolean operation...',
  'stl-editing': 'Applying STL transformations...',
  'export': 'Preparing export...',
  'import': 'Loading model file...',
  'kernel': 'Initializing CAD kernel...',
  'generic': 'Processing...',
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '320px',
    margin: '0 auto',
    padding: '24px',
    backgroundColor: 'var(--card, #ffffff)',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  iconWrapper: {
    position: 'relative',
  },
  spinner: {
    width: '32px',
    height: '32px',
    animation: 'spin 1s linear infinite',
    color: 'var(--primary, #3b82f6)',
  },
  textContainer: {
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  message: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--foreground, #1f2937)',
  },
  details: {
    fontSize: '12px',
    color: 'var(--muted-foreground, #6b7280)',
  },
  progressContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: 'var(--secondary, #e5e7eb)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'var(--primary, #3b82f6)',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '12px',
    textAlign: 'center',
    color: 'var(--muted-foreground, #6b7280)',
  },
  dots: {
    display: 'flex',
    gap: '4px',
  },
  dot: {
    width: '8px',
    height: '8px',
    backgroundColor: 'var(--primary, #3b82f6)',
    borderRadius: '50%',
    animation: 'bounce 0.6s ease-in-out infinite',
  },
};

// Default spinner icon
const SpinnerIcon: React.FC = () => (
  <svg
    style={styles.spinner}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      style={{ opacity: 0.25 }}
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      style={{ opacity: 0.75 }}
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  type = 'generic',
  message,
  progress,
  details,
  icon,
  style,
  className,
}) => {
  const displayMessage = message || defaultMessages[type];

  return (
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      `}</style>
      <div style={{ ...styles.container, ...style }} className={className}>
        <div style={styles.content as React.CSSProperties}>
          {/* Icon */}
          <div style={styles.iconWrapper as React.CSSProperties}>
            {icon || <SpinnerIcon />}
          </div>

          {/* Message */}
          <div style={styles.textContainer as React.CSSProperties}>
            <p style={styles.message}>{displayMessage}</p>
            {details && <p style={styles.details}>{details}</p>}
          </div>

          {/* Progress Bar */}
          {progress !== undefined && (
            <div style={styles.progressContainer as React.CSSProperties}>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${progress}%` }} />
              </div>
              <p style={styles.progressText as React.CSSProperties}>{Math.round(progress)}%</p>
            </div>
          )}

          {/* Animated Dots */}
          <div style={styles.dots}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  ...styles.dot,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default LoadingIndicator;
