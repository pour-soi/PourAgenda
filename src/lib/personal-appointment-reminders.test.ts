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
  it("creates exactly the three stable reminder types", () => {
    const slots = personalReminderSlots(occurrence(), new Date("2026-08-01T00:00:00Z"));
    expect(slots.map((slot) => [slot.reminderType, slot.scheduledAt])).toEqual([
      ["previous_day_21", "2026-08-20T04:00:00.000Z"],
      ["one_hour_before", "2026-08-20T15:10:00.000Z"],
      ["fifteen_minutes_before", "2026-08-20T15:55:00.000Z"],
    ]);
    expect(new Set(slots.map((slot) => slot.key)).size).toBe(3);
  });
  it("does not backfill expired slots while retaining a future fifteen-minute slot", () => {
    expect(personalReminderSlots(occurrence(), new Date("2026-08-20T15:30:00Z")).map((slot) => slot.reminderType))
      .toEqual(["fifteen_minutes_before"]);
  });
  it("uses IANA calendar arithmetic across PDT and PST and the current cron window", () => {
    const winter = occurrence({ starts_at: "2026-01-20T17:10:00.000Z", intended_local_start: "2026-01-20T09:10" });
    expect(personalReminderSlots(winter, new Date("2026-01-01T00:00:00Z"))[0].scheduledAt).toBe("2026-01-20T05:00:00.000Z");
    expect(duePersonalReminderSlots(occurrence(), new Date("2026-08-20T04:04:00Z"))).toHaveLength(1);
  });
  it("uses deterministic independent occurrence identities", () => {
    const first = personalReminderSlots(occurrence({ original_occurrence_start: "2026-08-20T16:10:00Z" }), new Date("2026-08-01"));
    const moved = personalReminderSlots(occurrence({ id: "exception-1", starts_at: "2026-08-21T16:10:00Z", original_occurrence_start: "2026-08-20T16:10:00Z" }), new Date("2026-08-01"));
    expect(new Set(first.map((slot) => slot.key)).size).toBe(3);
    expect(first[0].key).not.toBe(moved[0].key);
  });
  it("recalculates instant-based slots when the appointment start time changes", () => {
    const morning = personalReminderSlots(occurrence(), new Date("2026-08-01"));
    const afternoon = personalReminderSlots(occurrence({ starts_at: "2026-08-20T23:30:00Z", intended_local_start: "2026-08-20T16:30" }), new Date("2026-08-01"));
    expect(afternoon[0].scheduledAt).toBe(morning[0].scheduledAt);
    expect(afternoon.slice(1).map((slot) => slot.scheduledAt)).not.toEqual(morning.slice(1).map((slot) => slot.scheduledAt));
    expect(new Set(afternoon.map((slot) => slot.key))).not.toEqual(new Set(morning.map((slot) => slot.key)));
  });
  it("recomputes future identities when an occurrence date is rescheduled", () => {
    const original = personalReminderSlots(occurrence(), new Date("2026-08-01"));
    const rescheduled = personalReminderSlots(occurrence({ starts_at: "2026-08-25T16:10:00Z", intended_local_start: "2026-08-25T09:10" }), new Date("2026-08-01"));
    expect(new Set(original.map((slot) => slot.key))).not.toEqual(new Set(rescheduled.map((slot) => slot.key)));
  });
  it("recovers only recently due slots", () => {
    expect(duePersonalReminderSlots(occurrence(), new Date("2026-08-20T04:14:59Z"))).toHaveLength(1);
    expect(duePersonalReminderSlots(occurrence(), new Date("2026-08-20T04:15:01Z"))).toHaveLength(0);
  });
  it("creates only the previous local-day 9 PM slot for an all-day appointment", () => {
    const slots = personalReminderSlots(occurrence({
      all_day: true, starts_at: "2026-08-20T00:00:00.000Z", ends_at: "2026-08-21T00:00:00.000Z",
      intended_local_start: "2026-08-20", intended_local_end: "2026-08-20",
    }), new Date("2026-08-01"));
    expect(slots.map((slot) => [slot.reminderType, slot.scheduledAt])).toEqual([
      ["previous_day_21", "2026-08-20T04:00:00.000Z"],
    ]);
    expect(slots.some((slot) => slot.reminderType === "one_hour_before")).toBe(false);
    expect(slots.some((slot) => slot.reminderType === "fifteen_minutes_before")).toBe(false);
  });
  it("keeps all-day previous-day 9 PM stable across PDT and PST", () => {
    const allDay = (date: string, timezone = "America/Los_Angeles") => occurrence({
      all_day: true, timezone, starts_at: `${date}T00:00:00.000Z`, ends_at: `${date}T23:59:59.999Z`,
      intended_local_start: date, intended_local_end: date,
    });
    expect(personalReminderSlots(allDay("2026-08-20"), new Date("2026-08-01"))[0].scheduledAt)
      .toBe("2026-08-20T04:00:00.000Z");
    expect(personalReminderSlots(allDay("2026-01-20"), new Date("2026-01-01"))[0].scheduledAt)
      .toBe("2026-01-20T05:00:00.000Z");
  });
  it("does not derive reminders for a cancelled occurrence", () => {
    expect(personalReminderSlots(occurrence({ status: "cancelled" }), new Date("2026-08-01"))).toEqual([]);
  });
  it("derives independent schedules for recurring, moved, edited, and series-updated occurrences", () => {
    const recurring = occurrence({
      id: "series-1:2026-08-20T16:10:00.000Z", occurrence_id: "series-1:2026-08-20T16:10:00.000Z",
      series_parent_id: "series-1", original_occurrence_start: "2026-08-20T16:10:00.000Z",
      is_generated_occurrence: true,
    });
    const moved = occurrence({ ...recurring, id: "exception-moved", is_generated_occurrence: false,
      starts_at: "2026-08-21T18:30:00.000Z", ends_at: "2026-08-21T19:30:00.000Z" });
    const edited = occurrence({ ...recurring, id: "exception-edited", is_generated_occurrence: false,
      starts_at: "2026-08-20T18:10:00.000Z", ends_at: "2026-08-20T19:10:00.000Z" });
    const seriesUpdated = occurrence({ ...recurring,
      id: "series-1:2026-08-27T18:10:00.000Z", occurrence_id: "series-1:2026-08-27T18:10:00.000Z",
      original_occurrence_start: "2026-08-27T18:10:00.000Z",
      starts_at: "2026-08-27T18:10:00.000Z", ends_at: "2026-08-27T19:10:00.000Z" });
    const schedules = [recurring, moved, edited, seriesUpdated]
      .map((item) => personalReminderSlots(item, new Date("2026-08-01")));
    expect(schedules.every((slots) => slots.length === 3)).toBe(true);
    expect(schedules[1].map((slot) => slot.scheduledAt)).toEqual([
      "2026-08-21T04:00:00.000Z", "2026-08-21T17:30:00.000Z", "2026-08-21T18:15:00.000Z",
    ]);
    expect(schedules[2].map((slot) => slot.scheduledAt)).toEqual([
      "2026-08-20T04:00:00.000Z", "2026-08-20T17:10:00.000Z", "2026-08-20T17:55:00.000Z",
    ]);
    expect(new Set(schedules.flatMap((slots) => slots.map((slot) => slot.key))).size).toBe(12);
    expect(personalReminderSlots({ ...recurring, status: "cancelled" }, new Date("2026-08-01"))).toEqual([]);
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
