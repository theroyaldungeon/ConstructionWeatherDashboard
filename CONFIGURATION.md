# FieldCast integration configuration

The app runs with demo data until its external services are connected.

## Clerk

Set `VITE_CLERK_PUBLISHABLE_KEY` and enable email/password plus Google in the
Clerk dashboard. Company HR should assign `publicMetadata.role` to `worker` or
`supervisor`. The UI intentionally defaults unknown roles to `worker`.

## Supabase

Supabase is connected. The current Edge Function persists each authenticated
user's report and alert state after verifying a Clerk session token. It is
bound to the selected Clerk issuer
`https://skilled-python-9590.clerk.accounts.dev`; an optional server-only
`CLERK_JWT_ISSUER` value can override this for a future Clerk application.
Redeploy the Edge Function from the Make settings page after server changes.

The next production schema should add evidence Storage, teams, schedules,
ratings, push subscriptions, and immutable audit events. Apply row-level
security using the Clerk user ID and HR-assigned role. Do not treat client-side
role checks as security.

## NOAA

`src/services/weather.ts` uses the public Weather.gov API with temporary Shark
Valley coordinates `25.76,-80.77` and a local fallback. A production server
proxy should send an identifiable `NOAA_USER_AGENT` containing an operations
contact address and cache responses according to NOAA guidance.

## Gemini

Store `GEMINI_API_KEY` as a server-only Supabase Edge Function secret. Never use
a `VITE_` prefix for it. Gemini output must be validated against deterministic
safety rules and retained for audit. Current escalation windows are:

Set `GEMINI_MODEL` to `gemini-3.8-flash`. The integration uses this current
Flash model for structured analysis while keeping the model name configurable
for future deprecations.

- Evacuate: 2 minutes
- Pause work: 5 minutes
- Beware: 15 minutes

## Web Push

Store VAPID keys server-side and use the included service worker to display
push messages. iOS lock-screen delivery requires installation to the Home
Screen and notification permission. Android and desktop support depends on the
browser and device policy.
