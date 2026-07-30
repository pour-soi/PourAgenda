# Self-hosting on Supabase and Cloudflare Workers

PourAgenda is source-code-only, self-hosted software. There is no official hosted service, shared Worker, shared Supabase project, or public demo. Every deployment belongs to and consumes quota from the deployer’s own accounts.

The supported Cloudflare target is **Workers with the OpenNext adapter**, not a static Pages project, because PourAgenda uses authenticated server-side rendering.

## 1. Fork or clone the source

```bash
git clone https://github.com/pour-soi/PourAgenda.git
cd PourAgenda
```

Do not copy another operator’s `.env.local`, Wrangler state, database dump, authentication state, or build output.

## 2. Install the supported toolchain

Install Node.js 20.9 or newer and pnpm 11:

```bash
corepack enable
pnpm install --frozen-lockfile
node --version
pnpm --version
```

OpenNext builds are most reliable on Linux. Windows users may use WSL or Linux CI if native symlink creation fails; elevation or system-wide security changes should not be necessary.

## 3. Create your Supabase project

Create a project in your own Supabase account. In the examples below:

- `YOUR_SUPABASE_PROJECT` means your project reference;
- `YOUR_DOMAIN` means your eventual HTTPS deployment host;
- no value from another deployment should be reused.

Record the project URL and publishable key from Supabase Project Settings. The publishable key may be labelled anon key in older projects.

## 4. Apply migrations in order

Use the Supabase SQL editor or your own linked Supabase CLI environment to apply every file under `supabase/migrations` in filename order.

If using the CLI, first confirm the linked target is yours:

```bash
pnpm dlx supabase@latest login
pnpm dlx supabase@latest link --project-ref YOUR_SUPABASE_PROJECT
pnpm dlx supabase@latest db push
```

Never link this checkout to a project you do not own. Review SQL before applying it and back up an existing database first.

The migrations define tables, constraints, policies, functions, grants, and a trigger that initializes rows for a newly created Auth user. They do not ship a real account, appointment, category export, or production data dump.

## 5. Configure authentication

In Supabase Authentication:

1. Enable email/password authentication.
2. For local development, allow:
   - `http://localhost:3000/auth/confirm?next=/settings`
   - `http://localhost:3000/auth/callback?next=/reset-password`
3. After deployment, add:
   - `https://YOUR_DOMAIN/auth/confirm?next=/settings`
   - `https://YOUR_DOMAIN/auth/callback?next=/reset-password`
4. Configure an email provider and templates suitable for your deployment.
5. Decide whether public signup is appropriate. Disable it for a private or personal instance.

PourAgenda does not include a default account. The operator creates and manages all Auth users.

## 6. Verify Row Level Security

RLS is mandatory. Before adding real data:

- confirm RLS is enabled on every user-owned table;
- confirm policies compare `auth.uid()` with the owner’s `user_id`;
- confirm the `anon` role has no private-table privileges;
- confirm anonymous SELECT, INSERT, UPDATE, and DELETE attempts are rejected;
- run the read-only audits under `supabase/verification`.

Optional live isolation scripts require disposable accounts in your own project. Store their credentials only in ignored `.env.rls-test`, run the applicable `pnpm test:rls:*` scripts, then remove the users, records, shares, and credential file.

## 7. Create local environment configuration

Copy the placeholder file:

```bash
cp .env.example .env.local
```

Set values from your own project:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_SUPABASE_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Both values are browser-visible by design and safe only when RLS is correct. Never place a service-role key, database password, access token, refresh token, or Supabase CLI token in a `NEXT_PUBLIC_` variable.

## 8. Run locally

```bash
pnpm dev
```

Open `http://localhost:3000`, create a disposable local test account if signup is enabled, and verify login and callback URLs before using real data.

The environment variable `POURAGENDA_LAYOUT_PREVIEW` is reserved for local synthetic visual tests. Do not set it in production.

## 9. Run the production checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm preview
pnpm scan:credentials
```

`pnpm preview` builds with OpenNext and runs the Worker in Cloudflare’s local `workerd` runtime. Resolve every failing required check before deployment.

## 10. Authenticate Wrangler

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
```

Complete browser authorization yourself and verify that Wrangler selected your intended Cloudflare account. Wrangler credentials are local state; never commit them.

## 11. Choose a unique Worker name

Copy the public template to an ignored local configuration:

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

Then replace the placeholder in `wrangler.jsonc`:

```jsonc
"name": "YOUR_WORKER_NAME"
```

Cloudflare Worker names must satisfy Cloudflare’s naming rules; use a unique lowercase equivalent in the actual file. Do not reuse another operator’s Worker, route, domain, or account identifier.

`preview_urls` defaults to `false` in this repository. Keep it disabled if version preview aliases are not needed.

## 12. Deploy to your Cloudflare account

```bash
pnpm deploy
```

The command builds the OpenNext bundle and deploys it to the Worker named in your local `wrangler.jsonc`. Deployment consumes your Cloudflare quota. No shared quota or Worker is provided.

The current application requires only the static-assets binding. If future changes require server secrets, store them with Cloudflare secret storage, for example `wrangler secret put`, rather than in Git, `wrangler.jsonc`, or `.dev.vars`.

## 13. Complete post-deployment verification

Using `https://YOUR_DOMAIN`, verify:

- manifest, icons, service worker registration, installability, and offline fallback;
- login, logout, email confirmation, and password recovery;
- appointment create, edit, delete, recurrence, reminders, categories, and time-zone settings;
- month, week, day, agenda, desktop, tablet, and mobile layouts;
- security headers, `robots.txt`, and `noindex` behavior;
- anonymous users cannot read or write private tables;
- public share expiry, revocation, and minimal disclosure;
- test accounts, records, share tokens, browser auth state, and credentials are removed.

## 14. Private-instance option

For a personal deployment:

1. create the intended account;
2. disable public and anonymous signup in Supabase;
3. confirm only expected Auth users remain;
4. remove all test users and public share records;
5. keep the login surface unindexed;
6. consider an additional access-control layer if the login page itself must not be internet-visible.

## Rollback and ownership

Use your Worker’s deployment history to roll back application code. Database migrations are independent and must not be reversed with destructive SQL without a reviewed backup and rollback plan.

The operator owns all infrastructure, data, backups, quotas, email delivery, legal notices, and incident response for their deployment. The PourAgenda maintainers cannot access or recover independently hosted data.

Record the result for your environment with [SELF_HOSTING_CHECKLIST.md](SELF_HOSTING_CHECKLIST.md).
