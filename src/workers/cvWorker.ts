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

// Result of any tracing operation. `confidence` (0..1) reflects how tool-like
// the detected contour is (solidity, fill, aspect) — used for UI warnings.
interface TraceResult { points: Point2D[]; area: number; confidence?: number }

// A refinement stroke: a polyline of image-space points the user painted.
interface Stroke { points: Point2D[] }

type WorkerMessageType =
  | 'init' | 'detectPaper' | 'traceTool' | 'traceRegion' | 'traceAllTools'
  | 'grabCutInit' | 'grabCutRefine' | 'grabCutClear' | 'contourFromMask' | 'proposeRegions';

interface WorkerMessage { id: string; type: WorkerMessageType; payload: any }
interface WorkerResponse { id: string; type: 'success' | 'error'; payload: any }

// Constants
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_ASPECT = A4_HEIGHT_MM / A4_WIDTH_MM; // ~1.414

// State
let cv: any = null;
let initPromise: Promise<void> | null = null;

// Persistent GrabCut session — kept between the initial box trace and the
// interactive refinement strokes so the user can iteratively correct a tool.
interface GrabCutSession {
  rgb: any;   // downscaled 3-channel image
  mask: any;  // grabCut label mask (0=BGD,1=FGD,2=PR_BGD,3=PR_FGD)
  bgd: any;   // background GMM model (reused across iterations)
  fgd: any;   // foreground GMM model
  scale: number; // originalCoord * scale = downscaled coord
}
let gcSession: GrabCutSession | null = null;

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

  const srcVec = new cv.MatVector();
  srcVec.push_back(gray);
  cv.calcHist(srcVec, [0] as any, mask, hist, histSize as any, ranges as any, false);
  srcVec.delete();

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
// Accuracy Helpers — shared by every tracing entry point
// These build a single high-fidelity tool mask and score it, so click-trace,
// box-trace and auto-detect-all share identical, well-tuned behaviour.
// ============================================================================

// Filled binary mask of the paper quad interior (caller must delete()).
function paperInteriorMask(corners: PaperCorners, rows: number, cols: number): any {
  const m = cv.Mat.zeros(rows, cols, cv.CV_8U);
  const ptsVec = new cv.MatVector();
  const ptsMat = new cv.Mat(4, 1, cv.CV_32SC2);
  const c = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  for (let i = 0; i < 4; i++) {
    ptsMat.data32S[i * 2] = Math.round(c[i].x);
    ptsMat.data32S[i * 2 + 1] = Math.round(c[i].y);
  }
  ptsVec.push_back(ptsMat);
  cv.fillPoly(m, ptsVec, new cv.Scalar(255));
  deleteMats(ptsVec, ptsMat);
  return m;
}

// Thin border ring of the image — used to sample the paper colour when the
// paper quad is unknown (e.g. a box-selected ROI, where the margins are paper).
function borderMask(rows: number, cols: number): any {
  const m = cv.Mat.zeros(rows, cols, cv.CV_8U);
  const t = Math.max(4, Math.round(Math.min(rows, cols) * 0.06));
  cv.rectangle(m, new cv.Point(0, 0), new cv.Point(cols - 1, rows - 1), new cv.Scalar(255), t);
  return m;
}

// Per-channel median over an optional mask (robust paper-colour estimate that
// ignores the minority of tool pixels). Uses a histogram, so it's cheap.
function medianMasked(chan: any, mask: any): number {
  const hist = new cv.Mat();
  const srcVec = new cv.MatVector();
  srcVec.push_back(chan);
  cv.calcHist(srcVec, [0] as any, mask, hist, [256] as any, [0, 256] as any, false);

  let total = 0;
  for (let i = 0; i < 256; i++) total += hist.data32F[i];
  let sum = 0;
  let med = 128;
  for (let i = 0; i < 256; i++) {
    sum += hist.data32F[i];
    if (sum >= total / 2) { med = i; break; }
  }

  deleteMats(hist, srcVec);
  return med;
}

// Detection thresholds in CIE-Lab. Channel DIFFERENCES are identical in
// OpenCV's 8-bit Lab and textbook Lab because the a/b +128 offset cancels in a
// subtraction, so these transfer directly from harness calibration.
const T_CHROMA = 9;   // a,b distance for a "coloured" tool (paper noise ~2-3)
const DARK_K = 0.55;  // "dark" tool if L < DARK_K · paperL (shadows stay above)

