/**
 * CV Worker - manages OpenCV web worker communication
 */

import type { Point2D, PaperCorners } from '../lib/geometry';

// Types
export type { Point2D, PaperCorners };

export interface PaperDetectionResult {
  detected: boolean;
  confidence: number;
  corners: PaperCorners | null;
  pixelsPerMm: number | null;
  message: string;
}

export interface ToolTracingResult {
  points: Point2D[];
  area: number;
}

/**
 * Smoothing algorithm (Chaikin's Corner Cutting)
 * Makes jagged AI borders look like smooth curves
 */
function smoothPoints(points: Point2D[], iterations: number = 2): Point2D[] {
  if (points.length < 3) return points;

  let current = [...points];
  for (let iter = 0; iter < iterations; iter++) {
    const next: Point2D[] = [];
    for (let i = 0; i < current.length; i++) {
      const p1 = current[i];
      const p2 = current[(i + 1) % current.length];

      // Q = 0.75 * p1 + 0.25 * p2
      next.push({
        x: p1.x * 0.75 + p2.x * 0.25,
        y: p1.y * 0.75 + p2.y * 0.25
      });

      // R = 0.25 * p1 + 0.75 * p2
      next.push({
        x: p1.x * 0.25 + p2.x * 0.75,
        y: p1.y * 0.25 + p2.y * 0.75
      });
    }
    current = next;
  }
  return current;
}

// Worker instance
let worker: Worker | null = null;
let ready = false;
let reqId = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

// Initialize worker
async function init(): Promise<void> {
  if (ready) return;

  return new Promise((resolve, reject) => {
    worker = new Worker(new URL('./cvWorker.ts', import.meta.url));

    worker.onmessage = (e) => {
      const { id, type, payload } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      type === 'error' ? p.reject(new Error(payload.message)) : p.resolve(payload);
    };

    worker.onerror = () => reject(new Error('Worker failed'));

    // Init request
    const id = `init-${Date.now()}`;
    pending.set(id, { resolve: () => { ready = true; resolve(); }, reject });
    worker.postMessage({ id, type: 'init', payload: {} });

    setTimeout(() => { if (!ready) reject(new Error('Worker timeout')); }, 15000);
  });
}

// Send request to worker
async function request<T>(type: string, payload: unknown): Promise<T> {
  await init();
  return new Promise((resolve, reject) => {
    const id = `${type}-${++reqId}`;
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ id, type, payload });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('Timeout')); } }, 60000);
  });
}

