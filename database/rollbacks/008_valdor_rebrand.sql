-- Rollback companion for database/migrations/008_valdor_rebrand.sql.
--
-- PAUSED: do not apply this to a live Neon branch without explicit user
-- confirmation. Stop the Valdor-named consumers first and review
-- database/valdor-rebrand-runbook.md.
--
-- This is a names-only rollback. It restores Virgue relation, constraint, and
-- index identifiers without changing row data, plan keys, Neon Auth objects,
-- or privileges. It is safe to rerun after a partial rollback when each pair
-- has only one surviving name.

-- Fail before changing anything if the expected forward schema is absent, if a
-- partial run left both names, or if a name is used by the wrong relation kind.
DO $$
DECLARE
  relation_map record;
  old_kind text;
  new_kind text;
  missing_names text;
BEGIN
  FOR relation_map IN
    SELECT old_name, new_name, expected_kind
    FROM (VALUES
      ('virgue_plans'::text, 'valdor_plans'::text, 'r'::text),
      ('virgue_billing_settings'::text, 'valdor_billing_settings'::text, 'r'::text),
      ('virgue_trial_grants'::text, 'valdor_trial_grants'::text, 'r'::text),
      ('virgue_subscriptions'::text, 'valdor_subscriptions'::text, 'r'::text),
      ('virgue_billing_events'::text, 'valdor_billing_events'::text, 'r'::text),
      ('virgue_billing_customers'::text, 'valdor_billing_customers'::text, 'r'::text),
      ('virgue_admins'::text, 'valdor_admins'::text, 'r'::text),
      ('virgue_current_entitlements'::text, 'valdor_current_entitlements'::text, 'v'::text)
    ) AS mapped(old_name, new_name, expected_kind)
  LOOP
    old_kind := NULL;
    new_kind := NULL;

    SELECT c.relkind::text
    INTO old_kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = relation_map.old_name;

    SELECT c.relkind::text
    INTO new_kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = relation_map.new_name;

    IF old_kind IS NOT NULL AND old_kind <> relation_map.expected_kind THEN
      RAISE EXCEPTION
        'Valdor rollback stopped: public.% has relkind %, expected %; review manually',
        relation_map.old_name, old_kind, relation_map.expected_kind;
    END IF;

    IF new_kind IS NOT NULL AND new_kind <> relation_map.expected_kind THEN
      RAISE EXCEPTION
        'Valdor rollback stopped: public.% has relkind %, expected %; review manually',
        relation_map.new_name, new_kind, relation_map.expected_kind;
    END IF;

    IF old_kind IS NOT NULL AND new_kind IS NOT NULL THEN
      RAISE EXCEPTION
        'Valdor rollback stopped: both public.% and public.% exist; resolve the collision manually',
        relation_map.old_name, relation_map.new_name;
    ELSIF old_kind IS NULL AND new_kind IS NULL THEN
      missing_names := concat_ws(
        ', ',
        missing_names,
        format('public.%I or public.%I', relation_map.old_name, relation_map.new_name)
      );
    END IF;
  END LOOP;

  IF missing_names IS NOT NULL THEN
    RAISE EXCEPTION
      'Valdor rollback requires the 008 schema; missing %',
      missing_names;
  END IF;
END $$;

-- Rename the relations back first. Constraint and index scans below accept
-- either table prefix so the rollback can recover from a partially completed
-- relation rename as well.
DO $$
DECLARE
  relation_map record;
  new_kind text;
BEGIN
  FOR relation_map IN
    SELECT old_name, new_name, expected_kind
    FROM (VALUES
      ('virgue_plans'::text, 'valdor_plans'::text, 'r'::text),
      ('virgue_billing_settings'::text, 'valdor_billing_settings'::text, 'r'::text),
      ('virgue_trial_grants'::text, 'valdor_trial_grants'::text, 'r'::text),
      ('virgue_subscriptions'::text, 'valdor_subscriptions'::text, 'r'::text),
      ('virgue_billing_events'::text, 'valdor_billing_events'::text, 'r'::text),
      ('virgue_billing_customers'::text, 'valdor_billing_customers'::text, 'r'::text),
      ('virgue_admins'::text, 'valdor_admins'::text, 'r'::text),
      ('virgue_current_entitlements'::text, 'valdor_current_entitlements'::text, 'v'::text)
    ) AS mapped(old_name, new_name, expected_kind)
  LOOP
    SELECT c.relkind::text
    INTO new_kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = relation_map.new_name;

    IF new_kind IS NULL THEN
      CONTINUE;
    END IF;

    IF relation_map.expected_kind = 'v' THEN
      EXECUTE format(
        'ALTER VIEW public.%I RENAME TO %I',
        relation_map.new_name,
        relation_map.old_name
      );
    ELSE
      EXECUTE format(
        'ALTER TABLE public.%I RENAME TO %I',
        relation_map.new_name,
        relation_map.old_name
      );
    END IF;
  END LOOP;
