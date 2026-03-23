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

// Public API
export async function detectPaper(imageUrl: string): Promise<PaperDetectionResult> {
  const imageData = await getImageData(imageUrl);
  return request('detectPaper', { imageData });
}

export async function traceTool(imageUrl: string, x: number, y: number): Promise<ToolTracingResult | null> {
  const imageData = await getImageData(imageUrl);
  return request('traceTool', { imageData, x, y });
}

export async function traceRegion(
  imageUrl: string, 
  rect: { x: number; y: number; width: number; height: number }
): Promise<ToolTracingResult | null> {
  const imageData = await getImageData(imageUrl);
  return request('traceRegion', { imageData, rect });
}
