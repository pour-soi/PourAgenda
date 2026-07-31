# Supabase setup and safety

Every PourAgenda operator creates, owns, and controls an independent Supabase project. No shared database, Auth tenant, project reference, account, or calendar data is provided.

## Browser configuration

The application reads:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Supabase publishable keys and legacy anon keys used in that role are browser-visible by design. They identify a project but do not bypass Row Level Security.

Never expose any of the following through a `NEXT_PUBLIC_` variable, browser bundle, screenshot, log, fixture, or committed file:

- service-role or secret keys
- database passwords or connection strings
- access or refresh tokens
- Supabase CLI credentials
- Auth exports or database dumps

PourAgenda does not require a service-role key or database password at application runtime.

## Dashboard-first setup (first-time Supabase users)

If you have not used Supabase before, follow these steps exactly once your account is active.

### 1) Create a new project

1. Open the Supabase dashboard and click **New project**.
2. Select your organization.
3. Enter a project name and strong database password.
4. Select region and pricing plan.
5. Click **Create new project** and wait for initialization.
6. Open **Project settings → General** and note the **Project reference** for your records.

### 2) Locate the Project URL

1. Open **Project settings → API**.
2. Find **Project URL** (example: `https://YOUR_PROJECT_REF.supabase.co`).
3. Copy it and map it to:

```
NEXT_PUBLIC_SUPABASE_URL
```

### 3) Locate the Publishable (Anon) Key

1. In **Project settings → API**, find the key labeled **anon public** (sometimes shown as Publishable key).
2. Copy it and map it to:

```
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

### 4) Configure Site URL

1. Open **Authentication → URL Configuration**.
2. Set **Site URL**:
   - `http://localhost:3000` for local development
   - `https://YOUR_DOMAIN` for production

### 5) Configure Redirect URLs

1. In the same **URL Configuration** section, add:
   - `http://localhost:3000/auth/confirm?next=/settings`
   - `http://localhost:3000/auth/callback?next=/reset-password`
2. After deployment, replace `localhost` with your deployed domain and keep the same path/query:
   - `https://YOUR_DOMAIN/auth/confirm?next=/settings`
   - `https://YOUR_DOMAIN/auth/callback?next=/reset-password`

### 6) Enable Email/Password authentication

1. Open **Authentication → Providers**.
2. Enable **Email**.
3. Configure email delivery in **Authentication → Email Templates** for your deployment.
4. Set signup intent:
   - enable if your deployment is public
   - disable public signup for a private/personal instance

## Apply the schema

1. Open each SQL file in `supabase/migrations` in filename order.
2. Apply each migration in order in either:
   - Supabase SQL Editor, or
   - your linked Supabase CLI workflow.
3. Confirm each migration runs successfully before applying the next.
4. Run the read-only verification SQL under `supabase/verification`.

### Recommended SQL Editor flow

1. Open **Database → SQL Editor** in your project.
2. Paste one migration file’s SQL.
3. Click **Run** and wait for completion.
4. Repeat for each file in filename order:
   - `202607270001_initial_schema.sql`
   - `202607280001_phase1_api_grants.sql`
   - `202607280002_phase1_least_privilege_grants.sql`
   - `202607280003_phase4_security_functions.sql`
   - `202607290001_category_only_timezone.sql`
   - `202607310001_phase4_move_category_atomic.sql`

The migrations create tables, ownership constraints, indexes, triggers, functions, grants, and RLS policies. They do not insert an Auth account, appointment, contact, share, or operator data.

The bootstrap function is `bootstrap_user()`. It runs only after a new Auth user is created and initializes profile, settings, and six starter categories. Applying the migration itself does not create any user rows.

## Authentication

Enable email/password authentication and configure an email provider suitable for your deployment.

Set these local callback URLs:

- `http://localhost:3000/auth/confirm?next=/settings`
- `http://localhost:3000/auth/callback?next=/reset-password`

After deployment, add callback URLs for your own host:

- `https://YOUR_DOMAIN/auth/confirm?next=/settings`
- `https://YOUR_DOMAIN/auth/callback?next=/reset-password`

Set the Supabase Site URL to your deployed origin. Do not copy another operator’s callback or Worker URL.

Public signup is an operator decision:

- enable it only if the deployment accepts new users
- disable public and anonymous signup for a private or personal instance
- verify the Auth user list after test cleanup

## RLS is mandatory

Before storing real data:

- RLS is enabled on `profiles`, `user_settings`, `categories`, `contacts`, `appointments`, `appointment_shares`, and `appointment_activity`.
- owner policies compare `auth.uid()` with `user_id` for reads and writes.
- ownership foreign keys prevent cross-user category, contact, appointment, series, share, and activity links.
- `authenticated` has only required grants.
- `anon` has no private-table grants.
- anonymous SELECT, INSERT, UPDATE, and DELETE attempts are rejected.
- invalid, expired, or revoked public share token returns no appointment.

The public share resolver is intentionally narrow and token-scoped. It returns only minimal public projections and does not expose private notes, account email, or contact details.

## Verification tools

Read-only schema checks:

- `supabase/verification/phase1_schema_audit.sql`
- `supabase/verification/READ_ONLY_PHASE1_AUDIT_COMBINED.sql`
- `supabase/verification/READ_ONLY_PHASE1_LEAST_PRIVILEGE_AUDIT.sql`
- `supabase/verification/READ_ONLY_PHASE4_AUDIT.sql`

Live scripts such as `pnpm test:rls:*`, `pnpm test:security:sharing`, and `pnpm test:account-deletion` intentionally mutate test data. Some require two or three confirmed Auth users, and account-deletion verification is destructive by design.

Run live scripts only against a disposable test project or disposable users that you own:

1. place credentials in ignored `.env.rls-test`.
2. run only the needed verifier.
3. inspect its cleanup result.
4. remove appointments, recurrence rows, categories, contacts, shares, and settings created by the test.
5. delete disposable Auth users.
6. delete `.env.rls-test`.

Never run destructive verifiers against a personal production account.

## Deployment checklist

- [ ] The project reference belongs to the deployer and its reference is `YOUR_SUPABASE_PROJECT`.
- [ ] Only the project URL and publishable key enter the browser build.
- [ ] No service-role key, password, token, dump, or Auth state is present.
- [ ] RLS and least-privilege audits pass.
- [ ] Anonymous reads and writes to every private table are blocked.
- [ ] Signup mode and callback URLs are intentional.
- [ ] No disposable account, token, or temporary credential remains.
