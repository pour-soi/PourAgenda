# Frequently Asked Questions

## Is there a public PourAgenda demo?

No. PourAgenda is a source-code-only release. Create your own Supabase project and deploy an independent instance using your own deployment account.

## Can I use my own Supabase project?

Yes. PourAgenda is designed for independent self-hosting. Create your own Supabase project and set only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

in your local environment.

## Does this repository contain your data?

No. The repository contains only source code, generic migrations, scripts, synthetic fixtures, and documentation. It does not include the author's production backend, accounts, or private calendar records.

## Where do I get the Publishable (Anon) Key?

In the Supabase dashboard:

1. Open your project.
2. Go to **Project settings → API**.
3. Copy the value labeled **anon public** (publishable key).

Use that value for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Why is login not working?

Common causes:

- Wrong Supabase Site URL or callback URLs.
- Email authentication not enabled.
- Wrong values in `.env.local`.
- Browser using cached old deployment assets.

Check `SUPABASE_SETUP.md` and `DEPLOYMENT.md` troubleshooting guidance first.

## Why do migrations fail?

Most migration failures are caused by:

- applying migrations out of order,
- targeting the wrong project,
- or missing schema prerequisites from a partial earlier state.

Apply migrations in filename order and confirm each one succeeds before moving on.

## Why is my callback URL invalid?

Callback URLs must exactly match the URLs in Supabase Auth settings, including protocol and query string:

- `/auth/confirm?next=/settings`
- `/auth/callback?next=/reset-password`

Small mismatches (`http` vs `https`, missing path, or trailing slash changes) can break OAuth and email confirmation flows.

## Can I deploy without Cloudflare?

The repository currently documents and validates Cloudflare Workers with OpenNext. Other hosts are not currently covered in this guide.

## Can I use Docker?

This project does include local Supabase workflows for verification, but deployment itself is documented via Cloudflare Workers. Docker is not required for normal local development with `pnpm dev`; it is only needed where local Supabase CLI workflows require it.
