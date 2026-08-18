-- Grant only the table operations used by the scheduled Push dispatcher.
grant select on table public.appointments to service_role;
grant select on table public.categories to service_role;
grant select, update on table public.push_subscriptions to service_role;
grant select, update on table public.push_reminder_deliveries to service_role;
