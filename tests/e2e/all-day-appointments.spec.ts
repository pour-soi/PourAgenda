import { expect, test } from "@playwright/test";
import { createCalendarMockState, openCalendarLayoutPreview, previewAppointment } from "./calendar-layout-fixtures";

test("all-day dates render and rehydrate without a timezone shift", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One Chromium project covers date-only FullCalendar conversion.");
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "The guarded layout preview is local-only.");

  const sameDay = {
    ...previewAppointment("all-day-same", "Aug 2 only", "personal", "2026-08-02T00:00:00.000Z", "2026-08-03T00:00:00.000Z", true),
    timezone: "America/Los_Angeles",
    intended_local_start: "2026-08-02 00:00:00",
    intended_local_end: "2026-08-02 00:00:00",
  };
  const multiDay = {
    ...previewAppointment("all-day-multi", "Aug 2 through Aug 4", "personal", "2026-08-02T00:00:00.000Z", "2026-08-05T00:00:00.000Z", true),
    timezone: "America/Los_Angeles",
    intended_local_start: "2026-08-02 00:00:00",
    intended_local_end: "2026-08-04 00:00:00",
  };
  const state = createCalendarMockState();
  state.appointments = [sameDay, multiDay];
  await openCalendarLayoutPreview(page, state);
  await page.evaluate(() => window.__pourAgendaCalendar?.gotoDate("2026-08-02"));

  const ranges = await page.evaluate(() => ["all-day-same", "all-day-multi"].map((id) => {
    const event = window.__pourAgendaCalendar?.getEventById(id);
    return { id, start: event?.startStr, end: event?.endStr };
  }));
  expect(ranges).toEqual([
    { id: "all-day-same", start: "2026-08-02", end: "2026-08-03" },
    { id: "all-day-multi", start: "2026-08-02", end: "2026-08-05" },
  ]);

  await page.locator('[data-appointment-id="all-day-same"]').first().click();
  const dialog = page.getByRole("dialog", { name: "Edit appointment" });
  await expect(dialog.getByRole("textbox", { name: "Start" })).toHaveValue("08/02/2026");
  await expect(dialog.getByRole("textbox", { name: "End" })).toHaveValue("08/02/2026");
});
