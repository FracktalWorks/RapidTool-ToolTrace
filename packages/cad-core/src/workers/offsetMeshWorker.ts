// ============================================
// Offset Mesh Web Worker
// Handles CPU-intensive mesh generation from heightmap data
// ============================================

import * as THREE from 'three';
import { createWatertightMeshFromHeightmap } from '../offset/meshGenerator';
import { fillMeshHoles, analyzeMeshHoles } from '../offset/meshHoleFiller';

// Message types
export interface OffsetMeshWorkerInput {
  type: 'generate-mesh';
  id: string;
  data: {
    heightMap: Float32Array;
    resolution: number;
    scale: number;
    center: { x: number; y: number; z: number };
    clipYMin: number;
    clipYMax: number;
    meshSettings: {
      downsampleFactor: number;
      effectiveResolution: number;
    };
    needsRotation: boolean;
    rotationXZ: number;
    actualYZ: number;
  };
}

export interface OffsetMeshWorkerOutput {
  type: 'mesh-result' | 'progress' | 'error';
  id: string;
  data?: {
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
    vertexCount: number;
    triangleCount: number;
    processingTime: number;
  };
  progress?: {
    current: number;
    total: number;
    stage: string;
  };
  error?: string;
}

// Rotation helper functions (copied from offsetMeshProcessor to avoid import issues in worker)
function createRotationMatrix(xzAngleDeg: number, actualYZ: number): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  
  if (xzAngleDeg === 0 && actualYZ === 0) {
    return matrix;
  }
  
  if (xzAngleDeg !== 0) {
    const rotZ = new THREE.Matrix4();
    rotZ.makeRotationZ(xzAngleDeg * Math.PI / 180);
    matrix.multiply(rotZ);
  }
  
  if (actualYZ !== 0) {
    const rotX = new THREE.Matrix4();
    rotX.makeRotationX(actualYZ * Math.PI / 180);
    matrix.multiply(rotX);
  }
  
  return matrix;
}

function createInverseRotationMatrix(xzAngleDeg: number, actualYZ: number): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  
  if (xzAngleDeg === 0 && actualYZ === 0) {
    return matrix;
  }
  
  if (actualYZ !== 0) {
    const rotX = new THREE.Matrix4();
    rotX.makeRotationX(-actualYZ * Math.PI / 180);
    matrix.multiply(rotX);
  }
  
  if (xzAngleDeg !== 0) {
    const rotZ = new THREE.Matrix4();
    rotZ.makeRotationZ(-xzAngleDeg * Math.PI / 180);
    matrix.multiply(rotZ);
  }
  
  return matrix;
}

// Process mesh generation
function processMeshGeneration(input: OffsetMeshWorkerInput['data']): OffsetMeshWorkerOutput['data'] {
  const startTime = performance.now();
  
  const {
    heightMap,
    resolution,
    scale,
    center,
    clipYMin,
    clipYMax,
    meshSettings,
    needsRotation,
    rotationXZ,
    actualYZ
  } = input;
  
  // Reconstruct center as THREE.Vector3
  const centerVec = new THREE.Vector3(center.x, center.y, center.z);
  
  // Create watertight mesh from heightmap
  const geometry = createWatertightMeshFromHeightmap(
    heightMap,
    resolution,
    scale,
    centerVec,
    clipYMin,
    clipYMax,
    meshSettings
  );
  
  // Apply inverse rotation to restore original orientation
  if (needsRotation) {
    const inverseMatrix = createInverseRotationMatrix(rotationXZ, actualYZ);
    geometry.applyMatrix4(inverseMatrix);
    geometry.computeVertexNormals();
  }
  
  // Extract data for transfer
  const positions = geometry.getAttribute('position').array as Float32Array;
  const normals = geometry.getAttribute('normal').array as Float32Array;
  const indices = geometry.index?.array as Uint32Array;
  
  const endTime = performance.now();
  
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
    processingTime: endTime - startTime
  };
}

// Worker message handler
self.onmessage = (e: MessageEvent<OffsetMeshWorkerInput>) => {
  const { type, id, data } = e.data;
  
  if (type === 'generate-mesh') {
    try {
      // Send progress update
      (self as unknown as Worker).postMessage({
        type: 'progress',
        id,
        progress: { current: 0, total: 100, stage: 'Starting mesh generation...' }
      } as OffsetMeshWorkerOutput);
      
      const result = processMeshGeneration(data);
      
      const transferables: Transferable[] = [
        result.positions.buffer as ArrayBuffer,
        result.normals.buffer as ArrayBuffer,
        result.indices.buffer as ArrayBuffer
      ];
      
      // Send result with transferable arrays
      (self as unknown as Worker).postMessage(
        {
          type: 'mesh-result',
          id,
          data: result
        } as OffsetMeshWorkerOutput,
        transferables
      );
    } catch (error) {
      (self as unknown as Worker).postMessage({
        type: 'error',
        id,
        error: error instanceof Error ? error.message : String(error)
      } as OffsetMeshWorkerOutput);
    }
  }
};

export {};
