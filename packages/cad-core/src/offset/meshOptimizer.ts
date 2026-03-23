/**
 * Mesh Optimization and Cleanup Module
 * Functions for mesh repair, hole filling, and manifold verification
 */

import * as THREE from 'three';

// ============================================
// Types
// ============================================

interface WatertightResult {
  isWatertight: boolean;
  totalEdges: number;
  manifoldEdges: number;
  boundaryEdges: number;
  overSharedEdges: number;
  nonManifoldEdges: number;
}

// ============================================
// Degenerate Triangle Removal
// ============================================

/**
 * Remove triangles with zero or near-zero area
 */
export function removeDegenerateTriangles(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = geometry.attributes.position.array as Float32Array;
  const indices = geometry.index?.array;

  if (!indices) return geometry;

  const newIndices: number[] = [];
  const epsilon = 1e-10;
  let removedCount = 0;

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const areaSq = calculateTriangleAreaSquared(positions, i0, i1, i2);

    if (areaSq > epsilon) {
      newIndices.push(indices[i], indices[i + 1], indices[i + 2]);
    } else {
      removedCount++;
    }
  }

  if (removedCount === 0) {
    return geometry;
  }

  return createCleanedGeometry(geometry, newIndices);
}

function calculateTriangleAreaSquared(
  positions: Float32Array,
  i0: number,
  i1: number,
  i2: number
): number {
  const e1x = positions[i1] - positions[i0];
  const e1y = positions[i1 + 1] - positions[i0 + 1];
  const e1z = positions[i1 + 2] - positions[i0 + 2];

  const e2x = positions[i2] - positions[i0];
  const e2y = positions[i2 + 1] - positions[i0 + 1];
  const e2z = positions[i2 + 2] - positions[i0 + 2];

  const cx = e1y * e2z - e1z * e2y;
  const cy = e1z * e2x - e1x * e2z;
  const cz = e1x * e2y - e1y * e2x;

  return cx * cx + cy * cy + cz * cz;
}

function createCleanedGeometry(original: THREE.BufferGeometry, indices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', original.attributes.position.clone());
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ============================================
// Watertightness Verification
// ============================================

/**
 * Verify mesh is watertight (all edges shared by exactly 2 faces)
 */
export function verifyWatertightness(geometry: THREE.BufferGeometry): WatertightResult {
  const indices = geometry.index?.array;
  if (!indices) {
    return createEmptyWatertightResult();
  }

  const edgeCounts = countEdges(indices);

  let nonManifoldEdges = 0;
  const edgesByCount = { manifold: 0, boundary: 0, overShared: 0 };

  for (const count of edgeCounts.values()) {
    if (count === 2) {
      edgesByCount.manifold++;
    } else {
      nonManifoldEdges++;
      if (count === 1) edgesByCount.boundary++;
      else edgesByCount.overShared++;
    }
  }

  return {
    isWatertight: nonManifoldEdges === 0,
    totalEdges: edgeCounts.size,
    manifoldEdges: edgesByCount.manifold,
    boundaryEdges: edgesByCount.boundary,
    overSharedEdges: edgesByCount.overShared,
    nonManifoldEdges,
  };
}

function createEmptyWatertightResult(): WatertightResult {
  return {
    isWatertight: false,
    totalEdges: 0,
    manifoldEdges: 0,
    boundaryEdges: 0,
    overSharedEdges: 0,
    nonManifoldEdges: 0,
  };
}

function countEdges(indices: ArrayLike<number>): Map<string, number> {
  const edgeCounts = new Map<string, number>();

  for (let i = 0; i < indices.length; i += 3) {
    const v0 = indices[i];
    const v1 = indices[i + 1];
    const v2 = indices[i + 2];

    incrementEdgeCount(edgeCounts, v0, v1);
    incrementEdgeCount(edgeCounts, v1, v2);
    incrementEdgeCount(edgeCounts, v2, v0);
  }

  return edgeCounts;
}

function incrementEdgeCount(edgeCounts: Map<string, number>, va: number, vb: number): void {
  const key = va < vb ? `${va}_${vb}` : `${vb}_${va}`;
  edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
}

// ============================================
// Non-Manifold Mesh Repair
// ============================================

/**
 * Repair non-manifold mesh by removing triangles on over-shared edges
 * Keeps the 2 best quality triangles for each over-shared edge
 */
export function repairNonManifoldMesh(
  geometry: THREE.BufferGeometry,
  maxIterations = 5
): THREE.BufferGeometry {
  let currentGeometry = geometry;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const indices = Array.from(currentGeometry.index?.array ?? []);
    const positions = currentGeometry.attributes.position.array as Float32Array;

    const edgeTriangles = buildEdgeTriangleMap(indices);
    const overSharedEdges = findOverSharedEdges(edgeTriangles);
    const boundaryEdges = findBoundaryEdges(edgeTriangles);

    // Stop if no over-shared edges
    if (overSharedEdges.length === 0) {
      return currentGeometry;
    }

    // Stop if only boundary edges remain after first iteration
    if (overSharedEdges.length === 0 && iteration > 0) {
      return currentGeometry;
    }

    const trianglesToRemove = selectTrianglesToRemove(overSharedEdges, indices, positions);

    if (trianglesToRemove.size === 0) {
      return currentGeometry;
    }

    currentGeometry = removeTriangles(currentGeometry, indices, trianglesToRemove);
  }

  return currentGeometry;
}

