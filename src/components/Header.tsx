import React from 'react';
import { Download, Hammer, Zap } from 'lucide-react';
import { RapidToolLogo, ThemeToggle } from '@rapidtool/cad-ui';
import { useAppStore } from '../stores';
import { useTheme } from '../hooks';

interface HeaderProps {
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({ className }) => {
  const { setCurrentStep, layoutState, currentStep } = useAppStore();
  const { theme, toggleTheme } = useTheme();

  const handleDownloadCAD = () => {
    setCurrentStep('export');
  };

  const steps = ['paper', 'tools', 'layout', 'design', 'export'] as const;
  const stepLabels = ['Paper', 'Trace', 'Layout', '3D', 'Export'];
  const currentIdx = steps.indexOf(currentStep);

  return (
    <header
      className={`tech-glass h-14 flex items-center justify-between px-5 border-b border-[hsl(var(--border)/0.6)] ${className}`}
    >
      {/* Logo & Brand */}
      <div className="flex items-center gap-3">
        <RapidToolLogo
          productName="ToolTrace"
          icon={<Hammer size={18} />}
        />
      </div>

      {/* Step breadcrumb — center */}
      <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
        {steps.map((step, idx) => {
          const isActive = idx === currentIdx;
          const isDone = idx < currentIdx;
          return (
            <React.Fragment key={step}>
              <button
                onClick={() => setCurrentStep(step)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all"
                style={{
                  color: isActive
                    ? 'hsl(var(--primary))'
                    : isDone
                    ? 'hsl(var(--accent))'
                    : 'hsl(var(--muted-foreground))',
                  backgroundColor: isActive
                    ? 'hsl(var(--primary) / 0.1)'
                    : 'transparent',
                  border: isActive
                    ? '1px solid hsl(var(--primary) / 0.25)'
                    : '1px solid transparent',
                }}
              >
                {isDone && <Zap className="w-3 h-3" style={{ color: 'hsl(var(--accent))' }} />}
                {stepLabels[idx]}
              </button>
              {idx < steps.length - 1 && (
                <span className="text-[hsl(var(--border))] text-xs select-none">›</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />

        {layoutState.shapes.length > 0 && (
          <button
            onClick={handleDownloadCAD}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{
              background: 'var(--gradient-primary)',
              boxShadow: 'var(--shadow-btn)',
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        )}
      </div>
    </header>
  );
};
