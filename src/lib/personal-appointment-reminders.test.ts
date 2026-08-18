import { describe, expect, it } from "vitest";
import { duePersonalReminderSlots, personalReminderNotification, personalReminderSlots } from "./personal-appointment-reminders";
import type { AppointmentOccurrence } from "@/types/domain";

const occurrence = (overrides: Partial<AppointmentOccurrence> = {}): AppointmentOccurrence => ({
  id: "appointment-1", occurrence_id: "appointment-1", series_parent_id: null, is_generated_occurrence: false,
  user_id: "user-1", category_id: "personal", title: "Video-doctor", kind: "personal",
  starts_at: "2026-08-20T16:10:00.000Z", ends_at: "2026-08-20T17:10:00.000Z",
  intended_local_start: "2026-08-20T09:10", intended_local_end: "2026-08-20T10:10",
  timezone: "America/Los_Angeles", all_day: false, location: null, phone: null, email: null,
  public_notes: null, private_notes: null, status: "confirmed", created_at: "2026-08-01T00:00:00Z",
  completed_at: null, cancelled_at: null, updated_at: "2026-08-01T00:00:00Z", ...overrides,
});

describe("Personal Appointment push schedule", () => {
  it("creates the nine fixed local slots on the preceding three calendar days", () => {
    expect(personalReminderSlots(occurrence(), new Date("2026-08-01T00:00:00Z")).map((slot) => slot.scheduledAt)).toEqual([
      "2026-08-17T19:00:00.000Z", "2026-08-18T00:00:00.000Z", "2026-08-18T04:00:00.000Z",
      "2026-08-18T19:00:00.000Z", "2026-08-19T00:00:00.000Z", "2026-08-19T04:00:00.000Z",
      "2026-08-19T19:00:00.000Z", "2026-08-20T00:00:00.000Z", "2026-08-20T04:00:00.000Z",
    ]);
  });
  it("does not backfill elapsed slots", () => {
    expect(personalReminderSlots(occurrence(), new Date("2026-08-19T01:00:00Z")).map((slot) => slot.scheduledAt))
      .toEqual(["2026-08-19T04:00:00.000Z", "2026-08-19T19:00:00.000Z", "2026-08-20T00:00:00.000Z", "2026-08-20T04:00:00.000Z"]);
  });
  it("uses IANA DST conversion and the current cron window", () => {
    const winter = occurrence({ starts_at: "2026-01-20T17:10:00.000Z", intended_local_start: "2026-01-20T09:10" });
    expect(personalReminderSlots(winter, new Date("2026-01-01T00:00:00Z"))[0].scheduledAt).toBe("2026-01-17T20:00:00.000Z");
    expect(duePersonalReminderSlots(occurrence(), new Date("2026-08-17T19:04:00Z"))).toHaveLength(1);
  });
  it("uses deterministic independent occurrence identities", () => {
    const first = personalReminderSlots(occurrence({ original_occurrence_start: "2026-08-20T16:10:00Z" }), new Date("2026-08-01"));
    const moved = personalReminderSlots(occurrence({ id: "exception-1", starts_at: "2026-08-21T16:10:00Z", original_occurrence_start: "2026-08-20T16:10:00Z" }), new Date("2026-08-01"));
    expect(new Set(first.map((slot) => slot.key)).size).toBe(9);
    expect(first[0].key).not.toBe(moved[0].key);
  });
  it("keeps fixed wall-clock slots when the appointment start time changes", () => {
    const morning = personalReminderSlots(occurrence(), new Date("2026-08-01"));
    const afternoon = personalReminderSlots(occurrence({ starts_at: "2026-08-20T23:30:00Z", intended_local_start: "2026-08-20T16:30" }), new Date("2026-08-01"));
    expect(afternoon.map((slot) => slot.scheduledAt)).toEqual(morning.map((slot) => slot.scheduledAt));
    expect(morning.every((slot) => !slot.scheduledAt.startsWith("2026-08-20T16:"))).toBe(true);
  });
  it("recomputes future identities when an occurrence date is rescheduled", () => {
    const original = personalReminderSlots(occurrence(), new Date("2026-08-01"));
    const rescheduled = personalReminderSlots(occurrence({ starts_at: "2026-08-25T16:10:00Z", intended_local_start: "2026-08-25T09:10" }), new Date("2026-08-01"));
    expect(new Set(original.map((slot) => slot.key))).not.toEqual(new Set(rescheduled.map((slot) => slot.key)));
  });
  it("recovers only recently due slots", () => {
    expect(duePersonalReminderSlots(occurrence(), new Date("2026-08-17T19:14:59Z"))).toHaveLength(1);
    expect(duePersonalReminderSlots(occurrence(), new Date("2026-08-17T19:15:01Z"))).toHaveLength(0);
  });
  it("includes only the approved title and date/time content", async () => {
    const notification = await personalReminderNotification(occurrence({
      location: "Private location", private_notes: "Private note", public_notes: "Public note",
      phone: "555-0100", email: "private@example.invalid",
    }));
    expect(notification.title).toBe("Personal appointment coming up");
    expect(notification.body).toBe("Video-doctor · Aug 20 at 9:10 AM");
    expect(notification.target).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(notification)).not.toContain("appointment-1");
    expect(JSON.stringify(notification)).not.toMatch(/Private location|Private note|Public note|555-0100|private@example/);
  });
});
