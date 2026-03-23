/**
 * Watertight Mesh Generation Module
 * Creates manifold meshes from heightmap data
 * For Y-up coordinate system (X-Z horizontal plane, Y is height)
 */

import * as THREE from 'three';

// ============================================
// Types
// ============================================

export interface MeshAnalysisResult {
  isManifold: boolean;
  vertexCount: number;
  triangleCount: number;
  edgeCount: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  manifoldEdges: number;
  nonManifoldVertices: number;
  isolatedVertices: number;
  boundaryEdgeList: EdgeInfo[];
  nonManifoldEdgeList: NonManifoldEdgeInfo[];
  inconsistentWindingEdges: number;
  issues: string[];
}

interface EdgeInfo {
  v1: number;
  v2: number;
  pos1: THREE.Vector3;
  pos2: THREE.Vector3;
}

interface NonManifoldEdgeInfo extends EdgeInfo {
  faceCount: number;
}

export interface MeshGeneratorOptions {
  downsampleFactor?: number;
  effectiveResolution?: number;
  useSmoothBoundaries?: boolean;
}

interface ValidVertex {
  gridI: number;
  gridJ: number;
  topPos: THREE.Vector3;
  bottomPos: THREE.Vector3;
  topIndex: number;
  bottomIndex: number;
}

// ============================================
// Mesh Analysis
// ============================================

/**
 * Analyze mesh for manifold properties
 */
export function analyzeMeshManifold(geometry: THREE.BufferGeometry): MeshAnalysisResult {
  const positions = geometry.getAttribute('position');
  const indices = geometry.getIndex();

  if (!indices) {
    return createEmptyAnalysis(positions.count, ['Geometry has no index buffer']);
  }

  const vertexCount = positions.count;
  const triangleCount = indices.count / 3;

  // Build edge map: edge key -> list of {faceIndex, direction}
  const edgeMap = new Map<string, { faceIndex: number; forward: boolean }[]>();
  const usedVertices = new Set<number>();

  // Process all triangles
  for (let i = 0; i < triangleCount; i++) {
    const a = indices.getX(i * 3);
    const b = indices.getX(i * 3 + 1);
    const c = indices.getX(i * 3 + 2);

    usedVertices.add(a);
    usedVertices.add(b);
    usedVertices.add(c);

    addEdgesToMap(edgeMap, i, [
      [a, b],
      [b, c],
      [c, a],
    ]);
  }

  // Analyze edges
  const edgeAnalysis = analyzeEdges(edgeMap, positions);

  // Build issues list
  const issues = buildIssuesList(edgeAnalysis, vertexCount - usedVertices.size);

  return {
    isManifold:
      edgeAnalysis.boundaryEdges === 0 &&
      edgeAnalysis.nonManifoldEdges === 0 &&
      edgeAnalysis.inconsistentWindingEdges === 0,
    vertexCount,
    triangleCount,
    edgeCount: edgeMap.size,
    ...edgeAnalysis,
    nonManifoldVertices: 0,
    isolatedVertices: vertexCount - usedVertices.size,
    issues,
  };
}

// ============================================
// Analysis Helpers
// ============================================

function createEmptyAnalysis(vertexCount: number, issues: string[]): MeshAnalysisResult {
  return {
    isManifold: false,
    vertexCount,
    triangleCount: 0,
    edgeCount: 0,
    boundaryEdges: 0,
    nonManifoldEdges: 0,
    manifoldEdges: 0,
    nonManifoldVertices: 0,
    isolatedVertices: vertexCount,
    boundaryEdgeList: [],
    nonManifoldEdgeList: [],
    inconsistentWindingEdges: 0,
    issues,
  };
}

function getEdgeKey(v1: number, v2: number): string {
  return v1 < v2 ? `${v1},${v2}` : `${v2},${v1}`;
}

