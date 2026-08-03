import { describe, expect, it } from "vitest";
import {
  dayPlanningRules,
  daySummary,
  formatCountdown,
  freeTimeSummary,
  nextEventForDay,
  parseQuickAdd,
  searchEvents,
  selectedDateHeading,
  type ProductivityEvent,
} from "./personal-productivity";

const event = (
  id: string,
  start: string,
  end: string,
  allDay = false,
  title = id,
): ProductivityEvent => ({
  id,
  title,
  start,
  end,
  allDay,
  category: "Focus",
  categoryColor: "#375f52",
});

describe("selected-day heading and summary", () => {
  const now = new Date("2026-07-30T18:00:00.000Z");

  it("labels today, tomorrow, and ordinary dates in the active timezone", () => {
    expect(selectedDateHeading("2026-07-30", "UTC", now)).toMatchObject({
      relativeLabel: "Today",
      fullDate: "Thursday, July 30",
    });
    expect(selectedDateHeading("2026-07-31", "UTC", now).relativeLabel).toBe("Tomorrow");
    expect(selectedDateHeading("2026-08-03", "UTC", now)).toMatchObject({
      relativeLabel: null,
      fullDate: "Monday, August 3",
    });
    expect(selectedDateHeading("2026-07-29", "Pacific/Kiritimati", new Date("2026-07-28T10:30:00Z")).relativeLabel).toBe("Today");
  });

  it("merges overlapping timed intervals and counts all-day occurrences without adding 24 hours", () => {
    const result = daySummary([
      event("one", "2026-07-30T09:00:00Z", "2026-07-30T10:30:00Z"),
      event("two", "2026-07-30T10:00:00Z", "2026-07-30T11:00:00Z"),
      event("all-day", "2026-07-30T00:00:00Z", "2026-07-31T00:00:00Z", true),
    ], "2026-07-30", "UTC");
    expect(result).toEqual({ count: 3, occupiedMinutes: 120, label: "3 events · 2h scheduled" });
  });

  it("handles empty and invalid ranges without breaking the summary", () => {
    expect(daySummary([], "2026-07-30", "UTC").label).toBe("Nothing scheduled");
    expect(daySummary([
      event("invalid", "2026-07-30T11:00:00Z", "2026-07-30T10:00:00Z"),
    ], "2026-07-30", "UTC")).toMatchObject({ count: 1, occupiedMinutes: 0 });
  });
});

describe("next event", () => {
  const now = new Date("2026-07-30T12:00:00Z");

  it("selects the most recently started overlapping current event", () => {
    const result = nextEventForDay([
      event("earlier", "2026-07-30T11:00:00Z", "2026-07-30T13:00:00Z"),
      event("later", "2026-07-30T11:30:00Z", "2026-07-30T12:30:00Z"),
    ], "2026-07-30", "UTC", now);
    expect(result).toMatchObject({ kind: "current", event: { id: "later" }, label: "Happening now" });
  });

  it("excludes ended events and never creates a negative countdown", () => {
    const result = nextEventForDay([
      event("ended", "2026-07-30T10:00:00Z", "2026-07-30T11:00:00Z"),
      event("next", "2026-07-30T13:12:00Z", "2026-07-30T14:00:00Z"),
    ], "2026-07-30", "UTC", now);
    expect(result).toMatchObject({ kind: "next", event: { id: "next" }, label: "Starts in 1h 12m" });
    expect(formatCountdown(-60_000)).toBe("Starts in 0m");
  });

  it("uses restrained empty, future, past, and rest-of-day states", () => {
    expect(nextEventForDay([], "2026-07-30", "UTC", now).kind).toBe("empty");
    expect(nextEventForDay([
      event("first", "2026-07-31T09:00:00Z", "2026-07-31T10:00:00Z"),
    ], "2026-07-31", "UTC", now)).toMatchObject({ kind: "first", label: "First event" });
    expect(nextEventForDay([], "2026-07-29", "UTC", now).kind).toBe("past");
    expect(nextEventForDay([
      event("ended", "2026-07-30T10:00:00Z", "2026-07-30T11:00:00Z"),
    ], "2026-07-30", "UTC", now).kind).toBe("free");
  });
});

describe("free-time summary", () => {
  it("uses a 7am–10pm window, merges overlaps, and ignores gaps under 15 minutes", () => {
    expect(dayPlanningRules).toEqual({
      dayStartMinutes: 420,
      dayEndMinutes: 1320,
      minimumFreeBlockMinutes: 15,
    });
    const result = freeTimeSummary([
      event("one", "2026-07-31T09:00:00Z", "2026-07-31T12:00:00Z"),
      event("two", "2026-07-31T11:30:00Z", "2026-07-31T13:00:00Z"),
      event("three", "2026-07-31T13:10:00Z", "2026-07-31T17:00:00Z"),
    ], "2026-07-31", "UTC", new Date("2026-07-30T12:00:00Z"));
    expect(result).toBe("Largest free block: 5:00 PM–10:00 PM");
  });

  it("reports free-until, current-event blocking, rest-of-day, no-event, and past-date states", () => {
    expect(freeTimeSummary([
      event("next", "2026-07-30T14:00:00Z", "2026-07-30T15:00:00Z"),
    ], "2026-07-30", "UTC", new Date("2026-07-30T12:00:00Z"))).toBe("Free until 2:00 PM");
    expect(freeTimeSummary([
      event("current", "2026-07-30T11:00:00Z", "2026-07-30T15:00:00Z"),
      event("later", "2026-07-30T17:00:00Z", "2026-07-30T18:00:00Z"),
    ], "2026-07-30", "UTC", new Date("2026-07-30T12:00:00Z"))).toBe("Next free block: 3:00 PM–5:00 PM");
    expect(freeTimeSummary([], "2026-07-30", "UTC", new Date("2026-07-30T12:00:00Z"))).toBe("Free for the rest of today");
    expect(freeTimeSummary([], "2026-07-31", "UTC", new Date("2026-07-30T12:00:00Z"))).toBe("15h available");
    expect(freeTimeSummary([], "2026-07-29", "UTC", new Date("2026-07-30T12:00:00Z"))).toBeNull();
  });

  it("does not let all-day or out-of-window events erase the practical day", () => {
    expect(freeTimeSummary([
      event("all", "2026-07-31T00:00:00Z", "2026-08-01T00:00:00Z", true),
      event("early", "2026-07-31T04:00:00Z", "2026-07-31T05:00:00Z"),
    ], "2026-07-31", "UTC", new Date("2026-07-30T12:00:00Z"))).toBe("15h available");
  });
});

