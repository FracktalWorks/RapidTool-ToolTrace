/**
 * Geometry Types & Utilities
 * High-fidelity implementation for smooth tool tracing and offsets.
 */

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
 * Generates an SVG path using cubic Bezier curves for maximum smoothness
 */
export const contourToSVGPath = (pts: Point2D[], closed = true): string => {
  if (pts.length < 2) return '';

  // If we have enough points, use smooth curve logic
  if (pts.length < 3) {
    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
    return closed ? d + ' Z' : d;
  }

  // Use cubic Beziers for ultra-smooth rendering
  let path = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  const n = pts.length;

  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    // Control points for a smooth Catmull-Rom like curve in Bezier form
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }

  return closed ? path + ' Z' : path;
};

/**
 * Robust polygon offsetting with corner handling
 */
export const offsetPolygon = (
  pts: Point2D[],
  offset: number
): Point2D[] => {
  if (pts.length < 3 || offset === 0) return [...pts];

  // 1. Aggressively simplify raw points to remove noise/jitter
  const sourceEpsilon = Math.max(0.5, Math.abs(offset) * 0.05);
  const simplified = simplifyPath(pts, sourceEpsilon);
  const n = simplified.length;
  const result: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const pPrev = simplified[(i - 1 + n) % n];
    const pCurr = simplified[i];
    const pNext = simplified[(i + 1) % n];

    // Edge vectors
    const v1 = { x: pCurr.x - pPrev.x, y: pCurr.y - pPrev.y };
    const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };

    const mag1 = Math.hypot(v1.x, v1.y) || 1;
    const mag2 = Math.hypot(v2.x, v2.y) || 1;

    // Normal vectors
    const n1 = { x: -v1.y / mag1, y: v1.x / mag1 };
    const n2 = { x: -v2.y / mag2, y: v2.x / mag2 };

    // Calculate cross product to determine angle
    const cross = v1.x * v2.y - v1.y * v2.x;
    const dot = n1.x * n2.x + n1.y * n2.y;

    // Straight line or inside corner depends on the sign of offset vs cross product
    // For simplicity, we interpolate corners, but only for meaningful turns
    if (Math.abs(dot) > 0.99) {
      // Very close to straight, just one point
      result.push({ x: pCurr.x + n1.x * offset, y: pCurr.y + n1.y * offset });
    } else {
      // Rounded corner: use fewer steps for smaller offsets
      const steps = offset > 10 ? 4 : 2;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const nx = n1.x * (1 - t) + n2.x * t;
        const ny = n1.y * (1 - t) + n2.y * t;
        const nMag = Math.hypot(nx, ny) || 1;
        result.push({
          x: pCurr.x + (nx / nMag) * offset,
          y: pCurr.y + (ny / nMag) * offset
        });
      }
    }
  }

  // 2. Final simplification pass for clean CAD look
  // then a buttery smooth Chaikin pass
  const cleanResult = simplifyPath(result, 1.2);
  return chaikinSmoothing(cleanResult, 3, true);
};

// Create tool outline from traced points
let counter = 0;
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];

export const createToolOutline = (points: Point2D[], pixelsPerMm?: number): ToolOutline => {
  const area = polygonArea(points);
  const processed = smoothContour(points, 2.5, 4);


  return {
    id: `tool-${++counter}-${Date.now()}`,
    points,
    smoothedPoints: processed,
    boundingBox: getBoundingBox(processed),
    area,
    areaInMm2: pixelsPerMm ? area / (pixelsPerMm * pixelsPerMm) : undefined,
    color: COLORS[counter % COLORS.length],
    name: `Tool ${counter}`,
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
