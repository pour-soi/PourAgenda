import { expect, test, type Page } from "@playwright/test";
import { createCalendarMockState, installCalendarLayoutMocks } from "./calendar-layout-fixtures";

async function openEditor(page: Page, timeFormat: "locale" | "12h" | "24h" = "12h") {
  await installCalendarLayoutMocks(page, createCalendarMockState());
  await page.clock.setFixedTime(new Date("2026-07-29T18:00:00.000Z"));
  await page.goto(`/privacy/layout-preview?timeFormat=${timeFormat}`);
  await page.getByRole("heading", { name: "Your calendar" }).waitFor();
  await page.getByRole("button", { name: "New appointment" }).first().click();
  return page.getByRole("dialog", { name: "Create appointment" });
}

test("Date and Time are separate selection-only controls across mobile layouts", async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    const editor = await openEditor(page);
    const startDate = editor.getByRole("button", { name: "Choose start date" });
    const startTime = editor.getByRole("button", { name: "Choose start time" });
    await expect(startDate).toBeVisible();
    await expect(startTime).toBeVisible();
    await expect(editor.locator('.date-time-picker input:not([readonly])')).toHaveCount(0);
    for (const control of [startDate, startTime]) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await startDate.click();
    await expect(editor.getByRole("dialog", { name: "Start date picker" })).toBeVisible();
    await expect(editor.getByRole("dialog", { name: "Start time picker" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(startDate).toBeFocused();
    await startTime.click();
    const timeDialog = editor.getByRole("dialog", { name: "Start time picker" });
    await expect(timeDialog).toBeVisible();
    await expect(editor.getByRole("dialog", { name: "Start date picker" })).toHaveCount(0);
    await expect(timeDialog.getByRole("textbox")).toHaveCount(0);
    await timeDialog.getByRole("button", { name: "Done" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("date selection persists and all-day mode hides every time control", async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  const editor = await openEditor(page);
  await editor.getByRole("button", { name: "Choose start date" }).click();
  const dateDialog = editor.getByRole("dialog", { name: "Start date picker" });
  await dateDialog.getByRole("button", { name: "30", exact: true }).click();
  await dateDialog.getByRole("button", { name: "Done" }).click();
  await expect(editor.getByRole("button", { name: "Choose start date" })).toContainText("07/30/2026");
  await editor.getByLabel("All-day appointment").check();
  await expect(editor.getByRole("button", { name: /Choose .* time/ })).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Choose start date" })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Choose end date" })).toBeVisible();
});

test("12-hour, 24-hour, and system formats expose the correct selection controls", async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  const editor12 = await openEditor(page, "12h");
  await editor12.getByRole("button", { name: "Choose start time" }).click();
  const picker12 = editor12.getByRole("dialog", { name: "Start time picker" });
  await expect(picker12.getByRole("group", { name: "AM/PM" })).toBeVisible();
  await expect(picker12.getByLabel("Start hour").locator("option")).toHaveCount(12);

  const editor24 = await openEditor(page, "24h");
  await editor24.getByRole("button", { name: "Choose start time" }).click();
  const picker24 = editor24.getByRole("dialog", { name: "Start time picker" });
  await expect(picker24.getByRole("group", { name: "AM/PM" })).toHaveCount(0);
  await expect(picker24.getByLabel("Start hour").locator("option")).toHaveCount(24);

  const systemUses12Hour = await page.evaluate(() => new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 !== false);
  const systemEditor = await openEditor(page, "locale");
  await systemEditor.getByRole("button", { name: "Choose start time" }).click();
  await expect(systemEditor.getByRole("dialog", { name: "Start time picker" }).getByRole("group", { name: "AM/PM" })).toHaveCount(systemUses12Hour ? 1 : 0);
});

test("changing time selections away and back preserves the stored local timestamp", async ({ page }) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  const editor = await openEditor(page, "12h");
  const compatibilityValue = editor.locator('.date-time-picker input[aria-label="Start"]');
  const original = await compatibilityValue.inputValue();
  await editor.getByRole("button", { name: "Choose start time" }).click();
  const picker = editor.getByRole("dialog", { name: "Start time picker" });
  const originalPeriod = (await picker.getByRole("button", { pressed: true }).textContent()) as "AM" | "PM";
  const otherPeriod = originalPeriod === "AM" ? "PM" : "AM";
  await picker.getByRole("button", { name: otherPeriod, exact: true }).click();
  await picker.getByRole("button", { name: originalPeriod, exact: true }).click();
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(compatibilityValue).toHaveValue(original);
});
