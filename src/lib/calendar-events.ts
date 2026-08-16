import { allDayCalendarRange } from "@/lib/appointments";
import type { AppointmentOccurrence } from "@/types/domain";

export type CalendarCategory = { id: string; name: string; color: string };

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  classNames: string[];
  extendedProps: {
    category: string;
    categoryColor: string;
    recurring: boolean;
    location?: string | null;
    notes?: string | null;
  };
};

const contrastingText = (color: string) => {
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#17211d" : "#ffffff";
};

export function buildCalendarEvents(
  appointments: AppointmentOccurrence[],
  categories: CalendarCategory[],
): CalendarEvent[] {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  return appointments.map((appointment) => {
    const category = categoriesById.get(appointment.category_id);
    const color = category?.color ?? "#667168";
    const allDayRange = appointment.all_day ? allDayCalendarRange(appointment) : null;

    return {
      id: appointment.occurrence_id,
      title: appointment.title,
      start: allDayRange?.start ?? appointment.starts_at,
      end: allDayRange?.end ?? appointment.ends_at,
      allDay: appointment.all_day,
      backgroundColor: color,
      borderColor: color,
      textColor: contrastingText(color),
      classNames: appointment.status === "cancelled" ? ["appointment-cancelled"] : [],
      extendedProps: {
        category: category?.name ?? "Other",
        categoryColor: color,
        recurring: Boolean(appointment.series_parent_id),
        location: appointment.location,
        notes: appointment.public_notes ?? appointment.private_notes,
      },
    };
  });
}
