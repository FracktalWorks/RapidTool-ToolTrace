/**
 * Tool Library & Shape Matching Module.
 *
 * This module provides:
 *   1. Dynamic generation of clean, CAD-perfect normalized tool templates.
 *   2. Contour resampling to ensure point-density independence.
 *   3. Log-transformed Hu Moments calculation for rotation/scale-invariant shape matching.
 *   4. PCA-based centroid, scale, and orientation alignment.
 *   5. Chamfer distance evaluation to resolve 180° ambiguity.
 */

import type { Point2D } from './geometry';

// ============================================================================
// Mathematical / Geometric Helpers
// ============================================================================

const dist = (a: Point2D, b: Point2D) => Math.hypot(b.x - a.x, b.y - a.y);

/** Resample a contour to a fixed number of equidistant points. */
export function resampleContour(pts: Point2D[], targetCount: number = 100): Point2D[] {
  if (pts.length < 3) return pts;

  const cumulDist: number[] = [0];
  let totalLen = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    totalLen += d;
    cumulDist.push(totalLen);
  }

  if (totalLen < 1e-6) return pts;

  const step = totalLen / targetCount;
  const resampled: Point2D[] = [];

  let currentIdx = 0;
  for (let i = 0; i < targetCount; i++) {
    const targetDist = i * step;
    while (currentIdx < pts.length && cumulDist[currentIdx + 1] < targetDist) {
      currentIdx++;
    }

    const p1 = pts[currentIdx];
    const p2 = pts[(currentIdx + 1) % pts.length];
    const dSegment = cumulDist[currentIdx + 1] - cumulDist[currentIdx];

    if (dSegment < 1e-6) {
      resampled.push({ ...p1 });
    } else {
      const t = (targetDist - cumulDist[currentIdx]) / dSegment;
      resampled.push({
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
      });
    }
  }

  return resampled;
}

/** Compute centroid of a point array. */
export function getCentroid(pts: Point2D[]): Point2D {
  let cx = 0, cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / pts.length, y: cy / pts.length };
}

/** Compute Hu Moments (rotation, translation, and scale invariant). */
export function computeHuMoments(pts: Point2D[]): number[] {
  const resampled = resampleContour(pts, 100);
  const n = resampled.length;

  const c = getCentroid(resampled);

  // Central moments
  let mu20 = 0, mu02 = 0, mu11 = 0;
  let mu30 = 0, mu03 = 0, mu21 = 0, mu12 = 0;

  for (const p of resampled) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    mu20 += dx * dx;
    mu02 += dy * dy;
    mu11 += dx * dy;
    mu30 += dx * dx * dx;
    mu03 += dy * dy * dy;
    mu21 += dx * dx * dy;
    mu12 += dx * dy * dy;
  }

  // Normalize central moments
  const scale = n;
  const eta20 = mu20 / Math.pow(scale, 2);
  const eta02 = mu02 / Math.pow(scale, 2);
  const eta11 = mu11 / Math.pow(scale, 2);
  const eta30 = mu30 / Math.pow(scale, 2.5);
  const eta03 = mu03 / Math.pow(scale, 2.5);
  const eta21 = mu21 / Math.pow(scale, 2.5);
  const eta12 = mu12 / Math.pow(scale, 2.5);

  // Hu Moments
  const h1 = eta20 + eta02;
  const h2 = Math.pow(eta20 - eta02, 2) + 4 * Math.pow(eta11, 2);
  const h3 = Math.pow(eta30 - 3 * eta12, 2) + Math.pow(3 * eta21 - eta03, 2);
  const h4 = Math.pow(eta30 + eta12, 2) + Math.pow(eta21 + eta03, 2);

  // Log-transform to handle scale differences
  const logHu = [h1, h2, h3, h4].map(h => {
    const absH = Math.abs(h);
    if (absH < 1e-20) return 0;
    return -Math.sign(h) * Math.log10(absH);
  });

  return logHu;
}

