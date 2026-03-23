/**
 * Mesh Hole Filler Module
 * Detects and fills holes in triangle soup meshes
 * Creates cap geometry to close through-holes before heightmap generation
 */

import * as THREE from 'three';

// ============================================
// Types
// ============================================

interface Edge {
  v1: number;
  v2: number;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
}

interface BoundaryLoop {
  vertices: THREE.Vector3[];
  indices: number[];
  normal: THREE.Vector3;
  center: THREE.Vector3;
  area: number;
}

interface VertexMapResult {
  uniqueVertices: THREE.Vector3[];
  vertexToUnique: Map<number, number>;
}

// ============================================
// Constants
// ============================================

const EPSILON = 1e-4;
const CELL_SIZE = EPSILON * 10;

// ============================================
// Main API
// ============================================

/**
 * Fill holes in triangle soup mesh with cap triangles
 *
 * @param vertices - Float32Array of triangle soup vertices (x,y,z per vertex)
 * @param maxHoleArea - Maximum area of hole to fill (default: unlimited)
 * @param minHoleVertices - Minimum vertices in a hole to fill (default: 3)
 * @returns New vertices array with cap triangles appended
 */
export function fillMeshHoles(
  vertices: Float32Array,
  maxHoleArea = Infinity,
  minHoleVertices = 3
): Float32Array {
  const { uniqueVertices, vertexToUnique } = buildVertexMap(vertices);
  const boundaryEdges = findBoundaryEdges(vertices, vertexToUnique);

  if (boundaryEdges.length === 0) {
    return vertices;
  }

  const loops = buildBoundaryLoops(boundaryEdges, uniqueVertices);

  if (loops.length === 0) {
    return vertices;
  }

  const capTriangles = triangulateLoops(loops, maxHoleArea, minHoleVertices);

  if (capTriangles.length === 0) {
    return vertices;
  }

  return combineVertices(vertices, capTriangles);
}

/**
 * Analyze mesh for holes without filling them
 */
export function analyzeMeshHoles(vertices: Float32Array): {
  totalEdges: number;
  boundaryEdges: number;
  estimatedHoles: number;
  hasHoles: boolean;
} {
  const { vertexToUnique } = buildVertexMap(vertices);
  const boundaryEdges = findBoundaryEdges(vertices, vertexToUnique);

  // Rough estimate: each hole has on average ~10 boundary edges
  const estimatedHoles = Math.ceil(boundaryEdges.length / 10);

  return {
    totalEdges: Math.floor(vertices.length / 3),
    boundaryEdges: boundaryEdges.length,
    estimatedHoles,
    hasHoles: boundaryEdges.length > 0,
  };
}

// ============================================
// Vertex Welding
// ============================================

function buildVertexMap(vertices: Float32Array): VertexMapResult {
  const uniqueVertices: THREE.Vector3[] = [];
  const vertexToUnique = new Map<number, number>();
  const spatialHash = new Map<string, number[]>();

  const numVertices = vertices.length / 3;

  for (let i = 0; i < numVertices; i++) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];

    const foundIndex = findMatchingVertex(x, y, z, uniqueVertices, spatialHash);

    if (foundIndex >= 0) {
      vertexToUnique.set(i, foundIndex);
    } else {
      const newIndex = uniqueVertices.length;
      uniqueVertices.push(new THREE.Vector3(x, y, z));
      vertexToUnique.set(i, newIndex);
      addToSpatialHash(x, y, z, newIndex, spatialHash);
    }
  }

  return { uniqueVertices, vertexToUnique };
}

function getHashKey(x: number, y: number, z: number): string {
  const cx = Math.floor(x / CELL_SIZE);
  const cy = Math.floor(y / CELL_SIZE);
  const cz = Math.floor(z / CELL_SIZE);
  return `${cx},${cy},${cz}`;
}

