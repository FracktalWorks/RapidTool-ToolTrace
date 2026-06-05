/**
 * SAM Worker — in-browser Segment Anything (SlimSAM) via transformers.js.
 *
 * Runs 100% on the user's device (no server, no API, no key). The heavy image
 * encoder runs ONCE per image; each click then decodes a precise mask in ~ms.
 * The model is lazy-loaded on first use and cached by the browser thereafter.
 *
 * Pipeline role: VISION (which pixels are the tool). The returned mask is handed
 * to the existing OpenCV contour + geometry pipeline for the precise CAD edge.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  env,
  SamModel,
  AutoProcessor,
  RawImage,
} from '@huggingface/transformers';

// Fetch weights from the HF Hub (no local model files bundled).
env.allowLocalModels = false;
// Single-threaded WASM avoids cross-origin-isolation (COOP/COEP) requirements.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

const MODEL_ID = 'Xenova/slimsam-77-uniform';

interface WorkerMessage { id: string; type: 'load' | 'embed' | 'segmentPoint' | 'autoSegment' | 'clear'; payload: any }
interface WorkerResponse { id: string; type: 'success' | 'error' | 'progress'; payload: any }

// Process at a capped resolution for speed + smaller masks; contours are scaled
// back to the original image space by `scaleToOriginal`.
const MAX_DIM = 1024;

let model: any = null;
let processor: any = null;
let loadPromise: Promise<void> | null = null;

// Per-image session — embeddings are reused across all prompts on the image.
let session: {
  url: string;
  image: any;            // downscaled RawImage actually fed to SAM
  procScale: number;     // original → processing  (mult input points by this)
  scaleToOriginal: number; // processing → original (mult output contour by this)
  imageEmbeddings: any;
  imagePositionalEmbeddings: any;
  originalSizes: any;
  reshapedInputSizes: any;
} | null = null;

function post(msg: WorkerResponse, transfer?: Transferable[]) {
  (self as any).postMessage(msg, transfer || []);
}

async function ensureLoaded(id: string): Promise<void> {
  if (model && processor) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const device = (self as any).navigator?.gpu ? 'webgpu' : 'wasm';
    const progress_callback = (p: any) => {
      // Forward download/init progress for the first-load UI.
      if (p && (p.status === 'progress' || p.status === 'done' || p.status === 'ready')) {
        post({ id, type: 'progress', payload: { status: p.status, file: p.file, progress: p.progress ?? 0 } });
      }
    };
    // Quantized (q8) keeps the download small; fall back to default dtype if needed.
    try {
      model = await SamModel.from_pretrained(MODEL_ID, { dtype: 'q8', device, progress_callback } as any);
    } catch {
      model = await SamModel.from_pretrained(MODEL_ID, { progress_callback } as any);
    }
    processor = await AutoProcessor.from_pretrained(MODEL_ID);
  })();

  return loadPromise;
}

// Compute the image embedding once (the expensive encoder pass).
async function embed(id: string, url: string): Promise<void> {
  await ensureLoaded(id);
  if (session && session.url === url) return; // already embedded this image

  let image = await RawImage.read(url);
  const origW = image.width, origH = image.height;
  const procScale = Math.min(1, MAX_DIM / Math.max(origW, origH));
  if (procScale < 1) {
    image = await image.resize(Math.round(origW * procScale), Math.round(origH * procScale));
  }
  const scaleToOriginal = origW / image.width;

  const inputs = await processor(image);
  const { image_embeddings, image_positional_embeddings } = await model.get_image_embeddings(inputs);
  session = {
    url,
    image,
    procScale,
    scaleToOriginal,
    imageEmbeddings: image_embeddings,
    imagePositionalEmbeddings: image_positional_embeddings,
    originalSizes: inputs.original_sizes,
    reshapedInputSizes: inputs.reshaped_input_sizes,
  };
}

// Decode the best mask for one foreground point (in PROCESSING coords). Returns
// the raw mask buffer + its IoU score, or null. Shared by interactive + auto.
async function decodeAt(px: number, py: number): Promise<{ data: Uint8Array; width: number; height: number; score: number } | null> {
  if (!session) return null;
  const promptInputs = await processor(session.image, { input_points: [[[px, py]]], input_labels: [[1]] });
  const outputs = await model({
    image_embeddings: session.imageEmbeddings,
    image_positional_embeddings: session.imagePositionalEmbeddings,
    input_points: promptInputs.input_points,
    input_labels: promptInputs.input_labels,
  });
  const masks = await processor.post_process_masks(outputs.pred_masks, session.originalSizes, session.reshapedInputSizes);
  const mt = masks[0];
  const nMasks = mt.dims[1], H = mt.dims[2], W = mt.dims[3];
  const scores = outputs.iou_scores.data as Float32Array;
  let best = 0;
  for (let i = 1; i < nMasks; i++) if (scores[i] > scores[best]) best = i;
  const md = mt.data as Uint8Array;
  const off = best * H * W;
  const out = new Uint8Array(H * W);
  for (let i = 0; i < H * W; i++) out[i] = md[off + i] ? 255 : 0;
  return { data: out, width: W, height: H, score: scores[best] };
}

// Interactive: decode a mask for a single click (ORIGINAL image coords).
async function segmentPoint(id: string, url: string, x: number, y: number): Promise<{ mask: ArrayBuffer; width: number; height: number; score: number; scale: number } | null> {
  await embed(id, url);
  if (!session) return null;
  const r = await decodeAt(x * session.procScale, y * session.procScale);
  if (!r) return null;
  return { mask: r.data.buffer as ArrayBuffer, width: r.width, height: r.height, score: r.score, scale: session.scaleToOriginal };
}

// 64×64 thumbnail of a mask for cheap overlap/containment tests during NMS.
function thumb64(mask: Uint8Array, W: number, H: number): { t: Uint8Array; area: number } {
  const t = new Uint8Array(64 * 64);
  let area = 0;
  for (let ty = 0; ty < 64; ty++) {
    const sy = Math.min(H - 1, (ty * H / 64) | 0);
    for (let tx = 0; tx < 64; tx++) {
      const sx = Math.min(W - 1, (tx * W / 64) | 0);
      if (mask[sy * W + sx]) { t[ty * 64 + tx] = 1; area++; }
    }
  }
  return { t, area };
}

// Autonomous: decode every prompt, filter to tool-like masks, then drop
// duplicates / sub-parts via containment-aware NMS. Returns survivor masks
// (largest first) at processing resolution + the scale back to original.
async function autoSegment(id: string, url: string, points: { x: number; y: number }[]): Promise<{ masks: { mask: ArrayBuffer; width: number; height: number; score: number }[]; scale: number }> {
  await embed(id, url);
  if (!session) return { masks: [], scale: 1 };

  const W0 = session.image.width, H0 = session.image.height;
  const procArea = W0 * H0;
  const minArea = procArea * 0.0008;
  const maxArea = procArea * 0.5;

  type Cand = { data: Uint8Array; W: number; H: number; score: number; area: number; thumb: Uint8Array; thumbArea: number };
  const cands: Cand[] = [];

  for (let i = 0; i < points.length; i++) {
    post({ id, type: 'progress', payload: { status: 'segment', progress: Math.round((i / points.length) * 100) } });
    const r = await decodeAt(points[i].x * session.procScale, points[i].y * session.procScale);
    if (!r || r.score < 0.7) continue;
    let area = 0;
    for (let p = 0; p < r.data.length; p++) if (r.data[p]) area++;
    if (area < minArea || area > maxArea) continue;
    const th = thumb64(r.data, r.width, r.height);
    cands.push({ data: r.data, W: r.width, H: r.height, score: r.score, area, thumb: th.t, thumbArea: th.area });
  }

  // Containment-aware NMS: keep largest; drop anything mostly inside a kept mask.
  cands.sort((a, b) => b.area - a.area);
  const kept: Cand[] = [];
  for (const c of cands) {
    let covered = false;
    for (const k of kept) {
      let inter = 0;
      for (let p = 0; p < 4096; p++) if (c.thumb[p] && k.thumb[p]) inter++;
      if (c.thumbArea > 0 && inter / c.thumbArea > 0.6) { covered = true; break; }
    }
    if (!covered) kept.push(c);
  }

  const masks = kept.map((k) => ({ mask: k.data.buffer as ArrayBuffer, width: k.W, height: k.H, score: k.score }));
  return { masks, scale: session.scaleToOriginal };
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = e.data;
  try {
    let result: any;
    switch (type) {
      case 'load':
        await ensureLoaded(id);
        result = { ready: true };
        break;
      case 'embed':
        await embed(id, payload.url);
        result = { embedded: true };
        break;
      case 'segmentPoint': {
        const r = await segmentPoint(id, payload.url, payload.x, payload.y);
        if (r) { post({ id, type: 'success', payload: r }, [r.mask]); return; }
        result = null;
        break;
      }
      case 'autoSegment': {
        const r = await autoSegment(id, payload.url, payload.points);
        post({ id, type: 'success', payload: r }, r.masks.map((m) => m.mask));
        return;
      }
      case 'clear':
        session = null;
        result = { cleared: true };
        break;
      default:
        throw new Error(`Unknown SAM message type: ${type}`);
    }
    post({ id, type: 'success', payload: result });
  } catch (err) {
    post({ id, type: 'error', payload: { message: err instanceof Error ? err.message : 'SAM error' } });
  }
};

export {};
