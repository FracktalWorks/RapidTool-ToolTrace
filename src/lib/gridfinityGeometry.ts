/**
 * Gridfinity interlocking-foot geometry.
 *
 * Builds the stair-step foot that plugs a bin into a Gridfinity baseplate, by
 * lofting a rounded-square cross-section through the FOOT_PROFILE rings, then
 * tiling one foot per 42 mm grid cell. The foot's full-footprint top sits at
 * z = 0 (meeting the bin base plate) and tapers DOWN to z = −FOOT_HEIGHT, so the
 * feet hang beneath the bin and seat into the baseplate sockets below.
 */
import * as THREE from 'three';
import { GRID_UNIT, CLEARANCE, CORNER_RADIUS, FOOT_PROFILE, FOOT_HEIGHT, LIP_HEIGHT } from './gridfinitySpec';

const SEG_PER_CORNER = 6;
/** How far each foot's top is pushed UP into the base plate so the two solids
 *  fuse (no coincident face → watertight for slicing). */
const FOOT_OVERLAP = 0.4;

/** Ordered CCW points of a rounded square (half-size `half`, corner radius `r`). */
function roundedSquareLoop(half: number, r: number): THREE.Vector2[] {
  r = Math.max(0.4, Math.min(r, half - 0.1));
  const pts: THREE.Vector2[] = [];
  const corners: ReadonlyArray<readonly [number, number, number]> = [
    [half - r, half - r, 0], // top-right
    [-half + r, half - r, Math.PI / 2], // top-left
    [-half + r, -half + r, Math.PI], // bottom-left
    [half - r, -half + r, (3 * Math.PI) / 2], // bottom-right
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= SEG_PER_CORNER; i++) {
      const a = a0 + (i / SEG_PER_CORNER) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  }
  return pts;
}

/** Append one closed foot solid centred at (ox, oy) to the pos/idx buffers. */
function appendFoot(pos: number[], idx: number[], ox: number, oy: number, footHalf: number): void {
  // Rings bottom→top; bake the −FOOT_HEIGHT offset so the full top is at z=0.
  const rings = FOOT_PROFILE.map((p) =>
    roundedSquareLoop(footHalf - p.inset, CORNER_RADIUS - p.inset).map((v) => ({
      x: v.x + ox,
      y: v.y + oy,
      z: p.z - FOOT_HEIGHT,
    })),
  );
  // Extra ring: extend the full-footprint top straight up into the base plate.
  const top = FOOT_PROFILE[FOOT_PROFILE.length - 1];
  rings.push(
    roundedSquareLoop(footHalf - top.inset, CORNER_RADIUS - top.inset).map((v) => ({
      x: v.x + ox,
      y: v.y + oy,
      z: FOOT_OVERLAP,
    })),
  );
  const N = rings[0].length;
  const base = pos.length / 3;
  for (const ring of rings) for (const v of ring) pos.push(v.x, v.y, v.z);

  // Side walls between consecutive rings.
  for (let k = 0; k < rings.length - 1; k++) {
    const a = base + k * N;
    const b = base + (k + 1) * N;
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      idx.push(a + i, a + i2, b + i2);
      idx.push(a + i, b + i2, b + i);
    }
  }
  // Bottom cap (ring 0, smallest) facing −z.
  const cBot = pos.length / 3;
  pos.push(ox, oy, -FOOT_HEIGHT);
  for (let i = 0; i < N; i++) { const i2 = (i + 1) % N; idx.push(cBot, base + i2, base + i); }
  // Top cap (last ring, raised into the base) facing +z.
  const last = base + (rings.length - 1) * N;
  const cTop = pos.length / 3;
  pos.push(ox, oy, FOOT_OVERLAP);
  for (let i = 0; i < N; i++) { const i2 = (i + 1) % N; idx.push(cTop, last + i, last + i2); }
}

/**
 * Build the full grid of interlocking feet for a unitsX × unitsY bin, centred on
 * the origin in XY, hanging from z=0 down to z=−FOOT_HEIGHT.
 */
export function createGridfinityFeet(unitsX: number, unitsY: number): THREE.BufferGeometry {
  const footHalf = (GRID_UNIT - CLEARANCE) / 2; // 20.75
  const totalW = unitsX * GRID_UNIT;
  const totalH = unitsY * GRID_UNIT;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let c = 0; c < unitsX; c++) {
    for (let r = 0; r < unitsY; r++) {
      const ox = (c + 0.5) * GRID_UNIT - totalW / 2;
      const oy = (r + 0.5) * GRID_UNIT - totalH / 2;
      appendFoot(pos, idx, ox, oy, footHalf);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** How many whole 42 mm units fit in a given mm dimension (min 1). */
export function unitsFor(mm: number): number {
  return Math.max(1, Math.round(mm / GRID_UNIT));
}

/** Ordered rounded-rectangle loop (half-extents halfW/halfH, corner radius r). */
function roundedRectShape(width: number, height: number, r: number, t: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2 + r, -height / 2);
  shape.lineTo(width / 2 - r, -height / 2);
  shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + r);
  shape.lineTo(width / 2, height / 2 - r);
  shape.quadraticCurveTo(width / 2, height / 2, width / 2 - r, height / 2);
  shape.lineTo(-width / 2 + r, height / 2);
  shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - r);
  shape.lineTo(-width / 2, -height / 2 + r);
  shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + r, -height / 2);

  const iW = width / 2 - t, iH = height / 2 - t, iR = Math.max(r - t * 0.5, 0.5);
  const hole = new THREE.Path();
  hole.moveTo(-iW + iR, -iH);
  hole.lineTo(iW - iR, -iH);
  hole.quadraticCurveTo(iW, -iH, iW, -iH + iR);
  hole.lineTo(iW, iH - iR);
  hole.quadraticCurveTo(iW, iH, iW - iR, iH);
  hole.lineTo(-iW + iR, iH);
  hole.quadraticCurveTo(-iW, iH, -iW, iH - iR);
  hole.lineTo(-iW, -iH + iR);
  hole.quadraticCurveTo(-iW, -iH, -iW + iR, -iH);
  shape.holes.push(hole);
  return shape;
}

/**
 * Gridfinity STACKING LIP — a chamfered frame rim sized to the bin footprint,
 * raised LIP_HEIGHT with a bevelled top edge so a bin stacked above nests onto
 * it. Extrudes from z=0 upward; place it at the top of the walls.
 */
export function createGridfinityLip(
  width: number,
  height: number,
  wallThickness: number,
  chamfer: number,
): THREE.ExtrudeGeometry {
  const bevel = Math.min(Math.max(chamfer, 0.8), LIP_HEIGHT * 0.5);
  // INSET the shape by the bevel so the outward-expanding bevel cap lands exactly
  // at the bin footprint — the lip must NOT overhang or it won't fit a baseplate.
  const shape = roundedRectShape(
    width - 2 * bevel,
    height - 2 * bevel,
    Math.max(chamfer - bevel, 0.5),
    wallThickness,
  );
  return new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(LIP_HEIGHT - bevel, 0.6),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
}
