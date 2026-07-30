import { describe, expect, it } from "vitest";
import { preferredCalendarScrollTime, responsiveCalendarView } from "./calendar-view";

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
