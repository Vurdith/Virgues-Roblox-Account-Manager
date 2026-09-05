# Valdor database runbook

Status: completed 2026-09-05. The production billing schema uses the Valdor
table, view, index, and constraint names. The migration preserved all rows,
plan keys, identity objects, and privileges.

## Canonical schema

The public billing relations are:

```text
public.valdor_plans
public.valdor_billing_settings
public.valdor_trial_grants
public.valdor_subscriptions
public.valdor_billing_events
public.valdor_billing_customers
public.valdor_admins
public.valdor_current_entitlements
```

The production project is named `Valdor`, uses the `production` branch, and is
identified by project ID `withered-unit-16554687`.

## Verification

Use a direct, unpooled connection for schema work. Confirm the relation list,
index and constraint names, view definition, and row counts before changing
application consumers. The expected table counts in the accepted cutover were
2 plans, 4 subscriptions, 36 billing events, 4 billing customers, and 14
trial grants.

The application and billing API now read and write only the canonical Valdor
relations and `valdor_*` Stripe metadata keys.

## Migration policy

The numbered migration files are retained as an auditable record of the
schema's evolution. Do not reorder or rerun applied migrations against
production. New schema changes must use a new numbered migration, be tested on
an isolated branch first, and be applied with stop-on-error behavior.

Keep the isolated verification branch until the release evidence is accepted.
Branch deletion and snapshot cleanup are separate approved operations.
