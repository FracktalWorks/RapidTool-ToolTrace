/**
 * Fast Quadric Mesh Simplification - WASM Wrapper
 * 
 * Wraps the WASM build of Fast-Quadric-Mesh-Simplification for use with THREE.js geometries.
 * Based on the demo at: https://myminifactory.github.io/Fast-Quadric-Mesh-Simplification/
 * 
 * @see https://github.com/MyMiniFactory/Fast-Quadric-Mesh-Simplification
 */

import * as THREE from 'three';

// Module interface for Emscripten-compiled WASM
interface SimplifyModule {
  ccall: (name: string, returnType: string | null, argTypes: string[], args: any[]) => any;
  FS_createDataFile: (parent: string, name: string, data: Uint8Array, canRead: boolean, canWrite: boolean) => void;
  FS_readFile: (path: string) => Uint8Array;
  FS_unlink: (path: string) => void;
}

let moduleInstance: SimplifyModule | null = null;
let moduleLoading: Promise<SimplifyModule> | null = null;
let lastInputFile: string | undefined = undefined;

/**
 * Safely unlink a file from the virtual filesystem
 */
function safeUnlink(module: SimplifyModule, filename: string): void {
  try {
    module.FS_unlink(filename);
  } catch {
    // File may not exist, ignore
  }
}

/**
 * Clean up all files from the virtual filesystem
 */
function cleanupFiles(module: SimplifyModule): void {
  if (lastInputFile) {
    safeUnlink(module, lastInputFile);
    lastInputFile = undefined;
  }
  // Clean up any common filenames that might be leftover
  safeUnlink(module, 'input.stl');
  safeUnlink(module, 'output.stl');
}

/**
 * Load the WASM module (singleton pattern)
 */
async function loadModule(): Promise<SimplifyModule> {
  if (moduleInstance) return moduleInstance;
  if (moduleLoading) return moduleLoading;

  moduleLoading = new Promise((resolve, reject) => {
    // Create Module object that Emscripten will use
    const Module: any = {
      print: (text: string) => console.log('[Simplify]', text),
      printErr: (text: string) => console.warn('[Simplify]', text),
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) {
          return '/fast-simplify.wasm';
        }
        return path;
      },
      onRuntimeInitialized: () => {
        moduleInstance = Module as SimplifyModule;
        resolve(moduleInstance);
      },
      onAbort: (what: any) => {
        console.error('[Simplify] WASM Aborted:', what);
        moduleInstance = null;
        moduleLoading = null;
        reject(new Error(`WASM Aborted: ${what}`));
      }
    };

    // Expose Module globally for the script
    (window as any).Module = Module;

    // Check if script already loaded
    const existingScript = document.querySelector('script[src="/fast-simplify.js"]');
    if (existingScript) {
      // Script already loaded, module should initialize
      return;
    }

    // Load the JS glue code
    const script = document.createElement('script');
    script.src = '/fast-simplify.js';
    script.onerror = () => {
      moduleLoading = null;
      reject(new Error('Failed to load fast-simplify.js'));
    };
    document.head.appendChild(script);
  });

  return moduleLoading;
}

/**
 * Convert THREE.BufferGeometry to binary STL format
 * Optimized to avoid creating many temporary Vector3 objects
 */
