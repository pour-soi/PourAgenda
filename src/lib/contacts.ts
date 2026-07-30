import { z } from "zod";

export const CONTACT_PAGE_SIZE = 20;

export const contactInput = z.object({
  name: z.string().trim().min(1, "Enter a contact name.").max(180),
  phone: z.string().trim().max(50).optional(),
  email: z.email("Enter a valid email address.").optional().or(z.literal("")),
  organization: z.string().trim().max(180).optional(),
  notes: z.string().max(10_000).optional(),
});

export function contactError(error: { code?: string }) {
  if (error.code === "42501") return "You do not have permission to change that contact.";
  if (error.code === "PGRST301") return "Your session expired. Sign in again.";
  return "PourAgenda could not save that contact. Check your connection and try again.";
}

export function escapePostgrestSearch(value: string) {
  return value.replace(/[%_,()]/g, " ").trim().replace(/\s+/g, " ");
}