// Build a binary tool mask that is PAPER-COLOUR-AGNOSTIC and ROBUST.
//
// A pixel is foreground if it differs from the SAMPLED paper colour by an
// ABSOLUTE margin in one of two independent, physical ways:
//   • chroma distance √((a-pA)²+(b-pB)²) > T_CHROMA → coloured tools (shadow-proof)
//   • lightness L < DARK_K · paperL                  → black/dark tools
//
// Absolute thresholds (no normalize / no Otsu) are the key robustness property:
// uniform paper can NEVER be forced into "foreground", so tools stay SEPARATE
// instead of merging into one blob. Bright polished chrome that matches paper
// in both colour and lightness is intentionally not chased (the local-variance
// cue for it proved too blunt — it bled across the whole sheet). RETR_EXTERNAL
// still fills bright interiors of tools with dark perimeters, and fully-chrome
// parts can be captured with the box-trace tool.
function buildToolMask(src: any, paperCorners?: PaperCorners): any {
  const rows = src.rows;
  const cols = src.cols;

  // Lab colour space.
  const rgb = new cv.Mat();
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
  const lab = new cv.Mat();
  cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
  const ch = new cv.MatVector();
  cv.split(lab, ch);
  const L = ch.get(0);
  const A = ch.get(1);
  const B = ch.get(2);

  // Paper anchor colour = per-channel median over the paper interior (or, if
  // unknown, the image border ring around a box-selected tool).
  const interior = paperCorners ? paperInteriorMask(paperCorners, rows, cols) : null;
  const sampleMask = interior ?? borderMask(rows, cols);
  const pL = medianMasked(L, sampleMask);
  const pA = medianMasked(A, sampleMask);
  const pB = medianMasked(B, sampleMask);

  // Chroma distance² = (a-pA)² + (b-pB)²  → coloured tools.
  const Af = new cv.Mat();
  const Bf = new cv.Mat();
  A.convertTo(Af, cv.CV_32F);
  B.convertTo(Bf, cv.CV_32F);
  const pAm = new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(pA));
  const pBm = new cv.Mat(rows, cols, cv.CV_32F, new cv.Scalar(pB));
  const dA = new cv.Mat();
  const dB = new cv.Mat();
  cv.absdiff(Af, pAm, dA);
  cv.absdiff(Bf, pBm, dB);
  cv.multiply(dA, dA, dA);
  cv.multiply(dB, dB, dB);
  const chroma2 = new cv.Mat();
  cv.add(dA, dB, chroma2);
  const maskChroma = new cv.Mat();
  cv.threshold(chroma2, maskChroma, T_CHROMA * T_CHROMA, 255, cv.THRESH_BINARY);
  maskChroma.convertTo(maskChroma, cv.CV_8U);

  // Darkness: L < DARK_K · paperL  → black / dark tools.
  const maskDark = new cv.Mat();
  cv.threshold(L, maskDark, DARK_K * pL, 255, cv.THRESH_BINARY_INV);

  // Union of the two cues.
  const mask = new cv.Mat();
  cv.bitwise_or(maskChroma, maskDark, mask);

  // Restrict to the paper interior when known.
  if (interior) cv.bitwise_and(mask, interior, mask);

  // Minimal cleanup: open removes speckle, close fills small pin-holes. Small
  // 3×3 only — keeps tools tight and SEPARATE (no merging).
  const kClean = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kClean);
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kClean);

  deleteMats(rgb, lab, L, A, B, Af, Bf, pAm, pBm, dA, dB, chroma2, maskChroma, maskDark, kClean);
  ch.delete();
  if (sampleMask !== interior) sampleMask.delete();
  if (interior) interior.delete();
  return mask;
}

// Geometric confidence (0..1): how "tool-like" a contour is. Combines solidity
// (area / convex-hull), extent (fill of its min-area rect) and a gentle penalty
// for extreme slivers. Cheap, robust, and a good proxy for trace quality.
function contourConfidence(contour: any): number {
  const area = cv.contourArea(contour);
  if (area <= 0) return 0;

  const solidity = calculateSolidity(contour);
  const rect = cv.minAreaRect(contour);
  const rw = rect.size.width;
  const rh = rect.size.height;
  const rectArea = rw * rh;
  const extent = rectArea > 0 ? Math.min(area / rectArea, 1) : 0;
  const aspect = Math.max(rw, rh) / Math.max(Math.min(rw, rh), 1);
  // Long thin tools are valid; only punish extreme streak-like noise (aspect>20).
  const aspectScore = Math.max(0, 1 - Math.max(0, aspect - 20) / 20);

  return Math.max(0, Math.min(1, 0.55 * solidity + 0.35 * extent + 0.10 * aspectScore));
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



  if (!best || best.confidence < 0.2) {
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
    message: ``,
  };
}

