/**
 * Production-safe logger — gated by VITE_LOG_LEVEL (+ dev). Mirrors Fixture's
 * logger so the ported auth code works unchanged.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT: LogLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || 'warn';
const ENABLED = import.meta.env.VITE_ENABLE_LOGGING === 'true' || import.meta.env.DEV;

const shouldLog = (level: LogLevel) => ENABLED && LEVELS[level] >= LEVELS[CURRENT];

export const logger = {
  debug: (message: string, ...args: unknown[]): void => { if (shouldLog('debug')) console.debug(message, ...args); },
  info: (message: string, ...args: unknown[]): void => { if (shouldLog('info')) console.info(message, ...args); },
  warn: (message: string, ...args: unknown[]): void => { if (shouldLog('warn')) console.warn(message, ...args); },
  error: (message: string, ...args: unknown[]): void => { if (shouldLog('error')) console.error(message, ...args); },
};

export default logger;
