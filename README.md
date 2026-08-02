# PourAgenda

**Privacy-first self-hosted calendar and appointment PWA.**

[![Release v1.0.0](https://img.shields.io/badge/release-v1.0.0-356859)](https://github.com/pour-soi/PourAgenda/releases/tag/v1.0.0)
[![MIT License](https://img.shields.io/badge/license-MIT-1f2937)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/explore/progressive-web-apps)
[![CI](https://github.com/pour-soi/PourAgenda/actions/workflows/ci.yml/badge.svg)](https://github.com/pour-soi/PourAgenda/actions/workflows/ci.yml)

## Preview

| Desktop Month View | Mobile Month View | Mobile Week View |
| --- | --- | --- |
| ![Synthetic desktop month view](docs/images/pouragenda-desktop.png) | ![Synthetic mobile month view](docs/images/pouragenda-mobile.png) | ![Synthetic mobile week view](docs/images/pouragenda-mobile-week.png) |

PourAgenda is a modern calendar for people who want complete ownership of their schedule. It combines focused appointment tools with responsive calendar views and infrastructure controlled by the self-hoster.

> **No public hosted service is provided. Create your own Supabase project and deploy your own PourAgenda instance.**

The preview uses synthetic fixture data and contains no production account, URL, appointment, or database response.

## Features

| Calendar | Appointments | Organization | Privacy |
| --- | --- | --- | --- |
| Month, week, day, and agenda views | Timed and all-day appointments | Categories and color coding | Supabase authentication |
| Responsive desktop and mobile layouts | Daily, weekly, and monthly recurrence | Atomic category Move & Delete | Row Level Security |
| Timezone-aware timed appointments | Quick Add and default duration | Search, lists, and filters | User-scoped data isolation |
| Timezone-stable all-day dates | 12-hour, 24-hour, and system time | CSV, JSON, and iCalendar export | Self-hosted installable PWA |

## Tech Stack

| Frontend | Backend | Deployment | Quality |
| --- | --- | --- | --- |
| Next.js 16 | Supabase Auth | Cloudflare Workers | Vitest |
| React 19 | PostgreSQL with RLS | OpenNext | Playwright |
| TypeScript | Repository migrations | Wrangler | Credential scanning |
| FullCalendar | User-scoped policies | Source-only deployment | GitHub Actions |

## Quick Start

1. Clone the repository.
2. Enable Corepack and install dependencies.
3. Create a Supabase project that you own.
4. Copy `.env.example` to `.env.local`.
5. Add your own Project URL and Publishable key.
6. Apply the repository migrations.
7. Run PourAgenda locally.
8. Follow [DEPLOYMENT.md](DEPLOYMENT.md) to deploy your own instance.

```bash
git clone https://github.com/pour-soi/PourAgenda.git
cd PourAgenda
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for project creation, environment configuration, migrations, Auth, and RLS verification.

## Documentation

| Area | Documentation |
| --- | --- |
| Getting Started | [Supabase Setup](SUPABASE_SETUP.md), [Self-Hosting Checklist](SELF_HOSTING_CHECKLIST.md), and [FAQ](FAQ.md) |
| Architecture | [Architecture](ARCHITECTURE.md) and [Database](DATABASE.md) |
| Deployment | [Cloudflare and Self-Hosting](DEPLOYMENT.md) |
| Security | [Security Policy](SECURITY.md) and [Privacy](PRIVACY.md) |
| Contributing | [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) |
| Release Notes | [v1.0.0 Release Notes](RELEASE_NOTES.md) and [Changelog](CHANGELOG.md) |

## Privacy

- No public hosted demo, owner backend, or owner database is provided.
- Every installation uses a Supabase project and deployment account controlled by its self-hoster.
- Environment files stay local; browser code must use only a Supabase Publishable key.
- RLS must remain enabled for user-owned data.
- Never submit API keys, `.env` files, personal calendar data, production logs, or private screenshots in public Issues or pull requests.

Read [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md), and [SELF_HOSTING_CHECKLIST.md](SELF_HOSTING_CHECKLIST.md) before entering real data.

## Deployment and project status

- **Cloudflare/OpenNext:** supported and documented.
- **Self-hosting with the documented stack:** supported.
- **Vercel:** not officially supported or validated.
- **Current stable release:** v1.0.0, distributed as source code only.
- **Weekly recurrence:** one weekday derived from the appointment Start field.

Known limitation: Next.js reports that the `middleware` file convention is deprecated in favor of `proxy`. Reliable closed-app background reminders, multiple weekdays in one weekly recurrence rule, external calendar synchronization, and import are not currently implemented.

## Community

- [Report a bug](https://github.com/pour-soi/PourAgenda/issues/new?template=bug_report.yml)
- [Request a feature](https://github.com/pour-soi/PourAgenda/issues/new?template=feature_request.yml)
- [Read the contributing guide](CONTRIBUTING.md)
- [Report a security issue privately](SECURITY.md)

## Development checks

```bash
pnpm run scan:credentials
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## License

PourAgenda's original source and project artwork are licensed under the [MIT License](LICENSE). Third-party software, fonts, icons, and trademarks remain under their respective terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

Made for people who value privacy, ownership, and self-hosting.