function geometryToSTL(geometry: THREE.BufferGeometry): Uint8Array {
  const positionAttr = geometry.getAttribute('position');
  const indexAttr = geometry.index;
  
  // Calculate triangle count
  const triangleCount = indexAttr 
    ? indexAttr.count / 3 
    : positionAttr.count / 3;
  
  if (triangleCount === 0) {
    throw new Error('Geometry has no triangles');
  }
  
  // Binary STL format:
  // - 80 bytes header
  // - 4 bytes triangle count (uint32)
  // - For each triangle:
  //   - 12 bytes normal (3 x float32)
  //   - 36 bytes vertices (3 vertices x 3 floats x 4 bytes)
  //   - 2 bytes attribute byte count (uint16, usually 0)
  const bufferSize = 80 + 4 + triangleCount * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const dataView = new DataView(buffer);
  
  // Header (80 bytes) - ArrayBuffer is initialized to zeros
  
  // Triangle count
  dataView.setUint32(80, triangleCount, true);
  
  // Get position array for direct access (faster than getAttribute calls)
  const positions = positionAttr.array as Float32Array;
  
  let offset = 84;
  
  // Temporary variables for normal calculation
  let v0x: number, v0y: number, v0z: number;
  let v1x: number, v1y: number, v1z: number;
  let v2x: number, v2y: number, v2z: number;
  let e1x: number, e1y: number, e1z: number;
  let e2x: number, e2y: number, e2z: number;
  let nx: number, ny: number, nz: number;
  let len: number;
  
  for (let i = 0; i < triangleCount; i++) {
    // Get vertex indices
    let i0: number, i1: number, i2: number;
    
    if (indexAttr) {
      const baseIdx = i * 3;
      i0 = indexAttr.getX(baseIdx);
      i1 = indexAttr.getX(baseIdx + 1);
      i2 = indexAttr.getX(baseIdx + 2);
    } else {
      i0 = i * 3;
      i1 = i * 3 + 1;
      i2 = i * 3 + 2;
    }
    
    // Get vertex positions directly from array
    v0x = positions[i0 * 3];
    v0y = positions[i0 * 3 + 1];
    v0z = positions[i0 * 3 + 2];
    
    v1x = positions[i1 * 3];
    v1y = positions[i1 * 3 + 1];
    v1z = positions[i1 * 3 + 2];
    
    v2x = positions[i2 * 3];
    v2y = positions[i2 * 3 + 1];
    v2z = positions[i2 * 3 + 2];
    
    // Compute normal: cross(v1-v0, v2-v0)
    e1x = v1x - v0x;
    e1y = v1y - v0y;
    e1z = v1z - v0z;
    
    e2x = v2x - v0x;
    e2y = v2y - v0y;
    e2z = v2z - v0z;
    
    nx = e1y * e2z - e1z * e2y;
    ny = e1z * e2x - e1x * e2z;
    nz = e1x * e2y - e1y * e2x;
    
    // Normalize
    len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    
    // Write normal
    dataView.setFloat32(offset, nx, true); offset += 4;
    dataView.setFloat32(offset, ny, true); offset += 4;
    dataView.setFloat32(offset, nz, true); offset += 4;
    
    // Write vertex 0
    dataView.setFloat32(offset, v0x, true); offset += 4;
    dataView.setFloat32(offset, v0y, true); offset += 4;
    dataView.setFloat32(offset, v0z, true); offset += 4;
    
    // Write vertex 1
    dataView.setFloat32(offset, v1x, true); offset += 4;
    dataView.setFloat32(offset, v1y, true); offset += 4;
    dataView.setFloat32(offset, v1z, true); offset += 4;
    
    // Write vertex 2
    dataView.setFloat32(offset, v2x, true); offset += 4;
    dataView.setFloat32(offset, v2y, true); offset += 4;
    dataView.setFloat32(offset, v2z, true); offset += 4;
    
    // Attribute byte count (0)
    dataView.setUint16(offset, 0, true); offset += 2;
  }
  
  return new Uint8Array(buffer);
}

/**
 * Parse binary STL to THREE.BufferGeometry
 */
