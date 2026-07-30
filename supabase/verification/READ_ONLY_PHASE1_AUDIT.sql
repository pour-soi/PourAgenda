-- READ ONLY AUDIT: SAFE TO RUN

select
  'expected_tables' as audit_area,
  expected.table_name as object_name,
  case when actual.oid is null then false else true end as present
from (
  values
    ('profiles'),
    ('user_settings'),
    ('categories'),
    ('contacts'),
    ('appointments'),
    ('appointment_shares'),
    ('appointment_activity')
) as expected(table_name)
left join pg_namespace namespace on namespace.nspname = 'public'
left join pg_class actual
  on actual.relnamespace = namespace.oid
  and actual.relname = expected.table_name
  and actual.relkind = 'r'
order by expected.table_name;

select
  'indexes' as audit_area,
  table_class.relname as table_name,
  index_class.relname as index_name,
  index_data.indisprimary as is_primary,
  index_data.indisunique as is_unique,
  index_data.indisvalid as is_valid
from pg_index index_data
join pg_class table_class on table_class.oid = index_data.indrelid
join pg_class index_class on index_class.oid = index_data.indexrelid
join pg_namespace namespace on namespace.oid = table_class.relnamespace
where namespace.nspname = 'public'
  and table_class.relname in (
    'profiles', 'user_settings', 'categories', 'contacts',
    'appointments', 'appointment_shares', 'appointment_activity'
  )
order by table_class.relname, index_class.relname;

select
  'foreign_keys' as audit_area,
  source_table.relname as source_table,
  relation.conname as relationship_name,
  target_namespace.nspname as target_schema,
  target_table.relname as target_table,
  pg_get_constraintdef(relation.oid, true) as definition
from pg_constraint relation
join pg_class source_table on source_table.oid = relation.conrelid
join pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
join pg_class target_table on target_table.oid = relation.confrelid
join pg_namespace target_namespace on target_namespace.oid = target_table.relnamespace
where source_namespace.nspname = 'public'
  and relation.contype = 'f'
  and source_table.relname in (
    'profiles', 'user_settings', 'categories', 'contacts',
    'appointments', 'appointment_shares', 'appointment_activity'
  )
order by source_table.relname, relation.conname;

select
  'constraints' as audit_area,
  table_class.relname as table_name,
  relation.conname as constraint_name,
  case relation.contype
    when 'p' then 'primary_key'
    when 'u' then 'unique'
    when 'f' then 'foreign_key'
    when 'c' then 'check'
    when 'x' then 'exclusion'
    else relation.contype::text
  end as constraint_type,
  relation.convalidated as is_valid,
  pg_get_constraintdef(relation.oid, true) as definition
from pg_constraint relation
join pg_class table_class on table_class.oid = relation.conrelid
join pg_namespace namespace on namespace.oid = table_class.relnamespace
where namespace.nspname = 'public'
  and table_class.relname in (
    'profiles', 'user_settings', 'categories', 'contacts',
    'appointments', 'appointment_shares', 'appointment_activity'
  )
order by table_class.relname, constraint_type, relation.conname;

select
  'triggers' as audit_area,
  namespace.nspname as table_schema,
  table_class.relname as table_name,
  trigger_data.tgname as trigger_name,
  trigger_data.tgenabled as enabled_mode,
  pg_get_triggerdef(trigger_data.oid, true) as definition
from pg_trigger trigger_data
join pg_class table_class on table_class.oid = trigger_data.tgrelid
join pg_namespace namespace on namespace.oid = table_class.relnamespace
where not trigger_data.tgisinternal
  and (
    (namespace.nspname = 'public' and table_class.relname in (
      'profiles', 'user_settings', 'categories', 'contacts',
      'appointments', 'appointment_shares', 'appointment_activity'
    ))
    or (namespace.nspname = 'auth' and table_class.relname = 'users')
  )
order by namespace.nspname, table_class.relname, trigger_data.tgname;

select
  'privileges' as audit_area,
  table_class.relname as table_name,
  coalesce(role_data.rolname, 'public') as role_name,
  access_data.privilege_type
from pg_class table_class
join pg_namespace namespace on namespace.oid = table_class.relnamespace
cross join lateral aclexplode(
  coalesce(table_class.relacl, acldefault('r', table_class.relowner))
) as access_data(owner_oid, role_oid, privilege_type, may_delegate)
left join pg_roles role_data on role_data.oid = access_data.role_oid
where namespace.nspname = 'public'
  and table_class.relname in (
    'profiles', 'user_settings', 'categories', 'contacts',
    'appointments', 'appointment_shares', 'appointment_activity'
  )
order by table_class.relname, role_name, access_data.privilege_type;

select
  'rls_enabled_flags' as audit_area,
  table_class.relname as table_name,
  table_class.relrowsecurity as rls_enabled,
  table_class.relforcerowsecurity as rls_forced
from pg_class table_class
join pg_namespace namespace on namespace.oid = table_class.relnamespace
where namespace.nspname = 'public'
  and table_class.relkind = 'r'
  and table_class.relname in (
    'profiles', 'user_settings', 'categories', 'contacts',
    'appointments', 'appointment_shares', 'appointment_activity'
  )
order by table_class.relname;

select
  'rls_policies' as audit_area,
  table_class.relname as table_name,
  policy_data.polname as policy_name,
  policy_data.polpermissive as is_permissive,
  policy_data.polcmd as command_scope,
  array(
    select role_data.rolname
    from pg_roles role_data
    where role_data.oid = any(policy_data.polroles)
    order by role_data.rolname
  ) as policy_roles,
  pg_get_expr(policy_data.polqual, policy_data.polrelid) as row_expression,
  pg_get_expr(policy_data.polwithcheck, policy_data.polrelid) as check_expression
from pg_policy policy_data
join pg_class table_class on table_class.oid = policy_data.polrelid
join pg_namespace namespace on namespace.oid = table_class.relnamespace
where namespace.nspname = 'public'
  and table_class.relname in (
    'profiles', 'user_settings', 'categories', 'contacts',
    'appointments', 'appointment_shares', 'appointment_activity'
  )
order by table_class.relname, policy_data.polname;
