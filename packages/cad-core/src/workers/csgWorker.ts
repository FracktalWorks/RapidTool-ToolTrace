// ============================================
// Cavity CSG Web Worker
// Handles CPU-intensive CSG subtraction operations
// ============================================

import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// BVH options with increased maxDepth to handle complex geometries without warnings
const BVH_OPTIONS = {
  maxDepth: 100, // Default is 40, increase for complex merged geometries
  maxLeafTris: 10,
};

// Message types
export interface CSGWorkerInput {
  type: 'subtract-single' | 'subtract-batch' | 'union-batch' | 'csg-union-batch';
  id: string;
  data: {
    // For single subtraction
    supportGeometry?: {
      positions: Float32Array;
      normals?: Float32Array;
      indices?: Uint32Array;
    };
    cutterGeometry?: {
      positions: Float32Array;
      normals?: Float32Array;
      indices?: Uint32Array;
    };
    supportId?: string;
    
    // For batch subtraction
    supports?: Array<{
      id: string;
      positions: Float32Array;
      normals?: Float32Array;
      indices?: Uint32Array;
    }>;
    cutter?: {
      positions: Float32Array;
      normals?: Float32Array;
      indices?: Uint32Array;
    };
  };
}

export interface CSGWorkerOutput {
  type: 'subtraction-result' | 'batch-result' | 'union-result' | 'progress' | 'error';
  id: string;
  data?: {
    supportId?: string;
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
    vertexCount: number;
    triangleCount: number;
  };
  batchData?: Array<{
    supportId: string;
    success: boolean;
    positions?: Float32Array;
    normals?: Float32Array;
    indices?: Uint32Array;
    vertexCount?: number;
    triangleCount?: number;
    error?: string;
  }>;
  progress?: {
    current: number;
    total: number;
    stage: string;
    supportId?: string;
  };
  error?: string;
}

// Helper to create BufferGeometry from arrays
function createGeometryFromArrays(
  positions: Float32Array,
  normals?: Float32Array,
  indices?: Uint32Array
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  if (normals && normals.length > 0) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  }
  
  if (indices && indices.length > 0) {
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  } else {
    // Create indices if not provided
    const vertexCount = positions.length / 3;
    const indexArray = new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) indexArray[i] = i;
    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  }
  
  // Ensure UV attribute exists for CSG
  if (!geometry.getAttribute('uv')) {
    const position = geometry.getAttribute('position');
    const uvArray = new Float32Array(position.count * 2);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  }
  
  geometry.computeVertexNormals();
  return geometry;
}

// Extract geometry data for transfer
function extractGeometryData(geometry: THREE.BufferGeometry) {
  // CSG results may be non-indexed - convert to indexed if necessary
  let workingGeometry = geometry;
  
  // If no index, create one (each vertex is unique)
  if (!workingGeometry.index) {
    const positions = workingGeometry.getAttribute('position');
    if (positions) {
      const indexArray = new Uint32Array(positions.count);
      for (let i = 0; i < positions.count; i++) {
        indexArray[i] = i;
      }
      workingGeometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
    }
  }
  
  const positions = workingGeometry.getAttribute('position').array as Float32Array;
  const normals = workingGeometry.getAttribute('normal')?.array as Float32Array || new Float32Array(0);
  const indices = workingGeometry.index?.array as Uint32Array || new Uint32Array(0);
  
  // For non-indexed geometry, triangle count is vertexCount / 3
  const triangleCount = indices.length > 0 ? indices.length / 3 : positions.length / 9;
  
  console.log(`[extractGeometryData] positions: ${positions.length}, indices: ${indices.length}, triangles: ${triangleCount}`);
  
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    vertexCount: positions.length / 3,
    triangleCount
  };
}

