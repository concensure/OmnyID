import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

type Manifest = {
  operator_email: string;
  ordinary_email: string;
  report_from: string;
  report_through: string;
  expected_landing_sessions: number;
  expected_registered_weddings: number;
  expected_activated_weddings: number;
  expected_returned_weddings: number;
  expected_paid_weddings: number;
  expected_gross_minor: number;
  expected_refunded_minor: number;
};

const manifestPath = process.env.OMNYID_E2E_SEED_MANIFEST?.trim();
const password = process.env.OMNYID_E2E_PASSWORD?.trim();
if (!manifestPath || !password) throw new Error("Growth seed manifest and synthetic password are required");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

async function signIn(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.goto("/workspace/?view=cost_dashboard&open_auth=1", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Account email").fill(email);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("omnyid.preview.session"))).not.toBeNull();
  return { context, page };
}

async function api(page: Page, path: string, init: { method?: string; body?: unknown } = {}) {
  return page.evaluate(async ({ requestPath, method, body }) => {
    const response = await fetch(requestPath, {
      method: method ?? "GET",
      cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* bounded text remains */ }
    return { status: response.status, body: parsed };
  }, { requestPath: path, method: init.method, body: init.body });
}

test("real Growth stack reconciles sources and preserves the operator boundary", async ({ browser, request }) => {
  const anonymous = await request.get("/admin/growth/overview");
  expect(anonymous.status()).toBe(401);

  const ordinary = await signIn(browser, manifest.ordinary_email);
  expect((await api(ordinary.page, "/admin/growth/overview")).status).toBe(403);
  await expect(ordinary.page.getByRole("heading", { name: "Campaign analytics" })).toBeHidden();

  const operator = await signIn(browser, manifest.operator_email);
  const csv = `Date,Campaign ID,Amount spent,Currency,Landing page views\n${manifest.report_through},growth_pilot,120.00,AUD,9\n`;
  const spendBody = {
    filename: "growth-e2e-meta.csv",
    platform: "instagram",
    csv_base64: Buffer.from(csv).toString("base64"),
    source_currency: "AUD",
    aud_rate_micros: 1_000_000,
    conversion_source: "Synthetic AUD fixture",
    conversion_date: manifest.report_through,
    selected_grain: null,
    decision: { purpose: "disposable_growth_e2e" },
  };
  const firstImport = await api(operator.page, "/admin/growth/spend/commit", { method: "POST", body: spendBody });
  expect(firstImport).toMatchObject({ status: 200, body: { duplicate_file: false, inserted_rows: 1 } });
  const replayImport = await api(operator.page, "/admin/growth/spend/commit", { method: "POST", body: spendBody });
  expect(replayImport).toMatchObject({ status: 200, body: { duplicate_file: true, inserted_rows: 0 } });

  const query = `from=${manifest.report_from}&through=${manifest.report_through}`;
  const overviewReply = await api(operator.page, `/admin/growth/overview?${query}`);
  expect(overviewReply.status).toBe(200);
  const overview = overviewReply.body as any;
  expect(overview.funnel).toEqual({
    landing_sessions: manifest.expected_landing_sessions,
    registered_weddings: manifest.expected_registered_weddings,
    activated_weddings: manifest.expected_activated_weddings,
    returned_weddings_days_1_to_7: manifest.expected_returned_weddings,
    paid_weddings_within_30d: manifest.expected_paid_weddings,
  });

  const campaignReply = await api(operator.page, `/admin/growth/campaigns?${query}`);
  expect(campaignReply.status).toBe(200);
  const paid = (campaignReply.body as any).items.find((row: any) => row.campaign === "growth_pilot");
  expect(paid).toMatchObject({
    source: "instagram",
    spend_aud_minor: 12_000,
    first_party_landing_sessions: 1,
    registered_weddings: 1,
    activated_weddings: 1,
    returned_weddings_days_1_to_7: 1,
    paid_weddings_within_30d: 1,
    gross_minor: manifest.expected_gross_minor,
    refunded_minor: manifest.expected_refunded_minor,
  });

  await expect(operator.page.getByRole("heading", { name: "Campaign analytics" })).toBeVisible();
  await operator.page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(operator.page.getByText("2", { exact: true }).first()).toBeVisible();
  await operator.page.getByRole("tab", { name: "Campaigns" }).click();
  await expect(operator.page.getByText("growth_pilot", { exact: true }).first()).toBeVisible();
  const accessibility = await new AxeBuilder({ page: operator.page }).analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);

  await ordinary.context.close();
  await operator.context.close();
});
