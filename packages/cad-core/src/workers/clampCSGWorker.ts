/**
 * Clamp CSG Web Worker
 * 
 * Performs CSG (Constructive Solid Geometry) operations for clamp supports
 * in a background thread to keep the UI responsive.
 * 
 * This worker handles:
 * - Support geometry creation
 * - CSG subtraction of cutouts from supports
 * - Progress reporting back to main thread
 */

import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

// BVH options with increased maxDepth to handle complex geometries without warnings
const BVH_OPTIONS = {
  maxDepth: 100, // Default is 40, increase for complex merged geometries
  maxLeafTris: 10,
};
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CSGWorkerMessage {
  type: 'compute-csg';
  id: string;
  payload: {
    supportGeometryData: SerializedGeometry;
    cutoutsGeometryData: SerializedGeometry | null;
  };
}

interface SerializedGeometry {
  positions: Float32Array;
  indices?: Uint32Array;
  normals?: Float32Array;
}

interface CSGWorkerResponse {
  type: 'csg-result' | 'csg-progress' | 'csg-error';
  id: string;
  payload?: {
    positions: Float32Array;
    indices?: Uint32Array;
    normals?: Float32Array;
  };
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
  supportGeometry: THREE.BufferGeometry,
  cutoutsGeometry: THREE.BufferGeometry | null,
  sendProgress: (progress: number) => void
): THREE.BufferGeometry {
  sendProgress(10);
  
  // If no cutouts, return support geometry as-is
  if (!cutoutsGeometry) {
    sendProgress(100);
    return supportGeometry;
  }
  
  sendProgress(30);
  
  try {
    // Clone geometries for CSG
    const supportClone = supportGeometry.clone();
    const cutoutsClone = cutoutsGeometry.clone();
    
    sendProgress(50);
    
    // Create brushes for CSG
    const supportBrush = new Brush(supportClone);
    const cutoutsBrush = new Brush(cutoutsClone);
    
    // Prepare BVH structures with increased maxDepth
    supportBrush.prepareGeometry(BVH_OPTIONS);
    cutoutsBrush.prepareGeometry(BVH_OPTIONS);
    
    sendProgress(70);
    
    // Perform CSG subtraction
    const result = csgEvaluator.evaluate(supportBrush, cutoutsBrush, SUBTRACTION);
    
    sendProgress(90);
    
    if (result && result.geometry) {
      result.geometry.computeVertexNormals();
      sendProgress(100);
      return result.geometry;
    }
    
    // Fallback to support geometry
    sendProgress(100);
    return supportGeometry;
  } catch {
    sendProgress(100);
    return supportGeometry;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker Message Handler
// ─────────────────────────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<CSGWorkerMessage>) => {
  const { type, id, payload } = event.data;
  
  if (type === 'compute-csg') {
    try {
      const sendProgress = (progress: number) => {
        const response: CSGWorkerResponse = {
          type: 'csg-progress',
          id,
          progress,
        };
        self.postMessage(response);
      };
      
      // Deserialize geometries
      const supportGeometry = deserializeGeometry(payload.supportGeometryData);
      const cutoutsGeometry = payload.cutoutsGeometryData 
        ? deserializeGeometry(payload.cutoutsGeometryData) 
        : null;
      
      // Perform CSG (cutouts already have offset applied)
      const resultGeometry = performCSGSubtraction(
        supportGeometry,
        cutoutsGeometry,
        sendProgress
      );
      
      // Serialize result
      const serializedResult = serializeGeometry(resultGeometry);
      
      const response: CSGWorkerResponse = {
        type: 'csg-result',
        id,
        payload: serializedResult,
      };
      
      // Transfer arrays for performance (use type assertion for ArrayBufferLike)
      const transferables: Transferable[] = [serializedResult.positions.buffer as ArrayBuffer];
      if (serializedResult.indices) {
        transferables.push(serializedResult.indices.buffer as ArrayBuffer);
      }
      if (serializedResult.normals) {
        transferables.push(serializedResult.normals.buffer as ArrayBuffer);
      }
      
      (self as unknown as Worker).postMessage(response, transferables);
    } catch (error) {
      const response: CSGWorkerResponse = {
        type: 'csg-error',
        id,
        error: error instanceof Error ? error.message : 'Unknown CSG error',
      };
      self.postMessage(response);
    }
  }
};

export {};
