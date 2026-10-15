import { expect, test } from "@playwright/test";

test("captures the 360px sparse Bondi vendor ranking baseline", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/workspace/e2e/wedding-personalised-recommendation-baseline.html", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Bondi Icebergs Club" })).toBeVisible();
  await expect(page.getByText("Intimacy", { exact: true })).toBeVisible();
  await expect(page.getByText("Not confirmed yet")).toBeVisible();
  await expect(page.getByText("Bondi, Sydney")).toBeVisible();
  await expect(page.getByText("Matches the information on record")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("bondi-v1-mobile-baseline.png"), fullPage: true });
});
