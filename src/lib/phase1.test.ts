import { describe, expect, it } from "vitest";
import { categoryInput, friendlyDataError, settingsInput } from "./phase1";

describe("Phase 1 validation", () => {
  it("accepts a restrained category color and rejects an empty name", () => {
    expect(categoryInput.safeParse({ name: "Medical", color: "#A26068", hidden: false }).success).toBe(true);
    expect(categoryInput.safeParse({ name: " ", color: "#A26068", hidden: false }).success).toBe(false);
  });
  it("validates IANA timezones and settings limits", () => {
    const parsed = settingsInput.safeParse({
      timezone: "America/Los_Angeles", default_duration_minutes: 30, week_starts_on: 1,
      date_format: "locale", time_format: "24h", theme: "system",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.automatic_timezone).toBe(true);
    expect(settingsInput.safeParse({
      timezone: "UTC+8", default_duration_minutes: 30, week_starts_on: 1,
      date_format: "locale", time_format: "24h", theme: "system",
    }).success).toBe(false);
  });
  it("turns database failures into plain-language messages", () => {
    expect(friendlyDataError({ code: "23505" })).toContain("already exists");
    expect(friendlyDataError({ code: "unknown", message: "internal detail" })).not.toContain("internal");
  });
});
