import AxeBuilder from "@axe-core/playwright";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";

const projectRoot = resolve(import.meta.dirname, "../../..");
const port = 4191;
const origin = `http://127.0.0.1:${port}`;

const routeAliases: Record<string, string> = {
  "/vendors": "docs/vendors.html",
  "/vendors/": "docs/vendors.html",
  "/vendors.css": "docs/vendors.css",
};

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

let server: Server;

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", origin).pathname;
      const alias = routeAliases[pathname];
      const relativePath = alias ?? `${pathname.replace(/^\/+/, "")}${pathname.endsWith("/") ? "index.html" : ""}`;
      const absolutePath = resolve(projectRoot, relativePath);
      if (!absolutePath.startsWith(`${projectRoot}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(absolutePath);
      response.writeHead(200, { "Content-Type": mimeTypes[extname(absolutePath)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise<void>((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveReady);
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()));
});

const pages = [
  { path: "/vendors", heading: "Reply while the couple is ready to decide.", cta: "Join the vendor pilot", href: /source=vendor_acquisition/ },
  { path: "/wedding/wedding-planning-without-decision-overload/", heading: "Stop carrying the whole wedding in your head.", cta: "Get my calm plan in 3 minutes", href: /source=listicle_overloaded/ },
  { path: "/wedding/wedding-planning-relationship-stress/", heading: "You are getting married. You should not have to manage your partner.", cta: "Start planning together in 3 minutes", href: /source=listicle_partners/ },
  { path: "/wedding/get-wedding-vendors-to-reply/", heading: "Make it easier for the right wedding vendors to answer you.", cta: "Get my vendor-response plan in 3 minutes", href: /source=listicle_vendor_reply/ },
];

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  for (const pageContract of pages) {
    test(`${pageContract.path} stays usable at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const response = await page.goto(`${origin}${pageContract.path}`, { waitUntil: "networkidle" });

      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: pageContract.heading })).toBeVisible();
      await expect(page.getByRole("link", { name: pageContract.cta }).first()).toHaveAttribute("href", pageContract.href);
      const overflow = await page.locator("body *").evaluateAll((elements) => elements
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left < -0.5 || bounds.right > document.documentElement.clientWidth + 0.5;
        })
        .slice(0, 5)
        .map((element) => ({
          className: element.className,
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
          tag: element.tagName,
          text: element.textContent?.trim().slice(0, 80),
        })));
      expect(overflow).toEqual([]);

      if (pageContract.path.startsWith("/wedding/")) {
        const stickyCta = page.locator(".mobile-cta");
        if (viewport.width < 620) await expect(stickyCta).toBeVisible();
        else await expect(stickyCta).toBeHidden();
      }

      const accessibility = await new AxeBuilder({ page }).analyze();
      expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
    });
  }
}