function addEdgesToMap(
  edgeMap: Map<string, { faceIndex: number; forward: boolean }[]>,
  faceIndex: number,
  edges: [number, number][]
): void {
  for (const [v1, v2] of edges) {
    const key = getEdgeKey(v1, v2);
    const forward = v1 < v2;

    if (!edgeMap.has(key)) {
      edgeMap.set(key, []);
    }
    edgeMap.get(key)!.push({ faceIndex, forward });
  }
}

function analyzeEdges(
  edgeMap: Map<string, { faceIndex: number; forward: boolean }[]>,
  positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
): {
  boundaryEdges: number;
  nonManifoldEdges: number;
  manifoldEdges: number;
  inconsistentWindingEdges: number;
  boundaryEdgeList: EdgeInfo[];
  nonManifoldEdgeList: NonManifoldEdgeInfo[];
} {
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  let manifoldEdges = 0;
  let inconsistentWindingEdges = 0;

  const boundaryEdgeList: EdgeInfo[] = [];
  const nonManifoldEdgeList: NonManifoldEdgeInfo[] = [];
  const MAX_SAMPLES = 50;

  const getVertexPos = (idx: number): THREE.Vector3 =>
    new THREE.Vector3(positions.getX(idx), positions.getY(idx), positions.getZ(idx));

  for (const [key, faces] of edgeMap) {
    const [v1Str, v2Str] = key.split(',');
    const v1 = parseInt(v1Str);
    const v2 = parseInt(v2Str);

    if (faces.length === 1) {
      boundaryEdges++;
      if (boundaryEdgeList.length < MAX_SAMPLES) {
        boundaryEdgeList.push({ v1, v2, pos1: getVertexPos(v1), pos2: getVertexPos(v2) });
      }
    } else if (faces.length === 2) {
      manifoldEdges++;
      if (faces[0].forward === faces[1].forward) {
        inconsistentWindingEdges++;
      }
    } else {
      nonManifoldEdges++;
      if (nonManifoldEdgeList.length < MAX_SAMPLES) {
        nonManifoldEdgeList.push({
          v1,
          v2,
          faceCount: faces.length,
          pos1: getVertexPos(v1),
          pos2: getVertexPos(v2),
        });
      }
    }
  }

  return {
    boundaryEdges,
    nonManifoldEdges,
    manifoldEdges,
    inconsistentWindingEdges,
    boundaryEdgeList,
    nonManifoldEdgeList,
  };
}

function buildIssuesList(
  edgeAnalysis: ReturnType<typeof analyzeEdges>,
  isolatedVertices: number
): string[] {
  const issues: string[] = [];

  if (edgeAnalysis.boundaryEdges > 0) {
    issues.push(`${edgeAnalysis.boundaryEdges} boundary edges (holes in mesh)`);
  }
  if (edgeAnalysis.nonManifoldEdges > 0) {
    issues.push(`${edgeAnalysis.nonManifoldEdges} non-manifold edges (>2 faces sharing edge)`);
  }
  if (edgeAnalysis.inconsistentWindingEdges > 0) {
    issues.push(`${edgeAnalysis.inconsistentWindingEdges} edges with inconsistent winding`);
  }
  if (isolatedVertices > 0) {
    issues.push(`${isolatedVertices} isolated vertices`);
  }

  return issues;
}

// ============================================
// Mesh Generation
// ============================================

/**
 * Create watertight mesh from heightmap data
 */
export function createWatertightMeshFromHeightmap(
  heightMap: Float32Array,
  resolution: number,
  scale: number,
  center: { x: number; y: number; z: number },
  clipYMin: number,
  clipYMax: number,
  meshSettings: MeshGeneratorOptions | null = null
): THREE.BufferGeometry {
  const startTime = performance.now();

  // Apply downsampling if needed
  let workingHeightMap = heightMap;
  let workingResolution = resolution;
  const useSmoothBoundaries = meshSettings?.useSmoothBoundaries !== false;

  if (meshSettings?.downsampleFactor && meshSettings.downsampleFactor > 1) {
    const downsampleResult = downsampleHeightmap(heightMap, resolution, meshSettings.downsampleFactor);
    workingHeightMap = downsampleResult.heightMap;
    workingResolution = downsampleResult.resolution;
  }

  // Build valid vertices grid
  const { validVertices, vertexGrid, minHeight } = buildVertexGrid(
    workingHeightMap,
    workingResolution,
    scale,
    center,
    clipYMin,
    clipYMax
  );

  // Create indexed mesh
  const { positions, vertexMap, nextVertexIndex } = createIndexedVertices(validVertices);

  // Build all geometry
  const indicesList = buildGeometry(
    validVertices,
    vertexGrid,
    workingResolution,
    useSmoothBoundaries
  );

  // Create Three.js geometry
  const geometry = createThreeGeometry(positions, indicesList);

  return geometry;
}

