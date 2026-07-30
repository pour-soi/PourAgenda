-- Read-only Phase 1 schema audit. This query does not change database state.
with expected_tables(name) as (
  values ('profiles'), ('user_settings'), ('categories'), ('contacts'),
         ('appointments'), ('appointment_shares'), ('appointment_activity')
),
critical_indexes(name) as (
  values ('appointments_calendar_range_idx'), ('appointments_lists_idx'),
         ('appointments_category_idx'), ('contacts_user_name_idx'),
         ('activity_appointment_idx'), ('shares_appointment_idx')
),
critical_constraints(name) as (
  values ('appointment_time_order'), ('appointment_category_owner'),
         ('appointment_contact_owner'), ('appointment_series_owner'),
         ('recurrence_shape'), ('share_appointment_owner'),
         ('activity_appointment_owner')
),
critical_triggers(name) as (
  values ('profiles_updated'), ('settings_updated'), ('categories_updated'),
         ('contacts_updated'), ('appointments_updated'), ('on_auth_user_created')
),
checks as (
  select 'tables'::text as check_name, 7 expected,
    (select count(*) from information_schema.tables t join expected_tables e on e.name = t.table_name where t.table_schema = 'public')::int actual
  union all
  select 'rls_enabled', 7,
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace join expected_tables e on e.name = c.relname where n.nspname = 'public' and c.relrowsecurity)::int
  union all
  select 'owner_policies', 7,
    (select count(*) from pg_policies p join expected_tables e on e.name = p.tablename where p.schemaname = 'public' and p.cmd = 'ALL')::int
  union all
  select 'critical_indexes', 6,
    (select count(*) from pg_indexes i join critical_indexes e on e.name = i.indexname where i.schemaname = 'public')::int
  union all
  select 'critical_constraints', 7,
    (select count(*) from pg_constraint c join critical_constraints e on e.name = c.conname)::int
  union all
  select 'critical_triggers', 6,
    (select count(*) from information_schema.triggers t join critical_triggers e on e.name = t.trigger_name)::int
  union all
  select 'authenticated_table_grants', 28,
    (select count(*) from information_schema.role_table_grants g join expected_tables e on e.name = g.table_name
      where g.table_schema = 'public' and g.grantee = 'authenticated'
        and g.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))::int
  union all
  select 'anonymous_table_grants', 0,
    (select count(*) from information_schema.role_table_grants g join expected_tables e on e.name = g.table_name
      where g.table_schema = 'public' and g.grantee = 'anon')::int
)
select check_name, expected, actual, expected = actual as passed
from checks
order by check_name;
