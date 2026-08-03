export type TimeFormat = "12h" | "24h";
export type TimeFormatPreference = "locale" | TimeFormat;
export type ResolvedHourCycle = "h12" | "h23";

export const normalizeTimeFormatPreference = (
  value: string | null | undefined,
): TimeFormatPreference => (value === "12h" || value === "24h" ? value : "locale");

export const resolveTimeFormat = (
  value: string | null | undefined,
  systemHourCycle: ResolvedHourCycle | boolean = detectSystemHourCycle(),
): TimeFormat => {
  const preference = normalizeTimeFormatPreference(value);
  if (preference !== "locale") return preference;
  const resolvedSystemCycle = typeof systemHourCycle === "boolean"
    ? systemHourCycle ? "h12" : "h23"
    : systemHourCycle;
  return resolvedSystemCycle === "h23" ? "24h" : "12h";
};

export const normalizeTimeFormat = resolveTimeFormat;

export function detectSystemHourCycle(): ResolvedHourCycle {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 === false
    ? "h23"
    : "h12";
}

export function timeDisplayOptions(timeFormat: TimeFormat): Intl.DateTimeFormatOptions {
  return {
    hour: timeFormat === "24h" ? "2-digit" : "numeric",
    minute: "2-digit",
    hourCycle: timeFormat === "24h" ? "h23" : "h12",
  };
}

export function fullCalendarTimeDisplayOptions(timeFormat: TimeFormat) {
  return {
    ...timeDisplayOptions(timeFormat),
    meridiem: timeFormat === "24h" ? false : undefined,
  };
}

export function formatWallTime(value: string, timeFormat: TimeFormat): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  if (timeFormat === "24h") return `${match[1]}:${match[2]}`;
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatDate(value: Date | string, timezone = "UTC"): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, month: "2-digit", day: "2-digit", year: "numeric",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatTime(value: Date | string, timezone: string, timeFormat: TimeFormat): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    ...timeDisplayOptions(timeFormat),
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: Date | string, timezone: string, timeFormat: TimeFormat): string {
  return `${formatDate(value, timezone)} ${formatTime(value, timezone, timeFormat)}`;
}
