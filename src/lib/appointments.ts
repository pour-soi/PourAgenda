import { z } from "zod";
import type { Appointment, TimeConflict } from "@/types/domain";

export const appointmentInput = z.object({
  title: z.string().trim().min(1, "Enter an appointment title.").max(180),
  category_id: z.string().uuid("Choose a valid category."),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  timezone: z.string().min(1),
  all_day: z.boolean().default(false),
  location: z.string().trim().max(300).optional(),
  public_notes: z.string().max(20000).optional(),
  private_notes: z.string().max(20000).optional(),
}).refine((value) => Date.parse(value.ends_at) > Date.parse(value.starts_at), {
  message: "End time must be after start time.",
  path: ["ends_at"],
});

export function findConflicts(
  candidate: Pick<Appointment, "id" | "starts_at" | "ends_at">,
  appointments: Appointment[],
): TimeConflict[] {
  const start = Date.parse(candidate.starts_at);
  const end = Date.parse(candidate.ends_at);
  return appointments
    .filter((item) => item.id !== candidate.id && item.status !== "cancelled" &&
      Date.parse(item.starts_at) < end && Date.parse(item.ends_at) > start)
    .map(({ id, title, starts_at, ends_at }) => ({ id, title, starts_at, ends_at }));
}

export function isStaleEdit(expectedUpdatedAt: string, currentUpdatedAt: string): boolean {
  return expectedUpdatedAt !== currentUpdatedAt;
}

export function toLocalInput(iso: string, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

/**
 * Appointment date model:
 * - Timed appointments are instants. `starts_at` and `ends_at` are canonical and
 *   are converted through the active timezone for display.
 * - All-day appointments are calendar dates. `intended_local_start` and
 *   `intended_local_end` are canonical and must never be reconstructed by
 *   formatting a UTC timestamp in a timezone.
 *
 * All-day UTC timestamps remain database query boundaries only. They are not
 * the source of truth for editor fields, recurrence dates, or FullCalendar.
 */
const dateOnly = (value: string) => value.slice(0, 10);

const canonicalAllDayDate = (value: string | undefined, field: string) => {
  if (!value) throw new Error(`All-day appointments require ${field}.`);
  return dateOnly(value);
};

export function addCalendarDays(value: string, amount: number): string {
  const [year, month, day] = dateOnly(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

export function allDayStartToUtc(value: string): string {
  // Compatibility boundary for the timestamptz columns and range queries only.
  return `${dateOnly(value)}T00:00:00.000Z`;
}

export function localInputToUtc(value: string, timezone: string, allDay = false): string {
  if (allDay) return allDayStartToUtc(value);
  const normalized = value;
  const [date, time] = normalized.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desired;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const observed = toLocalInput(new Date(candidate).toISOString(), timezone);
    const [observedDate, observedTime] = observed.split("T");
    const [observedYear, observedMonth, observedDay] = observedDate.split("-").map(Number);
    const [observedHour, observedMinute] = observedTime.split(":").map(Number);
    candidate += desired - Date.UTC(observedYear, observedMonth - 1, observedDay, observedHour, observedMinute);
  }
  return new Date(candidate).toISOString();
}

export function allDayEndToUtc(value: string): string {
  return allDayStartToUtc(addCalendarDays(value, 1));
}

export function allDayEndToInput(exclusiveCalendarEnd: string): string {
  // FullCalendar uses an exclusive date-only end; the editor uses an inclusive end.
  return addCalendarDays(exclusiveCalendarEnd, -1);
}

type AllDayRangeSource = Pick<Appointment, "starts_at" | "ends_at" | "intended_local_start" | "intended_local_end">;

export function allDayEditorRange(value: AllDayRangeSource) {
  return {
    start: canonicalAllDayDate(value.intended_local_start, "intended_local_start"),
    end: canonicalAllDayDate(value.intended_local_end, "intended_local_end"),
  };
}

export function allDayStorageRange(start: string, inclusiveEnd: string) {
  return {
    starts_at: allDayStartToUtc(start),
    ends_at: allDayEndToUtc(inclusiveEnd),
    intended_local_start: dateOnly(start),
    intended_local_end: dateOnly(inclusiveEnd),
  };
}

export function allDayCalendarRange(value: AllDayRangeSource) {
  const range = allDayEditorRange(value);
  return { start: range.start, end: addCalendarDays(range.end, 1) };
}

export function inclusiveCalendarDayCount(start: string, inclusiveEnd: string): number {
  const startMs = Date.parse(`${dateOnly(start)}T00:00:00.000Z`);
  const endMs = Date.parse(`${dateOnly(inclusiveEnd)}T00:00:00.000Z`);
  return Math.max(1, Math.round((endMs - startMs) / 864e5) + 1);
}

export function appointmentError(error: { code?: string }): string {
  if (error.code === "23503") return "That category is not available for this account.";
  if (error.code === "42501") return "You do not have permission to change that appointment.";
  if (error.code === "PGRST301") return "Your session expired. Sign in again before saving.";
  return "PourAgenda could not save that appointment. Check your connection and try again.";
}

export function undoAppointmentValues(appointment: Appointment) {
  return { status: appointment.status, cancelled_at: appointment.cancelled_at };
}
