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

Edits, status changes, drag, resize, cancellation, and permanent deletion compare the last `updated_at` value so a stale client cannot silently overwrite a newer row. Conflict checks query overlapping non-cancelled rows immediately before a time-changing write and require an explicit override. Cross-device changes appear after refresh; Realtime is intentionally not claimed or enabled.

Long lists are separate from calendar range queries. Upcoming, Today, This week, Completed, and Cancelled use bounded keyset pages with a stable timestamp-and-ID order. Filter changes reset the cursor. Cancellation provides a short Undo window; a failed Undo reloads current server state.

## Appointment date model

PourAgenda has two distinct date models. They must not be combined or converted through the same display path.

### Timed appointments are instants

Timed appointments represent a real moment. `starts_at` and `ends_at` are the canonical timezone-aware timestamps. The stored instant does not change when the viewer changes timezone; only its displayed wall time changes. For example, Aug 2 at 2:00 PM in San Francisco is the same instant as Aug 2 at 5:00 PM in New York.

Timed appointment editor values are converted between the selected timezone and the stored instant. Existing timezone and DST conversion logic applies only to this appointment type.

### All-day appointments are calendar dates

All-day appointments represent calendar dates, not instants. `intended_local_start` and `intended_local_end` are the canonical values. Their `YYYY-MM-DD` portions must be used directly by the editor, recurrence expansion, lists, search, and calendar integration. They must never be obtained by formatting `starts_at` or `ends_at` in UTC or in a user timezone.

The `starts_at` and `ends_at` columns remain populated for database constraints, overlap queries, and compatibility with the existing schema. For all-day rows they are boundary values only, not display values. A same-day Aug 2 appointment uses an Aug 2 start boundary and an Aug 3 exclusive end boundary, while both canonical intended dates remain Aug 2.

FullCalendar receives date-only strings for all-day events. Its end is exclusive, so an inclusive user range of Aug 2 through Aug 4 is rendered as `start: 2026-08-02` and `end: 2026-08-05`. This exclusive conversion exists only at the FullCalendar boundary. The appointment editor must continue showing Aug 4 as the End date.

These invariants apply in every timezone and across DST boundaries:

- Timed appointment: preserve the instant and convert the displayed wall time.
- All-day appointment: preserve the selected calendar dates and never apply a timezone offset.
- Recurring all-day appointment: generate new canonical intended dates for every occurrence.
- Missing all-day intended dates are invalid application data; do not silently reconstruct them from UTC timestamps.

## Phase 3 recurrence flow

A recurring parent remains one `appointments` row. Generated occurrences exist only in memory and use the deterministic identity `series-id:original-UTC-start`. A modified or cancelled occurrence is another appointment row referencing `series_id` and `original_occurrence_start`; the database uniqueness constraint prevents duplicate exceptions.

Calendar expansion is limited to its visible range plus seven days. Long-list and search expansion use a one-year past/future window where relevant, and never-ending conflict checks use a documented one-year future horizon. Every expansion has a 500-result output limit and a 100,000-iteration guard. Exceptions replace their normal occurrence; cancellations remove it.

## Phase 4 security boundaries

Contacts and exports use the authenticated browser client under RLS. Anonymous sharing can call only a fixed-projection resolver that hashes the public token. Account deletion uses `auth.uid()` and a five-minute authentication-age check and never accepts a client user ID. Export reads are bounded to 500 rows per request.

Weekly rules repeat on the parent start weekday. Multiple weekdays and “this and following” splitting are not represented by the current schema and are intentionally not shown. Drag and resize create a single-occurrence exception. Parent and exception mutations both compare `updated_at`.
