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
  iconSize = 20,
  iconOnly = false,
  className,
  icon,
}) => (
  <div
    className={className}
    style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
  >
    {/* Icon badge */}
    <div
      style={{
        width: iconSize + 16,
        height: iconSize + 16,
        borderRadius: '10px',
        background: 'var(--gradient-brand, linear-gradient(135deg, hsl(217,91%,60%), hsl(266,85%,58%)))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
      }}
    >
      {icon ?? <DefaultIcon size={iconSize} />}
    </div>

    {/* Product name */}
    {!iconOnly && (
      <span
        className="font-brand"
        style={{
          fontSize: '1.2rem',
          fontWeight: 600,
          letterSpacing: '-0.02em',
          background: 'var(--gradient-brand, linear-gradient(135deg, hsl(217,91%,60%), hsl(266,85%,58%)))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {productName}
      </span>
    )}
  </div>
);

export default RapidToolLogo;