// Detect white paper using HSV color segmentation (widened thresholds)
function detectWhitePaper(src: any, totalArea: number): { points: Point2D[]; confidence: number } | null {
  const rgb = new cv.Mat();
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
  const hsv = new cv.Mat();
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

  // HEAVY SMOOTHING to remove floor noise/reflections before color mask
  // This is key to preventing the TR corner from pulling toward floor highlights
  const blurred = new cv.Mat();
  cv.GaussianBlur(hsv, blurred, new cv.Size(15, 15), 0);

  // White paper: any hue, low saturation, high value
  const mask = new cv.Mat();
  // Value relaxed to 135 to handle shadows; saturation strictly < 70
  const lowWhite = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(0, 0, 155, 0));
  const highWhite = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(180, 70, 255, 0));
  cv.inRange(blurred, lowWhite, highWhite, mask);

  // Morphological cleanup - VERY aggressive opening (31x31) to kill reflections
  const closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(25, 25));
  const openKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(31, 31));
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, closeKernel);
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, openKernel);

  // EXTRA STEP: Zero out the extreme edges (1% margin) of the mask.
  // This prevents the TR corner from 'sticking' to background noise at the image boundary.
  const borderW = Math.round(mask.cols * 0.01);
  const borderH = Math.round(mask.rows * 0.01);

  // Clear the 4 border strips
  cv.rectangle(mask, new cv.Point(0, 0), new cv.Point(mask.cols, borderH), new cv.Scalar(0), -1); // Top
  cv.rectangle(mask, new cv.Point(0, mask.rows - borderH), new cv.Point(mask.cols, mask.rows), new cv.Scalar(0), -1); // Bottom
  cv.rectangle(mask, new cv.Point(0, 0), new cv.Point(borderW, mask.rows), new cv.Scalar(0), -1); // Left
  cv.rectangle(mask, new cv.Point(mask.cols - borderW, 0), new cv.Point(mask.cols, mask.rows), new cv.Scalar(0), -1); // Right

  const result = findBestQuadrilateral(mask, totalArea);

  deleteMats(rgb, hsv, blurred, mask, lowWhite, highWhite, closeKernel, openKernel);
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

  // Additional dilation to connect nearby edges  
  const dilateKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  cv.dilate(edges, edges, dilateKernel);

  const result = findBestQuadrilateral(edges, totalArea);

  if (needsCLAHE) processed.delete();
  deleteMats(blurred, edges, kernel);

  return result;
}

// Find best quadrilateral with quality scoring and multi-epsilon approach
function findBestQuadrilateral(binary: any, totalArea: number): { points: Point2D[]; confidence: number } | null {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let best: { points: Point2D[]; confidence: number } | null = null;

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const contourArea = cv.contourArea(contour);

    // Area filter: paper must be at least 5% and can be almost the full image (up to 99.5%)
    if (contourArea < totalArea * 0.05 || contourArea > totalArea * 0.995) continue;

    const peri = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    // Slightly smoother approximation (0.03 instead of 0.02)
    cv.approxPolyDP(contour, approx, 0.03 * peri, true);

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

      if (confidence > 0.4 && (!best || confidence > best.confidence)) {
        best = { points: ordered, confidence };
      }
    } else {
      // FALLBACK for non-perfect quads: Use the vertices of the minimum area rectangle
      // We use the Convex Hull first to stabilize the contour
      const hull = new cv.Mat();
      cv.convexHull(contour, hull);
      const rotatedRect = cv.minAreaRect(hull);
      hull.delete();

      const vertices = cv.RotatedRect.points(rotatedRect);

      let points: Point2D[] = [];
      for (let j = 0; j < 4; j++) {
        points.push({ x: vertices[j].x, y: vertices[j].y });
      }

      // Final sanity fix for the TR corner:
      // If a point is literally touching the very top or very right edge of the image,
      // it's likely noise. We clamp it back toward the other points.
      const margin = 5;
      const w = binary.cols;
      const h = binary.rows;

      points = points.map(p => ({
        x: p.x >= w - margin ? p.x - margin * 4 : (p.x <= margin ? p.x + margin * 4 : p.x),
        y: p.y <= margin ? p.y + margin * 4 : (p.y >= h - margin ? p.y - margin * 4 : p.y)
      }));

      const ordered = orderCorners(points);
      const solidity = calculateSolidity(contour);
      const rectangularity = calculateRectangularity(contour);

      // Only accept if it looks reasonably like a solid rectangle
      if (solidity > 0.8 && rectangularity > 0.65) {
        const areaScore = Math.min(contourArea / totalArea / 0.3, 1) * 0.4;
        const confidence = areaScore + (solidity * 0.3) + (rectangularity * 0.2);

        if (confidence > 0.45 && (!best || confidence > best.confidence)) {
          best = { points: ordered, confidence };
        }
      }
    }

    approx.delete();
  }

  deleteMats(contours, hierarchy);
  return best;
}

// ============================================================================
// Tool Tracing (Paper-is-White Silhouette Strategy)
// ============================================================================

function traceTool(
  imageData: ImageData,
  clickX: number,
  clickY: number,
  paperCorners?: PaperCorners
): TraceResult | null {
  console.log('traceTool called at:', clickX, clickY, paperCorners ? '(paper-masked)' : '');
  const src = cv.matFromImageData(imageData);
  const x = Math.max(0, Math.min(src.cols - 1, Math.round(clickX)));
  const y = Math.max(0, Math.min(src.rows - 1, Math.round(clickY)));

  // Primary: fused silhouette restricted to the paper area.
  let result = traceByFusedMask(src, x, y, paperCorners);

  // Fallback: retry without the paper boundary, in case slightly-off corners
  // clipped a tool that sits near the paper edge.
  if (!result && paperCorners) {
    console.log('traceTool: paper-masked trace empty, retrying without boundary');
    result = traceByFusedMask(src, x, y, undefined);
  }

  src.delete();
  console.log('traceTool result:', result ? `${result.points.length} pts, conf=${result.confidence?.toFixed(2)}` : 'null');
  return result;
}

