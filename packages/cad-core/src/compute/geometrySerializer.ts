/**
 * Geometry Serializer
 *
 * Compact binary serialization for THREE.BufferGeometry → ArrayBuffer and back.
 * Used to persist computed workpiece geometries in ArtifactCache (IndexedDB).
 *
 * Binary layout:
 *   [0..3]  magic        4 bytes  = 0x5254474D ("RTGM")
 *   [4]     version      1 byte   = FORMAT_VERSION
 *   [5]     flags        1 byte   bit0=hasIndex, bit1=hasNormals
 *   [6..7]  padding      2 bytes
 *   [8..11] vertexCount  Uint32LE
 *   [12..15] indexCount  Uint32LE
 *   [16..]  positions    Float32[vertexCount * 3]
 *           normals?     Float32[vertexCount * 3]  (if flags.bit1)
 *           indices?     Uint32[indexCount]        (if flags.bit0)
 *
 * Why THREE.BufferGeometry and not a plain format?
 *   The serialized bytes contain only positions + optional index.
 *   Normals are recomputed on deserialization via computeVertexNormals()
 *   because re-running it is cheap and avoids round-trip precision errors.
 *   If normals are explicitly stored they overwrite the recomputed ones.
 */

import * as THREE from 'three';

const MAGIC = 0x5254474d; // "RTGM" big-endian
const FORMAT_VERSION = 1;

const FLAG_HAS_INDEX = 1 << 0;
const FLAG_HAS_NORMALS = 1 << 1;

const HEADER_BYTES = 16;

// ─── Serialize ────────────────────────────────────────────────────────────────

/**
 * Serialize a `THREE.BufferGeometry` to a compact `ArrayBuffer`.
 * Only the `position` attribute (and optionally `index` and `normal`) are stored.
 * Call `artifactCache.set(key, serializeGeometry(geometry))`.
 *
 * @throws if the geometry has no position attribute
 */
export function serializeGeometry(geometry: THREE.BufferGeometry): ArrayBuffer {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  if (!posAttr) {
    throw new Error('serializeGeometry: geometry has no position attribute');
  }

  const vertexCount = posAttr.count;
  const indexAttr = geometry.index;
  const normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;

  const hasIndex = indexAttr !== null;
  const hasNormals = normalAttr !== undefined && normalAttr !== null;
  const indexCount = hasIndex ? indexAttr!.count : 0;

  let flags = 0;
  if (hasIndex) flags |= FLAG_HAS_INDEX;
  if (hasNormals) flags |= FLAG_HAS_NORMALS;

  const posBytes = vertexCount * 3 * 4;       // Float32 per x,y,z
  const normalBytes = hasNormals ? vertexCount * 3 * 4 : 0;
  const indexBytes = hasIndex ? indexCount * 4 : 0;  // Uint32 per index
  const totalBytes = HEADER_BYTES + posBytes + normalBytes + indexBytes;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  // Header
  view.setUint32(0, MAGIC, false); // big-endian magic
  view.setUint8(4, FORMAT_VERSION);
  view.setUint8(5, flags);
  // bytes 6..7 = padding (zeroed)
  view.setUint32(8, vertexCount, true);
  view.setUint32(12, indexCount, true);

  let offset = HEADER_BYTES;

  // Positions
  const positions = posAttr.array as Float32Array;
  const posView = new Float32Array(buffer, offset, vertexCount * 3);
  posView.set(positions.length === vertexCount * 3 ? positions : positions.subarray(0, vertexCount * 3));
  offset += posBytes;

  // Normals (optional)
  if (hasNormals) {
    const normals = normalAttr!.array as Float32Array;
    const normalView = new Float32Array(buffer, offset, vertexCount * 3);
    normalView.set(normals.length === vertexCount * 3 ? normals : normals.subarray(0, vertexCount * 3));
    offset += normalBytes;
  }

  // Indices (optional)
  if (hasIndex) {
    const indices = indexAttr!.array as Uint16Array | Uint32Array;
    const indexView = new Uint32Array(buffer, offset, indexCount);
    for (let i = 0; i < indexCount; i++) {
      indexView[i] = indices[i];
    }
  }

  return buffer;
}

// ─── Deserialize ─────────────────────────────────────────────────────────────

/**
 * Deserialize an `ArrayBuffer` back to a `THREE.BufferGeometry`.
 * Returns `null` if the buffer is invalid or has an unexpected version.
 */
export function deserializeGeometry(buffer: ArrayBuffer): THREE.BufferGeometry | null {
  if (buffer.byteLength < HEADER_BYTES) return null;

  const view = new DataView(buffer);

  const magic = view.getUint32(0, false);
  if (magic !== MAGIC) {
    console.warn('[geometrySerializer] Invalid magic number — not an RTGM buffer');
    return null;
  }

  const version = view.getUint8(4);
  if (version !== FORMAT_VERSION) {
    console.warn(`[geometrySerializer] Unsupported format version ${version} (expected ${FORMAT_VERSION})`);
    return null;
  }

  const flags = view.getUint8(5);
  const hasIndex = (flags & FLAG_HAS_INDEX) !== 0;
  const hasNormals = (flags & FLAG_HAS_NORMALS) !== 0;

  const vertexCount = view.getUint32(8, true);
  const indexCount = view.getUint32(12, true);

  let offset = HEADER_BYTES;

  const posBytes = vertexCount * 3 * 4;
  const normalBytes = hasNormals ? vertexCount * 3 * 4 : 0;

  const expectedSize =
    HEADER_BYTES + posBytes + normalBytes + (hasIndex ? indexCount * 4 : 0);

  if (buffer.byteLength < expectedSize) {
    console.warn('[geometrySerializer] Buffer too small for declared vertex/index counts');
    return null;
  }

  // Positions
  const positions = new Float32Array(buffer, offset, vertexCount * 3);
  offset += posBytes;

  // Normals
  let normals: Float32Array | null = null;
  if (hasNormals) {
    normals = new Float32Array(buffer, offset, vertexCount * 3);
    offset += normalBytes;
  }

  // Indices
  let indices: Uint32Array | null = null;
  if (hasIndex) {
    indices = new Uint32Array(buffer, offset, indexCount);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));

  if (indices) {
    geometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
  }

  if (normals) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals.slice(), 3));
  } else {
    // Recompute normals — cheap and more accurate than stored float-precision normals
    geometry.computeVertexNormals();
  }

  return geometry;
}
