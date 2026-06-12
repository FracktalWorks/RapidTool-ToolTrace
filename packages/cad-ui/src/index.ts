/**
 * @rapidtool/cad-ui
 * 
 * Reusable React components for building internal applications.
 * 
 * Features:
 * - Layout: DashboardLayout with configurable header, sidebar, footer
 * - Sidebar: SidebarIcon, SidebarIconGroup for navigation
 * - Toolbar: VerticalToolbar for workflow tools
 * - Panels: CollapsiblePanel for property panels
 * - Viewport: ViewCube, ScalableGrid, NavigationHelp for 3D
 * - Primitives: NumberInput, PositionControl, RotationControl
 * - Stores: Selection, Workflow, UI, History state management
 * - Navigation: Workflow step management utilities
 */

// Layout - Dashboard shell with header, sidebar, footer
export * from './layout';

// Sidebar - Icon buttons and navigation groups
export * from './sidebar';

// Toolbar - Vertical/horizontal tool buttons
export * from './toolbar';

// Panels - Collapsible accordion panels
export * from './panels';

// Viewport - 3D viewport helpers (ViewCube, Grid, etc)
export * from './viewport';

// Controls - Transform mode UI
export * from './controls';

// Transform - 3D transform controls
export * from './transform';

// Loading - Loading indicators and overlays
export * from './loading';

// Primitives - Input components (NumberInput, etc)
export * from './primitives';

// Stores - Zustand state management
export * from './stores';

// Branding - RapidTool logo + theme toggle (ToolTrace-local; kept across cad-ui syncs)
export * from './branding';