// Get ImageData from URL
async function getImageData(url: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

const SAM_API_URL = "https://serverless.roboflow.com/sam2/segment_image";
const SAM_API_KEY = import.meta.env.VITE_ROBOFLOW_API_KEY || "";

export async function detectPaper(imageUrl: string): Promise<PaperDetectionResult> {
  const imageData = await getImageData(imageUrl);

  // STRATEGY 1: Local OpenCV Detection (Primary)
  // Locally-run OpenCV is specifically tuned with A4 aspect ratio priors and HSV color filtering.
  // It is faster and usually more accurate for geometric shapes like paper.
  try {
    const result = await request<PaperDetectionResult>('detectPaper', { imageData });
    if (result.detected && result.confidence > 0.6) {
      console.log("Paper detected via OpenCV worker:", result.confidence);
      return result;
    }
  } catch (error) {
    console.warn("OpenCV Paper Detection failed:", error);
  }

  // STRATEGY 2: SAM API Fallback
  // If OpenCV fails (e.g., extremely complex lighting), we use SAM with corner-focused prompts.
  if (!SAM_API_KEY || SAM_API_KEY === "YOUR_PRIVATE_API_KEY_HERE") {
    return {
      detected: false,
      confidence: 0,
      corners: null,
      pixelsPerMm: null,
      message: "Detection failed. Please place paper on a high-contrast surface."
    };
  }

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const MAX_DIM = 1024;
    let scale = 1;
    let targetW = img.width;
    let targetH = img.height;

    if (img.width > MAX_DIM || img.height > MAX_DIM) {
      scale = Math.min(MAX_DIM / img.width, MAX_DIM / img.height);
      targetW = Math.round(img.width * scale);
      targetH = Math.round(img.height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, targetW, targetH);
    const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

    // For paper detection, we prompt SAM with 5 points: center-corners and center-middle.
    // We avoid the exact center (0.5, 0.5) to stay away from the tool.
    const prompts = [
      { type: "point", x: Math.round(targetW * 0.25), y: Math.round(targetH * 0.25), positive: true },
      { type: "point", x: Math.round(targetW * 0.75), y: Math.round(targetH * 0.25), positive: true },
      { type: "point", x: Math.round(targetW * 0.25), y: Math.round(targetH * 0.75), positive: true },
      { type: "point", x: Math.round(targetW * 0.75), y: Math.round(targetH * 0.75), positive: true },
      { type: "point", x: Math.round(targetW * 0.50), y: Math.round(targetH * 0.20), positive: true }
    ];

    const response = await fetch(`${SAM_API_URL}?api_key=${SAM_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: { type: "base64", value: base64Image },
        prompts: prompts
      })
    });

    const data = await response.json();
    if (!data || !data.predictions || data.predictions.length === 0) {
      throw new Error("SAM found no results");
    }

    // Roboflow SAM2 returns masks as polygon point lists
    // We pick the mask with the largest point count to ensure it's the paper
    let bestMask = data.predictions[0].masks[0];
    let maxMaskPoints = 0;

    for (const pred of data.predictions) {
      for (const mask of pred.masks) {
        if (mask.length > maxMaskPoints) {
          maxMaskPoints = mask.length;
          bestMask = mask;
        }
      }
    }

    const points: Point2D[] = bestMask.map((pt: number[]) => ({
      x: pt[0] / scale,
      y: pt[1] / scale
    }));

    // Find the 4 corners of the resulting polygon
    let tl = points[0], tr = points[0], br = points[0], bl = points[0];
    let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;

    for (const p of points) {
      const sum = p.x + p.y;
      const diff = p.x - p.y;
      if (sum < minSum) { minSum = sum; tl = p; }
      if (sum > maxSum) { maxSum = sum; br = p; }
      if (diff > maxDiff) { maxDiff = diff; tr = p; }
      if (diff < minDiff) { minDiff = diff; bl = p; }
    }

    const dist = (a: Point2D, b: Point2D) => Math.hypot(b.x - a.x, b.y - a.y);
    const avgW = (dist(tl, tr) + dist(bl, br)) / 2;
    const avgH = (dist(tl, bl) + dist(tr, br)) / 2;

    // Validation: Paper should cover at least 5% of the image
    const imgArea = img.width * img.height;
    const paperArea = avgW * avgH;
    if (paperArea < imgArea * 0.05) {
      throw new Error("Detection found something too small to be paper");
    }

    const landscape = avgW > avgH;
    const pixelsPerMm = landscape
      ? (avgW / A4_HEIGHT_MM + avgH / A4_WIDTH_MM) / 2
      : (avgW / A4_WIDTH_MM + avgH / A4_HEIGHT_MM) / 2;

    return {
      detected: true,
      confidence: 0.85,
      corners: { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl },
      pixelsPerMm,
      message: "Detected via SAM AI"
    };

  } catch (error) {
    console.error("Auto-detection failed:", error);
    // FINAL FALLBACK: If all auto-detection fails, provide default corners at 10%, 90%
    // This allows the user to simply drag them into place rather than getting an error message.
    const w = imageData.width;
    const h = imageData.height;
    const defaultCorners = {
      topLeft: { x: w * 0.1, y: h * 0.1 },
      topRight: { x: w * 0.9, y: h * 0.1 },
      bottomRight: { x: w * 0.9, y: h * 0.9 },
      bottomLeft: { x: w * 0.1, y: h * 0.9 }
    };

    return {
      detected: true,
      confidence: 0.1,
      corners: defaultCorners,
      pixelsPerMm: Math.min(w, h) / 210, // Rough guess
      message: "Auto-detection failed. Using default A4 placement."
    };
  }
}

export async function traceTool(imageUrl: string, x: number, y: number): Promise<ToolTracingResult | null> {
  if (!SAM_API_KEY || SAM_API_KEY === "YOUR_PRIVATE_API_KEY_HERE") {
    console.warn("VITE_ROBOFLOW_API_KEY not set. Using fallback OpenCV tracing.");
    const imageData = await getImageData(imageUrl);
    return request('traceTool', { imageData, x, y });
  }

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    // Scale down image to avoid timeouts and giant payloads on API
    const MAX_DIM = 1024;
    let scale = 1;
    let targetW = img.width;
    let targetH = img.height;

    if (img.width > MAX_DIM || img.height > MAX_DIM) {
      scale = Math.min(MAX_DIM / img.width, MAX_DIM / img.height);
      targetW = Math.round(img.width * scale);
      targetH = Math.round(img.height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

    const promptX = Math.round(x * scale);
    const promptY = Math.round(y * scale);

    const response = await fetch(`${SAM_API_URL}?api_key=${SAM_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: {
          type: "base64",
          value: base64Image
        },
        prompts: [{ type: "point", points: [{ x: promptX, y: promptY, positive: true }] }]
      })
    });

    const data = await response.json();

    if (!data || !data.predictions || data.predictions.length === 0) {
      console.warn("SAM detected nothing, falling back to OpenCV");
      const imageData = await getImageData(imageUrl);
      return request('traceTool', { imageData, x, y });
    }

    // Roboflow sam2 returns predictions[0].masks -> polygons
    const samPolygons = data.predictions[0].masks[0];

    // Convert points back to original scale
    const rawPoints: Point2D[] = samPolygons.map((pt: number[]) => ({
      x: pt[0] / scale,
      y: pt[1] / scale
    }));

    // Apply smoothing to the tool border
    const points = smoothPoints(rawPoints, 2);

    // Shoelace area calculation
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    area = Math.abs(area / 2.0);

    return { points, area };
  } catch (error) {
    console.error("SAM API Error:", error);
    const imageData = await getImageData(imageUrl);
    return request('traceTool', { imageData, x, y });
  }
}

