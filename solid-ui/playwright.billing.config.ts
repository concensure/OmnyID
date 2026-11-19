import { defineConfig } from "@playwright/test";
export default defineConfig({
  timeout: 30_000, testDir: "./tests/e2e", testMatch: /billing-failure\.spec\.ts/, workers: 1,
  use: { baseURL: "http://127.0.0.1:4187", trace: "retain-on-failure" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 4187", url: "http://127.0.0.1:4187/workspace/e2e/billing-failure.html", reuseExistingServer: false },
});
