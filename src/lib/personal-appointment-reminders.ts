import { addCalendarDays, localInputToUtc, toLocalInput } from "./appointments";
import type { AppointmentOccurrence } from "@/types/domain";
import { notificationTargetKey } from "./notification-deep-link";

export const PERSONAL_APPOINTMENT_CATEGORY = "Personal Appointment";
export const PERSONAL_REMINDER_HOURS = [12, 17, 21] as const;
export const PERSONAL_REMINDER_RECOVERY_MINUTES = 15;
export const PERSONAL_REMINDER_CANDIDATE_MINUTES = 30;

export type PersonalReminderSlot = {
  key: string;
  appointmentId: string;
  occurrenceStart: string;
  scheduledAt: string;
};

export function personalReminderSlots(occurrence: AppointmentOccurrence, now = new Date()): PersonalReminderSlot[] {
  const localStart = occurrence.all_day
    ? (occurrence.intended_local_start ?? toLocalInput(occurrence.starts_at, occurrence.timezone)).slice(0, 10)
    : toLocalInput(occurrence.starts_at, occurrence.timezone).slice(0, 10);
  const occurrenceStart = occurrence.original_occurrence_start ?? occurrence.starts_at;
  return [3, 2, 1].flatMap((daysBefore) => {
    const reminderDate = addCalendarDays(localStart, -daysBefore);
    return PERSONAL_REMINDER_HOURS.map((hour) => ({
      key: [occurrence.occurrence_id, occurrenceStart, reminderDate, hour, "personal-appointment"].join(":"),
      appointmentId: occurrence.series_parent_id ?? occurrence.id,
      occurrenceStart,
      scheduledAt: localInputToUtc(`${reminderDate}T${String(hour).padStart(2, "0")}:00`, occurrence.timezone),
    }));
  }).filter((slot) => Date.parse(slot.scheduledAt) > now.getTime());
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
