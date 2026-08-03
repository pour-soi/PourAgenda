import { expect, test, type Page } from "@playwright/test";
import { createCalendarMockState, installCalendarLayoutMocks } from "./calendar-layout-fixtures";

async function openPreview(page: Page, timeFormat: "12h" | "24h") {
  await installCalendarLayoutMocks(page, createCalendarMockState());
  await page.clock.setFixedTime(new Date("2026-07-29T18:00:00.000Z"));
  await page.goto(`/privacy/layout-preview?timeFormat=${timeFormat}`);
  await page.getByRole("heading", { name: "Your calendar" }).waitFor();
}

test("24-hour format controls calendar, summaries, editor, and search on desktop and mobile", async ({ page }, testInfo) => {
  test.skip(!["desktop", "modern-iphone"].includes(testInfo.project.name), "Desktop and modern iPhone cover both responsive layouts.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  await openPreview(page, "24h");

  if (testInfo.project.name === "desktop") {
    await expect(page.locator('[data-appointment-id="preview-1"] .calendar-event-time')).toContainText("16:00");
  }
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.locator(".fc-timegrid-slot-label").filter({ hasText: "13:00" }).first()).toBeVisible();
  if (testInfo.project.name === "modern-iphone") {
    expect(await page.locator("body").innerText()).not.toMatch(/\b(?:AM|PM)\b/);
    return;
  }
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(page.getByText("Free until 20:00")).toBeVisible();
  await expect(page.locator('[data-appointment-id="preview-1"] .calendar-event-time')).toContainText("16:00");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(page.locator('[data-appointment-id="preview-1"] .fc-list-event-time')).toContainText(/16:00.*17:30/);

  await page.locator('[data-appointment-id="preview-1"]').click();
  const editor = page.getByRole("dialog", { name: "Edit appointment" });
  await expect(editor.getByRole("button", { name: "Choose start time" })).toContainText("16:00");
  await editor.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Search events" }).click();
  const search = page.getByRole("dialog", { name: "Search events" });
  await search.getByPlaceholder("Search your calendar").fill("Design");
  await expect(search.getByRole("option").first()).toContainText("20:00");
  expect(await page.locator("body").innerText()).not.toMatch(/\b(?:AM|PM)\b/);
});

test("12-hour format retains AM and PM labels", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One desktop project covers the explicit 12-hour override.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  await openPreview(page, "12h");
  await expect(page.locator('[data-appointment-id="preview-1"] .calendar-event-time')).toContainText("4:00 PM");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.locator(".fc-timegrid-slot-label").filter({ hasText: "1:00 PM" }).first()).toBeVisible();
});
