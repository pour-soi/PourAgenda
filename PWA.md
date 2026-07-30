# PWA behavior

The manifest enables standalone installation with 192px, 512px, and maskable PNG icons. Production requires HTTPS.

The service worker deliberately caches only the offline page, manifest, app icons, and immutable Next.js static assets. It never writes authenticated navigations, Supabase responses, public-share responses, or other application data to Cache Storage. Navigations use the network and fall back to `/offline` only when the request fails.

Mutating actions are not queued offline; the interface asks the user to reconnect and never claims that an offline write was synchronized.

Browser notification permission must only be requested after an intentional reminder action. Reliable closed-app/background delivery is not implemented, especially on iPhone, and the UI must say so.

Phase 4 schedules only bounded reminders for appointments loaded in the app. Duplicate identities are retained for the browser session, and cancelled or completed items are suppressed.
