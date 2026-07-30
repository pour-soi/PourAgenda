-- READ ONLY AUDIT: SAFE TO RUN

select *
from (
  select
    'tables'::text as audit_area,
    expected.object_name::text as object_name,
    'public'::text as parent_object,
    'present'::text as expected_state,
    case when actual.oid is null then 'missing' else 'present' end::text as observed_state,
    (actual.oid is not null)::boolean as passed
  from (
    values
      ('profiles'), ('user_settings'), ('categories'), ('contacts'),
      ('appointments'), ('appointment_shares'), ('appointment_activity')
  ) as expected(object_name)
  left join pg_namespace namespace on namespace.nspname = 'public'
  left join pg_class actual
    on actual.relnamespace = namespace.oid
    and actual.relname = expected.object_name
    and actual.relkind = 'r'

  union all

  select
    'indexes',
    expected.object_name,
    expected.parent_object,
    'present and valid',
    case
      when index_class.oid is null then 'missing'
      when index_data.indisvalid then 'present and valid'
      else 'present but invalid'
    end,
    (index_class.oid is not null and index_data.indisvalid)
  from (
    values
      ('appointments_calendar_range_idx', 'appointments'),
      ('appointments_lists_idx', 'appointments'),
      ('appointments_category_idx', 'appointments'),
      ('contacts_user_name_idx', 'contacts'),
      ('activity_appointment_idx', 'appointment_activity'),
      ('shares_appointment_idx', 'appointment_shares')
  ) as expected(object_name, parent_object)
  left join pg_class index_class on index_class.relname = expected.object_name
  left join pg_namespace namespace
    on namespace.oid = index_class.relnamespace
    and namespace.nspname = 'public'
  left join pg_index index_data on index_data.indexrelid = index_class.oid

  union all

  select
    'foreign_keys',
    expected.object_name,
    expected.parent_object,
    expected.target_object,
    case when relation.oid is null then 'missing' else expected.target_object end,
    (relation.oid is not null)
  from (
    values
      ('profiles_user_id_fkey', 'profiles', 'auth.users'),
      ('user_settings_user_id_fkey', 'user_settings', 'auth.users'),
      ('categories_user_id_fkey', 'categories', 'auth.users'),
      ('contacts_user_id_fkey', 'contacts', 'auth.users'),
      ('appointments_user_id_fkey', 'appointments', 'auth.users'),
      ('appointment_category_owner', 'appointments', 'public.categories'),
      ('appointment_contact_owner', 'appointments', 'public.contacts'),
      ('appointment_series_owner', 'appointments', 'public.appointments'),
      ('appointment_shares_user_id_fkey', 'appointment_shares', 'auth.users'),
      ('share_appointment_owner', 'appointment_shares', 'public.appointments'),
      ('appointment_activity_user_id_fkey', 'appointment_activity', 'auth.users'),
      ('activity_appointment_owner', 'appointment_activity', 'public.appointments')
  ) as expected(object_name, parent_object, target_object)
  left join pg_constraint relation
    on relation.conname = expected.object_name
    and relation.contype = 'f'

  union all

  select
    'constraints',
    expected.object_name,
    expected.parent_object,
    expected.kind,
    case
      when relation.oid is null then 'missing'
      when relation.convalidated then expected.kind || ' valid'
      else expected.kind || ' invalid'
    end,
    (relation.oid is not null and relation.convalidated)
  from (
    values
      ('appointment_time_order', 'appointments', 'check'),
      ('appointment_category_owner', 'appointments', 'foreign key'),
      ('appointment_contact_owner', 'appointments', 'foreign key'),
      ('appointment_series_owner', 'appointments', 'foreign key'),
      ('recurrence_shape', 'appointments', 'check'),
      ('share_appointment_owner', 'appointment_shares', 'foreign key'),
      ('activity_appointment_owner', 'appointment_activity', 'foreign key')
  ) as expected(object_name, parent_object, kind)
  left join pg_constraint relation on relation.conname = expected.object_name

  union all

  select
    'triggers',
    expected.object_name,
    expected.parent_object,
    'one enabled trigger',
    case
      when count(trigger_data.oid) = 1 then 'one enabled trigger'
      else count(trigger_data.oid)::text || ' enabled triggers'
    end,
    (count(trigger_data.oid) = 1)
  from (
    values
      ('profile timestamp', 'public.profiles'),
      ('settings timestamp', 'public.user_settings'),
      ('category timestamp', 'public.categories'),
      ('contact timestamp', 'public.contacts'),
      ('appointment timestamp', 'public.appointments'),
      ('user bootstrap', 'auth.users')
  ) as expected(object_name, parent_object)
  left join pg_namespace namespace
    on namespace.nspname = split_part(expected.parent_object, '.', 1)
  left join pg_class table_class
    on table_class.relnamespace = namespace.oid
    and table_class.relname = split_part(expected.parent_object, '.', 2)
  left join pg_trigger trigger_data
    on trigger_data.tgrelid = table_class.oid
    and not trigger_data.tgisinternal
    and trigger_data.tgenabled <> 'D'
  group by expected.object_name, expected.parent_object

  union all

  select
    'privileges',
    expected.role_name,
    'seven private tables',
    expected.expected_count::text || ' permissions',
    count(access_data.privilege_type)::text || ' permissions',
    (count(access_data.privilege_type) = expected.expected_count)
  from (
    values ('authenticated', 28::bigint), ('anon', 0::bigint)
  ) as expected(role_name, expected_count)
  cross join (
    select table_class.oid, table_class.relacl, table_class.relowner
    from pg_class table_class
    join pg_namespace namespace on namespace.oid = table_class.relnamespace
    where namespace.nspname = 'public'
      and table_class.relname in (
        'profiles', 'user_settings', 'categories', 'contacts',
        'appointments', 'appointment_shares', 'appointment_activity'
      )
  ) as private_tables
  left join lateral aclexplode(
    coalesce(private_tables.relacl, acldefault('r', private_tables.relowner))
  ) as access_data(owner_oid, role_oid, privilege_type, may_delegate) on true
  left join pg_roles role_data on role_data.oid = access_data.role_oid
  where role_data.rolname = expected.role_name
    or (expected.role_name = 'anon' and role_data.rolname is null)
  group by expected.role_name, expected.expected_count

  union all

  select
    'rls_enabled',
    expected.object_name,
    'public',
    'enabled',
    case
      when table_class.oid is null then 'table missing'
      when table_class.relrowsecurity then 'enabled'
      else 'disabled'
    end,
    (table_class.oid is not null and table_class.relrowsecurity)
  from (
    values
      ('profiles'), ('user_settings'), ('categories'), ('contacts'),
      ('appointments'), ('appointment_shares'), ('appointment_activity')
  ) as expected(object_name)
  left join pg_namespace namespace on namespace.nspname = 'public'
  left join pg_class table_class
    on table_class.relnamespace = namespace.oid
    and table_class.relname = expected.object_name

  union all

  select
    'rls_policies',
    expected.object_name,
    expected.parent_object,
    'owner expressions for all commands',
    case
      when policy_data.oid is null then 'missing'
      when policy_data.polqual is null or policy_data.polwithcheck is null then 'incomplete expressions'
      when policy_data.polcmd <> '*' then 'partial command scope'
      when 0 = any(policy_data.polroles) then 'owner expressions, public role scope'
      else 'owner expressions, limited role scope'
    end,
    (
      policy_data.oid is not null
      and policy_data.polqual is not null
      and policy_data.polwithcheck is not null
      and policy_data.polcmd = '*'
    )
  from (
    values
      ('profiles_owner', 'profiles'),
      ('settings_owner', 'user_settings'),
      ('categories_owner', 'categories'),
      ('contacts_owner', 'contacts'),
      ('appointments_owner', 'appointments'),
      ('shares_owner', 'appointment_shares'),
      ('activity_owner', 'appointment_activity')
  ) as expected(object_name, parent_object)
  left join pg_policy policy_data on policy_data.polname = expected.object_name
) as audit_rows
order by audit_area, parent_object, object_name;
