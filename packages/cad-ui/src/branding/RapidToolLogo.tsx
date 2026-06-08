/**
 * RapidToolLogo
 *
 * Canonical branding component for the RapidTool product family.
 * Used across ToolTrace, SoftJaws, and other family apps.
 *
 * @module @rapidtool/cad-ui/branding
 */

import React from 'react';

export interface RapidToolLogoProps {
  /** Product name displayed next to the icon */
  productName?: string;
  /** Icon size in px */
  iconSize?: number;
  /** Hide the text label */
  iconOnly?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Icon element override — defaults to a wrench/hammer motif */
  icon?: React.ReactNode;
}

const DefaultIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

export const RapidToolLogo: React.FC<RapidToolLogoProps> = ({
  productName = 'ToolTrace',
  iconSize = 16,
  iconOnly = false,
  className = '',
  icon,
}) => {
  return (
    <div className={`flex flex-col gap-0.5 leading-none ${className}`}>
      {/* Main logo row: RapidTool + Icon */}
      <div className="flex items-center gap-1">
        <div 
          className="text-lg tracking-tight font-semibold"
          style={{ fontFamily: "'Thuast', system-ui, sans-serif" }}
        >
          <span className="text-[hsl(var(--foreground))]">Rapid</span>
          <span className="text-[hsl(var(--primary))]">Tool</span>
        </div>
        
        {/* Render icon next to text - defaults to Zap in amber */}
        <div className="flex items-center justify-center flex-shrink-0 text-amber-500 fill-amber-500">
          {icon ?? (
            <svg
              width={iconSize}
              height={iconSize}
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          )}
        </div>
      </div>
      
      {/* Subscript - aligned with start */}
      {!iconOnly && productName && (
        <span 
          className="font-tech text-[9px] text-[hsl(var(--muted-foreground))] tracking-widest uppercase"
        >
          {productName}
        </span>
      )}
    </div>
  );
};

export default RapidToolLogo;
