/**
 * Geometry Types & Utilities
 * High-fidelity implementation for smooth tool tracing and offsets.
 */

import ClipperLib from 'clipper-lib';

// Types
export interface Point2D { x: number; y: number }
export interface PaperCorners { topLeft: Point2D; topRight: Point2D; bottomRight: Point2D; bottomLeft: Point2D }
export interface BoundingBox { minX: number; minY: number; maxX: number; maxY: number }

export interface ToolOutline {
  id: string;
  points: Point2D[];
  smoothedPoints: Point2D[];
  boundingBox: BoundingBox;
  area: number;
  areaInMm2?: number;
  color: string;
  name: string;
  /** 0..1 detection confidence — how tool-like the traced contour is. */
  confidence?: number;
}

// Constants
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

// Basic geometry
export const distance = (a: Point2D, b: Point2D) => Math.hypot(b.x - a.x, b.y - a.y);

export const getBoundingBox = (pts: Point2D[]): BoundingBox => {
  if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
};

export const polygonArea = (pts: Point2D[]): number => {
  if (pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area / 2);
};

// --- Advanced Smoothing & Simplification ---

/**
 * Ramer-Douglas-Peucker algorithm to simplify path and remove noise
 */
export const simplifyPath = (pts: Point2D[], epsilon: number = 0.5): Point2D[] => {
  if (pts.length <= 2) return pts;

  let dmax = 0;
  let index = 0;
  const n = pts.length;

  for (let i = 1; i < n - 1; i++) {
    const d = perpendicularDistance(pts[i], pts[0], pts[n - 1]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const res1 = simplifyPath(pts.slice(0, index + 1), epsilon);
    const res2 = simplifyPath(pts.slice(index), epsilon);
    return res1.slice(0, res1.length - 1).concat(res2);
  } else {
    return [pts[0], pts[n - 1]];
  }
};

const perpendicularDistance = (p: Point2D, p1: Point2D, p2: Point2D) => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (dx === 0 && dy === 0) return distance(p, p1);
  return Math.abs(dy * p.x - dx * p.y + p2.x * p1.y - p2.y * p1.x) / Math.hypot(dx, dy);
};

/**
 * Chaikin's Algorithm for smooth corner cutting
 */
export const chaikinSmoothing = (pts: Point2D[], iterations: number = 3, closed: boolean = true): Point2D[] => {
  if (pts.length < 3) return pts;
  let current = [...pts];

  for (let iter = 0; iter < iterations; iter++) {
    const next: Point2D[] = [];
    const n = current.length;

    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % n];

      next.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        y: p0.y * 0.75 + p1.y * 0.25
      });
      next.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        y: p0.y * 0.25 + p1.y * 0.75
      });
    }
    current = next;
  }
  return current;
};

