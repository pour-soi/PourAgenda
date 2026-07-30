import { describe, expect, it } from "vitest";
import { normalizeReminderMinutes, reminderTimes } from "./reminders";

describe("reminders", () => {
  it("deduplicates and validates offsets", () => expect(normalizeReminderMinutes([30, 10, 30, 999])).toEqual([10, 30]));
  it("suppresses inactive appointments", () => {
    expect(reminderTimes("2026-03-08T10:00:00Z", [10], "cancelled")).toEqual([]);
    expect(reminderTimes("2026-03-08T10:00:00Z", [10], "completed")).toEqual([]);
  });
  it("computes absolute reminder instants", () =>
    expect(reminderTimes("2026-03-08T10:00:00Z", [60], "confirmed")).toEqual(["2026-03-08T09:00:00.000Z"]));
  it("supports every offset and multiple reminders deterministically", () => {
    expect(reminderTimes("2026-11-01T10:00:00Z", [1440, 0, 30, 10, 60, 10], "pending")).toEqual([
      "2026-11-01T10:00:00.000Z", "2026-11-01T09:50:00.000Z", "2026-11-01T09:30:00.000Z",
      "2026-11-01T09:00:00.000Z", "2026-10-31T10:00:00.000Z",
    ]);
  });
  it("keeps DST instants stable because offsets are applied to UTC occurrence starts", () => {
    expect(reminderTimes("2026-03-08T17:00:00Z", [60], "confirmed")[0]).toBe("2026-03-08T16:00:00.000Z");
    expect(reminderTimes("2026-11-01T18:00:00Z", [60], "confirmed")[0]).toBe("2026-11-01T17:00:00.000Z");
  });
});