interface EdgeTriangleInfo {
  edge: string;
  triangles: number[];
}

function buildEdgeTriangleMap(indices: number[]): Map<string, number[]> {
  const edgeTriangles = new Map<string, number[]>();

  for (let i = 0; i < indices.length; i += 3) {
    const triIdx = i / 3;
    const v0 = indices[i];
    const v1 = indices[i + 1];
    const v2 = indices[i + 2];

    addTriangleToEdge(edgeTriangles, v0, v1, triIdx);
    addTriangleToEdge(edgeTriangles, v1, v2, triIdx);
    addTriangleToEdge(edgeTriangles, v2, v0, triIdx);
  }

  return edgeTriangles;
}

function addTriangleToEdge(
  edgeTriangles: Map<string, number[]>,
  va: number,
  vb: number,
  triIdx: number
): void {
  const key = va < vb ? `${va}_${vb}` : `${vb}_${va}`;
  if (!edgeTriangles.has(key)) {
    edgeTriangles.set(key, []);
  }
  edgeTriangles.get(key)!.push(triIdx);
}

function findOverSharedEdges(edgeTriangles: Map<string, number[]>): EdgeTriangleInfo[] {
  return Array.from(edgeTriangles.entries())
    .filter(([, tris]) => tris.length > 2)
    .map(([edge, triangles]) => ({ edge, triangles }));
}

function findBoundaryEdges(edgeTriangles: Map<string, number[]>): EdgeTriangleInfo[] {
  return Array.from(edgeTriangles.entries())
    .filter(([, tris]) => tris.length === 1)
    .map(([edge, triangles]) => ({ edge, triangles }));
}

function selectTrianglesToRemove(
  overSharedEdges: EdgeTriangleInfo[],
  indices: number[],
  positions: Float32Array
): Set<number> {
  const trianglesToRemove = new Set<number>();

  for (const { triangles } of overSharedEdges) {
    // Sort by area (descending) - keep larger triangles
    const sortedTris = triangles.slice().sort((a, b) => {
      return getTriangleArea(indices, positions, b) - getTriangleArea(indices, positions, a);
    });

    // Keep best 2 triangles, remove the rest
    for (let i = 2; i < sortedTris.length; i++) {
      trianglesToRemove.add(sortedTris[i]);
    }
  }

  return trianglesToRemove;
}

function getTriangleArea(indices: number[], positions: Float32Array, triIdx: number): number {
  const i = triIdx * 3;
  const i0 = indices[i] * 3;
  const i1 = indices[i + 1] * 3;
  const i2 = indices[i + 2] * 3;

  const areaSq = calculateTriangleAreaSquared(
    positions,
    i0,
    i1,
    i2
  );

  return Math.sqrt(areaSq) * 0.5;
}

function removeTriangles(
  geometry: THREE.BufferGeometry,
  indices: number[],
  trianglesToRemove: Set<number>
): THREE.BufferGeometry {
  const newIndices: number[] = [];

  for (let i = 0; i < indices.length; i += 3) {
    const triIdx = i / 3;
    if (!trianglesToRemove.has(triIdx)) {
      newIndices.push(indices[i], indices[i + 1], indices[i + 2]);
    }
  }

  const repaired = new THREE.BufferGeometry();
  repaired.setAttribute('position', geometry.attributes.position.clone());
  repaired.setIndex(newIndices);
  repaired.computeVertexNormals();

  return repaired;
}

// ============================================
// Small Hole Filling
// ============================================

/**
 * Fill small holes in mesh by detecting boundary loops and triangulating
 */
export function fillSmallHoles(geometry: THREE.BufferGeometry, maxHoleEdges = 100): THREE.BufferGeometry {
  const positions = Array.from(geometry.attributes.position.array);
  const indices = Array.from(geometry.index?.array ?? []);

  const boundaryEdges = findMeshBoundaryEdges(indices);

  if (boundaryEdges.size === 0) {
    return geometry;
  }

  const loops = findBoundaryLoops(boundaryEdges, maxHoleEdges);

  if (loops.length === 0) {
    return geometry;
  }

  const newIndices = fillLoops(loops, positions, indices);

  if (newIndices.length === indices.length) {
    return geometry;
  }

  return createFilledGeometry(positions, newIndices);
}

