export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type AppointmentKind = "work" | "personal";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export interface Appointment {
  id: string;
  user_id: string;
  category_id: string;
  contact_id?: string | null;
  title: string;
  kind: AppointmentKind;
  starts_at: string;
  ends_at: string;
  intended_local_start?: string;
  intended_local_end?: string;
  timezone: string;
  all_day: boolean;
  location: string | null;
  phone: string | null;
  email: string | null;
  public_notes: string | null;
  private_notes: string | null;
  status: AppointmentStatus;
  reminder_minutes?: number[];
  recurrence_frequency?: RecurrenceFrequency | null;
  recurrence_interval?: number | null;
  recurrence_until?: string | null;
  recurrence_count?: number | null;
  series_id?: string | null;
  original_occurrence_start?: string | null;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

export interface Contact {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  organization: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentOccurrence extends Appointment {
  occurrence_id: string;
  series_parent_id: string | null;
  is_generated_occurrence: boolean;
}

export interface TimeConflict {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
}
