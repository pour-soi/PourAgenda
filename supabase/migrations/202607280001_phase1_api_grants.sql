-- Phase 1 Data API privileges. RLS policies remain the ownership boundary.
-- This migration is additive and safe to run after 202607270001_initial_schema.sql.

grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.user_settings,
  public.categories,
  public.contacts,
  public.appointments,
  public.appointment_shares,
  public.appointment_activity
to authenticated;

grant usage, select on sequence public.appointment_activity_id_seq to authenticated;

revoke all on table
  public.profiles,
  public.user_settings,
  public.categories,
  public.contacts,
  public.appointments,
  public.appointment_shares,
  public.appointment_activity
from anon;

revoke all on sequence public.appointment_activity_id_seq from anon;
