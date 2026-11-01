import { defineConfig } from "@playwright/test";

const baseURL = process.env.OMNYID_E2E_UI_ORIGIN?.trim();
if (!baseURL || !/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL)) {
  throw new Error("OMNYID_E2E_UI_ORIGIN must be a loopback HTTP origin");
}

export default defineConfig({
  testDir: "./tests/e2e-full-account",
  testMatch: /wedding-full-account\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
