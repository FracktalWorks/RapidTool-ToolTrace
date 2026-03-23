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

// SVG path from points
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

// Smooth contour (Catmull-Rom)
export const smoothContour = (pts: Point2D[], segments = 5): Point2D[] => {
  if (pts.length < 3) return [...pts];
  const result: Point2D[] = [];
  const n = pts.length;

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let t = 0; t < segments; t++) {
      const s = t / segments, s2 = s * s, s3 = s2 * s;
      result.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * s + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * s + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3),
      });
    }
  }
  return result;
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
