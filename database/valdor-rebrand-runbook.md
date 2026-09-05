# Valdor Neon rebrand runbook

Status: **PAUSED pending explicit user confirmation.** No Neon project, branch,
snapshot, live SQL, or production state may be changed from this worktree.

Proposed Neon project display name: **Valdor**. Changing that display name is a
Neon Console/API metadata operation and is also paused; it is not part of the
SQL migration.

## Scope and prerequisites

Migration `008_valdor_rebrand.sql` renames the seven `public` billing tables and
the `public.valdor_current_entitlements` view from the `virgue_` prefix to the
`valdor_` prefix. It also renames every legacy-prefixed index and constraint
attached to those relations, including generated primary-key, foreign-key,
unique, and check names. It does not change data, stable `free`/`pro` plan keys,
Neon Auth objects, or privileges. `001` through `007` are historical and must
not be rewritten.

The forward migration is for a database that has already applied `001` through
`007`. On a new database, apply `001` through `007` in lexical order first,
then apply `008` once. The companion
`database/rollbacks/008_valdor_rebrand.sql` is an executable names-only rollback;
it must never be included in an automatic forward migration glob.

## Snapshot and review branch

All commands in this section are **PAUSED examples**. Use a direct, unpooled
connection for schema work; never put a `-pooler` hostname in the migration
connection string.

1. Confirm the target project and that `production` (or the actual live branch)
   is a root branch. Record the project ID, branch ID, database, role, and the
   current migration state.
2. Capture a named snapshot before any live DDL. With a current Neon CLI this
   is the shape of the command:

   ```powershell
   neon snapshots create --branch production --name valdor-pre-008
   ```

   If the CLI is unavailable, use the Neon Console/API snapshot workflow and
   record the returned snapshot ID. Wait for the snapshot operation to finish.
3. Create an isolated review branch from the live branch and obtain its own
   direct connection string:

   ```powershell
   neon branches create --name valdor-rebrand-review --parent production
   neon connection-string valdor-rebrand-review
   ```

   A review branch is safe for DDL because branch data and schema are isolated
   from the parent. Delete it only after review and only with confirmation.

Neon references: [branching workflow](https://neon.com/docs/get-started-with-neon/workflow-primer),
[snapshot versioning](https://neon.com/docs/ai/ai-database-versioning), and
[schema diff](https://neon.com/docs/guides/schema-diff).

## Validation queries

Run these read-only checks on the review branch before applying `008`, and
repeat the equivalent checks after it. Replace the relation list only with an
explicitly reviewed schema change.

Before `008`, the relation query should show the legacy names; after `008`, it
should show the Valdor names and the expected relation kinds (`r` = table,
`v` = view):

```sql
SELECT n.nspname, c.relname, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'virgue_plans', 'virgue_billing_settings', 'virgue_trial_grants',
    'virgue_subscriptions', 'virgue_billing_events',
    'virgue_billing_customers', 'virgue_admins',
    'virgue_current_entitlements',
    'valdor_plans', 'valdor_billing_settings', 'valdor_trial_grants',
    'valdor_subscriptions', 'valdor_billing_events',
    'valdor_billing_customers', 'valdor_admins',
    'valdor_current_entitlements'
  )
ORDER BY c.relname;
```

After the migration, these checks must return no rows for mapped public
objects, and the view definition must resolve through Valdor names:

```sql
SELECT n.nspname, c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'virgue\_%' ESCAPE '\';

SELECT n.nspname, c.conname, table_rel.relname AS table_name
FROM pg_constraint c
JOIN pg_class table_rel ON table_rel.oid = c.conrelid
JOIN pg_namespace n ON n.oid = table_rel.relnamespace
WHERE n.nspname = 'public' AND c.conname LIKE 'virgue\_%' ESCAPE '\';

SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public' AND indexname LIKE 'virgue\_%' ESCAPE '\'
ORDER BY indexname;

SELECT pg_get_viewdef('public.valdor_current_entitlements'::regclass, true);
```

Capture row counts for `plans`, `billing_settings`, `trial_grants`,
`subscriptions`, `billing_events`, `billing_customers`, and `admins` before
and after. Confirm the primary/foreign-key and unique/check constraint counts,
the view column shape, and a representative entitlement query. Any unexpected
extra `virgue_` or `valdor_` object is a manual-review stop, not a reason to
drop or overwrite an object.

## Exact apply order

1. Obtain explicit confirmation for the review/live operation. Freeze unrelated
   DDL and prepare the Valdor-named application/billing consumers; do not run a
   mixed old-consumer/new-schema window.
2. On a fresh review database only, apply `001` → `002` → `003` → `004` →
   `005` → `006` → `007`. On an existing review branch that already contains
   the live schema, validate that those migrations are present and apply only
   `008`.
3. Apply `database/migrations/008_valdor_rebrand.sql` with a direct connection
   and stop-on-error behavior, for example:

   ```powershell
   psql "$env:DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f database/migrations/008_valdor_rebrand.sql
   ```

4. Inside `008`, the guarded order is: prerequisite/collision checks; relation
   renames; constraint renames; index renames; final no-legacy-name and
   expected-relation validation.
5. Run all post-migration validation queries and application smoke tests on the
   review branch. Review schema diff and the consumer SQL before promotion.
6. For production, take a fresh `valdor-pre-008-live` snapshot immediately
   before the maintenance window, pause/drain billing requests and webhook
   processing, apply `008` exactly once to the live branch, run validation, then
   deploy/restart the Valdor-named consumers and re-enable traffic.
7. Keep the live pre-migration snapshot and review evidence until the release is
   accepted. Snapshot restore, branch deletion, and the Neon project display
   name change remain separately confirmed operations.

## Rollback

If the rebrand is not approved before applying `008`, do not run it; discard
the isolated review branch only after confirmation. If `008` has already run:

1. Pause/drain consumers that reference `valdor_*`, preserve the pre-008
   snapshot, and run the collision/validation checks.
2. Apply `database/rollbacks/008_valdor_rebrand.sql` over a direct connection.
   It renames Valdor relations back to Virgue, then restores constraints and
   indexes. It does not alter rows or plan keys and aborts on ambiguous names.
3. Re-run the legacy-name checks, compare row counts and view columns, then
   restore the old consumer build before resuming traffic. Review webhook and
   billing events for the paused interval.
4. If metadata is inconsistent or the names-only rollback cannot complete,
   stop. Restoring `valdor-pre-008-live` is a destructive/live Neon operation
   and requires separate explicit confirmation; verify the restored branch and
   connection only after Neon reports the restore operation complete.

Never delete a conflicting relation, constraint, index, branch, or snapshot as
an automated workaround. The `launch-video/` directory and all assets beneath
it are intentionally excluded from this rebrand work and must remain untouched.