// ============================================
// Vertex Grid Building
// ============================================

function buildVertexGrid(
  heightMap: Float32Array,
  resolution: number,
  scale: number,
  center: { x: number; y: number; z: number },
  clipYMin: number,
  clipYMax: number
): {
  validVertices: ValidVertex[];
  vertexGrid: (number | null)[];
  minHeight: number;
} {
  const invResMinusOne = 1 / (resolution - 1);
  const invScale = 1 / scale;
  const heightThreshold = 0.001;

  const vertexGrid: (number | null)[] = new Array(resolution * resolution).fill(null);
  const validVertices: ValidVertex[] = [];

  // Find minimum height
  let minHeight = Infinity;
  for (let i = 0; i < heightMap.length; i++) {
    minHeight = Math.min(minHeight, heightMap[i]);
  }

  // Build vertices
  for (let j = 0; j < resolution; j++) {
    const flippedJ = resolution - 1 - j;
    const zCoord = -((flippedJ * 2 * invResMinusOne - 1) - center.z) * invScale;

    for (let i = 0; i < resolution; i++) {
      const heightIdx = flippedJ * resolution + i;
      const gridIdx = j * resolution + i;
      const rawHeight = heightMap[heightIdx];

      if (Math.abs(rawHeight - minHeight) > heightThreshold) {
        const x = ((i * 2 * invResMinusOne - 1) + center.x) * invScale;
        let worldY = (rawHeight + center.y) * invScale;
        worldY = Math.max(clipYMin, Math.min(clipYMax, worldY));

        validVertices.push({
          gridI: i,
          gridJ: j,
          topPos: new THREE.Vector3(x, worldY, zCoord),
          bottomPos: new THREE.Vector3(x, clipYMin, zCoord),
          topIndex: -1,
          bottomIndex: -1,
        });

        vertexGrid[gridIdx] = validVertices.length - 1;
      }
    }
  }

  return { validVertices, vertexGrid, minHeight };
}

// ============================================
// Indexed Vertex Creation
// ============================================

function createIndexedVertices(validVertices: ValidVertex[]): {
  positions: number[];
  vertexMap: Map<string, number>;
  nextVertexIndex: number;
} {
  const vertexMap = new Map<string, number>();
  const positions: number[] = [];
  let nextVertexIndex = 0;

  const getOrCreateVertex = (x: number, y: number, z: number): number => {
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

    if (vertexMap.has(key)) {
      return vertexMap.get(key)!;
    }

    const index = nextVertexIndex++;
    positions.push(x, y, z);
    vertexMap.set(key, index);
    return index;
  };

  // Create top and bottom vertices
  for (const v of validVertices) {
    v.topIndex = getOrCreateVertex(v.topPos.x, v.topPos.y, v.topPos.z);
    v.bottomIndex = getOrCreateVertex(v.bottomPos.x, v.bottomPos.y, v.bottomPos.z);
  }

  return { positions, vertexMap, nextVertexIndex };
}

// ============================================
// Geometry Building
// ============================================

function buildGeometry(
  validVertices: ValidVertex[],
  vertexGrid: (number | null)[],
  resolution: number,
  useSmoothBoundaries: boolean
): number[] {
  const indicesList: number[] = [];

  const getVertex = (i: number, j: number): number | null => {
    if (i < 0 || i >= resolution || j < 0 || j >= resolution) {
      return null;
    }
    return vertexGrid[j * resolution + i];
  };

  // Build top and bottom surfaces
  buildSurfaces(validVertices, vertexGrid, resolution, indicesList, getVertex);

  // Build side walls
  buildWalls(validVertices, vertexGrid, resolution, useSmoothBoundaries, indicesList, getVertex);

  return indicesList;
}

