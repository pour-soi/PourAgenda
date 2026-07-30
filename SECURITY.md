# Security policy

## Reporting a vulnerability

Use GitHub’s private vulnerability reporting flow:

<https://github.com/pour-soi/PourAgenda/security/advisories/new>

Do not open a public issue containing credentials, tokens, personal data, exploit details, or an affected deployment URL. A report should include the affected commit, impact, minimal reproduction, and any suggested mitigation without attaching production database exports or authentication state.

## Supported code

Security fixes target the current `main` branch. This repository provides source code, not a hosted service or managed infrastructure.

Each deployer is responsible for:

- their Supabase Auth, RLS, grants, backups, email, and user lifecycle;
- their Cloudflare account, Worker, routes, secrets, logs, and quota;
- applying migrations and source updates;
- incident response and any required user notification.

The maintainers cannot inspect, recover, disable, or patch independently hosted deployments.

## Baseline deployment requirements

- Never expose a service-role key, database password, access token, refresh token, or Cloudflare credential to browser code.
- Treat the Supabase publishable/legacy anon key as browser-visible and rely on verified RLS.
- Reject anonymous reads and writes to every private table.
- Remove test users, records, share tokens, environment files, and Playwright authentication state.
- Keep dependencies current and review migration SQL before applying it.
