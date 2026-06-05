/**
 * ThemeToggle
 *
 * Canonical dark/light mode toggle for the RapidTool product family.
 * Framework-agnostic — uses a plain callback instead of next-themes.
 *
 * @module @rapidtool/cad-ui/branding
 */

import React from 'react';

export interface ThemeToggleProps {
  /** Current theme */
  theme: 'light' | 'dark';
  /** Toggle callback */
  onToggle: () => void;
  /** Additional CSS classes */
  className?: string;
}

const SunIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle, className }) => (
  <button
    onClick={onToggle}
    aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    className={`tech-transition ${className ?? ''}`}
    style={{
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '8px',
      border: 'none',
      background: 'transparent',
      color: 'hsl(var(--muted-foreground))',
      cursor: 'pointer',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'hsl(var(--muted))';
      e.currentTarget.style.color = 'hsl(var(--foreground))';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
    }}
  >
    {theme === 'light' ? <MoonIcon /> : <SunIcon />}
  </button>
);

export default ThemeToggle;
