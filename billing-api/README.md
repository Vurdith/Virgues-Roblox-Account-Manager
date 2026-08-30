# Virgue billing API

This is the server-side boundary for Stripe. It creates Stripe Checkout and
Customer Portal sessions, verifies Stripe webhooks, writes subscription state
to Neon, and returns resolved entitlements to the website and desktop app.

## Setup

1. Run database migrations `001` through `003` in Neon.
2. Create a recurring **Virgue Pro** Stripe Price ($10/month base price) and
   put its ID in `STRIPE_PRO_PRICE_ID`.
3. Configure Stripe's customer portal to allow payment-method updates and
   cancellation. Configure regional/adaptive pricing in Stripe rather than
   trusting a value from the client.
4. Register `https://your-billing-api.example.com/webhooks/stripe` in Stripe.
   Subscribe to `checkout.session.completed`, `customer.subscription.*`,
   `invoice.paid`, and `invoice.payment_failed`.
5. Copy `.env.example` to `.env`, supply every secret, and host this service on
   a public HTTPS origin. Point `VITE_VIRGUE_BILLING_API_URL` and
   `VIRGUE_BILLING_API_URL` at it.

The API expects a Better Auth session token in `Authorization: Bearer …` and
re-verifies it with Neon Auth on every user-facing billing request. Stripe keys,
database URLs, and webhook secrets must never be placed in the website or
Electron renderer.

## Vercel

The repository includes `api/[...route].mjs`, so the billing handler can run as
Vercel's Node function alongside the static website. Set the server-only
variables from `.env.example` in the Vercel project, then use the same Vercel
origin for `VITE_VIRGUE_BILLING_API_URL` with an `/api` suffix if you want to
override the website's same-origin default. The Stripe webhook URL becomes
`https://<your-site>/api/webhooks/stripe`.
