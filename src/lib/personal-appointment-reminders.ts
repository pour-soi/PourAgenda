import { addCalendarDays, localInputToUtc, toLocalInput } from "./appointments";
import type { AppointmentOccurrence } from "@/types/domain";
import { notificationTargetKey } from "./notification-deep-link";

export const PERSONAL_REMINDER_RECOVERY_MINUTES = 15;
export const PERSONAL_REMINDER_CANDIDATE_MINUTES = 30;
export type PersonalReminderType = "previous_day_21" | "one_hour_before" | "fifteen_minutes_before";

export type PersonalReminderSlot = {
  key: string;
  appointmentId: string;
  occurrenceStart: string;
  scheduledAt: string;
  reminderType: PersonalReminderType;
};

export function personalReminderSlots(occurrence: AppointmentOccurrence, now = new Date()): PersonalReminderSlot[] {
  if (occurrence.status === "cancelled") return [];
  const localDate = occurrence.all_day
    ? (occurrence.intended_local_start ?? toLocalInput(occurrence.starts_at, occurrence.timezone)).slice(0, 10)
    : toLocalInput(occurrence.starts_at, occurrence.timezone).slice(0, 10);
  const occurrenceStart = occurrence.original_occurrence_start ?? occurrence.starts_at;
  const previousDay = addCalendarDays(localDate, -1);
  const slots: Array<{ reminderType: PersonalReminderType; scheduledAt: string }> = [
    { reminderType: "previous_day_21", scheduledAt: localInputToUtc(`${previousDay}T21:00`, occurrence.timezone) },
  ];
  if (!occurrence.all_day) slots.push(
    { reminderType: "one_hour_before", scheduledAt: new Date(Date.parse(occurrence.starts_at) - 60 * 60_000).toISOString() },
    { reminderType: "fifteen_minutes_before", scheduledAt: new Date(Date.parse(occurrence.starts_at) - 15 * 60_000).toISOString() },
  );
  return slots.map(({ reminderType, scheduledAt }) => ({
      key: [occurrence.occurrence_id, occurrenceStart, occurrence.starts_at, reminderType, scheduledAt].join(":"),
      appointmentId: occurrence.series_parent_id ?? occurrence.id,
      occurrenceStart,
      scheduledAt,
      reminderType,
    })).filter((slot) => Date.parse(slot.scheduledAt) > now.getTime());
}

export function duePersonalReminderSlots(occurrence: AppointmentOccurrence, now: Date, windowMinutes = PERSONAL_REMINDER_RECOVERY_MINUTES) {
  const windowStart = new Date(now.getTime() - windowMinutes * 60_000);
  return personalReminderSlots(occurrence, windowStart).filter((slot) => Date.parse(slot.scheduledAt) <= now.getTime());
}

export async function personalReminderNotification(occurrence: AppointmentOccurrence) {
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: occurrence.timezone })
    .format(new Date(occurrence.starts_at));
  const time = occurrence.all_day ? "All day" : new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: occurrence.timezone,
  }).format(new Date(occurrence.starts_at));
  return {
    title: "Personal appointment coming up",
    body: occurrence.all_day ? `${occurrence.title} · ${date} · All day` : `${occurrence.title} · ${date} at ${time}`,
    target: await notificationTargetKey(occurrence.occurrence_id),
    date: toLocalInput(occurrence.starts_at, occurrence.timezone).slice(0, 10),
  };
}