export async function traceRegion(
  imageUrl: string,
  rect: { x: number; y: number; width: number; height: number }
): Promise<ToolTracingResult | null> {
  if (!SAM_API_KEY || SAM_API_KEY === "YOUR_PRIVATE_API_KEY_HERE") {
    const imageData = await getImageData(imageUrl);
    return request('traceRegion', { imageData, rect });
  }

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const MAX_DIM = 1024;
    let scale = 1;
    let targetW = img.width;
    let targetH = img.height;

    if (img.width > MAX_DIM || img.height > MAX_DIM) {
      scale = Math.min(MAX_DIM / img.width, MAX_DIM / img.height);
      targetW = Math.round(img.width * scale);
      targetH = Math.round(img.height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, targetW, targetH);
    const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

    const rx = Math.round(rect.x * scale);
    const ry = Math.round(rect.y * scale);
    const rw = Math.round(rect.width * scale);
    const rh = Math.round(rect.height * scale);

    const response = await fetch(`${SAM_API_URL}?api_key=${SAM_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: {
          type: "base64",
          value: base64Image
        },
        prompts: [{ type: "bbox", bbox: [rx, ry, rx + rw, ry + rh] }]
      })
    });

    const data = await response.json();
    if (!data || !data.predictions || data.predictions.length === 0) {
      const imageData = await getImageData(imageUrl);
      return request('traceRegion', { imageData, rect });
    }

    const samPolygons = data.predictions[0].masks[0];

    const rawPoints: Point2D[] = samPolygons.map((pt: number[]) => ({
      x: pt[0] / scale,
      y: pt[1] / scale
    }));

    const points = smoothPoints(rawPoints, 2);

    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    area = Math.abs(area / 2.0);

    return { points, area };
  } catch (error) {
    console.error("SAM API Error:", error);
    const imageData = await getImageData(imageUrl);
    return request('traceRegion', { imageData, rect });
  }
}

export async function traceAllTools(imageUrl: string, paperCorners?: PaperCorners): Promise<ToolTracingResult[]> {
  const imageData = await getImageData(imageUrl);
  return request<ToolTracingResult[]>('traceAllTools', { imageData, paperCorners });
}
