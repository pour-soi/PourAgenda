# Changelog

## Unreleased

### Added

### Changed

### Fixed

### Security

## 1.0.0 - 2026-08-01

### Added

- Added a private self-hosted appointment PWA with responsive month, week, day, and agenda views.
- Added Supabase email/password authentication, user-scoped data, categories, recurrence, reminders, Quick Add, and default appointment duration.
- Added atomic category Move & Delete with appointment reassignment.
- Added 12-hour, 24-hour, and Follow system time entry.
- Added PWA manifest, service worker, Cloudflare/OpenNext deployment support, and independent self-hosting documentation.

### Changed

- Simplified appointment organization to category-only workflows.
- Added an accessible recurring edit-scope dialog and natural recurrence summaries.
- Defined timed appointments as timezone-aware instants and all-day appointments as date-only calendar values.

### Fixed

- Preserved inclusive all-day date ranges across timezones, recurrence expansion, editing, and FullCalendar rendering.
- Hardened saved default-duration integration, Quick Add, category rename persistence, and login pending-state behavior.

### Security

- Enforced Row Level Security, user ownership checks, least-privilege grants, and atomic category reassignment.
- Documented source-only releases, independent infrastructure, browser-safe publishable keys, and prohibited secret-key usage.
