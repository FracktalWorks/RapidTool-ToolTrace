/**
 * Post-build strip for Cloudflare (Pages/Workers cap assets at 25 MB/file).
 * Removes only the bundled onnxruntime-web wasm (loaded from jsDelivr at runtime
 * via ort wasmPaths, so the ~26MB bundled copy is dead weight and over the cap).
 * The SOD model ships as <25MB .partN chunks (kept) — see sodWorker.loadModelBuffer.
 * Cross-platform (Node) so it works on Windows + the Cloudflare Linux builder.
 */
import { rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const assets = 'dist/assets';
let removed = [];
if (existsSync(assets)) {
  for (const f of readdirSync(assets)) {
    if (f.startsWith('ort-wasm-') && f.endsWith('.wasm')) {
      rmSync(join(assets, f), { force: true });
      removed.push(`dist/assets/${f}`);
    }
  }
}
console.log('[strip-deploy] removed:', removed.join(', '));
