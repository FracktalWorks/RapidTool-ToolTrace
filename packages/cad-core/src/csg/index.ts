/**
 * CSG (Constructive Solid Geometry) Module
 * 
 * Provides boolean operations for 3D meshes including union, subtraction,
 * and intersection. Used for creating pockets, holes, and machining features.
 * 
 * @module @rapidtool/cad-core/csg
 */

export { CSGEngine, csgUtils } from './csgEngine';
export { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
