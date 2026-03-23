/**
 * DashboardLayout
 * 
 * A generic, configurable layout shell for dashboard applications.
 * Provides flexible header, sidebar, footer, toolbar, context panel, properties panel,
 * and main content areas with optional collapse/expand functionality.
 * 
 * @module @rapidtool/cad-ui/layout
 * 
 * @example
 * // Basic usage
 * <DashboardLayout
 *   header={<MyHeader />}
 *   sidebar={<MySidebar />}
 *   footer={<MyFooter />}
 * >
 *   <MainContent />
 * </DashboardLayout>
 * 
 * @example
 * // With context and properties panels
 * <DashboardLayout
 *   config={{
 *     toolbar: { width: 56, visible: true },
 *     contextPanel: { enabled: true, width: 320, collapsedWidth: 48 },
 *     propertiesPanel: { enabled: true, width: 280, collapsedWidth: 48 },
 *   }}
 *   toolbar={<MyToolbar />}
 *   contextPanel={<MyContextOptions />}
 *   contextPanelHeader={<span>Context Options</span>}
 *   propertiesPanel={<MyProperties />}
 *   propertiesPanelHeader={<span>Properties</span>}
 * >
 *   <MainContent />
 * </DashboardLayout>
 */

import React, { useState, useCallback, createContext, useContext, useMemo } from 'react';
import {
  DashboardLayoutConfig,
  LayoutTheme,
  DimensionValue,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_SIDEBAR_CONFIG,
  DEFAULT_FOOTER_CONFIG,
  DEFAULT_TOOLBAR_CONFIG,
  DEFAULT_CONTEXT_PANEL_CONFIG,
  DEFAULT_PROPERTIES_PANEL_CONFIG,
  DEFAULT_LAYOUT_CONFIG,
} from './types';

// ============================================================================
// Icons (inline SVG for zero dependencies)
// ============================================================================

const PanelRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M15 3v18" />
  </svg>
);

const ChevronLeftIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

// ============================================================================
// Context
// ============================================================================

export interface DashboardLayoutContextValue {
  /** Current layout configuration */
  config: DashboardLayoutConfig;
  /** Current theme */
  theme: LayoutTheme;
  /** Whether sidebar is collapsed */
  sidebarCollapsed: boolean;
  /** Whether context panel is collapsed */
  contextPanelCollapsed: boolean;
  /** Whether properties panel is collapsed */
  propertiesPanelCollapsed: boolean;
  /** Whether right panel is collapsed (legacy - use propertiesPanelCollapsed) */
  rightPanelCollapsed: boolean;
  /** Toggle sidebar collapse state */
  toggleSidebar: () => void;
  /** Toggle context panel collapse state */
  toggleContextPanel: () => void;
  /** Toggle properties panel collapse state */
  togglePropertiesPanel: () => void;
  /** Toggle right panel collapse state (legacy - use togglePropertiesPanel) */
  toggleRightPanel: () => void;
  /** Set sidebar collapsed state */
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Set context panel collapsed state */
  setContextPanelCollapsed: (collapsed: boolean) => void;
  /** Set properties panel collapsed state */
  setPropertiesPanelCollapsed: (collapsed: boolean) => void;
  /** Set right panel collapsed state (legacy - use setPropertiesPanelCollapsed) */
  setRightPanelCollapsed: (collapsed: boolean) => void;
}

const DashboardLayoutContext = createContext<DashboardLayoutContextValue | null>(null);

/**
 * Hook to access DashboardLayout context
 * Use this in child components to access layout state and controls
 */
export function useDashboardLayout(): DashboardLayoutContextValue {
  const context = useContext(DashboardLayoutContext);
  if (!context) {
    throw new Error('useDashboardLayout must be used within a DashboardLayout');
  }
  return context;
}

// ============================================================================
// Props
// ============================================================================

