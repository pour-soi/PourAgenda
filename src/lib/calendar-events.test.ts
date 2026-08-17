import { describe, expect, it } from "vitest";
import { buildCalendarEvents } from "./calendar-events";
import type { AppointmentOccurrence } from "@/types/domain";

const occurrence = (id: string, categoryId: string): AppointmentOccurrence => ({
  id,
  occurrence_id: id,
  series_parent_id: null,
  is_generated_occurrence: false,
  user_id: "user",
  category_id: categoryId,
  title: id,
  kind: "personal",
  starts_at: "2026-08-18T16:10:00.000Z",
  ends_at: "2026-08-18T16:40:00.000Z",
  intended_local_start: "2026-08-18 09:10:00",
  intended_local_end: "2026-08-18 09:40:00",
  timezone: "America/Los_Angeles",
  all_day: false,
  location: null,
  phone: null,
  email: null,
  public_notes: null,
  private_notes: null,
  status: "confirmed",
  reminder_minutes: [],
  recurrence_frequency: null,
  recurrence_interval: null,
  recurrence_until: null,
  recurrence_count: null,
  series_id: null,
  original_occurrence_start: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  completed_at: null,
  cancelled_at: null,
});

describe("calendar event category colors", () => {
  const appointments = [occurrence("focus-event", "focus"), occurrence("personal-event", "personal")];
  const categories = [
    { id: "focus", name: "Focus", color: "#375f52" },
    { id: "personal", name: "Personal", color: "#a26068" },
  ];

  it("replaces fallback colors when categories become available", () => {
    expect(buildCalendarEvents(appointments, []).map((event) => event.backgroundColor)).toEqual([
      "#667168",
      "#667168",
    ]);
    expect(buildCalendarEvents(appointments, categories).map((event) => event.backgroundColor)).toEqual([
      "#375f52",
      "#a26068",
    ]);
  });

  it("updates only the appointment whose category changes", () => {
    const changed = buildCalendarEvents([
      { ...appointments[0], category_id: "personal" },
      appointments[1],
    ], categories);

    expect(changed[0].backgroundColor).toBe("#a26068");
    expect(changed[1].backgroundColor).toBe("#a26068");
    expect(changed[0]).not.toBe(changed[1]);
    expect(changed.map((event) => event.extendedProps.category)).toEqual(["Personal", "Personal"]);
  });

  it("keeps each event tied to its own category through repeated mapping", () => {
    const first = buildCalendarEvents(appointments, categories);
    const rerendered = buildCalendarEvents(appointments, categories);

    expect(rerendered.map((event) => [event.id, event.extendedProps.categoryColor])).toEqual([
      ["focus-event", "#375f52"],
      ["personal-event", "#a26068"],
    ]);
    expect(rerendered[0]).not.toBe(first[0]);
    expect(rerendered[1]).not.toBe(first[1]);
  });

  it("preserves canonical date ownership for timed, all-day, recurring, moved, and cross-midnight events", () => {
    const rows: AppointmentOccurrence[] = [
      { ...occurrence("timed", "focus"), starts_at: "2026-08-18T16:10:00.000Z", ends_at: "2026-08-18T16:40:00.000Z" },
      { ...occurrence("all-day", "focus"), all_day: true, starts_at: "2026-08-18T00:00:00.000Z", ends_at: "2026-08-19T00:00:00.000Z", intended_local_start: "2026-08-18", intended_local_end: "2026-08-18" },
      { ...occurrence("recurring", "focus"), series_parent_id: "series", is_generated_occurrence: true, original_occurrence_start: "2026-08-25T16:10:00.000Z", starts_at: "2026-08-25T16:10:00.000Z", ends_at: "2026-08-25T16:40:00.000Z" },
      { ...occurrence("moved", "focus"), series_parent_id: "series", original_occurrence_start: "2026-09-01T16:10:00.000Z", starts_at: "2026-09-02T17:30:00.000Z", ends_at: "2026-09-02T18:00:00.000Z" },
      { ...occurrence("cross-midnight", "focus"), starts_at: "2026-08-19T06:30:00.000Z", ends_at: "2026-08-19T08:30:00.000Z" },
    ];

    expect(buildCalendarEvents(rows, categories).map(({ id, start, end }) => [id, start, end])).toEqual([
      ["timed", "2026-08-18T16:10:00.000Z", "2026-08-18T16:40:00.000Z"],
      ["all-day", "2026-08-18", "2026-08-19"],
      ["recurring", "2026-08-25T16:10:00.000Z", "2026-08-25T16:40:00.000Z"],
      ["moved", "2026-09-02T17:30:00.000Z", "2026-09-02T18:00:00.000Z"],
      ["cross-midnight", "2026-08-19T06:30:00.000Z", "2026-08-19T08:30:00.000Z"],
    ]);
  });
});
