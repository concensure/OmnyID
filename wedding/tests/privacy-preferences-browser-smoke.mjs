import { chromium } from '../../solid-ui/node_modules/@playwright/test/index.mjs';

const origin = process.env.OMNYID_PRIVACY_ORIGIN ?? 'http://127.0.0.1:4191';
const browser = await chromium.launch({ headless: true });

async function stubAnalytics(page) {
  await page.route('https://analytics.ahrefs.com/**', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'window.__omnyidAhrefsLoaded=(window.__omnyidAhrefsLoaded||0)+1;',
    });
  });
  await page.route('**/wedding/e', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await stubAnalytics(page);
  await page.goto(`${origin}/wedding/compare-wedding-venue-quotes.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('.omnyid-privacy').waitFor({ state: 'visible' });
  if (await page.evaluate(() => window.__omnyidAhrefsLoaded ?? 0)) throw new Error('Ahrefs loaded before consent');
  if (await page.locator('#omnyid-analytics-choice').isChecked()) throw new Error('Analytics defaulted on');
  await page.locator('[data-essential]').click();
  if (!await page.locator('[data-quote-decoder]').isVisible()) throw new Error('Essential-only choice blocked the quote decoder');

  await page.locator('.omnyid-privacy-trigger').click();
  await page.locator('#omnyid-analytics-choice').check();
  await page.locator('[data-primary]').click();
  await page.waitForFunction(() => window.__omnyidAhrefsLoaded === 1);

  await page.locator('.omnyid-privacy-trigger').click();
  await page.locator('#omnyid-analytics-choice').uncheck();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('[data-primary]').click(),
  ]);
  if (await page.evaluate(() => window.__omnyidAhrefsLoaded ?? 0)) throw new Error('Ahrefs loaded after withdrawal reload');
  await context.close();

  const privateContext = await browser.newContext();
  await privateContext.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
  });
  const privatePage = await privateContext.newPage();
  await stubAnalytics(privatePage);
  await privatePage.goto(`${origin}/wedding/`, { waitUntil: 'domcontentloaded' });
  await privatePage.locator('.omnyid-privacy').waitFor({ state: 'visible' });
  if (!await privatePage.locator('#omnyid-analytics-choice').isDisabled()) throw new Error('GPC did not force analytics off');
  if (await privatePage.evaluate(() => window.__omnyidAhrefsLoaded ?? 0)) throw new Error('Ahrefs loaded under GPC');
  await privateContext.close();
  console.log('Privacy preferences browser smoke passed.');
} finally {
  await browser.close();
}
