/**
 * @rapidtool/cad-core
 * 
 * Core CAD operations and utilities for building CAD applications.
 * This package contains pure logic with no React dependencies.
 * 
 * Features:
 * - Transform system (TransformController, presets, constraints)
 * - CSG engine (boolean operations via three-bvh-csg)
 * - Coordinate utilities (CAD <-> Three.js conversion)
 * - CAD operations (geometry manipulation)
 * - Snapping system (grid, vertex, edge, face snapping)
 * - Mesh utilities (simplification, decimation)
 * - File parsers (STL parser)
 * - Offset mesh processing (heightmap-based cavity generation)
 * - Export utilities (STL, 3MF, OBJ export)
 * - Web workers (CSG, offset mesh processing)
 */

// Transform System
export * from './transform';

// CSG Engine
export * from './csg';

// Utilities
export * from './utils';

// CAD Operations
export * from './cad';

// Snapping System
export * from './snapping';

// Mesh Utilities
export * from './mesh';

// File Parsers
export * from './parsers';

// Offset Mesh Processing
export * from './offset';

// Export Utilities
export * from './export';

// Workers
export * from './workers';
