# ToolTrace Architecture

> Client-side tool outline tracing app for creating 3D-printable tool holders

---

## Overview

ToolTrace is a web app that helps users create custom tool holders. Users photograph their tools on white paper, and the app traces the outlines automatically. The traced shapes become cutouts in a 3D-printable holder.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| 3D Rendering | React Three Fiber + Three.js |
| Computer Vision | OpenCV.js (Web Worker) |
| Animation | Framer Motion |
| Build | Vite |
| Icons | Lucide React |

---

## Application Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  1. DETECT  │ →  │  2. TRACE   │ →  │  3. LAYOUT  │ →  │  4. DESIGN  │ →  │  5. EXPORT  │
│    PAPER    │    │    TOOLS    │    │    GRID     │    │     3D      │    │  SVG/STL    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
     ↓                   ↓                   ↓                   ↓                   ↓
 Upload image       Click on tool      Arrange shapes     Preview 3D model    Download file
 Auto-detect A4     Auto-trace edge    Resize/rotate      Adjust depth        SVG or STL
```

### Step Details

| Step | Component | Purpose |
|------|-----------|---------|
| 1. Detect Paper | `ImageWorkspace` + `DraggableCorners` | Find A4 paper boundaries for scale calibration |
| 2. Trace Tools | `ImageWorkspace` + `TracingOverlay` | Click tools to auto-detect their outlines |
| 3. Configure Layout | `LayoutWorkspace` | Position tool shapes on a grid, add primitives |
| 4. 3D Design | `DesignWorkspace` | Preview extruded holder with tool cutouts |
| 5. Export | `ControlPanel` | Download as SVG (laser cutting) or STL (3D printing) |

---

## Folder Structure

```
src/
├── components/           # React UI components
│   ├── Header.tsx       # Top navbar with breadcrumb
│   ├── Sidebar.tsx      # Left workflow navigation
│   ├── ControlPanel.tsx # Right panel with step controls
│   ├── ImageWorkspace.tsx     # Canvas for paper/tool detection
│   ├── LayoutWorkspace.tsx    # Grid-based shape arrangement
│   ├── DesignWorkspace.tsx    # 3D viewer with React Three Fiber
│   ├── DraggableCorners.tsx   # Paper corner adjustment handles
│   ├── TracingOverlay.tsx     # Traced outline visualization
│   └── ErrorBoundary.tsx      # Error handling wrapper
│
├── stores/              # State management
│   └── appStore.ts      # Single Zustand store for all app state
│
├── workers/             # Web Workers for heavy processing
│   ├── cvWorker.ts      # OpenCV processing (paper + tool detection)
│   └── cvWorkerManager.ts   # Worker communication wrapper
│
├── lib/                 # Utilities and services
│   ├── geometry.ts      # Point, polygon, contour utilities
│   ├── exportSVG.ts     # SVG file generation
│   └── exportSTL.ts     # STL mesh generation using Three.js
│
├── hooks/               # Custom React hooks
│   └── useTheme.ts      # Dark/light mode with localStorage
│
├── App.tsx              # Main app shell
├── main.tsx             # React entry point
└── index.css            # Design system tokens + base styles
```

---

## Core Modules

### 1. State Store (`appStore.ts`)

Single Zustand store managing:
- **Workflow state**: current step, processing flags
- **Image data**: uploaded file, URL, dimensions
- **Paper detection**: corners, confidence, pixels-per-mm scale
- **Tool outlines**: array of traced contours with metadata
- **Layout state**: grid config, positioned shapes
- **Design settings**: depth, wall thickness, chamfer

### 2. CV Worker (`cvWorker.ts`)

Runs OpenCV.js in a Web Worker. Handles:
- Paper detection (see strategy below)
- Tool tracing (see strategy below)
- Region-based tracing for box selection

### 3. Geometry Library (`geometry.ts`)

Pure functions for:
- Bounding box calculation
- Polygon area (shoelace formula)
- Catmull-Rom smoothing for contours
- Polygon offset for clearance
- SVG path generation

---

## Paper Detection Strategy

**Goal**: Find A4 paper in photo to establish real-world scale

### Assumptions

1. Paper is **white** (high brightness, low saturation)
2. Paper is **A4 size** (210 × 297 mm)
3. Paper is the **largest white region** in frame
4. Paper is roughly **rectangular** (quadrilateral)

### Algorithm (Two-Pass)

```
PASS 1 - White Paper Detection (Primary)
├── Convert to HSV color space
├── Threshold: H=any, S<60, V>170 (white)
├── Morphological close (15×15) to fill gaps
├── Morphological open (5×5) to remove noise
└── Find largest 4-point polygon meeting criteria

PASS 2 - Edge Detection (Fallback)
├── Apply CLAHE if contrast is low (stddev < 50)
├── Bilateral filter (preserves edges)
├── Auto-tuned Canny (median-based thresholds)
├── Dilate + close to connect edges
└── Find best quadrilateral by quality score
```

### Quality Scoring

| Metric | Weight | Description |
|--------|--------|-------------|
| Aspect ratio | 30% | Closeness to A4 ratio (1.414) |
| Area coverage | 25% | Paper should fill reasonable frame area |
| Convexity | 15% | Must be convex quadrilateral |
| Solidity | 15% | Area ÷ convex hull area |
| Rectangularity | 15% | Area ÷ min-area-rect area |

### Output

- Corner coordinates (topLeft, topRight, bottomRight, bottomLeft)
- Confidence score (0-1)
- Pixels-per-mm scale factor

---

## Tool Tracing Strategy

**Goal**: Extract precise outline of dark objects on white paper

### Assumptions

1. Paper is **white** (background)
2. Tools are **NOT white** (darker than paper)
3. Tools have **distinct edges** against paper
4. One tool per click/selection

### Algorithm (Paper-is-White Silhouette)

```
SHADOW REMOVAL
├── Convert to grayscale
├── Compute lighting map (51×51 Gaussian blur)
├── Divide: normalized = gray ÷ lighting × 255
└── Result: uniform illumination, shadows removed

