create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table public.push_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  appointment_id uuid not null,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  slot_key text not null,
  occurrence_start timestamptz not null,
  scheduled_at timestamptz not null,
  status text not null check (status in ('claimed', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint push_delivery_appointment_owner foreign key (appointment_id, user_id)
    references public.appointments(id, user_id) on delete cascade,
  unique (subscription_id, slot_key)
);

create index push_subscriptions_owner_idx on public.push_subscriptions (user_id) where disabled_at is null;
create index push_reminder_delivery_due_idx on public.push_reminder_deliveries (scheduled_at, status);
create trigger push_subscriptions_updated before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;
alter table public.push_reminder_deliveries enable row level security;
create policy push_subscriptions_owner on public.push_subscriptions for all
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy push_deliveries_owner_read on public.push_reminder_deliveries for select
using ((select auth.uid()) = user_id);

revoke all on public.push_subscriptions from anon;
revoke all on public.push_reminder_deliveries from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.push_reminder_deliveries to authenticated;

comment on table public.push_subscriptions is 'Owner-scoped Web Push endpoints and browser public encryption keys.';
comment on table public.push_reminder_deliveries is 'Server-owned idempotency ledger for automatic Personal Appointment pushes.';