// Paper scale calculation
export const calculatePixelsPerMm = (corners: PaperCorners): number => {
  const { topLeft, topRight, bottomLeft, bottomRight } = corners;
  const avgW = (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2;
  const avgH = (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2;
  const landscape = avgW > avgH;
  return landscape
    ? (avgW / A4_HEIGHT_MM + avgH / A4_WIDTH_MM) / 2
    : (avgW / A4_WIDTH_MM + avgH / A4_HEIGHT_MM) / 2;
};

/**
 * Generates an SVG path using straight lines for exact geometric accuracy.
 * Points are already dense and smoothed upstream — straight segments prevent
 * Bezier overshoot and wobble on tool contours.
 */
export const contourToSVGPath = (pts: Point2D[], closed = true): string => {
  if (pts.length < 2) return '';

  let path = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    path += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
  }

  return closed ? path + ' Z' : path;
};

/**
 * Robust polygon offsetting via Clipper (Vatti winding-number offset).
 *
 * Produces a TRUE uniform-distance offset (equal gap in every direction)
 * with round joins — the geometrically correct clearance for FDM/laser
 * tool pockets. Falls back to the original polygon if Clipper fails.
 *
 * `offset` is in the same units as the input points (pixels). Positive
 * grows the polygon outward, negative shrinks it.
 */
export const offsetPolygon = (
  pts: Point2D[],
  offset: number
): Point2D[] => {
  if (pts.length < 3 || offset === 0) return [...pts];

  // Clipper works on integers — scale up to preserve sub-pixel precision.
  const SCALE = 1000;

  try {
    // 1. Convert to Clipper integer coordinates.
    let path = pts.map((p) => new ClipperLib.IntPoint(
      Math.round(p.x * SCALE),
      Math.round(p.y * SCALE),
    ));

    // 2. Clean micro self-intersections / noise loops from CV traces.
    //    Without this, ClipperOffset silently flattens or skews the shape.
    path = ClipperLib.Clipper.CleanPolygon(path, 0.1 * SCALE);
    const cleanPaths = ClipperLib.Clipper.SimplifyPolygon(
      path,
      ClipperLib.PolyFillType.pftNonZero,
    );
    if (!cleanPaths || cleanPaths.length === 0) return [...pts];

    // 3. Round-join offset — uniform distance, no spikes.
    const co = new ClipperLib.ClipperOffset();
    for (const p of cleanPaths) {
      co.AddPath(p, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
    }
    const solution = new ClipperLib.Paths();
    co.Execute(solution, offset * SCALE);
    if (!solution || solution.length === 0) return [...pts];

    // 4. Keep the largest resulting boundary (outer ring).
    let outer = solution[0];
    let maxArea = 0;
    for (const p of solution) {
      const a = Math.abs(ClipperLib.Clipper.Area(p));
      if (a > maxArea) { maxArea = a; outer = p; }
    }

    // 5. Back to float pixel coordinates. Points are dense, so contourToSVGPath's
    //    straight-line segments render them as a smooth curve without wobble.
    return outer.map((p: { X: number; Y: number }) => ({
      x: p.X / SCALE,
      y: p.Y / SCALE,
    }));
  } catch (err) {
    console.error('Clipper offset failed, returning original polygon:', err);
    return [...pts];
  }
};

// Create tool outline from traced points
let counter = 0;
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];

export const createToolOutline = (
  points: Point2D[],
  pixelsPerMm?: number,
  confidence?: number
): ToolOutline => {
  const area = polygonArea(points);
  const processed = smoothContour(points, 0.5, 2);

  return {
    id: `tool-${++counter}-${Date.now()}`,
    points,
    smoothedPoints: processed,
    boundingBox: getBoundingBox(processed),
    area,
    areaInMm2: pixelsPerMm ? area / (pixelsPerMm * pixelsPerMm) : undefined,
    color: COLORS[counter % COLORS.length],
    name: `Tool ${counter}`,
    confidence,
  };
};

/**
 * Standard tool contour smoothing: Simplification followed by Chaikin smoothing
 */
export const smoothContour = (pts: Point2D[], epsilon: number = 2.0, iterations: number = 4): Point2D[] => {
  if (pts.length < 3) return pts;
  const simplified = simplifyPath(pts, epsilon);
  return chaikinSmoothing(simplified, iterations, true);
};


export const createPillShape = (bbox: BoundingBox): Point2D[] => {
  const { minX, minY, maxX, maxY } = bbox;
  const width = maxX - minX;
  const height = maxY - minY;

  const isHorizontal = width >= height;
  const radius = isHorizontal ? height / 2 : width / 2;

  if (radius <= 0) return [];

  const points: Point2D[] = [];
  const numSegments = 64; // Increased for smoother curves

  if (isHorizontal) {
    const cx1 = minX + radius;
    const cx2 = maxX - radius;
    const cy = minY + radius;

    // Right semi-circle (from -pi/2 to pi/2)
    for (let i = 0; i <= numSegments; i++) {
      const angle = -Math.PI / 2 + (Math.PI * i) / numSegments;
      points.push({ x: cx2 + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    }
    // Left semi-circle (from pi/2 to 3pi/2)
    for (let i = 0; i <= numSegments; i++) {
      const angle = Math.PI / 2 + (Math.PI * i) / numSegments;
      points.push({ x: cx1 + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    }
  } else {
    const cx = minX + radius;
    const cy1 = minY + radius;
    const cy2 = maxY - radius;

    // Bottom semi-circle (from 0 to pi)
    for (let i = 0; i <= numSegments; i++) {
      const angle = (Math.PI * i) / numSegments;
      points.push({ x: cx + radius * Math.cos(angle), y: cy2 + radius * Math.sin(angle) });
    }
    // Top semi-circle (from pi to 2pi)
    for (let i = 0; i <= numSegments; i++) {
      const angle = Math.PI + (Math.PI * i) / numSegments;
      points.push({ x: cx + radius * Math.cos(angle), y: cy1 + radius * Math.sin(angle) });
    }
  }

  return points;
};

// Create a pill shape optimally oriented to the points' principal axis
export const createOrientedPillShape = (pts: Point2D[]): Point2D[] => {
  if (pts.length < 3) return [...pts];

  // 1. Calculate centroid
  let cx = 0, cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;

  // 2. Compute covariance matrix
  let m20 = 0, m02 = 0, m11 = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    m20 += dx * dx;
    m02 += dy * dy;
    m11 += dx * dy;
  }

  // 3. Find principal angle
  const angle = 0.5 * Math.atan2(2 * m11, m20 - m02);

  // 4. Rotate points to align with axes, centered at (0,0)
  const cosA = Math.cos(-angle);
  const sinA = Math.sin(-angle);
  const rotatedPts = pts.map(p => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      x: dx * cosA - dy * sinA,
      y: dx * sinA + dy * cosA
    };
  });

  // 5. Get bounding box of rotated points
  const bbox = getBoundingBox(rotatedPts);

  // 6. Create unrotated pill shape centered on the rotated bounding box
  const pillPts = createPillShape(bbox);

  // 7. Rotate pill shape back to original orientation and translate to centroid
  const cosB = Math.cos(angle);
  const sinB = Math.sin(angle);
  return pillPts.map(p => ({
    x: cx + (p.x * cosB - p.y * sinB),
    y: cy + (p.x * sinB + p.y * cosB)
  }));
};
