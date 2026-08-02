# PourAgenda

PourAgenda is a privacy-focused appointment and schedule manager built as a responsive Next.js progressive web app.

> **No public hosted demo is provided. This repository is for self-hosting with your own Supabase and deployment account.**
>
> **Each deployment uses the deployer’s own Cloudflare and Supabase accounts. The maintainers do not host or access user calendar data.**

PourAgenda is distributed as source code. The repository contains source code, generic database migrations, tests, and deployment instructions. It does not include or provide access to the author's private deployment, Worker, Supabase project, user account, or calendar data.

## Features

- Month, week, day, and agenda calendar views
- Dedicated mobile week and day layouts with iPhone safe-area support
- Appointment creation, editing, deletion, recurrence, reminders, search, and bounded lists
- Category-only organization, category colors, and atomic category Move & Delete
- Timed appointments and timezone-stable date-only all-day appointments
- Quick Add, saved default duration, and 12-hour, 24-hour, or system time formats
- Conflict checks, stale-edit protection, drag, and resize on supported desktop views
- CSV, JSON, and iCalendar export
- Automatic or manual IANA time-zone preferences
- Email/password authentication, password recovery, account export, and account deletion
- Installable PWA with a deliberately limited offline shell
- PostgreSQL Row Level Security for all user-owned tables

## Screenshots

All screenshots use synthetic fixture data. They contain no production accounts, URLs, appointments, or database responses.

| Mobile month | Mobile week |
| --- | --- |
| ![Synthetic mobile month view](docs/images/pouragenda-mobile.png) | ![Synthetic mobile week view](docs/images/pouragenda-mobile-week.png) |

![Synthetic desktop calendar view](docs/images/pouragenda-desktop.png)

## Technology

- Next.js 16 and React 19
- TypeScript and Tailwind CSS 4
- FullCalendar 6
- Supabase Auth and PostgreSQL
- OpenNext for Cloudflare Workers
- Vitest and Playwright

## Privacy and hosting model

Every operator creates and controls their own infrastructure:

- a Supabase project containing that deployment’s Auth users and calendar data;
- a Cloudflare account and uniquely named Worker;
- authentication email, redirect, and signup settings;
- any deployment-specific privacy notice or support channel.

The browser-visible Supabase project URL and publishable key identify the operator’s project but are not secret credentials. RLS is the security boundary and is mandatory. A service-role key, database password, access token, refresh token, or Cloudflare credential must never be placed in browser code or committed.

The public repository contains no author production data. Database contents remain in each self-hoster's own Supabase project, and the author's private deployment is separate from this source repository. Never submit secrets, `.env` files, account identifiers, production logs, or personal calendar data in GitHub issues or pull requests.

See [PRIVACY.md](PRIVACY.md), [SECURITY.md](SECURITY.md), [SUPABASE_SETUP.md](SUPABASE_SETUP.md), and the [self-hosting checklist](SELF_HOSTING_CHECKLIST.md).

## Supported Deployment Targets

- ✅ **Cloudflare** (supported): use the OpenNext Worker workflow described in this repository.
- ⚠️ **Self-hosting** (supported): run your own Supabase project, own deployment account, and infrastructure.
- ❌ **Vercel** (currently unsupported): this repository is documented and verified around Cloudflare Workers with OpenNext; Vercel is not currently supported or validated.

## Requirements

- Node.js 20.9 or newer
- pnpm 11
- a Supabase project owned by the deployer
- a Cloudflare account owned by the deployer
- Wrangler browser authentication for deployment

## Local development

```bash
git clone https://github.com/pour-soi/PourAgenda.git
cd PourAgenda
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Edit `.env.local` with values from **your own** Supabase project:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_SUPABASE_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

The publishable key may be called the anon key in older Supabase projects. Use it only with verified RLS policies. Do not use a service-role key.

## Supabase setup

1. Create a new Supabase project.
2. Apply every file in `supabase/migrations` in filename order.
3. Run the read-only audits under `supabase/verification`.
4. Enable email/password authentication and configure localhost redirect URLs.
5. Decide whether public signup should be enabled. Disable it for a personal/private deployment.
6. Confirm anonymous reads and writes to private tables are rejected before adding real data.

Migrations create schema, policies, functions, and a new-user bootstrap trigger. They do not contain a real account, appointment, category export, or production data dump. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) and [DATABASE.md](DATABASE.md).

## Cloudflare deployment

Copy `wrangler.example.jsonc` to the ignored `wrangler.jsonc`, change its placeholder Worker name to a unique name owned by you, then follow [DEPLOYMENT.md](DEPLOYMENT.md):

```bash
cp wrangler.example.jsonc wrangler.jsonc
pnpm exec wrangler login
pnpm preview
pnpm deploy
```

Deployment uses your Cloudflare quota. No shared Worker, route, custom domain, or hosted PourAgenda service is supplied. Keep Wrangler credentials and `.dev.vars` out of Git.

## Environment variables

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-visible | URL of the deployer’s Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-visible | Publishable/legacy anon key protected by RLS |

PourAgenda does not require a service-role key or database password at runtime.

### Testing Environment Variables

These variables are intended only for local development and test workflows. Do not use them in production environments:

- `PLAYWRIGHT_BASE_URL`
- `POURAGENDA_LAYOUT_PREVIEW`
- `POURAGENDA_TEST_USER_A_EMAIL`
- `POURAGENDA_TEST_USER_A_PASSWORD`
- `POURAGENDA_TEST_USER_B_EMAIL`
- `POURAGENDA_TEST_USER_B_PASSWORD`
- `POURAGENDA_DELETION_TEST_EMAIL`
- `POURAGENDA_DELETION_TEST_PASSWORD`

They are read by Playwright or temporary verification scripts and should be omitted from production releases and public docs.

## Testing

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm preview
pnpm scan:credentials
```

Authenticated Playwright and live RLS suites require disposable accounts created in the tester’s own Supabase project. Their ignored credentials belong in `.env.rls-test`; delete those users, test records, and the file after verification.

## PWA installation

- Chrome or Edge: open the deployed HTTPS site and choose **Install app**.
- iPhone or iPad: open the site in Safari, choose **Share**, then **Add to Home Screen**.

The service worker caches only the offline page, manifest, icons, and immutable static assets. Offline mutations and reliable closed-app/background reminders are not implemented.

## Known limitations

- Supabase Realtime synchronization is not enabled; another device sees changes after refresh.
- Reliable background reminders are not provided when the app is closed.
- Multiple weekdays in one weekly recurrence rule and “this and following” series splitting are not implemented.
- Import and external calendar synchronization are not implemented.
- Operators are responsible for backups, email deliverability, quotas, legal notices, and incident response for their deployment.

## Contributing and security

Contributions are welcome under [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report vulnerabilities privately through [GitHub Security Advisories](SECURITY.md); do not post sensitive reports in a public issue.

## License

PourAgenda’s original source and project artwork are licensed under the [MIT License](LICENSE). Third-party software, fonts, icons, and trademarks remain under their respective terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
