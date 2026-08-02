# PourAgenda v1.0.0

## Overview

PourAgenda is a self-hosted personal calendar and appointment PWA.

This release publishes the source code only. No public hosted demo is provided. Users must deploy their own instance and connect it to their own Supabase project.

## Highlights

- Calendar views optimized for desktop and mobile
- Timed and all-day appointments
- Recurring appointments and an accessible edit-scope dialog
- Quick Add and saved default appointment duration
- Category management with atomic Move & Delete
- 12-hour, 24-hour, and Follow system time entry
- Timezone-aware timed appointments
- Date-only all-day appointments that do not shift across timezones
- Supabase Auth and Row Level Security
- Cloudflare/OpenNext deployment support

## Privacy and hosting

- No author production database or personal calendar data is included.
- The author's live deployment is not part of this release.
- Each user must create and control their own Supabase project.
- Each user must deploy their own application instance.
- Do not use or request access to the author's backend or deployment.

## Installation

See:

- [README.md](README.md)
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
- [DEPLOYMENT.md](DEPLOYMENT.md)
- [SELF_HOSTING_CHECKLIST.md](SELF_HOSTING_CHECKLIST.md)
- [SECURITY.md](SECURITY.md)

## Known limitations

- Weekly recurrence currently supports one weekday derived from Start.
- Vercel is not officially supported or validated.
- The Next.js middleware convention emits a deprecation warning.
- Physical-device coverage is more limited than automated browser coverage.
- No public hosted demo is provided.

## Security

- Environment files and production configuration are excluded from source control.
- Row Level Security must remain enabled.
- Browser configuration must use only a Supabase Publishable key.
- Never expose service-role or secret keys.

## Release artifacts

This is a source-code-only release. Use GitHub-generated source archives only. No compiled application, Worker bundle, database dump, environment file, deployment log, screenshot archive, or other manually uploaded build artifact is part of this release.
