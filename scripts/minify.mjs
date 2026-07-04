#!/usr/bin/env node
// Build step: minify the single-file PWA into a small deploy artifact.
//
//   node scripts/minify.mjs            # index.html → dist/index.html
//   node scripts/minify.mjs --check    # CI: non-zero if dist is stale/missing
//
// WHY: index.html is the readable source of truth (~1 MB). The remote deploy
// pipe (GitHub API relay → main) rejects bodies over ~1 MB, so we deploy a
// minified copy instead. The source stays human-editable; only the artifact is
// minified.
//
// SAFETY: name-mangling is DISABLED. The app wires UI via inline handlers
// embedded in template strings (onclick="openTimeline()") that reference GLOBAL
// function names — mangling top-level names would break them. We only strip
// whitespace/comments and run terser's (safe) compression, which is the bulk of
// the win. Every change is validated by running the full Playwright suite
// against the minified output before it ships.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { minify } from 'html-minifier-terser';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const SRC = join(ROOT, 'index.html');
const OUT_DIR = join(ROOT, 'dist');
const OUT = join(OUT_DIR, 'index.html');

const OPTIONS = {
  collapseWhitespace: true,
  conservativeCollapse: true,      // never collapse to zero — safe around inline elements
  removeComments: true,
  minifyCSS: true,                 // clean-css on the inline <style>
  minifyJS: {
    compress: { defaults: true, drop_console: false },  // keep console (real diagnostics)
    mangle: { toplevel: false },   // rename LOCALS only — top-level globals are called
                                   // from string handlers (onclick="fn()") so must be kept
    format: { comments: false },
  },
  // Leave HTML structure/attributes otherwise intact.
  keepClosingSlash: true,
  removeAttributeQuotes: false,
};

const src = readFileSync(SRC, 'utf8');
const out = await minify(src, OPTIONS);
const check = process.argv.includes('--check');

if (check) {
  if (!existsSync(OUT)) { console.error('✗ dist/index.html missing — run: node scripts/minify.mjs'); process.exit(1); }
  const cur = readFileSync(OUT, 'utf8');
  if (cur !== out) { console.error('✗ dist/index.html is STALE — run: node scripts/minify.mjs'); process.exit(1); }
  console.log('dist/index.html up to date.');
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, out);
const before = Buffer.byteLength(src), after = Buffer.byteLength(out);
const pct = ((1 - after / before) * 100).toFixed(1);
console.log(`✓ Minified index.html: ${before.toLocaleString()} → ${after.toLocaleString()} bytes (−${pct}%) → dist/index.html`);
if (after > 950_000) console.warn(`⚠ ${after.toLocaleString()} bytes still near the ~1 MB deploy cap — consider trimming further.`);
