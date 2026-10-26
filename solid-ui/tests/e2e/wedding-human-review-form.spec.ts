import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { expect, test } from "@playwright/test";

const reviewRoot = resolve(import.meta.dirname, "../../../Documents/issues/wedding planner");
const port = 4193;
const url = `http://127.0.0.1:${port}/human-review-form.html`;
let server: Server;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const name = (request.url || "/human-review-form.html").split("?")[0].replace(/^\/+/, "");
    if (!/^[a-z0-9.-]+$/i.test(name)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(resolve(reviewRoot, name));
      const type = extname(name) === ".js" ? "text/javascript" : extname(name) === ".css" ? "text/css" : "text/html";
      response.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((ready, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", ready);
  });
});

test.afterAll(async () => {
  await new Promise<void>((closed, reject) => server.close((error) => error ? reject(error) : closed()));
});

test.beforeEach(async ({ page }) => {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("gate actions update in place without losing keyboard focus", async ({ page }) => {
  const action = page.locator("#gate-HUM-ACCESS-01 input[type=checkbox]").first();
  await action.focus();
  await page.keyboard.press("Space");

  await expect(action).toBeChecked();
  await expect(action).toBeFocused();
  await expect(page.locator("#gateProgress")).toContainText("0/3 human gates passed");
});

test("frozen commit and gate evidence survive reload", async ({ page }) => {
  const commit = "a".repeat(40);
  await page.getByLabel("Frozen source commit").fill(commit);
  await page.getByLabel("Hosted runtime commit").fill(commit);
  await page.locator("#gate-HUM-ACCESS-01 input[type=checkbox]").first().check();
  await page.reload();

  await expect(page.getByLabel("Frozen source commit")).toHaveValue(commit);
  await expect(page.getByLabel("Hosted runtime commit")).toHaveValue(commit);
  await expect(page.locator("#gate-HUM-ACCESS-01 input[type=checkbox]").first()).toBeChecked();
  await expect(page.locator("#freezeStatus")).toContainText("match");
});

test("clear confirmation is keyboard reachable and cancel restores focus", async ({ page }) => {
  const open = page.getByRole("button", { name: "Clear browser copy" });
  await open.focus();
  await open.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(open).toBeFocused();
});
