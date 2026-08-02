import { describe, expect, it } from "vitest";
import { calendarWallTimeToInstant, preferredCalendarScrollTime, responsiveCalendarView } from "./calendar-view";
import { allDayCalendarRange, allDayStorageRange } from "@/lib/appointments";

describe("responsive calendar view selection", () => {
  it("uses a readable one-day week below the mobile breakpoint", () => {
    expect(responsiveCalendarView("timeGridWeek", true)).toBe("timeGridMobileWeek");
  });

  it("restores the full week grid after rotating to a wider layout", () => {
    expect(responsiveCalendarView("timeGridMobileWeek", false)).toBe("timeGridWeek");
  });

  it("does not change Month, Day, or Agenda while resizing", () => {
    for (const view of ["dayGridMonth", "timeGridDay", "listWeek"]) {
      expect(responsiveCalendarView(view, true)).toBe(view);
      expect(responsiveCalendarView(view, false)).toBe(view);
    }
  });
});

describe("mobile time-axis starting position", () => {
  const selected = new Date(2026, 6, 29, 0, 0);

  it("starts near the current time when viewing today", () => {
    expect(preferredCalendarScrollTime(selected, [], new Date(2026, 6, 29, 12, 15))).toBe("11:15:00");
  });

  it("moves earlier for an early timed event", () => {
    expect(preferredCalendarScrollTime(selected, [
      { start: new Date(2026, 6, 29, 6, 30).toISOString(), allDay: false },
    ], new Date(2026, 6, 28, 12, 0))).toBe("06:00:00");
  });

  it("uses 7am when only all-day events exist on another date", () => {
    expect(preferredCalendarScrollTime(selected, [
      { start: new Date(2026, 6, 29, 0, 0).toISOString(), allDay: true },
    ], new Date(2026, 6, 28, 12, 0))).toBe("07:00:00");
  });
});

describe("active-timezone calendar movement", () => {
  it("converts the displayed wall time back to the active timezone instant", () => {
    const displayed = new Date(2026, 6, 29, 16, 30);
    expect(calendarWallTimeToInstant(displayed, "UTC", false).toISOString()).toBe("2026-07-29T16:30:00.000Z");
    expect(calendarWallTimeToInstant(displayed, "Asia/Tokyo", false).toISOString()).toBe("2026-07-29T07:30:00.000Z");
  });

  it("preserves all-day calendar dates without a timezone shift", () => {
    const displayed = new Date(2026, 6, 29, 0, 0);
    expect(calendarWallTimeToInstant(displayed, "America/Los_Angeles", true).toISOString()).toBe("2026-07-29T00:00:00.000Z");
  });

  it("gives FullCalendar date-only inclusive ranges instead of UTC instants", () => {
    expect(allDayCalendarRange(allDayStorageRange("2026-08-02", "2026-08-02"))).toEqual({
      start: "2026-08-02", end: "2026-08-03",
    });
    expect(allDayCalendarRange(allDayStorageRange("2026-08-02", "2026-08-04"))).toEqual({
      start: "2026-08-02", end: "2026-08-05",
    });
  });
});