function stlToGeometry(stlData: Uint8Array): THREE.BufferGeometry {
  // Create a copy of the data to avoid issues with the WASM memory being freed
  const dataCopy = new Uint8Array(stlData.length);
  dataCopy.set(stlData);
  
  const dataView = new DataView(dataCopy.buffer);
  
  // Read triangle count from offset 80
  const triangleCount = dataView.getUint32(80, true);
  
  if (triangleCount === 0) {
    throw new Error('STL has no triangles');
  }
  
  // Pre-allocate arrays
  const vertexCount = triangleCount * 3;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  
  let readOffset = 84;
  let writeIdx = 0;
  
  for (let i = 0; i < triangleCount; i++) {
    // Read normal
    const nx = dataView.getFloat32(readOffset, true); readOffset += 4;
    const ny = dataView.getFloat32(readOffset, true); readOffset += 4;
    const nz = dataView.getFloat32(readOffset, true); readOffset += 4;
    
    // Read and write 3 vertices
    for (let v = 0; v < 3; v++) {
      positions[writeIdx] = dataView.getFloat32(readOffset, true); readOffset += 4;
      positions[writeIdx + 1] = dataView.getFloat32(readOffset, true); readOffset += 4;
      positions[writeIdx + 2] = dataView.getFloat32(readOffset, true); readOffset += 4;
      
      normals[writeIdx] = nx;
      normals[writeIdx + 1] = ny;
      normals[writeIdx + 2] = nz;
      
      writeIdx += 3;
    }
    
    // Skip attribute byte count
    readOffset += 2;
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  
  return geometry;
}

export interface SimplifyOptions {
  /** Target reduction ratio (0.0 to 1.0). 0.5 means reduce to 50% of triangles. */
  ratio: number;
  /** Progress callback */
  onProgress?: (stage: string, percent: number, message: string) => void;
}

export interface SimplifyResult {
  success: boolean;
  geometry: THREE.BufferGeometry | null;
  originalTriangles: number;
  finalTriangles: number;
  reductionPercent: number;
  error?: string;
}

/**
 * Simplify a THREE.BufferGeometry using Fast Quadric Mesh Simplification (WASM)
 * 
 * This follows the same approach as the official demo:
 * https://myminifactory.github.io/Fast-Quadric-Mesh-Simplification/
 */
export async function simplifyGeometry(
  geometry: THREE.BufferGeometry,
  options: SimplifyOptions
): Promise<SimplifyResult> {
  const { ratio, onProgress } = options;
  
  const positionAttr = geometry.getAttribute('position');
  const indexAttr = geometry.index;
  const originalTriangles = indexAttr ? indexAttr.count / 3 : positionAttr.count / 3;
  
  // Generate unique filenames to avoid conflicts
  const timestamp = Date.now();
  const inputFile = `input_${timestamp}.stl`;
  const outputFile = `output_${timestamp}.stl`;
  
  let module: SimplifyModule | null = null;
  
  try {
    onProgress?.('loading', 0, 'Loading WASM module...');
    module = await loadModule();
    
    // Clean up any leftover files from previous runs
    cleanupFiles(module);
    
    onProgress?.('converting', 10, 'Converting geometry to STL...');
    
    // Convert geometry to STL binary format
    const stlData = geometryToSTL(geometry);
    
    onProgress?.('writing', 20, 'Writing to virtual filesystem...');
    
    // Write input file to WASM virtual filesystem
    // The demo does: Module.FS_createDataFile(".", filename, data, true, true);
    module.FS_createDataFile('.', inputFile, stlData, true, true);
    lastInputFile = inputFile;
    
    onProgress?.('simplifying', 30, `Simplifying to ${Math.round(ratio * 100)}%...`);
    
    // Call the simplify function exactly like the demo does:
    // Module.ccall("simplify", undefined, ["string", "number", "string"], [filename, percentage, simplify_name]);
    // Note: The demo passes undefined for return type, not 'number'
    module.ccall(
      'simplify',
      null, // Return type is void (null in ccall)
      ['string', 'number', 'string'],
      [inputFile, ratio, outputFile]
    );
    
    onProgress?.('reading', 70, 'Reading simplified mesh...');
    
    // Read the output file from virtual filesystem
    // The demo does: let out_bin = Module.FS_readFile(simplify_name);
    const outputData = module.FS_readFile(outputFile);
    
    if (!outputData || outputData.length === 0) {
      throw new Error('Simplification produced empty output');
    }
    
    onProgress?.('parsing', 85, 'Parsing simplified mesh...');
    
    // Parse STL back to geometry
    const simplifiedGeometry = stlToGeometry(outputData);
    
    // Clean up virtual filesystem immediately after reading
    safeUnlink(module, inputFile);
    safeUnlink(module, outputFile);
    lastInputFile = undefined;
    
    const finalTriangles = simplifiedGeometry.getAttribute('position').count / 3;
    const reductionPercent = ((originalTriangles - finalTriangles) / originalTriangles) * 100;
    
    onProgress?.('complete', 100, 'Simplification complete');
    
    return {
      success: true,
      geometry: simplifiedGeometry,
      originalTriangles,
      finalTriangles,
      reductionPercent
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Simplify] Error:', error);
    
    // Clean up on error
    if (module) {
      safeUnlink(module, inputFile);
      safeUnlink(module, outputFile);
      lastInputFile = undefined;
    }
    
    return {
      success: false,
      geometry: null,
      originalTriangles,
      finalTriangles: 0,
      reductionPercent: 0,
      error: errorMessage
    };
  }
}

/**
 * Check if the WASM module is loaded and ready
 */
export function isModuleReady(): boolean {
  return moduleInstance !== null;
}

/**
 * Preload the WASM module (optional, for faster first simplification)
 */
export async function preloadModule(): Promise<boolean> {
  try {
    await loadModule();
    return true;
  } catch {
    return false;
  }
}
