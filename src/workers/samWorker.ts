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
  Sam2Model,
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

const MODEL_ID = 'onnx-community/sam2.1-hiera-tiny-ONNX';

interface WorkerMessage { id: string; type: 'load' | 'embed' | 'segmentPoint' | 'autoSegment' | 'clear'; payload: any }
interface WorkerResponse { id: string; type: 'success' | 'error' | 'progress'; payload: any }

// Process at a capped resolution for speed + smaller masks; contours are scaled
// back to the original image space by `scaleToOriginal`.
const MAX_DIM = 1024;

let model: any = null;
let processor: any = null;
let loadPromise: Promise<void> | null = null;
let isSam2 = true;

// Per-image session — embeddings are reused across all prompts on the image.
let session: {
  url: string;
  image: any;            // downscaled RawImage actually fed to SAM
  procScale: number;     // original → processing  (mult input points by this)
  scaleToOriginal: number; // processing → original (mult output contour by this)
  embeddings: any;
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
    
    try {
      // Try to load SAM 2.1 Hiera Tiny
      console.log(`%c[SAM] Attempting to load SAM 2.1 Tiny (${device})...`, 'color: #3b82f6; font-weight: bold;');
      model = await Sam2Model.from_pretrained(MODEL_ID, { device, progress_callback } as any);
      processor = await AutoProcessor.from_pretrained(MODEL_ID);
      isSam2 = true;
      console.log('%c===================================================', 'color: #22c55e; font-weight: bold;');
      console.log(`%c[SAM] LOUD LOG: SUCCESSFULLY LOADED SAM 2.1 Tiny (${device})`, 'color: #22c55e; font-weight: bold; font-size: 14px;');
      console.log('%c===================================================', 'color: #22c55e; font-weight: bold;');
    } catch (sam2Err) {
      console.warn('%c[SAM] LOUD LOG: Failed to load SAM 2.1! Falling back to SlimSAM...', 'color: #f59e0b; font-weight: bold; font-size: 12px;', sam2Err);
      const SLIMSAM_MODEL_ID = 'Xenova/slimsam-77-uniform';
      try {
        model = await SamModel.from_pretrained(SLIMSAM_MODEL_ID, { dtype: 'q8', device, progress_callback } as any);
      } catch {
        model = await SamModel.from_pretrained(SLIMSAM_MODEL_ID, { progress_callback } as any);
      }
      processor = await AutoProcessor.from_pretrained(SLIMSAM_MODEL_ID);
      isSam2 = false;
      console.log('%c===================================================', 'color: #3b82f6; font-weight: bold;');
      console.log(`%c[SAM] LOUD LOG: SUCCESSFULLY LOADED SLIMSAM FALLBACK (${device})`, 'color: #3b82f6; font-weight: bold; font-size: 12px;');
      console.log('%c===================================================', 'color: #3b82f6; font-weight: bold;');
    }
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
  let embeddings: any;
  if (isSam2) {
    embeddings = await model.get_image_embeddings(inputs);
  } else {
    const { image_embeddings, image_positional_embeddings } = await model.get_image_embeddings(inputs);
    embeddings = { image_embeddings, image_positional_embeddings };
  }

  session = {
    url,
    image,
    procScale,
    scaleToOriginal,
    embeddings,
    originalSizes: inputs.original_sizes,
    reshapedInputSizes: inputs.reshaped_input_sizes,
  };
}

