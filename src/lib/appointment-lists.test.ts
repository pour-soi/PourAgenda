import { describe, expect, it } from "vitest";
import { activeFilterCount, appointmentCursor, mergeAppointmentPages } from "./appointment-lists";
import type { Appointment } from "@/types/domain";

const row = (id: string, starts_at: string): Appointment => ({
  id, starts_at, ends_at: starts_at, user_id: "u", category_id: "c", title: id,
  kind: "work", timezone: "UTC", all_day: false, location: null, phone: null,
  email: null, public_notes: null, private_notes: null, status: "pending",
  created_at: starts_at, updated_at: starts_at,
  completed_at: null, cancelled_at: null,
});

describe("appointment list pagination", () => {
  it("keeps the first page", () => expect(mergeAppointmentPages([], [row("a", "2026-01-01T00:00:00Z")])).toHaveLength(1));
  it("adds a next page without duplicates", () => {
    const first = [row("a", "2026-01-01T00:00:00Z"), row("b", "2026-01-02T00:00:00Z")];
    expect(mergeAppointmentPages(first, [first[1], row("c", "2026-01-03T00:00:00Z")]).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
  it("keeps an empty final page stable", () => expect(mergeAppointmentPages([row("a", "2026-01-01T00:00:00Z")], [])).toHaveLength(1));
  it("creates a deterministic timestamp and id cursor", () => {
    expect(appointmentCursor([row("a", "2026-01-01T00:00:00Z")], "starts_at")).toEqual({ value: "2026-01-01T00:00:00Z", id: "a" });
  });
  it("reflects filter reset state", () => {
    expect(activeFilterCount("work", "category", "term")).toBe(3);
    expect(activeFilterCount("all", "all", "")).toBe(0);
  });
});