function buildSurfaces(
  validVertices: ValidVertex[],
  vertexGrid: (number | null)[],
  resolution: number,
  indicesList: number[],
  getVertex: (i: number, j: number) => number | null
): void {
  for (let j = 0; j < resolution - 1; j++) {
    for (let i = 0; i < resolution - 1; i++) {
      const aIdx = getVertex(i, j);
      const bIdx = getVertex(i + 1, j);
      const cIdx = getVertex(i, j + 1);
      const dIdx = getVertex(i + 1, j + 1);

      const validCount =
        (aIdx !== null ? 1 : 0) +
        (bIdx !== null ? 1 : 0) +
        (cIdx !== null ? 1 : 0) +
        (dIdx !== null ? 1 : 0);

      if (validCount === 4) {
        addFullQuad(validVertices, aIdx!, bIdx!, cIdx!, dIdx!, indicesList);
      } else if (validCount === 3) {
        addPartialCell(validVertices, aIdx, bIdx, cIdx, dIdx, indicesList);
      }
    }
  }
}

function addFullQuad(
  validVertices: ValidVertex[],
  aIdx: number,
  bIdx: number,
  cIdx: number,
  dIdx: number,
  indicesList: number[]
): void {
  const va = validVertices[aIdx];
  const vb = validVertices[bIdx];
  const vc = validVertices[cIdx];
  const vd = validVertices[dIdx];

  // Top surface (CCW when viewed from +Y)
  indicesList.push(va.topIndex, vd.topIndex, vb.topIndex);
  indicesList.push(va.topIndex, vc.topIndex, vd.topIndex);

  // Bottom surface (opposite winding)
  indicesList.push(va.bottomIndex, vb.bottomIndex, vd.bottomIndex);
  indicesList.push(va.bottomIndex, vd.bottomIndex, vc.bottomIndex);
}

function addPartialCell(
  validVertices: ValidVertex[],
  aIdx: number | null,
  bIdx: number | null,
  cIdx: number | null,
  dIdx: number | null,
  indicesList: number[]
): void {
  const a = aIdx !== null;
  const b = bIdx !== null;
  const c = cIdx !== null;
  const d = dIdx !== null;

  if (!a && b && c && d) {
    // BL missing
    const vb = validVertices[bIdx!];
    const vc = validVertices[cIdx!];
    const vd = validVertices[dIdx!];
    indicesList.push(vc.topIndex, vd.topIndex, vb.topIndex);
    indicesList.push(vc.bottomIndex, vb.bottomIndex, vd.bottomIndex);
  } else if (a && !b && c && d) {
    // BR missing
    const va = validVertices[aIdx!];
    const vc = validVertices[cIdx!];
    const vd = validVertices[dIdx!];
    indicesList.push(va.topIndex, vc.topIndex, vd.topIndex);
    indicesList.push(va.bottomIndex, vd.bottomIndex, vc.bottomIndex);
  } else if (a && b && !c && d) {
    // TL missing
    const va = validVertices[aIdx!];
    const vb = validVertices[bIdx!];
    const vd = validVertices[dIdx!];
    indicesList.push(va.topIndex, vd.topIndex, vb.topIndex);
    indicesList.push(va.bottomIndex, vb.bottomIndex, vd.bottomIndex);
  } else if (a && b && c && !d) {
    // TR missing
    const va = validVertices[aIdx!];
    const vb = validVertices[bIdx!];
    const vc = validVertices[cIdx!];
    indicesList.push(va.topIndex, vc.topIndex, vb.topIndex);
    indicesList.push(va.bottomIndex, vb.bottomIndex, vc.bottomIndex);
  }
}

// ============================================
// Wall Building
// ============================================