// ============================================================================
// 1. Template Generation Functions (Normalized coordinates -0.5 to 0.5)
// ============================================================================

/** Generate points for a perfect CAD combination wrench. */
function generateWrenchPoints(numPts = 120): Point2D[] {
  const pts: Point2D[] = [];
  
  // Outer spanner right head (ring end) centered at (0.35, 0), radius 0.12
  const cxRight = 0.35;
  const rRight = 0.11;
  const startAngRight = -Math.PI * 0.7;
  const endAngRight = Math.PI * 0.7;
  const stepsRight = Math.round(numPts * 0.3);
  for (let i = 0; i <= stepsRight; i++) {
    const angle = startAngRight + (i / stepsRight) * (endAngRight - startAngRight);
    pts.push({
      x: cxRight + rRight * Math.cos(angle),
      y: rRight * Math.sin(angle),
    });
  }

  // Handle top edge transition
  pts.push({ x: 0.2, y: 0.04 });
  pts.push({ x: -0.2, y: 0.04 });

  // Open spanner left head (open end) centered at (-0.35, 0), radius 0.13
  // Mouth tilted 15 degrees, mouth opening 0.10, mouth depth 0.08
  const cxLeft = -0.35;
  const rLeft = 0.13;
  const tilt = 15 * Math.PI / 180;
  
  // Jaw tips
  const jawUpperTip = {
    x: cxLeft + rLeft * Math.cos(Math.PI + tilt - Math.PI/3.5),
    y: rLeft * Math.sin(Math.PI + tilt - Math.PI/3.5),
  };
  const jawLowerTip = {
    x: cxLeft + rLeft * Math.cos(Math.PI + tilt + Math.PI/3.5),
    y: rLeft * Math.sin(Math.PI + tilt + Math.PI/3.5),
  };
  
  // Inner throat bottom
  const throatCenter = {
    x: cxLeft + 0.05 * Math.cos(tilt),
    y: 0.05 * Math.sin(tilt),
  };
  const throatRadius = 0.045;

  // Outer circle of left head going from bottom jaw tip around to handle transition
  const stepsLeft = Math.round(numPts * 0.35);
  const startAngLeft = Math.PI + tilt + Math.PI/3.5;
  const endAngLeft = Math.PI + tilt - Math.PI/3.5 + 2 * Math.PI;
  for (let i = 0; i <= stepsLeft; i++) {
    const angle = startAngLeft + (i / stepsLeft) * (endAngLeft - startAngLeft);
    pts.push({
      x: cxLeft + rLeft * Math.cos(angle),
      y: rLeft * Math.sin(angle),
    });
  }

  // Jaw flat edges and inner circular throat
  pts.push(jawUpperTip);
  
  // Inner throat arc
  const stepsThroat = 12;
  const startAngThroat = Math.PI + tilt + Math.PI/2;
  const endAngThroat = Math.PI + tilt - Math.PI/2;
  for (let i = 0; i <= stepsThroat; i++) {
    const angle = startAngThroat + (i / stepsThroat) * (endAngThroat - startAngThroat);
    pts.push({
      x: throatCenter.x + throatRadius * Math.cos(angle),
      y: throatCenter.y + throatRadius * Math.sin(angle),
    });
  }

  pts.push(jawLowerTip);

  // Transition to bottom handle
  pts.push({ x: -0.2, y: -0.04 });
  pts.push({ x: 0.2, y: -0.04 });

  return pts;
}