function findMeshBoundaryEdges(indices: number[]): Map<number, number[]> {
  const edgeMap = new Map<string, number>();

  for (let i = 0; i < indices.length; i += 3) {
    const v0 = indices[i];
    const v1 = indices[i + 1];
    const v2 = indices[i + 2];

    countEdge(edgeMap, v0, v1);
    countEdge(edgeMap, v1, v2);
    countEdge(edgeMap, v2, v0);
  }

  const boundaryEdges = new Map<number, number[]>();

  for (const [key, count] of edgeMap) {
    if (count === 1) {
      const [v0, v1] = key.split('_').map(Number);
      addBoundaryEdge(boundaryEdges, v0, v1);
      addBoundaryEdge(boundaryEdges, v1, v0);
    }
  }

  return boundaryEdges;
}

function countEdge(edgeMap: Map<string, number>, a: number, b: number): void {
  const key = a < b ? `${a}_${b}` : `${b}_${a}`;
  edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
}

function addBoundaryEdge(boundaryEdges: Map<number, number[]>, from: number, to: number): void {
  if (!boundaryEdges.has(from)) {
    boundaryEdges.set(from, []);
  }
  boundaryEdges.get(from)!.push(to);
}

function findBoundaryLoops(boundaryEdges: Map<number, number[]>, maxHoleEdges: number): number[][] {
  const loops: number[][] = [];
  const visited = new Set<number>();

  for (const startVertex of boundaryEdges.keys()) {
    if (visited.has(startVertex)) continue;

    const loop = traceLoopPath(startVertex, boundaryEdges, visited, maxHoleEdges);
    if (loop.length > 2) {
      loops.push(loop);
    }
  }

  return loops;
}

function traceLoopPath(
  start: number,
  boundaryEdges: Map<number, number[]>,
  visited: Set<number>,
  maxLength: number
): number[] {
  const loop: number[] = [];
  let current = start;

  while (loop.length < maxLength * 2) {
    visited.add(current);
    loop.push(current);

    const neighbors = boundaryEdges.get(current) ?? [];
    const next = neighbors.find((n) => !visited.has(n));

    if (!next) {
      // Check if we can close the loop
      const firstNeighbors = boundaryEdges.get(start) ?? [];
      if (firstNeighbors.includes(current) && loop.length > 2) {
        return loop;
      }
      break;
    }

    current = next;
  }

  return [];
}

function fillLoops(loops: number[][], positions: number[], indices: number[]): number[] {
  const newIndices = [...indices];

  for (const loop of loops) {
    if (loop.length < 3 || loop.length > 100) continue;

    const center = loop[0];
    for (let i = 1; i < loop.length - 1; i++) {
      const v1 = loop[i];
      const v2 = loop[i + 1];

      // Determine correct winding order
      const shouldReverse = shouldReverseWinding(center, v1, v2, positions, indices);

      if (shouldReverse) {
        newIndices.push(center, v2, v1);
      } else {
        newIndices.push(center, v1, v2);
      }
    }
  }

  return newIndices;
}

function shouldReverseWinding(
  center: number,
  v1: number,
  v2: number,
  positions: number[],
  indices: number[]
): boolean {
  // Calculate normal of new triangle
  const p0 = getVertex(positions, center);
  const p1 = getVertex(positions, v1);
  const p2 = getVertex(positions, v2);

  const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];

  const nz = e1[0] * e2[1] - e1[1] * e2[0];

  // Sample adjacent triangles to get average normal direction
  let avgNormalZ = 0;
  let count = 0;

  for (let j = 0; j < indices.length; j += 3) {
    if (indices[j] === center || indices[j + 1] === center || indices[j + 2] === center) {
      const v0 = getVertex(positions, indices[j]);
      const vv1 = getVertex(positions, indices[j + 1]);
      const vv2 = getVertex(positions, indices[j + 2]);

      const edge1 = [vv1[0] - v0[0], vv1[1] - v0[1]];
      const edge2 = [vv2[0] - v0[0], vv2[1] - v0[1]];

      avgNormalZ += edge1[0] * edge2[1] - edge1[1] * edge2[0];
      count++;
    }
  }

  if (count > 0) avgNormalZ /= count;

  return (nz > 0 && avgNormalZ > 0) || (nz < 0 && avgNormalZ < 0);
}

function getVertex(positions: number[], idx: number): number[] {
  return [positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]];
}

function createFilledGeometry(positions: number[], indices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