function buildWalls(
  validVertices: ValidVertex[],
  vertexGrid: (number | null)[],
  resolution: number,
  useSmoothBoundaries: boolean,
  indicesList: number[],
  getVertex: (i: number, j: number) => number | null
): void {
  const processedEdges = new Set<string>();
  const diagonalBoundaryEdges = useSmoothBoundaries
    ? identifyDiagonalBoundaryEdges(vertexGrid, resolution, getVertex)
    : new Set<string>();

  // Build horizontal and vertical walls
  buildHorizontalWalls(
    validVertices,
    vertexGrid,
    resolution,
    diagonalBoundaryEdges,
    processedEdges,
    indicesList,
    getVertex
  );

  buildVerticalWalls(
    validVertices,
    vertexGrid,
    resolution,
    diagonalBoundaryEdges,
    processedEdges,
    indicesList,
    getVertex
  );

  // Build diagonal walls for 3-corner cells
  if (useSmoothBoundaries) {
    buildDiagonalWalls(validVertices, vertexGrid, resolution, processedEdges, indicesList, getVertex);
  }
}

function getGridEdgeKey(i1: number, j1: number, i2: number, j2: number): string {
  if (i1 < i2 || (i1 === i2 && j1 < j2)) {
    return `${i1},${j1}-${i2},${j2}`;
  }
  return `${i2},${j2}-${i1},${j1}`;
}

function identifyDiagonalBoundaryEdges(
  vertexGrid: (number | null)[],
  resolution: number,
  getVertex: (i: number, j: number) => number | null
): Set<string> {
  const diagonalBoundaryEdges = new Set<string>();

  for (let j = 0; j < resolution - 1; j++) {
    for (let i = 0; i < resolution - 1; i++) {
      const bl = getVertex(i, j) !== null;
      const br = getVertex(i + 1, j) !== null;
      const tl = getVertex(i, j + 1) !== null;
      const tr = getVertex(i + 1, j + 1) !== null;
      const validCount = (bl ? 1 : 0) + (br ? 1 : 0) + (tl ? 1 : 0) + (tr ? 1 : 0);

      if (validCount === 3) {
        if (!bl) {
          diagonalBoundaryEdges.add(getGridEdgeKey(i, j, i + 1, j));
          diagonalBoundaryEdges.add(getGridEdgeKey(i, j, i, j + 1));
        } else if (!br) {
          diagonalBoundaryEdges.add(getGridEdgeKey(i, j, i + 1, j));
          diagonalBoundaryEdges.add(getGridEdgeKey(i + 1, j, i + 1, j + 1));
        } else if (!tl) {
          diagonalBoundaryEdges.add(getGridEdgeKey(i, j, i, j + 1));
          diagonalBoundaryEdges.add(getGridEdgeKey(i, j + 1, i + 1, j + 1));
        } else if (!tr) {
          diagonalBoundaryEdges.add(getGridEdgeKey(i + 1, j, i + 1, j + 1));
          diagonalBoundaryEdges.add(getGridEdgeKey(i, j + 1, i + 1, j + 1));
        }
      }
    }
  }

  return diagonalBoundaryEdges;
}

function buildHorizontalWalls(
  validVertices: ValidVertex[],
  vertexGrid: (number | null)[],
  resolution: number,
  diagonalBoundaryEdges: Set<string>,
  processedEdges: Set<string>,
  indicesList: number[],
  getVertex: (i: number, j: number) => number | null
): void {
  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution - 1; i++) {
      const curr = getVertex(i, j);
      const next = getVertex(i + 1, j);

      if (curr === null || next === null) continue;

      const gridEdgeKey = getGridEdgeKey(i, j, i + 1, j);
      if (diagonalBoundaryEdges.has(gridEdgeKey)) continue;

      const currV = validVertices[curr];
      const nextV = validVertices[next];

      // Check neighbors
      const above = j < resolution - 1 ? getVertex(i, j + 1) : null;
      const aboveNext = j < resolution - 1 ? getVertex(i + 1, j + 1) : null;
      const below = j > 0 ? getVertex(i, j - 1) : null;
      const belowNext = j > 0 ? getVertex(i + 1, j - 1) : null;

      const missingAbove = above === null && aboveNext === null;
      const missingBelow = below === null && belowNext === null;

      const edgeKey = getEdgeKey(currV.topIndex, nextV.topIndex);
      if (processedEdges.has(edgeKey)) continue;

      if ((missingAbove && !missingBelow) || j === resolution - 1) {
        processedEdges.add(edgeKey);
        addWallQuad(nextV, currV, indicesList);
      } else if ((missingBelow && !missingAbove) || j === 0) {
        processedEdges.add(edgeKey);
        addWallQuad(currV, nextV, indicesList);
      }
    }
  }
}

