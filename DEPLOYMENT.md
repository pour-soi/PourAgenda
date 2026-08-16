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

OpenNext builds require Linux-compatible symlink behavior. The maintained production workflow runs OpenNext on a GitHub-hosted Linux runner, so Windows development does not require WSL, local Linux, elevation, or system-wide security changes.

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

Production builds must receive the operator's own Supabase URL and publishable key at build time. Do not deploy an OpenNext bundle built with localhost, `127.0.0.1`, placeholder values, or another operator's project. Before deployment, inspect `.open-next/cloudflare/next-env.mjs` without printing the full key and confirm that it contains the intended project URL and publishable key and no local-development endpoint.

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

The maintained production workflow is manual and approval-gated:

1. Develop and run the required verification locally on Windows.
2. Obtain owner approval for the exact verified change set.
3. Commit and push the approved changes to `main`.
4. In GitHub, open **Actions**, select **Deploy Production**, and choose **Run workflow**.
5. Enter the full 40-character SHA currently at `origin/main`.
6. Review the deployment output, Worker version ID, and route smoke checks.

Pushing alone does not deploy production. The workflow is triggered only by `workflow_dispatch`, verifies that the selected SHA exactly matches current `origin/main`, and uses the GitHub Environment named `production`.

Configure these values as secrets on the `production` GitHub Environment:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_WORKER_NAME
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
PRODUCTION_URL
```

Use a Cloudflare API token restricted to deploying Workers in the intended account. The Supabase values must be the browser-safe project URL and publishable key; never configure a secret key, service-role key, JWT secret, or database password.

The GitHub-hosted runner installs the locked dependencies, runs the credential scan, generates ignored `wrangler.jsonc` from `wrangler.example.jsonc`, executes the existing `pnpm deploy` command, and checks `/`, `/login`, `/manifest.webmanifest`, and `/sw.js`. The temporary Wrangler file and build output are discarded with the runner. No WSL or local Linux checkout is required.

For an independent self-hosted deployment outside this repository's maintained workflow, `pnpm deploy` remains the underlying command. It builds the OpenNext bundle and deploys to the Worker named in the operator's ignored local `wrangler.jsonc`.

Never commit `wrangler.jsonc`, `.env.local`, `.open-next`, `.next`, Wrangler state, or deployment logs. Release source only; do not upload a Worker bundle or other build output as a GitHub Release asset.

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

## Troubleshooting

### Callback URL mismatch

Symptoms:

- After clicking confirm/reset links, users see callback errors.
- Email links open unexpected pages or refuse to continue.

Likely cause:

- Supabase callback URL settings do not exactly match your deployed origin and path.
- Extra trailing slash, wrong protocol, or missing `next=` query parameter.

Solution:

- Open **Authentication → URL Configuration** in Supabase.
- Ensure both callback URLs are exactly:
  - `https://YOUR_DOMAIN/auth/confirm?next=/settings`
  - `https://YOUR_DOMAIN/auth/callback?next=/reset-password`
- For local testing, also keep:
  - `http://localhost:3000/auth/confirm?next=/settings`
  - `http://localhost:3000/auth/callback?next=/reset-password`
- Save, then retry a full sign-up/login confirmation flow.

### Login redirect issues

Symptoms:

- Login appears to succeed but returns to an empty page or 404.
- Password reset flow appears to complete but does not return to app.

Likely cause:

- Wrong **Site URL** (production domain mismatch), outdated redirect target, or cookie/domain mismatch.

Solution:

- In Supabase **Authentication → URL Configuration**, set **Site URL** to:
  - `http://localhost:3000` locally, or
  - `https://YOUR_DOMAIN` in production.
- Confirm callback URLs use the same origin as Site URL.
- Confirm DNS and Cloudflare routes point to the same deployed Worker for that domain.

### Missing environment variables

Symptoms:

- Startup errors about missing `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Blank login screen or repeated redirect loops.

Likely cause:

- `.env.local` missing, not loaded, or containing old values.

Solution:

- Copy `.env.example` to `.env.local` and set both variables.
- Confirm they match your Supabase dashboard values exactly.
- Restart `pnpm dev` (or rebuild before deployment).
- Do not use production values from another deployment.

### Migration failures

Symptoms:

- `db push` fails, SQL editor returns syntax/permission errors, or next migration cannot run.

Likely cause:

- Migrations not applied in filename order.
- Missing privileges in the target project.
- Running an older migration against unexpected schema state.

Solution:

- Apply migrations strictly in filename order from `supabase/migrations`.
- Verify database is owned by you and clean from prior partial attempts when safe.
- Re-run failed migration after correcting prerequisite errors.
- Use read-only verification SQL to confirm expected tables, roles, and policy state before adding real data.

### Build failures

Symptoms:

- `pnpm build`, `pnpm preview`, or `pnpm deploy` exits with module, route, or compile errors.

Likely cause:

- Missing dependencies or stale `.open-next` build artifacts.
- Environment not loaded for local preview.
- Windows symlink constraints in local toolchain.

Solution:

- Run `pnpm install --frozen-lockfile`.
- Re-run `pnpm lint`, `pnpm typecheck`, then `pnpm build`.
- Use the manual **Deploy Production** GitHub Actions workflow so OpenNext runs on a GitHub-hosted Linux runner; local WSL is not required.

### Cloudflare deployment failures

Symptoms:

- Wrangler login/auth errors.
- Permission denied on deploy.
- Worker deploy succeeds but URL returns stale app or old assets.

Likely cause:

- Wrong Cloudflare account, duplicate Worker name, or stale `wrangler.jsonc`.
- Missing `wrangler.jsonc` from `wrangler.example.jsonc`.
- Missing authentication with Wrangler for target account.

Solution:

- Run `pnpm exec wrangler login` and confirm the expected account with `pnpm exec wrangler whoami`.
- Ensure `wrangler.jsonc` is based on `wrangler.example.jsonc` and `name` is unique.
- Confirm `preview_urls` and routes are exactly what your deployment requires.
- Rebuild after deploy and clear stale browser cache before verifying production URL.

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
