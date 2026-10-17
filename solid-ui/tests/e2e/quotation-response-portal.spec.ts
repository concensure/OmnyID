import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const projection = {
  projection_version: "quotation.vendor_context.v1", projection_fingerprint: "a".repeat(64),
  grant_id: "grant-1", recipient_vendor_id: "vendor-1", quotation_id: "quote-1",
  quotation_version_id: "quote-1-v1", thread_id: "thread-1", response_recipient_id: "recipient-1",
  purpose: "resolve_quote_gaps", allowed_actions: ["answer_questions"], question_ids: ["availability"],
  fields: {
    "vendor.name": "Harbour House", "couple.label": "Alex and Sam",
    "own_quote.total": { amount_minor: 400000, currency: "AUD" },
    "competitor.price": "NEVER-SHOW-COMPETITOR", private_note: "NEVER-SHOW-PRIVATE",
  },
  fact_ids: ["fact-total"], provenance_refs: ["quote-1-v1"],
};

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test(`secure quotation response strips token and stays accessible at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const requests: string[] = [];
    const allRequests: string[] = [];
    page.on("request", (request) => allRequests.push(request.url()));
    let exchangeReferer = "";
    await page.route("**/quotation/vendor-response/exchange", async (route) => {
      requests.push(route.request().url());
      exchangeReferer = route.request().headers().referer ?? "";
      expect(route.request().postDataJSON()).toEqual({ response_token: "synthetic-secret" });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        session_id: "session-1", expires_at: "2026-10-18T01:15:00Z",
        capability_expires_at: "2027-10-19T01:00:00Z", csrf_token: "csrf-1",
        submission_nonce: "nonce-1", account_access: false, projection,
      }) });
    });
    await page.route("**/quotation/vendor-response/consume", async (route) => {
      requests.push(route.request().url());
      expect(route.request().headers()["x-csrf-token"]).toBe("csrf-1");
      expect(route.request().postDataJSON()).toMatchObject({ submission_nonce: "nonce-1", action: "answer_questions", affirmed: true });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        status: "received", receipt_id: "qvrr_synthetic", requires_user_review: true,
        accepted: false, booking: false, payment_execution: false,
      }) });
    });
    await page.goto("/workspace/quotation-response.html#token=synthetic-secret", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/quotation-response\.html$/);
    expect(exchangeReferer).not.toContain("synthetic-secret");
    expect(requests.every((url) => !url.includes("synthetic-secret"))).toBe(true);
    expect(allRequests.every((url) => !url.includes("synthetic-secret"))).toBe(true);
    expect(allRequests.some((url) => /analytics|cloudflareinsights/i.test(url))).toBe(false);
    await expect(page.getByRole("heading", { name: "Answer questions about your quotation" })).toBeVisible();
    await expect(page.getByText("Harbour House").first()).toBeVisible();
    await expect(page.getByText(/reply to the original message/i)).toBeVisible();
    await expect(page.getByText(/NEVER-SHOW-COMPETITOR|NEVER-SHOW-PRIVATE/)).toHaveCount(0);
    await page.getByLabel("Availability", { exact: true }).selectOption("confirmed");
    await page.getByPlaceholder("Answer only this approved question").fill("Yes, we are available.");
    await page.getByLabel(/confirm this response is accurate/i).check();
    await page.getByRole("button", { name: "Submit response" }).click();
    await expect(page.getByRole("heading", { name: "Response received" })).toBeVisible();
    await expect(page.getByText("qvrr_synthetic")).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
  });
}

test("expired or revoked links reveal only a generic email-safe fallback", async ({ page }) => {
  await page.route("**/quotation/vendor-response/exchange", (route) => route.fulfill({ status: 404, body: "response unavailable" }));
  await page.goto("/workspace/quotation-response.html#token=expired-secret", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/quotation-response\.html$/);
  await expect(page.getByRole("heading", { name: "This response link is unavailable" })).toBeVisible();
  await expect(page.getByText("Harbour House")).toHaveCount(0);
  await expect(page.getByText(/reply to the original email/i)).toBeVisible();
});

test("revision upload preserves scoped bindings and joins the final review response", async ({ page }) => {
  const revisionProjection = {
    ...projection,
    allowed_actions: ["submit_revision"],
    purpose: "refine_vendor_package",
  };
  await page.setViewportSize({ width: 360, height: 780 });
  await page.route("**/quotation/vendor-response/exchange", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      session_id: "session-revision", expires_at: "2026-10-18T01:15:00Z",
      capability_expires_at: "2027-10-19T01:00:00Z", csrf_token: "csrf-revision",
      submission_nonce: "nonce-revision", account_access: false, projection: revisionProjection,
    }),
  }));
  let uploadBody = "";
  await page.route("**/quotation/vendor-response/revision", async (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("csrf-revision");
    uploadBody = route.request().postData() ?? "";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      status: "prepared", source_id: "source-1", source_version_id: "source-1:1",
      attachment_id: "attachment-1", file_name: "revised-quote.txt", media_type: "text/plain",
      parser: "readability", requires_user_review: true, accepted: false,
      booking: false, payment_execution: false,
    }) });
  });
  await page.route("**/quotation/vendor-response/consume", async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ action: "submit_revision", submission_nonce: "nonce-revision" });
    expect(body.source_id).toBeUndefined();
    expect(body.attachment_id).toBeUndefined();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      status: "received", receipt_id: "qvrr_revision", requires_user_review: true,
      accepted: false, booking: false, payment_execution: false,
    }) });
  });
  await page.goto("/workspace/quotation-response.html#token=revision-secret", { waitUntil: "networkidle" });
  await page.getByLabel("Quotation file").setInputFiles({
    name: "revised-quote.txt", mimeType: "text/plain", buffer: Buffer.from("Total AUD 4,200"),
  });
  await page.getByRole("button", { name: "Prepare document" }).click();
  await expect(page.getByText("Document prepared for review")).toBeVisible();
  expect(uploadBody).toContain("revised-quote.txt");
  expect(uploadBody).not.toContain("quotation_id");
  expect(uploadBody).not.toContain("vendor_id");
  await page.getByLabel(/confirm this response is accurate/i).check();
  await page.getByRole("button", { name: "Submit response" }).click();
  await expect(page.getByText("qvrr_revision")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
});
