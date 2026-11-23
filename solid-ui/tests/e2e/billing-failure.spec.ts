import { expect, test } from "@playwright/test";

test("billing failure stays inline after authenticated workspace mount", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("omnyid.preview.session", JSON.stringify({
    token: "synthetic-session", user: { id: "billing-fixture", email: "billing@omnyid.test", display_name: "Billing fixture", auth_provider: "google" },
  })));
  let billingRequests = 0;
  await page.route("**/billing/status", async route => {
    billingRequests++;
    await route.fulfill({ status: 500, body: "internal server error" });
  });
  await page.route("**/admin/**", route => route.fulfill({ status: 403, body: "forbidden" }));
  await page.route("**/operator/**", route => route.fulfill({ status: 403, body: "forbidden" }));
  await page.goto("/workspace/e2e/billing-failure.html");
  await expect(page.getByText("Unable to load billing status right now.", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace remains available" })).toBeVisible();
  await expect(page.getByText("Workspace crashed", { exact: false })).toHaveCount(0);
  expect(billingRequests).toBe(1);
});
