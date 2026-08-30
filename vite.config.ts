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
        /*
         * 'prompt', not 'autoUpdate'.
         *
         * autoUpdate is skipWaiting + clientsClaim: a newly installed worker
         * takes control of the OPEN page immediately, while that page is still
         * running the previous bundle. Its lazily imported chunks — the 362 kB
         * `@strudel/transpiler`, fetched the first time a pattern is validated
         * — are addressed by a content hash the new precache no longer holds,
         * so deploying mid-session could silently drop a live user's
         * validation to structural-only. The update now waits until the user
         * accepts it (see src/pwa.ts and PwaControls).
         */
        registerType: 'prompt',
        // Registration is ours, in src/pwa.ts, so that update and offline
        // callbacks have somewhere to go. Leaving this on would register the
        // worker twice.
        injectRegister: null,
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
          // Derived from `base`, NOT written as '.'.
          //
          // Unlike every other URL member, `id` is resolved against the
          // manifest's ORIGIN rather than the manifest's URL, so '.' would
          // claim `https://<user>.github.io/` — the account root, shared by
          // every project page that user publishes. Two of this owner's PWAs
          // would then be the same installed app. Using `base` keeps the
          // identity unique per deployment and still correct for a fork under
          // a different repository name.
          id: base,
          lang: 'en',
          dir: 'ltr',
          categories: ['music', 'entertainment', 'productivity'],
          // minimal-ui is the fallback for browsers that will not do
          // standalone; both are better than dropping to a full browser tab.
          display_override: ['standalone', 'minimal-ui'],
          // The app holds an AudioContext and, with a local model, up to ~1.9GB
          // of GPU memory. Launching a second window instead of focusing the
          // open one would duplicate both.
          launch_handler: { client_mode: 'navigate-existing' },
          // Long-press on Android, right-click the taskbar icon on desktop.
          // Both land on the same page with a query the app reads on boot.
          shortcuts: [
            {
              name: 'Mini-notation guide',
              short_name: 'Guide',
              description: 'Open the TidalCycles mini-notation reference',
              url: '?view=guide',
            },
            {
              name: 'Saved sessions',
              short_name: 'Sessions',
              description: 'Open your saved patterns and variations',
              url: '?view=sessions',
            },
          ],
          // Chrome will not offer to install a site without a >=192px icon,
          // so without these the app could not go on a home screen at all —
          // on the platform its offline support exists for. Paths are
          // relative so they resolve against the manifest URL, which lives
          // under the project path on GitHub Pages, not at the origin root.
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: 'icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // No `webmanifest` here: vite-plugin-pwa precaches the manifest and
          // the icons it names by itself, and listing it again produced a
          // duplicate entry in the precache manifest.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          // A deep link or a refresh must resolve to the app shell offline,
          // the same way the deploy workflow's 404.html handles it online.
          navigateFallback: 'index.html',
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
            // There is deliberately NO rule for model weights.
            //
            // There used to be a CacheFirst route over huggingface.co and
            // raw.githubusercontent.com, justified as "make sure a repeat
            // request does not fail hard when offline". It cannot do that.
            // web-llm's own `addToCache` calls `cache.match()` first and only
            // fetches on a miss, so it never repeats a request it has already
            // cached — the workbox copy can never be the one that rescues an
            // offline load. What it did instead was store every shard twice,
            // once in web-llm's `webllm/model` scope and once in
            // `model-weights`, because `Cache.add()` from a controlled client
            // is an ordinary fetch the service worker can see. A 900 MB model
            // occupied about 1.8 GB. `aiManager` deletes the orphaned cache on
            // startup for anyone who already has one.
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
