alter table public.categories
add column push_enabled boolean not null default false;

-- One-time bootstrap only. Runtime eligibility uses categories.push_enabled and
-- does not depend on this display name after the migration has run.
update public.categories
set push_enabled = true
where name = 'Personal Appointment';
