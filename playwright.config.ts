import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

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
        command: "node node_modules/next/dist/bin/next dev --webpack",
        url: "http://localhost:3000",
        // A reused Windows Next.js child can retain the invoking process's
        // output handles after its original Playwright parent exits. Own the
        // local server so teardown always terminates the complete process tree.
        reuseExistingServer: false,
        env: {
          POURAGENDA_LAYOUT_PREVIEW: "1",
          NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.resolve(
            "tests/e2e/next-font-mocked-responses.cjs",
          ),
        },
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"] } },
    { name: "modern-iphone", use: { ...devices["iPhone 13"] } },
    { name: "small-iphone", use: { ...devices["iPhone SE"] } },
    { name: "iphone-landscape", use: { ...devices["iPhone 13 landscape"] } },
  ],
});
