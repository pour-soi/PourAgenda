import { expect, test, type Page } from "@playwright/test";
import { createCalendarMockState, installCalendarLayoutMocks, previewAppointment } from "./calendar-layout-fixtures";

test.use({ timezoneId: "America/Los_Angeles" });

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

test("automatic timezone converts UTC consistently in calendar, Upcoming, and editor", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(!["desktop", "modern-iphone"].includes(testInfo.project.name), "Desktop Chromium and mobile WebKit cover browser and PWA layouts.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");
  const state = createCalendarMockState();
  state.appointments = [
    previewAppointment("video-doctor", "Video-doctor", "focus", "2026-08-18T16:10:00.000Z", "2026-08-18T17:30:00.000Z"),
  ];
  await installCalendarLayoutMocks(page, state);
  await page.clock.setFixedTime(new Date(testInfo.project.name === "modern-iphone"
    ? "2026-08-18T16:10:00.000Z"
    : "2026-08-18T15:00:00.000Z"));
  await page.goto("/privacy/layout-preview?timeFormat=24h&automaticTimezone=true");
  await page.getByRole("heading", { name: "Your calendar" }).waitFor();

  if (testInfo.project.name === "modern-iphone") {
    await page.getByRole("button", { name: "New appointment" }).last().click();
    let editor = page.getByRole("dialog", { name: "Create appointment" });
    await expect(editor.getByRole("button", { name: "Choose start time" })).toContainText("09:10");
    await editor.getByRole("button", { name: "Close" }).click();
    await page.reload();
    await page.getByRole("button", { name: "New appointment" }).last().click();
    editor = page.getByRole("dialog", { name: "Create appointment" });
    await expect(editor.getByRole("button", { name: "Choose start time" })).toContainText("09:10");
    return;
  }

  await page.locator(".fc").waitFor();
  await page.waitForFunction(() => Boolean(window.__pourAgendaCalendar));
  await page.evaluate(() => window.__pourAgendaCalendar?.gotoDate("2026-08-18"));

  const upcoming = page.getByRole("button", { name: /Video-doctor.*09:10/ });
  await expect(upcoming).toBeVisible({ timeout: 15_000 });
  await upcoming.click();
  const editor = page.getByRole("dialog", { name: "Edit appointment" });
  await expect(editor.getByRole("button", { name: "Choose start time" })).toContainText("09:10");
  await expect(editor.getByRole("button", { name: "Choose end time" })).toContainText("10:30");
  await editor.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(page.locator('[data-appointment-id="video-doctor"] .fc-list-event-time')).toContainText(/09:10.*10:30/);

  await page.reload();
  await page.locator(".fc").waitFor();
  await page.waitForFunction(() => Boolean(window.__pourAgendaCalendar));
  await page.evaluate(() => window.__pourAgendaCalendar?.gotoDate("2026-08-18"));
  await expect(page.locator('[data-appointment-id="video-doctor"] .fc-list-event-time')).toContainText(/09:10.*10:30/);
});
