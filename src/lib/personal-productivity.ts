import { localInputToUtc, toLocalInput } from "@/lib/appointments";

export type ProductivityEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  category: string;
  categoryColor?: string;
  location?: string | null;
  notes?: string | null;
};

export type DayKind = "today" | "tomorrow" | "past" | "future";

type Interval = { start: number; end: number };

const DAY_START_MINUTES = 7 * 60;
const DAY_END_MINUTES = 22 * 60;
const MIN_FREE_BLOCK_MINUTES = 15;

export function zonedDateKey(value: Date | string, timezone: string): string {
  return toLocalInput(typeof value === "string" ? value : value.toISOString(), timezone).slice(0, 10);
}

export function addCalendarDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function dayKind(dateKey: string, timezone: string, now = new Date()): DayKind {
  const today = zonedDateKey(now, timezone);
  if (dateKey === today) return "today";
  if (dateKey === addCalendarDays(today, 1)) return "tomorrow";
  return dateKey < today ? "past" : "future";
}

export function selectedDateHeading(dateKey: string, timezone: string, now = new Date()) {
  const kind = dayKind(dateKey, timezone, now);
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  const fullDate = new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
  return {
    kind,
    relativeLabel: kind === "today" ? "Today" : kind === "tomorrow" ? "Tomorrow" : null,
    fullDate,
  };
}

function dayBounds(dateKey: string, timezone: string): Interval {
  return {
    start: Date.parse(localInputToUtc(`${dateKey}T00:00`, timezone)),
    end: Date.parse(localInputToUtc(`${addCalendarDays(dateKey, 1)}T00:00`, timezone)),
  };
}

export function eventsForDate(events: ProductivityEvent[], dateKey: string, timezone: string) {
  return events.filter((event) => (
    event.allDay ? event.start.slice(0, 10) === dateKey : zonedDateKey(event.start, timezone) === dateKey
  ));
}

function timedIntervals(events: ProductivityEvent[], dateKey: string, timezone: string): Interval[] {
  const bounds = dayBounds(dateKey, timezone);
  return events
    .filter((event) => !event.allDay)
    .map((event) => ({
      start: Math.max(bounds.start, Date.parse(event.start)),
      end: Math.min(bounds.end, Date.parse(event.end)),
    }))
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start);
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) merged.push({ ...interval });
    else previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (!hours) return `${remainder}m`;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export function daySummary(events: ProductivityEvent[], dateKey: string, timezone: string) {
  const selected = eventsForDate(events, dateKey, timezone);
  if (!selected.length) return { count: 0, occupiedMinutes: 0, label: "Nothing scheduled" };
  const occupiedMinutes = mergeIntervals(timedIntervals(selected, dateKey, timezone))
    .reduce((total, interval) => total + (interval.end - interval.start) / 60_000, 0);
  const noun = selected.length === 1 ? "event" : "events";
  return {
    count: selected.length,
    occupiedMinutes,
    label: `${selected.length} ${noun} · ${formatDuration(occupiedMinutes)} scheduled`,
  };
}

export function formatCountdown(milliseconds: number): string {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  return `Starts in ${formatDuration(minutes)}`;
}

export type NextEventResult =
  | { kind: "past"; event: null; label: null }
  | { kind: "empty"; event: null; label: "No events scheduled for this day" }
  | { kind: "free"; event: null; label: "Free for the rest of today" }
  | { kind: "current" | "next" | "first" | "all-day"; event: ProductivityEvent; label: string };

export function nextEventForDay(
  events: ProductivityEvent[],
  dateKey: string,
  timezone: string,
  now = new Date(),
): NextEventResult {
  const kind = dayKind(dateKey, timezone, now);
  if (kind === "past") return { kind: "past", event: null, label: null };
  const selected = eventsForDate(events, dateKey, timezone);
  if (!selected.length) return { kind: "empty", event: null, label: "No events scheduled for this day" };
  const timed = selected
    .filter((event) => !event.allDay && Date.parse(event.end) > Date.parse(event.start))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const allDay = selected.filter((event) => event.allDay).sort((a, b) => a.title.localeCompare(b.title));
  if (kind === "today") {
    const current = timed
      .filter((event) => Date.parse(event.start) <= now.getTime() && now.getTime() < Date.parse(event.end))
      .sort((a, b) => Date.parse(b.start) - Date.parse(a.start))[0];
    if (current) return { kind: "current", event: current, label: "Happening now" };
    const next = timed.find((event) => Date.parse(event.start) > now.getTime());
    if (next) return { kind: "next", event: next, label: formatCountdown(Date.parse(next.start) - now.getTime()) };
    if (allDay[0]) return { kind: "all-day", event: allDay[0], label: "All day" };
    return { kind: "free", event: null, label: "Free for the rest of today" };
  }
  const first = allDay[0] ?? timed[0];
  return {
    kind: first.allDay ? "all-day" : "first",
    event: first,
    label: first.allDay ? "First event · All day" : "First event",
  };
}