END $$;

-- Restore constraint identifiers, including generated PK/FK/UNIQUE/CHECK
-- names. The table prefix check covers both a partial and a complete rename.
DO $$
DECLARE
  constraint_row record;
  target_name text;
BEGIN
  FOR constraint_row IN
    SELECT
      c.conrelid AS table_oid,
      n.nspname AS schema_name,
      table_rel.relname AS table_name,
      c.conname AS constraint_name
    FROM pg_constraint c
    JOIN pg_class table_rel ON table_rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = table_rel.relnamespace
    WHERE n.nspname = 'public'
      AND c.conname LIKE 'valdor\_%' ESCAPE '\'
      AND (
        table_rel.relname LIKE 'virgue\_%' ESCAPE '\'
        OR table_rel.relname LIKE 'valdor\_%' ESCAPE '\'
      )
    ORDER BY table_rel.relname, c.conname
  LOOP
    target_name := regexp_replace(constraint_row.constraint_name, '^valdor_', 'virgue_');

    IF EXISTS (
      SELECT 1
      FROM pg_constraint existing
      WHERE existing.conrelid = constraint_row.table_oid
        AND existing.conname = target_name
    ) THEN
      RAISE EXCEPTION
        'Valdor rollback stopped: constraint % already exists on %.%; review manually',
        target_name, constraint_row.schema_name, constraint_row.table_name;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I',
      constraint_row.schema_name,
      constraint_row.table_name,
      constraint_row.constraint_name,
      target_name
    );
  END LOOP;
END $$;

-- Restore explicit and generated index identifiers.
DO $$
DECLARE
  index_row record;
  target_name text;
BEGIN
  FOR index_row IN
    SELECT
      index_rel.relname AS index_name,
      index_schema.nspname AS schema_name,
      table_rel.relname AS table_name
    FROM pg_class index_rel
    JOIN pg_namespace index_schema ON index_schema.oid = index_rel.relnamespace
    JOIN pg_index index_meta ON index_meta.indexrelid = index_rel.oid
    JOIN pg_class table_rel ON table_rel.oid = index_meta.indrelid
    JOIN pg_namespace table_schema ON table_schema.oid = table_rel.relnamespace
    WHERE index_schema.nspname = 'public'
      AND table_schema.nspname = 'public'
      AND index_rel.relname LIKE 'valdor\_%' ESCAPE '\'
      AND (
        table_rel.relname LIKE 'virgue\_%' ESCAPE '\'
        OR table_rel.relname LIKE 'valdor\_%' ESCAPE '\'
      )
    ORDER BY index_rel.relname
  LOOP
    target_name := regexp_replace(index_row.index_name, '^valdor_', 'virgue_');

    IF EXISTS (
      SELECT 1
      FROM pg_class existing
      JOIN pg_namespace existing_schema ON existing_schema.oid = existing.relnamespace
      WHERE existing_schema.nspname = index_row.schema_name
        AND existing.relname = target_name
    ) THEN
      RAISE EXCEPTION
        'Valdor rollback stopped: index % already exists in schema %; review manually',
        target_name, index_row.schema_name;
    END IF;

    EXECUTE format(
      'ALTER INDEX %I.%I RENAME TO %I',
      index_row.schema_name,
      index_row.index_name,
      target_name
    );
  END LOOP;
END $$;

-- Confirm that no mapped Valdor-prefixed public object or constraint remains.
DO $$
DECLARE
  remaining_name text;
BEGIN
  SELECT format('relation/index public.%I', c.relname)
  INTO remaining_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname LIKE 'valdor\_%' ESCAPE '\'
  ORDER BY c.relname
  LIMIT 1;

  IF remaining_name IS NOT NULL THEN
    RAISE EXCEPTION 'Valdor rollback stopped: % remains; review manually', remaining_name;
  END IF;

  SELECT format('constraint %I on public.%I', c.conname, table_rel.relname)
  INTO remaining_name
  FROM pg_constraint c
  JOIN pg_class table_rel ON table_rel.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = table_rel.relnamespace
  WHERE n.nspname = 'public'
    AND c.conname LIKE 'valdor\_%' ESCAPE '\'
  ORDER BY table_rel.relname, c.conname
  LIMIT 1;

  IF remaining_name IS NOT NULL THEN
    RAISE EXCEPTION 'Valdor rollback stopped: % remains; review manually', remaining_name;
  END IF;
END $$;
