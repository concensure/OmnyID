import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

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

async function completeReport(card: Locator, commit: string, hosted: string) {
  for (const checkbox of await card.locator("input[type=checkbox]").all()) await checkbox.check();
  await card.getByLabel("Named person / authority").fill("Independent reviewer");
  await card.getByLabel("Recorded at (RFC 3339)").fill("2026-10-27T12:00:00Z");
  await card.getByLabel("Evidence reference").fill("controlled/report.json");
  await card.getByLabel("Evidence SHA-256").fill("c".repeat(64));
  await card.getByLabel("Reviewed source commit (from report)").fill(commit);
  await card.getByLabel("Reviewed hosted URL (from report)").fill(hosted);
  await card.getByLabel("Gate status").selectOption("passed");
}

for (const [filename, gate] of [
  ["human-review-form.html", "HUM-ACCESS-01"],
  ["email-worker-security-review.html", "MAIL-EXT-01"],
  ["release-gate-control.html", "REL-EXT-01"],
]) {
  test(`${filename} rejects evidence from another source or hosted environment`, async ({ page }) => {
    const commit = "a".repeat(40), successor = "b".repeat(40), hosted = "https://review.example.test/workspace/";
    await page.goto(`http://127.0.0.1:${port}/${filename}?commit=${commit}`);
    await expect(page.locator("#sourceCommit")).toHaveValue(commit);
    await page.locator("#runtimeCommit").fill(commit); await page.locator("#hostedUrl").fill(hosted);
    const card = page.locator(`#gate-${gate}`);
    await completeReport(card, commit, hosted);
    await expect(page.locator("#gateProgress")).toContainText("1/3 human gates passed");
    await page.locator("#sourceCommit").fill(successor); await page.locator("#runtimeCommit").fill(successor);
    await expect(page.locator("#gateProgress")).toContainText("0/3 human gates passed");
    await expect(card.locator(".muted")).toContainText("Not valid for this candidate");
    await expect(page.locator("#exportFinal")).toBeDisabled();
    await expect(page.locator(".nav a[href*='.html']").first()).toHaveAttribute("href", new RegExp(`commit=${successor}`));
    await page.reload(); await expect(card.getByLabel("Reviewed source commit (from report)")).toHaveValue(commit);
    await page.locator("#sourceCommit").fill(commit); await page.locator("#runtimeCommit").fill(commit);
    await page.locator("#hostedUrl").fill("https://other.example.test/workspace/");
    await expect(page.locator("#gateProgress")).toContainText("0/3 human gates passed");
  });
}

test("signed export requires report bindings, completed automation and matching sign-off context", async ({ page }) => {
  // Keep this explicit override so the contract stays isolated from future autonomous-work additions.
  await page.route("**/gate-execution-configs.js", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.GATE_PROTOCOL_CONFIG.remaining = [];` });
  });
  await page.reload();
  const commit = "d".repeat(40), hosted = "https://review.example.test/";
  await page.locator("#sourceCommit").fill(commit); await page.locator("#runtimeCommit").fill(commit);
  await page.locator("#hostedUrl").fill(hosted); await page.locator("#packetOwner").fill("Owner");
  for (const card of await page.locator(".gate").all()) await completeReport(card, commit, hosted);
  await page.locator("#decision").selectOption("approve"); await page.locator("#signedBy").fill("Approver");
  await page.locator("#signedAt").fill("2026-10-27T13:00:00Z");
  await expect(page.locator("#exportFinal")).toBeEnabled();
  await page.locator("#runtimeCommit").fill("f".repeat(40));
  await expect(page.locator("#exportFinal")).toBeDisabled();
  await page.locator("#runtimeCommit").fill(commit);
  await page.locator("#hostedUrl").fill("javascript:alert(1)");
  await expect(page.locator("#exportFinal")).toBeDisabled();
});

test("clear confirmation traps keyboard focus until dismissed", async ({ page }) => {
  await page.locator("#clearOpen").click();
  await page.keyboard.press("Shift+Tab"); await expect(page.locator("#clearConfirm")).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.locator("#clearCancel")).toBeFocused();
});
