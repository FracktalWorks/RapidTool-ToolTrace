/**
 * Hole CSG Web Worker
 * 
 * Performs CSG (Constructive Solid Geometry) operations to subtract
 * mounting holes from the baseplate geometry in a background thread.
 * 
 * This keeps the UI responsive during potentially slow CSG operations.
 */

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SerializedGeometry {
  positions: Float32Array;
  indices?: Uint32Array;
  normals?: Float32Array;
}

interface HoleCSGWorkerMessage {
  type: 'subtract-holes';
  id: string;
  payload: {
    baseplateGeometryData: SerializedGeometry;
    holesGeometryData: SerializedGeometry;
  };
}

interface HoleCSGWorkerResponse {
  type: 'hole-csg-result' | 'hole-csg-progress' | 'hole-csg-error';
  id: string;
  payload?: SerializedGeometry;
  progress?: number;
  error?: string;
}

// Reusable CSG evaluator
const csgEvaluator = new Evaluator();

// ─────────────────────────────────────────────────────────────────────────────
// Geometry Serialization Helpers
// ─────────────────────────────────────────────────────────────────────────────

function deserializeGeometry(data: SerializedGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  
  if (data.indices) {
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  }
  
  if (data.normals) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  } else {
    geometry.computeVertexNormals();
  }
  
  // Add UV attribute for CSG (three-bvh-csg requires it)
  if (!geometry.getAttribute('uv')) {
    const posAttr = geometry.getAttribute('position');
    if (posAttr) {
      const uvArray = new Float32Array(posAttr.count * 2);
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
    }
  }
  
  return geometry;
}

function serializeGeometry(geometry: THREE.BufferGeometry): SerializedGeometry {
  const positions = geometry.getAttribute('position').array as Float32Array;
  const result: SerializedGeometry = {
    positions: new Float32Array(positions),
  };
  
  if (geometry.index) {
    result.indices = new Uint32Array(geometry.index.array);
  }
  
  const normals = geometry.getAttribute('normal');
  if (normals) {
    result.normals = new Float32Array(normals.array as Float32Array);
  }
  
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSG Operations
// ─────────────────────────────────────────────────────────────────────────────

function performCSGSubtraction(
  baseplateGeometry: THREE.BufferGeometry,
  holesGeometry: THREE.BufferGeometry,
  sendProgress: (progress: number) => void
): THREE.BufferGeometry {
  sendProgress(10);
  
  try {
    // Clone geometries for CSG
    const baseplateClone = baseplateGeometry.clone();
    const holesClone = holesGeometry.clone();
    
    sendProgress(30);
    
    // Create brushes for CSG
    const baseplateBrush = new Brush(baseplateClone);
    const holesBrush = new Brush(holesClone);
    
    // Prepare BVH structures
    baseplateBrush.prepareGeometry();
    holesBrush.prepareGeometry();

    sendProgress(50);

    // Perform CSG subtraction (baseplate - holes)
    const result = csgEvaluator.evaluate(baseplateBrush, holesBrush, SUBTRACTION);

    sendProgress(90);

    if (result && result.geometry) {
      // three-bvh-csg returns non-indexed triangle soup.
      // Weld duplicate vertices before computing normals so:
      //  1. Adjacent flat triangles share vertices → smooth normals, no crack lines.
      //  2. T-junction micro-gaps at the CSG boundary are closed.
      const welded = mergeVertices(result.geometry, 0.001);
      welded.computeVertexNormals();
      sendProgress(100);
      return welded;
    }
    
    // Fallback to original geometry
    sendProgress(100);
    return baseplateGeometry;
  } catch (error) {
    console.error('[HoleCSGWorker] CSG error:', error);
    sendProgress(100);
    return baseplateGeometry;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker Message Handler
// ─────────────────────────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<HoleCSGWorkerMessage>) => {
  const { type, id, payload } = event.data;
  
  if (type === 'subtract-holes') {
    try {
      const sendProgress = (progress: number) => {
        const response: HoleCSGWorkerResponse = {
          type: 'hole-csg-progress',
          id,
          progress,
        };
        self.postMessage(response);
      };
      
      // Deserialize geometries
      const baseplateGeometry = deserializeGeometry(payload.baseplateGeometryData);
      const holesGeometry = deserializeGeometry(payload.holesGeometryData);
      
      // Perform CSG subtraction
      const resultGeometry = performCSGSubtraction(
        baseplateGeometry,
        holesGeometry,
        sendProgress
      );
      
      // Serialize result
      const serializedResult = serializeGeometry(resultGeometry);
      
      const response: HoleCSGWorkerResponse = {
        type: 'hole-csg-result',
        id,
        payload: serializedResult,
      };
      
      // Transfer arrays for performance
      const transferables: Transferable[] = [serializedResult.positions.buffer as ArrayBuffer];
      if (serializedResult.indices) {
        transferables.push(serializedResult.indices.buffer as ArrayBuffer);
      }
      if (serializedResult.normals) {
        transferables.push(serializedResult.normals.buffer as ArrayBuffer);
      }
      
      (self as unknown as Worker).postMessage(response, transferables);
    } catch (error) {
      const response: HoleCSGWorkerResponse = {
        type: 'hole-csg-error',
        id,
        error: error instanceof Error ? error.message : 'Unknown hole CSG error',
      };
      self.postMessage(response);
    }
  }
};

export {};
