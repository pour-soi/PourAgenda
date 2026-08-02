export type TimeFormat = "12h" | "24h";
export type TimeFormatPreference = "locale" | TimeFormat;

export const normalizeTimeFormatPreference = (
  value: string | null | undefined,
): TimeFormatPreference => (value === "12h" || value === "24h" ? value : "locale");

export const resolveTimeFormat = (
  value: string | null | undefined,
  systemUses12Hour = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12,
): TimeFormat => {
  const preference = normalizeTimeFormatPreference(value);
  if (preference !== "locale") return preference;
  return systemUses12Hour === false ? "24h" : "12h";
};

export const normalizeTimeFormat = resolveTimeFormat;

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