function findMatchingVertex(
  x: number,
  y: number,
  z: number,
  uniqueVertices: THREE.Vector3[],
  spatialHash: Map<string, number[]>
): number {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = getHashKey(x + dx * CELL_SIZE, y + dy * CELL_SIZE, z + dz * CELL_SIZE);
        const candidates = spatialHash.get(key);

        if (candidates) {
          for (const idx of candidates) {
            const v = uniqueVertices[idx];
            if (
              Math.abs(v.x - x) < EPSILON &&
              Math.abs(v.y - y) < EPSILON &&
              Math.abs(v.z - z) < EPSILON
            ) {
              return idx;
            }
          }
        }
      }
    }
  }
  return -1;
}

function addToSpatialHash(
  x: number,
  y: number,
  z: number,
  index: number,
  spatialHash: Map<string, number[]>
): void {
  const key = getHashKey(x, y, z);
  if (!spatialHash.has(key)) {
    spatialHash.set(key, []);
  }
  spatialHash.get(key)!.push(index);
}

// ============================================
// Boundary Edge Detection
// ============================================

function findBoundaryEdges(vertices: Float32Array, vertexToUnique: Map<number, number>): Edge[] {
  const edgeCount = new Map<string, { count: number; edge: Edge }>();
  const numTriangles = vertices.length / 9;

  for (let t = 0; t < numTriangles; t++) {
    const baseIdx = t * 3;
    const v0 = vertexToUnique.get(baseIdx)!;
    const v1 = vertexToUnique.get(baseIdx + 1)!;
    const v2 = vertexToUnique.get(baseIdx + 2)!;

    const positions = [
      getPosition(vertices, baseIdx),
      getPosition(vertices, baseIdx + 1),
      getPosition(vertices, baseIdx + 2),
    ];

    processTriangleEdges(v0, v1, v2, positions, edgeCount);
  }

  return Array.from(edgeCount.values())
    .filter(({ count }) => count === 1)
    .map(({ edge }) => edge);
}

function getPosition(vertices: Float32Array, idx: number): THREE.Vector3 {
  return new THREE.Vector3(
    vertices[idx * 3],
    vertices[idx * 3 + 1],
    vertices[idx * 3 + 2]
  );
}

function processTriangleEdges(
  v0: number,
  v1: number,
  v2: number,
  positions: THREE.Vector3[],
  edgeCount: Map<string, { count: number; edge: Edge }>
): void {
  const edges: [number, number, THREE.Vector3, THREE.Vector3][] = [
    [v0, v1, positions[0], positions[1]],
    [v1, v2, positions[1], positions[2]],
    [v2, v0, positions[2], positions[0]],
  ];

  for (const [va, vb, pa, pb] of edges) {
    const key = va < vb ? `${va}_${vb}` : `${vb}_${va}`;

    if (!edgeCount.has(key)) {
      edgeCount.set(key, {
        count: 0,
        edge: { v1: va, v2: vb, p1: pa.clone(), p2: pb.clone() },
      });
    }
    edgeCount.get(key)!.count++;
  }
}

// ============================================
// Boundary Loop Construction
// ============================================

function buildBoundaryLoops(edges: Edge[], uniqueVertices: THREE.Vector3[]): BoundaryLoop[] {
  if (edges.length === 0) return [];

  const adjacency = buildAdjacencyMap(edges);
  const usedEdges = new Set<string>();
  const loops: BoundaryLoop[] = [];

  for (const startVertex of adjacency.keys()) {
    const startNeighbors = adjacency.get(startVertex)!;

    for (const [firstNeighbor] of startNeighbors) {
      const firstEdgeKey = getEdgeKey(startVertex, firstNeighbor);
      if (usedEdges.has(firstEdgeKey)) continue;

      const loop = traceLoop(startVertex, firstNeighbor, adjacency, usedEdges, uniqueVertices);
      if (loop) {
        loops.push(loop);
      }
    }
  }

  return loops;
}

function buildAdjacencyMap(edges: Edge[]): Map<number, Map<number, THREE.Vector3>> {
  const adjacency = new Map<number, Map<number, THREE.Vector3>>();

  for (const edge of edges) {
    if (!adjacency.has(edge.v1)) adjacency.set(edge.v1, new Map());
    if (!adjacency.has(edge.v2)) adjacency.set(edge.v2, new Map());

    adjacency.get(edge.v1)!.set(edge.v2, edge.p2);
    adjacency.get(edge.v2)!.set(edge.v1, edge.p1);
  }

  return adjacency;
}