function formatTime(timestamp: number, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function localBoundary(dateKey: string, minutes: number, timezone: string) {
  const hour = Math.floor(minutes / 60).toString().padStart(2, "0");
  const minute = (minutes % 60).toString().padStart(2, "0");
  return Date.parse(localInputToUtc(`${dateKey}T${hour}:${minute}`, timezone));
}

export function freeTimeSummary(
  events: ProductivityEvent[],
  dateKey: string,
  timezone: string,
  now = new Date(),
): string | null {
  const kind = dayKind(dateKey, timezone, now);
  if (kind === "past") return null;
  const windowStart = localBoundary(dateKey, DAY_START_MINUTES, timezone);
  const windowEnd = localBoundary(dateKey, DAY_END_MINUTES, timezone);
  const cursor = kind === "today" ? Math.max(windowStart, now.getTime()) : windowStart;
  if (cursor >= windowEnd) return kind === "today" ? "No free time remaining today" : null;
  const occupied = mergeIntervals(timedIntervals(eventsForDate(events, dateKey, timezone), dateKey, timezone)
    .map((interval) => ({ start: Math.max(interval.start, windowStart), end: Math.min(interval.end, windowEnd) }))
    .filter((interval) => interval.end > interval.start));
  const relevant = occupied.filter((interval) => interval.end > cursor);
  if (!relevant.length) {
    return kind === "today"
      ? "Free for the rest of today"
      : `${formatDuration((windowEnd - windowStart) / 60_000)} available`;
  }
  if (kind === "today" && cursor < relevant[0].start
      && relevant[0].start - cursor >= MIN_FREE_BLOCK_MINUTES * 60_000) {
    return `Free until ${formatTime(relevant[0].start, timezone)}`;
  }
  const gaps: Interval[] = [];
  let gapStart = cursor;
  for (const interval of relevant) {
    if (interval.start - gapStart >= MIN_FREE_BLOCK_MINUTES * 60_000) {
      gaps.push({ start: gapStart, end: interval.start });
    }
    gapStart = Math.max(gapStart, interval.end);
  }
  if (windowEnd - gapStart >= MIN_FREE_BLOCK_MINUTES * 60_000) {
    gaps.push({ start: gapStart, end: windowEnd });
  }
  if (!gaps.length) return kind === "today" ? "No meaningful free block remaining" : "No meaningful free block";
  if (kind === "today") {
    const first = gaps[0];
    if (first.end === windowEnd) return "Free for the rest of today";
    return `Next free block: ${formatTime(first.start, timezone)}–${formatTime(first.end, timezone)}`;
  }
  const largest = gaps.slice().sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  return `Largest free block: ${formatTime(largest.start, timezone)}–${formatTime(largest.end, timezone)}`;
}

export type QuickAddResult = {
  title: string;
  dateKey: string | null;
  time: string | null;
  status: "complete" | "partial" | "unsupported";
  explanation: string;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function dateKeyForWeekday(today: string, weekday: number) {
  const current = new Date(`${today}T12:00:00.000Z`).getUTCDay();
  const distance = (weekday - current + 7) % 7;
  return addCalendarDays(today, distance);
}

function parseClock(hourText: string, minuteText: string | undefined, meridiem: string) {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

export function parseQuickAdd(
  input: string,
  timezone: string,
  now = new Date(),
): QuickAddResult {
  const original = input.trim().replace(/\s+/g, " ");
  const today = zonedDateKey(now, timezone);
  let dateKey: string | null = null;
  let time: string | null = null;
  let remainder = original;

  const relative = /\bin\s+(\d{1,2})\s+hours?\b/i.exec(original);
  if (relative) {
    const target = new Date(now.getTime() + Number(relative[1]) * 3_600_000);
    dateKey = zonedDateKey(target, timezone);
    time = toLocalInput(target.toISOString(), timezone).slice(11, 16);
    remainder = remainder.replace(relative[0], "");
  }

  const noon = /\bnoon\b/i.exec(remainder);
  if (noon) {
    time = "12:00";
    remainder = remainder.replace(noon[0], "");
  }
  const clock = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(remainder);
  if (clock) {
    time = parseClock(clock[1], clock[2], clock[3].toLowerCase());
    remainder = remainder.replace(clock[0], "");
  }

  if (!dateKey && /\btoday\b/i.test(remainder)) {
    dateKey = today;
    remainder = remainder.replace(/\btoday\b/i, "");
  } else if (!dateKey && /\btomorrow\b/i.test(remainder)) {
    dateKey = addCalendarDays(today, 1);
    remainder = remainder.replace(/\btomorrow\b/i, "");
  } else if (!dateKey && /\btonight\b/i.test(remainder)) {
    dateKey = today;
    time ??= "19:00";
    remainder = remainder.replace(/\btonight\b/i, "");
  }

  if (!dateKey) {
    const weekday = WEEKDAYS.findIndex((value) => new RegExp(`\\b${value}\\b`, "i").test(remainder));
    if (weekday >= 0) {
      dateKey = dateKeyForWeekday(today, weekday);
      remainder = remainder.replace(new RegExp(`\\b${WEEKDAYS[weekday]}\\b`, "i"), "");
    }
  }

  if (!dateKey) {
    const monthMatch = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{1,2})\\b`, "i").exec(remainder);
    if (monthMatch) {
      const month = MONTHS.indexOf(monthMatch[1].toLowerCase());
      const day = Number(monthMatch[2]);
      const currentYear = Number(today.slice(0, 4));
      const candidate = new Date(Date.UTC(currentYear, month, day, 12));
      if (candidate.getUTCMonth() === month && candidate.getUTCDate() === day) {
        dateKey = candidate.toISOString().slice(0, 10);
        if (dateKey < today) dateKey = `${currentYear + 1}-${dateKey.slice(5)}`;
        remainder = remainder.replace(monthMatch[0], "");
      }
    }
  }

  const title = remainder.replace(/\bat\b/gi, "").replace(/\s+/g, " ").trim() || original;
  if (!dateKey) {
    return { title, dateKey: null, time, status: "unsupported", explanation: "Choose a date and time before saving." };
  }
  if (!time) {
    return { title, dateKey, time: null, status: "partial", explanation: "Date recognized. Choose a time before saving." };
  }
  return { title, dateKey, time, status: "complete", explanation: "Date and time recognized. Review before saving." };
}

export type SearchableEvent = {
  id: string;
  title: string;
  startsAt: string;
  allDay: boolean;
  category: string;
  categoryColor: string;
  location?: string | null;
  notes?: string | null;
  source: unknown;
};

export type SearchResult = SearchableEvent & { score: number; context: string | null };

export function searchEvents(events: SearchableEvent[], query: string, now = new Date()): SearchResult[] {
  const term = query.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (!term) return [];
  return events.flatMap((event) => {
    const fields = [
      { value: event.title, score: 100, context: null },
      { value: event.category, score: 50, context: `Category: ${event.category}` },
      { value: event.location ?? "", score: 35, context: event.location ? `Location: ${event.location}` : null },
      { value: event.notes ?? "", score: 20, context: event.notes || null },
    ];
    const matched = fields.filter((field) => field.value.toLocaleLowerCase().includes(term));
    if (!matched.length) return [];
    const best = matched.sort((a, b) => b.score - a.score)[0];
    const exactTitle = event.title.trim().toLocaleLowerCase() === term ? 40 : 0;
    const futureBonus = Date.parse(event.startsAt) >= now.getTime() ? 5 : 0;
    return [{ ...event, score: best.score + exactTitle + futureBonus, context: best.context }];
  }).sort((a, b) => b.score - a.score || Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export const dayPlanningRules = {
  dayStartMinutes: DAY_START_MINUTES,
  dayEndMinutes: DAY_END_MINUTES,
  minimumFreeBlockMinutes: MIN_FREE_BLOCK_MINUTES,
} as const;
