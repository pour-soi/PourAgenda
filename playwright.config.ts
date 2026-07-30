import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  // Live suites intentionally share two reusable Supabase accounts. Serial
  // execution prevents one test's sign-out or settings cleanup invalidating
  // another test's authenticated session.
  workers: 1,
  use: { baseURL: externalBaseURL ?? "http://localhost:3000", trace: "on-first-retry" },
  webServer: externalBaseURL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        env: { POURAGENDA_LAYOUT_PREVIEW: "1" },
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"] } },
    { name: "modern-iphone", use: { ...devices["iPhone 13"] } },
    { name: "small-iphone", use: { ...devices["iPhone SE"] } },
    { name: "iphone-landscape", use: { ...devices["iPhone 13 landscape"] } },
  ],
});