export interface DashboardLayoutProps {
  /** Main content area */
  children: React.ReactNode;
  /** Header content */
  header?: React.ReactNode;
  /** Left sidebar content */
  sidebar?: React.ReactNode;
  /** Left toolbar content (fixed width toolbar) */
  toolbar?: React.ReactNode;
  /** Context panel content (collapsible left panel after sidebar/toolbar) */
  contextPanel?: React.ReactNode;
  /** Context panel header content (shown when expanded) */
  contextPanelHeader?: React.ReactNode;
  /** Properties panel content (collapsible right panel) */
  propertiesPanel?: React.ReactNode;
  /** Properties panel header content (shown when expanded) */
  propertiesPanelHeader?: React.ReactNode;
  /** Right panel content (legacy - use propertiesPanel instead) */
  rightPanel?: React.ReactNode;
  /** Footer content */
  footer?: React.ReactNode;
  /** Layout configuration - merge with defaults */
  config?: Partial<DashboardLayoutConfig>;
  /** Theme configuration */
  theme?: LayoutTheme;
  /** Additional CSS classes */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** Callback when sidebar collapse state changes */
  onSidebarCollapse?: (collapsed: boolean) => void;
  /** Callback when context panel collapse state changes */
  onContextPanelCollapse?: (collapsed: boolean) => void;
  /** Callback when properties panel collapse state changes */
  onPropertiesPanelCollapse?: (collapsed: boolean) => void;
  /** Callback when right panel collapse state changes (legacy) */
  onRightPanelCollapse?: (collapsed: boolean) => void;
  /** External control for context panel collapsed state */
  contextPanelCollapsedExternal?: boolean;
  /** External control for properties panel collapsed state */
  propertiesPanelCollapsedExternal?: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Convert dimension value to CSS string */
function toCss(value: DimensionValue): string {
  if (typeof value === 'number') {
    return `${value}px`;
  }
  return value;
}

/** Merge config with defaults */
function mergeConfig(custom?: Partial<DashboardLayoutConfig>): DashboardLayoutConfig {
  if (!custom) return DEFAULT_LAYOUT_CONFIG;
  
  return {
    header: { ...DEFAULT_HEADER_CONFIG, ...custom.header },
    sidebar: { ...DEFAULT_SIDEBAR_CONFIG, ...custom.sidebar },
    rightPanel: { 
      ...DEFAULT_SIDEBAR_CONFIG, 
      position: 'right' as const,
      visible: false,
      ...custom.rightPanel 
    },
    toolbar: { ...DEFAULT_TOOLBAR_CONFIG, ...custom.toolbar },
    contextPanel: { ...DEFAULT_CONTEXT_PANEL_CONFIG, ...custom.contextPanel },
    propertiesPanel: { ...DEFAULT_PROPERTIES_PANEL_CONFIG, ...custom.propertiesPanel },
    footer: { ...DEFAULT_FOOTER_CONFIG, visible: false, ...custom.footer },
    gap: custom.gap ?? DEFAULT_LAYOUT_CONFIG.gap,
    padding: custom.padding ?? DEFAULT_LAYOUT_CONFIG.padding,
  };
}

// ============================================================================
// Styles
// ============================================================================

const baseStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    backgroundColor: 'var(--layout-bg, var(--background, #ffffff))',
    color: 'var(--layout-fg, var(--foreground, #1f2937))',
  },
  header: {
    flexShrink: 0,
    borderBottom: '1px solid hsl(var(--border, 220 13% 18%))',
    backgroundColor: 'var(--layout-header-bg, var(--card, #ffffff))',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  toolbar: {
    flexShrink: 0,
    backgroundColor: 'var(--layout-toolbar-bg, var(--card, #ffffff))',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid hsl(var(--border, 220 13% 18%))',
  },
  sidebar: {
    flexShrink: 0,
    backgroundColor: 'var(--layout-sidebar-bg, var(--card, #ffffff))',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width 0.2s ease-in-out',
    borderRight: '1px solid hsl(var(--border, 220 13% 18%))',
  },
  sidebarHeader: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '8px',
    borderBottom: '1px solid hsl(var(--border, 220 13% 18%))',
  },
  sidebarContent: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  panel: {
    flexShrink: 0,
    backgroundColor: 'var(--layout-panel-bg, var(--card, #ffffff))',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width 0.3s ease-in-out',
    borderLeft: '1px solid hsl(var(--border, 220 13% 18%))',
    borderRight: '1px solid hsl(var(--border, 220 13% 18%))',
  },
  panelHeader: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px',
    borderBottom: '1px solid hsl(var(--border, 220 13% 18%))',
    minHeight: '40px',
  },
  panelContent: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'var(--layout-content-bg, var(--background, #f9fafb))',
    minWidth: 0,
    borderLeft: '1px solid hsl(var(--border, 220 13% 18%))',
    borderRight: '1px solid hsl(var(--border, 220 13% 18%))',
  },
  footer: {
    flexShrink: 0,
    borderTop: '1px solid hsl(var(--border, 220 13% 18%))',
    backgroundColor: 'var(--layout-footer-bg, var(--card, #ffffff))',
  },
  collapseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    borderRadius: '4px',
    color: 'var(--layout-fg, var(--foreground, #1f2937))',
    transition: 'background-color 0.15s ease',
  },
};

