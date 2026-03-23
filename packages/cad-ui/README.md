# @rapidtool/cad-ui

Reusable React components for building internal applications — dashboards, CAD tools, admin panels, and more.

> **Zero external UI-library dependency.** All components use inline styles and CSS variables so they work in any React project without requiring Tailwind, Radix, or shadcn/ui.

---

## Table of Contents

- [Installation](#installation)
- [Module Overview](#module-overview)
- [Layout](#layout)
- [Sidebar](#sidebar)
- [Toolbar](#toolbar)
- [Panels](#panels)
- [Primitives](#primitives)
- [Loading](#loading)
- [Viewport (3D)](#viewport-3d)
- [Controls](#controls)
- [Transform](#transform)
- [Stores](#stores)
- [Theming](#theming)
- [License](#license)

---

## Installation

```json
{
  "dependencies": {
    "@rapidtool/cad-ui": "*"
  }
}
```

```ts
import { DashboardLayout, SidebarIcon, StepProgress } from '@rapidtool/cad-ui';
```

---

## Module Overview

| Module | Components | Description |
|--------|-----------|-------------|
| **layout** | `DashboardLayout`, `useDashboardLayout` | Full-page shell with header, toolbar, panels, footer |
| **sidebar** | `SidebarIcon`, `SidebarIconGroup`, `SidebarDivider`, `SidebarSection` | Icon buttons & navigation groups |
| **toolbar** | `ToolbarLayout` | Generic toolbar for workflow tools |
| **panels** | `CollapsiblePanel` | Accordion-style collapsible panels |
| **primitives** | `NumberInput`, `PositionControl`, `RotationControl`, `PartThumbnail`, `StepProgress`, `SkipStep` | Input components & workflow UI |
| **loading** | `ProcessingIndicator`, `ProcessingOverlay` | Loading states & overlays |
| **viewport** | `ViewCube`, `ScalableGrid`, `SnapIndicator`, `NavigationHelp` | 3D viewport helpers |
| **controls** | `TransformModeControls` | Transform mode selector (translate/rotate/scale) |
| **transform** | `SelectableTransformControls` | R3F-based transform gizmo |
| **stores** | 5 Zustand stores + selectors | Selection, Workflow, Transform, UI, History state |

---

## Layout

### DashboardLayout

A flexible full-page layout shell with configurable regions.

```tsx
import { DashboardLayout } from '@rapidtool/cad-ui';

function App() {
  return (
    <DashboardLayout
      config={{
        header: { height: 56, visible: true },
        toolbar: { width: 56, position: 'left' },
        contextPanel: { enabled: true, width: 320, collapsedWidth: 48 },
        propertiesPanel: { enabled: true, width: 280, collapsedWidth: 48 },
        footer: { height: 40 },
      }}
      header={<Header />}
      toolbar={<MyToolbar />}
      contextPanel={<ContextOptions />}
      contextPanelHeader={<span>Context Options</span>}
      propertiesPanel={<PropertiesPanel />}
      propertiesPanelHeader={<span>Properties</span>}
      footer={<StatusBar />}
    >
      <MainViewport />
    </DashboardLayout>
  );
}
```

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `children` | `ReactNode` | Main content area |
| `header` | `ReactNode` | Header bar |
| `toolbar` | `ReactNode` | Fixed-width toolbar |
| `sidebar` | `ReactNode` | Collapsible sidebar |
| `contextPanel` | `ReactNode` | Left collapsible panel |
| `contextPanelHeader` | `ReactNode` | Header shown when context panel is expanded |
| `propertiesPanel` | `ReactNode` | Right collapsible panel |
| `propertiesPanelHeader` | `ReactNode` | Header shown when properties panel is expanded |
| `rightPanel` | `ReactNode` | Legacy right panel |
| `footer` | `ReactNode` | Footer bar |
| `config` | `DashboardLayoutConfig` | Dimensions & visibility |
| `theme` | `LayoutTheme` | Color overrides |
| `contextPanelCollapsedExternal` | `boolean` | External collapse control |
| `propertiesPanelCollapsedExternal` | `boolean` | External collapse control |
| `onContextPanelCollapse` | `(collapsed: boolean) => void` | Collapse callback |
| `onPropertiesPanelCollapse` | `(collapsed: boolean) => void` | Collapse callback |
| `onSidebarCollapse` | `(collapsed: boolean) => void` | Collapse callback |

#### Config

```ts
interface DashboardLayoutConfig {
  header?:          { height?, visible?, fixed?, zIndex? }
  sidebar?:         { width?, visible?, collapsible?, collapsedWidth?, showCollapseButton?, defaultCollapsed?, zIndex? }
  toolbar?:         { width?, height?, visible?, position?: 'left' | 'right', zIndex? }
  contextPanel?:    { enabled?, width?, collapsedWidth?, showCollapseButton?, defaultCollapsed?, zIndex? }
  propertiesPanel?: { enabled?, width?, collapsedWidth?, showCollapseButton?, defaultCollapsed?, zIndex? }
  rightPanel?:      { width?, visible?, collapsible?, collapsedWidth?, zIndex? }
  footer?:          { height?, visible?, fixed?, zIndex? }
  gap?:             number | string
  padding?:         number | string
}
```

### useDashboardLayout

Access layout state from any child component.

```tsx
import { useDashboardLayout } from '@rapidtool/cad-ui';

function MyPanel() {
  const {
    contextPanelCollapsed,
    propertiesPanelCollapsed,
    toggleContextPanel,
    togglePropertiesPanel,
  } = useDashboardLayout();

  return <button onClick={toggleContextPanel}>Toggle Panel</button>;
}
```

#### Externally Controlled Panels

```tsx
function App() {
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(false);

  return (
    <DashboardLayout
      contextPanel={<ContextOptions />}
      propertiesPanel={<Properties />}
      contextPanelCollapsedExternal={contextCollapsed}
      propertiesPanelCollapsedExternal={propertiesCollapsed}
      onContextPanelCollapse={setContextCollapsed}
      onPropertiesPanelCollapse={setPropertiesCollapsed}
    >
      <MainContent />
    </DashboardLayout>
  );
}
```

---

## Sidebar

Reusable icon-button components for sidebars and toolbars.

### SidebarIcon

```tsx
import { SidebarIcon } from '@rapidtool/cad-ui';
import { Home, Settings, Bell } from 'lucide-react';

<SidebarIcon icon={<Home />} label="Home" onClick={handleHome} />
<SidebarIcon icon={<Settings />} label="Settings" active />
<SidebarIcon icon={<Bell />} label="Alerts" badge={3} badgeVariant="destructive" />
<SidebarIcon icon={<Home />} label="Home" showLabel size="lg" />
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `ReactNode` | *required* | Icon element (any library) |
| `label` | `string` | *required* | Accessible label & tooltip |
| `tooltip` | `string` | label | Custom tooltip |
| `active` | `boolean` | `false` | Active/selected state (blue highlight) |
| `disabled` | `boolean` | `false` | Disabled state |
| `badge` | `string \| number` | — | Badge content |
| `badgeVariant` | `'default' \| 'destructive' \| 'warning' \| 'success'` | `'default'` | Badge color |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Button size |
| `variant` | `'default' \| 'ghost' \| 'outline' \| 'filled'` | `'default'` | Visual style |
| `showLabel` | `boolean` | `false` | Show text label |
| `labelPosition` | `'right' \| 'bottom'` | `'right'` | Label placement |
| `onClick` | `(e: MouseEvent) => void` | — | Click handler |

#### Size Reference

| Size | Button | Icon | Font |
|------|--------|------|------|
| `xs` | 28px | 14px | 10px |
| `sm` | 32px | 16px | 11px |
| `md` | 40px | 20px | 12px |
| `lg` | 48px | 24px | 13px |
| `xl` | 56px | 28px | 14px |

### SidebarIconGroup

```tsx
import { SidebarIconGroup, SidebarIcon, SidebarDivider } from '@rapidtool/cad-ui';

<SidebarIconGroup direction="vertical" gap={8}>
  <SidebarIcon icon={<Home />} label="Home" />
  <SidebarIcon icon={<Search />} label="Search" />
  <SidebarDivider />
  <SidebarIcon icon={<Settings />} label="Settings" />
</SidebarIconGroup>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `direction` | `'vertical' \| 'horizontal'` | `'vertical'` | Layout direction |
| `gap` | `number` | `8` | Gap between icons (px) |
| `align` | `'start' \| 'center' \| 'end'` | `'center'` | Cross-axis alignment |

### SidebarDivider

```tsx
<SidebarDivider direction="vertical" spacing={8} />
```

### SidebarSection

```tsx
<SidebarSection title="Tools" collapsible defaultCollapsed={false} gap={4}>
  <SidebarIcon icon={<Pen />} label="Draw" />
  <SidebarIcon icon={<Eraser />} label="Erase" />
</SidebarSection>
```

---

## Toolbar

### ToolbarLayout

A generic toolbar shell that renders a list of tool configurations.

```tsx
import { ToolbarLayout } from '@rapidtool/cad-ui';

const tools = [
  { id: 'select', icon: <Pointer />, label: 'Select', tooltip: 'Select objects' },
  { id: 'move', icon: <Move />, label: 'Move', tooltip: 'Move objects' },
];

<ToolbarLayout
  tools={tools}
  activeTool="select"
  onToolSelect={(id) => setActiveTool(id)}
  direction="vertical"
/>
```

---

## Panels

### CollapsiblePanel

Accordion-style panel for property editors.

```tsx
import { CollapsiblePanel } from '@rapidtool/cad-ui';

<CollapsiblePanel
  title="Transform"
  icon={<Move />}
  defaultExpanded
  badge="3"
>
  <PositionControl value={position} onChange={setPosition} />
  <RotationControl value={rotation} onChange={setRotation} />
</CollapsiblePanel>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | *required* | Panel header text |
| `icon` | `ReactNode` | — | Header icon |
| `defaultExpanded` | `boolean` | `false` | Initial expanded state |
| `badge` | `string \| number` | — | Badge in header |
| `disabled` | `boolean` | `false` | Disable toggle |
| `onToggle` | `(expanded: boolean) => void` | — | Toggle callback |

---

## Primitives

Lightweight input components and workflow UI elements.

### NumberInput

Axis-aware numeric input with step buttons and drag support.

```tsx
import { NumberInput } from '@rapidtool/cad-ui';

<NumberInput
  value={42}
  onChange={(v) => setValue(v)}
  label="Width"
  axis="x"
  min={0}
  max={100}
  step={0.5}
  precision={2}
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `number` | *required* | Current value |
| `onChange` | `(value: number) => void` | *required* | Change handler |
| `label` | `string` | — | Input label |
| `axis` | `AxisColor` | — | Color-code by axis (`'x' \| 'y' \| 'z'`) |
| `min` / `max` | `number` | — | Value bounds |
| `step` | `number` | `1` | Increment step |
| `precision` | `number` | — | Decimal places |
| `disabled` | `boolean` | `false` | Disabled state |
| `suffix` | `string` | — | Unit suffix (e.g. `"mm"`) |

### PositionControl

Three-axis position editor using `NumberInput`.

```tsx
import { PositionControl } from '@rapidtool/cad-ui';

<PositionControl
  value={{ x: 0, y: 10, z: 5 }}
  onChange={(pos) => setPosition(pos)}
  label="Position"
/>
```

### RotationControl

Three-axis rotation editor in degrees.

```tsx
import { RotationControl } from '@rapidtool/cad-ui';

<RotationControl
  value={{ x: 0, y: 90, z: 0 }}
  onChange={(rot) => setRotation(rot)}
  label="Rotation"
/>
```

### PartThumbnail

3D mesh thumbnail renderer using a shared offscreen WebGL context.

```tsx
import { PartThumbnail } from '@rapidtool/cad-ui';

<PartThumbnail
  geometry={meshGeometry}
  color="#3b82f6"
  size={64}
/>
```

### StepProgress

Step progress bar with counter label.

```tsx
import { StepProgress } from '@rapidtool/cad-ui';

<StepProgress
  currentStep={3}
  totalSteps={8}
  completedCount={2}
  skippedCount={1}
  barHeight={6}
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentStep` | `number` | *required* | 1-based current step index |
| `totalSteps` | `number` | *required* | Total number of steps |
| `completedCount` | `number` | `0` | Completed steps (for progress %) |
| `skippedCount` | `number` | `0` | Skipped steps (counts toward progress %) |
| `value` | `number` | — | Override progress % directly (0–100) |
| `barHeight` | `number` | `6` | Progress bar height in px |
| `hideLabel` | `boolean` | `false` | Hide the "Step x/y" text |
| `formatLabel` | `(current, total) => string` | — | Custom label formatter |

### SkipStep

"Skip this step" action bar for optional workflow steps.

```tsx
import { SkipStep } from '@rapidtool/cad-ui';

<SkipStep onSkip={handleSkip} />
<SkipStep onSkip={handleSkip} label="Skip clamps" badgeText="Not required" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSkip` | `() => void` | *required* | Skip callback |
| `label` | `string` | `'Skip this step'` | Button label |
| `badgeText` | `string` | `'Optional'` | Badge text |
| `disabled` | `boolean` | `false` | Disabled state |
| `icon` | `ReactNode` | built-in SVG | Custom icon |

---

## Loading

### ProcessingIndicator

Inline loading card with progress and contextual messages.

```tsx
import { ProcessingIndicator } from '@rapidtool/cad-ui';

<ProcessingIndicator
  operationType="boolean-operation"
  progress={65}
  message="Subtracting workpiece geometry..."
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `operationType` | `OperationType` | `'generic'` | `'file-processing' \| 'cad-operation' \| 'boolean-operation' \| 'stl-editing' \| 'export' \| 'import' \| 'kernel' \| 'generic'` |
| `progress` | `number` | — | 0–100 progress value |
| `message` | `string` | — | Status message |
| `showProgress` | `boolean` | `true` | Show progress bar |
| `showTips` | `boolean` | `true` | Show contextual tips |
| `compact` | `boolean` | `false` | Compact variant |

### ProcessingOverlay

Full-screen overlay wrapping `ProcessingIndicator`.

```tsx
import { ProcessingOverlay } from '@rapidtool/cad-ui';

<ProcessingOverlay
  visible={isProcessing}
  operationType="export"
  progress={80}
  message="Exporting STL file..."
/>
```

---

## Viewport (3D)

> **Peer dependencies:** `@react-three/fiber`, `@react-three/drei`, `three` (optional)

### ViewCube

Interactive 3D orientation cube.

```tsx
import { ViewCube } from '@rapidtool/cad-ui';

// Inside a <Canvas>
<ViewCube onViewChange={(view) => setCamera(view)} size={80} />
```

| View values: `'front'`, `'back'`, `'left'`, `'right'`, `'top'`, `'bottom'`, `'isometric'`, `'isometric-back'`

### ScalableGrid

Dynamic ground-plane grid that scales with zoom level.

```tsx
import { ScalableGrid } from '@rapidtool/cad-ui';

<ScalableGrid
  size={200}
  divisions={20}
  fadeDistance={100}
  plane="xz"
/>
```

### NavigationHelp

Mouse/keyboard navigation overlay.

```tsx
import { NavigationHelp } from '@rapidtool/cad-ui';

<NavigationHelp
  controls={[
    { input: 'Left Click', action: 'Rotate' },
    { input: 'Right Click', action: 'Pan' },
    { input: 'Scroll', action: 'Zoom' },
  ]}
/>
```

### SnapIndicator

Visual feedback for snapping during transforms.

```tsx
import { SnapIndicator } from '@rapidtool/cad-ui';

// Inside a <Canvas>
<SnapIndicator position={snapPoint} visible={isSnapping} />
```

---

## Controls

### TransformModeControls

Floating toolbar for switching between translate, rotate, and scale modes.

```tsx
import { TransformModeControls } from '@rapidtool/cad-ui';

<TransformModeControls
  mode={transformMode}
  onModeChange={setTransformMode}
  space={transformSpace}
/>
```

---

## Transform

### SelectableTransformControls

R3F-based transform gizmo with selection, drag, and pivot support.

```tsx
import { SelectableTransformControls } from '@rapidtool/cad-ui';

// Inside a <Canvas>
<SelectableTransformControls
  object={selectedMesh}
  mode="translate"
  space="world"
  onDragStart={() => setDragging(true)}
  onDragEnd={(matrix) => applyTransform(matrix)}
/>
```

---

## Stores

Zustand-based state management — use directly or compose into your own stores.

### useSelectionStore

```tsx
import { useSelectionStore } from '@rapidtool/cad-ui';

const selectedIds = useSelectionStore((s) => s.selected);
const { select, deselect, clearSelection, toggleSelection } = useSelectionStore.getState();

select('part', 'part-123');         // Select an item
toggleSelection('part', 'part-456'); // Toggle
clearSelection();                    // Clear all
```

### useWorkflowStore

```tsx
import { useWorkflowStore } from '@rapidtool/cad-ui';

const activeStep = useWorkflowStore((s) => s.activeStep);
const completedSteps = useWorkflowStore((s) => s.completedSteps);
const { setStep, completeStep, skipStep, resetWorkflow } = useWorkflowStore.getState();

setStep('baseplates');
completeStep('import');
skipStep('clamps');
```

### useTransformStore

```tsx
import { useTransformStore } from '@rapidtool/cad-ui';

const mode = useTransformStore((s) => s.mode);     // 'translate' | 'rotate' | 'scale'
const space = useTransformStore((s) => s.space);    // 'local' | 'world'
const snap = useTransformStore((s) => s.snapEnabled);

const { setMode, setSpace, toggleSnap } = useTransformStore.getState();
```

### useUIStore

```tsx
import { useUIStore } from '@rapidtool/cad-ui';

const theme = useUIStore((s) => s.theme);           // 'light' | 'dark' | 'system'
const sidebarOpen = useUIStore((s) => s.sidebarOpen);

const { setTheme, toggleSidebar } = useUIStore.getState();
```

### useHistoryStore

```tsx
import { useHistoryStore } from '@rapidtool/cad-ui';

const canUndo = useHistoryStore((s) => s.canUndo);
const canRedo = useHistoryStore((s) => s.canRedo);

const { pushSnapshot, undo, redo, clearHistory } = useHistoryStore.getState();
pushSnapshot({ ...currentState });
undo();
```

---

## Theming

All components respect CSS variables for theming. Define them on `:root` or scope to a container.

### CSS Variables

```css
:root {
  /* Layout */
  --layout-bg: #ffffff;
  --layout-fg: #1f2937;
  --layout-border: 220 13% 18%;        /* HSL values — used as hsl(var(--border)) */
  --layout-header-bg: #ffffff;
  --layout-toolbar-bg: #ffffff;
  --layout-sidebar-bg: #ffffff;
  --layout-panel-bg: #ffffff;
  --layout-content-bg: #f9fafb;
  --layout-footer-bg: #ffffff;
  --layout-hover-bg: rgba(0, 0, 0, 0.05);

  /* Sidebar Icons */
  --sidebar-icon-fg: #374151;
  --sidebar-icon-hover-bg: rgba(59, 130, 246, 0.1);
  --sidebar-icon-hover-fg: #3b82f6;

  /* Primary (used by active states, progress bars) */
  --primary: 198 89% 50%;              /* HSL values */
  --secondary: 220 14% 96%;
  --muted-foreground: 220 9% 46%;

  /* Badge colors */
  --sidebar-badge-bg: #3b82f6;
  --sidebar-badge-fg: white;
}
```

### DashboardLayout Theme Prop

```tsx
<DashboardLayout
  theme={{
    mode: 'dark',
    colors: {
      background: '#0f1117',
      foreground: '#f8fafc',
      border: '#1e293b',
      primary: '#3b82f6',
      accent: '#f59e0b',
    },
  }}
>
```

---

## License

MIT