/** Generate points for a perfect CAD screwdriver. */
function generateScrewdriverPoints(numPts = 100): Point2D[] {
  const pts: Point2D[] = [];
  
  // Handle (rounded rectangular block) from x = -0.45 to -0.10, height 0.09
  // Shaft from x = -0.10 to 0.40, height 0.02
  // Tip from x = 0.40 to 0.45, flared/flat height 0.025
  const steps = 15;
  
  // Handle base rounded cap
  const cxHandleBase = -0.42;
  const rHandle = 0.045;
  for (let i = 0; i <= steps; i++) {
    const angle = Math.PI/2 + (i / steps) * Math.PI; // 90 to 270 degrees
    pts.push({
      x: cxHandleBase + rHandle * Math.cos(angle),
      y: rHandle * Math.sin(angle),
    });
  }

  // Handle bottom flares
  pts.push({ x: -0.3, y: -0.045 });
  pts.push({ x: -0.15, y: -0.04 });
  pts.push({ x: -0.10, y: -0.03 });

  // Shaft transition bottom
  pts.push({ x: -0.10, y: -0.01 });
  
  // Shaft bottom edge
  pts.push({ x: 0.40, y: -0.01 });
  
  // Tip bottom flare
  pts.push({ x: 0.41, y: -0.012 });
  pts.push({ x: 0.45, y: -0.012 });
  
  // Tip flat end
  pts.push({ x: 0.45, y: 0.012 });
  pts.push({ x: 0.41, y: 0.012 });

  // Shaft top edge
  pts.push({ x: 0.40, y: 0.01 });
  pts.push({ x: -0.10, y: 0.01 });

  // Shaft transition top
  pts.push({ x: -0.10, y: 0.03 });
  pts.push({ x: -0.15, y: 0.04 });
  pts.push({ x: -0.3, y: 0.045 });

  return pts;
}

/** Generate points for perfect CAD needle-nose pliers. */
function generatePliersPoints(numPts = 120): Point2D[] {
  const pts: Point2D[] = [];
  
  // Jaws: x = 0.05 to 0.45, height tapers from 0.08 to 0.015
  // Joint / Pivot: x = -0.05 to 0.05, height 0.08 (circular joint)
  // Handles: x = -0.45 to -0.05, curved flared-out loops
  const steps = 20;

  // Upper handle loop
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = -0.05 - 0.40 * t;
    // Handle curves outward and returns
    const y = 0.04 + 0.12 * Math.sin(t * Math.PI) + 0.02 * t;
    pts.push({ x, y });
  }

  // Lower handle loop (returning from bottom left)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = -0.45 + 0.40 * t;
    const y = -0.06 - 0.12 * Math.sin((1 - t) * Math.PI) - 0.02 * (1 - t);
    pts.push({ x, y });
  }

  // Pivot bottom joint
  pts.push({ x: -0.05, y: -0.04 });
  pts.push({ x: 0.05, y: -0.04 });

  // Lower jaw outer edge (tapering to tip)
  pts.push({ x: 0.45, y: -0.008 });

  // Tip nose end
  pts.push({ x: 0.45, y: 0.008 });

  // Upper jaw outer edge
  pts.push({ x: 0.05, y: 0.04 });
  pts.push({ x: -0.05, y: 0.04 });

  return pts;
}

/** Generate points for a perfect Hex Key (L-shape). */
function generateHexKeyPoints(): Point2D[] {
  const pts: Point2D[] = [];
  
  // Long leg: from (-0.45, -0.15) to (0.15, -0.15), thickness 0.08
  // Short leg: from (0.15, -0.15) to (0.15, 0.35), thickness 0.08
  // Left end
  pts.push({ x: -0.45, y: -0.11 });
  pts.push({ x: -0.45, y: -0.19 });
  
  // Outer bottom elbow corner
  pts.push({ x: 0.19, y: -0.19 });
  
  // Short leg outer top end
  pts.push({ x: 0.19, y: 0.35 });
  pts.push({ x: 0.11, y: 0.35 });
  
  // Inner elbow corner
  pts.push({ x: 0.11, y: -0.11 });

  return pts;
}

