import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e-public-fit",
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4193",
    trace: "retain-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["iPhone 13"] } }],
  webServer: {
    command: "npx vite ../wedding --host 127.0.0.1 --port 4193 --strictPort",
    url: "http://127.0.0.1:4193/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
