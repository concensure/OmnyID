import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../solid-ui/node_modules/@playwright/test/index.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(path);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 760 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**', route => route.abort());
  await page.addInitScript(() => localStorage.setItem('omnyid.public.privacy.v1', JSON.stringify({ version: 1, analytics: false, saved_at: new Date().toISOString() })));
  const vendor = { name: 'Celebrations By Bev', slug: 'celebrations-by-bev', category: 'Celebrant', service_area: 'Sydney', claim_status: 'unclaimed' };
  await page.route('**/api/public/wedding/vendors?*', async route => {
    const query = new URL(route.request().url()).searchParams.get('q') || '';
    if (query === 'bev') await new Promise(resolve => setTimeout(resolve, 400));
    await route.fulfill({ json: { categories: ['videographer', 'Videographer', ' celebrant ', 'Celebrant'], items: query === 'bev' ? [vendor] : [] } });
  });
  await page.goto(`${origin}/wedding/vendors.html`);
  await page.waitForFunction(() => document.querySelector('#directoryStatus')?.textContent === 'No vendors found.');
  assert.equal(await page.getByRole('button', { name: 'videographer', exact: true }).count(), 1);
  await page.locator('#vendorSearch').fill('bev');
  await page.getByRole('heading', { name: 'Celebrations By Bev' }).waitFor();
  await page.locator('#vendorSearch').fill('beva');
  await page.waitForFunction(() => document.querySelector('#directoryStatus')?.textContent === 'No vendors found.');
  assert.equal(await page.locator('#vendorGrid h3').count(), 0);
  // A slow older response must never overwrite the latest input.
  await page.locator('#vendorSearch').fill('bev');
  await page.waitForTimeout(210);
  await page.locator('#vendorSearch').fill('beva');
  await page.waitForTimeout(700);
  assert.equal(await page.locator('#vendorGrid h3').count(), 0);
  await page.goto(`${origin}/wedding/index.html`);
  assert.equal(await page.getByRole('button', { name: 'Open Wedding Sprout, your planning assistant' }).count(), 0);
  assert.equal(await page.getByRole('dialog', { name: 'Wedding Sprout' }).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  for (const path of ['/wedding/vendors.html', '/wedding/blog/how-to-elope-in-australia-celebrant.html']) {
    await page.goto(origin + path);
    const button = page.getByRole('button', { name: 'Open Wedding Sprout, your planning assistant' });
    await button.click();
    await page.getByRole('dialog', { name: 'Wedding Sprout' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Open my wedding workspace', exact: true }).getAttribute('href'), '/workspace/?auth=signin&source=wedding');
    await page.keyboard.press('Escape');
    assert.equal(await button.evaluate(el => el === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desktop.goto(`${origin}/wedding/index.html`);
  assert.equal(await desktop.getByRole('button', { name: 'Open Wedding Sprout, your planning assistant' }).count(), 0);
  assert.equal(await desktop.getByRole('dialog', { name: 'Wedding Sprout' }).count(), 0);
  assert.equal(await desktop.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await desktop.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ categoryDeduplication: true, partialSearch: true, staleSearchSuppression: true, homeAgentAbsent: true, homeViewports: [320, 1280], agentPages: 2, keyboardFocus: true }));
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
