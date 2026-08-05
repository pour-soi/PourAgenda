import { describe, expect, it } from "vitest";
import { expandAppointments, findRecurringConflicts, recurrencePreview, recurrencePreviewWithExceptions, recurrenceSummary } from "./recurrence";
import type { Appointment } from "@/types/domain";

const series = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: "series", user_id: "user", category_id: "category", title: "Standup", kind: "work",
  starts_at: "2026-03-06T17:00:00.000Z", ends_at: "2026-03-06T18:00:00.000Z",
  intended_local_start: "2026-03-06 09:00:00", intended_local_end: "2026-03-06 10:00:00",
  timezone: "America/Los_Angeles", all_day: false, location: null, phone: null, email: null,
  public_notes: null, private_notes: null, status: "confirmed",
  recurrence_frequency: "daily", recurrence_interval: 1, recurrence_until: null, recurrence_count: null,
  series_id: null, original_occurrence_start: null, completed_at: null, cancelled_at: null,
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", ...overrides,
} as Appointment);
const expand = (rows: Appointment[], start = "2026-03-01T00:00:00Z", end = "2026-04-01T00:00:00Z", max?: number) =>
  expandAppointments(rows, start, end, max);

describe("bounded recurrence expansion", () => {
  it("expands daily, weekly, monthly, and every-N-weeks deterministically", () => {
    expect(expand([series({ recurrence_count: 3 })])).toHaveLength(3);
    expect(expand([series({ recurrence_frequency: "weekly", recurrence_count: 3 })]).map((x) => x.starts_at.slice(0, 10))).toEqual(["2026-03-06", "2026-03-13", "2026-03-20"]);
    expect(expand([series({ recurrence_frequency: "monthly", recurrence_count: 2 })], "2026-03-01T00:00:00Z", "2026-05-01T00:00:00Z")).toHaveLength(2);
    expect(expand([series({ recurrence_frequency: "weekly", recurrence_interval: 2, recurrence_count: 3 })], "2026-03-01T00:00:00Z", "2026-05-01T00:00:00Z")).toHaveLength(3);
  });
  it("honors end dates and bounds never-ending series", () => {
    expect(expand([series({ recurrence_until: "2026-03-08" })])).toHaveLength(3);
    expect(expand([series()], "2026-03-10T00:00:00Z", "2026-03-13T00:00:00Z")).toHaveLength(3);
  });
  it("substitutes modified exceptions and excludes cancelled exceptions without duplicates", () => {
    const original = "2026-03-07T17:00:00.000Z";
    const modified = series({ id: "exception", recurrence_frequency: null, recurrence_interval: null,
      series_id: "series", original_occurrence_start: original, title: "Moved", starts_at: "2026-03-07T20:00:00.000Z", ends_at: "2026-03-07T21:00:00.000Z" });
    const cancelled = series({ id: "cancelled", recurrence_frequency: null, recurrence_interval: null,
      series_id: "series", original_occurrence_start: "2026-03-08T16:00:00.000Z", status: "cancelled" });
    const rows = expand([series({ recurrence_count: 4 }), modified, cancelled]);
    expect(rows.map((x) => x.title).filter((x) => x === "Moved")).toHaveLength(1);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((x) => x.occurrence_id)).size).toBe(3);
  });
  it("classifies skipped, edited, and moved occurrence previews without duplicates", () => {
    const generated = recurrencePreview(series({ recurrence_count: 4 }), 4);
    const skipped = series({ id: "skip", recurrence_frequency: null, recurrence_interval: null, series_id: "series",
      original_occurrence_start: generated[1].original_occurrence_start, status: "cancelled" });
    const edited = series({ id: "edit", recurrence_frequency: null, recurrence_interval: null, series_id: "series",
      original_occurrence_start: generated[2].original_occurrence_start, starts_at: generated[2].starts_at, ends_at: generated[2].ends_at, title: "Edited" });
    const moved = series({ id: "move", recurrence_frequency: null, recurrence_interval: null, series_id: "series",
      original_occurrence_start: generated[3].original_occurrence_start, starts_at: "2026-03-12T20:00:00.000Z", ends_at: "2026-03-12T21:00:00.000Z" });
    const preview = recurrencePreviewWithExceptions(series({ recurrence_count: 4 }), [skipped, edited, moved], 4);
    expect(preview.map((item) => item.state)).toEqual(["normal", "skipped", "edited", "moved"]);
    expect(preview.map((item) => item.originalStartsAt)).toEqual(generated.map((item) => item.original_occurrence_start));
    expect(new Set(preview.map((item) => item.occurrence.occurrence_id)).size).toBe(4);
  });
  it("handles boundary and empty ranges", () => {
    expect(expand([series({ recurrence_count: 1 })], "2026-03-06T18:00:00Z", "2026-03-07T00:00:00Z")).toHaveLength(0);
    expect(expand([series()], "2026-03-02T00:00:00Z", "2026-03-01T00:00:00Z")).toEqual([]);
  });
  it("guards maximum output", () => {
    expect(() => expand([series()], "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z", 2)).toThrow("safety limit");
  });
  it("preserves weekly and monthly wall time through spring and fall DST", () => {
    const spring = expand([series({ recurrence_frequency: "weekly", recurrence_count: 3 })]);
    expect(spring.map((x) => x.starts_at.slice(11, 16))).toEqual(["17:00", "16:00", "16:00"]);
    const fall = expand([series({ recurrence_frequency: "monthly", recurrence_count: 3, starts_at: "2026-09-01T16:00:00Z",
      ends_at: "2026-09-01T17:00:00Z", intended_local_start: "2026-09-01 09:00:00" })], "2026-09-01T00:00:00Z", "2026-12-02T00:00:00Z");
    expect(fall.map((x) => x.starts_at.slice(11, 16))).toEqual(["16:00", "16:00", "17:00"]);
  });
  it("preserves all-day dates and documents summaries", () => {
    const rows = expand([series({ all_day: true, starts_at: "2026-03-06T08:00:00Z", ends_at: "2026-03-07T08:00:00Z", recurrence_count: 2 })]);
    expect(rows.map((x) => x.starts_at.slice(0, 10))).toEqual(["2026-03-06", "2026-03-07"]);
    expect(recurrenceSummary(series({ recurrence_frequency: "weekly", recurrence_interval: 2 }))).toBe("Repeats every 2 weeks on Friday and never ends.");
  });
  it("keeps the inclusive final date for recurring multi-day all-day appointments", () => {
    const rows = expand([series({ all_day: true, starts_at: "2026-03-06T00:00:00Z", ends_at: "2026-03-09T00:00:00Z",
      intended_local_start: "2026-03-06", intended_local_end: "2026-03-08", recurrence_frequency: "weekly", recurrence_count: 2 })]);
    expect(rows.map((row) => (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 864e5)).toEqual([3, 3]);
    expect(rows.map((row) => [row.intended_local_start, row.intended_local_end])).toEqual([
      ["2026-03-06", "2026-03-08"], ["2026-03-13", "2026-03-15"],
    ]);
    expect(recurrencePreview(series({ recurrence_frequency: "weekly", recurrence_count: 5 }), 3)).toHaveLength(3);
  });
  it.each(["America/Los_Angeles", "America/New_York", "UTC", "Asia/Shanghai"])(
    "keeps recurring all-day dates stable across DST and %s",
    (timezone) => {
      const rows = expand([series({
        all_day: true, timezone, starts_at: "2026-03-08T00:00:00.000Z", ends_at: "2026-03-09T00:00:00.000Z",
        intended_local_start: "2026-03-08", intended_local_end: "2026-03-08", recurrence_frequency: "weekly", recurrence_count: 2,
      })], "2026-03-01T00:00:00.000Z", "2026-03-31T00:00:00.000Z");
      expect(rows.map((row) => [row.intended_local_start, row.intended_local_end])).toEqual([
        ["2026-03-08", "2026-03-08"], ["2026-03-15", "2026-03-15"],
      ]);
    },
  );
  it("detects one-time, recurring, modified, and DST occurrence conflicts but ignores cancellation and adjacency", () => {
    const candidate = series({ id: "candidate", recurrence_frequency: "weekly", recurrence_count: 3 });
    const oneTime = series({ id: "one", recurrence_frequency: null, recurrence_interval: null,
      starts_at: "2026-03-13T16:30:00Z", ends_at: "2026-03-13T17:30:00Z" });
    expect(findRecurringConflicts([candidate], [oneTime], "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z")).toHaveLength(1);
    const adjacent = { ...oneTime, starts_at: "2026-03-13T17:00:00Z", ends_at: "2026-03-13T18:00:00Z" };
    expect(findRecurringConflicts([candidate], [adjacent], "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z")).toHaveLength(0);
    const cancelled = { ...oneTime, status: "cancelled" as const };
    expect(findRecurringConflicts([candidate], [cancelled], "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z")).toHaveLength(0);
    const recurring = series({ id: "other", recurrence_frequency: "daily", recurrence_count: 10,
      starts_at: "2026-03-06T17:30:00Z", ends_at: "2026-03-06T18:30:00Z", intended_local_start: "2026-03-06 09:30:00" });
    expect(findRecurringConflicts([candidate], [recurring], "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z").length).toBeGreaterThan(1);
  });
});
