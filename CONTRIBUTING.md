# Contributing

Thank you for helping improve PourAgenda. Contributions should preserve its source-code-only, self-hosted model.

## Before opening a change

1. Search existing issues and pull requests.
2. Keep the change focused on one problem.
3. Do not include infrastructure, accounts, credentials, production URLs, personal data, or copied database responses.
4. Use synthetic names, events, categories, time zones, screenshots, and fixtures.
5. Discuss schema or security-boundary changes before implementing them.

## Development setup

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Use only a Supabase project and Cloudflare account that you own. Copy `wrangler.example.jsonc` to the ignored `wrangler.jsonc` before running OpenNext preview or deployment commands.

## Required checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm scan:credentials
```

Run relevant Playwright tests for user-visible changes. Live RLS, sharing, and account-deletion scripts mutate data and must use disposable users in a disposable test project—never a personal or production database.

## Database changes

- Add a new ordered migration; do not rewrite a migration that may already have been applied.
- Review destructive SQL explicitly and include a rollback or restoration procedure.
- Keep RLS enabled and least-privilege grants intact.
- Do not seed real users, accounts, appointments, categories, contacts, settings, or share tokens.
- Add a read-only verification query when a security property changes.

## Screenshots and fixtures

Screenshots must come from the guarded synthetic layout fixture or an equivalent privacy-safe source. Remove metadata and confirm that no email, production URL, account identifier, real appointment, location, or private API response is visible.

## Pull requests

Describe:

- the user-visible outcome;
- security or privacy effects;
- files and migrations changed;
- checks run and their results;
- any manual or platform-specific verification still required.

By contributing, you agree that your contribution is licensed under the repository’s MIT License. Third-party material must retain its own license and attribution.