// Click-trace core: build the fused tool mask, then pick the contour at the
// click point (smallest containing, else nearest within a resolution-scaled
// radius). Returns the refined contour with a confidence score.
function traceByFusedMask(
  src: any,
  x: number,
  y: number,
  paperCorners?: PaperCorners
): TraceResult | null {
  const mask = buildToolMask(src, paperCorners);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  // CHAIN_APPROX_NONE keeps every boundary pixel — maximum fidelity; the tight
  // RDP in extractContourPoints then simplifies without losing tool detail.
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

  const minArea = Math.max(800, (src.rows * src.cols) * 0.0005);
  const searchRadius = Math.max(50, Math.round(Math.max(src.rows, src.cols) / 25));

  let bestContour: any = null;
  let bestArea = Infinity;

  // Prefer the smallest contour that actually contains the click point.
  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    if (area < minArea) continue;
    const d = cv.pointPolygonTest(contour, new cv.Point(x, y), true);
    if (d >= 0 && area < bestArea) {
      bestContour = contour;
      bestArea = area;
    }
  }

  // Otherwise, the nearest contour within the search radius.
  if (!bestContour) {
    let minDist = searchRadius;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area < minArea) continue;
      const d = Math.abs(cv.pointPolygonTest(contour, new cv.Point(x, y), true));
      if (d < minDist) {
        minDist = d;
        bestContour = contour;
        bestArea = area;
      }
    }
  }

  let result: TraceResult | null = null;
  if (bestContour) {
    const confidence = contourConfidence(bestContour);
    result = extractContourPoints(bestContour, 0, 0, bestArea, confidence);
    console.log(`Fused trace: area=${Math.round(bestArea)}, conf=${confidence.toFixed(2)}`);
  }

  deleteMats(mask, contours, hierarchy);
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

// Find the main object inside a user-drawn box. Uses the same fused mask as
// click/auto-detect, then picks the largest valid contour in the crop (the box
// already isolates the tool, so "largest" is the right selection).
function findMainObjectInRegion(roi: any, offsetX: number, offsetY: number): TraceResult | null {
  const mask = buildToolMask(roi); // no paper boundary — ROI is already bounded

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

  let largestContour: any = null;
  let largestArea = 0;

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    if (area < 200) continue;
    if (calculateSolidity(contour) < 0.3) continue;
    if (area > largestArea) {
      largestArea = area;
      largestContour = contour;
    }
  }

  let result: TraceResult | null = null;
  if (largestContour && largestArea > 200) {
    const confidence = contourConfidence(largestContour);
    result = extractContourPoints(largestContour, offsetX, offsetY, largestArea, confidence);
  }

  deleteMats(mask, contours, hierarchy);
  return result;
}

// Extract contour points with a very tight RDP epsilon. Input contours are
// found with CHAIN_APPROX_NONE (every boundary pixel) so this is the only
// simplification — it preserves fine tool geometry while removing collinear
// noise. The frontend geometry library applies final smoothing.
function extractContourPoints(
  contour: any,
  offsetX: number,
  offsetY: number,
  area: number,
  confidence?: number
): TraceResult {
  const peri = cv.arcLength(contour, true);

  // Slightly looser epsilon to smooth out pixelation noise and straighten edges (floor of 1.0px)
  const epsilon = Math.max(1.0, 0.0012 * peri);

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
  return { points, area, confidence };
}

// ============================================================================
// Auto-detect ALL tools on paper
// ============================================================================

function traceAllTools(imageData: ImageData, paperCorners?: PaperCorners): TraceResult[] {
  console.log('traceAllTools: finding all tools on paper...', paperCorners ? 'with boundary masking' : '');
  const src = cv.matFromImageData(imageData);

  // Single fused mask shared with click/box trace (fixed ∪ Otsu, shadow-free,
  // resolution-aware morphology, optional paper boundary).
  const mask = buildToolMask(src, paperCorners);

  // Fill all internal holes and shadow loops before tracing final outer contours
  const tempContours = new cv.MatVector();
  const tempHierarchy = new cv.Mat();
  cv.findContours(mask, tempContours, tempHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  for (let i = 0; i < tempContours.size(); i++) {
    cv.drawContours(mask, tempContours, i, new cv.Scalar(255), -1);
  }
  deleteMats(tempContours, tempHierarchy);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

  const totalArea = src.rows * src.cols;
  const minArea = Math.max(1000, totalArea * 0.0005);
  const results: TraceResult[] = [];

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);

    // Reject noise (too small) and the paper itself (too large).
    if (area < minArea || area > totalArea * 0.6) continue;
    // Reject low-quality blobs.
    const solidity = calculateSolidity(contour);
    if (solidity < 0.3) continue;

    const confidence = contourConfidence(contour);
    const result = extractContourPoints(contour, 0, 0, area, confidence);
    results.push(result);
    console.log(`Found tool: ${result.points.length} pts, area=${Math.round(area)}, conf=${confidence.toFixed(2)}`);
  }

  deleteMats(mask, contours, hierarchy);
  src.delete();

  console.log(`traceAllTools: found ${results.length} tools`);
  return results;
}

// ============================================================================
// GrabCut — interactive graph-cut segmentation (box seed + refine strokes)
//
// Box-only GrabCut nails coloured/dark/textured tools but cannot pull in bright
// chrome that matches the paper (proven on real images). Refinement strokes fix
// that: the user paints "this is tool" / "this is background" and GrabCut
// re-solves with those hard constraints — the path to a precise metal outline.
// ============================================================================