function getEdgeKey(v1: number, v2: number): string {
  return v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
}

function traceLoop(
  startVertex: number,
  firstNeighbor: number,
  adjacency: Map<number, Map<number, THREE.Vector3>>,
  usedEdges: Set<string>,
  uniqueVertices: THREE.Vector3[]
): BoundaryLoop | null {
  const loopVertices: THREE.Vector3[] = [];
  const loopIndices: number[] = [];
  const loopEdges: string[] = [];

  let current = startVertex;
  let next = firstNeighbor;
  const maxIterations = adjacency.size + 1;

  loopIndices.push(current);
  loopVertices.push(uniqueVertices[current].clone());

  for (let i = 0; i < maxIterations; i++) {
    const edgeKey = getEdgeKey(current, next);
    if (usedEdges.has(edgeKey)) break;

    loopEdges.push(edgeKey);
    loopIndices.push(next);
    loopVertices.push(uniqueVertices[next].clone());

    if (next === startVertex) {
      loopIndices.pop();
      loopVertices.pop();

      if (loopIndices.length >= 3) {
        for (const ek of loopEdges) {
          usedEdges.add(ek);
        }
        return createBoundaryLoop(loopVertices, loopIndices);
      }
      break;
    }

    const neighbors = adjacency.get(next);
    if (!neighbors) break;

    const prev = current;
    current = next;

    let found = false;
    for (const [neighbor] of neighbors) {
      if (neighbor === prev) continue;

      const nextEdgeKey = getEdgeKey(current, neighbor);
      if (!usedEdges.has(nextEdgeKey)) {
        next = neighbor;
        found = true;
        break;
      }
    }

    if (!found) break;
  }

  return null;
}

function createBoundaryLoop(vertices: THREE.Vector3[], indices: number[]): BoundaryLoop | null {
  if (vertices.length < 3) return null;

  const center = new THREE.Vector3();
  for (const v of vertices) {
    center.add(v);
  }
  center.divideScalar(vertices.length);

  // Calculate normal using Newell's method
  const normal = new THREE.Vector3();
  for (let i = 0; i < vertices.length; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % vertices.length];

    normal.x += (curr.y - next.y) * (curr.z + next.z);
    normal.y += (curr.z - next.z) * (curr.x + next.x);
    normal.z += (curr.x - next.x) * (curr.y + next.y);
  }

  if (normal.lengthSq() < 1e-10) return null;
  normal.normalize();

  // Calculate area
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    const cross = new THREE.Vector3().crossVectors(
      curr.clone().sub(center),
      next.clone().sub(center)
    );
    area += cross.length();
  }
  area *= 0.5;

  return { vertices, indices, normal, center, area };
}

// ============================================
// Loop Triangulation
// ============================================

function triangulateLoops(
  loops: BoundaryLoop[],
  maxHoleArea: number,
  minHoleVertices: number
): number[] {
  const capTriangles: number[] = [];

  for (const loop of loops) {
    if (loop.vertices.length < minHoleVertices || loop.area > maxHoleArea) {
      continue;
    }

    const triangles = triangulateLoop(loop);
    capTriangles.push(...triangles);
  }

  return capTriangles;
}

function triangulateLoop(loop: BoundaryLoop): number[] {
  const { vertices } = loop;
  const n = vertices.length;

  if (n < 3) return [];

  if (n === 3) {
    return [
      vertices[0].x, vertices[0].y, vertices[0].z,
      vertices[2].x, vertices[2].y, vertices[2].z,
      vertices[1].x, vertices[1].y, vertices[1].z,
    ];
  }

  const { points2D } = projectTo2D(vertices, loop.normal, loop.center);

  // Check for valid projection
  const bounds = getBounds2D(points2D);
  const spread = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

  if (spread < 1e-6) {
    return fanTriangulate(vertices, loop.center);
  }

  const triangleIndices = earClipTriangulate(points2D);

  if (triangleIndices.length === 0) {
    return fanTriangulate(vertices, loop.center);
  }

  return indicesToVertices(triangleIndices, vertices);
}

