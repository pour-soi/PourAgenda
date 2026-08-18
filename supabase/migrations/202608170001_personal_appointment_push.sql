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
  status text not null check (status in ('claimed', 'retryable', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  next_attempt_at timestamptz,
  last_attempt_at timestamptz,
  last_error_class text check (last_error_class in ('transient', 'subscription_gone', 'provider_rejected')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint push_delivery_appointment_owner foreign key (appointment_id, user_id)
    references public.appointments(id, user_id) on delete cascade,
  unique (subscription_id, slot_key)
);

create index push_subscriptions_owner_idx on public.push_subscriptions (user_id) where disabled_at is null;
create index push_reminder_delivery_due_idx on public.push_reminder_deliveries (scheduled_at, status);
create index push_reminder_retry_due_idx on public.push_reminder_deliveries (next_attempt_at)
where status = 'retryable';
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

create function public.claim_push_reminder_delivery(
  p_user_id uuid,
  p_appointment_id uuid,
  p_subscription_id uuid,
  p_slot_key text,
  p_occurrence_start timestamptz,
  p_scheduled_at timestamptz,
  p_now timestamptz
) returns table (delivery_id uuid, delivery_attempt_count integer)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
    insert into public.push_reminder_deliveries (
      user_id, appointment_id, subscription_id, slot_key, occurrence_start,
      scheduled_at, status, attempt_count, last_attempt_at
    )
    select p_user_id, p_appointment_id, p_subscription_id, p_slot_key, p_occurrence_start,
      p_scheduled_at, 'claimed', 1, p_now
    where p_scheduled_at <= p_now
      and p_scheduled_at > p_now - interval '15 minutes'
    on conflict (subscription_id, slot_key) do nothing
    returning push_reminder_deliveries.id, push_reminder_deliveries.attempt_count;
  if found then return; end if;

  return query
    update public.push_reminder_deliveries as delivery
    set status = 'claimed',
      attempt_count = delivery.attempt_count + 1,
      last_attempt_at = p_now,
      next_attempt_at = null,
      last_error_class = null
    where delivery.subscription_id = p_subscription_id
      and delivery.slot_key = p_slot_key
      and delivery.status = 'retryable'
      and delivery.attempt_count < 3
      and delivery.next_attempt_at <= p_now
      and delivery.next_attempt_at > p_now - interval '15 minutes'
    returning delivery.id, delivery.attempt_count;
end;
$$;

revoke all on function public.claim_push_reminder_delivery(uuid, uuid, uuid, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_push_reminder_delivery(uuid, uuid, uuid, text, timestamptz, timestamptz, timestamptz) to service_role;

comment on table public.push_subscriptions is 'Owner-scoped Web Push endpoints and browser public encryption keys.';
comment on table public.push_reminder_deliveries is 'Server-owned idempotency ledger for automatic Personal Appointment pushes.';
