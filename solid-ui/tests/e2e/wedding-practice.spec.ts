import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { practiceFixture } from "../fixtures/wedding-practice";

async function mock(page: Page, state = { revoked: false, fail: false, disabled: false }) {
  await page.route("**/fixture-practice?*", async route => {
    if (state.fail) return route.fulfill({ status: 503, body: "fixture failure" });
    const practice = new URL(route.request().url()).searchParams.get("practice") || null;
    const data = practiceFixture(practice);
    if (state.revoked) { data.status = "forbidden"; data.practices = []; data.clients = []; data.next_action = null; data.selected_practice_id = null; }
    if (state.disabled) { data.status = "unavailable"; data.professional_planner = false; data.practices = []; data.clients = []; data.next_action = null; data.selected_practice_id = null; }
    await route.fulfill({ json: data });
  });
}
for (const width of [360, 320, 1280]) {
  test(`practice home, context and client actions remain accessible at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 800 }); await mock(page);
    await page.goto("/workspace/e2e/wedding-practice-fixture.html?practice=harbour");
    await expect(page.getByRole("heading", { name: "Harbour & Pine Events" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Workspace" })).toHaveValue("harbour");
    await expect(page.getByRole("heading", { name: "Priya & Daniel", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`practice-home-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: /Replies and approvals/ }).click();
    await expect(page.getByRole("status")).toContainText("1 matching client");
    await page.getByRole("link", { name: /View client summary/ }).click();
    await expect(page.getByRole("heading", { name: "Priya & Daniel" })).toBeVisible();
    await page.goBack(); await expect(page.getByRole("status")).toContainText("1 matching client");
    await page.reload(); await expect(page.getByRole("status")).toContainText("1 matching client");
    await page.getByRole("combobox", { name: "Workspace" }).selectOption("garden");
    await expect(page.getByRole("heading", { name: "Garden Gatherings" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Workspace" })).toHaveValue("garden");
    await expect(page.getByText("Priya & Daniel", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Mei & Alex", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (width < 700) await expect(page.getByRole("navigation", { name: "Practice mobile", exact: true }).getByRole("link")).toHaveCount(5);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
}
test("revocation and request failure remove private data and expose safe recovery", async ({ page }) => {
  const state = { revoked: false, fail: false, disabled: false }; await mock(page, state);
  await page.goto("/workspace/e2e/wedding-practice-fixture.html?practice=harbour");
  await expect(page.getByRole("heading", { name: "Priya & Daniel", exact: true })).toBeVisible();
  state.revoked = true; await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You no longer have access to this practice" })).toBeVisible();
  await expect(page.getByText("Priya & Daniel", { exact: true })).toHaveCount(0);
  state.revoked = false; state.fail = true; await page.reload();
  await expect(page.getByRole("alert")).toContainText("Please try again");
  state.fail = false; await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Priya & Daniel", exact: true })).toBeVisible();
});
test("Back restores client search and scroll after a summary visit", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.route("**/fixture-practice?*", route => {
    const data = practiceFixture(); const original = data.clients[0];
    data.clients = Array.from({ length: 50 }, (_, i) => ({ ...original, summary: { ...original.summary,
      client_label: `Client ${i}`, plan: { account_id: `owner-${i}`, plan_id: `plan-${i}`, thread_id: `thread-${i}` } } }));
    data.next_action = null;
    return route.fulfill({ json: data });
  });
  await page.goto("/workspace/e2e/wedding-practice-fixture.html?practice=harbour&page=clients");
  await page.getByRole("searchbox", { name: "Find a client" }).fill("Client 4");
  const target = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Client 45", exact: true }) }).getByRole("link");
  await target.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  await target.click(); await expect(page.getByRole("heading", { name: "Client 45", exact: true })).toBeVisible();
  await page.goBack(); await expect(page.getByRole("searchbox", { name: "Find a client" })).toHaveValue("Client 4");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 100);
});
test("dark account has no professional navigation; client deep links recheck full scope", async ({ page }) => {
  const state = { revoked: false, fail: false, disabled: true }; await mock(page, state);
  await page.goto("/workspace/e2e/wedding-practice-fixture.html?practice=harbour");
  await expect(page.getByRole("heading", { name: "Professional workspace is not available for this account" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Practice", exact: true })).toHaveCount(0);
  state.disabled = false;
  await page.goto("/workspace/e2e/wedding-practice-fixture.html?practice=harbour&page=clients&owner=intruder&plan=priya&thread=thread-priya");
  await expect(page.getByRole("heading", { name: "This client is not available" })).toBeVisible();
});
test("keyboard skip and context controls retain useful focus", async ({ page }) => {
  await mock(page); await page.goto("/workspace/e2e/wedding-practice-fixture.html");
  await expect(page.getByRole("heading", { name: "Choose your workspace" })).toBeVisible();
  await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Skip to workspace" })).toBeFocused();
  await page.getByRole("combobox", { name: "Workspace" }).focus();
  await page.keyboard.press("h"); await page.keyboard.press("Enter");
  await page.getByRole("combobox", { name: "Workspace" }).selectOption("harbour");
  await expect(page.getByRole("heading", { name: "What needs you now?" })).toBeVisible();
});
