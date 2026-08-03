import { describe, expect, it } from "vitest";
import {
  ENGLISH_MONTHS,
  ENGLISH_WEEKDAYS,
  formatEnglishDateTime,
  formatEnglishTime,
} from "./date-time-picker";

describe("fixed English date and time formatting", () => {
  it("uses MM/DD/YYYY with the selected 12-hour or 24-hour time format", () => {
    expect(formatEnglishDateTime("2026-08-18T22:30", false, "12h")).toBe("08/18/2026 10:30 PM");
    expect(formatEnglishDateTime("2026-08-18T22:30", false, "24h")).toBe("08/18/2026 22:30");
    expect(formatEnglishTime("2026-08-18T00:05", "12h")).toBe("12:05 AM");
  });

  it("formats midnight and noon without changing their stored hour", () => {
    expect(formatEnglishTime("2026-08-18T00:00", "12h")).toBe("12:00 AM");
    expect(formatEnglishTime("2026-08-18T12:00", "12h")).toBe("12:00 PM");
    expect(formatEnglishTime("2026-08-18T23:59", "24h")).toBe("23:59");
  });

  it("uses fixed English month names and Sunday-first weekday names", () => {
    expect(ENGLISH_MONTHS[7]).toBe("August");
    expect(ENGLISH_WEEKDAYS).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it("rejects malformed dates instead of displaying a localized fallback", () => {
    expect(formatEnglishDateTime("18/08/2026 10:30", false, "12h")).toBe("");
  });
});
