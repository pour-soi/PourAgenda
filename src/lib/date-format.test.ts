import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatTime,
  normalizeTimeFormat,
  normalizeTimeFormatPreference,
  resolveTimeFormat,
} from "./date-format";

describe("fixed en-US display formatting", () => {
  it("normalizes missing and unknown preferences to follow system", () => {
    expect(normalizeTimeFormatPreference(undefined)).toBe("locale");
    expect(normalizeTimeFormatPreference("unknown")).toBe("locale");
  });

  it("follows the system hour cycle unless explicitly overridden", () => {
    expect(resolveTimeFormat("locale", true)).toBe("12h");
    expect(resolveTimeFormat("locale", false)).toBe("24h");
    expect(resolveTimeFormat("12h", false)).toBe("12h");
    expect(resolveTimeFormat("24h", true)).toBe("24h");
    expect(normalizeTimeFormat("locale", true)).toBe("12h");
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
  });
});
