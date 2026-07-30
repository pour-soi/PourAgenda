# Database design

- `profiles`, `user_settings`: one row per auth user.
- `categories`, `contacts`: user-owned reference data.
- `appointments`: UTC instants plus IANA timezone and intended local wall-clock values; all-day is explicit.
- Recurrence is stored on the series row using frequency/interval/end metadata. Exception rows reference `series_id` and `original_occurrence_start`; unlimited occurrences are never materialized.
- `appointment_shares`: hashed random tokens, expiry, revocation, and minimal disclosure flags.
- `appointment_activity`: small user-readable action history without sensitive before/after payloads.

Indexes cover calendar ranges, status/archive lists, categories, contacts, sharing, and activity. `updated_at` triggers support optimistic concurrency checks.

Phase 2 uses the existing appointment schema without a new migration. `kind` is the Work/Personal classification. `archived` is independent from status, cancellation is never deletion, and completed/cancelled timestamps are recorded by their respective actions. Active calendar queries overlap a bounded visible range. Long lists and search results use bounded keyset pages ordered by their section timestamp and appointment ID; no fixed full-history browser download is used.

Phase 3 also requires no migration. A parent row has `recurrence_frequency`, `recurrence_interval`, and optional `recurrence_until`/`recurrence_count`. Exception rows have no recurrence rule and reference the parent through `(series_id, user_id)` plus a unique `original_occurrence_start`. Parent deletion cascades to exceptions; the owner foreign key, existing RLS policy, grants, and `updated_at` trigger apply equally to both.

Phase 4 migration `202607280003_phase4_security_functions.sql` adds share concurrency timestamps, lightweight activity actions, and narrowly granted functions for share creation/resolution and self-deletion. It does not recreate tables or rewrite user data.