/** Generate points for a utility knife. */
function generateUtilityKnifePoints(): Point2D[] {
  const pts: Point2D[] = [];
  
  // Body: x = -0.45 to 0.20, height 0.09
  // Sloped front nose: x = 0.20 to 0.45 slants down to a point
  pts.push({ x: -0.45, y: 0.03 });
  pts.push({ x: -0.45, y: -0.03 });
  pts.push({ x: 0.15, y: -0.04 });
  
  // Slanted blade slider slot / nose
  pts.push({ x: 0.45, y: -0.01 });
  pts.push({ x: 0.42, y: 0.035 });
  pts.push({ x: 0.15, y: 0.04 });
  pts.push({ x: -0.25, y: 0.045 });

  return pts;
}

// ============================================================================
// Database & Interface
// ============================================================================

export interface ToolTemplate {
  id: string;
  name: string;
  category: string;
  aspectRatio: number;
  huMoments: number[];
  normalizedPoints: Point2D[];
}

export const toolTemplates: ToolTemplate[] = [
  {
    id: 'wrench',
    name: 'Combination Wrench',
    category: 'Spanners',
    aspectRatio: 6.8, // typical length/width ratio
    huMoments: computeHuMoments(generateWrenchPoints()),
    normalizedPoints: generateWrenchPoints(),
  },
  {
    id: 'screwdriver',
    name: 'Screwdriver',
    category: 'Screwdrivers',
    aspectRatio: 8.5,
    huMoments: computeHuMoments(generateScrewdriverPoints()),
    normalizedPoints: generateScrewdriverPoints(),
  },
  {
    id: 'pliers',
    name: 'Needle-Nose Pliers',
    category: 'Pliers',
    aspectRatio: 3.5,
    huMoments: computeHuMoments(generatePliersPoints()),
    normalizedPoints: generatePliersPoints(),
  },
  {
    id: 'hexkey',
    name: 'Hex L-Key',
    category: 'Keys',
    aspectRatio: 2.2,
    huMoments: computeHuMoments(generateHexKeyPoints()),
    normalizedPoints: generateHexKeyPoints(),
  },
  {
    id: 'utilityknife',
    name: 'Utility Knife',
    category: 'Knives',
    aspectRatio: 4.8,
    huMoments: computeHuMoments(generateUtilityKnifePoints()),
    normalizedPoints: generateUtilityKnifePoints(),
  }
];

// ============================================================================
// Alignment & Shape Fitting Algorithm
// ============================================================================

/** Compute average point distance from shape A to closest points in B (Chamfer Distance). */
function chamferDistance(A: Point2D[], B: Point2D[]): number {
  let sumDist = 0;
  for (const a of A) {
    let minDist = Infinity;
    for (const b of B) {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < minDist) minDist = d;
    }
    sumDist += minDist;
  }
  return sumDist / A.length;
}

