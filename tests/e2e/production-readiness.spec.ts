import { expect, test } from "@playwright/test";
import { loginPage } from "./live-fixtures";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop" || !process.env.PLAYWRIGHT_BASE_URL,
    "Production readiness checks run once in desktop Chromium.");
});

test("production public assets, headers, and reset callback are safe", async ({ page, request }) => {
  for (const path of ["/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/sw.js", "/offline", "/privacy", "/robots.txt"]) {
    expect((await request.get(path)).ok()).toBe(true);
  }

  const login = await request.get("/login");
  const headers = login.headers();
  for (const name of ["content-security-policy", "permissions-policy", "referrer-policy", "x-content-type-options", "x-frame-options", "x-robots-tag"]) {
    expect(headers[name]).toBeTruthy();
  }
  expect(headers["x-robots-tag"]).toContain("noindex");

  const share = await request.get("/share/not-a-real-token");
  expect(share.headers()["x-robots-tag"]).toContain("noindex");
  expect(share.headers()["cache-control"]).toContain("no-store");

  await page.goto("/auth/callback?code=invalid&next=/reset-password");
  await expect(page).toHaveURL(/\/login\?error=callback$/);
});

test("production service worker serves the offline fallback", async ({ page, context }) => {
  await loginPage(page);
  const controlled = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  });
  if (!controlled) await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  try {
    await page.goto("/production-offline-smoke");
    await expect(page.getByRole("heading", { name: /offline/i })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