// Decode the best mask for point prompts (in PROCESSING coords). Returns
// the raw mask buffer + its IoU score, or null. Shared by interactive + auto.
async function decodeAt(
  points: [number, number][],
  labels: number[]
): Promise<{ data: Uint8Array; width: number; height: number; score: number } | null> {
  if (!session) return null;

  let promptInputs: any;
  let outputs: any;
  let masks: any;

  if (isSam2) {
    promptInputs = await processor(session.image, {
      input_points: [points],
      input_labels: [labels]
    });

    const inputs = {
      ...session.embeddings,
      ...promptInputs
    };
    delete inputs.pixel_values;

    outputs = await model(inputs);
    masks = await processor.post_process_masks(
      outputs.pred_masks,
      session.originalSizes,
      session.reshapedInputSizes
    );
  } else {
    // SlimSAM path: take the first point (as it doesn't support multiple points easily in this layout)
    const px = points[0][0];
    const py = points[0][1];
    promptInputs = await processor(session.image, { input_points: [[[px, py]]], input_labels: [[1]] });
    outputs = await model({
      image_embeddings: session.embeddings.image_embeddings,
      image_positional_embeddings: session.embeddings.image_positional_embeddings,
      input_points: promptInputs.input_points,
      input_labels: promptInputs.input_labels,
    });
    masks = await processor.post_process_masks(outputs.pred_masks, session.originalSizes, session.reshapedInputSizes);
  }

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

// Interactive: decode a mask for clicks (ORIGINAL image coords).
async function segmentPoint(
  id: string,
  url: string,
  clicks: { x: number; y: number; label: number }[]
): Promise<{ mask: ArrayBuffer; width: number; height: number; score: number; scale: number } | null> {
  await embed(id, url);
  if (!session) return null;

  const pts = clicks.map(c => [c.x * session!.procScale, c.y * session!.procScale] as [number, number]);
  const labels = clicks.map(c => c.label);

  const r = await decodeAt(pts, labels);
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

// Flood-fill to fill internal holes in a 64x64 binary thumbnail
function fillHoles64(thumb: Uint8Array): Uint8Array {
  const filled = new Uint8Array(thumb);
  const visited = new Uint8Array(64 * 64);
  const queue: number[] = [];

  // Add all border pixels that are 0 to the queue
  for (let x = 0; x < 64; x++) {
    // Top border
    if (filled[x] === 0) { queue.push(x); visited[x] = 1; }
    // Bottom border
    const botIdx = 63 * 64 + x;
    if (filled[botIdx] === 0) { queue.push(botIdx); visited[botIdx] = 1; }
  }
  for (let y = 1; y < 63; y++) {
    // Left border
    const leftIdx = y * 64;
    if (filled[leftIdx] === 0) { queue.push(leftIdx); visited[leftIdx] = 1; }
    // Right border
    const rightIdx = y * 64 + 63;
    if (filled[rightIdx] === 0) { queue.push(rightIdx); visited[rightIdx] = 1; }
  }

  // Flood-fill BFS to find all background pixels connected to the boundary
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % 64;
    const y = (idx / 64) | 0;

    const neighbors = [
      { nx: x - 1, ny: y },
      { nx: x + 1, ny: y },
      { nx: x, ny: y - 1 },
      { nx: x, ny: y + 1 }
    ];

    for (const { nx, ny } of neighbors) {
      if (nx >= 0 && nx < 64 && ny >= 0 && ny < 64) {
        const nIdx = ny * 64 + nx;
        if (filled[nIdx] === 0 && visited[nIdx] === 0) {
          visited[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }
  }

  // Any pixel not connected to the border (visited is 0) and initially 0 is an internal hole.
  // Fill it (set to 1).
  for (let i = 0; i < 4096; i++) {
    if (filled[i] === 0 && visited[i] === 0) {
      filled[i] = 1;
    }
  }

  return filled;
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
  const maxArea = procArea * 0.20; // Lowered from 0.5 to filter out large paper background masks

  type Cand = {
    data: Uint8Array;
    W: number;
    H: number;
    score: number;
    area: number;
    thumb: Uint8Array;
    thumbArea: number;
  };
  const cands: Cand[] = [];

  for (let i = 0; i < points.length; i++) {
    post({ id, type: 'progress', payload: { status: 'segment', progress: Math.round((i / points.length) * 100) } });
    const r = await decodeAt([[points[i].x * session.procScale, points[i].y * session.procScale]], [1]);
    if (!r || r.score < 0.7) continue;
    let area = 0;
    for (let p = 0; p < r.data.length; p++) if (r.data[p]) area++;
    if (area < minArea || area > maxArea) continue;
    const th = thumb64(r.data, r.width, r.height);
    cands.push({ data: r.data, W: r.width, H: r.height, score: r.score, area, thumb: th.t, thumbArea: th.area });
  }

  const n = cands.length;
  if (n === 0) return { masks: [], scale: session.scaleToOriginal };

  // Union-Find to group masks that overlap by at least 20% of the smaller mask's thumbnail area.
  // This merges sub-parts, overlapping frames/inserts, and split tool bodies (like jaw + body).
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  function find(i: number): number {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let curr = i;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  }

  function union(i: number, j: number) {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootI] = rootJ;
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const cA = cands[i];
      const cB = cands[j];
      let inter = 0;
      for (let p = 0; p < 4096; p++) {
        if (cA.thumb[p] && cB.thumb[p]) inter++;
      }
      
      // If the intersection is at least 20% of the smaller mask's thumbnail area,
      // group them as part of the same tool (e.g. caliper jaw + caliper body).
      const minOverlap = Math.min(cA.thumbArea, cB.thumbArea) * 0.20;
      if (inter > minOverlap) {
        union(i, j);
        continue;
      }

      // Check containment with hole-filling (handles hollow frames & inserts)
      const filledA = fillHoles64(cA.thumb);
      let bInA = true;
      for (let p = 0; p < 4096; p++) {
        if (cB.thumb[p] && !filledA[p]) {
          bInA = false;
          break;
        }
      }
      if (bInA) {
        union(i, j);
        continue;
      }

      const filledB = fillHoles64(cB.thumb);
      let aInB = true;
      for (let p = 0; p < 4096; p++) {
        if (cA.thumb[p] && !filledB[p]) {
          aInB = false;
          break;
        }
      }
      if (aInB) {
        union(i, j);
        continue;
      }
    }
  }

  // Group indices by root
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  // Merge each group into a single candidate
  const mergedCands: { data: Uint8Array; W: number; H: number; score: number; area: number }[] = [];
  for (const [_, indices] of groups.entries()) {
    const first = cands[indices[0]];
    const W = first.W, H = first.H;
    const mergedData = new Uint8Array(W * H);
    let maxScore = 0;

    // Pixel-wise OR of all masks in the group
    for (const idx of indices) {
      const c = cands[idx];
      maxScore = Math.max(maxScore, c.score);
      for (let p = 0; p < W * H; p++) {
        if (c.data[p]) mergedData[p] = 255;
      }
    }

    // Compute final area
    let finalArea = 0;
    for (let p = 0; p < W * H; p++) {
      if (mergedData[p]) finalArea++;
    }

    // Skip if merged area violates boundaries
    if (finalArea < minArea || finalArea > maxArea) continue;

    mergedCands.push({ data: mergedData, W, H, score: maxScore, area: finalArea });
  }

  // Sort merged candidates by area descending
  mergedCands.sort((a, b) => b.area - a.area);

  const masks = mergedCands.map((m) => ({ mask: m.data.buffer as ArrayBuffer, width: m.W, height: m.H, score: m.score }));
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
        const clicks = payload.clicks || [{ x: payload.x, y: payload.y, label: 1 }];
        const r = await segmentPoint(id, payload.url, clicks);
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
