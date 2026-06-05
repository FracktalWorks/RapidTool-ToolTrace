# ToolTrace

**From tool photo to ready-to-print insert — in under 10 minutes.**

ToolTrace is a browser-based SaaS that converts a photograph of tools arranged on A4 paper into precision-cut 3D-printable or laser-cuttable tool organizer inserts. No CAD experience required. No install. No backend.

> Part of the **RapidTool** product family.

---

## How It Works

```
📷 Photo  →  🔍 Detect Paper  →  ✏️ Trace Tools  →  📐 Layout  →  📦 3D Design  →  💾 Export
```

1. **Detect Paper** — Upload a JPG/PNG of your tools on white A4 paper. OpenCV auto-detects the paper boundary and calibrates real-world scale (px/mm).
2. **Trace Tools** — Click on each tool or draw a box around it. Shadow-corrected silhouette detection extracts the precise negative shape.
3. **Layout** — Drag and arrange traced outlines on a Gridfinity-compatible grid. Add primitive shapes (circles, squares, finger notches).
4. **3D Design** — Adjust cutout depth, wall thickness, chamfer, and Gridfinity base options. See a live 3D preview.
5. **Export** — Download `.STL` for 3D printing or `.SVG` for laser cutting/CNC — for free.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript + Vite 7 |
| Styling | Tailwind CSS v4 + CSS custom properties |
| State | Zustand 5 |
| 3D Graphics | Three.js 0.182 + React Three Fiber 8 |
| Boolean Ops | three-bvh-csg |
| Computer Vision | OpenCV.js (Web Worker) |
| Animation | Motion (Framer Motion) |
| Monorepo | npm workspaces |

---

## Project Structure

```
RapidTool-ToolTrace/
│
├── src/                          # Main application
│   ├── components/
│   │   ├── Header.tsx            # Navbar — RapidToolLogo + ThemeToggle + step breadcrumb
│   │   ├── Sidebar.tsx           # Step navigation (collapsible)
│   │   ├── ControlPanel.tsx      # Right panel — step-specific controls
│   │   ├── ImageWorkspace.tsx    # Canvas — paper detection + tool tracing
│   │   ├── LayoutWorkspace.tsx   # SVG canvas — shape arrangement
│   │   ├── DesignWorkspace.tsx   # React Three Fiber — 3D preview
│   │   ├── ExportWorkspace.tsx   # Export preview + download
│   │   ├── DraggableCorners.tsx  # Paper corner adjustment handles
│   │   └── TracingOverlay.tsx    # Tool outline overlay + editing
│   │
│   ├── stores/
│   │   └── appStore.ts           # Single Zustand store (all app state)
│   │
│   ├── workers/
│   │   ├── cvWorker.ts           # OpenCV.js Web Worker (paper + tool detection)
│   │   └── cvWorkerManager.ts    # Worker communication + smoothing
│   │
│   ├── lib/
│   │   ├── geometry.ts           # Contour smoothing, polygon offset, SVG path gen
│   │   ├── exportSVG.ts          # SVG file generation
│   │   └── exportSTL.ts          # STL mesh generation
│   │
│   ├── hooks/
│   │   └── useTheme.ts           # Dark/light mode (localStorage)
│   │
│   └── index.css                 # Design tokens + RapidTool family utility classes
│
├── packages/
│   ├── cad-core/                 # Pure CAD logic (no React)
│   │   └── src/
│   │       ├── csg/              # Boolean operations (three-bvh-csg)
│   │       ├── mesh/             # Mesh analysis, simplification, repair
│   │       ├── offset/           # Heightmap + mesh offset processing
│   │       ├── parsers/          # STL file parser
│   │       ├── snapping/         # Grid / vertex / edge snapping
│   │       ├── transform/        # 3D transform controller + presets
│   │       ├── export/           # STL export utilities
│   │       └── workers/          # CSG + offset background workers
│   │
│   └── cad-ui/                   # Shared React UI library
│       └── src/
│           ├── layout/           # DashboardLayout shell
│           ├── sidebar/          # SidebarIcon, SidebarIconGroup
│           ├── toolbar/          # VerticalToolbar
│           ├── panels/           # CollapsiblePanel
│           ├── viewport/         # ViewCube, ScalableGrid, NavigationHelp
│           ├── controls/         # TransformControlsUI
│           ├── primitives/       # NumberInput, StepProgress, SkipStep
│           ├── loading/          # LoadingIndicator, LoadingOverlay
│           ├── branding/         # RapidToolLogo, ThemeToggle
│           └── stores/           # Selection, Workflow, UI, History stores
│
└── public/
    ├── opencv.js                 # OpenCV.js runtime (loaded by Web Worker)
    └── fonts/                    # Reality Hyper brand font
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
git clone https://github.com/your-org/RapidTool-ToolTrace
cd RapidTool-ToolTrace
npm install
```