const GRABCUT_MAX_DIM = 1400; // downscale cap for responsiveness (~1-3s)

function clearGrabCutSession(): void {
  if (gcSession) {
    deleteMats(gcSession.rgb, gcSession.mask, gcSession.bgd, gcSession.fgd);
    gcSession = null;
  }
}

// Turn the GrabCut label mask into a clean tool contour in ORIGINAL image space.
function extractGrabCutContour(mask: any, scale: number): TraceResult | null {
  // Foreground = labels 1 (FGD) or 3 (PR_FGD) → odd values. `mask & 1` isolates them.
  const one = new cv.Mat(mask.rows, mask.cols, cv.CV_8U, new cv.Scalar(1));
  const fg = new cv.Mat();
  cv.bitwise_and(mask, one, fg);
  cv.threshold(fg, fg, 0, 255, cv.THRESH_BINARY);

  const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
  cv.morphologyEx(fg, fg, cv.MORPH_OPEN, k);
  cv.morphologyEx(fg, fg, cv.MORPH_CLOSE, k);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(fg, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

  let best: any = null;
  let bestArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const a = cv.contourArea(c);
    if (a > bestArea) { bestArea = a; best = c; }
  }

  let result: TraceResult | null = null;
  if (best && bestArea > 50) {
    const confidence = contourConfidence(best);
    result = extractContourPoints(best, 0, 0, bestArea, confidence);
    // Map points + area from downscaled space back to original image space.
    if (scale !== 1) {
      result.points = result.points.map((p) => ({ x: p.x / scale, y: p.y / scale }));
      result.area = bestArea / (scale * scale);
    }
  }

  deleteMats(one, fg, k, contours, hierarchy);
  return result;
}

// Start a GrabCut session from a user-drawn box (everything outside = definite
// background; inside = probable foreground). Returns the first contour.
function grabCutInit(imageData: ImageData, rect: { x: number; y: number; width: number; height: number }): TraceResult | null {
  clearGrabCutSession();

  const full = cv.matFromImageData(imageData);
  const scale = Math.min(1, GRABCUT_MAX_DIM / Math.max(full.cols, full.rows));

  let srcS = full;
  if (scale < 1) {
    srcS = new cv.Mat();
    cv.resize(full, srcS, new cv.Size(Math.round(full.cols * scale), Math.round(full.rows * scale)), 0, 0, cv.INTER_AREA);
  }
  const rgb = new cv.Mat();
  cv.cvtColor(srcS, rgb, cv.COLOR_RGBA2RGB);
  if (srcS !== full) srcS.delete();
  full.delete();

  // Scale + clamp the rect into the downscaled image.
  const rx = clamp(Math.round(rect.x * scale), 0, rgb.cols - 2);
  const ry = clamp(Math.round(rect.y * scale), 0, rgb.rows - 2);
  const rw = clamp(Math.round(rect.width * scale), 1, rgb.cols - rx);
  const rh = clamp(Math.round(rect.height * scale), 1, rgb.rows - ry);

  const mask = new cv.Mat();
  const bgd = new cv.Mat();
  const fgd = new cv.Mat();
  const cvRect = new cv.Rect(rx, ry, rw, rh);
  cv.grabCut(rgb, mask, cvRect, bgd, fgd, 5, cv.GC_INIT_WITH_RECT);

  gcSession = { rgb, mask, bgd, fgd, scale };
  return extractGrabCutContour(mask, scale);
}

// Paint refinement strokes onto the session mask, then re-solve. fgStrokes mark
// "definitely tool", bgStrokes mark "definitely background".
function grabCutRefine(fgStrokes: Stroke[], bgStrokes: Stroke[], brushRadius: number): TraceResult | null {
  if (!gcSession) return null;
  const { rgb, mask, bgd, fgd, scale } = gcSession;

  const FGD = cv.GC_FGD !== undefined ? cv.GC_FGD : 1;
  const BGD = cv.GC_BGD !== undefined ? cv.GC_BGD : 0;
  const thickness = Math.max(1, Math.round(brushRadius * scale)) * 2;

  const paint = (strokes: Stroke[], value: number) => {
    for (const stroke of strokes) {
      const pts = stroke.points;
      if (pts.length === 1) {
        const p = new cv.Point(Math.round(pts[0].x * scale), Math.round(pts[0].y * scale));
        cv.circle(mask, p, Math.max(1, thickness / 2), new cv.Scalar(value), -1);
        continue;
      }
      for (let i = 1; i < pts.length; i++) {
        const a = new cv.Point(Math.round(pts[i - 1].x * scale), Math.round(pts[i - 1].y * scale));
        const b = new cv.Point(Math.round(pts[i].x * scale), Math.round(pts[i].y * scale));
        cv.line(mask, a, b, new cv.Scalar(value), thickness);
      }
    }
  };
  paint(fgStrokes || [], FGD);
  paint(bgStrokes || [], BGD);

  const dummy = new cv.Rect(0, 0, 1, 1);
  cv.grabCut(rgb, mask, dummy, bgd, fgd, 3, cv.GC_INIT_WITH_MASK);

  return extractGrabCutContour(mask, scale);
}

