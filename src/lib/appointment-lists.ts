import type { Appointment, AppointmentOccurrence } from "@/types/domain";

export type AppointmentListSection = "upcoming" | "today" | "this-week" | "completed" | "cancelled" | "archived";
export const appointmentListSections = [
  "upcoming", "today", "this-week", "archived",
] as const satisfies readonly AppointmentListSection[];
export type AppointmentCursor = { value: string; id: string };

const stableId = (item: Appointment | AppointmentOccurrence) =>
  "occurrence_id" in item ? item.occurrence_id : item.id;

export function mergeAppointmentPages(current: Appointment[], next: Appointment[]): Appointment[] {
  const seen = new Set(current.map(stableId));
  return [...current, ...next.filter((item) => !seen.has(stableId(item)))];
}

export function appointmentCursor(
  rows: Appointment[],
  field: "starts_at" | "completed_at" | "cancelled_at",
): AppointmentCursor | null {
  const last = rows.at(-1);
  const value = last?.[field];
  return last && value ? { value, id: stableId(last) } : null;
}

export function activeFilterCount(kind: string, category: string, search: string): number {
  return Number(kind !== "all") + Number(category !== "all") + Number(Boolean(search.trim()));
}
