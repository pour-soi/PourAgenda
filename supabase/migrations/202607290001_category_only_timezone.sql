-- Preserve legacy appointment classification, contact and status values for
-- compatibility while removing them from the current user workflow.
alter table public.user_settings
  add column if not exists automatic_timezone boolean not null default true;

comment on column public.user_settings.automatic_timezone is
  'When true, the browser-detected IANA zone replaces the saved display timezone.';
