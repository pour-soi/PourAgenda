-- Phase 1 least-privilege correction for the seven private tables.
-- Existing tables, data, RLS settings, and RLS policies are unchanged.

begin;

revoke all privileges on table public.profiles from authenticated;
revoke all privileges on table public.user_settings from authenticated;
revoke all privileges on table public.categories from authenticated;
revoke all privileges on table public.contacts from authenticated;
revoke all privileges on table public.appointments from authenticated;
revoke all privileges on table public.appointment_shares from authenticated;
revoke all privileges on table public.appointment_activity from authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.user_settings to authenticated;
grant select, insert, update, delete on table public.categories to authenticated;
grant select, insert, update, delete on table public.contacts to authenticated;
grant select, insert, update, delete on table public.appointments to authenticated;
grant select, insert, update, delete on table public.appointment_shares to authenticated;
grant select, insert, update, delete on table public.appointment_activity to authenticated;

commit;
