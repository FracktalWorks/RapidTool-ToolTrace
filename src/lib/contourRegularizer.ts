/**
 * Contour Regularizer — Post-process raw CV/SAM contours into CAD-quality vectors.
 *
 * Pipeline:
 *   1. Segment classification (curvature-based split into lines vs arcs)
 *   2. RANSAC line fitting (straight segments → perfect lines)
 *   3. Algebraic circle fitting (curved segments → perfect arcs)
 *   4. Orthogonal snapping (near-90° intersections → exact 90°)
 *   5. Bilateral symmetry enforcement (PCA axis → mirror-average)
 *
 * 100 % pure TypeScript — no OpenCV dependency. Operates on Point2D arrays.
 */

import type { Point2D } from './geometry';

// ============================================================================
// Helpers
// ============================================================================

const dist = (a: Point2D, b: Point2D) => Math.hypot(b.x - a.x, b.y - a.y);

/** Perpendicular distance from point `p` to infinite line through `a`→`b`. */
function perp(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return dist(p, a);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Signed curvature at index `i` using the discrete curvature formula. */
function curvatureAt(pts: Point2D[], i: number, k: number): number {
  const n = pts.length;
  const prev = pts[((i - k) % n + n) % n];
  const curr = pts[i];
  const next = pts[(i + k) % n];

  const dxA = curr.x - prev.x;
  const dyA = curr.y - prev.y;
  const dxB = next.x - curr.x;
  const dyB = next.y - curr.y;

  const cross = dxA * dyB - dyA * dxB;
  const lenA = Math.hypot(dxA, dyA);
  const lenB = Math.hypot(dxB, dyB);
  const denom = lenA * lenB;

  return denom > 1e-9 ? cross / denom : 0;
}

// ============================================================================
// 1. Segment Classification
// ============================================================================

interface Segment {
  startIdx: number;
  endIdx: number;
  points: Point2D[];
  type: 'line' | 'arc';
}

/**
 * Walk the contour and classify runs of points as line-like or arc-like
 * based on curvature magnitude.
 */
function classifySegments(pts: Point2D[], curvatureThreshold: number = 0.015): Segment[] {
  const n = pts.length;
  if (n < 6) return [{ startIdx: 0, endIdx: n - 1, points: [...pts], type: 'line' }];

  // Use a curvature window proportional to the contour resolution
  const k = Math.max(2, Math.min(8, Math.round(n / 40)));
  const curvatures = pts.map((_, i) => Math.abs(curvatureAt(pts, i, k)));

  // Classify each point
  const isLine = curvatures.map(c => c < curvatureThreshold);

  // Group consecutive same-type runs
  const segments: Segment[] = [];
  let runStart = 0;
  let runType: 'line' | 'arc' = isLine[0] ? 'line' : 'arc';

  for (let i = 1; i <= n; i++) {
    const curType: 'line' | 'arc' = (i < n && isLine[i]) ? 'line' : 'arc';
    if (i === n || curType !== runType) {
      // Minimum segment length: merge tiny segments into neighbors
      const segPts = pts.slice(runStart, i);
      if (segPts.length >= 3) {
        segments.push({
          startIdx: runStart,
          endIdx: i - 1,
          points: segPts,
          type: runType,
        });
      } else if (segments.length > 0) {
        // Merge short segment into previous
        segments[segments.length - 1].endIdx = i - 1;
        segments[segments.length - 1].points.push(...segPts);
      }
      if (i < n) {
        runStart = i;
        runType = curType;
      }
    }
  }

  return segments;
}

// ============================================================================
// 2. RANSAC Line Fitting
// ============================================================================

interface FittedLine {
  start: Point2D;
  end: Point2D;
  inlierRatio: number;
}

/**
 * Fit a line to a set of points using RANSAC.
 * Returns the best-fit line endpoints clamped to the segment's extent.
 */
function ransacLineFit(pts: Point2D[], threshold: number = 2.0, iterations: number = 50): FittedLine | null {
  if (pts.length < 2) return null;

  let bestInliers = 0;
  let bestA: Point2D = pts[0];
  let bestB: Point2D = pts[pts.length - 1];

  for (let iter = 0; iter < iterations; iter++) {
    // Pick two random points
    const i1 = Math.floor(Math.random() * pts.length);
    let i2 = Math.floor(Math.random() * pts.length);
    if (i2 === i1) i2 = (i1 + 1) % pts.length;

    const a = pts[i1];
    const b = pts[i2];
    if (dist(a, b) < 1) continue;

    let inliers = 0;
    for (const p of pts) {
      if (perp(p, a, b) <= threshold) inliers++;
    }

    if (inliers > bestInliers) {
      bestInliers = inliers;
      bestA = a;
      bestB = b;
    }
  }

  const inlierRatio = bestInliers / pts.length;
  if (inlierRatio < 0.6) return null;

  // Project all points onto the fitted line and find the extents
  const dx = bestB.x - bestA.x;
  const dy = bestB.y - bestA.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1) return null;

  let tMin = Infinity, tMax = -Infinity;
  for (const p of pts) {
    const t = ((p.x - bestA.x) * dx + (p.y - bestA.y) * dy) / lenSq;
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }

  return {
    start: { x: bestA.x + tMin * dx, y: bestA.y + tMin * dy },
    end: { x: bestA.x + tMax * dx, y: bestA.y + tMax * dy },
    inlierRatio,
  };
}

