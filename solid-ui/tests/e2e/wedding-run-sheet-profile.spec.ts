import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const viewport of [{ width: 320, height: 720 }, { width: 375, height: 812 }, { width: 1280, height: 800 }]) {
  test(`run-sheet profile reflows and remains operable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/workspace/e2e/wedding-run-sheet-profile.html", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Run sheet" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Run-sheet controls" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add run-sheet item" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    if (viewport.width < 768) {
      await expect(page.getByLabel("Run-sheet items").getByRole("article")).toHaveCount(2);
      await page.getByRole("button", { name: "15 min earlier" }).first().click();
      await expect(page.getByRole("status")).toHaveText("Moved earlier");
    } else {
      await expect(page.getByLabel("Run-sheet items").getByRole("article")).toHaveCount(0);
    }

    await page.getByRole("button", { name: "Review buffer" }).click();
    await expect(page.getByRole("dialog", { name: "Review this buffer" })).toBeVisible();
    await expect(page.getByText(/does not confirm either item/i)).toBeVisible();
    await page.getByRole("button", { name: /Add 20-minute buffer/ }).click();
    await expect(page.getByRole("status")).toHaveText("Buffer approved");

    await page.getByRole("button", { name: "Add run-sheet item" }).click();
    await expect(page.getByRole("dialog", { name: "Add run-sheet item" })).toBeVisible();
    await expect(page.getByLabel("Item name")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add run-sheet item" })).toBeFocused();

    await page.getByLabel("Role view").selectOption("vendor");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("dialog", { name: "Vendor run sheet" })).toBeVisible();
    await expect(page.getByText("Exact preview · 2 items")).toBeVisible();
    await expect(page.getByText(/private notes/i)).toBeVisible();
    await expect(page.getByText("alarm code", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("button", { name: "Preview" })).toBeFocused();

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
  });
}

test("run-sheet controls preserve names, focus, and reflow at 200 percent zoom", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto("/workspace/e2e/wedding-run-sheet-profile.html", { waitUntil: "networkidle" });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });

  await expect(page.getByRole("button", { name: "Add run-sheet item" })).toBeVisible();
  await page.getByRole("button", { name: "Add run-sheet item" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Item name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Add run-sheet item" })).toBeFocused();
  const pageOverflow = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("body *"))
    .filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const insideHorizontalScroller = element.closest(".overflow-x-auto") !== null;
      return style.position !== "fixed" && !insideHorizontalScroller && rect.right > document.documentElement.clientWidth + 1;
    })
    .slice(0, 8)
    .map((element) => ({ tag: element.tagName, text: element.textContent?.trim().slice(0, 60), className: element.className })));
  expect(pageOverflow).toEqual([]);

  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.getByRole("checkbox", { name: "Needs attention only" })).toBeVisible();
  await expect(page.getByLabel("Status").getByRole("option", { name: "Needs confirmation" })).toHaveCount(1);
});

test("print preview paginates without splitting time and title rows", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/workspace/e2e/wedding-run-sheet-profile.html", { waitUntil: "networkidle" });
  await page.getByLabel("Role view").selectOption("vendor");
  await page.getByRole("button", { name: "Preview" }).click();
  await page.evaluate(() => {
    const table = document.querySelector<HTMLElement>("[data-runsheet-print] table");
    const body = table?.querySelector("tbody");
    const source = body?.querySelector("tr");
    if (!body || !source) throw new Error("print table fixture unavailable");
    body.replaceChildren();
    for (let index = 1; index <= 120; index += 1) {
      const row = source.cloneNode(true) as HTMLTableRowElement;
      const cells = Array.from(row.cells);
      cells[0]!.textContent = `08:${String(index).padStart(2, "0")}`;
      cells[2]!.textContent = `Pagination item ${String(index).padStart(2, "0")}`;
      body.append(row);
    }
    document.body.classList.add("omnyid-runsheet-printing");
  });
  await page.emulateMedia({ media: "print" });
  const pdfPath = testInfo.outputPath("vendor-run-sheet-pagination.pdf");
  await page.pdf({ path: pdfPath, landscape: true, printBackground: true, preferCSSPageSize: true });

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(await readFile(pdfPath)) }).promise;
  expect(document.numPages).toBeGreaterThan(1);
  const pageText: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const pdfPage = await document.getPage(pageNumber);
    const text = await pdfPage.getTextContent();
    pageText.push(text.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  expect(pageText[0]).toContain("KEY CONTACTS");
  for (const text of pageText.filter((value) => value.includes("Pagination item"))) {
    expect(text).toContain("Start");
    expect(text).toContain("Item");
  }
  for (let index = 1; index <= 120; index += 1) {
    const title = `Pagination item ${String(index).padStart(2, "0")}`;
    const time = `08:${String(index).padStart(2, "0")}`;
    const containingPage = pageText.find((text) => text.includes(title));
    expect(containingPage, `${title} should be present`).toBeDefined();
    expect(containingPage).toContain(time);
  }
});
