import type { Appointment } from "@/types/domain";

const escapeText = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
const utc = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export function appointmentToIcs(appointment: Appointment, exceptions: Appointment[] = []): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PourAgenda//EN", "CALSCALE:GREGORIAN",
    `X-WR-TIMEZONE:${appointment.timezone}`, "BEGIN:VEVENT", `UID:${appointment.id}@pouragenda`,
    `DTSTAMP:${utc(appointment.updated_at)}`, `LAST-MODIFIED:${utc(appointment.updated_at)}`];
  if (appointment.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${appointment.starts_at.slice(0, 10).replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${appointment.ends_at.slice(0, 10).replaceAll("-", "")}`);
  } else {
    lines.push(`DTSTART:${utc(appointment.starts_at)}`, `DTEND:${utc(appointment.ends_at)}`);
  }
  if (appointment.recurrence_frequency) {
    const rule = [`FREQ=${appointment.recurrence_frequency.toUpperCase()}`, `INTERVAL=${appointment.recurrence_interval ?? 1}`];
    if (appointment.recurrence_until) rule.push(`UNTIL=${appointment.recurrence_until.replaceAll("-", "")}T235959Z`);
    if (appointment.recurrence_count) rule.push(`COUNT=${appointment.recurrence_count}`);
    lines.push(`RRULE:${rule.join(";")}`);
    const cancelled = exceptions.filter((item) => item.status === "cancelled" && item.original_occurrence_start);
    if (cancelled.length) lines.push(`EXDATE:${cancelled.map((item) => utc(item.original_occurrence_start!)).join(",")}`);
  }
  lines.push(`SUMMARY:${escapeText(appointment.title)}`,
    ...(appointment.location ? [`LOCATION:${escapeText(appointment.location)}`] : []),
    ...(appointment.public_notes ? [`DESCRIPTION:${escapeText(appointment.public_notes)}`] : []),
    "END:VEVENT");
  for (const item of exceptions.filter((value) => value.status !== "cancelled" && value.original_occurrence_start)) {
    lines.push("BEGIN:VEVENT", `UID:${appointment.id}@pouragenda`, `RECURRENCE-ID:${utc(item.original_occurrence_start!)}`,
      `DTSTAMP:${utc(item.updated_at)}`, `LAST-MODIFIED:${utc(item.updated_at)}`,
      `DTSTART:${utc(item.starts_at)}`, `DTEND:${utc(item.ends_at)}`, `SUMMARY:${escapeText(item.title)}`,
      ...(item.location ? [`LOCATION:${escapeText(item.location)}`] : []),
      ...(item.public_notes ? [`DESCRIPTION:${escapeText(item.public_notes)}`] : []), "END:VEVENT");
  }
  lines.push("END:VCALENDAR", "");
  return lines.join("\r\n");
}

export function appointmentsToIcs(rows: Appointment[]) {
  const timezones = [...new Set(rows.map((row) => row.timezone).filter(Boolean))];
  const blocks = rows.filter((row) => !row.series_id).map((parent) => {
    const value = appointmentToIcs(parent, rows.filter((row) => row.series_id === parent.id));
    return value.slice(value.indexOf("BEGIN:VEVENT"), value.lastIndexOf("END:VCALENDAR")).trim();
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PourAgenda//EN", "CALSCALE:GREGORIAN",
    `X-WR-TIMEZONE:${timezones.length === 1 ? timezones[0] : "UTC"}`,
    ...blocks, "END:VCALENDAR", ""].join("\r\n");
}