// Process single CSG subtraction
function processSingleSubtraction(
  supportData: CSGWorkerInput['data']['supportGeometry'],
  cutterData: CSGWorkerInput['data']['cutterGeometry']
): CSGWorkerOutput['data'] | null {
  if (!supportData || !cutterData) return null;
  
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  
  // Create geometries
  const supportGeometry = createGeometryFromArrays(
    supportData.positions,
    supportData.normals,
    supportData.indices
  );
  
  const cutterGeometry = createGeometryFromArrays(
    cutterData.positions,
    cutterData.normals,
    cutterData.indices
  );
  
  // Create brushes
  const supportBrush = new Brush(supportGeometry);
  supportBrush.updateMatrixWorld();
  // Prepare BVH and half-edge structures for CSG
  supportBrush.prepareGeometry(BVH_OPTIONS);
  
  const cutterBrush = new Brush(cutterGeometry);
  cutterBrush.updateMatrixWorld();
  // Prepare BVH and half-edge structures for CSG
  cutterBrush.prepareGeometry(BVH_OPTIONS);
  
  // Perform CSG subtraction
  const resultBrush = evaluator.evaluate(supportBrush, cutterBrush, SUBTRACTION);
  
  if (!resultBrush || !resultBrush.geometry) {
    return null;
  }
  
  const resultGeometry = resultBrush.geometry.clone();
  resultGeometry.computeVertexNormals();
  
  return extractGeometryData(resultGeometry);
}

