import { z } from "zod";

export const categoryInput = z.object({
  name: z.string().trim().min(1, "Enter a category name.").max(80, "Category names can be at most 80 characters."),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Choose a valid category color."),
  hidden: z.boolean().default(false),
});

export const settingsInput = z.object({
  timezone: z.string().trim().refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid IANA timezone."),
  automatic_timezone: z.boolean().default(true),
  default_duration_minutes: z.number().int().min(5).max(1440),
  week_starts_on: z.union([z.literal(0), z.literal(1)]),
  date_format: z.string().min(1),
  time_format: z.enum(["12h", "24h"]),
  theme: z.enum(["light", "dark", "system"]),
  default_reminder_minutes: z.array(z.union([z.literal(0), z.literal(10), z.literal(30), z.literal(60), z.literal(1440)])).max(5).default([]),
});

export function friendlyDataError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "A category with that name already exists.";
  if (error.code === "23503") return "This category is in use and cannot be deleted.";
  if (error.code === "42501") return "Your session cannot make that change. Sign in again.";
  return "PourAgenda could not save that change. Check your connection and try again.";
}
