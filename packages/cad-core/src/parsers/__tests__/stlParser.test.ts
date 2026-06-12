/**
 * STL Parser — Unit Tests
 *
 * Validates binary and ASCII STL parsing with hand-crafted minimal fixtures.
 * Three.js is available as a peer dependency — imported directly.
 */

import { describe, it, expect } from 'vitest';
import { parseSTL, validateSTLBuffer } from '../stlParser';

// ── Binary STL builder ────────────────────────────────────────────────────────

/**
 * Build a minimal valid binary STL buffer containing exactly `triangles` facets.
 *
 * Binary STL layout:
 *   80 bytes  — header (zeroed)
 *    4 bytes  — triangle count (uint32 LE)
 *   per facet:
 *     12 bytes — normal (3× float32 LE)
 *     36 bytes — 3 vertices (3× float32 LE each)
 *      2 bytes — attribute byte count (zeroed)
 */
function makeBinarySTL(triangles: Triangle[]): ArrayBuffer {
  const TRIANGLE_SIZE = 50;
  const totalBytes = 84 + triangles.length * TRIANGLE_SIZE;
  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);

  // Triangle count at offset 80
  view.setUint32(80, triangles.length, true);

  let offset = 84;
  for (const tri of triangles) {
    // Normal
    view.setFloat32(offset,      tri.normal[0], true); offset += 4;
    view.setFloat32(offset,      tri.normal[1], true); offset += 4;
    view.setFloat32(offset,      tri.normal[2], true); offset += 4;
    // Vertex A
    view.setFloat32(offset,      tri.a[0], true); offset += 4;
    view.setFloat32(offset,      tri.a[1], true); offset += 4;
    view.setFloat32(offset,      tri.a[2], true); offset += 4;
    // Vertex B
    view.setFloat32(offset,      tri.b[0], true); offset += 4;
    view.setFloat32(offset,      tri.b[1], true); offset += 4;
    view.setFloat32(offset,      tri.b[2], true); offset += 4;
    // Vertex C
    view.setFloat32(offset,      tri.c[0], true); offset += 4;
    view.setFloat32(offset,      tri.c[1], true); offset += 4;
    view.setFloat32(offset,      tri.c[2], true); offset += 4;
    // Attribute byte count
    view.setUint16(offset, 0, true); offset += 2;
  }

  return buf;
}

interface Triangle {
  normal: [number, number, number];
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
}

/** A minimal single-triangle STL. */
const SINGLE_TRIANGLE: Triangle = {
  normal: [0, 1, 0],
  a: [0, 0, 0],
  b: [1, 0, 0],
  c: [0, 0, 1],
};

// ── ASCII STL builder ─────────────────────────────────────────────────────────

function makeAsciiSTL(triangles: Triangle[]): ArrayBuffer {
  const lines: string[] = ['solid test'];
  for (const tri of triangles) {
    lines.push(
      `  facet normal ${tri.normal[0]} ${tri.normal[1]} ${tri.normal[2]}`,
      '    outer loop',
      `      vertex ${tri.a[0]} ${tri.a[1]} ${tri.a[2]}`,
      `      vertex ${tri.b[0]} ${tri.b[1]} ${tri.b[2]}`,
      `      vertex ${tri.c[0]} ${tri.c[1]} ${tri.c[2]}`,
      '    endloop',
      '  endfacet',
    );
  }
  lines.push('endsolid test');
  return new TextEncoder().encode(lines.join('\n')).buffer as ArrayBuffer;
}

// ── Binary STL tests ──────────────────────────────────────────────────────────

