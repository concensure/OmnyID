import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }]) {
  test(`planning constraint confirmation stays bounded at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/workspace/e2e/wedding-planning-constraint-capture.html", { waitUntil: "networkidle" });
    await expect(page.getByText("Anything we should remember?")).toBeVisible();

    await page.getByLabel("Planning note").fill("We need step-free access.");
    await page.getByRole("button", { name: "Review before saving" }).click();
    await expect(page.getByText("Step-free access", { exact: true })).toBeVisible();
    await expect(page.getByText(/From your note: “step-free”/)).toBeVisible();
    await expect(page.getByText(/model|provider|payload|postgres/i)).toHaveCount(0);

    const confirm = page.getByRole("button", { name: "Confirm must-have" });
    const confirmBox = await confirm.boundingBox();
    expect(confirmBox?.height).toBeGreaterThanOrEqual(44);
    await confirm.click();
    await expect(page.getByText("Saved: Step-free access.")).toBeVisible();
    const bodies = await page.evaluate(() => (window as unknown as { __confirmedPlanningConstraintBodies: Array<{ constraint: { authority: string; status: string } }> }).__confirmedPlanningConstraintBodies);
    expect(bodies[0]?.constraint.authority).toBe("user");
    expect(bodies[0]?.constraint.status).toBe("confirmed");

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
  });
}
