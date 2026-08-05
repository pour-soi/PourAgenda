import { addCalendarDays, allDayEditorRange, inclusiveCalendarDayCount, localInputToUtc, toLocalInput } from "./appointments";
import type { Appointment, AppointmentOccurrence } from "@/types/domain";

export const MAX_RECURRENCE_OCCURRENCES = 500;

const isoKey = (value: string) => new Date(value).toISOString();
const pad = (value: number) => String(value).padStart(2, "0");

function localParts(value: string) {
  const [date, time = "00:00"] = value.replace(" ", "T").split("T");
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day, time: time.slice(0, 5) };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function occurrenceLocalStart(series: Appointment, index: number) {
  const base = localParts(series.intended_local_start ?? toLocalInput(series.starts_at, series.timezone));
  const interval = series.recurrence_interval ?? 1;
  const date = new Date(Date.UTC(base.year, base.month - 1, base.day));
  if (series.recurrence_frequency === "daily") date.setUTCDate(date.getUTCDate() + index * interval);
  if (series.recurrence_frequency === "weekly") date.setUTCDate(date.getUTCDate() + index * interval * 7);
  if (series.recurrence_frequency === "monthly") {
    const targetMonth = base.month - 1 + index * interval;
    const year = base.year + Math.floor(targetMonth / 12);
    const month = ((targetMonth % 12) + 12) % 12;
    date.setUTCFullYear(year, month, Math.min(base.day, daysInMonth(year, month + 1)));
  }
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${base.time}`;
}

export function recurrenceSummary(appointment: Appointment) {
  if (!appointment.recurrence_frequency) return "Does not repeat";
  const interval = appointment.recurrence_interval ?? 1;
  const start = (appointment.intended_local_start ?? toLocalInput(appointment.starts_at, appointment.timezone)).slice(0, 10);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${start}T12:00:00Z`));
  const day = Number(start.slice(8, 10));
  const ordinal = `${day}${day % 100 >= 11 && day % 100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th"}`;
  const cadence = appointment.recurrence_frequency === "daily"
    ? interval === 1 ? "Repeats every day" : `Repeats every ${interval} days`
    : appointment.recurrence_frequency === "weekly"
      ? interval === 1 ? `Repeats every ${weekday}` : `Repeats every ${interval} weeks on ${weekday}`
      : interval === 1 ? `Repeats every month on the ${ordinal}` : `Repeats every ${interval} months on the ${ordinal}`;
  const ending = appointment.recurrence_until
    ? ` until ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${appointment.recurrence_until}T12:00:00Z`))}.`
    : " and never ends.";
  return `${cadence}${ending}`;
}

export function recurrencePreview(appointment: Appointment, count = 3): AppointmentOccurrence[] {
  if (!appointment.recurrence_frequency || count < 1) return [];
  const start = new Date(appointment.starts_at);
  const interval = appointment.recurrence_interval ?? 1;
  const end = new Date(start);
  if (appointment.recurrence_frequency === "daily") end.setUTCDate(end.getUTCDate() + interval * (count + 1));
  if (appointment.recurrence_frequency === "weekly") end.setUTCDate(end.getUTCDate() + interval * 7 * (count + 1));
  if (appointment.recurrence_frequency === "monthly") end.setUTCMonth(end.getUTCMonth() + interval * (count + 1));
  if (appointment.recurrence_until) {
    const until = new Date(`${appointment.recurrence_until}T23:59:59.999Z`);
    if (until < end) end.setTime(until.getTime());
  }
  return expandAppointments([appointment], new Date(start.getTime() - 1).toISOString(), end.toISOString()).slice(0, count);
}

export type RecurrencePreviewState = "normal" | "skipped" | "edited" | "moved";
export type RecurrencePreviewItem = {
  occurrence: AppointmentOccurrence;
  originalStartsAt: string;
  state: RecurrencePreviewState;
  exception: Appointment | null;
};

export function recurrencePreviewWithExceptions(
  appointment: Appointment,
  exceptions: Appointment[],
  count = 5,
): RecurrencePreviewItem[] {
  return recurrencePreview(appointment, count).map((generated) => {
    const exception = exceptions.find((item) => item.series_id === appointment.id
      && item.original_occurrence_start
      && isoKey(item.original_occurrence_start) === isoKey(generated.original_occurrence_start!)) ?? null;
    if (!exception) return { occurrence: generated, originalStartsAt: generated.starts_at, state: "normal", exception };
    const occurrence = { ...exception, occurrence_id: generated.occurrence_id,
      series_parent_id: appointment.id, is_generated_occurrence: false } as AppointmentOccurrence;
    const state = exception.status === "cancelled"
      ? "skipped"
      : isoKey(exception.starts_at) === isoKey(generated.starts_at) ? "edited" : "moved";
    return { occurrence, originalStartsAt: generated.starts_at, state, exception };
  });
}

export function expandAppointments(
  rows: Appointment[],
  rangeStart: string,
  rangeEnd: string,
  maximum = MAX_RECURRENCE_OCCURRENCES,
  includeCancelled = false,
): AppointmentOccurrence[] {
  const startMs = new Date(rangeStart).getTime();
  const endMs = new Date(rangeEnd).getTime();
  if (!(startMs < endMs)) return [];
  const exceptions = new Map(
    rows.filter((row) => row.series_id && row.original_occurrence_start)
      .map((row) => [`${row.series_id}:${isoKey(row.original_occurrence_start!)}`, row]),
  );
  const result: AppointmentOccurrence[] = [];
  const add = (row: Appointment, occurrenceId: string, parentId: string | null, generated: boolean) => {
    if (!includeCancelled && row.status === "cancelled") return;
    if (new Date(row.starts_at).getTime() < endMs && new Date(row.ends_at).getTime() > startMs) {
      result.push({ ...row, occurrence_id: occurrenceId, series_parent_id: parentId, is_generated_occurrence: generated });
      if (result.length > maximum) throw new Error(`Recurrence expansion exceeded the ${maximum}-occurrence safety limit.`);
    }
  };

  for (const row of rows) {
    if (row.series_id) continue;
    if (!row.recurrence_frequency) {
      add(row, row.id, null, false);
      continue;
    }
    const duration = new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime();
    const allDayRange = row.all_day ? allDayEditorRange(row) : null;
    const allDaySpan = allDayRange ? inclusiveCalendarDayCount(allDayRange.start, allDayRange.end) : 0;
    const hardIterations = 100_000;
    for (let index = 0; index < hardIterations; index += 1) {
      if (row.recurrence_count && index >= row.recurrence_count) break;
      const localStart = occurrenceLocalStart(row, index);
      if (row.recurrence_until && localStart.slice(0, 10) > row.recurrence_until) break;
      const startsAt = localInputToUtc(row.all_day ? localStart.slice(0, 10) : localStart, row.timezone, row.all_day);
      const startsMs = new Date(startsAt).getTime();
      if (startsMs >= endMs) break;
      const originalKey = isoKey(startsAt);
      const exception = exceptions.get(`${row.id}:${originalKey}`);
      if (exception) add(exception, `${row.id}:${originalKey}`, row.id, false);
      else {
        const allDayInclusiveEnd = addCalendarDays(localStart, allDaySpan - 1);
        add({ ...row, id: `${row.id}:${originalKey}`, starts_at: startsAt,
        ends_at: row.all_day ? localInputToUtc(addCalendarDays(allDayInclusiveEnd, 1), row.timezone, true)
          : new Date(startsMs + duration).toISOString(), series_id: row.id,
        intended_local_start: row.all_day ? localStart.slice(0, 10) : row.intended_local_start,
        intended_local_end: row.all_day ? allDayInclusiveEnd : row.intended_local_end,
        original_occurrence_start: originalKey }, `${row.id}:${originalKey}`, row.id, true);
      }
      if (index === hardIterations - 1) throw new Error("Recurrence expansion exceeded the iteration safety guard.");
    }
  }
  return result.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.occurrence_id.localeCompare(b.occurrence_id));
}

export function findRecurringConflicts(
  candidateRows: Appointment[],
  existingRows: Appointment[],
  rangeStart: string,
  rangeEnd: string,
) {
  const candidates = expandAppointments(candidateRows, rangeStart, rangeEnd);
  const existing = expandAppointments(existingRows, rangeStart, rangeEnd);
  return candidates.flatMap((candidate) => existing
    .filter((item) => item.occurrence_id !== candidate.occurrence_id
      && item.starts_at < candidate.ends_at && item.ends_at > candidate.starts_at)
    .map((item) => ({ ...item, conflicting_occurrence_start: candidate.starts_at })));
}
