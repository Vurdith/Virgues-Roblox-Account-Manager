# Virgue billing API

This is the server-side boundary for Stripe. It creates Stripe Checkout and
Customer Portal sessions, verifies Stripe webhooks, writes subscription state
to Neon, and returns resolved entitlements to the website and desktop app.

## Setup

1. Run database migrations `001` through `004` in Neon.
2. Create a recurring **Virgue Pro** multi-currency Stripe Price with a
   $10/month USD default and fixed £10/month GBP and €10/month EUR options.
   Put its ID in `STRIPE_PRO_PRICE_ID`.
3. Configure Stripe's customer portal to allow payment-method updates and
   cancellation. Checkout passes the multi-currency Price without selecting a
   currency; Stripe chooses the matching configured regional option and falls
   back to USD where no regional option is available. The client never chooses
   the amount or currency.
4. Register `https://your-billing-api.example.com/webhooks/stripe` in Stripe.
   Subscribe to `checkout.session.completed`, `customer.subscription.*`,
   `invoice.paid`, and `invoice.payment_failed`.
5. Copy `.env.example` to `.env`, supply every secret, and host this service on
   a public HTTPS origin. Point `VITE_VIRGUE_BILLING_API_URL` and
   `VIRGUE_BILLING_API_URL` at it.

The website and desktop app request a short-lived Neon Auth JWT from the
`/token` endpoint and send it as `Authorization: Bearer …`. The API verifies
that JWT locally against Neon Auth's JWKS endpoint, so billing requests do not
depend on forwarding a session-cookie token to Neon Auth. Stripe keys, database
URLs, and webhook secrets must never be placed in the website or Electron
renderer.

## Vercel

The repository includes `api/[...route].mjs`, so the billing handler can run as
Vercel's Node function alongside the static website. Set the server-only
variables from `.env.example` in the Vercel project, then use the same Vercel
origin for `VITE_VIRGUE_BILLING_API_URL` with an `/api` suffix if you want to
override the website's same-origin default. The Stripe webhook URL becomes
`https://<your-site>/api/webhooks/stripe`.

## Admin dashboard

Run migrations `005_admin_dashboard.sql`, `006_custom_trial_duration.sql`, and
`007_repeatable_trial_grants.sql` after migrations `001` through `004`.
Migration `005` creates `virgue_admins`,
seeds the first owner by resolving
`reeceleneveu@gmail.com` in Neon Auth, and adds the operator and note fields to
manual trial grants. Migration `006` adds the custom trial amount and unit
fields. Migration `007` enables repeat grants and preserves trial history. If
that account did not exist when migration `005` ran,
create the account first and rerun the seed insert from migration `005`.

The owner-only website surface is `/admin.html`. The account dropdown reveals
its Admin link only after `GET /api/admin/me` succeeds. The dashboard uses:

- `GET /api/admin/customers?q=...` to search account email addresses and names.
- `POST /api/admin/trials` to grant a complimentary Pro trial with a custom
  amount and unit (`minute`, `hour`, `day`, or `week`). Trials must be at least
  one minute and no longer than 90 days, with an optional internal note. A
  customer can receive multiple grants; a new grant is scheduled after any
  existing active or scheduled grant. The legacy `{ days }` request field
  remains supported for older clients.

Admin authorization is checked server-side against the Neon Auth user ID in
`virgue_admins`; an email shown in the browser is never sufficient. A manual
trial changes the resolved entitlement until its expiry, but does not create a
Stripe subscription or charge the customer. Keep the database URL, Stripe
secrets, and Neon Auth signing configuration server-side.
