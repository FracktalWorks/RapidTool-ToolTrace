/**
 * STL Parser Service
 * 
 * Handles parsing of both ASCII and binary STL files into Three.js BufferGeometry.
 * Includes robust detection logic for distinguishing between formats.
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

export interface ParseResult {
  geometry: THREE.BufferGeometry;
  format: 'binary' | 'ascii';
  triangleCount: number;
}

// ============================================================================
// Constants
// ============================================================================

const STL_HEADER_SIZE = 80;
const STL_TRIANGLE_SIZE = 50; // 12 bytes normal + 36 bytes vertices + 2 bytes attribute
const STL_HEADER_PLUS_COUNT = 84; // Header + triangle count field

// ============================================================================
// Format Detection
// ============================================================================

/**
 * Determines if an STL file is binary or ASCII format
 * Binary detection is based on file size matching expected binary format size
 */
function isBinarySTL(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength <= STL_HEADER_PLUS_COUNT) {
    return false; // Too small for binary format
  }
  
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(STL_HEADER_SIZE, true);
  const expectedSize = STL_HEADER_PLUS_COUNT + triangleCount * STL_TRIANGLE_SIZE;
  
  // Binary files have predictable size based on triangle count
  // Allow small tolerance for potential padding
  const sizeTolerance = 100;
  const sizeMatchesBinary = Math.abs(expectedSize - buffer.byteLength) < sizeTolerance;
  
  // Validate triangle count is reasonable
  const hasValidTriangleCount = triangleCount > 0 && triangleCount < 100_000_000;
  
  return sizeMatchesBinary && hasValidTriangleCount;
}

// ============================================================================
// Binary STL Parser
// ============================================================================

/**
 * Parses a binary STL file
 */
function parseBinarySTL(buffer: ArrayBuffer): ParseResult {
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(STL_HEADER_SIZE, true);
  const expectedSize = STL_HEADER_PLUS_COUNT + triangleCount * STL_TRIANGLE_SIZE;
  
  if (expectedSize > buffer.byteLength) {
    throw new Error(`Binary STL data incomplete: expected ${expectedSize} bytes, got ${buffer.byteLength}`);
  }
  
  // Pre-allocate arrays for performance
  const vertexCount = triangleCount * 3;
  const vertices = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  
  let offset = STL_HEADER_PLUS_COUNT;
  let vertexIndex = 0;
  
  for (let i = 0; i < triangleCount; i++) {
    // Read face normal
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);
    offset += 12;
    
    // Read three vertices
    for (let j = 0; j < 3; j++) {
      const vx = view.getFloat32(offset, true);
      const vy = view.getFloat32(offset + 4, true);
      const vz = view.getFloat32(offset + 8, true);
      offset += 12;
      
      const idx = vertexIndex * 3;
      vertices[idx] = vx;
      vertices[idx + 1] = vy;
      vertices[idx + 2] = vz;
      
      normals[idx] = nx;
      normals[idx + 1] = ny;
      normals[idx + 2] = nz;
      
      vertexIndex++;
    }
    
    // Skip attribute byte count
    offset += 2;
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  
  return {
    geometry,
    format: 'binary',
    triangleCount,
  };
}

// ============================================================================
// ASCII STL Parser
// ============================================================================

/**
 * Parses an ASCII STL file
 */
function parseASCIISTL(text: string): ParseResult {
  const vertices: number[] = [];
  const normals: number[] = [];
  
  // Regex patterns for faster parsing
  const normalPattern = /facet\s+normal\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  const vertexPattern = /vertex\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  
  // Parse all normals first
  const normalMatches = [...text.matchAll(normalPattern)];
  const vertexMatches = [...text.matchAll(vertexPattern)];
  
  // Each facet has 1 normal and 3 vertices
  const triangleCount = normalMatches.length;
  
  if (vertexMatches.length !== triangleCount * 3) {
    throw new Error(`ASCII STL parse error: expected ${triangleCount * 3} vertices, found ${vertexMatches.length}`);
  }
  
  for (let i = 0; i < triangleCount; i++) {
    const normal = normalMatches[i];
    const nx = parseFloat(normal[1]) || 0;
    const ny = parseFloat(normal[2]) || 0;
    const nz = parseFloat(normal[3]) || 0;
    
    // Process 3 vertices per triangle
    for (let j = 0; j < 3; j++) {
      const vertex = vertexMatches[i * 3 + j];
      vertices.push(
        parseFloat(vertex[1]) || 0,
        parseFloat(vertex[2]) || 0,
        parseFloat(vertex[3]) || 0
      );
      normals.push(nx, ny, nz);
    }
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  
  return {
    geometry,
    format: 'ascii',
    triangleCount,
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Parses an STL file (auto-detects binary vs ASCII format)
 */
export function parseSTL(buffer: ArrayBuffer): ParseResult {
  if (isBinarySTL(buffer)) {
    return parseBinarySTL(buffer);
  }
  
  const text = new TextDecoder().decode(buffer);
  return parseASCIISTL(text);
}

/**
 * Validates an STL file before parsing
 */
export function validateSTLBuffer(buffer: ArrayBuffer): { valid: boolean; error?: string } {
  if (buffer.byteLength === 0) {
    return { valid: false, error: 'File is empty' };
  }
  
  if (buffer.byteLength < STL_HEADER_PLUS_COUNT) {
    // Could be a very small ASCII file, which is fine
    const text = new TextDecoder().decode(buffer);
    if (!text.toLowerCase().includes('solid')) {
      return { valid: false, error: 'File too small and does not appear to be valid STL' };
    }
  }
  
  return { valid: true };
}