// ============================================================================
// 3. Algebraic Circle/Arc Fitting
// ============================================================================

interface FittedArc {
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  points: Point2D[];
}

/**
 * Fit a circle to a set of points using the algebraic least-squares method
 * (Kåsa circle fit). Then sample the arc uniformly.
 */
function fitArc(pts: Point2D[], maxResidual: number = 5.0): FittedArc | null {
  const n = pts.length;
  if (n < 4) return null;

  // Kåsa method: minimize algebraic distance
  let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
  let sumX3 = 0, sumY3 = 0, sumX2Y = 0, sumXY2 = 0;
  for (const p of pts) {
    sumX += p.x; sumY += p.y;
    sumX2 += p.x * p.x; sumY2 += p.y * p.y;
    sumXY += p.x * p.y;
    sumX3 += p.x * p.x * p.x; sumY3 += p.y * p.y * p.y;
    sumX2Y += p.x * p.x * p.y; sumXY2 += p.x * p.y * p.y;
  }

  const A = n * sumX2 - sumX * sumX;
  const B = n * sumXY - sumX * sumY;
  const C = n * sumY2 - sumY * sumY;
  const D = 0.5 * (n * sumX3 + n * sumXY2 - sumX * sumX2 - sumX * sumY2);
  const E = 0.5 * (n * sumX2Y + n * sumY3 - sumY * sumX2 - sumY * sumY2);

  const denom = A * C - B * B;
  if (Math.abs(denom) < 1e-9) return null;

  const cx = (D * C - B * E) / denom;
  const cy = (A * E - B * D) / denom;
  const r = Math.sqrt((sumX2 - 2 * cx * sumX + n * cx * cx + sumY2 - 2 * cy * sumY + n * cy * cy) / n);

  if (r < 2 || r > 10000) return null;

  // Check residuals
  let maxR = 0;
  for (const p of pts) {
    const d = Math.abs(Math.hypot(p.x - cx, p.y - cy) - r);
    if (d > maxR) maxR = d;
  }
  if (maxR > maxResidual) return null;

  // Compute angular extent
  const angles = pts.map(p => Math.atan2(p.y - cy, p.x - cx));
  const startAngle = angles[0];
  const endAngle = angles[angles.length - 1];

  // Sample the arc uniformly
  const arcLen = Math.abs(endAngle - startAngle);
  const numSamples = Math.max(8, Math.round(arcLen * r / 3));
  const arcPoints: Point2D[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const angle = startAngle + t * (endAngle - startAngle);
    arcPoints.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }

  return { cx, cy, r, startAngle, endAngle, points: arcPoints };
}

// ============================================================================
// 4. Orthogonal Snapping
// ============================================================================

/**
 * If two consecutive line segments meet at approximately 90° (within tolerance),
 * snap them to exactly 90°.
 */
function snapOrthogonal(segments: Point2D[][], angleTolerance: number = 5): Point2D[][] {
  if (segments.length < 2) return segments;
  const result = segments.map(s => [...s]);
  const tolRad = (angleTolerance * Math.PI) / 180;

  for (let i = 0; i < result.length - 1; i++) {
    const segA = result[i];
    const segB = result[i + 1];
    if (segA.length < 2 || segB.length < 2) continue;

    const a1 = segA[segA.length - 2];
    const junction = segA[segA.length - 1];
    const b1 = segB[1] || segB[0];

    const dxA = junction.x - a1.x;
    const dyA = junction.y - a1.y;
    const dxB = b1.x - junction.x;
    const dyB = b1.y - junction.y;

    const angleA = Math.atan2(dyA, dxA);
    const angleB = Math.atan2(dyB, dxB);
    let diff = Math.abs(angleB - angleA);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;

    // Check if close to 90° or 270°
    const target90 = Math.PI / 2;
    if (Math.abs(diff - target90) < tolRad || Math.abs(diff - 3 * target90) < tolRad) {
      // Snap: rotate segment B so the angle is exactly 90°
      const lenA = Math.hypot(dxA, dyA);
      if (lenA < 1e-6) continue;

      // Perpendicular direction to A
      const perpX = -dyA / lenA;
      const perpY = dxA / lenA;

      // Project B onto the perpendicular
      const projLen = dxB * perpX + dyB * perpY;
      const sign = projLen >= 0 ? 1 : -1;
      const lenB = Math.hypot(dxB, dyB);

      if (lenB > 1e-6) {
        const newDx = sign * perpX * lenB;
        const newDy = sign * perpY * lenB;
        const newEnd: Point2D = {
          x: junction.x + newDx,
          y: junction.y + newDy,
        };
        // Update the next point in segment B
        if (segB.length >= 2) {
          segB[1] = newEnd;
        }
      }
    }
  }

  return result;
}

