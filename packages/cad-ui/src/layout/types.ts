/**
 * Layout Types
 * 
 * Generic type definitions for dashboard layouts.
 * These types are designed to be flexible and work across different projects.
 * 
 * @module @rapidtool/cad-ui/layout
 */

import React from 'react';

// ============================================================================
// Dimension Types
// ============================================================================

/** Dimension value - can be number (pixels), string (any CSS unit), or auto */
export type DimensionValue = number | string | 'auto';

/** Layout dimension configuration */
export interface LayoutDimensions {
  /** Width of the element */
  width?: DimensionValue;
  /** Height of the element */
  height?: DimensionValue;
  /** Minimum width */
  minWidth?: DimensionValue;
  /** Maximum width */
  maxWidth?: DimensionValue;
  /** Minimum height */
  minHeight?: DimensionValue;
  /** Maximum height */
  maxHeight?: DimensionValue;
}

// ============================================================================
// Header Configuration
// ============================================================================

export interface HeaderConfig extends LayoutDimensions {
  /** Whether the header is visible */
  visible?: boolean;
  /** Fixed position at top */
  fixed?: boolean;
  /** Z-index for layering */
  zIndex?: number;
}

// ============================================================================
// Sidebar Configuration
// ============================================================================

export type SidebarPosition = 'left' | 'right';

export interface SidebarConfig extends LayoutDimensions {
  /** Whether the sidebar is visible */
  visible?: boolean;
  /** Position of the sidebar */
  position?: SidebarPosition;
  /** Collapsible sidebar support */
  collapsible?: boolean;
  /** Collapsed width when collapsible */
  collapsedWidth?: DimensionValue;
  /** Whether the sidebar starts collapsed */
  defaultCollapsed?: boolean;
  /** Show collapse button in sidebar header */
  showCollapseButton?: boolean;
  /** Z-index for layering */
  zIndex?: number;
}

// ============================================================================
// Footer Configuration
// ============================================================================

export interface FooterConfig extends LayoutDimensions {
  /** Whether the footer is visible */
  visible?: boolean;
  /** Fixed position at bottom */
  fixed?: boolean;
  /** Z-index for layering */
  zIndex?: number;
}

// ============================================================================
// Toolbar Configuration
// ============================================================================

export type ToolbarPosition = 'left' | 'right' | 'top' | 'bottom';

export interface ToolbarConfig extends LayoutDimensions {
  /** Whether the toolbar is visible */
  visible?: boolean;
  /** Position of the toolbar */
  position?: ToolbarPosition;
  /** Z-index for layering */
  zIndex?: number;
}

// ============================================================================
// Panel Configuration (for Context and Properties panels)
// ============================================================================

export interface PanelConfig extends LayoutDimensions {
  /** Whether the panel is enabled */
  enabled?: boolean;
  /** Collapsed width when panel is collapsed */
  collapsedWidth?: DimensionValue;
  /** Whether the panel starts collapsed */
  defaultCollapsed?: boolean;
  /** Z-index for layering */
  zIndex?: number;
  /** Show collapse/expand button in header */
  showCollapseButton?: boolean;
}

// ============================================================================
// Complete Layout Configuration
// ============================================================================

export interface DashboardLayoutConfig {
  /** Header configuration */
  header?: HeaderConfig;
  /** Left sidebar configuration */
  sidebar?: SidebarConfig;
  /** Right sidebar/panel configuration (legacy - use propertiesPanel instead) */
  rightPanel?: SidebarConfig;
  /** Context panel configuration (left side, after sidebar/toolbar) */
  contextPanel?: PanelConfig;
  /** Properties panel configuration (right side) */
  propertiesPanel?: PanelConfig;
  /** Footer configuration */
  footer?: FooterConfig;
  /** Toolbar configuration */
  toolbar?: ToolbarConfig;
  /** Gap between layout sections */
  gap?: DimensionValue;
  /** Padding around the entire layout */
  padding?: DimensionValue;
}

