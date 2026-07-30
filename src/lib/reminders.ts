export const REMINDER_OPTIONS = [
  { value: 0, label: "At start time" }, { value: 10, label: "10 minutes before" },
  { value: 30, label: "30 minutes before" }, { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
] as const;

export function normalizeReminderMinutes(values: number[]) {
  return [...new Set(values)].filter((value) => [0, 10, 30, 60, 1440].includes(value)).sort((a, b) => a - b);
}

export function reminderTimes(startsAt: string, values: number[], status: string) {
  if (status === "cancelled" || status === "completed") return [];
  const start = Date.parse(startsAt);
  return normalizeReminderMinutes(values).map((minutes) => new Date(start - minutes * 60_000).toISOString());
}
