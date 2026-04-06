/**
 * Geometry Types & Utilities
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

// SVG path from points using simple straight lines
// Since we physically smooth points via Chaikin, Bezier is not needed and will overshoot straight segments
export const contourToSVGPath = (pts: Point2D[], closed = true): string => {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
  return closed ? d + ' Z' : d;
};

// Polygon offset (for clearance)
export const offsetPolygon = (
  pts: Point2D[],
  offset: number,
  _options?: { joinType?: 'miter' | 'round' | 'square' }
): Point2D[] => {
  if (pts.length < 3 || offset === 0) return [...pts];
  const n = pts.length;
  const result: Point2D[] = [];

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const d1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const d2 = { x: next.x - curr.x, y: next.y - curr.y };
    const len1 = Math.hypot(d1.x, d1.y) || 1;
    const len2 = Math.hypot(d2.x, d2.y) || 1;

    // Normals (perpendicular)
    const n1 = { x: -d1.y / len1, y: d1.x / len1 };
    const n2 = { x: -d2.y / len2, y: d2.x / len2 };

    // Average & normalize
    const nx = n1.x + n2.x, ny = n1.y + n2.y;
    const nlen = Math.hypot(nx, ny) || 1;

    result.push({ x: curr.x + (nx / nlen) * offset, y: curr.y + (ny / nlen) * offset });
  }
  return result;
};

// Chaikin corner-cutting smoothing - genuinely rounds sharp corners
// Each iteration replaces each edge with 2 new points at 25% and 75% positions
const chaikinSmooth = (pts: Point2D[], iterations = 3): Point2D[] => {
  if (pts.length < 3) return [...pts];
  let current = [...pts];

  for (let iter = 0; iter < iterations; iter++) {
    const next: Point2D[] = [];
    const n = current.length;
    for (let i = 0; i < n; i++) {
      const p0 = current[i];
      const p1 = current[(i + 1) % n];
      // Q = 3/4 * P_i + 1/4 * P_{i+1}
      next.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
      // R = 1/4 * P_i + 3/4 * P_{i+1}
      next.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
    }
    current = next;
  }
  return current;
};

// Ramer-Douglas-Peucker algorithm for path simplification
const getPerpendicularDistance = (point: Point2D, lineStart: Point2D, lineEnd: Point2D): number => {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }

  const num = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
  return num / Math.hypot(dx, dy);
};

const rdp = (points: Point2D[], epsilon: number): Point2D[] => {
  if (points.length < 3) return points;

  let maxDist = 0;
  let splitIndex = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const dist = getPerpendicularDistance(points[i], points[0], points[end]);
    if (dist > maxDist) {
      maxDist = dist;
      splitIndex = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, splitIndex + 1), epsilon);
    const right = rdp(points.slice(splitIndex), epsilon);
    return left.slice(0, left.length - 1).concat(right);
  } else {
    return [points[0], points[end]];
  }
};

const simplifyPolygon = (points: Point2D[], epsilon: number): Point2D[] => {
  if (points.length <= 4) return points;

  // Find extreme points to split the closed loop properly
  let maxDist = 0;
  let splitIdx = 0;
  for (let i = 1; i < points.length; i++) {
    const dist = distance(points[0], points[i]);
    if (dist > maxDist) {
      maxDist = dist;
      splitIdx = i;
    }
  }

  const path1 = points.slice(0, splitIdx + 1);
  const path2 = points.slice(splitIdx).concat([points[0]]);

  const sim1 = rdp(path1, epsilon);
  const sim2 = rdp(path2, epsilon);

  sim1.pop();
  sim2.pop();

  return [...sim1, ...sim2];
};

// Smooth contour: Chaikin corner-cutting + RDP simplification
export const smoothContour = (pts: Point2D[], _segments = 8): Point2D[] => {
  if (pts.length < 3) return [...pts];

  // Step 1: Chaikin corner-cutting creates beautifully sweeping, organic curves
  const smoothed = chaikinSmooth(pts, 5);

  // Step 2: Simplify polygon using RDP to heavily remove inline points on straight edges
  // 0.5px epsilon ensures curves stay crisp but perfectly straight lines collapse to 2 points
  return simplifyPolygon(smoothed, 0.5);
};

// Create tool outline from traced points
let counter = 0;
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];

export const createToolOutline = (points: Point2D[], pixelsPerMm?: number): ToolOutline => {
  const area = polygonArea(points);
  return {
    id: `tool-${++counter}-${Date.now()}`,
    points,
    smoothedPoints: smoothContour(points),
    boundingBox: getBoundingBox(points),
    area,
    areaInMm2: pixelsPerMm ? area / (pixelsPerMm * pixelsPerMm) : undefined,
    color: COLORS[counter % COLORS.length],
    name: `Tool ${counter}`,
  };
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