// ============================================================================
// Component
// ============================================================================

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  header,
  sidebar,
  toolbar,
  contextPanel,
  contextPanelHeader,
  propertiesPanel,
  propertiesPanelHeader,
  rightPanel,
  footer,
  config: customConfig,
  theme,
  className,
  style,
  onSidebarCollapse,
  onContextPanelCollapse,
  onPropertiesPanelCollapse,
  onRightPanelCollapse,
  contextPanelCollapsedExternal,
  propertiesPanelCollapsedExternal,
}) => {
  const config = useMemo(() => mergeConfig(customConfig), [customConfig]);
  
  // Internal collapse states
  const [sidebarCollapsedInternal, setSidebarCollapsedInternal] = useState(
    config.sidebar?.defaultCollapsed ?? false
  );
  const [contextPanelCollapsedInternal, setContextPanelCollapsedInternal] = useState(
    config.contextPanel?.defaultCollapsed ?? false
  );
  const [propertiesPanelCollapsedInternal, setPropertiesPanelCollapsedInternal] = useState(
    config.propertiesPanel?.defaultCollapsed ?? false
  );
  const [rightPanelCollapsed, setRightPanelCollapsedState] = useState(
    config.rightPanel?.defaultCollapsed ?? false
  );

  // Use external state if provided, otherwise internal
  const contextPanelCollapsed = contextPanelCollapsedExternal !== undefined 
    ? contextPanelCollapsedExternal 
    : contextPanelCollapsedInternal;
  const propertiesPanelCollapsed = propertiesPanelCollapsedExternal !== undefined 
    ? propertiesPanelCollapsedExternal 
    : propertiesPanelCollapsedInternal;

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedInternal(collapsed);
    onSidebarCollapse?.(collapsed);
  }, [onSidebarCollapse]);

  const setContextPanelCollapsed = useCallback((collapsed: boolean) => {
    if (contextPanelCollapsedExternal === undefined) {
      setContextPanelCollapsedInternal(collapsed);
    }
    onContextPanelCollapse?.(collapsed);
  }, [onContextPanelCollapse, contextPanelCollapsedExternal]);

  const setPropertiesPanelCollapsed = useCallback((collapsed: boolean) => {
    if (propertiesPanelCollapsedExternal === undefined) {
      setPropertiesPanelCollapsedInternal(collapsed);
    }
    onPropertiesPanelCollapse?.(collapsed);
  }, [onPropertiesPanelCollapse, propertiesPanelCollapsedExternal]);

  const setRightPanelCollapsed = useCallback((collapsed: boolean) => {
    setRightPanelCollapsedState(collapsed);
    onRightPanelCollapse?.(collapsed);
  }, [onRightPanelCollapse]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsedInternal);
  }, [sidebarCollapsedInternal, setSidebarCollapsed]);

  const toggleContextPanel = useCallback(() => {
    setContextPanelCollapsed(!contextPanelCollapsed);
  }, [contextPanelCollapsed, setContextPanelCollapsed]);

  const togglePropertiesPanel = useCallback(() => {
    setPropertiesPanelCollapsed(!propertiesPanelCollapsed);
  }, [propertiesPanelCollapsed, setPropertiesPanelCollapsed]);

  const toggleRightPanel = useCallback(() => {
    setRightPanelCollapsed(!rightPanelCollapsed);
  }, [rightPanelCollapsed, setRightPanelCollapsed]);

  const contextValue = useMemo<DashboardLayoutContextValue>(() => ({
    config,
    theme: theme ?? { mode: 'light' },
    sidebarCollapsed: sidebarCollapsedInternal,
    contextPanelCollapsed,
    propertiesPanelCollapsed,
    rightPanelCollapsed,
    toggleSidebar,
    toggleContextPanel,
    togglePropertiesPanel,
    toggleRightPanel,
    setSidebarCollapsed,
    setContextPanelCollapsed,
    setPropertiesPanelCollapsed,
    setRightPanelCollapsed,
  }), [
    config, 
    theme, 
    sidebarCollapsedInternal, 
    contextPanelCollapsed, 
    propertiesPanelCollapsed, 
    rightPanelCollapsed, 
    toggleSidebar, 
    toggleContextPanel, 
    togglePropertiesPanel, 
    toggleRightPanel, 
    setSidebarCollapsed, 
    setContextPanelCollapsed, 
    setPropertiesPanelCollapsed, 
    setRightPanelCollapsed
  ]);

  // Build theme CSS variables
  const themeVars: React.CSSProperties = theme?.colors ? {
    '--layout-bg': theme.colors.background,
    '--layout-fg': theme.colors.foreground,
    '--layout-border': theme.colors.border,
    '--layout-primary': theme.colors.primary,
    '--layout-accent': theme.colors.accent,
  } as React.CSSProperties : {};

  // Calculate widths
  const sidebarConfig = config.sidebar;
  const contextPanelConfig = config.contextPanel;
  const propertiesPanelConfig = config.propertiesPanel;

  const showSidebar = sidebar && sidebarConfig?.visible !== false;
  const showToolbar = toolbar && config.toolbar?.visible !== false;
  const showContextPanel = contextPanel && contextPanelConfig?.enabled !== false;
  const showPropertiesPanel = propertiesPanel && propertiesPanelConfig?.enabled !== false;
  const showRightPanel = rightPanel && config.rightPanel?.visible !== false;

  const sidebarWidth = showSidebar
    ? (sidebarConfig?.collapsible && sidebarCollapsedInternal
        ? toCss(sidebarConfig?.collapsedWidth ?? 64)
        : toCss(sidebarConfig?.width ?? 280))
    : 0;

  const contextPanelWidth = showContextPanel
    ? (contextPanelCollapsed
        ? toCss(contextPanelConfig?.collapsedWidth ?? 48)
        : toCss(contextPanelConfig?.width ?? 320))
    : 0;

  const propertiesPanelWidth = showPropertiesPanel
    ? (propertiesPanelCollapsed
        ? toCss(propertiesPanelConfig?.collapsedWidth ?? 48)
        : toCss(propertiesPanelConfig?.width ?? 280))
    : 0;

  const rightPanelWidth = showRightPanel
    ? (config.rightPanel?.collapsible && rightPanelCollapsed
        ? toCss(config.rightPanel?.collapsedWidth ?? 64)
        : toCss(config.rightPanel?.width ?? 280))
    : 0;

  const toolbarPosition = config.toolbar?.position ?? 'left';
  const isToolbarVertical = toolbarPosition === 'left' || toolbarPosition === 'right';

  return (
    <DashboardLayoutContext.Provider value={contextValue}>
      <div 
        style={{ 
          ...baseStyles.container, 
          ...themeVars,
          padding: config.padding ? toCss(config.padding) : undefined,
          ...style 
        }} 
        className={className}
        data-theme={theme?.mode}
      >
        {/* Header */}
        {header && config.header?.visible !== false && (
          <div 
            style={{ 
              ...baseStyles.header,
              height: toCss(config.header?.height ?? 56),
              zIndex: config.header?.zIndex ?? 100,
              position: config.header?.fixed ? 'sticky' : undefined,
              top: config.header?.fixed ? 0 : undefined,
            }}
          >
            {header}
          </div>
        )}

        {/* Main Area */}
        <div style={{ ...baseStyles.main, gap: config.gap ? toCss(config.gap) : undefined }}>
          {/* Toolbar (left position) */}
          {showToolbar && toolbarPosition === 'left' && (
            <div 
              style={{ 
                ...baseStyles.toolbar,
                width: isToolbarVertical ? toCss(config.toolbar?.width ?? 56) : '100%',
                height: !isToolbarVertical ? toCss(config.toolbar?.height ?? 48) : 'auto',
                zIndex: config.toolbar?.zIndex ?? 50,
              }}
            >
              {toolbar}
            </div>
          )}

          {/* Sidebar (with optional collapse button) */}
          {showSidebar && (
            <div 
              style={{ 
                ...baseStyles.sidebar,
                width: sidebarWidth,
                zIndex: sidebarConfig?.zIndex ?? 50,
              }}
            >
              {/* Collapse button at top right if enabled */}
              {sidebarConfig?.collapsible && sidebarConfig?.showCollapseButton !== false && (
                <div style={baseStyles.sidebarHeader}>
                  <button
                    style={baseStyles.collapseButton}
                    onClick={toggleSidebar}
                    title={sidebarCollapsedInternal ? 'Expand Sidebar' : 'Collapse Sidebar'}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--layout-hover-bg, rgba(0,0,0,0.05))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <PanelRightIcon />
                  </button>
                </div>
              )}
              <div style={baseStyles.sidebarContent}>{sidebar}</div>
            </div>
          )}

          {/* Context Panel (left side, after sidebar/toolbar) */}
          {showContextPanel && (
            <div 
              style={{ 
                ...baseStyles.panel,
                width: contextPanelWidth,
                zIndex: contextPanelConfig?.zIndex ?? 40,
              }}
            >
              {/* Panel header with collapse button */}
              {contextPanelConfig?.showCollapseButton !== false && (
                <div style={baseStyles.panelHeader}>
                  {!contextPanelCollapsed && contextPanelHeader}
                  <button
                    style={{
                      ...baseStyles.collapseButton,
                      marginLeft: contextPanelCollapsed ? 'auto' : undefined,
                      marginRight: contextPanelCollapsed ? 'auto' : undefined,
                    }}
                    onClick={toggleContextPanel}
                    title={contextPanelCollapsed ? 'Expand Panel' : 'Collapse Panel'}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--layout-hover-bg, rgba(0,0,0,0.05))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {contextPanelCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                  </button>
                </div>
              )}
              {/* Panel content - only show when expanded */}
              {!contextPanelCollapsed && (
                <div style={baseStyles.panelContent}>{contextPanel}</div>
              )}
            </div>
          )}

          {/* Main Content */}
          <div style={baseStyles.content}>{children}</div>

          {/* Properties Panel (right side) */}
          {showPropertiesPanel && (
            <div 
              style={{ 
                ...baseStyles.panel,
                width: propertiesPanelWidth,
                zIndex: propertiesPanelConfig?.zIndex ?? 40,
              }}
            >
              {/* Panel header with collapse button */}
              {propertiesPanelConfig?.showCollapseButton !== false && (
                <div style={baseStyles.panelHeader}>
                  {!propertiesPanelCollapsed && propertiesPanelHeader}
                  <button
                    style={{
                      ...baseStyles.collapseButton,
                      marginLeft: propertiesPanelCollapsed ? 'auto' : 'auto',
                      marginRight: propertiesPanelCollapsed ? 'auto' : undefined,
                    }}
                    onClick={togglePropertiesPanel}
                    title={propertiesPanelCollapsed ? 'Expand Properties' : 'Collapse Properties'}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--layout-hover-bg, rgba(0,0,0,0.05))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {propertiesPanelCollapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
                  </button>
                </div>
              )}
              {/* Panel content - only show when expanded */}
              {!propertiesPanelCollapsed && (
                <div style={baseStyles.panelContent}>{propertiesPanel}</div>
              )}
            </div>
          )}

          {/* Right Panel (legacy) */}
          {showRightPanel && (
            <div 
              style={{ 
                ...baseStyles.sidebar,
                width: rightPanelWidth,
                borderLeft: '1px solid var(--layout-border, var(--border, #e5e7eb))',
                zIndex: config.rightPanel?.zIndex ?? 50,
              }}
            >
              <div style={baseStyles.sidebarContent}>{rightPanel}</div>
            </div>
          )}

          {/* Toolbar (right position) */}
          {showToolbar && toolbarPosition === 'right' && (
            <div 
              style={{ 
                ...baseStyles.toolbar,
                width: isToolbarVertical ? toCss(config.toolbar?.width ?? 56) : '100%',
                height: !isToolbarVertical ? toCss(config.toolbar?.height ?? 48) : 'auto',
                borderLeft: '1px solid var(--layout-border, var(--border, #e5e7eb))',
                borderRight: 'none',
                zIndex: config.toolbar?.zIndex ?? 50,
              }}
            >
              {toolbar}
            </div>
          )}
        </div>

        {/* Footer */}
        {footer && config.footer?.visible !== false && (
          <div 
            style={{ 
              ...baseStyles.footer,
              height: toCss(config.footer?.height ?? 40),
              zIndex: config.footer?.zIndex ?? 100,
              position: config.footer?.fixed ? 'sticky' : undefined,
              bottom: config.footer?.fixed ? 0 : undefined,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </DashboardLayoutContext.Provider>
  );
};

export default DashboardLayout;