// ============================================================================
// ============================================================================
// Multi-Point Tool Proposal Generation
//
// Instead of returning flat point arrays (which caused 38 blind decoder passes
// and Union-Find merge chaos), we now return structured ToolProposal objects:
//   • One proposal per candidate tool region (classical blob OR edge cluster)
//   • Each proposal carries 5-7 positive points along the tool's principal axis
//   • Plus 4 negative points just outside the bounding box
//   • SAM decodes each proposal in a SINGLE pass — no merging needed
// ============================================================================

interface ToolProposal {
  positivePoints: Point2D[];  // 5-7 points sampled along the principal axis, inside the contour
  negativePoints: Point2D[];  // 4 points just outside the bounding box (background cues)
  bbox: { x: number; y: number; w: number; h: number };
  sourceArea: number;         // classical contour area for filtering/sorting
}

/**
 * Convert a contour into a structured ToolProposal with multi-point prompts.
 *
 * Uses moment-based PCA to find the principal axis of inertia, then samples
 * positive points along that axis. Points are validated against a filled mask
 * to ensure they actually fall inside the tool silhouette.
 */
function buildProposalFromContour(
  contour: any,
  area: number,
  imgRows: number,
  imgCols: number,
  filledMask: any
): ToolProposal | null {
  const rect = cv.boundingRect(contour);
  const bbox = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };

  // Oriented bounding box via minAreaRect to find true geometric center & axis
  const rotatedRect = cv.minAreaRect(contour);
  const cx = rotatedRect.center.x;
  const cy = rotatedRect.center.y;

  // Verify dimensions
  if (rotatedRect.size.width <= 0 || rotatedRect.size.height <= 0) return null;

  // Check if a point is inside the contour polygon (100% robust against internal holes/reflections)
  function isInside(x: number, y: number): boolean {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || px >= imgCols || py < 0 || py >= imgRows) return false;
    return cv.pointPolygonTest(contour, new cv.Point(px, py), false) >= 0;
  }

  // Determine oriented longitudinal axis
  let angle = rotatedRect.angle * Math.PI / 180;
  let halfLen = 0;
  if (rotatedRect.size.width > rotatedRect.size.height) {
    halfLen = rotatedRect.size.width * 0.42;
  } else {
    halfLen = rotatedRect.size.height * 0.42;
    angle += Math.PI / 2;
  }

  // Sample 7 positive points along the oriented axis
  const positivePoints: Point2D[] = [];
  const numSamples = 7;
  for (let s = 0; s < numSamples; s++) {
    const t = -0.85 + (1.7 * s / (numSamples - 1)); // -0.85 to +0.85 along axis
    const px = cx + t * halfLen * Math.cos(angle);
    const py = cy + t * halfLen * Math.sin(angle);
    if (isInside(px, py)) {
      positivePoints.push({ x: px, y: py });
    }
  }

  // Always include geometric center if it's inside and not already captured
  const hasCentroid = positivePoints.some(
    p => Math.abs(p.x - cx) < 3 && Math.abs(p.y - cy) < 3
  );
  if (!hasCentroid && isInside(cx, cy)) {
    positivePoints.unshift({ x: cx, y: cy });
  }

  // If still empty, fallback to geometric center
  if (positivePoints.length === 0) {
    positivePoints.push({ x: cx, y: cy });
  }

  // Sample along minor axis (perpendicular) for wider tools
  const minorLen = Math.min(rotatedRect.size.width, rotatedRect.size.height);
  if (positivePoints.length < 5 && minorLen > 25) {
    const minorAngle = angle + Math.PI / 2;
    const minorHalfLen = minorLen * 0.3;
    for (const t of [-0.5, 0.5]) {
      const px = cx + t * minorHalfLen * Math.cos(minorAngle);
      const py = cy + t * minorHalfLen * Math.sin(minorAngle);
      if (isInside(px, py)) {
        positivePoints.push({ x: px, y: py });
      }
    }
  }

  // Negative points: midpoints of each bbox side, pushed outward by margin
  const margin = Math.max(30, Math.min(rect.width, rect.height) * 0.25);
  const negativePoints: Point2D[] = [
    // Bottom center
    { x: cx, y: Math.min(imgRows - 1, rect.y + rect.height + margin) },
    // Left center
    { x: Math.max(0, rect.x - margin), y: cy },
    // Right center
    { x: Math.min(imgCols - 1, rect.x + rect.width + margin), y: cy },
    // Top center
    { x: cx, y: Math.max(0, rect.y - margin) },
  ];

  return { positivePoints, negativePoints, bbox, sourceArea: area };
}

