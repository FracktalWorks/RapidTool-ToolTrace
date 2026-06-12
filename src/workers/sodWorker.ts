/// <reference lib="webworker" />
/**
 * Salient Object Detection worker.
 *
 * Runs IS-Net (DIS general-use, q8, Apache-2.0) via onnxruntime-web — WebGPU when
 * available, WASM fallback — to produce a clean binary foreground mask of the
 * tools. This trained model replaces the hand-crafted Lab-threshold mask: it
 * solves chrome, shadows and tool separation at the mask level (validated on real
 * photos). It MUST run on the paper-cropped image so the tools are the salient
 * objects rather than the sheet itself.
 *
 * Pre/post-processing mirrors the validated reference exactly:
 *   in  : resize to 1024², normalise (x/255 − 0.5), CHW float32
 *   out : first output (1×1×1024²) → min-max normalise → resize to crop → threshold
 */
import * as ort from 'onnxruntime-web';

// onnxruntime-web loads its wasm-glue (.mjs) via a runtime import(). Vite refuses
// to serve .mjs modules out of /public, so we load the ORT runtime from jsDelivr
// at the EXACT version bundled here (the JS glue must match the .wasm binary).
// jsDelivr is CORS-enabled with correct MIME, so it bypasses Vite's resolver.
// (Self-hosting later needs a Vite static-copy plugin serving from /assets, not /public.)
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/';
// MULTI-THREADED WASM is the fast, RELIABLE path for the int8 model:
//   • WebGPU fp16 needs the optional `shader-f16` GPU feature — absent on many GPUs
//     (this user's included) → fp16 shaders fail to compile.
//   • q8 on WebGPU shoves quantize/dequantize ops to CPU every layer (the 1.5–2 min
//     stall). int8 is happiest on CPU/WASM.
// SIMD + N threads runs q8 in ~10–15 s. Needs cross-origin isolation (COOP/COEP,
// set in vite.config); if absent, ORT silently drops to 1 thread (~60 s) — still works.
ort.env.wasm.numThreads = Math.min((self.navigator?.hardwareConcurrency || 4), 8);

// Local dev serves the 46MB model from /public; production hosts it externally
// (Cloudflare R2 / CDN) because Cloudflare Pages caps files at 25MB. Override with
// VITE_MODEL_URL (must send CORS so it loads under COEP credentialless).
const MODEL_URL = import.meta.env.VITE_MODEL_URL || '/models/isnet_q8.onnx';
const SIZE = 1024;
// Mask threshold on the 0–255 normalised saliency. Lowering it to 0.31 to recover
// faint bright chrome (caliper jaws) backfired — it didn't recover them (they read
// below 0.31) but DID pick up faint pencil marks as false-positive blobs. Back to
// 0.5: clean masks. Bright chrome jaws are the residual case → one-click SAM refine.
const MASK_THRESHOLD = 127;

let session: ort.InferenceSession | null = null;
let device = 'wasm';

interface WorkerMsg { id: string; type: 'load' | 'segment'; payload: { rgbaData?: Uint8ClampedArray; width?: number; height?: number } }

function post(msg: unknown, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(msg, transfer);
}

// Guard init so concurrent requests (e.g. React StrictMode double-firing the
// effect) don't create two sessions / run the warm-up twice — onnxruntime
// sessions are not re-entrant ("Session already started").
let initPromise: Promise<void> | null = null;
function ensureSession(id: string): Promise<void> {
  if (!initPromise) initPromise = initSession(id);
  return initPromise;
}

async function initSession(id: string): Promise<void> {
  if (session) return;
  // WASM (SIMD + threads) only — see the wasmPaths note: WebGPU is a dead-end for
  // this int8 model on common GPUs. No warm-up needed (WASM has no shader compile).
  const threads = ort.env.wasm.numThreads;
  session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
  // crossOriginIsolated tells us whether SharedArrayBuffer (multi-thread) is live.
  const isolated = typeof self !== 'undefined' && (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated;
  device = isolated && threads > 1 ? `wasm×${threads}` : 'wasm (1 thread)';
  console.log(`%c🧠 SOD MODEL LOADED: IS-Net q8 (${device})`, 'color:#22c55e;font-weight:bold');
  post({ id, type: 'progress', payload: { status: 'model_loaded', device } });
}

async function segment(rgba: Uint8ClampedArray, width: number, height: number) {
  // 1. Resize the cropped image to 1024² (bilinear via OffscreenCanvas).
  const src = new OffscreenCanvas(width, height);
  src.getContext('2d')!.putImageData(new ImageData(rgba, width, height), 0, 0);
  const dst = new OffscreenCanvas(SIZE, SIZE);
  const dctx = dst.getContext('2d')!;
  dctx.drawImage(src, 0, 0, SIZE, SIZE);
  const resized = dctx.getImageData(0, 0, SIZE, SIZE).data;

  // 2. CHW float32, IS-Net normalisation: x/255 − 0.5.
  const plane = SIZE * SIZE;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i]             = resized[i * 4]     / 255 - 0.5;
    input[plane + i]     = resized[i * 4 + 1] / 255 - 0.5;
    input[2 * plane + i] = resized[i * 4 + 2] / 255 - 0.5;
  }
  const tensor = new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]);

  // 3. Inference (first input/output by name — robust to model naming).
  const feeds: Record<string, ort.Tensor> = {};
  feeds[session!.inputNames[0]] = tensor;
  const outputs = await session!.run(feeds);
  const sal = outputs[session!.outputNames[0]].data as Float32Array;

  // 4. Min-max normalise → grayscale → resize to crop size → threshold.
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < plane; i++) { const v = sal[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const range = mx - mn || 1;
  const mcanvas = new OffscreenCanvas(SIZE, SIZE);
  const mctx = mcanvas.getContext('2d')!;
  const mimg = mctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < plane; i++) {
    const v = ((sal[i] - mn) / range) * 255;
    mimg.data[i * 4] = v; mimg.data[i * 4 + 1] = v; mimg.data[i * 4 + 2] = v; mimg.data[i * 4 + 3] = 255;
  }
  mctx.putImageData(mimg, 0, 0);

  const fcanvas = new OffscreenCanvas(width, height);
  const fctx = fcanvas.getContext('2d')!;
  fctx.drawImage(mcanvas, 0, 0, width, height);
  const fdata = fctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) mask[i] = fdata[i * 4] > MASK_THRESHOLD ? 255 : 0;

  return { mask: mask.buffer, width, height, device };
}

async function handleMessage(e: MessageEvent<WorkerMsg>): Promise<void> {
  const { id, type, payload } = e.data;
  try {
    await ensureSession(id);
    if (type === 'load') { post({ id, type: 'success', payload: { ready: true, device } }); return; }
    const r = await segment(payload.rgbaData!, payload.width!, payload.height!);
    post({ id, type: 'success', payload: r }, [r.mask]);
  } catch (err) {
    post({ id, type: 'error', payload: { message: err instanceof Error ? err.message : String(err) } });
  }
}

// Serialize all messages — an ORT session can run only one inference at a time,
// so overlapping 'segment' calls would collide. The chain runs them in order.
let chain: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent<WorkerMsg>) => {
  chain = chain.then(() => handleMessage(e));
};