// ============================================================================
// Theme Configuration
// ============================================================================

// ThemeMode is exported from stores/types.ts to avoid duplicate exports
import type { ThemeMode } from '../stores/types';
export type { ThemeMode };

export interface ThemeColors {
  /** Primary background color */
  background?: string;
  /** Secondary/card background color */
  backgroundSecondary?: string;
  /** Primary text color */
  foreground?: string;
  /** Secondary text color */
  foregroundMuted?: string;
  /** Border color */
  border?: string;
  /** Primary accent color */
  primary?: string;
  /** Primary accent hover */
  primaryHover?: string;
  /** Accent/highlight color */
  accent?: string;
  /** Destructive/error color */
  destructive?: string;
  /** Success color */
  success?: string;
  /** Warning color */
  warning?: string;
}

export interface LayoutTheme {
  /** Theme mode */
  mode?: ThemeMode;
  /** Custom color overrides */
  colors?: ThemeColors;
}

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_HEADER_CONFIG: Required<HeaderConfig> = {
  visible: true,
  fixed: false,
  height: 56,
  width: '100%',
  minWidth: 'auto',
  maxWidth: 'auto',
  minHeight: 'auto',
  maxHeight: 'auto',
  zIndex: 100,
};

export const DEFAULT_SIDEBAR_CONFIG: Required<SidebarConfig> = {
  visible: true,
  position: 'left',
  width: 280,
  height: 'auto',
  minWidth: 200,
  maxWidth: 400,
  minHeight: 'auto',
  maxHeight: 'auto',
  collapsible: false,
  collapsedWidth: 64,
  defaultCollapsed: false,
  showCollapseButton: true,
  zIndex: 50,
};

export const DEFAULT_FOOTER_CONFIG: Required<FooterConfig> = {
  visible: true,
  fixed: false,
  height: 40,
  width: '100%',
  minWidth: 'auto',
  maxWidth: 'auto',
  minHeight: 'auto',
  maxHeight: 'auto',
  zIndex: 100,
};

export const DEFAULT_TOOLBAR_CONFIG: Required<ToolbarConfig> = {
  visible: true,
  position: 'left',
  width: 56,
  height: 'auto',
  minWidth: 'auto',
  maxWidth: 'auto',
  minHeight: 'auto',
  maxHeight: 'auto',
  zIndex: 50,
};

export const DEFAULT_CONTEXT_PANEL_CONFIG: Required<PanelConfig> = {
  enabled: false,
  width: 320,
  height: 'auto',
  minWidth: 200,
  maxWidth: 480,
  minHeight: 'auto',
  maxHeight: 'auto',
  collapsedWidth: 48,
  defaultCollapsed: false,
  showCollapseButton: true,
  zIndex: 40,
};

export const DEFAULT_PROPERTIES_PANEL_CONFIG: Required<PanelConfig> = {
  enabled: false,
  width: 280,
  height: 'auto',
  minWidth: 200,
  maxWidth: 400,
  minHeight: 'auto',
  maxHeight: 'auto',
  collapsedWidth: 48,
  defaultCollapsed: false,
  showCollapseButton: true,
  zIndex: 40,
};

export const DEFAULT_LAYOUT_CONFIG: DashboardLayoutConfig = {
  header: DEFAULT_HEADER_CONFIG,
  sidebar: DEFAULT_SIDEBAR_CONFIG,
  rightPanel: { ...DEFAULT_SIDEBAR_CONFIG, position: 'right', visible: false },
  contextPanel: DEFAULT_CONTEXT_PANEL_CONFIG,
  propertiesPanel: DEFAULT_PROPERTIES_PANEL_CONFIG,
  footer: { ...DEFAULT_FOOTER_CONFIG, visible: false },
  toolbar: DEFAULT_TOOLBAR_CONFIG,
  gap: 0,
  padding: 0,
};
