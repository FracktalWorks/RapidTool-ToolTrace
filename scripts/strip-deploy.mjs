/**
 * Post-build strip for Cloudflare (Pages/Workers cap assets at 25 MB/file).
 * Removes files that exceed the cap AND are loaded from a CDN/R2 at runtime:
 *   - dist/models/*            (46MB SOD model → Cloudflare R2, via VITE_MODEL_URL)
 *   - dist/assets/ort-wasm-*   (onnxruntime-web wasm → jsDelivr, via ort wasmPaths)
 * Cross-platform (Node) so it works on Windows + the Cloudflare Linux builder.
 */
import { rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

rmSync('dist/models', { recursive: true, force: true });

const assets = 'dist/assets';
let removed = ['dist/models'];
if (existsSync(assets)) {
  for (const f of readdirSync(assets)) {
    if (f.startsWith('ort-wasm-') && f.endsWith('.wasm')) {
      rmSync(join(assets, f), { force: true });
      removed.push(`dist/assets/${f}`);
    }
  }
}
console.log('[strip-deploy] removed:', removed.join(', '));
