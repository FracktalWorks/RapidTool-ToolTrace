/**
 * SAM Worker Manager
 *
 * Drives the SlimSAM web worker (lazy model load, embed-once, per-click decode)
 * and routes the resulting mask through the OpenCV contour path so a SAM trace
 * produces the exact same ToolTracingResult shape as classical detection.
 *
 * Everything runs on-device — no server, no API key. The model is fetched from
 * the HF CDN on first use and cached by the browser thereafter.
 */

import type { ToolTracingResult, PaperCorners } from './cvWorkerManager';
import { contourFromMask, proposeRegions } from './cvWorkerManager';

// Scale a contour (in processing-resolution space) back to original image space.
function scaleResult(r: ToolTracingResult | null, scale: number): ToolTracingResult | null {
  if (!r) return null;
  if (scale === 1) return r;
  return {
    ...r,
    points: r.points.map((p) => ({ x: p.x * scale, y: p.y * scale })),
    area: r.area * scale * scale,
  };
}

export interface SamLoadProgress {
  status: string;
  file?: string;
  progress: number; // 0..100
}

let worker: Worker | null = null;
let reqId = 0;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; onProgress?: (p: SamLoadProgress) => void }>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./samWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { id, type, payload } = e.data;
    const p = pending.get(id);
    if (!p) return;
    if (type === 'progress') { p.onProgress?.(payload); return; }
    pending.delete(id);
    if (type === 'error') p.reject(new Error(payload.message));
    else p.resolve(payload);
  };
  worker.onerror = (err) => {
    // Reject everything in flight so callers can fall back to classical.
    for (const [, p] of pending) p.reject(new Error(err.message || 'SAM worker failed'));
    pending.clear();
  };
  return worker;
}

function request<T>(type: string, payload: unknown, onProgress?: (p: SamLoadProgress) => void): Promise<T> {
  const w = ensureWorker();
  return new Promise<T>((resolve, reject) => {
    const id = `${type}-${++reqId}`;
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ id, type, payload });
  });
}

/** Whether SAM has been used/loaded this session (for UI hints). */
let everLoaded = false;
export function samEverLoaded(): boolean { return everLoaded; }

/** Pre-load the model (optional — segmentation lazy-loads anyway). */
export async function samPreload(onProgress?: (p: SamLoadProgress) => void): Promise<void> {
  await request('load', {}, onProgress);
  everLoaded = true;
}

/**
 * Segment one tool from a click point using SlimSAM, then extract a precise
 * contour. The first call downloads the model (reports via onProgress) and
 * embeds the image; subsequent clicks on the same image are fast.
 */
export async function samSegmentPoint(
  imageUrl: string,
  clicksOrX: { x: number; y: number; label: number }[] | number,
  y?: number | ((p: SamLoadProgress) => void),
  onProgress?: (p: SamLoadProgress) => void,
  paperCorners?: PaperCorners,
): Promise<ToolTracingResult | null> {
  let clicks: { x: number; y: number; label: number }[];
  let progressCb = onProgress;

  if (Array.isArray(clicksOrX)) {
    clicks = clicksOrX;
    // When array is passed, onProgress is the 3rd argument (mapped to y)
    if (typeof y === 'function') {
      progressCb = y as any;
    }
  } else {
    clicks = [{ x: clicksOrX, y: y as number, label: 1 }];
  }

  const seg = await request<{ mask: ArrayBuffer; width: number; height: number; score: number; scale: number } | null>(
    'segmentPoint',
    { url: imageUrl, clicks, paperCorners },
    progressCb,
  );
  everLoaded = true;
  if (!seg) return null;
  // Hand the mask to OpenCV for the clean contour, then map back to original space.
  const contour = await contourFromMask(seg.mask, seg.width, seg.height);
  return scaleResult(contour, seg.scale);
}

/**
 * Autonomous detection: classical proposes prompts (located tools + sparse
 * grid over uncovered metal) → SlimSAM segments each → containment-NMS →
 * precise contours. Returns one ToolTracingResult per tool.
 */
export async function samAutoSegment(
  imageUrl: string,
  paperCorners?: PaperCorners,
  onProgress?: (p: SamLoadProgress) => void,
): Promise<ToolTracingResult[]> {
  // Stage 1 — classical prompt proposal (instant, free).
  const { blobs, grid } = await proposeRegions(imageUrl, paperCorners);
  const points = [...blobs, ...grid];
  if (points.length === 0) return [];

  // Stage 2+3 — SAM batch decode + filter + containment-NMS (in the worker).
  const res = await request<{ masks: { mask: ArrayBuffer; width: number; height: number; score: number }[]; scale: number }>(
    'autoSegment',
    { url: imageUrl, points, paperCorners },
    onProgress,
  );
  everLoaded = true;

  // Stage 4 — each survivor mask → precise contour → original space.
  const out: ToolTracingResult[] = [];
  for (const m of res.masks) {
    const contour = await contourFromMask(m.mask, m.width, m.height);
    const scaled = scaleResult(contour, res.scale);
    if (scaled && scaled.points.length >= 3) {
      out.push({ ...scaled, confidence: m.score });
    }
  }
  return out;
}

/** Drop the cached image embedding (e.g. when the image changes). */
export async function samClear(): Promise<void> {
  if (!worker) return;
  try { await request('clear', {}); } catch { /* ignore */ }
}
