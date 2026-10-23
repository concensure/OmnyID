import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const formPath = resolve(import.meta.dirname, "../../../Documents/issues/wedding planner/human-review-form.html");
const port = 4193;
const url = `http://127.0.0.1:${port}/human-review-form.html`;
let server: Server;

test.beforeAll(async () => {
  const form = await readFile(formPath);
  server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(form);
  });
  await new Promise<void>((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveReady);
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()));
});

test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("keyboard selection keeps focus on the selected review answer", async ({ page }) => {
  const answer = page.locator('input[name="r-memory_fidelity"][value="pass"]');
  await answer.focus();
  await page.keyboard.press("Space");

  await expect(answer).toBeChecked();
  await expect(answer).toBeFocused();
  await expect(answer.locator("xpath=..")).toHaveClass(/sel-pass/);
  await expect(page.locator("#barText")).toContainText("0 of 9 dimensions answered");
});

test("package generation ignores an overlapping second activation", async ({ page }) => {
  let downloadCount = 0;
  page.on("download", () => downloadCount++);
  await page.evaluate(() => {
    const digest = window.crypto.subtle.digest.bind(window.crypto.subtle);
    Object.defineProperty(window.crypto.subtle, "digest", {
      configurable: true,
      value: async (...args: Parameters<SubtleCrypto["digest"]>) => {
        await new Promise((resolveDelay) => window.setTimeout(resolveDelay, 150));
        return digest(...args);
      },
    });
  });
  await page.getByLabel("Version code").fill("a".repeat(40));
  await page.getByLabel("Your name").fill("Independent Reviewer");
  await page.getByLabel(/I did not build this feature/).check();
  await page.locator('input[name="r-memory_fidelity"][value="pass"]').check();
  await page.getByLabel("What did you look at, and what did you see? (required)").first().fill("Checked exact recall and private context boundaries.");

  const make = page.getByRole("button", { name: "Download review package (.zip)" });
  const download = page.waitForEvent("download");
  await make.click({ noWaitAfter: true });
  await expect(page.locator("#make")).toHaveAttribute("aria-busy", "true");
  await page.locator("#make").evaluate((button) => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await download;
  await expect(page.locator("#make")).not.toHaveAttribute("aria-busy", "true");

  expect(downloadCount).toBe(1);
  await expect(page.locator("#problems")).toContainText("1 of 9 record files created");
});
