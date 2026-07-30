create extension if not exists pgcrypto;

create type public.appointment_kind as enum ('work', 'personal');
create type public.appointment_status as enum ('pending', 'confirmed', 'completed', 'cancelled');
create type public.recurrence_frequency as enum ('daily', 'weekly', 'monthly');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'UTC',
  default_duration_minutes integer not null default 30 check (default_duration_minutes between 5 and 1440),
  week_starts_on smallint not null default 0 check (week_starts_on in (0, 1)),
  date_format text not null default 'locale',
  time_format text not null default 'locale' check (time_format in ('locale', '12h', '24h')),
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  default_reminder_minutes integer[] not null default array[]::integer[],
  working_hours jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  phone text check (char_length(phone) <= 50),
  email text check (char_length(email) <= 320),
  organization text check (char_length(organization) <= 180),
  notes text check (char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  contact_id uuid,
  title text not null check (char_length(title) between 1 and 180),
  kind public.appointment_kind not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  intended_local_start timestamp not null,
  intended_local_end timestamp not null,
  all_day boolean not null default false,
  location text check (char_length(location) <= 300),
  phone text check (char_length(phone) <= 50),
  email text check (char_length(email) <= 320),
  public_notes text check (char_length(public_notes) <= 20000),
  private_notes text check (char_length(private_notes) <= 20000),
  status public.appointment_status not null default 'pending',
  archived boolean not null default false,
  recurrence_frequency public.recurrence_frequency,
  recurrence_interval integer check (recurrence_interval between 1 and 52),
  recurrence_until date,
  recurrence_count integer check (recurrence_count between 1 and 1000),
  series_id uuid,
  original_occurrence_start timestamptz,
  reminder_minutes integer[] not null default array[]::integer[],
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_time_order check (ends_at > starts_at),
  constraint appointment_category_owner foreign key (category_id, user_id) references public.categories(id, user_id) on delete restrict,
  constraint appointment_contact_owner foreign key (contact_id, user_id) references public.contacts(id, user_id) on delete set null (contact_id),
  constraint appointment_series_owner foreign key (series_id, user_id) references public.appointments(id, user_id) on delete cascade,
  constraint recurrence_shape check (
    (recurrence_frequency is null and recurrence_interval is null and recurrence_until is null and recurrence_count is null)
    or (recurrence_frequency is not null and recurrence_interval is not null and not (recurrence_until is not null and recurrence_count is not null))
  ),
  unique (id, user_id),
  unique (series_id, original_occurrence_start)
);

create table public.appointment_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  appointment_id uuid not null,
  token_hash text not null unique,
  include_location boolean not null default false,
  include_public_notes boolean not null default false,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint share_appointment_owner foreign key (appointment_id, user_id) references public.appointments(id, user_id) on delete cascade
);

create table public.appointment_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  appointment_id uuid not null,
  action text not null check (action in ('created','time_changed','status_changed','completed','cancelled','archived','restored','share_created','share_revoked')),
  occurred_at timestamptz not null default now(),
  constraint activity_appointment_owner foreign key (appointment_id, user_id) references public.appointments(id, user_id) on delete cascade
);

create index appointments_calendar_range_idx on public.appointments (user_id, starts_at, ends_at) where status <> 'cancelled';
create index appointments_lists_idx on public.appointments (user_id, archived, status, starts_at);
create index appointments_category_idx on public.appointments (user_id, category_id, starts_at);
create index contacts_user_name_idx on public.contacts (user_id, lower(name));
create index activity_appointment_idx on public.appointment_activity (user_id, appointment_id, occurred_at desc);
create index shares_appointment_idx on public.appointment_shares (user_id, appointment_id);

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger settings_updated before update on public.user_settings for each row execute function public.set_updated_at();
create trigger categories_updated before update on public.categories for each row execute function public.set_updated_at();
create trigger contacts_updated before update on public.contacts for each row execute function public.set_updated_at();
create trigger appointments_updated before update on public.appointments for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.categories enable row level security;
alter table public.contacts enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_shares enable row level security;
alter table public.appointment_activity enable row level security;

create policy profiles_owner on public.profiles for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy settings_owner on public.user_settings for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy categories_owner on public.categories for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy contacts_owner on public.contacts for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy appointments_owner on public.appointments for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy shares_owner on public.appointment_shares for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy activity_owner on public.appointment_activity for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.appointment_shares from anon;
revoke all on public.appointments from anon;

create function public.bootstrap_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id) values (new.id);
  insert into public.user_settings(user_id, timezone) values (new.id, coalesce(new.raw_user_meta_data->>'timezone', 'UTC'));
  insert into public.categories(user_id, name, color) values
    (new.id, 'Work', '#4C7468'), (new.id, 'Client', '#52739A'), (new.id, 'Medical', '#A26068'),
    (new.id, 'Personal', '#846C91'), (new.id, 'Travel', '#9A7446'), (new.id, 'Other', '#667168');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.bootstrap_user();

comment on column public.appointment_shares.token_hash is 'SHA-256 hash only; raw random tokens are never stored.';
comment on column public.appointments.intended_local_start is 'Preserves wall-clock intent across timezone and DST changes.';
