/**
 * Header
 * 
 * Application header with branding and download button.
 */

import React from 'react';
import { Download, Wrench, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../stores';
import { useTheme } from '../hooks';

interface HeaderProps {
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({ className }) => {
  const { setCurrentStep, layoutState } = useAppStore();
  const { theme, toggleTheme } = useTheme();

  const handleDownloadCAD = () => {
    setCurrentStep('export');
  };

  return (
    <header className={`h-14 flex items-center justify-between px-5 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] ${className}`}>
      {/* Logo & Brand */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.8)] flex items-center justify-center shadow-sm">
          <Wrench className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-brand text-xl tracking-tight text-[hsl(var(--foreground))]">
              ToolTrace
            </h1>
            <span className="text-[9px] font-medium text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
              BETA
            </span>
          </div>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))] -mt-0.5">
            By Fracktal Works
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <button
          // onClick={() => { throw new Error('Theme toggle failed'); }}
          onClick={toggleTheme}
          className="
            w-9 h-9 flex items-center justify-center rounded-lg
            bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]
            hover:bg-[hsl(var(--muted)/0.8)] hover:text-[hsl(var(--foreground))]
            transition-colors
          "
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? (
            <Moon className="w-4 h-4" />
          ) : (
            <Sun className="w-4 h-4" />
          )}
        </button>

        {layoutState.shapes.length > 0 && (
          <button
            onClick={handleDownloadCAD}
            className="
              flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium
              bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]
              hover:bg-[hsl(var(--primary)/0.9)] transition-colors
              shadow-sm
            "
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        )}
      </div>
    </header>
  );
};