TOOL EXTRACTION
├── Threshold at 200 (below = tool, above = paper)
├── Morph close (7×7 ellipse) to fill holes
├── Morph open (7×7 ellipse) to remove noise
├── Extra close (15×15) to merge nearby regions
└── Find EXTERNAL contours only

CONTOUR SELECTION
├── If click point is INSIDE a contour → use that
├── Else find NEAREST contour within 50px
└── Prefer smaller area (actual tool, not merged blob)

CONTOUR REFINEMENT
├── Approximate with tight epsilon (0.2% of perimeter)
└── Return point array + area
```

### Fallback (Otsu)

If silhouette method fails:
1. Apply Otsu's adaptive threshold (inverted)
2. Same morphological cleanup
3. Same contour selection logic

### Output

- Array of Point2D forming closed polygon
- Area in pixels (converted to mm² using scale)
- Smoothed version using Catmull-Rom spline

---

## 3D Generation

### Tool Holder Model

Built from three layers:

```
┌────────────────────────┐  ← TOP (open)
│ ┌────────────────────┐ │
│ │  ┌──────┐ ┌─────┐  │ │  ← Cutout holes (tools)
│ │  │      │ │     │  │ │
│ │  └──────┘ └─────┘  │ │
│ └────────────────────┘ │  ← Pocket floor
│                        │  ← Walls
├────────────────────────┤
│       SOLID BASE       │  ← Base plate
└────────────────────────┘
```

### Geometry Generation

| Part | Method |
|------|--------|
| Base plate | `THREE.BoxGeometry` with chamfer |
| Walls | Outer rect - inner rect, extruded |
| Pocket floor | Shape with tool holes punched out |
| Tool holes | `THREE.Path` from contour points |

### Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| Base height | 5mm | Thickness of solid bottom |
| Wall thickness | 2mm | Outer wall width |
| Cutout depth | 4mm | How deep tools sit |
| Chamfer | 0.5mm | Edge bevel |
| Gridfinity base | Off | Magnet hole pattern |

---

## Export Formats

### SVG Export

- Real-world units (mm)
- Each tool as separate `<path>` element
- Clearance offset applied before export
- Suitable for: laser cutting, CNC routing

### STL Export

- Uses Three.js mesh generation
- Binary format for smaller file size
- Suitable for: 3D printing, FDM/SLA

---

## UI Architecture

### Layout

```
┌──────────────────────────────────────────────────────┐
│                     HEADER                           │
├──────────┬───────────────────────────────┬───────────┤
│          │                               │           │
│          │                               │  CONTROL  │
│ SIDEBAR  │         WORKSPACE             │   PANEL   │
│   56px   │         (flex-1)              │   320px   │
│          │                               │           │
│          │                               │           │
└──────────┴───────────────────────────────┴───────────┘
```

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Header | Top | Logo, breadcrumb, theme toggle, export button |
| Sidebar | Left | Step navigation (collapsible) |
| Workspace | Center | Main canvas area (changes per step) |
| ControlPanel | Right | Step-specific controls |

---

## State Flow

```
User Action
    ↓
UI Event Handler
    ↓
Zustand Action (store method)
    ↓
State Update
    ↓
React Re-render
    ↓
UI Updates
```

### Async Operations

```
Click "Trace Tool"
    ↓
ImageWorkspace → posts message to cvWorkerManager
    ↓
cvWorkerManager → sends to cvWorker (Web Worker)
    ↓
cvWorker → runs OpenCV (off main thread)
    ↓
Result → posted back to main thread
    ↓
appStore.addToolOutline() called
    ↓
UI shows new traced outline
```

---

## Design Tokens

CSS custom properties in `index.css`:

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--background` | white | dark gray | Page background |
| `--foreground` | dark blue | light gray | Text color |
| `--primary` | cyan | cyan | Buttons, active states |
| `--muted` | light gray | dark gray | Disabled, subtle |
| `--border` | light gray | dark gray | Dividers, outlines |
| `--success` | green | green | Confirmation |
| `--warning` | yellow | yellow | Alerts |
| `--destructive` | red | red | Errors, delete |

---

## Performance Considerations

1. **Web Worker for CV**: OpenCV runs off main thread
2. **Canvas rendering**: ImageWorkspace uses canvas, not SVG
3. **Zustand selectors**: Components subscribe to specific state slices
4. **React memoization**: Heavy components use React.memo
5. **Lazy geometry**: 3D meshes regenerated only on setting change

---

## Future Improvements

- [ ] Multiple paper sizes (A3, Letter, custom)
- [ ] Undo/redo for tracing and layout
- [ ] Tool templates library
- [ ] Cloud save/sync
- [ ] Collaborative editing
- [ ] Mobile-responsive layout
- [ ] More export formats (DXF, STEP)
