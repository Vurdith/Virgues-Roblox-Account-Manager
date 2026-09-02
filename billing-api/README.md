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
