create or replace function public.move_category_appointments_and_delete(
  source_category_id uuid,
  replacement_category_id uuid
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  locked_count integer;
begin
  if owner_id is null then raise exception 'authentication required'; end if;
  if source_category_id = replacement_category_id then
    raise exception 'replacement must be different from source category';
  end if;

  with locked_categories as (
    select id
    from public.categories
    where id IN (source_category_id, replacement_category_id)
      and user_id = owner_id
    order by id
    for update
  )
  select count(*)
    into locked_count
    from locked_categories;

  if locked_count <> 2 then
    raise exception 'source and replacement categories must both exist and belong to current user';
  end if;

  update public.appointments
    set category_id = replacement_category_id
    where user_id = owner_id and category_id = source_category_id;

  delete from public.categories
    where id = source_category_id and user_id = owner_id;
  if not found then
    raise exception 'category delete failed';
  end if;
end;
$$;

revoke all on function public.move_category_appointments_and_delete(uuid, uuid) from public, anon;
grant execute on function public.move_category_appointments_and_delete(uuid, uuid) to authenticated;