describe("deterministic Quick Add", () => {
  const now = new Date("2026-07-30T10:00:00Z");

  it.each([
    ["Dentist tomorrow 2pm", "Dentist", "2026-07-31", "14:00"],
    ["Meeting Friday 10am", "Meeting", "2026-07-31", "10:00"],
    ["Dinner tonight", "Dinner", "2026-07-30", "19:00"],
    ["Gym Monday 7pm", "Gym", "2026-08-03", "19:00"],
    ["Doctor August 12 at 3pm", "Doctor", "2026-08-12", "15:00"],
    ["Lunch today noon", "Lunch", "2026-07-30", "12:00"],
    ["Call Sarah in 2 hours", "Call Sarah", "2026-07-30", "12:00"],
  ])("parses %s", (input, title, dateKey, time) => {
    expect(parseQuickAdd(input, "UTC", now)).toMatchObject({
      title,
      dateKey,
      time,
      status: "complete",
    });
  });

  it("keeps uncertain fields editable instead of fabricating a time", () => {
    expect(parseQuickAdd("Coffee Saturday", "UTC", now)).toMatchObject({
      title: "Coffee",
      dateKey: "2026-08-01",
      time: null,
      status: "partial",
    });
    expect(parseQuickAdd("Meeting next week", "UTC", now)).toMatchObject({
      dateKey: null,
      status: "unsupported",
    });
  });
  it("recognizes weekly phrases without silently completing a missing time", () => {
    expect(parseQuickAdd("Meeting Aug 18 3pm", "UTC", now)).toMatchObject({ title: "Meeting", dateKey: "2026-08-18", time: "15:00", status: "complete" });
    expect(parseQuickAdd("Dinner Sat 7pm", "UTC", now)).toMatchObject({ title: "Dinner", dateKey: "2026-08-01", time: "19:00", status: "complete" });
    expect(parseQuickAdd("Every Tuesday WFH", "UTC", now)).toMatchObject({ title: "WFH", dateKey: "2026-08-04", recurrenceFrequency: "weekly", status: "partial" });
  });

  it("extracts a street address, numeric date, and compact time from the requested example", () => {
    expect(parseQuickAdd("255 Howth Street client 8/15 4pm", "UTC", now)).toMatchObject({
      title: "client", location: "255 Howth Street", dateKey: "2026-08-15", time: "16:00", status: "complete",
    });
  });

  it.each([
    ["Planning tomorrow", { title: "Planning", dateKey: "2026-07-31", time: null }],
    ["Planning 4:30", { title: "Planning", dateKey: null, time: "04:30" }],
    ["Planning 430pm", { title: "Planning", time: "16:30" }],
    ["Planning 16:00", { title: "Planning", time: "16:00" }],
    ["Planning 255 Howth Rd", { title: "Planning", location: "255 Howth Rd" }],
    ["Airport pickup", { title: "pickup", location: "Airport" }],
    ["Planning tomorrow 30m", { title: "Planning", durationMinutes: 30 }],
    ["Planning tomorrow 30 min", { title: "Planning", durationMinutes: 30 }],
    ["Planning tomorrow 1h", { title: "Planning", durationMinutes: 60 }],
    ["Planning tomorrow 90 minutes", { title: "Planning", durationMinutes: 90 }],
  ])("structures %s", (input, expected) => expect(parseQuickAdd(input, "UTC", now)).toMatchObject(expected));

  it("leaves ambiguous text in the title and leaves default duration unspecified", () => {
    expect(parseQuickAdd("Meet near the old building next week", "UTC", now)).toMatchObject({
      title: "Meet near the old building next week", dateKey: null, time: null, location: null, durationMinutes: null,
    });
  });
});

describe("event search", () => {
  const items = [
    {
      id: "1", title: "Design review", startsAt: "2026-08-01T10:00:00Z", allDay: false,
      category: "Focus", categoryColor: "#375f52", location: "Studio", notes: "Discuss launch", source: {},
    },
    {
      id: "2", title: "Focus block", startsAt: "2026-07-01T10:00:00Z", allDay: false,
      category: "Personal", categoryColor: "#a26068", location: null, notes: "Design notes", source: {},
    },
  ];

  it("matches title, notes, location, and category case-insensitively with title first", () => {
    expect(searchEvents(items, "  DESIGN ", new Date("2026-07-30T00:00:00Z")).map((item) => item.id)).toEqual(["1", "2"]);
    expect(searchEvents(items, "studio")[0].id).toBe("1");
    expect(searchEvents(items, "personal")[0].id).toBe("2");
    expect(searchEvents(items, "missing")).toEqual([]);
    expect(searchEvents(items, "   ")).toEqual([]);
  });
});
