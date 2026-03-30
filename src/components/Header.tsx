/**
 * Header
 * 
 * Application header with branding and download button.
 */

import React from 'react';
import { Download, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../stores';
import { useTheme } from '../hooks';
import logo from '../images/image.png';
import { AuthModal } from './AuthModal';

interface HeaderProps {
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({ className }) => {
  const { setCurrentStep, layoutState } = useAppStore();
  const { theme, toggleTheme } = useTheme();
  const [isAuthModalOpen, setIsAuthModalOpen] = React.useState(false);

  React.useEffect(() => {
    const handleOpenAuth = () => setIsAuthModalOpen(true);
    window.addEventListener('open-auth-modal', handleOpenAuth);
    return () => window.removeEventListener('open-auth-modal', handleOpenAuth);
  }, []);

  const handleDownloadCAD = () => {
    setCurrentStep('export');
  };

  return (
    <header className={`h-[72px] flex items-center justify-between px-6 bg-[hsl(var(--header-bg))] border-b border-[hsl(var(--header-border))] ${className}`}
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      {/* Logo & Brand */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 flex items-center justify-center overflow-hidden">
          <img src={logo} alt="ToolTrace Logo" className="w-full h-full object-contain" />
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-brand text-2xl font-bold tracking-tight text-[hsl(var(--foreground))]"
              style={{ letterSpacing: '-0.04em' }}
            >
              ToolTrace
            </h1>
            <span className="badge badge-primary"
              style={{ fontSize: '10px', padding: '2px 8px' }}
            >
              BETA
            </span>
          </div>
          <p className="text-[12px] text-[hsl(var(--muted-foreground))] -mt-0.5 font-semibold"
            style={{ letterSpacing: '0.04em' }}
          >
            By Fracktal Works
          </p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2.5">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="
            w-9 h-9 flex items-center justify-center rounded-xl
            bg-[hsl(var(--muted)/0.6)] text-[hsl(var(--muted-foreground))]
            hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]
            transition-all duration-200 mr-1
          "
          style={{ boxShadow: 'var(--shadow-sm)' }}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? (
            <Moon className="w-[18px] h-[18px]" />
          ) : (
            <Sun className="w-[18px] h-[18px]" />
          )}
        </button>

        {layoutState.shapes.length > 0 && (
          <>
            <div className="w-px h-6 bg-[hsl(var(--border))] mx-1" />
            <button
              onClick={handleDownloadCAD}
              className="
                flex items-center gap-2 px-5 py-2 rounded-xl text-[14px] font-bold
                text-white transition-all duration-200 ml-2
              "
              style={{
                background: 'var(--gradient-primary)',
                boxShadow: 'var(--shadow-btn)',
              }}
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </>
        )}
      </div>

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
      />
    </header>
  );
};