describe('parseSTL — binary', () => {
  it('parses a single-triangle binary STL', () => {
    const buf = makeBinarySTL([SINGLE_TRIANGLE]);
    const result = parseSTL(buf);

    expect(result.format).toBe('binary');
    expect(result.triangleCount).toBe(1);
  });

  it('geometry has 3 vertices per triangle (non-indexed)', () => {
    const buf = makeBinarySTL([SINGLE_TRIANGLE]);
    const { geometry } = parseSTL(buf);

    const pos = geometry.getAttribute('position');
    // 1 triangle × 3 vertices
    expect(pos.count).toBe(3);
  });

  it('vertex positions match the input triangle', () => {
    const buf = makeBinarySTL([SINGLE_TRIANGLE]);
    const { geometry } = parseSTL(buf);

    const pos = geometry.getAttribute('position');
    // Vertex A should be at [0, 0, 0]
    expect(pos.getX(0)).toBeCloseTo(0);
    expect(pos.getY(0)).toBeCloseTo(0);
    expect(pos.getZ(0)).toBeCloseTo(0);
    // Vertex B should be at [1, 0, 0]
    expect(pos.getX(1)).toBeCloseTo(1);
    expect(pos.getY(1)).toBeCloseTo(0);
    expect(pos.getZ(1)).toBeCloseTo(0);
  });

  it('normals are replicated per-vertex from face normal', () => {
    const buf = makeBinarySTL([SINGLE_TRIANGLE]);
    const { geometry } = parseSTL(buf);

    const normals = geometry.getAttribute('normal');
    // All 3 vertices should have the same face normal [0, 1, 0]
    for (let i = 0; i < 3; i++) {
      expect(normals.getX(i)).toBeCloseTo(0);
      expect(normals.getY(i)).toBeCloseTo(1);
      expect(normals.getZ(i)).toBeCloseTo(0);
    }
  });

  it('parses multiple triangles correctly', () => {
    const triangles: Triangle[] = [
      SINGLE_TRIANGLE,
      {
        normal: [1, 0, 0],
        a: [0, 0, 0],
        b: [0, 1, 0],
        c: [0, 0, 1],
      },
    ];
    const buf = makeBinarySTL(triangles);
    const result = parseSTL(buf);

    expect(result.triangleCount).toBe(2);
    expect(result.geometry.getAttribute('position').count).toBe(6);
  });

  it('size-mismatched binary falls back to ASCII parsing (0 triangles, no throw)', () => {
    // isBinarySTL() returns false when file size doesn't match triangle count.
    // The parser then falls through to ASCII — zeroed bytes produce empty geometry.
    const buf = new ArrayBuffer(84);
    const view = new DataView(buf);
    view.setUint32(80, 10, true); // claim 10 triangles but buffer too small

    const result = parseSTL(buf);
    expect(result.format).toBe('ascii');
    expect(result.triangleCount).toBe(0);
  });
});

// ── ASCII STL tests ───────────────────────────────────────────────────────────

describe('parseSTL — ASCII', () => {
  it('parses a single-triangle ASCII STL', () => {
    const buf = makeAsciiSTL([SINGLE_TRIANGLE]);
    const result = parseSTL(buf);

    expect(result.format).toBe('ascii');
    expect(result.triangleCount).toBe(1);
  });

  it('geometry has 3 vertices', () => {
    const buf = makeAsciiSTL([SINGLE_TRIANGLE]);
    const { geometry } = parseSTL(buf);
    expect(geometry.getAttribute('position').count).toBe(3);
  });

  it('vertex positions match input', () => {
    const buf = makeAsciiSTL([SINGLE_TRIANGLE]);
    const { geometry } = parseSTL(buf);
    const pos = geometry.getAttribute('position');

    expect(pos.getX(0)).toBeCloseTo(0);
    expect(pos.getY(0)).toBeCloseTo(0);
    expect(pos.getZ(0)).toBeCloseTo(0);
  });

  it('parses multiple triangles', () => {
    const buf = makeAsciiSTL([SINGLE_TRIANGLE, SINGLE_TRIANGLE]);
    const result = parseSTL(buf);
    expect(result.triangleCount).toBe(2);
  });

  it('handles scientific notation in vertex values', () => {
    const sci: Triangle = {
      normal: [0, 1, 0],
      a: [1.5e-3, 2.0e+1, -3.1e-2],
      b: [1, 0, 0],
      c: [0, 0, 1],
    };
    const buf = makeAsciiSTL([sci]);
    const result = parseSTL(buf);

    expect(result.triangleCount).toBe(1);
    const pos = result.geometry.getAttribute('position');
    expect(pos.getX(0)).toBeCloseTo(0.0015, 5);
    expect(pos.getY(0)).toBeCloseTo(20.0, 5);
  });
});

// ── validateSTLBuffer ─────────────────────────────────────────────────────────

describe('validateSTLBuffer', () => {
  it('rejects an empty buffer', () => {
    const result = validateSTLBuffer(new ArrayBuffer(0));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('accepts a valid binary STL', () => {
    const buf = makeBinarySTL([SINGLE_TRIANGLE]);
    const result = validateSTLBuffer(buf);
    expect(result.valid).toBe(true);
  });

  it('accepts a valid ASCII STL', () => {
    const buf = makeAsciiSTL([SINGLE_TRIANGLE]);
    const result = validateSTLBuffer(buf);
    expect(result.valid).toBe(true);
  });

  it('rejects random bytes without "solid" keyword', () => {
    const buf = new ArrayBuffer(10);
    new Uint8Array(buf).fill(0xff);
    const result = validateSTLBuffer(buf);
    expect(result.valid).toBe(false);
  });
});
