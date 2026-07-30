export type TimeFormat = "12h" | "24h";

export const normalizeTimeFormat = (value: string | null | undefined): TimeFormat =>
  value === "24h" ? "24h" : "12h";

export function formatDate(value: Date | string, timezone = "UTC"): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, month: "2-digit", day: "2-digit", year: "numeric",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatTime(value: Date | string, timezone: string, timeFormat: TimeFormat): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: timeFormat === "24h" ? "2-digit" : "numeric",
    minute: "2-digit",
    hour12: timeFormat === "12h",
    hourCycle: timeFormat === "24h" ? "h23" : undefined,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: Date | string, timezone: string, timeFormat: TimeFormat): string {
  return `${formatDate(value, timezone)} ${formatTime(value, timezone, timeFormat)}`;
}
