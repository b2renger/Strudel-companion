/**
 * Checks the built `dist/` against what a browser actually requires before it
 * will install a site.
 *
 * This exists because every one of these failures is silent. A manifest with
 * no icons does not error anywhere — Chrome simply never offers to install,
 * and you find out when somebody says "there's no install button". Same for an
 * `id` that collides with another app on the origin, an icon the precache
 * missed, or a start_url outside the scope.
 *
 * Run after `npm run build`; the deploy workflow runs it before publishing.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.argv[2] ?? 'dist';
const problems = [];
const notes = [];

function fail(msg) {
  problems.push(msg);
}

// ---- manifest -------------------------------------------------------------
const manifestPath = join(DIST, 'manifest.webmanifest');
if (!existsSync(manifestPath)) {
  fail('no manifest.webmanifest in the build');
} else {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));

  for (const key of ['name', 'short_name', 'start_url', 'display', 'icons', 'scope', 'id']) {
    if (m[key] === undefined) fail(`manifest is missing "${key}"`);
  }

  if (!['standalone', 'fullscreen', 'minimal-ui'].includes(m.display)) {
    fail(`manifest display is "${m.display}" — a browser will not install a "browser" display`);
  }

  // Chrome's installability bar: at least one PNG icon of 192px or more.
  const icons = m.icons ?? [];
  const big = icons.filter((i) => {
    const sizes = String(i.sizes ?? '').split(/\s+/);
    return sizes.some((s) => Number(s.split('x')[0]) >= 192);
  });
  if (big.length === 0) fail('manifest has no icon of 192px or larger — the site is not installable');
  if (!icons.some((i) => String(i.purpose ?? '').includes('maskable'))) {
    notes.push('no maskable icon — Android will letterbox the icon on some launchers');
  }

  for (const icon of icons) {
    const file = join(DIST, icon.src);
    if (!existsSync(file)) fail(`manifest names ${icon.src} but it is not in the build`);
  }

  // `id` is resolved against the ORIGIN, not the manifest URL, so a relative
  // "." claims the whole origin — on GitHub Pages that is the account root,
  // shared with every other project page.
  if (m.id === '.' || m.id === './' || m.id === '/') {
    fail(`manifest id "${m.id}" resolves to the origin root and will collide with other apps there`);
  }
  if (m.scope && m.id && !String(m.id).startsWith(String(m.scope))) {
    fail(`manifest id "${m.id}" is outside scope "${m.scope}"`);
  }

  const start = new URL(m.start_url, `https://example.com${m.scope ?? '/'}`);
  if (!start.pathname.startsWith(m.scope ?? '/')) {
    fail(`start_url "${m.start_url}" resolves outside scope "${m.scope}"`);
  }

  for (const s of m.shortcuts ?? []) {
    if (!s.name || !s.url) fail(`a manifest shortcut is missing name or url`);
  }
}

// ---- service worker -------------------------------------------------------
const swPath = join(DIST, 'sw.js');
if (!existsSync(swPath)) {
  fail('no sw.js in the build — the app will not work offline');
} else {
  const sw = readFileSync(swPath, 'utf8');
  const entries = [...sw.matchAll(/\{url:"([^"]+)",revision:(null|"[^"]*")\}/g)].map((x) => ({
    url: x[1],
    revision: x[2],
  }));

  if (entries.length === 0) fail('sw.js precaches nothing');

  const byUrl = new Map();
  for (const e of entries) {
    const seen = byUrl.get(e.url);
    // Identical duplicates are deduped by workbox; conflicting ones make it
    // throw during install, which kills offline support entirely.
    if (seen && seen !== e.revision) {
      fail(`sw.js precaches ${e.url} twice with different revisions — install will throw`);
    }
    byUrl.set(e.url, e.revision);
  }

  if (!byUrl.has('index.html')) fail('sw.js does not precache index.html — no offline start');
  if (!/NavigationRoute/.test(sw)) fail('sw.js has no navigation fallback — a refresh will 404 offline');

  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : { icons: [] };
  for (const icon of manifest.icons ?? []) {
    if (!byUrl.has(icon.src)) notes.push(`icon ${icon.src} is not precached (installs need network)`);
  }

  // The whole point of keeping the 6 MB worker out of the precache.
  for (const url of byUrl.keys()) {
    if (/aiWorker-/.test(url)) fail(`sw.js precaches the web-llm worker (${url}) — first visit pays 6 MB`);
  }
}

// ---- index.html -----------------------------------------------------------
const indexPath = join(DIST, 'index.html');
if (existsSync(indexPath)) {
  // Comments are stripped first. index.html explains these tags in prose right
  // next to them, so a document-wide search matched the explanation and would
  // have passed a build whose actual meta tag was gone.
  const html = readFileSync(indexPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '');

  const viewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.exec(html)?.[0] ?? '';
  if (!viewport) fail('index.html has no viewport meta tag');
  else if (!/viewport-fit\s*=\s*cover/.test(viewport)) {
    fail('the viewport meta tag lacks viewport-fit=cover — content will sit under the notch');
  }

  const metaWithName = (name) =>
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]*>`, 'i').test(html);
  if (!metaWithName('apple-mobile-web-app-capable')) {
    fail('index.html is missing the apple-mobile-web-app-capable meta tag');
  }
  if (!metaWithName('apple-mobile-web-app-status-bar-style')) {
    notes.push('no apple-mobile-web-app-status-bar-style — iOS uses the default status bar');
  }

  if (!/<link[^>]+rel=["']apple-touch-icon["']/i.test(html)) {
    fail('index.html has no apple-touch-icon link — iOS gets a screenshot tile');
  }
  const touchIcon = /rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i.exec(html);
  if (touchIcon && !existsSync(join(DIST, touchIcon[1]))) {
    fail(`apple-touch-icon points at ${touchIcon[1]}, which is not in the build`);
  }
}

for (const n of notes) console.log(`  note  ${n}`);
if (problems.length) {
  console.error(`\nPWA verification FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('PWA verification passed: installable, offline-capable, icons present.');