function buildVerticalWalls(
  validVertices: ValidVertex[],
  vertexGrid: (number | null)[],
  resolution: number,
  diagonalBoundaryEdges: Set<string>,
  processedEdges: Set<string>,
  indicesList: number[],
  getVertex: (i: number, j: number) => number | null
): void {
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution - 1; j++) {
      const curr = getVertex(i, j);
      const next = getVertex(i, j + 1);

      if (curr === null || next === null) continue;

      const gridEdgeKey = getGridEdgeKey(i, j, i, j + 1);
      if (diagonalBoundaryEdges.has(gridEdgeKey)) continue;

      const currV = validVertices[curr];
      const nextV = validVertices[next];

      // Check neighbors
      const left = i > 0 ? getVertex(i - 1, j) : null;
      const leftNext = i > 0 ? getVertex(i - 1, j + 1) : null;
      const right = i < resolution - 1 ? getVertex(i + 1, j) : null;
      const rightNext = i < resolution - 1 ? getVertex(i + 1, j + 1) : null;

      const missingLeft = left === null && leftNext === null;
      const missingRight = right === null && rightNext === null;

      const edgeKey = getEdgeKey(currV.topIndex, nextV.topIndex);
      if (processedEdges.has(edgeKey)) continue;

      if ((missingLeft && !missingRight) || i === 0) {
        processedEdges.add(edgeKey);
        addWallQuad(nextV, currV, indicesList);
      } else if ((missingRight && !missingLeft) || i === resolution - 1) {
        processedEdges.add(edgeKey);
        addWallQuad(currV, nextV, indicesList);
      }
    }
  }
}

function buildDiagonalWalls(
  validVertices: ValidVertex[],
  vertexGrid: (number | null)[],
  resolution: number,
  processedEdges: Set<string>,
  indicesList: number[],
  getVertex: (i: number, j: number) => number | null
): void {
  for (let j = 0; j < resolution - 1; j++) {
    for (let i = 0; i < resolution - 1; i++) {
      const blIdx = getVertex(i, j);
      const brIdx = getVertex(i + 1, j);
      const tlIdx = getVertex(i, j + 1);
      const trIdx = getVertex(i + 1, j + 1);

      const bl = blIdx !== null;
      const br = brIdx !== null;
      const tl = tlIdx !== null;
      const tr = trIdx !== null;
      const validCount = (bl ? 1 : 0) + (br ? 1 : 0) + (tl ? 1 : 0) + (tr ? 1 : 0);

      if (validCount !== 3) continue;

      addDiagonalWall(validVertices, bl, br, tl, tr, blIdx, brIdx, tlIdx, trIdx, processedEdges, indicesList);
    }
  }
}