function proposeRegions(imageData: ImageData, paperCorners?: PaperCorners): ToolProposal[] {
  const src = cv.matFromImageData(imageData);
  const rows = src.rows, cols = src.cols;
  const totalArea = rows * cols;
  const minArea = Math.max(1000, totalArea * 0.0005);

  // 1. Classical tool detection mask
  const classicalMask = buildToolMask(src, paperCorners);

  // Fill holes in classical mask to make it solid
  const tempContours = new cv.MatVector();
  const tempHierarchy = new cv.Mat();
  cv.findContours(classicalMask, tempContours, tempHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  for (let i = 0; i < tempContours.size(); i++) {
    cv.drawContours(classicalMask, tempContours, i, new cv.Scalar(255), -1);
  }
  deleteMats(tempContours, tempHierarchy);

  // 2. Edge-detected chrome mask
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  const blurred = new cv.Mat();
  cv.bilateralFilter(gray, blurred, 9, 75, 75);
  const edges = autoTunedCanny(blurred);

  // Restrict edges to paper interior if corners are known
  const interior = paperCorners ? paperInteriorMask(paperCorners, rows, cols) : null;
  if (interior) {
    cv.bitwise_and(edges, interior, edges);
  }

  // 3. Connect chrome edge fragments
  const dilateKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9));
  cv.dilate(edges, edges, dilateKernel);
  const closeKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(15, 15));
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, closeKernel);

  // 4. Morphologically merge classical and edge detections
  const combined = new cv.Mat();
  cv.bitwise_or(classicalMask, edges, combined);

  // Reduce morphological close size to prevent merging parallel adjacent tools (clamped between 15 and 35)
  const closeSize = Math.max(15, Math.min(35, Math.round(cols * 0.01))); // 1% of width
  const kCloseSize = closeSize % 2 === 0 ? closeSize + 1 : closeSize;
  const morphClose = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kCloseSize, kCloseSize));
  cv.morphologyEx(combined, combined, cv.MORPH_CLOSE, morphClose);

  const openSize = Math.max(11, Math.round(cols * 0.008)); // 0.8% of width
  const kOpenSize = openSize % 2 === 0 ? openSize + 1 : openSize;
  const morphOpen = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kOpenSize, kOpenSize));
  cv.morphologyEx(combined, combined, cv.MORPH_OPEN, morphOpen);

  // Connect collinear contours that are close to each other (e.g. black flange and blue body separated by silver cylinder)
  const collinearContours = new cv.MatVector();
  const collinearHierarchy = new cv.Mat();
  cv.findContours(combined, collinearContours, collinearHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const validCands: { cx: number; cy: number; rect: any }[] = [];
  for (let i = 0; i < collinearContours.size(); i++) {
    const c = collinearContours.get(i);
    const area = cv.contourArea(c);
    if (area > 300) {
      const rect = cv.boundingRect(c);
      validCands.push({
        cx: Math.round(rect.x + rect.width / 2),
        cy: Math.round(rect.y + rect.height / 2),
        rect
      });
    }
  }

  for (let i = 0; i < validCands.length; i++) {
    for (let j = i + 1; j < validCands.length; j++) {
      const c1 = validCands[i];
      const c2 = validCands[j];
      const r1 = c1.rect;
      const r2 = c2.rect;

      // Check horizontal alignment and gap
      const yOverlap = Math.max(r1.y, r2.y) < Math.min(r1.y + r1.height, r2.y + r2.height);
      let hGap = Infinity;
      if (r1.x + r1.width < r2.x) {
        hGap = r2.x - (r1.x + r1.width);
      } else if (r2.x + r2.width < r1.x) {
        hGap = r1.x - (r2.x + r2.width);
      } else {
        hGap = 0;
      }

      // Check vertical alignment and gap
      const xOverlap = Math.max(r1.x, r2.x) < Math.min(r1.x + r1.width, r2.x + r2.width);
      let vGap = Infinity;
      if (r1.y + r1.height < r2.y) {
        vGap = r2.y - (r1.y + r1.height);
      } else if (r2.y + r2.height < r1.y) {
        vGap = r1.y - (r2.y + r2.height);
      } else {
        vGap = 0;
      }

      let shouldConnect = false;
      let thick = 20;

      // Strict alignment checks to prevent merging parallel adjacent tools (e.g. caliper and dial indicator)
      // or giant hand shadows to small tools.
      const heightRatio = Math.max(r1.height, r2.height) / Math.min(r1.height, r2.height);
      const widthRatio = Math.max(r1.width, r2.width) / Math.min(r1.width, r2.width);

      if (yOverlap && hGap < cols * 0.18 && heightRatio < 3.5) {
        // Horizontal connection: centers must align vertically, and not both vertically elongated
        const cyOffset = Math.abs(c1.cy - c2.cy);
        const maxOffset = Math.min(r1.height, r2.height) * 0.6;
        const bothVertElongated = r1.height > r1.width * 1.3 && r2.height > r2.width * 1.3;
        if (cyOffset < maxOffset && !bothVertElongated) {
          shouldConnect = true;
          thick = Math.min(r1.height, r2.height, 50);
        }
      } else if (xOverlap && vGap < rows * 0.18 && widthRatio < 3.5) {
        // Vertical connection: centers must align horizontally, and not both horizontally elongated
        const cxOffset = Math.abs(c1.cx - c2.cx);
        const maxOffset = Math.min(r1.width, r2.width) * 0.6;
        const bothHorizElongated = r1.width > r1.height * 1.3 && r2.width > r2.height * 1.3;
        if (cxOffset < maxOffset && !bothHorizElongated) {
          shouldConnect = true;
          thick = Math.min(r1.width, r2.width, 50);
        }
      }

      if (shouldConnect) {
        const p1 = new cv.Point(c1.cx, c1.cy);
        const p2 = new cv.Point(c2.cx, c2.cy);
        cv.line(combined, p1, p2, new cv.Scalar(255), Math.max(10, Math.round(thick * 0.8)));
      }
    }
  }
  deleteMats(collinearContours, collinearHierarchy);



  // 5. Find contours of unified tool regions
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(combined, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const proposals: ToolProposal[] = [];

  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    
    // Reject noise (too small) and paper background (too large)
    if (area < minArea || area > totalArea * 0.6) continue;
    
    // Solidity check to filter out long thin lines, wires, or scribbles
    if (calculateSolidity(c) < 0.20) continue;

    const proposal = buildProposalFromContour(c, area, rows, cols, combined);
    if (proposal) {
      proposals.push(proposal);
    }
  }

  // Cleanup
  deleteMats(src, classicalMask, gray, blurred, edges, dilateKernel, closeKernel, combined, morphClose, morphOpen, contours, hierarchy);
  if (interior) interior.delete();

  console.log(`proposeRegions: found ${proposals.length} unified proposals`);
  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i];
    console.log(`  Proposal ${i}: bbox=[x=${p.bbox.x}, y=${p.bbox.y}, w=${p.bbox.w}, h=${p.bbox.h}], positives=${p.positivePoints.length}, negatives=${p.negativePoints.length}`);
  }
  return proposals;
}

