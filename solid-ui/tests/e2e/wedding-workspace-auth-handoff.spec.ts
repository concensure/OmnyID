import { expect, test } from "@playwright/test";

test("OAuth-style session handoff never leaves the workspace blank", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("omnyid.preview.session", JSON.stringify({
      token: "synthetic-oauth-session",
      user: {
        id: "oauth-render-regression",
        email: "oauth-render@omnyid.test",
        display_name: "OAuth render regression",
        auth_provider: "google",
      },
    }));
  });
  const startupErrors: string[] = [];
  page.on("pageerror", (error) => startupErrors.push(error.message));

  await page.goto("/workspace/?view=search&source=wedding", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).not.toBeEmpty();
  await expect(page.locator("html")).toHaveAttribute("data-workspace-mounted", "true");
  await expect(page.locator("#workspace-boot-status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reload a fresh copy" })).toHaveCount(0);
  expect(startupErrors).toEqual([]);
});

