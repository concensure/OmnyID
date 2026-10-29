import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(resolve(projectRoot, 'docs', 'verify-email.html'), 'utf8');
const css = readFileSync(resolve(projectRoot, 'docs', 'verify-email.css'), 'utf8');
const js = readFileSync(resolve(projectRoot, 'docs', 'verify-email.js'), 'utf8');
const failures = [];

for (const required of [
  'verify-email.css', 'verify-email.js', 'confirmation-title', 'confirmation-message',
  'pause-redirect', 'aria-live="polite"',
]) if (!html.includes(required)) failures.push(`confirmation page is missing ${required}`);

if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) failures.push('confirmation page must not use inline script');
if (!js.includes('params.get("source") === "wedding" ? "wedding" : "generic"')) failures.push('unknown source does not fail closed to generic');
for (const required of [
  'Less worry. More of the fun.', 'part of the OmnyID community',
  'Wishing you an enjoyable planning journey.', '/workspace/?auth=signin&source=wedding&verified=1',
  'A clearer place for what matters.', '/workspace/?auth=signin&verified=1',
  'window.history.replaceState', 'Stay on this page',
]) if (!html.includes(required) && !js.includes(required)) failures.push(`confirmation experience is missing ${required}`);

for (const image of ['wedding-community-confirmation.webp', 'omnyid-community-confirmation.webp']) {
  const path = resolve(projectRoot, 'docs', 'assets', 'images', image);
  if (statSync(path).size > 100_000) failures.push(`${image} is not sufficiently optimized`);
  if (!html.includes(image) && !js.includes(image)) failures.push(`${image} is not referenced`);
}
if (!css.includes('@media (max-width: 760px)')) failures.push('confirmation page lacks a mobile layout');
if (!css.includes('prefers-reduced-motion')) failures.push('confirmation page lacks reduced-motion handling');

if (failures.length) {
  console.error('Account confirmation smoke failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Account confirmation smoke passed.');