// Process batch CSG subtraction
function processBatchSubtraction(
  supports: CSGWorkerInput['data']['supports'],
  cutterData: CSGWorkerInput['data']['cutter'],
  progressCallback: (current: number, total: number, supportId: string) => void
): CSGWorkerOutput['batchData'] {
  if (!supports || !cutterData) {
    console.error('[CSGWorker] Invalid input: supports or cutterData is null');
    return [];
  }
  
  // Create evaluator once and reuse for all operations
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  
  // Create cutter geometry once (reuse for all supports)
  const cutterGeometry = createGeometryFromArrays(
    cutterData.positions,
    cutterData.normals,
    cutterData.indices
  );
  
  const cutterBrush = new Brush(cutterGeometry);
  cutterBrush.updateMatrixWorld();
  // IMPORTANT: Prepare BVH and half-edge structures upfront for the cutter
  // This builds the MeshBVH once for reuse across all support subtractions
  cutterBrush.prepareGeometry(BVH_OPTIONS);
  
  const results: CSGWorkerOutput['batchData'] = [];
  
  for (let i = 0; i < supports.length; i++) {
    const support = supports[i];
    progressCallback(i + 1, supports.length, support.id);
    
    try {
      // Create support geometry
      const supportGeometry = createGeometryFromArrays(
        support.positions,
        support.normals,
        support.indices
      );
      
      const supportBrush = new Brush(supportGeometry);
      supportBrush.updateMatrixWorld();
      // Prepare BVH for each support
      supportBrush.prepareGeometry(BVH_OPTIONS);
      
      // Perform CSG subtraction
      const resultBrush = evaluator.evaluate(supportBrush, cutterBrush, SUBTRACTION);
      
      if (resultBrush && resultBrush.geometry) {
        const resultGeometry = resultBrush.geometry;
        
        // Check if result geometry has valid data
        const posAttr = resultGeometry.getAttribute('position');
        if (!posAttr || posAttr.count === 0) {
          results.push({
            supportId: support.id,
            success: false,
            error: 'CSG result has no position data'
          });
          supportGeometry.dispose();
          continue;
        }
        
        // Only compute normals if they don't exist or are invalid
        if (!resultGeometry.getAttribute('normal') || 
            resultGeometry.getAttribute('normal').count !== posAttr.count) {
          resultGeometry.computeVertexNormals();
        }
        
        const data = extractGeometryData(resultGeometry);
        
        // Verify extracted data
        if (data.positions.length === 0) {
          results.push({
            supportId: support.id,
            success: false,
            error: 'Extracted positions array is empty'
          });
          supportGeometry.dispose();
          continue;
        }
        
        results.push({
          supportId: support.id,
          success: true,
          ...data
        });
        
        // Dispose support geometry to free memory
        supportGeometry.dispose();
      } else {
        results.push({
          supportId: support.id,
          success: false,
          error: `CSG operation returned ${resultBrush ? 'brush without geometry' : 'null'}`
        });
      }
    } catch (error) {
      results.push({
        supportId: support.id,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // Clean up
  cutterGeometry.dispose();
  
  return results;
}

// Process batch geometry merge (combine multiple geometries into one by merging buffers)
// This is much faster than CSG union and achieves the same visual result
function processBatchMerge(
  geometries: Array<{
    id: string;
    positions: Float32Array;
    normals?: Float32Array;
    indices?: Uint32Array;
  }>,
  progressCallback: (current: number, total: number, stage: string) => void
): CSGWorkerOutput['data'] | null {
  console.log('[processBatchMerge] Starting merge of', geometries.length, 'geometries');
  
  if (!geometries || geometries.length === 0) {
    console.error('[CSGWorker] No geometries provided for merge');
    return null;
  }
  
  // Instead of CSG union (which is very slow), we'll merge geometries by combining their buffers
  // This is much faster and achieves the same visual result for fixture export
  
  progressCallback(1, geometries.length, `Analyzing geometries...`);
  
  // Calculate total sizes needed
  let totalPositions = 0;
  let totalNormals = 0;
  let totalIndices = 0;
  
  for (const geom of geometries) {
    console.log(`[processBatchMerge] Geometry ${geom.id}: positions=${geom.positions.length}, normals=${geom.normals?.length || 0}, indices=${geom.indices?.length || 0}`);
    totalPositions += geom.positions.length;
    totalNormals += (geom.normals?.length || 0);
    totalIndices += (geom.indices?.length || geom.positions.length / 3);
  }
  
  console.log(`[processBatchMerge] Total sizes: positions=${totalPositions}, normals=${totalNormals}, indices=${totalIndices}`);
  
  // Allocate output arrays
  const mergedPositions = new Float32Array(totalPositions);
  const mergedNormals = new Float32Array(totalPositions); // Same size as positions
  const mergedIndices = new Uint32Array(totalIndices);
  
  let posOffset = 0;
  let normOffset = 0;
  let indexOffset = 0;
  let vertexOffset = 0;
  
  for (let i = 0; i < geometries.length; i++) {
    const geom = geometries[i];
    progressCallback(i + 1, geometries.length, `Merging geometry ${i + 1}/${geometries.length}`);
    
    console.log(`[processBatchMerge] Merging ${geom.id} at posOffset=${posOffset}, vertexOffset=${vertexOffset}`);
    
    // Copy positions
    mergedPositions.set(geom.positions, posOffset);
    
    // Copy or generate normals
    if (geom.normals && geom.normals.length > 0) {
      mergedNormals.set(geom.normals, normOffset);
    } else {
      // Generate flat normals if not provided
      const vertCount = geom.positions.length / 3;
      for (let v = 0; v < vertCount; v++) {
        mergedNormals[normOffset + v * 3] = 0;
        mergedNormals[normOffset + v * 3 + 1] = 1;
        mergedNormals[normOffset + v * 3 + 2] = 0;
      }
    }
    
    // Copy indices (offset by current vertex count)
    const vertCount = geom.positions.length / 3;
    if (geom.indices && geom.indices.length > 0) {
      for (let j = 0; j < geom.indices.length; j++) {
        mergedIndices[indexOffset + j] = geom.indices[j] + vertexOffset;
      }
      indexOffset += geom.indices.length;
    } else {
      // Generate sequential indices for non-indexed geometry
      for (let j = 0; j < vertCount; j++) {
        mergedIndices[indexOffset + j] = vertexOffset + j;
      }
      indexOffset += vertCount;
    }
    
    posOffset += geom.positions.length;
    normOffset += geom.positions.length; // Normals same size as positions
    vertexOffset += vertCount;
  }
  
  return {
    positions: mergedPositions,
    normals: mergedNormals,
    indices: new Uint32Array(mergedIndices.buffer, 0, indexOffset), // Trim to actual size
    vertexCount: totalPositions / 3,
    triangleCount: indexOffset / 3
  };
}

// Process batch CSG union using three-bvh-csg ADDITION operation
// This creates proper manifold geometry by computing actual boolean unions
function processBatchCSGUnion(
  geometries: Array<{
    id: string;
    positions: Float32Array;
    normals?: Float32Array;
    indices?: Uint32Array;
  }>,
  progressCallback: (current: number, total: number, stage: string) => void
): CSGWorkerOutput['data'] | null {
  console.log('[processBatchCSGUnion] Starting CSG union of', geometries.length, 'geometries');
  
  if (!geometries || geometries.length === 0) {
    console.error('[CSGWorker] No geometries provided for CSG union');
    return null;
  }
  
  if (geometries.length === 1) {
    // Single geometry - just return it
    const geom = geometries[0];
    return {
      positions: new Float32Array(geom.positions),
      normals: new Float32Array(geom.normals || geom.positions.length),
      indices: new Uint32Array(geom.indices || Array.from({ length: geom.positions.length / 3 }, (_, i) => i)),
      vertexCount: geom.positions.length / 3,
      triangleCount: (geom.indices?.length || geom.positions.length / 3) / 3
    };
  }
  
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  
  progressCallback(1, geometries.length, 'Preparing first geometry...');
  
  // Start with the first geometry as the accumulated result
  let accumulatedGeometry = createGeometryFromArrays(
    geometries[0].positions,
    geometries[0].normals,
    geometries[0].indices
  );
  
  let accumulatedBrush = new Brush(accumulatedGeometry);
  accumulatedBrush.updateMatrixWorld();
  accumulatedBrush.prepareGeometry(BVH_OPTIONS);
  
  // Progressively union each geometry with the accumulated result
  for (let i = 1; i < geometries.length; i++) {
    const geom = geometries[i];
    progressCallback(i + 1, geometries.length, `CSG union ${i + 1}/${geometries.length}: ${geom.id}`);
    
    console.log(`[processBatchCSGUnion] Unioning geometry ${i + 1}/${geometries.length}: ${geom.id}`);
    
    try {
      // Create brush for this geometry
      const nextGeometry = createGeometryFromArrays(
        geom.positions,
        geom.normals,
        geom.indices
      );
      
      const nextBrush = new Brush(nextGeometry);
      nextBrush.updateMatrixWorld();
      nextBrush.prepareGeometry(BVH_OPTIONS);
      
      // Perform CSG union (ADDITION)
      const resultBrush = evaluator.evaluate(accumulatedBrush, nextBrush, ADDITION);
      
      if (resultBrush && resultBrush.geometry) {
        // CSG results are non-indexed, which causes exponential growth in vertex count
        // Use mergeVertices to consolidate duplicate vertices and create indexed geometry
        // This dramatically reduces vertex count and improves BVH performance
        const mergedGeometry = mergeVertices(resultBrush.geometry, 0.001);
        
        // Log result geometry info
        const pos = mergedGeometry.getAttribute('position');
        const idx = mergedGeometry.index;
        console.log(`[processBatchCSGUnion] Result ${i + 1}: ${pos?.count || 0} vertices, ${idx ? idx.count / 3 : 'no index'} triangles`);
        
        // Dispose old accumulated brush and result brush
        accumulatedBrush.geometry.dispose();
        resultBrush.geometry.dispose();
        
        // Create new brush from merged geometry for next iteration
        accumulatedBrush = new Brush(mergedGeometry);
        accumulatedBrush.updateMatrixWorld();
        // Prepare geometry for the next CSG operation
        accumulatedBrush.prepareGeometry(BVH_OPTIONS);
      } else {
        console.warn(`[processBatchCSGUnion] CSG union failed for geometry ${geom.id}, skipping`);
      }
      
      // Cleanup this iteration's geometry
      nextGeometry.dispose();
      
    } catch (error) {
      console.warn(`[processBatchCSGUnion] Error unioning geometry ${geom.id}:`, error);
      // Continue with what we have
    }
  }
  
  progressCallback(geometries.length, geometries.length, 'Finalizing geometry...');
  
  // Extract final result
  const finalGeometry = accumulatedBrush.geometry.clone();
  
  // Debug: log final geometry state before extracting
  const finalPos = finalGeometry.getAttribute('position');
  const finalIdx = finalGeometry.index;
  console.log(`[processBatchCSGUnion] Final geometry: ${finalPos?.count || 0} vertices, index: ${finalIdx ? finalIdx.count : 'null'}`);
  
  finalGeometry.computeVertexNormals();
  
  const result = extractGeometryData(finalGeometry);
  
  // Cleanup
  accumulatedBrush.geometry.dispose();
  finalGeometry.dispose();
  
  console.log(`[processBatchCSGUnion] Complete: ${result.vertexCount} vertices, ${result.triangleCount} triangles`);
  
  return result;
}

// Worker message handler
self.onmessage = (e: MessageEvent<CSGWorkerInput>) => {
  const { type, id, data } = e.data;
  
  if (type === 'subtract-single') {
    try {
      const result = processSingleSubtraction(data.supportGeometry, data.cutterGeometry);
      
      if (result) {
        const transferables: Transferable[] = [
          result.positions.buffer as ArrayBuffer,
          result.normals.buffer as ArrayBuffer,
          result.indices.buffer as ArrayBuffer
        ];
        
        (self as unknown as Worker).postMessage(
          {
            type: 'subtraction-result',
            id,
            data: {
              ...result,
              supportId: data.supportId
            }
          } as CSGWorkerOutput,
          transferables
        );
      } else {
        (self as unknown as Worker).postMessage({
          type: 'error',
          id,
          error: 'CSG subtraction returned no result'
        } as CSGWorkerOutput);
      }
    } catch (error) {
      (self as unknown as Worker).postMessage({
        type: 'error',
        id,
        error: error instanceof Error ? error.message : String(error)
      } as CSGWorkerOutput);
    }
  } else if (type === 'subtract-batch') {
    try {
      const progressCallback = (current: number, total: number, supportId: string) => {
        (self as unknown as Worker).postMessage({
          type: 'progress',
          id,
          progress: {
            current,
            total,
            stage: `Processing support ${current}/${total}`,
            supportId
          }
        } as CSGWorkerOutput);
      };
      
      const results = processBatchSubtraction(data.supports, data.cutter, progressCallback);
      
      // Collect all transferable buffers
      const transferables: Transferable[] = [];
      results.forEach(r => {
        if (r.positions) transferables.push(r.positions.buffer as ArrayBuffer);
        if (r.normals) transferables.push(r.normals.buffer as ArrayBuffer);
        if (r.indices) transferables.push(r.indices.buffer as ArrayBuffer);
      });
      
      (self as unknown as Worker).postMessage(
        {
          type: 'batch-result',
          id,
          batchData: results
        } as CSGWorkerOutput,
        transferables
      );
    } catch (error) {
      (self as unknown as Worker).postMessage({
        type: 'error',
        id,
        error: error instanceof Error ? error.message : String(error)
      } as CSGWorkerOutput);
    }
  } else if (type === 'union-batch') {
    console.log('[CSGWorker] Received union-batch request');
    try {
      const progressCallback = (current: number, total: number, stage: string) => {
        (self as unknown as Worker).postMessage({
          type: 'progress',
          id,
          progress: {
            current,
            total,
            stage
          }
        } as CSGWorkerOutput);
      };
      
      // Extract geometries from supports array
      const geometries = data.supports?.map(s => {
        console.log(`[CSGWorker] Processing geometry ${s.id}:`, {
          positionsLength: s.positions?.length || 0,
          normalsLength: s.normals?.length || 0,
          indicesLength: s.indices?.length || 0
        });
        return {
          id: s.id,
          positions: s.positions,
          normals: s.normals,
          indices: s.indices
        };
      }) || [];
      
      console.log(`[CSGWorker] Total geometries to merge: ${geometries.length}`);
      
      // Add baseplate/cutter if provided (it will be the first geometry to merge)
      if (data.cutter) {
        console.log('[CSGWorker] Adding baseplate geometry');
        geometries.unshift({
          id: 'baseplate',
          positions: data.cutter.positions,
          normals: data.cutter.normals,
          indices: data.cutter.indices
        });
      }
      
      console.log(`[CSGWorker] Final geometries count (with baseplate): ${geometries.length}`);
      
      const result = processBatchMerge(geometries, progressCallback);
      
      console.log('[CSGWorker] Merge result:', result ? {
        positionsLength: result.positions?.length || 0,
        normalsLength: result.normals?.length || 0,
        indicesLength: result.indices?.length || 0,
        vertexCount: result.vertexCount,
        triangleCount: result.triangleCount
      } : 'null');
      
      if (result) {
        const transferables: Transferable[] = [
          result.positions.buffer as ArrayBuffer,
          result.normals.buffer as ArrayBuffer,
          result.indices.buffer as ArrayBuffer
        ];
        
        (self as unknown as Worker).postMessage(
          {
            type: 'union-result',
            id,
            data: result
          } as CSGWorkerOutput,
          transferables
        );
      } else {
        (self as unknown as Worker).postMessage({
          type: 'error',
          id,
          error: 'CSG union returned no result'
        } as CSGWorkerOutput);
      }
    } catch (error) {
      (self as unknown as Worker).postMessage({
        type: 'error',
        id,
        error: error instanceof Error ? error.message : String(error)
      } as CSGWorkerOutput);
    }
  } else if (type === 'csg-union-batch') {
    // NEW: Proper CSG union using three-bvh-csg ADDITION operation
    console.log('[CSGWorker] Received csg-union-batch request (real CSG union)');
    try {
      const progressCallback = (current: number, total: number, stage: string) => {
        (self as unknown as Worker).postMessage({
          type: 'progress',
          id,
          progress: {
            current,
            total,
            stage
          }
        } as CSGWorkerOutput);
      };
      
      // Extract geometries from supports array
      const geometries = data.supports?.map(s => ({
        id: s.id,
        positions: s.positions,
        normals: s.normals,
        indices: s.indices
      })) || [];
      
      // Add baseplate if provided (it will be the first geometry to union)
      if (data.cutter) {
        geometries.unshift({
          id: 'baseplate',
          positions: data.cutter.positions,
          normals: data.cutter.normals,
          indices: data.cutter.indices
        });
      }
      
      console.log(`[CSGWorker] Running CSG union on ${geometries.length} geometries`);
      
      const result = processBatchCSGUnion(geometries, progressCallback);
      
      if (result) {
        const transferables: Transferable[] = [
          result.positions.buffer as ArrayBuffer,
          result.normals.buffer as ArrayBuffer,
          result.indices.buffer as ArrayBuffer
        ];
        
        (self as unknown as Worker).postMessage(
          {
            type: 'union-result',
            id,
            data: result
          } as CSGWorkerOutput,
          transferables
        );
      } else {
        (self as unknown as Worker).postMessage({
          type: 'error',
          id,
          error: 'CSG union returned no result'
        } as CSGWorkerOutput);
      }
    } catch (error) {
      (self as unknown as Worker).postMessage({
        type: 'error',
        id,
        error: error instanceof Error ? error.message : String(error)
      } as CSGWorkerOutput);
    }
  }
};

export {};
