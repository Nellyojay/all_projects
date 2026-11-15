DO $$
DECLARE
  app_tables text[] := ARRAY[
    'accounts', 'loans', 'transfers', 'transactions', 'events', 'tasks', 'notes',
    'lists', 'list_items', 'budget_templates', 'budget_template_items', 'budget_periods',
    'budgets', 'budget_items', 'budget_period_items', 'transaction_allocations',
    'transaction_refunds', 'budget_refund_allocations', 'budget_adjustments',
    'budget_period_closures', 'budget_alerts', 'legacy_budgets',
    'legacy_transaction_allocations', 'legacy_budget_item_map',
    'budget_item_refund_allocations', 'budget_item_adjustments', 'budget_item_alerts',
    'budget_closures', 'budget_migration_runs', 'record_links', 'reminders',
    'inbox_items', 'activity_logs', 'legacy_unmapped_tables'
  ];
  table_name text;
  constraint_row record;
  has_unmapped_rows boolean;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'public.profiles must exist before migrating Mythingz ownership';
  END IF;

  IF EXISTS (
    SELECT profile.auth_id
    FROM public.profiles AS profile
    GROUP BY profile.auth_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot migrate Mythingz ownership: profiles.auth_id must be unique';
  END IF;

  FOREACH table_name IN ARRAY app_tables LOOP
    EXECUTE format(
      'SELECT EXISTS (
         SELECT 1 FROM public.%I AS owned
         LEFT JOIN public.profiles AS profile ON profile.auth_id = owned.user_id
         WHERE profile.id IS NULL
       )',
      table_name
    ) INTO has_unmapped_rows;
    IF has_unmapped_rows THEN
      RAISE EXCEPTION 'Cannot migrate %.user_id: an owner has no matching profile', table_name;
    END IF;
  END LOOP;

  CREATE TEMP TABLE mythingz_owner_foreign_keys ON COMMIT DROP AS
  SELECT
    constraint_data.conrelid,
    constraint_data.conname,
    pg_get_constraintdef(constraint_data.oid) AS definition,
    constraint_data.confrelid = 'auth.users'::regclass AS references_auth_users
  FROM pg_constraint AS constraint_data
  WHERE constraint_data.contype = 'f'
    AND constraint_data.conrelid IN (
      SELECT to_regclass(format('public.%I', table_name))::oid
      FROM unnest(app_tables) AS app_table(table_name)
    );

  FOR constraint_row IN SELECT * FROM mythingz_owner_foreign_keys LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      constraint_row.conrelid::regclass,
      constraint_row.conname
    );
  END LOOP;

  FOREACH table_name IN ARRAY app_tables LOOP
    EXECUTE format(
      'UPDATE public.%I AS owned
       SET user_id = profile.id
       FROM public.profiles AS profile
       WHERE owned.user_id = profile.auth_id
         AND owned.user_id IS DISTINCT FROM profile.id',
      table_name
    );
  END LOOP;

  FOR constraint_row IN
    SELECT * FROM mythingz_owner_foreign_keys
    WHERE NOT references_auth_users
  LOOP
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I %s',
      constraint_row.conrelid::regclass,
      constraint_row.conname,
      constraint_row.definition
    );
  END LOOP;

  FOREACH table_name IN ARRAY app_tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I
       ADD CONSTRAINT %I FOREIGN KEY (user_id)
       REFERENCES public.profiles(id) ON DELETE CASCADE',
      table_name,
      table_name || '_user_id_profiles_fkey'
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_owner_policy', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
       USING (user_id = (
         SELECT profile.id FROM public.profiles AS profile
         WHERE profile.auth_id = (SELECT auth.uid())
       ))
       WITH CHECK (user_id = (
         SELECT profile.id FROM public.profiles AS profile
         WHERE profile.auth_id = (SELECT auth.uid())
       ))',
      table_name || '_owner_policy',
      table_name
    );
  END LOOP;
END;
$$;
