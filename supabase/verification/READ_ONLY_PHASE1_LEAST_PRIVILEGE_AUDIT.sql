-- READ ONLY AUDIT: SAFE TO RUN

with expected_tables(table_name) as (
  values
    ('profiles'),
    ('user_settings'),
    ('categories'),
    ('contacts'),
    ('appointments'),
    ('appointment_shares'),
    ('appointment_activity')
),
expected_privileges(privilege_type) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
),
prohibited_privileges(privilege_type) as (
  values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
),
expected_authenticated as (
  select expected_tables.table_name, expected_privileges.privilege_type
  from expected_tables
  cross join expected_privileges
),
actual_authenticated as (
  select distinct grants.table_name, grants.privilege_type
  from information_schema.table_privileges as grants
  join expected_tables on expected_tables.table_name = grants.table_name
  where grants.table_schema = 'public'
    and grants.grantee = 'authenticated'
),
actual_anonymous as (
  select distinct grants.table_name, grants.privilege_type
  from information_schema.table_privileges as grants
  join expected_tables on expected_tables.table_name = grants.table_name
  where grants.table_schema = 'public'
    and grants.grantee = 'anon'
),
detail_rows as (
  select
    'authenticated privilege'::text as audit_area,
    'authenticated'::text as role_name,
    expected.table_name::text as table_name,
    expected.privilege_type::text as privilege_type,
    'present'::text as expected_state,
    case when actual.privilege_type is null then 'missing' else 'present' end::text as observed_state,
    (actual.privilege_type is not null)::boolean as passed
  from expected_authenticated as expected
  left join actual_authenticated as actual
    on actual.table_name = expected.table_name
    and actual.privilege_type = expected.privilege_type

  union all

  select
    'unexpected authenticated privilege',
    'authenticated',
    actual.table_name,
    actual.privilege_type,
    'absent',
    'present',
    false
  from actual_authenticated as actual
  left join expected_authenticated as expected
    on expected.table_name = actual.table_name
    and expected.privilege_type = actual.privilege_type
  where expected.privilege_type is null
),
table_summary_rows as (
  select
    'authenticated table total'::text as audit_area,
    'authenticated'::text as role_name,
    expected_tables.table_name::text as table_name,
    'SELECT, INSERT, UPDATE, DELETE'::text as privilege_type,
    '4'::text as expected_state,
    count(actual.privilege_type)::text as observed_state,
    (
      count(actual.privilege_type) = 4
      and not exists (
        select 1
        from expected_privileges
        where not exists (
          select 1
          from actual_authenticated as required
          where required.table_name = expected_tables.table_name
            and required.privilege_type = expected_privileges.privilege_type
        )
      )
    )::boolean as passed
  from expected_tables
  left join actual_authenticated as actual
    on actual.table_name = expected_tables.table_name
  group by expected_tables.table_name
),
prohibited_rows as (
  select
    'prohibited authenticated privilege'::text as audit_area,
    'authenticated'::text as role_name,
    'seven private tables'::text as table_name,
    prohibited.privilege_type::text as privilege_type,
    '0'::text as expected_state,
    count(actual.privilege_type)::text as observed_state,
    (count(actual.privilege_type) = 0)::boolean as passed
  from prohibited_privileges as prohibited
  left join actual_authenticated as actual
    on actual.privilege_type = prohibited.privilege_type
  group by prohibited.privilege_type
),
summary_rows as (
  select
    'authenticated total'::text as audit_area,
    'authenticated'::text as role_name,
    'seven private tables'::text as table_name,
    'all table privileges'::text as privilege_type,
    '28'::text as expected_state,
    count(*)::text as observed_state,
    (
      count(*) = 28
      and not exists (
        select 1
        from expected_authenticated as expected
        left join actual_authenticated as actual
          on actual.table_name = expected.table_name
          and actual.privilege_type = expected.privilege_type
        where actual.privilege_type is null
      )
    )::boolean as passed
  from actual_authenticated

  union all

  select
    'anonymous total',
    'anon',
    'seven private tables',
    'all table privileges',
    '0',
    count(*)::text,
    (count(*) = 0)
  from actual_anonymous
)
select *
from (
  select * from detail_rows
  union all
  select * from table_summary_rows
  union all
  select * from prohibited_rows
  union all
  select * from summary_rows
) as audit_rows
order by
  case audit_area
    when 'authenticated privilege' then 1
    when 'authenticated table total' then 2
    when 'unexpected authenticated privilege' then 3
    when 'prohibited authenticated privilege' then 4
    when 'authenticated total' then 5
    when 'anonymous total' then 6
  end,
  table_name,
  privilege_type;