function addDiagonalWall(
  validVertices: ValidVertex[],
  bl: boolean,
  br: boolean,
  tl: boolean,
  tr: boolean,
  blIdx: number | null,
  brIdx: number | null,
  tlIdx: number | null,
  trIdx: number | null,
  processedEdges: Set<string>,
  indicesList: number[]
): void {
  if (!bl && br && tl && tr) {
    const vtl = validVertices[tlIdx!];
    const vbr = validVertices[brIdx!];
    const edgeKey = getEdgeKey(vtl.topIndex, vbr.topIndex);
    if (!processedEdges.has(edgeKey)) {
      processedEdges.add(edgeKey);
      addWallQuad(vtl, vbr, indicesList);
    }
  } else if (bl && !br && tl && tr) {
    const vtr = validVertices[trIdx!];
    const vbl = validVertices[blIdx!];
    const edgeKey = getEdgeKey(vbl.topIndex, vtr.topIndex);
    if (!processedEdges.has(edgeKey)) {
      processedEdges.add(edgeKey);
      addWallQuad(vbl, vtr, indicesList);
    }
  } else if (bl && br && !tl && tr) {
    const vbl = validVertices[blIdx!];
    const vtr = validVertices[trIdx!];
    const edgeKey = getEdgeKey(vbl.topIndex, vtr.topIndex);
    if (!processedEdges.has(edgeKey)) {
      processedEdges.add(edgeKey);
      addWallQuad(vtr, vbl, indicesList);
    }
  } else if (bl && br && tl && !tr) {
    const vtl = validVertices[tlIdx!];
    const vbr = validVertices[brIdx!];
    const edgeKey = getEdgeKey(vtl.topIndex, vbr.topIndex);
    if (!processedEdges.has(edgeKey)) {
      processedEdges.add(edgeKey);
      addWallQuad(vbr, vtl, indicesList);
    }
  }
}

function addWallQuad(v1: ValidVertex, v2: ValidVertex, indicesList: number[]): void {
  indicesList.push(v1.topIndex, v2.topIndex, v2.bottomIndex);
  indicesList.push(v1.topIndex, v2.bottomIndex, v1.bottomIndex);
}

// ============================================
// Geometry Creation
// ============================================

function createThreeGeometry(positions: number[], indicesList: number[]): THREE.BufferGeometry {
  const finalIndices = new Uint32Array(indicesList);
  const finalPositions = new Float32Array(positions);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(finalPositions, 3));
  geometry.setIndex(new THREE.BufferAttribute(finalIndices, 1));
  geometry.computeVertexNormals();

  return geometry;
}

// ============================================
// Heightmap Utilities
// ============================================

function downsampleHeightmap(
  heightMap: Float32Array,
  resolution: number,
  factor: number
): { heightMap: Float32Array; resolution: number } {
  const newResolution = Math.floor(resolution / factor);
  const newHeightMap = new Float32Array(newResolution * newResolution);

  for (let j = 0; j < newResolution; j++) {
    for (let i = 0; i < newResolution; i++) {
      const srcJ = j * factor;
      const srcI = i * factor;

      let sum = 0;
      let count = 0;

      for (let dj = 0; dj < factor; dj++) {
        for (let di = 0; di < factor; di++) {
          const sj = Math.min(resolution - 1, srcJ + dj);
          const si = Math.min(resolution - 1, srcI + di);
          sum += heightMap[sj * resolution + si];
          count++;
        }
      }

      newHeightMap[j * newResolution + i] = sum / count;
    }
  }

  return { heightMap: newHeightMap, resolution: newResolution };
}

/**
 * Calculate optimal mesh settings based on resolution
 */
export function calculateOptimalMeshSettings(
  resolution: number,
  heightMap: Float32Array
): MeshGeneratorOptions & {
  quality: string;
  estimatedVertices: number;
  estimatedTriangles: number;
} {
  const MAX_VERTICES = 2_000_000;
  const totalVertices = resolution * resolution;

  let downsampleFactor = 2;
  let quality = 'optimized';

  if (totalVertices > MAX_VERTICES) {
    const criticalDownsample = Math.ceil(Math.sqrt(totalVertices / MAX_VERTICES));
    downsampleFactor = Math.max(2, criticalDownsample);
    quality = 'auto-reduced';
  }

  const effectiveResolution = Math.floor(resolution / downsampleFactor);
  const estimatedVertices = effectiveResolution * effectiveResolution * 2;
  const estimatedTriangles = effectiveResolution * effectiveResolution * 4;

  return {
    downsampleFactor,
    effectiveResolution,
    useSmoothBoundaries: true,
    quality,
    estimatedVertices,
    estimatedTriangles,
  };
}