### Develop

```bash
npm run dev
# → http://localhost:5173
```

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

---

## Core Pipeline — Data Flow

```
Upload JPG/PNG
      │
      ▼
[Step 1] PAPER DETECTION
      cvWorkerManager.detectPaper()
      └── cvWorker (OpenCV.js — Web Worker)
            ├── Pass 1: HSV white mask + morphological cleanup (31×31 open)
            └── Pass 2: Bilateral + auto-tuned Canny fallback
      → PaperCorners (4 pts) + pixelsPerMm calibration
      → appStore
      │
      ▼
[Step 2] TOOL TRACING
      cvWorkerManager.traceTool() / traceRegion()
      └── cvWorker
            ├── Shadow removal (gray ÷ 51×51 Gaussian lighting map)
            ├── Threshold @200 BINARY_INV (not-white = tool)
            ├── Morphological close + open (3×3 ellipse)
            └── approxPolyDP (ε = 0.0005 × perimeter)
      → geometry.smoothContour(ε=0.5, iterations=2)
      → ToolOutline[] → appStore
      │
      ▼
[Step 3] LAYOUT
      LayoutWorkspace (SVG canvas in mm coordinates)
      initializeLayoutFromTools() auto-places traced shapes
      User: drag / resize / rotate / add primitives
      → LayoutShape[] → appStore
      │
      ▼
[Step 4] 3D DESIGN
      DesignWorkspace (React Three Fiber)
      THREE.ExtrudeGeometry → base plate mesh
      Brush + Evaluator (three-bvh-csg) SUBTRACTION → cutouts
      → Live 3D preview with OrbitControls + ViewCube
      │
      ▼
[Step 5] EXPORT
      SVG → exportSVG.generateSVG() → Blob download
      STL → generateExportMesh() → STLExporter → binary .stl download
```

---

## Computer Vision

### Paper Detection

```
Pass 1 — White Mask (primary)
  Convert to HSV → threshold S < 70, V > 155
  Morphological close (25×25) + open (31×31) — kills reflections
  3% border strip zeroed — removes image-edge noise
  findBestQuadrilateral() with quality scoring:
    Aspect ratio 30% + Area 25% + Convexity 15%
    + Solidity 15% + Rectangularity 15%

Pass 2 — Edge Detection (fallback, when confidence < 0.6)
  Bilateral filter (edge-preserving)
  Auto-tuned Canny (median-based thresholds)
  Same quadrilateral quality scoring
```

### Tool Tracing

```
Shadow Removal
  gray ÷ (51×51 Gaussian blur) × 255
  → Uniform illumination — shadows and hotspots eliminated

Silhouette Extraction
  Threshold @200 THRESH_BINARY_INV  (paper=white → 0, tool=dark → 255)
  Morphological close + open  (3×3 ellipse — preserves fine tool detail)
  Large close  (5×5 ellipse — merges nearby regions into single silhouette)

Contour Selection
  RETR_EXTERNAL — outer boundary only (no holes)
  pointPolygonTest → nearest contour to click point
  Fallback: Otsu THRESH_BINARY_INV if silhouette fails

Contour Refinement
  approxPolyDP  (ε = 0.0005 × perimeter — very tight, high fidelity)
  smoothContour (Catmull-Rom, ε=0.5, 2 iterations)
```

