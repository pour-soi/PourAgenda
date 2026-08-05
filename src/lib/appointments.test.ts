import { describe, expect, it } from "vitest";
import { allDayCalendarRange, allDayEditorRange, allDayEndToInput, allDayEndToUtc, allDayStorageRange, appointmentError, appointmentInput, findConflicts, inclusiveCalendarDayCount, isStaleEdit, localInputToUtc, toLocalInput, undoAppointmentValues } from "./appointments";
import type { Appointment } from "@/types/domain";

const appointment: Appointment = {
  id: "a", user_id: "u", category_id: "11111111-1111-4111-8111-111111111111",
  title: "Consultation", kind: "work", starts_at: "2026-03-08T17:00:00.000Z",
  ends_at: "2026-03-08T18:00:00.000Z", timezone: "America/Los_Angeles",
  all_day: false, location: null, public_notes: null, private_notes: null,
  phone: null, email: null, status: "confirmed",
  created_at: "2026-01-01T00:00:00.000Z", completed_at: null, cancelled_at: null,
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("appointment guarantees", () => {
  it("finds overlaps but ignores cancelled appointments", () => {
    expect(findConflicts({ id: "new", starts_at: "2026-03-08T17:30:00.000Z", ends_at: "2026-03-08T18:30:00.000Z" }, [appointment])).toHaveLength(1);
    expect(findConflicts({ id: "new", starts_at: "2026-03-08T17:30:00.000Z", ends_at: "2026-03-08T18:30:00.000Z" }, [{ ...appointment, status: "cancelled" }])).toHaveLength(0);
  });
  it("rejects end times before start times", () => {
    expect(appointmentInput.safeParse({ ...appointment, email: "", ends_at: appointment.starts_at }).success).toBe(false);
  });
  it("detects concurrent edits by updated_at", () => expect(isStaleEdit("old", "new")).toBe(true));
  it.each([
    ["exact overlap", "2026-03-08T17:00:00.000Z", "2026-03-08T18:00:00.000Z", 1],
    ["partial overlap", "2026-03-08T17:30:00.000Z", "2026-03-08T18:30:00.000Z", 1],
    ["enclosed", "2026-03-08T17:15:00.000Z", "2026-03-08T17:45:00.000Z", 1],
    ["adjacent", "2026-03-08T18:00:00.000Z", "2026-03-08T19:00:00.000Z", 0],
  ])("%s conflict", (_name, starts_at, ends_at, count) => {
    expect(findConflicts({ id: "new", starts_at, ends_at }, [appointment])).toHaveLength(count);
  });
  it("ignores the row being edited", () => {
    expect(findConflicts({ id: appointment.id, starts_at: appointment.starts_at, ends_at: appointment.ends_at }, [appointment])).toHaveLength(0);
  });
  it("keeps all-day adjacent dates separate", () => {
    const allDay = { ...appointment, all_day: true, starts_at: "2026-11-01T07:00:00.000Z", ends_at: "2026-11-02T08:00:00.000Z" };
    expect(findConflicts({ id: "new", starts_at: allDay.ends_at, ends_at: "2026-11-03T08:00:00.000Z" }, [allDay])).toHaveLength(0);
  });
  it("preserves wall-clock time across spring and fall DST offsets", () => {
    expect(localInputToUtc("2026-03-08T09:00", "America/Los_Angeles")).toBe("2026-03-08T16:00:00.000Z");
    expect(localInputToUtc("2026-11-01T09:00", "America/Los_Angeles")).toBe("2026-11-01T17:00:00.000Z");
  });
  it("renders the same instant in another timezone", () => {
    expect(toLocalInput("2026-07-01T16:00:00.000Z", "America/New_York")).toBe("2026-07-01T12:00");
  });
  it("preserves an all-day date in its selected timezone", () => {
    const utc = localInputToUtc("2026-07-01", "America/Los_Angeles", true);
    expect(utc.slice(0, 10)).toBe("2026-07-01");
  });
  it("stores inclusive all-day end dates as an exclusive UTC boundary", () => {
    expect(allDayEndToUtc("2026-07-01")).toBe("2026-07-02T00:00:00.000Z");
    expect(allDayEndToInput("2026-07-02T00:00:00.000Z")).toBe("2026-07-01");
  });
  it("keeps same-day and multi-day all-day ranges inclusive in the editor and exclusive for FullCalendar", () => {
    const sameDay = allDayStorageRange("2026-08-02", "2026-08-02");
    expect(sameDay).toEqual({
      starts_at: "2026-08-02T00:00:00.000Z", ends_at: "2026-08-03T00:00:00.000Z",
      intended_local_start: "2026-08-02", intended_local_end: "2026-08-02",
    });
    expect(allDayEditorRange(sameDay)).toEqual({ start: "2026-08-02", end: "2026-08-02" });
    expect(allDayCalendarRange(sameDay)).toEqual({ start: "2026-08-02", end: "2026-08-03" });

    const multiDay = allDayStorageRange("2026-08-02", "2026-08-04");
    expect(allDayEditorRange(multiDay)).toEqual({ start: "2026-08-02", end: "2026-08-04" });
    expect(allDayCalendarRange(multiDay)).toEqual({ start: "2026-08-02", end: "2026-08-05" });
    expect(inclusiveCalendarDayCount("2026-08-02", "2026-08-04")).toBe(3);
  });
  it.each([
    ["America/Los_Angeles", "2026-03-08", "2026-03-08"],
    ["America/New_York", "2026-11-01", "2026-11-02"],
    ["UTC", "2026-08-02", "2026-08-04"],
    ["Asia/Shanghai", "2026-08-02", "2026-08-02"],
  ])("round-trips all-day calendar dates in %s without applying its offset", (timezone, start, end) => {
    const stored = { ...allDayStorageRange(start, end), timezone };
    const editor = allDayEditorRange(stored);
    expect(editor).toEqual({ start, end });
    expect(allDayStorageRange(editor.start, editor.end)).toEqual(allDayStorageRange(start, end));
  });
  it("uses canonical all-day dates even when UTC timestamps point at different calendar dates", () => {
    expect(allDayEditorRange({
      starts_at: "2026-08-01T00:00:00.000Z", ends_at: "2026-08-06T00:00:00.000Z",
      intended_local_start: "2026-08-02 00:00:00", intended_local_end: "2026-08-04 00:00:00",
    })).toEqual({ start: "2026-08-02", end: "2026-08-04" });
    expect(() => allDayEditorRange({
      starts_at: "2026-08-02T00:00:00.000Z", ends_at: "2026-08-03T00:00:00.000Z",
    })).toThrow("intended_local_start");
  });
  it("restores the exact pre-cancellation state", () => {
    expect(undoAppointmentValues(appointment)).toEqual({ status: "confirmed", cancelled_at: null });
  });
  it("gives an expired session an explicit recovery instruction", () => {
    expect(appointmentError({ code: "PGRST301" })).toContain("Sign in again");
  });
});
