# Supabase setup and safety

Every PourAgenda operator creates, owns, and controls an independent Supabase project. No shared database, Auth tenant, project reference, account, or calendar data is provided.

## Browser configuration

The application reads:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Supabase publishable keys—and legacy anon keys used in that role—are browser-visible by design. They identify a project but do not bypass Row Level Security.

Never expose any of the following through a `NEXT_PUBLIC_` variable, browser bundle, screenshot, log, fixture, or committed file:

- service-role or secret keys;
- database passwords or connection strings;
- access or refresh tokens;
- Supabase CLI credentials;
- Auth exports or database dumps.

PourAgenda does not require a service-role key or database password at application runtime.

## Apply the schema

1. Create a new project in your Supabase account.
2. Review all files in `supabase/migrations`.
3. Apply them in filename order using SQL Editor or your own linked CLI.
4. Run the read-only verification SQL under `supabase/verification`.

The migrations create tables, ownership constraints, indexes, triggers, functions, grants, and RLS policies. They do not insert an Auth account, appointment, contact, share, or existing operator’s data.

The initial schema defines `bootstrap_user()`. It runs only after a new Auth user is created and initializes that user’s profile, settings, and six generic starter categories. Applying the migration itself does not create those rows.

## Authentication

Enable email/password authentication and configure an email provider suitable for your deployment.

Add these local callback URLs:

- `http://localhost:3000/auth/confirm?next=/settings`
- `http://localhost:3000/auth/callback?next=/reset-password`

After deployment, add callbacks for your own host:

- `https://YOUR_DOMAIN/auth/confirm?next=/settings`
- `https://YOUR_DOMAIN/auth/callback?next=/reset-password`

Set the Supabase Site URL to your own deployed origin. Do not copy another operator’s callback or Worker URL.

Public signup is an operator decision:

- enable it only if the deployment is intended to accept new users;
- disable public and anonymous signup for a personal/private instance;
- verify the remaining Auth user list after test cleanup.

## RLS is mandatory

Before storing real data, verify:

- RLS is enabled on `profiles`, `user_settings`, `categories`, `contacts`, `appointments`, `appointment_shares`, and `appointment_activity`;
- owner policies require `auth.uid() = user_id` for reads and writes;
- ownership foreign keys prevent cross-user category, contact, appointment, series, share, and activity links;
- `authenticated` has only the required grants;
- `anon` has no private-table grants;
- anonymous SELECT, INSERT, UPDATE, and DELETE attempts are rejected;
- an invalid, expired, or revoked public share token returns no appointment.

The public share resolver is a narrow, token-scoped exception. It returns a fixed minimal projection and must not expose private notes, account email, or contact details.

## Verification tools

Read-only schema checks:

- `supabase/verification/phase1_schema_audit.sql`
- `supabase/verification/READ_ONLY_PHASE1_AUDIT_COMBINED.sql`
- `supabase/verification/READ_ONLY_PHASE1_LEAST_PRIVILEGE_AUDIT.sql`
- `supabase/verification/READ_ONLY_PHASE4_AUDIT.sql`

Live scripts such as `pnpm test:rls:*`, `pnpm test:security:sharing`, and `pnpm test:account-deletion` intentionally mutate test data. Some require two or three confirmed Auth users, and account-deletion verification is destructive by design.

Run live scripts only against a disposable test project or disposable users that you own:

1. place credentials in ignored `.env.rls-test`;
2. run only the needed verifier;
3. inspect its cleanup result;
4. remove appointments, recurrence rows, categories, contacts, shares, and settings created by the test;
5. delete disposable Auth users;
6. delete `.env.rls-test`;
7. confirm user and share counts again.

Never run destructive verifiers against a personal production account.

## Deployment checklist

- [ ] The project reference belongs to the deployer.
- [ ] Only the project URL and publishable key enter the browser build.
- [ ] No service-role key, password, token, dump, or Auth state is present.
- [ ] RLS and least-privilege audits pass.
- [ ] Anonymous reads and writes to every private table are blocked.
- [ ] Signup mode and callback URLs are intentional.
- [ ] No disposable account or share token remains.
