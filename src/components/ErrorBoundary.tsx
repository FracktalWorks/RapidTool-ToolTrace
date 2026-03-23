/**
 * ErrorBoundary
 * 
 * Central error handling system for ToolTrace application.
 * Features:
 * - Catches React rendering errors
 * - Catches global unhandled errors (window.onerror)
 * - Catches unhandled promise rejections
 * - Modern popup/modal UI with blurred backdrop
 * - Professional design matching the app theme
 */

import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, Home, RefreshCw, XCircle, Copy, Check } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isClosing: boolean;
}

// ============================================================================
// Error Modal Component
// ============================================================================

interface ErrorModalProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  onGoHome: () => void;
  onRetry: () => void;
  isClosing: boolean;
}

const ErrorModal: React.FC<ErrorModalProps> = ({
  error,
  errorInfo,
  onGoHome,
  onRetry,
  isClosing
}) => {
  const [copied, setCopied] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  const handleCopyError = async () => {
    const errorText = `Error: ${error?.message || 'Unknown error'}\n\nStack:\n${error?.stack || 'No stack trace available'}\n\nComponent Stack:\n${errorInfo?.componentStack || 'No component stack available'}`;
    try {
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy error details');
    }
  };

  return (
    <div
      className={`
        fixed inset-0 z-[9999] flex items-center justify-center p-4
        transition-all duration-300 ease-out
        ${isClosing ? 'opacity-0' : 'opacity-100'}
      `}
    >
      {/* Blurred Backdrop */}
      <div
        className="absolute inset-0 bg-[hsl(var(--background)/0.6)] backdrop-blur-md"
        style={{
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      />

      {/* Error Modal Card */}
      <div
        className={`
          relative w-full max-w-lg
          bg-[hsl(var(--card))] 
          border border-[hsl(var(--border))]
          rounded-2xl shadow-2xl
          transform transition-all duration-300 ease-out
          ${isClosing ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}
        `}
        style={{
          boxShadow: `
            0 0 0 1px hsl(var(--border)),
            0 4px 6px -1px hsl(var(--foreground) / 0.05),
            0 10px 15px -3px hsl(var(--foreground) / 0.1),
            0 20px 25px -5px hsl(var(--foreground) / 0.1),
            0 25px 50px -12px hsl(var(--destructive) / 0.15)
          `,
        }}
      >
        {/* Header with Error Icon */}
        <div className="relative px-6 pt-8 pb-4">
          {/* Animated Error Icon Container */}
          <div className="absolute -top-10 left-1/2 transform -translate-x-1/2">
            <div
              className="relative flex items-center justify-center w-20 h-20 rounded-full"
              style={{
                background: `linear-gradient(135deg, hsl(var(--destructive) / 0.15), hsl(var(--destructive) / 0.05))`,
                boxShadow: `
                  0 0 40px hsl(var(--destructive) / 0.3),
                  inset 0 0 20px hsl(var(--destructive) / 0.1)
                `,
              }}
            >
              {/* Pulsing Ring */}
              <div
                className="absolute inset-0 rounded-full animate-ping opacity-30"
                style={{
                  background: `hsl(var(--destructive) / 0.3)`,
                  animationDuration: '2s',
                }}
              />
              <AlertOctagon
                className="w-10 h-10 text-[hsl(var(--destructive))] relative z-10"
                strokeWidth={1.5}
              />
            </div>
          </div>

          {/* Title & Description */}
          <div className="text-center mt-6">
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))] mb-2">
              Oops! Something went wrong
            </h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
              The application encountered an unexpected error. Don't worry, your data is safe.
            </p>
          </div>
        </div>

        {/* Error Details Section */}
        <div className="px-6 py-4">
          <div
            className="p-4 rounded-xl bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))]"
          >
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-[hsl(var(--destructive))] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[hsl(var(--foreground))] break-words">
                  {error?.message || 'An unexpected error occurred'}
                </p>
                {error?.name && error.name !== 'Error' && (
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 font-tech">
                    {error.name}
                  </p>
                )}
              </div>
            </div>

            {/* Expandable Stack Trace */}
            {(error?.stack || errorInfo?.componentStack) && (
              <div className="mt-3">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-xs text-[hsl(var(--primary))] hover:text-[hsl(var(--primary)/0.8)] transition-colors flex items-center gap-1"
                >
                  {showDetails ? 'Hide' : 'Show'} technical details
                  <svg
                    className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showDetails && (
                  <div className="mt-2 p-3 rounded-lg bg-[hsl(var(--background))] border border-[hsl(var(--border))] max-h-40 overflow-auto">
                    <pre className="text-[10px] text-[hsl(var(--muted-foreground))] font-tech whitespace-pre-wrap break-words">
                      {error?.stack || errorInfo?.componentStack || 'No stack trace available'}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Copy Error Button */}
          <button
            onClick={handleCopyError}
            className="
              mt-3 w-full flex items-center justify-center gap-2 py-2
              text-xs text-[hsl(var(--muted-foreground))]
              hover:text-[hsl(var(--foreground))]
              transition-colors
            "
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                <span className="text-[hsl(var(--success))]">Copied to clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy error details for support
              </>
            )}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="px-6 pb-6 pt-2 flex gap-3">
          {/* Retry Button */}
          <button
            onClick={onRetry}
            className="
              flex-1 flex items-center justify-center gap-2 px-4 py-3
              bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]
              rounded-xl text-sm font-medium
              border border-[hsl(var(--border))]
              hover:bg-[hsl(var(--muted)/0.8)]
              transition-all duration-200
              hover:scale-[1.02] active:scale-[0.98]
            "
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>

          {/* Go Home Button - Primary */}
          <button
            onClick={onGoHome}
            className="
              flex-1 flex items-center justify-center gap-2 px-4 py-3
              bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
              rounded-xl text-sm font-medium
              hover:bg-[hsl(var(--primary)/0.9)]
              transition-all duration-200
              hover:scale-[1.02] active:scale-[0.98]
              shadow-lg
            "
            style={{
              boxShadow: `
                0 4px 14px hsl(var(--primary) / 0.4),
                0 1px 3px hsl(var(--primary) / 0.2)
              `,
            }}
          >
            <Home className="w-4 h-4" />
            Go Home
          </button>
        </div>

        {/* Footer Text */}
        <div className="px-6 pb-4">
          <p className="text-center text-[10px] text-[hsl(var(--muted-foreground))]">
            If this problem persists, please contact support.
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Error Boundary Component
// ============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private globalErrorHandler: ((event: ErrorEvent) => void) | null = null;
  private unhandledRejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isClosing: false
    };
  }

  componentDidMount(): void {
    // Setup global error handler
    this.globalErrorHandler = (event: ErrorEvent) => {
      event.preventDefault();
      console.error('Global error caught:', event.error);
      this.setState({
        hasError: true,
        error: event.error instanceof Error ? event.error : new Error(event.message || 'Unknown error'),
        errorInfo: null,
        isClosing: false,
      });
    };

    // Setup unhandled promise rejection handler
    this.unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      console.error('Unhandled promise rejection:', event.reason);
      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason) || 'Unhandled promise rejection');
      this.setState({
        hasError: true,
        error,
        errorInfo: null,
        isClosing: false,
      });
    };

    window.addEventListener('error', this.globalErrorHandler);
    window.addEventListener('unhandledrejection', this.unhandledRejectionHandler);
  }

  componentWillUnmount(): void {
    // Cleanup global handlers
    if (this.globalErrorHandler) {
      window.removeEventListener('error', this.globalErrorHandler);
    }
    if (this.unhandledRejectionHandler) {
      window.removeEventListener('unhandledrejection', this.unhandledRejectionHandler);
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error, isClosing: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  handleGoHome = (): void => {
    // Animate out, then refresh
    this.setState({ isClosing: true });
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  handleRetry = (): void => {
    // Animate out, then reset state
    this.setState({ isClosing: true });
    setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        isClosing: false
      });
    }, 300);
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <>
          {this.props.children}
          <ErrorModal
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            onGoHome={this.handleGoHome}
            onRetry={this.handleRetry}
            isClosing={this.state.isClosing}
          />
        </>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Async Error Handler Hook
