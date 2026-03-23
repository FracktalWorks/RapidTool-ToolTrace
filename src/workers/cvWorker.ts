/**
 * OpenCV Web Worker - Enhanced Edge Detection Strategy
 * 
 * Implements strategic improvements for 90%+ accuracy:
 * - CLAHE contrast enhancement (when needed)
 * - Bilateral filtering (edge-preserving)
 * - Auto-tuned Canny (median-based)
 * - Smart paper-aware thresholding
 * - Morphological repair
 * - Quality-based contour selection (solidity, rectangularity)
 * - Tighter contour approximation for tool precision
 * 
 * Core Assumptions:
 * - A4 sheet is the standard paper size
 * - Paper is white
 * - Tools are NOT white
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Load OpenCV.js from public directory
(self as any).importScripts('/opencv.js');

// Types
interface Point2D { x: number; y: number }
interface PaperCorners { topLeft: Point2D; topRight: Point2D; bottomRight: Point2D; bottomLeft: Point2D }

interface WorkerMessage { id: string; type: 'init' | 'detectPaper' | 'traceTool' | 'traceRegion'; payload: any }
interface WorkerResponse { id: string; type: 'success' | 'error'; payload: any }

// Constants
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_ASPECT = A4_HEIGHT_MM / A4_WIDTH_MM; // ~1.414

// State
let cv: any = null;
let initPromise: Promise<void> | null = null;

// ============================================================================
// OpenCV Initialization
// ============================================================================

function initOpenCV(): Promise<void> {
  if (cv) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    const cvLib = (self as any).cv;

    if (!cvLib) {
      reject(new Error('OpenCV.js failed to load'));
      return;
    }

    if (typeof cvLib.Mat === 'function') {
      cv = cvLib;
      console.log('OpenCV ready');
      resolve();
      return;
    }

    cvLib.onRuntimeInitialized = () => {
      cv = cvLib;
      console.log('OpenCV initialized');
      resolve();
    };

    setTimeout(() => {
      if (!cv) reject(new Error('OpenCV init timeout'));
    }, 10000);
  });

  return initPromise;
}

// ============================================================================
// Utility Helpers
// ============================================================================

const deleteMats = (...mats: any[]) => mats.forEach(m => m?.delete?.());
const dist = (a: Point2D, b: Point2D) => Math.hypot(b.x - a.x, b.y - a.y);
const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

const orderCorners = (pts: Point2D[]): Point2D[] => {
  const sorted = [...pts].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bot = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bot[1], bot[0]]; // TL, TR, BR, BL
};

// Compute median of grayscale image for auto-tuned Canny
function computeMedian(gray: any): number {
  const hist = new cv.Mat();
  const mask = new cv.Mat();
  const histSize = [256];
  const ranges = [0, 256];
  
  cv.calcHist([gray] as any, [0] as any, mask, hist, histSize as any, ranges as any, false);
  
  const totalPixels = gray.rows * gray.cols;
  let sum = 0;
  let median = 128;
  
  for (let i = 0; i < 256; i++) {
    sum += hist.data32F[i];
    if (sum >= totalPixels / 2) {
      median = i;
      break;
    }
  }
  
  deleteMats(hist, mask);
  return median;
}

// Calculate contour solidity (area / convex hull area)
function calculateSolidity(contour: any): number {
  const area = cv.contourArea(contour);
  const hull = new cv.Mat();
  cv.convexHull(contour, hull);
  const hullArea = cv.contourArea(hull);
  hull.delete();
  return hullArea > 0 ? area / hullArea : 0;
}

// Calculate rectangularity (how close to a rectangle)
function calculateRectangularity(contour: any): number {
  const area = cv.contourArea(contour);
  const rect = cv.minAreaRect(contour);
  const rectArea = rect.size.width * rect.size.height;
  return rectArea > 0 ? area / rectArea : 0;
}

// ============================================================================
// Image Preprocessing
// ============================================================================

// Apply CLAHE for contrast enhancement
function applyCLAHE(gray: any, clipLimit = 2.0, tileSize = 8): any {
  const clahe = new cv.CLAHE(clipLimit, new cv.Size(tileSize, tileSize));
  const enhanced = new cv.Mat();
  clahe.apply(gray, enhanced);
  clahe.delete();
  return enhanced;
}

// Check if image needs contrast enhancement
function needsContrastEnhancement(gray: any): boolean {
  const mean = new cv.Mat();
  const stddev = new cv.Mat();
  cv.meanStdDev(gray, mean, stddev);
  const std = stddev.data64F[0];
  deleteMats(mean, stddev);
  return std < 50; // Low std dev = poor contrast
}

// Auto-tuned Canny edge detection using median-based thresholds
function autoTunedCanny(blurred: any, sigma = 0.33): any {
  const median = computeMedian(blurred);
  const lower = clamp(Math.round((1 - sigma) * median), 10, 100);
  const upper = clamp(Math.round((1 + sigma) * median), 50, 200);
  
  console.log(`Auto Canny: median=${median}, thresholds=[${lower}, ${upper}]`);
  
  const edges = new cv.Mat();
  cv.Canny(blurred, edges, lower, upper);
  return edges;
}

// ============================================================================
// Paper Detection (Enhanced)
// ============================================================================

function detectPaper(imageData: ImageData) {
  console.log('Detecting paper...', imageData.width, 'x', imageData.height);
  const src = cv.matFromImageData(imageData);
  const totalArea = src.rows * src.cols;

  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  
  // Strategy 1: White paper detection (primary - paper is always white)
  let best = detectWhitePaper(src, totalArea);
  
  // Strategy 2: Edge-based detection (fallback)
  if (!best || best.confidence < 0.6) {
    const edgeResult = detectPaperByEdges(gray, totalArea);
    if (edgeResult && (!best || edgeResult.confidence > best.confidence)) {
      best = edgeResult;
    }
  }

  deleteMats(src, gray);

  if (!best) {
    return { detected: false, confidence: 0, corners: null, pixelsPerMm: null, message: 'No paper detected' };
  }

  const [tl, tr, br, bl] = orderCorners(best.points);
  const corners: PaperCorners = { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };

  const avgW = (dist(tl, tr) + dist(bl, br)) / 2;
  const avgH = (dist(tl, bl) + dist(tr, br)) / 2;
  const landscape = avgW > avgH;
  const pixelsPerMm = landscape
    ? (avgW / A4_HEIGHT_MM + avgH / A4_WIDTH_MM) / 2
    : (avgW / A4_WIDTH_MM + avgH / A4_HEIGHT_MM) / 2;

  console.log('Paper detected:', Math.round(best.confidence * 100) + '%');
  return {
    detected: true,
    confidence: best.confidence,
    corners,
    pixelsPerMm,
    message: `Detected (${Math.round(best.confidence * 100)}% confidence)`,
  };
}

// Detect white paper using HSV color segmentation
function detectWhitePaper(src: any, totalArea: number): { points: Point2D[]; confidence: number } | null {
  const rgb = new cv.Mat();
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  
  // White paper: any hue, low saturation, high value
  const mask = new cv.Mat();
  const lowWhite = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 170, 0]);
  const highWhite = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 60, 255, 0]);
  cv.inRange(hsv, lowWhite, highWhite, mask);
  
  // Morphological cleanup
  const closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15));
  const openKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, closeKernel);
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, openKernel);
  
  const result = findBestQuadrilateral(mask, totalArea);
  
  deleteMats(rgb, hsv, mask, lowWhite, highWhite, closeKernel, openKernel);
  return result;
}

// Edge-based paper detection with auto-tuned Canny
function detectPaperByEdges(gray: any, totalArea: number): { points: Point2D[]; confidence: number } | null {
  // Apply CLAHE if needed
  let processed = gray;
  const needsCLAHE = needsContrastEnhancement(gray);
  
  if (needsCLAHE) {
    processed = applyCLAHE(gray, 2.0, 8);
    console.log('Applied CLAHE for paper detection');
  }
  
  // Bilateral filter - preserves edges better than Gaussian
  const blurred = new cv.Mat();
  cv.bilateralFilter(processed, blurred, 9, 75, 75);
  
  // Auto-tuned Canny
  const edges = autoTunedCanny(blurred);
  
  // Morphological repair
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  cv.dilate(edges, edges, kernel);
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);

  const result = findBestQuadrilateral(edges, totalArea);
  
  if (needsCLAHE) processed.delete();
  deleteMats(blurred, edges, kernel);
  
  return result;
}

// Find best quadrilateral with quality scoring
function findBestQuadrilateral(binary: any, totalArea: number): { points: Point2D[]; confidence: number } | null {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  
  let best: { points: Point2D[]; confidence: number } | null = null;

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const contourArea = cv.contourArea(contour);
    
    // Area filter
    if (contourArea < totalArea * 0.08 || contourArea > totalArea * 0.98) continue;

    const peri = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, 0.02 * peri, true);

    if (approx.rows === 4) {
      const points: Point2D[] = [];
      for (let j = 0; j < 4; j++) {
        points.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
      }

      // Quality metrics
      const isConvex = cv.isContourConvex(approx);
      const solidity = calculateSolidity(contour);
      const rectangularity = calculateRectangularity(contour);
      
      const ordered = orderCorners(points);
      const w = (dist(ordered[0], ordered[1]) + dist(ordered[3], ordered[2])) / 2;
      const h = (dist(ordered[0], ordered[3]) + dist(ordered[1], ordered[2])) / 2;
      const aspect = Math.max(w, h) / Math.min(w, h);

      // Confidence scoring
      const aspectScore = Math.max(0, 1 - Math.abs(aspect - A4_ASPECT) / 0.5) * 0.30;
      const areaScore = Math.min(contourArea / totalArea / 0.3, 1) * 0.25;
      const convexScore = isConvex ? 0.15 : 0;
      const solidityScore = solidity * 0.15;
      const rectScore = rectangularity * 0.15;
      
      const confidence = aspectScore + areaScore + convexScore + solidityScore + rectScore;

      if (confidence > 0.3 && (!best || confidence > best.confidence)) {
        best = { points, confidence };
      }

      approx.delete();
    } else {
      approx.delete();
    }
  }

  deleteMats(contours, hierarchy);
  return best;
}

// ============================================================================
// Tool Tracing (Paper-is-White Silhouette Strategy)
// ============================================================================

function traceTool(imageData: ImageData, clickX: number, clickY: number) {
  console.log('traceTool called at:', clickX, clickY);
  const src = cv.matFromImageData(imageData);
  const x = Math.max(0, Math.min(src.cols - 1, Math.round(clickX)));
  const y = Math.max(0, Math.min(src.rows - 1, Math.round(clickY)));

  // PRIMARY STRATEGY: Paper-is-white silhouette detection
  // Since paper is white, anything NOT white is a potential tool
  let bestResult = traceByPaperSilhouette(src, x, y);
  
  // Fallback: Otsu-based detection
  if (!bestResult) {
    console.log('Silhouette failed, trying Otsu fallback');
    bestResult = traceByOtsuFallback(src, x, y);
  }

  src.delete();
  console.log('traceTool result:', bestResult ? `${bestResult.points.length} points` : 'null');
  return bestResult;
}

// PRIMARY STRATEGY: Paper is white, tool is NOT white
function traceByPaperSilhouette(src: any, x: number, y: number): { points: Point2D[]; area: number } | null {
  // Convert to grayscale for illumination normalization
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  
  // SHADOW REMOVAL: Illumination normalization
  // Step 1: Heavy blur to capture lighting only (shadows, uneven illumination)
  const lighting = new cv.Mat();
  cv.GaussianBlur(gray, lighting, new cv.Size(51, 51), 0);
  
  // Step 2: Divide original by lighting map to normalize illumination
  // Convert to float for division
  const grayFloat = new cv.Mat();
  const lightingFloat = new cv.Mat();
  gray.convertTo(grayFloat, cv.CV_32F);
  lighting.convertTo(lightingFloat, cv.CV_32F);
  
  // Add small epsilon to avoid division by zero
  const epsilon = new cv.Mat(lightingFloat.rows, lightingFloat.cols, cv.CV_32F, new cv.Scalar(1.0));
  cv.add(lightingFloat, epsilon, lightingFloat);
  
  // Divide and scale back to 0-255
  const normalized = new cv.Mat();
  cv.divide(grayFloat, lightingFloat, normalized, 255.0);
  
  // Convert back to 8-bit
  const normalizedU8 = new cv.Mat();
  normalized.convertTo(normalizedU8, cv.CV_8U);
  
  // Now threshold the shadow-free image
  // Paper (white) will have high values, tools (dark) will have low values
  const toolMask = new cv.Mat();
  // Use adaptive threshold for robustness, or simple threshold
  // Values below ~200 are likely tools (not white paper)
  cv.threshold(normalizedU8, toolMask, 200, 255, cv.THRESH_BINARY_INV);
  
  // Clean up with morphological operations
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
  cv.morphologyEx(toolMask, toolMask, cv.MORPH_CLOSE, kernel);
  cv.morphologyEx(toolMask, toolMask, cv.MORPH_OPEN, kernel);
  
  // Additional closing to merge nearby regions into single silhouette
  const largeKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(15, 15));
  cv.morphologyEx(toolMask, toolMask, cv.MORPH_CLOSE, largeKernel);
  
  // Find EXTERNAL contours only for clean outer boundary
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(toolMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  
  let bestContour: any = null;
  let bestArea = Infinity;
  
  // Find smallest contour containing the click point
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    if (area < 1000) continue;
    
    const distance = cv.pointPolygonTest(contour, new cv.Point(x, y), true);
    if (distance >= 0 && area < bestArea) {
      bestContour = contour;
      bestArea = area;
    }
  }
  
  // If no containing contour, find nearest one within 50px
  if (!bestContour) {
    let minDist = 50;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area < 1000) continue;
      
      const distance = cv.pointPolygonTest(contour, new cv.Point(x, y), true);
      if (Math.abs(distance) < minDist) {
        minDist = Math.abs(distance);
        bestContour = contour;
        bestArea = area;
      }
    }
  }
  
  let result = null;
  if (bestContour) {
    result = extractContourPoints(bestContour, 0, 0, bestArea);
    console.log('Found by paper silhouette (shadow-corrected), area:', bestArea);
  }
  
  // Cleanup
  deleteMats(gray, lighting, grayFloat, lightingFloat, epsilon, normalized, normalizedU8, toolMask, kernel, largeKernel, contours, hierarchy);
  return result;
}

// FALLBACK: Otsu-based detection
function traceByOtsuFallback(src: any, x: number, y: number): { points: Point2D[]; area: number } | null {
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  
  const binary = new cv.Mat();
  cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
  
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
  cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);
  cv.morphologyEx(binary, binary, cv.MORPH_OPEN, kernel);
  
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  
  let bestContour: any = null;
  let bestArea = Infinity;
  
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    if (area < 1000) continue;
    
    const distance = cv.pointPolygonTest(contour, new cv.Point(x, y), true);
    if (distance >= 0 && area < bestArea) {
      bestContour = contour;
      bestArea = area;
    }
  }
  
  let result = null;
  if (bestContour) {
    result = extractContourPoints(bestContour, 0, 0, bestArea);
    console.log('Found by Otsu fallback, area:', bestArea);
  }
  
  deleteMats(gray, binary, kernel, contours, hierarchy);
  return result;
}

// Trace rectangular region
function traceRegion(imageData: ImageData, rect: { x: number; y: number; width: number; height: number }) {
  console.log('traceRegion called:', rect);
  const src = cv.matFromImageData(imageData);
  
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const w = Math.min(src.cols - x, Math.round(rect.width));
  const h = Math.min(src.rows - y, Math.round(rect.height));
  
  if (w < 10 || h < 10) {
    src.delete();
    return null;
  }
  
  const roi = src.roi(new cv.Rect(x, y, w, h));
  const result = findMainObjectInRegion(roi, x, y);
  
  roi.delete();
  src.delete();
  
  console.log('traceRegion result:', result ? `${result.points.length} points` : 'null');
  return result;
}

// Find main object in region
function findMainObjectInRegion(roi: any, offsetX: number, offsetY: number): { points: Point2D[]; area: number } | null {
  const gray = new cv.Mat();
  cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);
  
  // Apply CLAHE if needed
  let processed = gray;
  const needsCLAHE = needsContrastEnhancement(gray);
  if (needsCLAHE) {
    processed = applyCLAHE(gray, 3.0, 8);
  }
  
  // Bilateral filter
  const blurred = new cv.Mat();
  cv.bilateralFilter(processed, blurred, 9, 75, 75);
  
  // Otsu's thresholding
  const binary = new cv.Mat();
  cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
  
  // Morphological repair
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
  cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);
  cv.morphologyEx(binary, binary, cv.MORPH_OPEN, kernel);
  
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  
  // Find largest valid contour
  let largestContour: any = null;
  let largestArea = 0;
  
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    
    if (area < 200) continue;
    const solidity = calculateSolidity(contour);
    if (solidity < 0.3) continue;
    
    if (area > largestArea) {
      largestArea = area;
      largestContour = contour;
    }
  }
  
  let result = null;
  
  if (largestContour && largestArea > 200) {
    result = extractContourPoints(largestContour, offsetX, offsetY, largestArea);
  }
  
  if (needsCLAHE && processed !== gray) processed.delete();
  deleteMats(gray, blurred, binary, contours, hierarchy, kernel);
  return result;
}

// Extract contour points with tight approximation for precision
function extractContourPoints(
  contour: any, 
  offsetX: number, 
  offsetY: number, 
  area: number
): { points: Point2D[]; area: number } {
  const peri = cv.arcLength(contour, true);
  
  // Tighter epsilon for tool precision (smaller = more detail)
  const epsilon = 0.002 * peri;
  
  const approx = new cv.Mat();
  cv.approxPolyDP(contour, approx, epsilon, true);
  
  const points: Point2D[] = [];
  for (let j = 0; j < approx.rows; j++) {
    points.push({ 
      x: approx.data32S[j * 2] + offsetX, 
      y: approx.data32S[j * 2 + 1] + offsetY 
    });
  }
  
  approx.delete();
  return { points, area };
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = e.data;

  try {
    await initOpenCV();

    let result: any;
    switch (type) {
      case 'init':
        result = { ready: true };
        break;
      case 'detectPaper':
        result = detectPaper(payload.imageData);
        break;
      case 'traceTool':
        result = traceTool(payload.imageData, payload.x, payload.y);
        break;
      case 'traceRegion':
        result = traceRegion(payload.imageData, payload.rect);
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ id, type: 'success', payload: result } as WorkerResponse);
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      payload: { message: err instanceof Error ? err.message : 'Unknown error' },
    } as WorkerResponse);
  }
};
