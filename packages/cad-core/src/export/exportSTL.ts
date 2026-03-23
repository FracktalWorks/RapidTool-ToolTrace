/**
 * STL Export Utilities
 * 
 * Functions for exporting THREE.js meshes to STL format.
 * 
 * @module @rapidtool/cad-core/export
 */

import * as THREE from 'three';
import { STLExporter } from 'three-stdlib';
// Note: API client not accessible from package, using direct fetch with cookies
import type {
  ExportablePart,
  ExportConfig,
  ExportResult,
  STLExportOptions,
  NamingConfig
} from './types';
import { generateExportFilename } from './types';

/**
 * Export a single mesh to STL format
 * 
 * @param mesh - The mesh to export
 * @param options - Export options
 * @returns Binary data or string based on options
 */
export function meshToSTL(
  mesh: THREE.Mesh,
  options: STLExportOptions = { binary: true }
): ArrayBuffer | string {
  const exporter = new STLExporter();

  // Create a temporary scene with just this mesh
  const scene = new THREE.Scene();
  const clonedMesh = mesh.clone();

  // Apply world matrix to get correct positioning
  clonedMesh.updateMatrixWorld(true);
  scene.add(clonedMesh);

  if (options.binary) {
    const result = exporter.parse(scene, { binary: true });
    // Convert DataView to ArrayBuffer - create new ArrayBuffer from the data
    const arrayBuffer = new ArrayBuffer(result.byteLength);
    new Uint8Array(arrayBuffer).set(new Uint8Array(result.buffer, result.byteOffset, result.byteLength));
    return arrayBuffer;
  } else {
    return exporter.parse(scene, { binary: false });
  }
}

/**
 * Trigger browser download for a file
 * 
 * @param data - File data (ArrayBuffer or string)
 * @param filename - Name of the file to download
 * @param mimeType - MIME type of the file
 */
export function downloadFile(
  data: ArrayBuffer | string,
  filename: string,
  mimeType: string = 'application/octet-stream'
): void {
  // Trigger the actual browser download
  let blob: Blob;

  if (data instanceof ArrayBuffer) {
    blob = new Blob([data], { type: mimeType });
  } else {
    blob = new Blob([data], { type: 'text/plain' });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export a single part to STL and trigger download
 * 
 * @param part - The part to export
 * @param config - Export configuration
 * @returns Export result
 */
export function exportPartToSTL(
  part: ExportablePart,
  config: ExportConfig
): ExportResult {
  try {
    const namingConfig: NamingConfig = {
      filename: config.filename,
      sectionNumber: part.sectionIndex,
    };

    const filename = generateExportFilename(namingConfig, 'stl');
    const stlData = meshToSTL(part.mesh, config.options);

    downloadFile(stlData, filename, 'application/sla');

    return {
      success: true,
      filenames: [filename],
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown export error',
    };
  }
}

/**
 * Export multiple parts to STL files
 * 
 * @param parts - Array of parts to export
 * @param config - Export configuration
 * @param onProgress - Optional progress callback
 * @returns Export result
 */
export function exportPartsToSTL(
  parts: ExportablePart[],
  config: ExportConfig,
  onProgress?: (current: number, total: number, filename: string) => void
): ExportResult {
  const filenames: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const namingConfig: NamingConfig = {
      filename: config.filename,
      sectionNumber: config.splitParts ? part.sectionIndex : undefined,
    };

    const filename = generateExportFilename(namingConfig, 'stl');
    onProgress?.(i + 1, parts.length, filename);

    try {
      const stlData = meshToSTL(part.mesh, config.options);
      downloadFile(stlData, filename, 'application/sla');
      filenames.push(filename);
    } catch (error) {
      errors.push(`Failed to export ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: errors.join('\n'),
      filenames,
    };
  }

  return {
    success: true,
    filenames,
  };
}

/**
 * Merge multiple meshes into a single mesh for export
 * 
 * @param meshes - Array of meshes to merge
 * @returns Merged mesh
 */
export function mergeMeshesForExport(meshes: THREE.Mesh[]): THREE.Mesh {
  const geometries: THREE.BufferGeometry[] = [];

  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone();
    mesh.updateMatrixWorld(true);
    geometry.applyMatrix4(mesh.matrixWorld);
    geometries.push(geometry);
  }

  // Merge all geometries
  const mergedGeometry = mergeBufferGeometries(geometries);

  // Cleanup cloned geometries
  for (const geom of geometries) {
    geom.dispose();
  }

  return new THREE.Mesh(
    mergedGeometry,
    new THREE.MeshStandardMaterial({ color: 0x808080 })
  );
}

/**
 * Merge buffer geometries into one
 * 
 * @param geometries - Array of geometries to merge
 * @returns Merged geometry
 */
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const mergedGeometry = new THREE.BufferGeometry();

  let totalVertices = 0;
  let totalIndices = 0;

  // Calculate total counts
  for (const geom of geometries) {
    const posAttr = geom.getAttribute('position');
    totalVertices += posAttr.count;

    if (geom.index) {
      totalIndices += geom.index.count;
    } else {
      totalIndices += posAttr.count;
    }
  }

  // Create merged arrays
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalIndices);

  let vertexOffset = 0;
  let indexOffset = 0;
  let indexVertexOffset = 0;

  for (const geom of geometries) {
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const normalAttr = geom.getAttribute('normal') as THREE.BufferAttribute;

    // Copy positions
    for (let i = 0; i < posAttr.count; i++) {
      positions[(vertexOffset + i) * 3] = posAttr.getX(i);
      positions[(vertexOffset + i) * 3 + 1] = posAttr.getY(i);
      positions[(vertexOffset + i) * 3 + 2] = posAttr.getZ(i);
    }

    // Copy normals
    if (normalAttr) {
      for (let i = 0; i < normalAttr.count; i++) {
        normals[(vertexOffset + i) * 3] = normalAttr.getX(i);
        normals[(vertexOffset + i) * 3 + 1] = normalAttr.getY(i);
        normals[(vertexOffset + i) * 3 + 2] = normalAttr.getZ(i);
      }
    }

    // Copy indices (with offset)
    if (geom.index) {
      for (let i = 0; i < geom.index.count; i++) {
        indices[indexOffset + i] = geom.index.getX(i) + indexVertexOffset;
      }
      indexOffset += geom.index.count;
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        indices[indexOffset + i] = i + indexVertexOffset;
      }
      indexOffset += posAttr.count;
    }

    indexVertexOffset += posAttr.count;
    vertexOffset += posAttr.count;
  }

  mergedGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  mergedGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

  return mergedGeometry;
}
