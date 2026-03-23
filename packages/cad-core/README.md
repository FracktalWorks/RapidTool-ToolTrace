# @rapidtool/cad-core

Core CAD operations and utilities for building CAD applications. This package contains **pure logic** with no React dependencies and is **domain-agnostic** - suitable for any 3D CAD application.

## Features

- **Transform System** - TransformController with constraints for 3D object manipulation
- **CSG Engine** - Boolean operations (union, subtraction, intersection) via three-bvh-csg
- **Mesh Utilities** - Simplification, decimation, analysis, repair
- **Offset Mesh Processing** - Heightmap-based mesh offsetting for cavity/pocket generation
- **Snapping System** - Grid, vertex, edge, face snapping
- **File Parsers** - STL parser with validation
- **Export Utilities** - STL, 3MF export with configurable quality
- **Web Workers** - Background CSG and mesh processing

## Installation

This package is part of the rapidtool monorepo. It's available as a workspace dependency:

```json
{
  "dependencies": {
    "@rapidtool/cad-core": "*"
  }
}
```

## Usage

```typescript
import {
  // Transform system
  TransformController,
  PART_TRANSFORM_CONFIG,
  
  // CSG workers
  performCSGSubtractionInWorker,
  performBatchCSGUnionInWorker,
  
  // Mesh utilities
  analyzeMesh,
  simplifyGeometry,
  decimateMesh,
  
  // Offset mesh processing
  processOffsetMesh,
  CavitySettings,
  DEFAULT_CAVITY_SETTINGS,
  
  // Types
  type Transform3D,
  type TransformConfig,
} from '@rapidtool/cad-core';

// Create a transform controller for generic parts
const controller = new TransformController(PART_TRANSFORM_CONFIG);

// Perform CSG subtraction in background worker
const result = await performCSGSubtractionInWorker(baseGeometry, cutterGeometry);

// Analyze mesh quality
const analysis = await analyzeMesh(geometry);
```

## API Reference

### Transform System

| Export | Description |
|--------|-------------|
| `TransformController` | Main controller for managing transforms |
| `PART_TRANSFORM_CONFIG` | Generic preset for 3D models with full transform freedom |

**Note:** Application-specific transform presets should be defined in your application.

### CSG Workers

| Export | Description |
|--------|-------------|
| `performCSGSubtractionInWorker` | Subtract one geometry from another (background worker) |
| `performBatchCSGSubtractionInWorker` | Batch subtraction operations |
| `performBatchCSGUnionInWorker` | Union multiple geometries |
| `performClampCSGInWorker` | CSG subtraction optimized for support-cutout patterns |
| `performHoleCSGInWorker` | CSG subtraction optimized for plate-hole patterns |

### Mesh Utilities

| Export | Description |
|--------|-------------|
| `analyzeMesh` | Analyze mesh quality (manifold, watertight, etc.) |
| `simplifyGeometry` | Fast mesh simplification |
| `decimateMesh` | High-quality mesh decimation |
| `repairMesh` | Fix common mesh issues |

### Offset Mesh Processing

| Export | Description |
|--------|-------------|
| `processOffsetMesh` | Generate offset mesh via heightmap |
| `CavitySettings` | Configuration for offset mesh generation |
| `DEFAULT_CAVITY_SETTINGS` | Default offset processing settings |
| `getAdaptivePixelsPerUnit` | Calculate optimal resolution |

### Utilities

| Export | Description |
|--------|-------------|
| `safeNum` | Safe number parsing with fallback |
| `toCadPosition` | Three.js -> CAD position conversion |
| `toCadRotation` | Three.js -> CAD rotation conversion |
| `toThreePosition` | CAD -> Three.js position conversion |
| `toThreeRotation` | CAD -> Three.js rotation conversion |
| `cadToThreeAxis` | CAD axis -> Three.js axis mapping |
| `identityTransform` | Create identity transform |
| `transformsEqual` | Compare two transforms |

## License

Proprietary - Internal use only

