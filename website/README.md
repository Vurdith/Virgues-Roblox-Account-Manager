# Virgue website

This is the public website and account-center surface for Virgue's Roblox Account Manager. It is intentionally separate from the Electron renderer so the marketing, download, and subscription pages can be deployed independently.

## Local development

From the repository root:

```text
npm run website:dev
npm run website:build
npm run website:preview
```

The development server runs at `http://localhost:4173/`.

## Configuration

Copy `.env.example` to `.env` when connecting a real deployment:

- `VITE_NEON_AUTH_URL` — the public Neon Auth endpoint used by the desktop app. This is an Auth API URL, not a database credential. The current development endpoint is used as a fallback in the page; set this explicitly for production.
- `VITE_VIRGUE_BILLING_API_URL` — the URL of a server-side Virgue billing API. The website calls `/billing/me` and `/billing/portal` on this service.
- `VITE_VIRGUE_DOWNLOAD_URL` — the published Windows installer URL for the latest release.

The website must never contain a Neon database connection string, Stripe secret, or other server credential. The billing API is the boundary that validates the Neon session and talks to the payment provider.

For browser sign-in to work in production, add the deployed website origin (and `http://localhost:4173` during local testing) to the trusted origins/CORS configuration for the Neon Auth project.

The account center already uses the same Neon Auth contract as the desktop app. Billing and the installer link remain configuration-driven until the production API, payment provider, release channel, and domain are selected.
