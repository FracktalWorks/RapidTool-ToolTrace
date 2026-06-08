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
const MAX_DIM = 1600;

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
      // Notify main thread definitively which model loaded
      post({ id, type: 'progress', payload: { status: 'model_loaded', model: `SAM 2.1 Hiera Tiny`, device, isSam2: true } });
    } catch (sam2Err) {
      console.warn('%c[SAM] LOUD LOG: Failed to load SAM 2.1! Falling back to SlimSAM...', 'color: #f59e0b; font-weight: bold; font-size: 12px;', sam2Err);
      console.warn('[SAM] SAM2 load error details:', String(sam2Err));
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
      // Notify main thread definitively which model loaded
      post({ id, type: 'progress', payload: { status: 'model_loaded', model: `SlimSAM (FALLBACK)`, device, isSam2: false } });
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
  labels: number[],
  paperCorners?: any
): Promise<{ data: Uint8Array; width: number; height: number; score: number } | null> {
  if (!session) return null;

  let promptInputs: any;
  let outputs: any;
  let masks: any;

  if (isSam2) {
    const finalPoints = [...points];
    const finalLabels = [...labels];

    // Only add default negative points if the user has not placed any negative clicks
    const hasNegative = labels.includes(0);
    if (!hasNegative) {
      // Always add 4 image corners as background points
      const W = session.image.width;
      const H = session.image.height;
      const margin = 2;
      finalPoints.push(
        [margin, margin],
        [W - 1 - margin, margin],
        [W - 1 - margin, H - 1 - margin],
        [margin, H - 1 - margin]
      );
      finalLabels.push(0, 0, 0, 0);

      // Also add paper corners if available
      if (paperCorners) {
        const corners = [paperCorners.topLeft, paperCorners.topRight, paperCorners.bottomRight, paperCorners.bottomLeft];
        for (const c of corners) {
          finalPoints.push([c.x * session.procScale, c.y * session.procScale]);
          finalLabels.push(0);
        }
      }
    }

    promptInputs = await processor(session.image, {
      input_points: [finalPoints],
      input_labels: [finalLabels]
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
  const md = mt.data as Uint8Array;
  
  // Select the mask that has the largest area among candidates with high scores.
  // This avoids picking a "part-only" mask (which often has a slightly higher IoU prediction)
  // in favor of the "whole-object" mask.
  // Compute areas for all candidate masks
  const maskAreas = new Int32Array(nMasks);
  for (let maskIdx = 0; maskIdx < nMasks; maskIdx++) {
    let area = 0;
    const off = maskIdx * H * W;
    for (let p = 0; p < H * W; p++) {
      if (md[off + p]) area++;
    }
    maskAreas[maskIdx] = area;
  }

  // Find the index of the highest scoring mask
  let highestScoreIdx = 0;
  let maxScore = scores[0];
  for (let i = 1; i < nMasks; i++) {
    if (scores[i] > maxScore) {
      maxScore = scores[i];
      highestScoreIdx = i;
    }
  }

  // Restructured Whole-Object Heuristic:
  // If there is any mask that is significantly larger (>= 1.25x the area of the highest-scoring mask)
  // and has a score >= 0.55 (representing the whole object which often gets lower predicted IoU),
  // we select that larger mask.
  let best = highestScoreIdx;
  let bestArea = maskAreas[highestScoreIdx];

  for (let i = 0; i < nMasks; i++) {
    if (maskAreas[i] > bestArea * 1.25 && scores[i] >= 0.55) {
      best = i;
      bestArea = maskAreas[i];
    }
  }

  // Fallback to original selection logic if no significantly larger mask with score >= 0.55 is found
  if (best === highestScoreIdx) {
    const thresholdScore = Math.max(0.65, maxScore * 0.85);
    let maxArea = -1;
    for (let i = 0; i < nMasks; i++) {
      if (scores[i] >= thresholdScore) {
        if (maskAreas[i] > maxArea) {
          maxArea = maskAreas[i];
          best = i;
        }
      }
    }
  }

  const off = best * H * W;
  const out = new Uint8Array(H * W);
  for (let i = 0; i < H * W; i++) out[i] = md[off + i] ? 255 : 0;

  return { data: out, width: W, height: H, score: scores[best] };
}

// Interactive: decode a mask for clicks (ORIGINAL image coords).
async function segmentPoint(
  id: string,
  url: string,
  clicks: { x: number; y: number; label: number }[],
  paperCorners?: any
): Promise<{ mask: ArrayBuffer; width: number; height: number; score: number; scale: number } | null> {
  await embed(id, url);
  if (!session) return null;

  const pts = clicks.map(c => [c.x * session!.procScale, c.y * session!.procScale] as [number, number]);
  const labels = clicks.map(c => c.label);

  const r = await decodeAt(pts, labels, paperCorners);
  if (!r) return null;

  // VALIDITY GATE (area): clicking blank paper makes SAM segment the whole
  // sheet/background. A real tool is a bounded fraction of the frame. Reject
  // paper-sized (>20%) and noise (<0.05%) masks so an empty-paper click yields
  // nothing instead of a giant outline.
  let area = 0;
  for (let i = 0; i < r.data.length; i++) if (r.data[i]) area++;
  const procArea = r.width * r.height;
  if (area < procArea * 0.0005 || area > procArea * 0.20) {
    console.log(`[SAM] click rejected — mask ${(100 * area / procArea).toFixed(1)}% of frame (not tool-sized)`);
    return null;
  }

  return { mask: r.data.buffer as ArrayBuffer, width: r.width, height: r.height, score: r.score, scale: session.scaleToOriginal };
}

interface ToolProposal {
  positivePoints: { x: number; y: number }[];
  negativePoints: { x: number; y: number }[];
  bbox: { x: number; y: number; w: number; h: number };
  sourceArea: number;
}

// Autonomous: decode every proposal using multi-point positive/negative prompts,
// filter to tool-like masks, and return survivor masks at processing resolution.
async function autoSegment(
  id: string,
  url: string,
  proposals: ToolProposal[],
  paperCorners?: any
): Promise<{ masks: { mask: ArrayBuffer; width: number; height: number; score: number }[]; scale: number }> {
  await embed(id, url);
  if (!session) return { masks: [], scale: 1 };

  const W0 = session.image.width, H0 = session.image.height;
  const origArea = (W0 * session.scaleToOriginal) * (H0 * session.scaleToOriginal);
  const minArea = origArea * 0.0008;
  const maxArea = origArea * 0.25;

  const results: { mask: ArrayBuffer; width: number; height: number; score: number }[] = [];

  for (let i = 0; i < proposals.length; i++) {
    post({ id, type: 'progress', payload: { status: 'segment', progress: Math.round((i / proposals.length) * 100) } });
    
    const prop = proposals[i];
    const pts: [number, number][] = [];
    const labels: number[] = [];

    for (const p of prop.positivePoints) {
      pts.push([p.x * session.procScale, p.y * session.procScale]);
      labels.push(1);
    }
    for (const p of prop.negativePoints) {
      pts.push([p.x * session.procScale, p.y * session.procScale]);
      labels.push(0);
    }

    if (pts.length === 0) continue;

    console.log(`[SAM] decoding proposal ${i}: points=${pts.length} (positives=${prop.positivePoints.length}, negatives=${prop.negativePoints.length})`);

    // Decode this proposal in a single pass with all positive + negative points
    const r = await decodeAt(pts, labels, paperCorners);
    if (!r || r.score < 0.6) continue;

    // Validate size to avoid background bleed
    let maskArea = 0;
    for (let p = 0; p < r.data.length; p++) {
      if (r.data[p]) maskArea++;
    }
    const actualArea = maskArea * session.scaleToOriginal * session.scaleToOriginal;
    if (actualArea < minArea || actualArea > maxArea) {
      console.log(`[SAM] proposal ${i} rejected — area ${Math.round(actualArea)}px² outside [${Math.round(minArea)}, ${Math.round(maxArea)}]`);
      continue;
    }

    results.push({
      mask: r.data.buffer as ArrayBuffer,
      width: r.width,
      height: r.height,
      score: r.score
    });
  }

  // Sort masks by score descending
  results.sort((a, b) => b.score - a.score);

  // Helper to compute IoU and Containment ratio between two masks
  function computeOverlap(
    maskA: Uint8Array,
    maskB: Uint8Array
  ): { iou: number; containmentA: number; containmentB: number } {
    let intersection = 0;
    let areaA = 0;
    let areaB = 0;
    const len = maskA.length;
    for (let i = 0; i < len; i++) {
      const a = maskA[i] > 0;
      const b = maskB[i] > 0;
      if (a) areaA++;
      if (b) areaB++;
      if (a && b) intersection++;
    }
    const union = areaA + areaB - intersection;
    return {
      iou: union > 0 ? intersection / union : 0,
      containmentA: areaA > 0 ? intersection / areaA : 0,
      containmentB: areaB > 0 ? intersection / areaB : 0,
    };
  }

  // Non-Maximum Suppression (NMS)
  const finalResults: typeof results = [];
  const IOU_THRESHOLD = 0.5;
  const CONTAINMENT_THRESHOLD = 0.75;

  for (const res of results) {
    const maskData = new Uint8Array(res.mask);
    let keep = true;

    for (const kept of finalResults) {
      const keptMaskData = new Uint8Array(kept.mask);
      const { iou, containmentA, containmentB } = computeOverlap(keptMaskData, maskData);

      // If overlapping or containment is too high, suppress the lower-scoring mask
      if (iou > IOU_THRESHOLD || containmentB > CONTAINMENT_THRESHOLD || containmentA > CONTAINMENT_THRESHOLD) {
        keep = false;
        console.log(`[SAM] NMS suppressed proposal: score=${res.score.toFixed(3)} due to overlap with score=${kept.score.toFixed(3)} (iou=${iou.toFixed(3)}, contA=${containmentA.toFixed(3)}, contB=${containmentB.toFixed(3)})`);
        break;
      }
    }

    if (keep) {
      finalResults.push(res);
    }
  }

  console.log(`[SAM] NMS complete: kept ${finalResults.length} / ${results.length} proposals`);
  return { masks: finalResults, scale: session.scaleToOriginal };
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
        const r = await segmentPoint(id, payload.url, clicks, payload.paperCorners);
        if (r) { post({ id, type: 'success', payload: r }, [r.mask]); return; }
        result = null;
        break;
      }
      case 'autoSegment': {
        const r = await autoSegment(id, payload.url, payload.proposals, payload.paperCorners);
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
