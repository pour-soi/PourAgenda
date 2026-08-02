# Self-hosting release checklist

Complete this checklist for each independent deployment. Nothing here certifies another operator’s Worker, Supabase project, accounts, data, or security posture.

## Source and local verification

- [ ] The source came from the intended commit on `main`.
- [ ] `pnpm install --frozen-lockfile` succeeds in a clean clone.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- [ ] Relevant Playwright suites pass at desktop, tablet, and mobile sizes.
- [ ] OpenNext builds and runs in local `workerd` through `pnpm preview`.
- [ ] `.env.local`, `.env.rls-test`, `.dev.vars`, Wrangler state, browser auth state, database dumps, and test output are untracked.
- [ ] Source and generated bundles contain no service-role key, password, token, personal fixture, or another deployment’s identifiers.
- [ ] The generated OpenNext environment contains the intended production Supabase URL and publishable key, with no localhost or `127.0.0.1` fallback.
- [ ] Only source archives will be released; `.next`, `.open-next`, Worker bundles, logs, traces, dumps, and environment files will not be uploaded.

## Supabase

- [ ] The linked project belongs to the deployer and its reference is `YOUR_SUPABASE_PROJECT`.
- [ ] Migrations were reviewed and applied in filename order.
- [ ] RLS is enabled on all user-owned tables and owner policies are present.
- [ ] The `anon` role cannot SELECT, INSERT, UPDATE, or DELETE private rows.
- [ ] The token-scoped public share resolver is the only intentional anonymous data path.
- [ ] Invalid, expired, and revoked share tokens reveal no appointment data.
- [ ] The browser uses only the project URL and publishable/legacy anon key.
- [ ] No service-role key or database password appears in browser or Worker output.
- [ ] Email provider, Site URL, and confirmation/reset callbacks use `YOUR_DOMAIN`.
- [ ] Public and anonymous signup settings were deliberately chosen.
- [ ] Disposable test users, records, share tokens, and credential files were removed.

## Cloudflare

- [ ] `wrangler.example.jsonc` was copied to ignored `wrangler.jsonc`.
- [ ] `YOUR_WORKER_NAME` was replaced with a unique Worker owned by the deployer.
- [ ] `wrangler whoami` shows the intended Cloudflare account.
- [ ] No credential, account identifier, or `.dev.vars` file is committed.
- [ ] Preview URLs are disabled if they are not required.
- [ ] Deployment uses only resources the operator intends to create and pay for.
- [ ] No unrelated Worker, Pages project, route, domain, or binding is modified.

## Post-deployment

- [ ] `https://YOUR_DOMAIN` is reachable and redirects unauthenticated users to login.
- [ ] Login, logout, confirmation, recovery, and the intended signup mode work.
- [ ] Appointment create, edit, delete, recurrence, reminders, category colors, and time zones work.
- [ ] Month, week, day, agenda, responsive layouts, and rotation work.
- [ ] Manifest, icons, service worker registration, PWA installation, and offline shell work.
- [ ] Security headers and `robots.txt` match the operator’s privacy model.
- [ ] Anonymous private-table reads and writes remain blocked after deployment.
- [ ] Data counts or backups confirm that deployment did not alter existing records unexpectedly.

Stop if a required item fails, a target account is ambiguous, or a secret or personal record appears in source or build output.
