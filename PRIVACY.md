# Privacy

PourAgenda is self-hosted software. Each operator supplies and controls their own Supabase project, Cloudflare account, authentication configuration, and deployment. The maintainers do not provide a hosted service and do not receive calendar data from independent deployments.

The public repository contains no author production database or personal calendar data. The author's private deployment is separate from the source release and is not a public demo or shared backend.

PourAgenda stores account details, settings, categories, contacts, and appointment information for scheduling. Data is stored in the operator's configured Supabase project and is private by default under Row Level Security.

Public sharing is opt-in and should expose only title/date/time plus separately allowed location or public notes. Private notes, contact details, and account email must never appear in shared responses or metadata. Revocation and expiration must take effect immediately.

Users can export their owned data. CSV neutralizes spreadsheet formulas and ICS excludes private notes. Permanent deletion requires password confirmation and recent authentication, runs server-side against the signed-in identity, and revokes public links through cascade deletion.

The deployed `/privacy` page publishes the application policy. Operators are responsible for adding any deployment-specific privacy or contact information required in their jurisdiction without committing personal credentials or private data.