---

## Design System

ToolTrace uses the **RapidTool family design system**, shared across SoftJaws and other products.

### CSS Design Tokens

```css
--primary:           217 91% 60%;     /* Blue */
--accent:            266 85% 58%;     /* Purple */
--radius:            0.75rem;

--gradient-primary:  linear-gradient(135deg, hsl(217,91%,60%), hsl(217,91%,48%));
--gradient-brand:    linear-gradient(135deg, hsl(217,91%,60%), hsl(266,85%,58%));
--gradient-glass:    linear-gradient(135deg, hsl(0 0% 100%/0.08), hsl(0 0% 100%/0.02));

--shadow-btn:        0 4px 12px rgba(59,130,246,0.3);
--shadow-glow:       0 0 20px rgba(59,130,246,0.15);
--transition-tech:   0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
```

### Family Utility Classes

| Class | Effect |
|---|---|
| `.tech-glass` | `backdrop-filter: blur(16px)` — header, modals |
| `.sidebar-glass` | `blur(12px)` + border-right — sidebar, control panel |
| `.tech-glow` | `box-shadow: var(--shadow-glow)` |
| `.tech-transition` | `transition: all var(--transition-tech)` |
| `.tech-surface` | Elevated card — border + shadow + radius |

### Shared cad-ui Components

```typescript
import {
  DashboardLayout,    // Full-page app shell
  SidebarIcon,        // Icon nav button with badge + label
  CollapsiblePanel,   // Accordion property panel
  ViewCube,           // Interactive 3D orientation cube
  RapidToolLogo,      // Family branding (productName + icon props)
  ThemeToggle,        // Light/dark mode toggle
} from '@rapidtool/cad-ui';
```

---

## Roadmap

### Phase 1 — Core Accuracy
- [x] 5-step browser workflow
- [x] OpenCV paper detection + tool tracing (Web Worker)
- [x] Three.js + CSG 3D preview
- [x] STL + SVG export
- [x] Gridfinity grid layout
- [x] RapidTool family design system (tech-glass, CSS tokens)
- [ ] Perspective warp before tracing (eliminates shape distortion from angled photos)
- [ ] Install Clipper.js for accurate uniform polygon offset
- [ ] Extract shared `generateExportMesh` to `src/lib/meshBuilder.ts`
- [ ] Remove SAM2 dead code from `cvWorkerManager.ts`

### Phase 2 — Cloud & Auth
- [ ] Supabase Auth (Google / email / guest mode)
- [ ] Design save / load / share URL
- [ ] Design versioning history

### Phase 3 — Export Expansion
- [ ] DXF export (laser CNC)
- [ ] 3MF export (slicer metadata)
- [ ] PDF layout sheet
- [ ] Real-time overlap + clearance validation

### Phase 4 — Monetization
- [ ] Stripe / Razorpay integration
- [ ] Print fulfillment (Fracktory, Xometry, Printful)
- [ ] Pro plan feature gating

### Phase 5 — AI Enhancement
- [ ] Auto-layout optimizer (bin packing)
- [ ] Tool type recognition from photo
- [ ] Community gallery (share + remix layouts)
- [ ] PWA — capture tool photos directly from mobile camera

---

## Known Limitations

| Issue | Impact | Fix |
|---|---|---|
| No perspective warp | Angled photos produce distorted tool shapes | Phase 1 |
| Clipper-lib not installed | `offsetPolygon()` silently returns original points | Phase 1 |
| No cloud save | Work is lost on page refresh | Phase 2 |
| No authentication | No user accounts or saved designs | Phase 2 |

---

## Contributing

All generic UI components belong in `packages/cad-ui`. Application-specific code stays in `src/`.

**Key rules:**
- Colors always via `hsl(var(--token))` — never raw hex values
- All heavy processing (OpenCV, CSG) runs in Web Workers — never on the main thread
- One Zustand store per application (`appStore.ts`)
- No framework-specific imports in `cad-ui` (keep it framework-agnostic)

---

## License

MIT — © 2025 RapidTool
