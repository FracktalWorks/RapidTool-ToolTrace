/**
 * Gridfinity dimensional specification.
 *
 * The canonical "magic numbers" of the Gridfinity standard — the values a bin
 * MUST hit to physically seat into a real Gridfinity baseplate and to stack.
 * Sourced from the de-facto reference (Zack Freedman's original + the
 * gridfinity-rebuilt-openscad implementation) and gridfinity.xyz.
 *
 * Refs:
 *   - https://gridfinity.xyz/specification/
 *   - https://github.com/kennetek/gridfinity-rebuilt-openscad  (de-facto numbers)
 *
 * All values in millimetres.
 */

/** Grid pitch — one Gridfinity unit is 42 × 42 mm. */
export const GRID_UNIT = 42.0;

/** Vertical height unit — bin heights are multiples of 7 mm (+ base + lip). */
export const HEIGHT_UNIT = 7.0;

/**
 * Total clearance between adjacent units (0.25 mm per side). A 1×1 bin's outer
 * footprint is therefore GRID_UNIT − CLEARANCE = 41.5 mm so neighbours don't bind.
 */
export const CLEARANCE = 0.5;

/** Outer corner fillet of the base footprint. */
export const CORNER_RADIUS = 4.0;

/**
 * The interlocking foot profile (the stair-step that plugs into a baseplate),
 * measured from the BOTTOM of the foot upward. Each segment is a height plus the
 * horizontal inset of the outer wall at the TOP of that segment relative to the
 * full footprint. 45° chamfers ⇒ horizontal inset == segment height.
 *
 *   bottom 0.8 mm @ 45°  → inset 0.8
 *   middle 1.8 mm straight (vertical)
 *   top    2.15 mm @ 45° → meets the full footprint
 *
 * Total foot height = 4.75 mm.
 */
export const FOOT = {
  bevelBottom: 0.8, // 45°
  straight: 1.8, // vertical
  bevelTop: 2.15, // 45°
} as const;

export const FOOT_HEIGHT = FOOT.bevelBottom + FOOT.straight + FOOT.bevelTop; // 4.75

/**
 * Foot cross-section as loft rings, bottom → top: { z, inset } where `inset` is
 * how far the outer wall is pulled IN from the full footprint at that height.
 * Build the foot by lofting a rounded square (corner radius CORNER_RADIUS − inset)
 * through these rings.
 *
 *   z=0      inset 0.8+2.15 = 2.95  (bottom face, smallest)
 *   z=0.8    inset 2.15             (top of bottom bevel)
 *   z=2.6    inset 2.15             (top of straight wall)
 *   z=4.75   inset 0               (full footprint)
 */
export const FOOT_PROFILE: ReadonlyArray<{ z: number; inset: number }> = [
  { z: 0, inset: FOOT.bevelBottom + FOOT.bevelTop }, // 2.95
  { z: FOOT.bevelBottom, inset: FOOT.bevelTop }, // 0.8 → 2.15
  { z: FOOT.bevelBottom + FOOT.straight, inset: FOOT.bevelTop }, // 2.6 → 2.15
  { z: FOOT_HEIGHT, inset: 0 }, // 4.75 → 0
];

/**
 * Stacking lip at the TOP of the bin — geometrically the foot profile again, so a
 * bin's foot nests into the lip of the bin below. Same heights/insets as FOOT.
 */
export const LIP = FOOT;
export const LIP_HEIGHT = FOOT_HEIGHT;

/** Magnet & screw holes in the underside of each foot. */
export const MAGNET = {
  diameter: 6.5, // gridfinity.xyz lists 6 mm; 6.5 is the common printed fit
  depth: 2.4, // gridfinity.xyz lists 2 mm
} as const;

export const SCREW = {
  diameter: 3.0, // M3
  depth: 6.0,
} as const;

/**
 * Hole centres within a cell: the 4 corners of a 26 mm square centred on the cell
 * (±13 mm), sitting under the foot's straight wall.
 */
export const HOLE_OFFSET = 13.0;

/** Outer footprint (mm) of an n×m bin: full grid minus the inter-unit clearance. */
export function binFootprint(unitsX: number, unitsY: number): { w: number; h: number } {
  return { w: unitsX * GRID_UNIT - CLEARANCE, h: unitsY * GRID_UNIT - CLEARANCE };
}

/** Centres (cell-local, mm) of the 4 holes for a foot at grid cell (col,row). */
export function holeCentres(): ReadonlyArray<{ x: number; y: number }> {
  return [
    { x: -HOLE_OFFSET, y: -HOLE_OFFSET },
    { x: HOLE_OFFSET, y: -HOLE_OFFSET },
    { x: -HOLE_OFFSET, y: HOLE_OFFSET },
    { x: HOLE_OFFSET, y: HOLE_OFFSET },
  ];
}
