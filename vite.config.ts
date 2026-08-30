import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Static build for GitHub Pages.
 *
 * `base` matters: the site is served from https://<user>.github.io/<repo>/,
 * so a default base of '/' emits absolute /assets/... URLs that 404 there.
 * It is driven by an env var so a fork under a different repository name, or
 * a custom domain, does not need a code change:
 *
 *   GITHUB_PAGES=1 npm run build          -> base '/Strudel-companion/'
 *   PAGES_BASE=/my-fork/ npm run build    -> base '/my-fork/'
 *   npm run build                         -> base '/'  (local preview, custom domain)
 *
 * The deploy workflow sets PAGES_BASE from the repository name automatically.
 */
export default defineConfig(() => {
  const base =
    process.env.PAGES_BASE ??
    (process.env.GITHUB_PAGES ? '/Strudel-companion/' : '/');

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      /*
       * Offline support.
       *
       * Precaches the app shell only. Model weights are deliberately NOT
       * precached: web-llm stores them under its own Cache Storage keys, they
       * run to hundreds of megabytes, and a service worker has no business
       * duplicating them. What this gives us is the other half of offline —
       * without it, reloading the tab with no network showed a browser error
       * page even when a model was already downloaded and ready.
       */
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Strudel AI Live Studio',
          short_name: 'Strudel AI',
          description:
            'Algorithmic music live coding with an AI copilot that runs in your browser.',
          theme_color: '#faf9f7',
          background_color: '#faf9f7',
          display: 'standalone',
          orientation: 'any',
          start_url: '.',
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          // Keep the ~6 MB web-llm worker OUT of the precache. Precaching it
          // would make every first-time visitor download 6 MB before doing
          // anything, on a page whose whole premise is that choosing an engine
          // costs nothing until you ask for it. It is cached at runtime
          // instead (see runtimeCaching below), so a user who has actually
          // loaded a local model still has it offline — and a user who never
          // does never pays for it.
          globIgnores: ['**/aiWorker-*.js'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          // Never let the worker intercept model or API traffic.
          navigateFallbackDenylist: [/^\/api/],
          runtimeCaching: [
            {
              // The web-llm worker, cached the first time it is actually used.
              urlPattern: /\/assets\/aiWorker-[\w-]+\.js$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'ai-worker',
                expiration: { maxEntries: 2 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Model weights: let web-llm's own cache own these. We only make
              // sure a repeat request does not fail hard when offline.
              urlPattern: /^https:\/\/(huggingface\.co|cdn-lfs.*\.huggingface\.co|raw\.githubusercontent\.com)\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'model-weights',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 90 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // The AI worker is an ES module (`new Worker(url, { type: 'module' })`),
    // so its bundle must be emitted as one too.
    worker: {
      format: 'es' as const,
    },
    build: {
      // web-llm and the WebGPU code paths use modern syntax; there is no point
      // shipping a lower target when WebGPU itself requires a recent browser.
      target: 'es2022',
      // The web-llm chunk is legitimately large and is lazily loaded by the
      // worker, so the default warning is just noise.
      chunkSizeWarningLimit: 2000,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
