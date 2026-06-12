import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
// Cross-origin isolation headers. These switch on `crossOriginIsolated`, which
// unlocks SharedArrayBuffer → multi-threaded onnxruntime-web (SOD runs in ~10–15s
// instead of ~60s single-thread). COEP `credentialless` still allows the jsDelivr
// ORT runtime + HuggingFace model CDNs (CORS) to load without CORP headers.
// NOTE: production hosting MUST send these same two headers for threads to engage.
const crossOriginIsolation = {
  name: 'cross-origin-isolation',
  configureServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      next();
    });
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    crossOriginIsolation,
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['opencv.js', 'opencv.wasm']
  },
  publicDir: 'public',
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
})
