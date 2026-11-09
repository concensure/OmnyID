import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const weddingRoot = resolve(repoRoot, 'wedding');
const marker = /\s*<!-- omnyid-privacy-analytics:start -->[\s\S]*?<!-- omnyid-privacy-analytics:end -->\s*/gi;
const directAhrefs = /\s*<script\s+src=["']https:\/\/analytics\.ahrefs\.com\/analytics\.js["'][^>]*><\/script>\s*/gi;

function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return entry.name === 'email' ? [] : files(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

const block = [
  '<!-- omnyid-privacy-analytics:start -->',
  '<script type="text/plain" data-omnyid-consent="analytics" src="https://analytics.ahrefs.com/analytics.js" data-key="jit7I+YdeLLab0kVcNUTdw" async></script>',
  '<script src="/wedding/assets/js/privacy-preferences.js" defer></script>',
  '<!-- omnyid-privacy-analytics:end -->',
].join('\n');

let updated = 0;
for (const path of files(weddingRoot)) {
  let html = readFileSync(path, 'utf8').replace(marker, '\n').replace(directAhrefs, '\n');
  html = html.replace(
    /<script\s+src=["']([^"']*assets\/js\/measure\.js)["']\s+defer><\/script>/gi,
    '<script type="text/plain" data-omnyid-consent="analytics" src="$1" defer></script>',
  );
  if (!html.includes('</head>')) throw new Error(`${relative(repoRoot, path)} has no closing head`);
  html = html.replace('</head>', `${block}\n</head>`);
  writeFileSync(path, html, 'utf8');
  updated += 1;
}

console.log(`Reconciled consent-gated analytics on ${updated} Wedding pages.`);