// ============================================================================
// Contour generation from mask
// ============================================================================

function contourFromMask(mask: Uint8Array, width: number, height: number): TraceResult | null {
  const m = new cv.Mat(height, width, cv.CV_8UC1);
  m.data.set(mask);

  // Close narrow gaps/slits with a dynamic kernel based on image size (e.g. ~2.5% of min dimension)
  // to heal internal reflections (like silver motor cylinders) without merging tools.
  const minDim = Math.min(width, height);
  const closeSize = Math.max(5, Math.round(minDim * 0.025));
  const kCloseSize = closeSize % 2 === 0 ? closeSize + 1 : closeSize;
  const openSize = Math.max(3, Math.round(minDim * 0.005));
  const kOpenSize = openSize % 2 === 0 ? openSize + 1 : openSize;

  const kClose = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kCloseSize, kCloseSize));
  const kOpen = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kOpenSize, kOpenSize));
  cv.morphologyEx(m, m, cv.MORPH_CLOSE, kClose);
  cv.morphologyEx(m, m, cv.MORPH_OPEN, kOpen);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(m, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

  let best: any = null;
  let bestArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const a = cv.contourArea(c);
    if (a > bestArea) { bestArea = a; best = c; }
  }

  // Reject the mask if it is too large (more than 25% of the total image area)
  // as it is likely a background bleed
  const maxArea = width * height * 0.25;
  if (bestArea > maxArea) {
    console.log(`contourFromMask: Rejecting contour with area ${Math.round(bestArea)} (exceeds 25% image area of ${Math.round(maxArea)})`);
    deleteMats(m, kClose, kOpen, contours, hierarchy);
    return null;
  }

  let result: TraceResult | null = null;
  if (best && bestArea > 50) {
    // Create a solid version of the largest contour to fill all internal holes/loops
    const mClean = cv.Mat.zeros(height, width, cv.CV_8U);
    const tempVec = new cv.MatVector();
    tempVec.push_back(best);
    cv.drawContours(mClean, tempVec, 0, new cv.Scalar(255), -1);

    // Extract the clean outer contour of the solid shape
    const cleanContours = new cv.MatVector();
    const cleanHierarchy = new cv.Mat();
    cv.findContours(mClean, cleanContours, cleanHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

    if (cleanContours.size() > 0) {
      let cleanBest = cleanContours.get(0);
      let cleanBestArea = cv.contourArea(cleanBest);
      for (let i = 1; i < cleanContours.size(); i++) {
        const c = cleanContours.get(i);
        const a = cv.contourArea(c);
        if (a > cleanBestArea) { cleanBestArea = a; cleanBest = c; }
      }
      const confidence = contourConfidence(cleanBest);
      result = extractContourPoints(cleanBest, 0, 0, cleanBestArea, confidence);
    }

    deleteMats(mClean, tempVec, cleanContours, cleanHierarchy);
  }

  deleteMats(m, kClose, kOpen, contours, hierarchy);
  return result;
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
        result = traceTool(payload.imageData, payload.x, payload.y, payload.paperCorners);
        break;
      case 'traceRegion':
        result = traceRegion(payload.imageData, payload.rect);
        break;
      case 'traceAllTools':
        result = traceAllTools(payload.imageData, payload.paperCorners);
        break;
      case 'grabCutInit':
        result = grabCutInit(payload.imageData, payload.rect);
        break;
      case 'grabCutRefine':
        result = grabCutRefine(payload.fgStrokes, payload.bgStrokes, payload.brushRadius);
        break;
      case 'grabCutClear':
        clearGrabCutSession();
        result = { cleared: true };
        break;
      case 'contourFromMask':
        result = contourFromMask(new Uint8Array(payload.mask), payload.width, payload.height);
        break;
      case 'proposeRegions':
        result = proposeRegions(payload.imageData, payload.paperCorners);
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

