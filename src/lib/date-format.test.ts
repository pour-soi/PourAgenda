import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatWallTime,
  fullCalendarTimeDisplayOptions,
  normalizeTimeFormat,
  normalizeTimeFormatPreference,
  resolveActiveTimezone,
  resolveTimeFormat,
} from "./date-format";

describe("fixed en-US display formatting", () => {
  it("normalizes missing and unknown preferences to follow system", () => {
    expect(normalizeTimeFormatPreference(undefined)).toBe("locale");
    expect(normalizeTimeFormatPreference("unknown")).toBe("locale");
  });

  it("follows the system hour cycle unless explicitly overridden", () => {
    expect(resolveTimeFormat("locale", "h12")).toBe("12h");
    expect(resolveTimeFormat("locale", "h23")).toBe("24h");
    expect(resolveTimeFormat("12h", false)).toBe("12h");
    expect(resolveTimeFormat("24h", true)).toBe("24h");
    expect(normalizeTimeFormat("locale", true)).toBe("12h");
  });

  it("provides the same resolved hour cycle to custom displays and FullCalendar", () => {
    expect(fullCalendarTimeDisplayOptions("12h")).toMatchObject({ hourCycle: "h12", meridiem: undefined });
    expect(fullCalendarTimeDisplayOptions("24h")).toMatchObject({ hourCycle: "h23", meridiem: false });
    expect(formatWallTime("13:00", "12h")).toBe("1:00 PM");
    expect(formatWallTime("13:00", "24h")).toBe("13:00");
  });

  it("keeps MM/DD/YYYY unchanged between time modes", () => {
    const instant = "2026-08-18T14:15:00.000Z";
    expect(formatDate(instant, "UTC")).toBe("08/18/2026");
    expect(formatDateTime(instant, "UTC", "12h")).toBe("08/18/2026 2:15 PM");
    expect(formatDateTime(instant, "UTC", "24h")).toBe("08/18/2026 14:15");
  });

  it("formats midnight and noon correctly without changing the instant", () => {
    expect(formatTime("2026-08-18T00:00:00.000Z", "UTC", "12h")).toBe("12:00 AM");
    expect(formatTime("2026-08-18T12:00:00.000Z", "UTC", "12h")).toBe("12:00 PM");
    expect(formatTime("2026-08-18T00:00:00.000Z", "UTC", "24h")).toBe("00:00");
    expect(formatTime("2026-08-18T12:00:00.000Z", "UTC", "24h")).toBe("12:00");
  });

  it("uses the browser timezone only when automatic detection is enabled", () => {
    expect(resolveActiveTimezone("UTC", true, "America/Los_Angeles")).toBe("America/Los_Angeles");
    expect(resolveActiveTimezone("UTC", false, "America/Los_Angeles")).toBe("UTC");
  });

  it("converts UTC instants to PDT and PST without a fixed offset", () => {
    expect(formatTime("2026-08-18T16:10:00.000Z", "America/Los_Angeles", "24h")).toBe("09:10");
    expect(formatTime("2026-08-18T17:30:00.000Z", "America/Los_Angeles", "24h")).toBe("10:30");
    expect(formatTime("2026-01-18T17:10:00.000Z", "America/Los_Angeles", "24h")).toBe("09:10");
  });
});
