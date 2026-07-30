# Architecture

- `src/app`: routes, metadata, PWA manifest, offline page.
- `src/components`: responsive UI and calendar integration.
- `src/lib`: deterministic validation, conflict, concurrency, `.ics`, and Supabase boundaries.
- `src/types`: stable domain contracts.
- `supabase/migrations`: schema, constraints, indexes, triggers, and RLS.
- `tests/e2e`: user-visible responsive checks.

Security-critical writes should use authenticated server actions or route handlers and repeat authorization checks even though RLS is the final database boundary. Calendar queries must request only the visible date range plus a bounded buffer.

## Phase 2 appointment flow

The protected home route loads user settings and categories on the server. The browser appointment workspace queries only the FullCalendar visible range plus a seven-day buffer, with RLS as the ownership boundary. Create and edit validation is deterministic; writes include the authenticated user ID and category ownership is enforced by the composite foreign key.

Edits, status changes, drag, resize, archive, restore, and permanent deletion compare the last `updated_at` value so a stale client cannot silently overwrite a newer row. Conflict checks query overlapping non-cancelled rows immediately before a time-changing write and require an explicit override. Cross-device changes appear after refresh; Realtime is intentionally not claimed or enabled.

Long lists are separate from calendar range queries. Upcoming, Today, This week, Completed, Cancelled, and Archived use bounded keyset pages with a stable timestamp-and-ID order. Filter changes reset the cursor. Archive and cancel provide a short Undo window; a failed Undo reloads current server state.

## Phase 3 recurrence flow

A recurring parent remains one `appointments` row. Generated occurrences exist only in memory and use the deterministic identity `series-id:original-UTC-start`. A modified or cancelled occurrence is another appointment row referencing `series_id` and `original_occurrence_start`; the database uniqueness constraint prevents duplicate exceptions.

Calendar expansion is limited to its visible range plus seven days. Long-list and search expansion use a one-year past/future window where relevant, and never-ending conflict checks use a documented one-year future horizon. Every expansion has a 500-result output limit and a 100,000-iteration guard. Exceptions replace their normal occurrence; cancellations remove it.

## Phase 4 security boundaries

Contacts and exports use the authenticated browser client under RLS. Anonymous sharing can call only a fixed-projection resolver that hashes the public token. Account deletion uses `auth.uid()` and a five-minute authentication-age check and never accepts a client user ID. Export reads are bounded to 500 rows per request.

Weekly rules repeat on the parent start weekday. Multiple weekdays and “this and following” splitting are not represented by the current schema and are intentionally not shown. Drag and resize create a single-occurrence exception. Parent and exception mutations both compare `updated_at`.
