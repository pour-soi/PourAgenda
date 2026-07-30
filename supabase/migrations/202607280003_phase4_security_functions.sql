-- Phase 4 additive security functions. Does not rewrite user data.

alter table public.appointment_shares
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists appointment_shares_updated on public.appointment_shares;
create trigger appointment_shares_updated
  before update on public.appointment_shares
  for each row execute function public.set_updated_at();

alter table public.appointment_activity alter column appointment_id drop not null;
alter table public.appointment_activity drop constraint if exists appointment_activity_action_check;
alter table public.appointment_activity add constraint appointment_activity_action_check
  check (action in (
    'created','time_changed','status_changed','completed','cancelled','archived','restored',
    'share_created','share_revoked','contact_created','contact_updated','contact_deleted',
    'reminder_changed','export_requested','account_deletion_requested'
  ));

create or replace function public.create_appointment_share(
  target_appointment_id uuid,
  show_location boolean default false,
  show_public_notes boolean default false,
  expiry timestamptz default null
) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  raw_token text;
begin
  if owner_id is null then raise exception 'authentication required'; end if;
  if expiry is not null and expiry <= now() then raise exception 'expiration must be in the future'; end if;
  if not exists (
    select 1 from public.appointments
    where id = target_appointment_id and user_id = owner_id
  ) then raise exception 'appointment not found'; end if;
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.appointment_shares
    (user_id, appointment_id, token_hash, include_location, include_public_notes, expires_at)
  values
    (owner_id, target_appointment_id,
     encode(extensions.digest(raw_token, 'sha256'), 'hex'),
     show_location, show_public_notes, expiry);
  return raw_token;
end;
$$;

create or replace function public.resolve_public_appointment_share(raw_token text)
returns table (
  title text, starts_at timestamptz, ends_at timestamptz, timezone text,
  all_day boolean, location text, public_notes text,
  recurrence_frequency public.recurrence_frequency,
  recurrence_interval integer, recurrence_until date
)
language sql stable security definer
set search_path = ''
as $$
  select a.title, a.starts_at, a.ends_at, a.timezone, a.all_day,
    case when s.include_location then a.location else null end,
    case when s.include_public_notes then a.public_notes else null end,
    a.recurrence_frequency, a.recurrence_interval, a.recurrence_until
  from public.appointment_shares s
  join public.appointments a on a.id = s.appointment_id and a.user_id = s.user_id
  where s.token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex')
    and s.revoked_at is null
    and (s.expires_at is null or s.expires_at > now())
  limit 1;
$$;

create or replace function public.delete_own_account()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  issued_at bigint := coalesce((auth.jwt() ->> 'iat')::bigint, 0);
begin
  if owner_id is null then raise exception 'authentication required'; end if;
  if extract(epoch from now())::bigint - issued_at > 300 then
    raise exception 'recent authentication required';
  end if;
  delete from auth.users where id = owner_id;
  if not found then raise exception 'account deletion failed'; end if;
end;
$$;

revoke all on function public.create_appointment_share(uuid, boolean, boolean, timestamptz) from public, anon;
grant execute on function public.create_appointment_share(uuid, boolean, boolean, timestamptz) to authenticated;
revoke all on function public.resolve_public_appointment_share(text) from public;
grant execute on function public.resolve_public_appointment_share(text) to anon, authenticated;
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
