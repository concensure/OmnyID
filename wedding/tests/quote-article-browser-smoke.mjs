import { chromium } from '../../solid-ui/node_modules/@playwright/test/index.mjs';

const origin = process.env.OMNYID_QUOTE_ARTICLE_ORIGIN ?? 'http://127.0.0.1:4187';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => localStorage.setItem('omnyid.public.privacy.v1', JSON.stringify({ version: 1, analytics: false, saved_at: '2026-11-12T00:00:00.000Z' })));
  let requests = 0;
  await page.route('**/wedding/quote-extract', async (route) => {
    requests += 1;
    const request = route.request().postDataJSON();
    if (request.text !== 'Dinner package for 80 guests at $220 per person. GST included.') throw new Error('Article lost the quote text');
    if (request.comparison_guests !== 80) throw new Error('Article lost the comparison guest count');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      schema_version: 'quote-extraction.v2', retained_by_omnyid: false,
      fields: {
        pricing_model: { state: 'extracted', value: 'per_head', source_snippet: '$220 per person', confidence: 'high', reason: 'Explicit rate.' },
        per_head_rate: { state: 'extracted', value: 220, source_snippet: '$220 per person', confidence: 'high', reason: 'Explicit rate.' },
        guest_count: { state: 'extracted', value: 80, source_snippet: '80 guests', confidence: 'high', reason: 'Explicit count.' },
        whole_package_amount: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'Not stated.' },
        fixed_fee: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'Not stated.' },
        minimum_spend: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'Not stated.' },
        gst: { state: 'extracted', value: 'included', source_snippet: 'GST included', confidence: 'high', reason: 'Explicit treatment.' },
        service_charge_pct: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'Not stated.' },
        venue_hours: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'Not stated.' },
        overtime_rate: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'Not stated.' },
        payment_schedule: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'Not stated.' },
      },
      line_items: [{ label: 'Dinner package', unit: 'per_head', amount: 220, source_snippet: 'Dinner package for 80 guests at $220 per person.', confidence: 'high' }],
      inclusions: [], exclusions: [],
    }) });
  });
  await page.goto(`${origin}/wedding/blog/before-you-accept-that-wedding-quote.html`, { waitUntil: 'domcontentloaded' });
  if ((await page.locator('#quoteStudyStatus').innerText()).includes('not accepting')) throw new Error('Article still renders the disabled research-preview state');
  await page.locator('#quoteStudyGuests').fill('80');
  await page.locator('#quoteStudyText').fill('Dinner package for 80 guests at $220 per person. GST included.');
  if (requests !== 0) throw new Error('Article sent quote text before explicit analysis');
  await page.locator('#quoteStudySubmit').click();
  await page.locator('#quoteStudyResults').waitFor({ state: 'visible' });
  const result = await page.locator('#quoteStudyResults').innerText();
  if (requests !== 1) throw new Error(`Expected one extraction request, saw ${requests}`);
  if (!result.includes('$220.00') || !result.includes('$220 per person') || !result.includes('Whole-package amount')) throw new Error(`Source-grounded result is incomplete: ${result}`);
  if (!result.includes('Open the full Wedding Venue Quote Decoder')) throw new Error('Full deterministic comparison handoff is missing');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error('Quote article analyser overflows at mobile width');
  console.log(JSON.stringify({ requests, sourceGrounded: true, retainedByOmnyid: false, mobileWidth: 390 }));
} finally {
  await browser.close();
}
