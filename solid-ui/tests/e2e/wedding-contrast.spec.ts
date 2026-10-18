import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function assertAccessible(page: Page) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
}

async function assertActionContrastAndTargets(page: Page) {
  const results = await page.locator("button, a[target='_blank'], [role='button']").evaluateAll((elements) => {
    const rgba = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
    const luminance = (rgb: number[]) => {
      const linear = rgb.slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
    };
    return elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return [];
      let current: Element | null = element;
      let background = [255, 255, 255, 1];
      while (current) {
        const parsed = rgba(getComputedStyle(current).backgroundColor);
        if ((parsed[3] ?? 1) > 0) { background = parsed; break; }
        current = current.parentElement;
      }
      const foreground = rgba(getComputedStyle(element).color);
      const light = Math.max(luminance(foreground), luminance(background));
      const dark = Math.min(luminance(foreground), luminance(background));
      return [{
        label: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName,
        contrast: (light + 0.05) / (dark + 0.05),
        width: rect.width,
        height: rect.height,
      }];
    });
  });
  for (const result of results) {
    expect(result.contrast, `${result.label} contrast`).toBeGreaterThanOrEqual(4.5);
    expect(result.width, `${result.label} target width`).toBeGreaterThanOrEqual(44);
    expect(result.height, `${result.label} target height`).toBeGreaterThanOrEqual(44);
  }
}

async function openCleanFixture(page: Page) {
  await page.goto("/workspace/e2e/wedding-closure-fixture.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
  test(`vendor loop is durable, readable, and accessible at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openCleanFixture(page);
    const primary = page.getByRole("button", { name: "Check availability" });
    const website = page.getByRole("link", { name: "Website", exact: true });
    await expect(primary).toBeVisible();
    await expect(website).toBeVisible();
    await expect(page.locator("article")).toHaveCount(1);
    const [primaryColor, websiteColor] = await Promise.all([
      primary.evaluate((element) => getComputedStyle(element).color),
      website.evaluate((element) => getComputedStyle(element).color),
    ]);
    expect(primaryColor).toBe(websiteColor);
    await assertAccessible(page);
    await assertActionContrastAndTargets(page);

    await primary.click();
    await expect(page.getByRole("heading", { name: /Draft ready/ })).toBeVisible();
    await expect(page.getByTestId("draft-persisted")).toContainText("yes");
    await assertAccessible(page);
    await page.getByTestId("send-draft").click();
    await expect(page.getByRole("heading", { name: "Enquiry sent" })).toBeVisible();
    await page.getByRole("button", { name: "Receive vendor reply" }).click();
    await expect(page.getByText("Needs your response")).toBeVisible();
    await page.getByRole("button", { name: "Open quote decision" }).click();
    await page.getByRole("button", { name: "Defer until later" }).click();
    await expect(page.getByRole("heading", { name: "Quote deferred" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Quote deferred" })).toBeVisible();
    await assertAccessible(page);
    await page.getByRole("button", { name: "Resolve quote" }).click();
    await expect(page.getByRole("heading", { name: "Quote resolved" })).toBeVisible();
  });

  test(`category replacement, shortfall retry, and second context remain bounded at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openCleanFixture(page);
    await page.getByLabel("Master-agent category").fill("florist");
    await page.getByRole("button", { name: "Search from master agent" }).click();
    await expect(page.getByRole("heading", { name: /Florist Harbour House/ })).toBeVisible();
    await page.getByLabel("Vendor field category").fill("photographer");
    await page.getByRole("button", { name: "Search from vendor field" }).click();
    await expect(page.getByRole("heading", { name: /Photographer Harbour House/ })).toBeVisible();
    await page.getByRole("button", { name: "Simulate shortfall" }).click();
    await expect(page.getByRole("heading", { name: "Only two suitable choices found" })).toBeVisible();
    await assertAccessible(page);
    await page.getByRole("button", { name: "Retry directory and online" }).click();
    await page.getByRole("button", { name: "Add second context" }).click();
    await expect(page.getByTestId("context-count")).toHaveText("2");
    await expect(page.locator("article")).toHaveCount(1);
    await assertActionContrastAndTargets(page);
  });
}
