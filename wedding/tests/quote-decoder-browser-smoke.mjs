import { chromium } from '../../solid-ui/node_modules/@playwright/test/index.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const origin = process.env.OMNYID_QUOTE_DECODER_ORIGIN ?? 'http://127.0.0.1:4187';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const proposalDataRequests = [];
  page.on('request', (request) => {
    const body = request.postData() ?? '';
    if (/Wharf Bend sample|Bluegum sample|minimum spend/i.test(`${request.url()} ${body}`)) {
      proposalDataRequests.push(request.url());
    }
  });
  await page.goto(`${origin}/wedding/compare-wedding-venue-quotes.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('[name=a_label]').fill('Wharf Bend sample');
  await page.locator('[name=b_label]').fill('Bluegum sample');
  await page.locator('[name=a_text]').fill(readFileSync(resolve(repositoryRoot, 'Documents/testing/venue-quote-samples/01-riverside-premium-the-boathouse-at-wharf-bend.txt'), 'utf8'));
  await page.locator('[name=b_text]').fill(readFileSync(resolve(repositoryRoot, 'Documents/testing/venue-quote-samples/02-mid-range-bluegum-ridge-estate-blue-mountains.txt'), 'utf8'));
  await page.locator('[data-scan=a]').click();
  await page.locator('[data-scan=b]').click();
  for (const side of ['a', 'b']) {
    const suggestion = page.locator(`[data-suggestions=${side}] [data-apply-suggestion]`).first();
    if (await suggestion.count()) await suggestion.click();
  }
  await page.locator('[data-quote-decoder]').evaluate((form) => form.requestSubmit());
  await page.locator('[data-quote-result]').waitFor({ state: 'visible' });
  const summary = await page.locator('[data-quote-summary]').innerText();
  if (!summary.includes('not a recommendation')) throw new Error(`Unsafe comparison summary: ${summary}`);
  if (proposalDataRequests.length) throw new Error(`Proposal data left the browser: ${proposalDataRequests.join(', ')}`);
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflows) {
    const offenders = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className || ''}:${Math.round(element.getBoundingClientRect().right)}`));
    throw new Error(`Quote decoder has horizontal overflow at 390px: ${offenders.join(', ')}`);
  }
  console.log(JSON.stringify({ summary, questions: await page.locator('[data-questions] li').count(), proposalDataRequests: 0, mobileWidth: 390 }));
} finally {
  await browser.close();
}
