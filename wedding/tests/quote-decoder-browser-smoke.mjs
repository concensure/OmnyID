import { chromium } from '../../solid-ui/node_modules/@playwright/test/index.mjs';

const origin = process.env.OMNYID_QUOTE_DECODER_ORIGIN ?? 'http://127.0.0.1:4187';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => localStorage.setItem('omnyid.public.privacy.v1', JSON.stringify({ version: 1, analytics: false, saved_at: '2026-11-09T00:00:00.000Z' })));
  let extractionRequests = 0;
  let shareRequests = 0;
  await page.route('**/wedding/quote-extract', async (route) => {
    extractionRequests += 1;
    const request = route.request().postDataJSON();
    if (!String(request.text).includes('120 guests x $275.00')) throw new Error('Extraction request lost proposal text');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      schema_version: 'quote-extraction.v2', model: 'test-model', retained_by_omnyid: false,
      fields: {
        pricing_model: { state: 'extracted', value: 'per_head', source_snippet: '120 guests x $275.00', confidence: 'high', reason: 'Explicit per-head relationship.' },
        per_head_rate: { state: 'extracted', value: 275, source_snippet: '120 guests x $275.00', confidence: 'high', reason: 'Explicit per-head rate.' },
        guest_count: { state: 'extracted', value: 120, source_snippet: '120 guests x $275.00', confidence: 'high', reason: 'Explicit guest count.' },
        whole_package_amount: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'No grand total is stated.' },
        fixed_fee: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'No fixed fee is stated.' },
        minimum_spend: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'No minimum spend is stated.' },
        gst: { state: 'extracted', value: 'included', source_snippet: 'GST included', confidence: 'high', reason: 'Explicit GST treatment.' },
        service_charge_pct: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'No service charge is stated.' },
        venue_hours: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'No hours are stated.' },
        overtime_rate: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'No overtime rate is stated.' },
        payment_schedule: { state: 'not_found', value: null, source_snippet: null, confidence: 'low', reason: 'No payment schedule is stated.' },
      },
      line_items: [{ label: 'Dinner package', unit: 'per_head', amount: 275, source_snippet: '120 guests x $275.00', confidence: 'high' }],
      inclusions: [{ label: 'Dinner package', source_snippet: 'Dinner package for 120 guests x $275.00' }], exclusions: [],
    }) });
  });
  await page.route('**/wedding/quote-share', async (route) => {
    shareRequests += 1;
    const request = route.request().postDataJSON();
    if (request.email !== 'couple@example.com' || !Array.isArray(request.snapshot?.proposals)) {
      throw new Error('Share request lost the recipient or comparison snapshot');
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'sent', message: 'PDF sent.' }) });
  });
  await page.goto(`${origin}/wedding/compare-wedding-venue-quotes.html`, { waitUntil: 'domcontentloaded' });
  if (await page.locator('[name=company]').isVisible()) throw new Error('Quote honeypot became a visible blank field');
  if (await page.locator('[data-selection-target=a] option').count() < 10) throw new Error('Selection mapping options did not initialise');
  const pdfSource = await browser.newPage();
  await pdfSource.setContent('<!doctype html><meta charset="utf-8"><p>PDF venue quote: 40 guests at $150 per guest. GST included.</p>');
  const pdfBytes = await pdfSource.pdf({ format: 'A4' });
  await pdfSource.close();
  await page.locator('[name=a_file]').setInputFiles({ name: 'venue-quote.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
  await page.waitForFunction(() => !document.querySelector('[data-file-status="a"]')?.textContent?.startsWith('Reading '));
  const pdfStatus = await page.locator('[data-file-status=a]').innerText();
  if (!pdfStatus.includes('was read on this device')) throw new Error(`Selectable-text PDF failed: ${pdfStatus}`);
  if (!await page.locator('[name=a_text]').inputValue().then((text) => text.includes('40 guests at $150 per guest'))) {
    throw new Error('Selectable-text PDF did not populate the local proposal text');
  }
  if (extractionRequests !== 0) throw new Error('Local PDF selection sent quote text before explicit analysis');
  await page.locator('[data-add-line=a]').click();
  if (await page.locator('[data-line-items=a] tbody tr').count() !== 1) throw new Error('Manual line item action did not initialise');
  await page.locator('[data-remove-line="a:0"]').click();
  await page.evaluate(() => localStorage.removeItem('omnyid.wedding.quoteExtractionCache.v2'));
  const quote = 'Dinner package for 120 guests x $275.00. GST included. Beverage pricing is not stated.';
  await page.locator('[name=a_label]').fill('Wharf Bend sample');
  await page.locator('[name=a_text]').fill(quote);
  if (extractionRequests !== 0) throw new Error('Proposal text was sent before explicit analysis');
  await page.locator('[data-analyse=a]').click();
  await page.locator('[data-suggestions=a] .quote-suggestion').first().waitFor();
  if (extractionRequests !== 1) throw new Error(`Expected one extraction request, saw ${extractionRequests}`);
  if (await page.locator('[name=a_per_head_rate]').inputValue() !== '275') throw new Error('High-confidence per-head rate was not applied after explicit analysis');
  if (await page.locator('[name=a_whole_package_amount]').inputValue() !== '') throw new Error('Component subtotal became whole-package amount');
  await page.locator('[data-analyse=a]').click();
  if (extractionRequests !== 1) throw new Error('Unchanged quote did not use browser cache');
  await page.locator('[data-quote-decoder]').evaluate((form) => form.requestSubmit());
  await page.locator('[data-quote-result]').waitFor({ state: 'visible' });
  const summary = await page.locator('[data-quote-summary]').innerText();
  const formula = await page.locator('[data-formulas]').innerText();
  if (!formula.includes('$27,500.00')) throw new Error(`Expected deterministic 100 × $275 total, received ${formula}`);
  if (!summary.includes('unknown')) throw new Error(`Missing-term summary not visible: ${summary}`);
  if (!await page.locator('text=Not stated in quote').count()) throw new Error('Not-stated extraction state is absent');

  // Scenario estimates preserve the quoted basis and apply minimum-spend
  // floors only to eligible items.
  await page.locator('[name=a_pricing_model]').selectOption('minimum_spend');
  await page.locator('[name=a_per_head_rate]').fill('48');
  await page.locator('[name=a_minimum_spend]').fill('5000');
  await page.locator('[name=a_gst]').selectOption('included');
  await page.locator('[name=a_venue_hours]').fill('6');
  await page.locator('[name=a_payment_schedule]').fill('Deposit due on acceptance');
  await page.locator('[name=a_deposit_amount]').fill('500');
  if (await page.locator('[name=a_deposit_amount]').inputValue() !== '500') throw new Error('Deposit amount could not be entered');
  await page.locator('[name=a_cancellation_terms]').fill('Cancellation terms stated');
  await page.locator('[name=a_date_status]').selectOption('available');
  await page.locator('[name=comparison_guests]').fill('100');
  await page.locator('[name=comparison_budget]').fill('30000');
  await page.locator('[data-add-line=a]').click();
  if (await page.locator('[name=a_deposit_amount]').inputValue() !== '500') throw new Error('Adding a line item cleared the deposit');
  const scenarioRow = page.locator('[data-line-items=a] tbody tr').last();
  await scenarioRow.locator('[data-line-label]').fill('Optional drinks upgrade');
  await scenarioRow.locator('[data-line-amount]').fill('400');
  await scenarioRow.locator('[data-line-counted]').check();
  await scenarioRow.locator('[data-line-scenario]').check();
  await scenarioRow.locator('[data-line-minimum]').check();
  const retainedDeposit = await page.locator('[name=a_deposit_amount]').inputValue();
  if (retainedDeposit !== '500') throw new Error(`Deposit input did not retain the reviewed amount: ${retainedDeposit}`);
  await page.locator('[data-quote-decoder]').evaluate((form) => form.requestSubmit());
  if (!await page.locator('[data-formulas]').innerText().then((text) => text.includes('$5,200.00'))) throw new Error('Original eligible upgrade was not included');
  await scenarioRow.locator('[data-line-scenario]').uncheck();
  const scenarioText = await page.locator('[data-formulas]').innerText();
  if (!scenarioText.toLowerCase().includes('scenario estimate') || !scenarioText.includes('$5,000.00') || !scenarioText.includes('Minimum-spend adjustment') || !scenarioText.includes('$200.00')) {
    throw new Error(`Minimum-spend scenario was not explained correctly: ${scenarioText}`);
  }
  if (!scenarioText.includes('Deposit (part of total, not added again)')) throw new Error(`Deposit was not kept separate from total: ${scenarioText}`);
  if (!scenarioText.includes('$25,000.00')) throw new Error('Remaining wedding budget did not update');
  await page.locator('[data-choice=a]').click();
  await page.locator('[data-choice=confirm]').click();
  if (!await page.locator('[data-choice-status]').innerText().then((text) => text.includes('confirmed'))) throw new Error('Public device-only choice did not persist');

  await page.locator('[name=b_label]').fill('Terms-only sample');
  await page.locator('[name=b_text]').fill('GST treatment and the package total are not stated in this proposal.');
  await page.locator('[data-selection-target=b]').selectOption('gst');
  await page.locator('[name=b_text]').evaluate((textarea) => {
    const start = textarea.value.indexOf('GST treatment');
    textarea.setSelectionRange(start, start + 'GST treatment'.length);
  });
  await page.locator('[data-extract-selection=b]').click();
  if (await page.locator('[name=b_gst]').inputValue() !== 'unclear') throw new Error('Extract-from-selection did not map the chosen source');
  if (!await page.locator('[data-source-highlight=b]').isVisible()) throw new Error('Mapped quote source was not persistently highlighted');
  if (!await page.locator('[data-source-highlight=b]').evaluate((element) => getComputedStyle(element).backgroundColor === 'rgb(255, 243, 166)')) {
    throw new Error('Mapped quote source was not highlighted in yellow');
  }
  await page.locator('[data-quote-decoder]').evaluate((form) => form.requestSubmit());
  const comparisonText = await page.locator('[data-quote-result]').innerText();
  if (!comparisonText.includes('Not enough pricing stated')) throw new Error(`Unknown core price was not explained: ${comparisonText}`);
  if (comparisonText.includes('undefined')) throw new Error(`Comparison rendered an undefined value: ${comparisonText}`);
  await page.locator('[data-open-share]').click();
  await page.locator('[name=share_email]').fill('couple@example.com');
  await page.locator('[data-quote-share]').evaluate((form) => form.requestSubmit());
  await page.locator('[data-share-status]').getByText('PDF sent.').waitFor();
  if (shareRequests !== 1) throw new Error(`Expected one PDF share request, saw ${shareRequests}`);
  await page.locator('[data-clear-analysis=a]').click();
  if (!await page.locator('[data-analysis-status=a]').innerText().then((text) => text.includes('cleared'))) throw new Error('Clear saved analysis did not provide feedback');
  if (await page.locator('[data-suggestions=a] > *').count() !== 0) throw new Error('Clear saved analysis left stale suggestions visible');
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflows) {
    const offenders = await page.evaluate(() => [...document.querySelectorAll('body *')]
      .filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className || ''}:${Math.round(element.getBoundingClientRect().right)}`));
    throw new Error(`Quote decoder has horizontal overflow at 390px: ${offenders.join(', ')}`);
  }
  const mobileZoom = await page.evaluate(() => getComputedStyle(document.documentElement).zoom || '1');
  if (mobileZoom !== '1') throw new Error(`Mobile Wedding pages must not be zoomed; received ${mobileZoom}`);

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(`${origin}/wedding/compare-wedding-venue-quotes.html`, { waitUntil: 'domcontentloaded' });
  const weddingZoom = await desktop.evaluate(() => getComputedStyle(document.documentElement).zoom);
  if (weddingZoom !== '1.2') throw new Error(`Expected desktop Wedding zoom 1.2, received ${weddingZoom}`);
  await desktop.goto(`${origin}/docs/index.html`, { waitUntil: 'domcontentloaded' });
  const rootZoom = await desktop.evaluate(() => getComputedStyle(document.documentElement).zoom);
  if (rootZoom !== '1.1') throw new Error(`Expected desktop root zoom 1.1, received ${rootZoom}`);
  await desktop.close();
  console.log(JSON.stringify({ summary, extractionRequests, shareRequests, cached: true, componentSubtotalProtected: true, mobileWidth: 390, weddingZoom, rootZoom }));
} finally {
  await browser.close();
}