/** Align a template to the target contour using PCA and fit evaluation. */
export function alignTemplate(
  target: Point2D[],
  template: Point2D[]
): Point2D[] {
  // 1. Get centroids
  const cTarget = getCentroid(target);
  const cTemplate = getCentroid(template);

  // 2. Compute principal orientations via PCA
  const getPCAAngle = (pts: Point2D[], center: Point2D) => {
    let m20 = 0, m02 = 0, m11 = 0;
    for (const p of pts) {
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      m20 += dx * dx;
      m02 += dy * dy;
      m11 += dx * dy;
    }
    return 0.5 * Math.atan2(2 * m11, m20 - m02);
  };

  const thetaTarget = getPCAAngle(target, cTarget);
  const thetaTemplate = getPCAAngle(template, cTemplate);

  // 3. Compute target dimensions for scaling
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  // Rotate target to axis-aligned to get length/width
  const cosT = Math.cos(-thetaTarget);
  const sinT = Math.sin(-thetaTarget);
  for (const p of target) {
    const rx = (p.x - cTarget.x) * cosT + (p.y - cTarget.y) * sinT;
    const ry = -(p.x - cTarget.x) * sinT + (p.y - cTarget.y) * cosT;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  const lengthTarget = maxX - minX;
  const widthTarget = maxY - minY;

  // Do the same for template
  let tMinX = Infinity, tMaxX = -Infinity;
  let tMinY = Infinity, tMaxY = -Infinity;
  const cosTemp = Math.cos(-thetaTemplate);
  const sinTemp = Math.sin(-thetaTemplate);
  for (const p of template) {
    const rx = (p.x - cTemplate.x) * cosTemp + (p.y - cTemplate.y) * sinTemp;
    const ry = -(p.x - cTemplate.x) * sinTemp + (p.y - cTemplate.y) * cosTemp;
    if (rx < tMinX) tMinX = rx;
    if (rx > tMaxX) tMaxX = rx;
    if (ry < tMinY) tMinY = ry;
    if (ry > tMaxY) tMaxY = ry;
  }
  const lengthTemplate = tMaxX - tMinX;
  const widthTemplate = tMaxY - tMinY;

  const scaleX = lengthTarget / (lengthTemplate || 1);
  const scaleY = widthTarget / (widthTemplate || 1);

  // 4. Test both 0° and 180° orientations to resolve ambiguity
  const tryFit = (rotationOffset: number): Point2D[] => {
    const deltaTheta = thetaTarget - thetaTemplate + rotationOffset;
    const cos = Math.cos(deltaTheta);
    const sin = Math.sin(deltaTheta);

    return template.map(p => {
      // Centered coordinate
      const dx = p.x - cTemplate.x;
      const dy = p.y - cTemplate.y;
      
      // Apply scaling (aligned to template coordinate frame before rotation)
      const sx = dx * scaleX;
      const sy = dy * scaleY;

      // Rotate and translate to target centroid
      return {
        x: cTarget.x + (sx * cos - sy * sin),
        y: cTarget.y + (sx * sin + sy * cos),
      };
    });
  };

  const fit0 = tryFit(0);
  const fit180 = tryFit(Math.PI);

  const d0 = chamferDistance(fit0, target);
  const d180 = chamferDistance(fit180, target);

  // Return the contour with the smallest chamfer distance to target
  return d0 < d180 ? fit0 : fit180;
}

// ============================================================================
// Core Database Matching Logic
// ============================================================================

export interface MatchResult {
  templateId: string;
  name: string;
  confidence: number;
  alignedPoints: Point2D[];
}

/**
 * Match a target contour against standard database templates.
 * Returns the best match if confidence matches criteria, else null.
 */
export function matchToolTemplate(
  pts: Point2D[],
  minConfidence: number = 0.82
): MatchResult | null {
  if (pts.length < 10) return null;

  // 1. Get target moments and dimensions
  const targetHu = computeHuMoments(pts);
  
  // Get target aspect ratio
  const centroid = getCentroid(pts);
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const ar = (maxX - minX) / (maxY - minY || 1);
  const targetAR = ar > 1 ? ar : 1 / ar; // AR >= 1

  let bestMatch: ToolTemplate | null = null;
  let highestScore = 0;

  for (const t of toolTemplates) {
    // Aspect ratio comparison (score 0 to 1)
    const ratioAR = Math.min(targetAR, t.aspectRatio) / Math.max(targetAR, t.aspectRatio);
    
    // Hu Moments Euclidean distance
    let sumSq = 0;
    for (let i = 0; i < targetHu.length; i++) {
      const diff = targetHu[i] - t.huMoments[i];
      sumSq += diff * diff;
    }
    const huDist = Math.sqrt(sumSq);
    
    // Map distance to a similarity score (0 to 1)
    const huScore = Math.exp(-huDist * 0.4);

    // Weighted match confidence
    const score = 0.4 * ratioAR + 0.6 * huScore;

    if (score > highestScore) {
      highestScore = score;
      bestMatch = t;
    }
  }

  if (bestMatch && highestScore >= minConfidence) {
    // Align template perfectly to target
    const aligned = alignTemplate(pts, bestMatch.normalizedPoints);
    return {
      templateId: bestMatch.id,
      name: bestMatch.name,
      confidence: highestScore,
      alignedPoints: aligned,
    };
  }

  return null;
}
