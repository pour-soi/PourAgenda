-- READ ONLY AUDIT: SAFE TO RUN
select 'column' as audit_area, table_name as object_name, column_name as detail
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'appointment_shares' and column_name = 'updated_at')
    or (table_name = 'appointment_activity' and column_name = 'appointment_id'))
union all
select 'function', routine_name, data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('create_appointment_share', 'resolve_public_appointment_share', 'delete_own_account')
union all
select 'rls', tablename, case when rowsecurity then 'enabled' else 'disabled' end
from pg_catalog.pg_tables
where schemaname = 'public'
  and tablename in ('contacts','appointment_shares','appointment_activity')
union all
select 'policy', tablename, policyname
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in ('contacts','appointment_shares','appointment_activity')
order by audit_area, object_name, detail;