function projectTo2D(
  vertices: THREE.Vector3[],
  normal: THREE.Vector3,
  center: THREE.Vector3
): { points2D: { x: number; y: number }[] } {
  let tempVec = new THREE.Vector3(1, 0, 0);
  if (Math.abs(normal.dot(tempVec)) > 0.9) {
    tempVec = new THREE.Vector3(0, 1, 0);
  }

  const u = new THREE.Vector3().crossVectors(tempVec, normal).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();

  const points2D = vertices.map((vertex) => {
    const local = vertex.clone().sub(center);
    return { x: local.dot(u), y: local.dot(v) };
  });

  return { points2D };
}

function getBounds2D(points: { x: number; y: number }[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  return { minX, maxX, minY, maxY };
}

function earClipTriangulate(points: { x: number; y: number }[]): number[] {
  const n = points.length;
  if (n < 3) return [];

  const indices = Array.from({ length: n }, (_, i) => i);
  const result: number[] = [];

  // Determine winding order
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  const ccw = signedArea > 0;

  let safetyCounter = n * n;

  while (indices.length > 3 && safetyCounter > 0) {
    safetyCounter--;
    let earFound = false;

    for (let i = 0; i < indices.length; i++) {
      const prevIdx = (i - 1 + indices.length) % indices.length;
      const nextIdx = (i + 1) % indices.length;

      if (isEar(indices, points, prevIdx, i, nextIdx, ccw)) {
        result.push(indices[nextIdx], indices[i], indices[prevIdx]);
        indices.splice(i, 1);
        earFound = true;
        break;
      }
    }

    if (!earFound) break;
  }

  if (indices.length === 3) {
    result.push(indices[2], indices[1], indices[0]);
  }

  return result;
}

function isEar(
  indices: number[],
  points: { x: number; y: number }[],
  prevIdx: number,
  currIdx: number,
  nextIdx: number,
  ccw: boolean
): boolean {
  const prev = points[indices[prevIdx]];
  const curr = points[indices[currIdx]];
  const next = points[indices[nextIdx]];

  const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
  const isConvex = ccw ? cross > 0 : cross < 0;

  if (!isConvex) return false;

  // Check if any other point is inside the triangle
  for (let i = 0; i < indices.length; i++) {
    if (i === prevIdx || i === currIdx || i === nextIdx) continue;

    const p = points[indices[i]];
    if (isPointInTriangle(p.x, p.y, prev.x, prev.y, curr.x, curr.y, next.x, next.y)) {
      return false;
    }
  }

  return true;
}

function isPointInTriangle(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): boolean {
  const sign = (p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number) =>
    (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);

  const d1 = sign(px, py, ax, ay, bx, by);
  const d2 = sign(px, py, bx, by, cx, cy);
  const d3 = sign(px, py, cx, cy, ax, ay);

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

  return !(hasNeg && hasPos);
}

function fanTriangulate(vertices: THREE.Vector3[], center: THREE.Vector3): number[] {
  const triangles: number[] = [];
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const v0 = vertices[i];
    const v1 = vertices[(i + 1) % n];

    triangles.push(
      center.x, center.y, center.z,
      v1.x, v1.y, v1.z,
      v0.x, v0.y, v0.z
    );
  }

  return triangles;
}

function indicesToVertices(indices: number[], vertices: THREE.Vector3[]): number[] {
  const result: number[] = [];

  for (let i = 0; i < indices.length; i += 3) {
    const v0 = vertices[indices[i]];
    const v1 = vertices[indices[i + 1]];
    const v2 = vertices[indices[i + 2]];

    result.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
  }

  return result;
}

function combineVertices(original: Float32Array, capTriangles: number[]): Float32Array {
  const combined = new Float32Array(original.length + capTriangles.length);
  combined.set(original, 0);
  combined.set(new Float32Array(capTriangles), original.length);
  return combined;
}