// ============================================================================

interface UseAsyncErrorReturn {
  error: Error | null;
  isError: boolean;
  clearError: () => void;
  handleAsync: <T>(promise: Promise<T>) => Promise<T | null>;
}

export function useAsyncError(): UseAsyncErrorReturn {
  const [error, setError] = React.useState<Error | null>(null);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleAsync = React.useCallback(async <T,>(promise: Promise<T>): Promise<T | null> => {
    try {
      setError(null);
      return await promise;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      console.error('Async error:', err);
      return null;
    }
  }, []);

  return {
    error,
    isError: error !== null,
    clearError,
    handleAsync,
  };
}

// ============================================================================
// Toast Notification for Errors
// ============================================================================

interface ToastState {
  message: string;
  type: 'error' | 'warning' | 'success' | 'info';
  visible: boolean;
}

interface UseToastReturn {
  toast: ToastState | null;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
  showSuccess: (message: string) => void;
  hideToast: () => void;
}

export function useToast(duration: number = 5000): UseToastReturn {
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = React.useCallback((message: string, type: ToastState['type']) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setToast({ message, type, visible: true });

    timeoutRef.current = setTimeout(() => {
      setToast((prev) => prev ? { ...prev, visible: false } : null);
    }, duration);
  }, [duration]);

  const showError = React.useCallback((message: string) => showToast(message, 'error'), [showToast]);
  const showWarning = React.useCallback((message: string) => showToast(message, 'warning'), [showToast]);
  const showSuccess = React.useCallback((message: string) => showToast(message, 'success'), [showToast]);

  const hideToast = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setToast(null);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    toast,
    showError,
    showWarning,
    showSuccess,
    hideToast,
  };
}

// ============================================================================
// Toast Component
// ============================================================================

interface ToastProps {
  toast: ToastState | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  if (!toast || !toast.visible) return null;

  const bgColor = {
    error: 'bg-[hsl(var(--destructive))]',
    warning: 'bg-[hsl(var(--warning))]',
    success: 'bg-[hsl(var(--success))]',
    info: 'bg-[hsl(var(--primary))]',
  }[toast.type];

  return (
    <div className={`
      fixed bottom-4 right-4 z-50
      px-4 py-3 rounded-lg shadow-lg
      ${bgColor} text-white
      animate-in slide-in-from-bottom-2 fade-in
      max-w-md
    `}>
      <div className="flex items-center gap-3">
        <span className="text-sm">{toast.message}</span>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white ml-2"
        >
          ×
        </button>
      </div>
    </div>
  );
};
