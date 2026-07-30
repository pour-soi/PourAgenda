import { expect, test } from "@playwright/test";
import {
  createCalendarMockState,
  installCalendarLayoutMocks,
  openCalendarLayoutPreview,
} from "./calendar-layout-fixtures";

test("capture privacy-safe responsive calendar evidence", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One browser captures the requested viewport evidence.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  for (const [name, width, height, view] of [
    ["mobile-320", 320, 568, "Month"],
    ["mobile-375", 375, 667, "Month"],
    ["mobile", 390, 844, "Month"],
    ["mobile-430", 430, 932, "Month"],
    ["mobile-week", 390, 844, "Week"],
    ["mobile-day", 390, 844, "Day"],
    ["mobile-agenda", 390, 844, "Agenda"],
    ["iphone-landscape", 844, 390, "Week"],
    ["tablet", 768, 1024, "Month"],
    ["tablet-1024", 1024, 768, "Month"],
    ["desktop", 1440, 1000, "Month"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await openCalendarLayoutPreview(page);
    await page.getByRole("button", { name: view, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    if (name === "iphone-landscape") {
      await page.locator(".fc-timegrid-slots").scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 60));
    }
    await page.screenshot({ path: `docs/images/pouragenda-${name}.png`, fullPage: false });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await openCalendarLayoutPreview(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.getByRole("region", { name: "Upcoming" }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, window.scrollY + 100));
  await page.screenshot({ path: "docs/images/pouragenda-mobile-upcoming.png", fullPage: false });

  const emptyState = createCalendarMockState();
  emptyState.appointments = [];
  await openCalendarLayoutPreview(page, emptyState);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.getByRole("region", { name: "Upcoming" }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, window.scrollY + 100));
  await page.screenshot({ path: "docs/images/pouragenda-mobile-empty.png", fullPage: false });

  const loadingState = createCalendarMockState();
  loadingState.delayMs = 1500;
  await page.clock.setFixedTime(new Date("2026-07-29T18:00:00.000Z"));
  await installCalendarLayoutMocks(page, loadingState);
  await page.goto("/privacy/layout-preview");
  await page.getByRole("status", { name: "Loading appointments" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: "docs/images/pouragenda-mobile-loading.png", fullPage: false });
});
