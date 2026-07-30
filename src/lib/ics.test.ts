import { expect, it } from "vitest";
import { appointmentToIcs, appointmentsToIcs } from "./ics";
import type { Appointment } from "@/types/domain";

it("exports a UTC calendar event without private notes", () => {
  const event = appointmentToIcs({
    id: "event-1", user_id: "u", category_id: "c", title: "Care, review", kind: "personal",
    starts_at: "2026-11-01T16:00:00.000Z", ends_at: "2026-11-01T17:00:00.000Z",
    timezone: "America/Los_Angeles", all_day: false, location: "Clinic", public_notes: "Bring forms",
    private_notes: "Never export", status: "confirmed", archived: false, updated_at: "2026-10-01T00:00:00.000Z",
  } as Appointment);
  expect(event).toContain("SUMMARY:Care\\, review");
  expect(event).toContain("DTSTART:20261101T160000Z");
  expect(event).not.toContain("Never export");
});

it("exports a recurring series with cancelled and modified exceptions", () => {
  const parent = {
    id: "series-1", user_id: "u", category_id: "c", title: "Weekly review", kind: "work",
    starts_at: "2026-03-06T17:00:00Z", ends_at: "2026-03-06T18:00:00Z", timezone: "America/Los_Angeles",
    all_day: false, location: null, public_notes: null, private_notes: "private", status: "confirmed",
    archived: false, recurrence_frequency: "weekly", recurrence_interval: 2, recurrence_until: "2026-06-01",
    updated_at: "2026-03-01T00:00:00Z",
  } as Appointment;
  const cancelled = { ...parent, id: "cancelled", series_id: parent.id, recurrence_frequency: null,
    original_occurrence_start: "2026-03-20T16:00:00Z", status: "cancelled" } as Appointment;
  const modified = { ...parent, id: "modified", series_id: parent.id, recurrence_frequency: null,
    original_occurrence_start: "2026-04-03T16:00:00Z", starts_at: "2026-04-03T18:00:00Z",
    ends_at: "2026-04-03T19:00:00Z", title: "Moved review" } as Appointment;
  const output = appointmentToIcs(parent, [cancelled, modified]);
  expect(output).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20260601T235959Z");
  expect(output).toContain("EXDATE:20260320T160000Z");
  expect(output).toContain("RECURRENCE-ID:20260403T160000Z");
  expect(output).not.toContain("private");
  expect(appointmentsToIcs([parent, cancelled, modified])).toContain("X-WR-TIMEZONE:America/Los_Angeles");
});
