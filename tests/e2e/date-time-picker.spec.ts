import { expect, test } from "@playwright/test";
import { createCalendarMockState, installCalendarLayoutMocks, openCalendarLayoutPreview } from "./calendar-layout-fixtures";

test("custom appointment date-time controls stay English and usable on a small iPhone", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One deterministic Chromium run covers the custom control.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  await page.setViewportSize({ width: 320, height: 568 });
  await installCalendarLayoutMocks(page, createCalendarMockState());
  await openCalendarLayoutPreview(page);
  await page.getByRole("button", { name: "New appointment" }).first().click();

  const editor = page.getByRole("dialog", { name: "Create appointment" });
  await expect(editor.locator('input[type="date"], input[type="time"], input[type="datetime-local"]')).toHaveCount(0);
  const start = editor.getByLabel("Start");
  await expect(start).toHaveValue(/\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2} (AM|PM)/);
  await start.fill("08/18/2026 10:30 AM");
  await start.press("Tab");
  await expect(start).toHaveValue("08/18/2026 10:30 AM");

  await start.click();
  const picker = editor.getByRole("dialog", { name: "Start picker" });
  await expect(picker).toContainText("August 2026");
  for (const weekday of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
    await expect(picker.getByText(weekday, { exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await editor.textContent()).not.toMatch(/[\u3400-\u9fff]/);
});