// ============================================================================
// 5. Bilateral Symmetry Enforcement
// ============================================================================

/**
 * Find the principal axis of the contour using PCA, then mirror all points
 * across this axis and average with the original to enforce bilateral symmetry.
 * 
 * `strength` controls the blend: 0.0 = no change, 1.0 = full symmetry.
 */
function enforceSymmetry(pts: Point2D[], strength: number = 0.7): Point2D[] {
  if (pts.length < 6) return pts;

  // 1. Compute centroid
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
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

  // 3. Principal angle (axis of maximum variance)
  const angle = 0.5 * Math.atan2(2 * m11, m20 - m02);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  // 4. Rotate to align principal axis with X-axis
  const rotated = pts.map(p => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      x: dx * cosA + dy * sinA,
      y: -dx * sinA + dy * cosA,
    };
  });

  // 5. Mirror across the X-axis (flip Y) and average
  const mirrored = rotated.map((p, i) => ({
    x: p.x,
    y: -p.y,
  }));

  // Find closest mirrored point for each original point
  const blended = rotated.map((p, i) => {
    // Find the closest point in the mirrored set
    let bestDist = Infinity;
    let bestJ = i;
    for (let j = 0; j < mirrored.length; j++) {
      const d = Math.hypot(p.x - mirrored[j].x, p.y - mirrored[j].y);
      if (d < bestDist) { bestDist = d; bestJ = j; }
    }
    const m = mirrored[bestJ];

    return {
      x: p.x * (1 - strength) + ((p.x + m.x) / 2) * strength,
      y: p.y * (1 - strength) + ((p.y + m.y) / 2) * strength,
    };
  });

  // 6. Rotate back
  const cosB = Math.cos(-angle);
  const sinB = Math.sin(-angle);
  return blended.map(p => ({
    x: cx + p.x * cosB + p.y * sinB,
    y: cy - p.x * sinB + p.y * cosB,
  }));
}

// ============================================================================
// Main Export — regularizeContour
// ============================================================================

export interface RegularizeOptions {
  /** Max RANSAC inlier distance (pixels). Default: 2.0 */
  lineThreshold?: number;
  /** Max circle residual (pixels). Default: 5.0 */
  arcResidual?: number;
  /** Curvature threshold for line/arc classification. Default: 0.015 */
  curvatureThreshold?: number;
  /** Orthogonal snap tolerance (degrees). Default: 5 */
  orthoTolerance?: number;
  /** Symmetry strength (0..1). Default: 0.6 */
  symmetryStrength?: number;
  /** Skip regularization for very small contours (< N points). Default: 10 */
  minPoints?: number;
}

/**
 * Regularize a raw contour into a CAD-quality vector.
 *
 * Steps:
 *   1. Classify segments (line vs arc) by curvature
 *   2. Fit perfect lines (RANSAC) and arcs (Kåsa) to each segment
 *   3. Snap near-orthogonal junctions to exactly 90°
 *   4. Enforce bilateral symmetry via PCA-based mirror-averaging
 *
 * Returns a new Point2D[] with clean, geometric contour points.
 */
export function regularizeContour(pts: Point2D[], opts?: RegularizeOptions): Point2D[] {
  const {
    lineThreshold = 2.0,
    arcResidual = 5.0,
    curvatureThreshold = 0.015,
    orthoTolerance = 5,
    symmetryStrength = 0.6,
    minPoints = 10,
  } = opts ?? {};

  if (pts.length < minPoints) return pts;

  // 1. Classify segments
  const segments = classifySegments(pts, curvatureThreshold);

  // 2. Fit geometry to each segment
  const fittedSegments: Point2D[][] = [];

  for (const seg of segments) {
    if (seg.type === 'line') {
      const line = ransacLineFit(seg.points, lineThreshold);
      if (line && line.inlierRatio >= 0.7) {
        // Replace with the perfect line endpoints
        fittedSegments.push([line.start, line.end]);
      } else {
        // Keep original points if line fit fails
        fittedSegments.push(seg.points);
      }
    } else {
      const arc = fitArc(seg.points, arcResidual);
      if (arc) {
        fittedSegments.push(arc.points);
      } else {
        // Keep original points if arc fit fails
        fittedSegments.push(seg.points);
      }
    }
  }

  // 3. Orthogonal snapping on line segments
  const snapped = snapOrthogonal(fittedSegments, orthoTolerance);

  // 4. Flatten all segments back into a single contour
  const flattened: Point2D[] = [];
  for (const seg of snapped) {
    // Avoid duplicate junction points
    if (flattened.length > 0 && seg.length > 0) {
      const last = flattened[flattened.length - 1];
      const first = seg[0];
      if (dist(last, first) < 2) {
        // Skip the duplicate first point
        flattened.push(...seg.slice(1));
        continue;
      }
    }
    flattened.push(...seg);
  }

  // 5. Bilateral symmetry enforcement
  if (symmetryStrength > 0 && flattened.length >= 6) {
    return enforceSymmetry(flattened, symmetryStrength);
  }

  return flattened;
}
